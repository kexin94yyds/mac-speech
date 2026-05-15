import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { transcribeAudioBlob } from '../engines/localWhisperTranscriber'
import { IOS_STYLE_DRAFT_EXPERIMENT, IS_LAB_VARIANT } from '../config/appVariant'
import {
  DEFAULT_SPEECH_MODE_ID,
  resolveSpeechMode,
  type SpeechModeId,
} from '../config/speechModes'
import { enhanceTranscript, type DictionaryEntryLike } from '../services/ollamaEnhancer'
import { useIosStyleSpeechDraft } from './useIosStyleSpeechDraft'

type SessionPhase = 'idle' | 'starting' | 'listening' | 'stopping' | 'ready' | 'unsupported' | 'error'

const overlayShortcut = 'Fn / Ctrl+1 / Ctrl+2'

/** 最近一次 native-final 写入历史的 id；写回成功后清空。 */
let lastHistoryEntryId: number | null = null
let lastHistoryText = ''

export function useSpeechOverlay() {
  const iosStyleDraft = useIosStyleSpeechDraft(IOS_STYLE_DRAFT_EXPERIMENT)
  const sessionPhase = ref<SessionPhase>('idle')
  const permissionGranted = ref(false)
  const transcript = ref('')
  const partialTranscript = ref('')
  const lastCommittedText = ref('')
  const manualDraft = ref('')
  const activeModeId = ref<SpeechModeId>(DEFAULT_SPEECH_MODE_ID)
  const statusMessage = ref('等待 Fn / Ctrl+1 / Ctrl+2 唤起录音。')
  const diagnostics = ref<string[]>([
    IOS_STYLE_DRAFT_EXPERIMENT
      ? '当前策略：lab 实验版启用 iOS 风格草稿分段骨架；识别仍是原生 Speech.framework，外部实时回改尚未接通。'
      : '当前策略：Fn/Ctrl+1 使用中文润色，Ctrl+2 使用结构化整理；识别后交给本地 Ollama 增强。'
  ])
  const micLevel = ref(0)

  let visibilityRefreshHandler: (() => void) | null = null
  let unlistenToggle: (() => void) | null = null
  let unlistenNativeStarted: (() => void) | null = null
  let unlistenNativePartial: (() => void) | null = null
  let unlistenNativeFinal: (() => void) | null = null
  let unlistenNativeError: (() => void) | null = null
  let shouldCommitOnEnd = false
  let meterStream: MediaStream | null = null
  let meterAudioContext: AudioContext | null = null
  let meterAnalyser: AnalyserNode | null = null
  let meterDataArray: Uint8Array | null = null
  let meterFrame: number | null = null
  let mediaRecorder: MediaRecorder | null = null
  let recordedChunks: BlobPart[] = []
  let stopFallbackTimer: number | null = null
  let startFallbackTimer: number | null = null
  // 仅在用户明确取消（而非 stop fallback 超时）时，忽略迟到的 native-final。
  let ignoreLateNativeFinal = false

  async function debugLog(message: string) {
    try {
      await invoke('debug_log', { message })
    } catch {
      // Ignore logging failures in production flow.
    }
  }

  async function appendHistoryBestEffort(text: string, writtenBack: boolean) {
    const trimmed = text.trim()
    if (!trimmed) return null
    try {
      const bundleId = await invoke<string | null>('get_captured_target_app_bundle_id').catch(() => null)
      await debugLog(`history append fallback len=${trimmed.length} target=${bundleId || 'unknown'} written_back=${writtenBack}`)
      const id = await invoke<number>('append_history', {
        text: trimmed,
        targetApp: bundleId || '未知应用',
        writtenBack,
      })
      lastHistoryEntryId = id
      lastHistoryText = trimmed
      await emit('history-updated', {})
      await debugLog(`history append fallback done id=${String(id)}`)
      return id
    } catch {
      await debugLog('history append fallback failed')
      return null
    }
  }

  async function loadDictionaryEntriesBestEffort() {
    try {
      return await invoke<DictionaryEntryLike[]>('load_dictionary')
    } catch {
      await debugLog('dictionary load skipped before enhancement')
      return []
    }
  }

  async function enhanceWithActiveMode(rawText: string) {
    const mode = activeMode.value
    const trimmed = rawText.trim()
    if (!trimmed) {
      return { text: '', enhanced: false }
    }

    statusMessage.value = `正在用 ${mode.ollamaModel} 处理「${mode.name}」。`
    pushDiagnostic(`开始 ${mode.name}：${trimmed.slice(0, 40)}`)
    await debugLog(`enhance start mode=${mode.id} len=${trimmed.length}`)

    try {
      const dictionaryEntries = await loadDictionaryEntriesBestEffort()
      const enhancedText = await enhanceTranscript({
        text: trimmed,
        mode,
        dictionaryEntries,
      })
      await debugLog(`enhance ok mode=${mode.id} len=${enhancedText.length}`)
      return { text: enhancedText.trim() || trimmed, enhanced: true }
    } catch (error) {
      const message = `Ollama 增强失败，已回退原始转写：${String(error)}`
      statusMessage.value = message
      pushDiagnostic(message)
      await debugLog(`enhance failed mode=${mode.id} error=${String(error)}`)
      return { text: trimmed, enhanced: false }
    }
  }

  async function finalizeRecognizedText(rawText: string, commitOnEnd: boolean) {
    const trimmedRaw = rawText.trim()
    if (!trimmedRaw) {
      shouldCommitOnEnd = false
      sessionPhase.value = 'idle'
      statusMessage.value = '没有拿到有效语音结果。'
      await hideOverlay()
      return
    }

    const mode = activeMode.value
    const result = await enhanceWithActiveMode(trimmedRaw)
    const finalText = result.text.trim()

    transcript.value = finalText
    partialTranscript.value = ''
    iosStyleDraft.reset()

    const appendedId = await appendHistoryBestEffort(finalText, false)
    shouldCommitOnEnd = false
    sessionPhase.value = 'ready'

    if (commitOnEnd) {
      statusMessage.value = result.enhanced
        ? `「${mode.name}」完成，正在写回当前输入区。`
        : '已回退使用原始转写，正在写回当前输入区。'
      await commitTextToTarget(finalText, appendedId)
      return
    }

    statusMessage.value = result.enhanced
      ? `「${mode.name}」完成，文本已保留在浮层里。`
      : 'Ollama 增强失败，原始转写已保留在浮层里。'
  }

  const phaseLabel = computed(() => {
    switch (sessionPhase.value) {
      case 'starting':
        return '正在启动'
      case 'listening':
        return '正在监听'
      case 'stopping':
        return '正在收束'
      case 'ready':
        return '待写回'
      case 'unsupported':
        return '当前环境不支持实时语音识别'
      case 'error':
        return '语音链路异常'
      default:
        return '待命'
    }
  })

  const activeMode = computed(() => resolveSpeechMode(activeModeId.value))

  const displayTranscript = computed(() => {
    const experimentalDraft = iosStyleDraft.draftTranscript.value
    if (IOS_STYLE_DRAFT_EXPERIMENT && experimentalDraft) {
      return experimentalDraft
    }
    if (partialTranscript.value) {
      return partialTranscript.value
    }
    if (transcript.value) {
      return transcript.value
    }
    if (lastCommittedText.value) {
      return lastCommittedText.value
    }
    // 避免「正在监听」却仍显示「按 Fn 开始」，让人误以为只有菜单栏出现麦克风图标时才算在听。
    if (sessionPhase.value === 'starting') {
      return '正在连接麦克风与语音识别…'
    }
    if (sessionPhase.value === 'listening') {
      return '正在聆听… 尚未识别到文字（菜单栏麦克风图标可能延迟，以本浮层为准）。'
    }
    if (sessionPhase.value === 'stopping') {
      return '正在收束识别…'
    }
    return '按 Fn / Ctrl+1 开始中文润色，或按 Ctrl+2 开始结构化整理。'
  })

  const canStartListening = computed(
    () =>
      sessionPhase.value !== 'starting' &&
      sessionPhase.value !== 'listening' &&
      sessionPhase.value !== 'stopping'
  )

  const canCommit = computed(() =>
    Boolean((iosStyleDraft.resolveTranscript(partialTranscript.value, transcript.value) || manualDraft.value).trim())
  )

  function pushDiagnostic(message: string) {
    diagnostics.value = [message, ...diagnostics.value].slice(0, 6)
  }

  function resolveRecordingMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    for (const candidate of candidates) {
      if (window.MediaRecorder?.isTypeSupported?.(candidate)) {
        return candidate
      }
    }
    return ''
  }

  function stopMeter() {
    if (meterFrame !== null) {
      cancelAnimationFrame(meterFrame)
      meterFrame = null
    }
    meterStream?.getTracks().forEach((track) => track.stop())
    meterStream = null
    meterAnalyser = null
    meterDataArray = null
    micLevel.value = 0
    mediaRecorder = null
    recordedChunks = []
    void meterAudioContext?.close()
    meterAudioContext = null
  }

  function clearStopFallbackTimer() {
    if (stopFallbackTimer !== null) {
      window.clearTimeout(stopFallbackTimer)
      stopFallbackTimer = null
    }
  }

  function clearStartFallbackTimer() {
    if (startFallbackTimer !== null) {
      window.clearTimeout(startFallbackTimer)
      startFallbackTimer = null
    }
  }

  function sampleMeter() {
    if (!meterAnalyser || !meterDataArray) {
      return
    }

    meterAnalyser.getByteTimeDomainData(meterDataArray)
    let sumSquares = 0
    for (const value of meterDataArray) {
      const normalized = (value - 128) / 128
      sumSquares += normalized * normalized
    }

    const rms = Math.sqrt(sumSquares / meterDataArray.length)
    micLevel.value = Math.min(1, micLevel.value * 0.42 + rms * 3.6)
    meterFrame = requestAnimationFrame(sampleMeter)
  }

  async function finalizeLocalWhisper() {
    const mimeType = mediaRecorder?.mimeType || resolveRecordingMimeType() || 'audio/webm'
    const audioBlob = new Blob(recordedChunks, { type: mimeType })
    recordedChunks = []

    if (!audioBlob.size) {
      sessionPhase.value = 'error'
      statusMessage.value = '录音内容为空，无法执行本地转写。'
      pushDiagnostic(statusMessage.value)
      stopMeter()
      return
    }

    statusMessage.value = '正在使用本地 Whisper tiny 转写，请稍等。'

    try {
      const text = await transcribeAudioBlob(audioBlob, (progress) => {
        diagnostics.value = [`Whisper 加载中：${String(progress)}`, ...diagnostics.value].slice(0, 6)
      })

      transcript.value = text
      partialTranscript.value = ''

      if (shouldCommitOnEnd && text.trim()) {
        shouldCommitOnEnd = false
        await commitTextToTarget(text)
        return
      }

      shouldCommitOnEnd = false
      sessionPhase.value = text.trim() ? 'ready' : 'idle'
      statusMessage.value = text.trim()
        ? '本地 Whisper 转写完成，文本已保留在浮层里。'
        : '本地 Whisper 未识别出有效文本。'
    } catch (error) {
      sessionPhase.value = 'error'
      statusMessage.value = `本地 Whisper 转写失败：${String(error)}`
      pushDiagnostic(statusMessage.value)
    } finally {
      stopMeter()
    }
  }

  function startLocalRecorder(stream: MediaStream) {
    if (!window.MediaRecorder) {
      throw new Error('当前环境不支持 MediaRecorder')
    }

    recordedChunks = []
    const mimeType = resolveRecordingMimeType()
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      void finalizeLocalWhisper()
    }

    mediaRecorder.start()
  }

  async function ensureMeter(shouldRecordAudio = false) {
    if (!navigator.mediaDevices?.getUserMedia) {
      pushDiagnostic('当前环境不支持 getUserMedia，跳过电平反馈。')
      return
    }

    stopMeter()
    meterStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    meterAudioContext = new AudioContext()
    const source = meterAudioContext.createMediaStreamSource(meterStream)
    meterAnalyser = meterAudioContext.createAnalyser()
    meterAnalyser.fftSize = 256
    meterDataArray = new Uint8Array(meterAnalyser.frequencyBinCount)
    source.connect(meterAnalyser)

    if (shouldRecordAudio) {
      startLocalRecorder(meterStream)
    }

    sampleMeter()
  }

  function clearSession() {
    transcript.value = ''
    partialTranscript.value = ''
    sessionPhase.value = 'idle'
    micLevel.value = 0
    lastHistoryEntryId = null
    lastHistoryText = ''
    iosStyleDraft.reset()
  }

  async function refreshAccessibilityStatus() {
    try {
      permissionGranted.value = await invoke<boolean>('accessibility_status')
    } catch (error) {
      permissionGranted.value = false
      pushDiagnostic(`辅助功能状态读取失败：${String(error)}`)
    }
  }

  async function ensurePermissionOnboarding() {
    const [microphoneGranted, speechRecognitionGranted, accessibilityGranted, inputMonitoringGranted] =
      await Promise.all([
        invoke<boolean>('microphone_status'),
        invoke<boolean>('speech_recognition_status'),
        invoke<boolean>('accessibility_status'),
        invoke<boolean>('input_monitoring_status')
      ])

    permissionGranted.value = accessibilityGranted

    if (microphoneGranted && speechRecognitionGranted && accessibilityGranted && inputMonitoringGranted) {
      return true
    }

    const missingPermissions = [
      !microphoneGranted ? '麦克风' : '',
      !speechRecognitionGranted ? '语音识别' : '',
      !accessibilityGranted ? '辅助功能' : '',
      !inputMonitoringGranted ? '输入监控' : ''
    ].filter(Boolean)

    sessionPhase.value = 'idle'
    statusMessage.value = `请先在主 App 完成权限授权：${missingPermissions.join('、')}`
    pushDiagnostic(`permission gate blocked: ${missingPermissions.join(', ')}`)
    await debugLog(`permission gate blocked missing=${missingPermissions.join(',')}`)
    await hideOverlay()
    await invoke('show_main_window_no_focus')
    return false
  }

  async function openAccessibilitySettings() {
    try {
      await invoke('request_accessibility_permission')
      statusMessage.value = '已打开 macOS 辅助功能设置，请允许 iterate-speech 控制电脑。'
      pushDiagnostic('已跳转到 Accessibility 设置页。')
    } catch (error) {
      statusMessage.value = `打开设置失败：${String(error)}`
      pushDiagnostic(statusMessage.value)
    }
  }

  async function showOverlay() {
    const currentWindow = getCurrentWindow()
    await currentWindow.show()
  }

  async function hideOverlay() {
    const currentWindow = getCurrentWindow()
    await currentWindow.hide()
  }

  async function startListening(
    source: 'shortcut' | 'button',
    opts?: { skipTargetCapture?: boolean; modeId?: string | null },
  ) {
    const nextMode = resolveSpeechMode(opts?.modeId || activeModeId.value)
    activeModeId.value = nextMode.id
    await debugLog(
      `startListening source=${source} mode=${nextMode.id} phase=${sessionPhase.value} skipTargetCapture=${Boolean(opts?.skipTargetCapture)}`,
    )
    transcript.value = ''
    partialTranscript.value = ''
    iosStyleDraft.reset()
    shouldCommitOnEnd = false
    lastHistoryEntryId = null
    lastHistoryText = ''
    ignoreLateNativeFinal = false
    clearStartFallbackTimer()

    try {
      const canStart = await ensurePermissionOnboarding()
      if (!canStart) {
        return
      }

      if (!opts?.skipTargetCapture) {
        await invoke('remember_frontmost_app')
      }
      await invoke('reveal_overlay_window')
      sessionPhase.value = 'starting'
      statusMessage.value =
        source === 'shortcut'
          ? `${nextMode.shortcut} 已触发「${nextMode.name}」，正在连接原生语音识别。`
          : `正在连接原生语音识别，当前模式为「${nextMode.name}」。`
      startFallbackTimer = window.setTimeout(async () => {
        if (sessionPhase.value !== 'starting' || partialTranscript.value || transcript.value) {
          return
        }

        clearStartFallbackTimer()
        sessionPhase.value = 'error'
        statusMessage.value = '原生语音识别启动超时，暂时没有拿到可用结果。'
        pushDiagnostic('native started/partial 事件超时，已终止本次识别。')
        await invoke('stop_native_speech')
      }, 2500)
      await invoke('start_native_speech')
    } catch (error) {
      clearStartFallbackTimer()
      sessionPhase.value = 'error'
      statusMessage.value = `启动语音识别失败：${String(error)}`
      pushDiagnostic(statusMessage.value)
      stopMeter()
    }
  }

  function stopListening(commitOnEnd: boolean) {
    clearStopFallbackTimer()
    clearStartFallbackTimer()
    const immediateCommitText = iosStyleDraft.resolveTranscript(partialTranscript.value, transcript.value).trim()

    if (commitOnEnd && immediateCommitText) {
      shouldCommitOnEnd = false
      sessionPhase.value = 'ready'
      statusMessage.value = '已用当前识别结果直接收口，不再等待 final。'
      void invoke('stop_native_speech')
      void commitTextToTarget(immediateCommitText)
      return
    }

    // 不在此处做「无 partial = 静音」的快速收口：部分环境下识别结果只出现在 native-final、全程无 partial，
    // 会误判为静音并提前 hide，导致永远不写回（回归 3371a92）。

    shouldCommitOnEnd = commitOnEnd
    ignoreLateNativeFinal = false
    sessionPhase.value = 'stopping'
    statusMessage.value = commitOnEnd
      ? '停止录音后会自动尝试写回当前聚焦输入区。'
      : '停止录音。'
    void invoke('stop_native_speech')
    // 有写回预期时多等一会；无 partial/仅 final 的环境仍要靠 native-final 落字，不能把 phase 提前置 idle。
    const firstPassMs = commitOnEnd ? 1800 : 450
    const waitEmptyFinalMs = commitOnEnd ? 2600 : 1200

    stopFallbackTimer = window.setTimeout(async () => {
      if (sessionPhase.value !== 'stopping') {
        return
      }

      clearStopFallbackTimer()
      const commitText = iosStyleDraft.resolveTranscript(partialTranscript.value, transcript.value).trim()
      if (commitOnEnd && commitText) {
        shouldCommitOnEnd = false
        await commitTextToTarget(commitText)
        return
      }

      if (!commitText) {
        statusMessage.value = '停止录音，正在等待最终识别结果返回。'
        pushDiagnostic('waiting for native-final after stop')
        stopFallbackTimer = window.setTimeout(async () => {
          if (sessionPhase.value !== 'stopping') {
            return
          }

          clearStopFallbackTimer()
          shouldCommitOnEnd = false
          sessionPhase.value = 'idle'
          statusMessage.value = '停止后没有拿到有效语音结果。'
          await hideOverlay()
        }, waitEmptyFinalMs)
        return
      }

      shouldCommitOnEnd = false
      if (!lastHistoryEntryId) {
        await appendHistoryBestEffort(commitText, false)
      }
      sessionPhase.value = 'ready'
      statusMessage.value = '停止信号已发出，已用当前识别结果完成回写流程。'
    }, firstPassMs)
  }

  async function commitTextToTarget(text: string, historyEntryId?: number | null) {
    const trimmed = text.trim()
    if (!trimmed) {
      statusMessage.value = '没有可写回的文本。'
      return
    }

    const resolvedHistoryId = historyEntryId !== undefined ? historyEntryId : lastHistoryEntryId

    await refreshAccessibilityStatus()

    if (!permissionGranted.value) {
      sessionPhase.value = 'ready'
      statusMessage.value = '缺少辅助功能权限，当前只能保留文本，不能自动写回。'
      pushDiagnostic('写回被拦截：macOS Accessibility 尚未放行。')
      return
    }

    try {
      await hideOverlay()
      await new Promise((resolve) => window.setTimeout(resolve, 90))
      await invoke('paste_text', { text: trimmed })
      lastCommittedText.value = trimmed
      manualDraft.value = ''
      transcript.value = ''
      partialTranscript.value = ''
      iosStyleDraft.reset()
      sessionPhase.value = 'ready'
      statusMessage.value = '已尝试把文本写回当前聚焦输入区。'
      pushDiagnostic(`已写回：${trimmed.slice(0, 40)}`)
      try {
        if (resolvedHistoryId != null) {
          await debugLog(`history mark_written_back id=${resolvedHistoryId}`)
          await invoke('mark_history_written_back', { id: resolvedHistoryId })
          lastHistoryEntryId = null
          lastHistoryText = ''
          await debugLog(`history marked_written_back id=${resolvedHistoryId}`)
        } else {
          await appendHistoryBestEffort(trimmed, true)
        }
      } catch {
        /* history is best-effort */
      }
    } catch (error) {
      const message = String(error)
      if (message.includes('写回超时')) {
        lastCommittedText.value = trimmed
        sessionPhase.value = 'ready'
        statusMessage.value = '写回超时，文本已保留在浮层里。'
        pushDiagnostic(statusMessage.value)
        return
      }

      sessionPhase.value = 'error'
      statusMessage.value = `写回失败：${message}`
      pushDiagnostic(statusMessage.value)
    }
  }

  async function handleGlobalToggle(skipTargetCapture = false) {
    if (sessionPhase.value === 'listening') {
      const hasText = iosStyleDraft.resolveTranscript(partialTranscript.value, transcript.value).trim()
      // hasText=false 时仍须等 native-final（仅 final、无 partial 时这里也为空，不能用「秒取消」抢在 final 前把 phase 置 idle，否则不写历史）
      stopListening(Boolean(hasText))
      return
    }

    if (sessionPhase.value === 'stopping') {
      clearStopFallbackTimer()
      clearStartFallbackTimer()
      shouldCommitOnEnd = false
      ignoreLateNativeFinal = true
      sessionPhase.value = 'idle'
      statusMessage.value = '已结束本次语音会话。'
      await invoke('stop_native_speech')
      await hideOverlay()
      return
    }

    if (sessionPhase.value === 'starting') {
      clearStartFallbackTimer()
      shouldCommitOnEnd = false
      ignoreLateNativeFinal = true
      sessionPhase.value = 'idle'
      statusMessage.value = '已取消正在启动的语音识别。'
      await invoke('stop_native_speech')
      await hideOverlay()
      return
    }

    await startListening('shortcut', { skipTargetCapture })
  }

  async function commitFromPanel() {
    const preferredText = transcript.value || partialTranscript.value || manualDraft.value
    const resolvedTranscript = iosStyleDraft.resolveTranscript(partialTranscript.value, transcript.value)
    await commitTextToTarget(resolvedTranscript || preferredText)
  }

  async function initialize() {
    await debugLog(`initialize window=${getCurrentWindow().label}`)
    await refreshAccessibilityStatus()
    try {
      const inputMonitoringGranted = await invoke<boolean>('input_monitoring_status')
      if (!inputMonitoringGranted) {
        statusMessage.value = '正在请求 macOS 输入监控权限，请在系统弹框中点允许。'
        await invoke('request_input_monitoring_permission')
      }
    } catch (error) {
      pushDiagnostic(`输入监控权限请求失败：${String(error)}`)
    }
    statusMessage.value = IOS_STYLE_DRAFT_EXPERIMENT
      ? '等待 Fn 唤起原生实时语音输入。当前为 lab 实验版：优先验证 iOS 风格草稿分段。'
      : '等待 Fn 唤起原生实时语音输入。'

    visibilityRefreshHandler = () => {
      if (document.visibilityState === 'visible')
        void refreshAccessibilityStatus()
    }
    document.addEventListener('visibilitychange', visibilityRefreshHandler)

    await debugLog(`listeners attaching window=${getCurrentWindow().label}`)
    unlistenToggle = await listen<{ shortcut: string; skip_target_capture?: boolean }>(
      'speech://toggle',
      async (event) => {
        const skip = Boolean(event.payload.skip_target_capture)
        await debugLog(
          `toggle event received window=${getCurrentWindow().label} phase=${sessionPhase.value} skip_target_capture=${skip}`,
        )
        await handleGlobalToggle(skip)
      },
    )
    unlistenNativeStarted = await listen<{ text: string }>('speech://native-started', async (event) => {
      if (sessionPhase.value !== 'starting') {
        if (sessionPhase.value === 'idle') {
          void invoke('stop_native_speech')
        }
        return
      }
      clearStartFallbackTimer()
      clearStopFallbackTimer()
      sessionPhase.value = 'listening'
      const recognitionMode = event.payload.text === 'on-device' ? '本地实时识别' : '系统识别'
      statusMessage.value = `正在录音（${recognitionMode}），实时结果会逐步显示；再次按 Fn 会停止并尝试写回。`
      pushDiagnostic(`native speech started: ${recognitionMode}`)
    })
    unlistenNativePartial = await listen<{ text: string }>('speech://native-partial', async (event) => {
      clearStartFallbackTimer()
      partialTranscript.value = event.payload.text || ''
      if (IOS_STYLE_DRAFT_EXPERIMENT) {
        iosStyleDraft.ingestPartial(partialTranscript.value)
      }
    })
    unlistenNativeFinal = await listen<{ text: string }>('speech://native-final', async (event) => {
      clearStartFallbackTimer()
      clearStopFallbackTimer()
      const rawText = (event.payload.text || '').trim()
      const text = IOS_STYLE_DRAFT_EXPERIMENT
        ? iosStyleDraft.ingestFinal(rawText).trim()
        : rawText

      // 仅在显式取消时忽略迟到 final；否则（例如 fallback 先 idle、final 晚到）仍要接收。
      if (ignoreLateNativeFinal && sessionPhase.value === 'idle') {
        ignoreLateNativeFinal = false
        return
      }
      ignoreLateNativeFinal = false

      transcript.value = text
      partialTranscript.value = ''

      let appendedId: number | null = null
      if (text) {
        if (!shouldCommitOnEnd && lastHistoryEntryId && lastHistoryText === text) {
          appendedId = lastHistoryEntryId
        } else {
          lastHistoryEntryId = null
          lastHistoryText = ''
          appendedId = await appendHistoryBestEffort(text, false)
        }
      }

      if (shouldCommitOnEnd && text) {
        shouldCommitOnEnd = false
        sessionPhase.value = 'ready'
        statusMessage.value = '已拿到最终识别结果，正在尝试写回当前聚焦输入区。'
        void commitTextToTarget(text, appendedId)
        return
      }

      shouldCommitOnEnd = false
      sessionPhase.value = text ? 'ready' : 'idle'
      statusMessage.value = text
        ? '录音结束，文本已保留在浮层里，等待你手动写回。'
        : '没有拿到有效语音结果。'
      if (!text) {
        void hideOverlay()
      }
    })
    unlistenNativeError = await listen<{ text: string }>('speech://native-error', async (event) => {
      clearStartFallbackTimer()
      clearStopFallbackTimer()
      sessionPhase.value = 'error'
      statusMessage.value = `语音识别失败：${event.payload.text || '未知错误'}`
      pushDiagnostic(statusMessage.value)
      shouldCommitOnEnd = false
      stopMeter()
      try {
        await invoke('stop_native_speech')
      } catch {
        // Best-effort: align native bridge with error state so the next Fn can cold-start cleanly.
      }
    })
  }

  function dispose() {
    if (visibilityRefreshHandler) {
      document.removeEventListener('visibilitychange', visibilityRefreshHandler)
      visibilityRefreshHandler = null
    }
    unlistenToggle?.()
    unlistenNativeStarted?.()
    unlistenNativePartial?.()
    unlistenNativeFinal?.()
    unlistenNativeError?.()
    clearStartFallbackTimer()
    clearStopFallbackTimer()
    stopMeter()
  }

  return {
    overlayShortcut,
    isLabVariant: IS_LAB_VARIANT,
    iosStyleDraftExperiment: IOS_STYLE_DRAFT_EXPERIMENT,
    iosStyleDraftTranscript: iosStyleDraft.draftTranscript,
    iosStyleCommittedSegmentCount: iosStyleDraft.committedSegmentCount,
    sessionPhase,
    permissionGranted,
    transcript,
    partialTranscript,
    lastCommittedText,
    manualDraft,
    statusMessage,
    diagnostics,
    micLevel,
    phaseLabel,
    displayTranscript,
    canStartListening,
    canCommit,
    clearSession,
    refreshAccessibilityStatus,
    openAccessibilitySettings,
    startListening,
    stopListening,
    hideOverlay,
    commitFromPanel,
    initialize,
    dispose
  }
}

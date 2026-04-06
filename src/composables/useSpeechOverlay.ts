import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { transcribeAudioBlob } from '../engines/localWhisperTranscriber'

type SessionPhase = 'idle' | 'starting' | 'listening' | 'stopping' | 'ready' | 'unsupported' | 'error'

const overlayShortcut = 'Fn'

export function useSpeechOverlay() {
  const sessionPhase = ref<SessionPhase>('idle')
  const permissionGranted = ref(false)
  const transcript = ref('')
  const partialTranscript = ref('')
  const lastCommittedText = ref('')
  const manualDraft = ref('')
  const statusMessage = ref('等待 Fn 唤起录音。')
  const diagnostics = ref<string[]>([
    '当前策略：按 Fn 开始语音输入；优先实时识别，异常时再回退到本地 Whisper。'
  ])
  const micLevel = ref(0)

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

  async function debugLog(message: string) {
    try {
      await invoke('debug_log', { message })
    } catch {
      // Ignore logging failures in production flow.
    }
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

  const displayTranscript = computed(() => {
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
    return '按 Fn 开始，或先手动输入一段文本测试写回。'
  })

  const canStartListening = computed(
    () =>
      sessionPhase.value !== 'starting' &&
      sessionPhase.value !== 'listening' &&
      sessionPhase.value !== 'stopping'
  )

  const canCommit = computed(() =>
    Boolean((transcript.value || manualDraft.value || partialTranscript.value).trim())
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
    await invoke('show_main_window')
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
    opts?: { skipTargetCapture?: boolean },
  ) {
    await debugLog(
      `startListening source=${source} phase=${sessionPhase.value} skipTargetCapture=${Boolean(opts?.skipTargetCapture)}`,
    )
    transcript.value = ''
    partialTranscript.value = ''
    shouldCommitOnEnd = false
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
          ? 'Fn 已触发，正在连接原生语音识别。'
          : '正在连接原生语音识别。'
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
    const immediateCommitText = (transcript.value || partialTranscript.value).trim()

    if (commitOnEnd && immediateCommitText) {
      shouldCommitOnEnd = false
      sessionPhase.value = 'ready'
      statusMessage.value = '已用当前识别结果直接收口，不再等待 final。'
      void invoke('stop_native_speech')
      void commitTextToTarget(immediateCommitText)
      return
    }

    shouldCommitOnEnd = commitOnEnd
    sessionPhase.value = 'stopping'
    statusMessage.value = commitOnEnd
      ? '停止录音后会自动尝试写回当前聚焦输入区。'
      : '停止录音。'
    void invoke('stop_native_speech')
    stopFallbackTimer = window.setTimeout(async () => {
      if (sessionPhase.value !== 'stopping') {
        return
      }

      clearStopFallbackTimer()
      const commitText = (transcript.value || partialTranscript.value).trim()
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
        }, 2600)
        return
      }

      shouldCommitOnEnd = false
      sessionPhase.value = 'ready'
      statusMessage.value = '停止信号已发出，已用当前识别结果完成回写流程。'
    }, 1800)
  }

  async function commitTextToTarget(text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      statusMessage.value = '没有可写回的文本。'
      return
    }

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
      sessionPhase.value = 'ready'
      statusMessage.value = '已尝试把文本写回当前聚焦输入区。'
      pushDiagnostic(`已写回：${trimmed.slice(0, 40)}`)
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
      stopListening(true)
      return
    }

    if (sessionPhase.value === 'stopping') {
      clearStopFallbackTimer()
      clearStartFallbackTimer()
      shouldCommitOnEnd = false
      sessionPhase.value = 'idle'
      statusMessage.value = '已结束本次语音会话。'
      await invoke('stop_native_speech')
      await hideOverlay()
      return
    }

    if (sessionPhase.value === 'starting') {
      clearStartFallbackTimer()
      shouldCommitOnEnd = false
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
    await commitTextToTarget(preferredText)
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
    statusMessage.value = '等待 Fn 唤起原生实时语音输入。'

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
    })
    unlistenNativeFinal = await listen<{ text: string }>('speech://native-final', async (event) => {
      clearStartFallbackTimer()
      clearStopFallbackTimer()
      const text = (event.payload.text || '').trim()
      transcript.value = text
      partialTranscript.value = ''

      if (shouldCommitOnEnd && text) {
        shouldCommitOnEnd = false
        sessionPhase.value = 'ready'
        statusMessage.value = '已拿到最终识别结果，正在尝试写回当前聚焦输入区。'
        void commitTextToTarget(text)
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

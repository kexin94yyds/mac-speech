<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

const accessibilityGranted = ref(false)
const inputMonitoringGranted = ref(false)
const microphoneGranted = ref(false)
const speechRecognitionGranted = ref(false)
const statusSummary = ref('正在检查语音输入环境…')
const windowHint = ref('')

const allGranted = computed(
  () =>
    microphoneGranted.value &&
    speechRecognitionGranted.value &&
    accessibilityGranted.value &&
    inputMonitoringGranted.value,
)

const permissionItems = computed(() => [
  { label: '麦克风', granted: microphoneGranted.value, icon: '🎙' },
  { label: '语音识别', granted: speechRecognitionGranted.value, icon: '🗣' },
  { label: '辅助功能', granted: accessibilityGranted.value, icon: '♿' },
  { label: '输入监控', granted: inputMonitoringGranted.value, icon: '⌨' },
])

async function refreshStatuses() {
  try {
    const [mic, speech, acc, input] = await Promise.all([
      invoke<boolean>('microphone_status'),
      invoke<boolean>('speech_recognition_status'),
      invoke<boolean>('accessibility_status'),
      invoke<boolean>('input_monitoring_status'),
    ])
    microphoneGranted.value = mic
    speechRecognitionGranted.value = speech
    accessibilityGranted.value = acc
    inputMonitoringGranted.value = input

    if (mic && speech && acc && input) {
      statusSummary.value = '系统已就绪，按 Fn 开始语音输入。'
    }
    else {
      const missing = [
        !mic ? '麦克风' : '',
        !speech ? '语音识别' : '',
        !acc ? '辅助功能' : '',
        !input ? '输入监控' : '',
      ].filter(Boolean).join('、')
      statusSummary.value = `尚未放行：${missing}`
    }
  }
  catch (error) {
    statusSummary.value = `环境状态读取失败：${String(error)}`
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runPermissionWizard() {
  windowHint.value = ''
  try {
    await refreshStatuses()
    if (allGranted.value) {
      windowHint.value = '四项权限均已放行，无需重复向导。'
      return
    }

    type Step = { name: string, run: () => Promise<void>, pauseMs: number }
    const steps: Step[] = []

    if (!microphoneGranted.value)
      steps.push({ name: '麦克风', run: async () => { await invoke('request_microphone_permission'); await invoke('open_microphone_settings') }, pauseMs: 500 })
    if (!speechRecognitionGranted.value)
      steps.push({ name: '语音识别', run: async () => { await invoke('request_speech_recognition_permission') }, pauseMs: 500 })
    if (!accessibilityGranted.value)
      steps.push({ name: '辅助功能', run: async () => { await invoke('request_accessibility_permission') }, pauseMs: 800 })
    if (!inputMonitoringGranted.value)
      steps.push({ name: '输入监控', run: async () => { await invoke('request_input_monitoring_permission') }, pauseMs: 500 })

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      windowHint.value = `${i + 1}/${steps.length} 正在处理「${step.name}」…`
      await step.run()
      await sleep(step.pauseMs)
    }
    await refreshStatuses()
    windowHint.value = '向导已完成。若仍有「未放行」请到系统设置里勾选后点刷新。'
  }
  catch (error) {
    windowHint.value = `向导中断：${String(error)}`
  }
}

async function revealOverlay() {
  try {
    await invoke('reveal_overlay_window')
    windowHint.value = '已显示底部波浪。'
  }
  catch (error) {
    windowHint.value = `浮层失败：${String(error)}`
  }
}

let disposeWindowFocus: (() => void) | undefined
let visibilityHandler: (() => void) | null = null

onMounted(async () => {
  await refreshStatuses()
  visibilityHandler = () => {
    if (document.visibilityState === 'visible')
      void refreshStatuses()
  }
  document.addEventListener('visibilitychange', visibilityHandler)
  try {
    disposeWindowFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) void refreshStatuses()
    })
  }
  catch { /* ignore */ }
})

onUnmounted(() => {
  if (visibilityHandler)
    document.removeEventListener('visibilitychange', visibilityHandler)
  disposeWindowFocus?.()
})
</script>

<template>
  <div class="overview">
    <!-- 状态总览 -->
    <div class="status-banner" :class="allGranted ? 'ready' : 'pending'">
      <div class="banner-icon">{{ allGranted ? '✅' : '⚠️' }}</div>
      <div class="banner-text">
        <p class="banner-title">{{ allGranted ? '系统已就绪' : '权限未完成' }}</p>
        <p class="banner-sub">{{ statusSummary }}</p>
      </div>
      <button v-if="!allGranted" class="btn primary small" @click="runPermissionWizard">一键授权</button>
      <button class="btn ghost small" @click="refreshStatuses">刷新</button>
    </div>

    <!-- 权限卡片 -->
    <section class="section">
      <h3 class="section-title">权限状态</h3>
      <div class="perm-grid">
        <div
          v-for="item in permissionItems"
          :key="item.label"
          class="perm-card"
          :class="item.granted ? 'granted' : 'missing'"
        >
          <span class="perm-icon">{{ item.icon }}</span>
          <div>
            <p class="perm-label">{{ item.label }}</p>
            <p class="perm-status">{{ item.granted ? '已放行' : '待授权' }}</p>
          </div>
          <span class="perm-dot" :class="item.granted ? 'dot-ok' : 'dot-warn'" />
        </div>
      </div>
    </section>

    <!-- 快速操作 -->
    <section class="section">
      <h3 class="section-title">快速操作</h3>
      <div class="action-row">
        <button class="btn ghost" @click="revealOverlay">显示底部波浪</button>
        <button class="btn ghost" @click="runPermissionWizard">权限向导</button>
        <button class="btn ghost" @click="refreshStatuses">刷新权限</button>
      </div>
      <p v-if="windowHint" class="hint">{{ windowHint }}</p>
    </section>

    <!-- 录音触发 -->
    <section class="section">
      <h3 class="section-title">录音触发</h3>
      <div class="trigger-card">
        <div class="trigger-key">Fn</div>
        <div>
          <p class="trigger-label">当前热键</p>
          <p class="trigger-desc">按一次开始监听，再按一次停止并写回文本到当前输入框。</p>
        </div>
      </div>
    </section>

    <!-- 产品结构说明 -->
    <section class="section">
      <h3 class="section-title">产品架构</h3>
      <div class="arch-grid">
        <div class="arch-card">
          <p class="arch-title">Hub 控制台</p>
          <p class="arch-desc">权限、快捷键、词典和历史等长期能力。你现在看的就是这里。</p>
        </div>
        <div class="arch-card">
          <p class="arch-title">菜单栏入口</p>
          <p class="arch-desc">常驻入口，显示状态、快速开始录音、打开设置。</p>
        </div>
        <div class="arch-card">
          <p class="arch-title">底部波浪 Overlay</p>
          <p class="arch-desc">Fn 瞬时出现，仅反馈正在说话，结束后自动消失。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border-radius: 16px;
  border: 1px solid rgba(92, 54, 28, 0.08);
}

.status-banner.ready {
  background: linear-gradient(135deg, rgba(61, 136, 90, 0.08), rgba(61, 136, 90, 0.03));
  border-color: rgba(61, 136, 90, 0.15);
}

.status-banner.pending {
  background: linear-gradient(135deg, rgba(210, 122, 44, 0.08), rgba(210, 122, 44, 0.03));
  border-color: rgba(210, 122, 44, 0.15);
}

.banner-icon { font-size: 24px; }

.banner-text { flex: 1; }

.banner-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(38, 24, 16, 0.92);
}

.banner-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: rgba(84, 62, 49, 0.72);
}

.section { }

.section-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(112, 72, 46, 0.6);
}

.perm-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.perm-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(92, 54, 28, 0.06);
  transition: border-color 0.2s;
}

.perm-card.granted { border-color: rgba(61, 136, 90, 0.12); }
.perm-card.missing { border-color: rgba(210, 122, 44, 0.15); }

.perm-icon { font-size: 22px; }

.perm-label {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: rgba(38, 24, 16, 0.88);
}

.perm-status {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(84, 62, 49, 0.6);
}

.perm-dot {
  margin-left: auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-ok { background: #3d885a; }
.dot-warn { background: #d27a2c; }

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.btn {
  border: 0;
  border-radius: 10px;
  padding: 10px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn.primary {
  color: #fff;
  background: linear-gradient(135deg, #e8a84a, #c45c18);
  box-shadow: 0 4px 12px rgba(196, 92, 24, 0.22);
}

.btn.primary:hover { box-shadow: 0 6px 16px rgba(196, 92, 24, 0.32); }

.btn.ghost {
  color: rgba(56, 36, 24, 0.82);
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(92, 54, 28, 0.1);
}

.btn.ghost:hover { background: rgba(255, 255, 255, 1); }

.btn.small { padding: 8px 14px; font-size: 12px; }

.hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: rgba(70, 50, 39, 0.72);
  line-height: 1.5;
}

.trigger-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(92, 54, 28, 0.06);
}

.trigger-key {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 700;
  color: rgba(38, 24, 16, 0.88);
  background: rgba(250, 245, 238, 0.9);
  border: 1px solid rgba(92, 54, 28, 0.1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
}

.trigger-label {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: rgba(38, 24, 16, 0.88);
}

.trigger-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: rgba(84, 62, 49, 0.65);
}

.arch-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.arch-card {
  padding: 16px;
  border-radius: 14px;
  background: rgba(250, 245, 238, 0.8);
  border: 1px solid rgba(92, 54, 28, 0.06);
}

.arch-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(38, 24, 16, 0.88);
}

.arch-desc {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(84, 62, 49, 0.65);
  line-height: 1.6;
}
</style>

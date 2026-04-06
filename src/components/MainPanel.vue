<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

const accessibilityGranted = ref(false)
const inputMonitoringGranted = ref(false)
const microphoneGranted = ref(false)
const speechRecognitionGranted = ref(false)
const statusSummary = ref('正在检查语音输入环境…')

const systemCards = computed(() => [
  {
    label: '麦克风',
    value: microphoneGranted.value ? '已放行' : '待授权',
    tone: microphoneGranted.value ? 'good' : 'warn'
  },
  {
    label: '语音识别',
    value: speechRecognitionGranted.value ? '已放行' : '待授权',
    tone: speechRecognitionGranted.value ? 'good' : 'warn'
  },
  {
    label: '辅助功能',
    value: accessibilityGranted.value ? '已放行' : '待授权',
    tone: accessibilityGranted.value ? 'good' : 'warn'
  },
  {
    label: '输入监控',
    value: inputMonitoringGranted.value ? '已放行' : '待授权',
    tone: inputMonitoringGranted.value ? 'good' : 'warn'
  },
  {
    label: '录音触发',
    value: 'Fn',
    tone: 'neutral'
  }
])

const summaryCards = computed(() => [
  {
    title: 'General',
    body: '开机启动、菜单栏入口、Dock 展示和权限 onboarding 都收进主 App。'
  },
  {
    title: 'Speech',
    body: '语言、识别模式、热键停止策略和异常回退策略都收敛到这里。'
  },
  {
    title: 'Dictionary',
    body: '专有名词、人名、品牌名和替换规则集中维护。'
  },
  {
    title: 'History',
    body: '最近转写、写回目标和复制入口后续都挂在这里。'
  }
])

async function refreshStatuses() {
  try {
    const [microphone, speechRecognition, accessibility, inputMonitoring] = await Promise.all([
      invoke<boolean>('microphone_status'),
      invoke<boolean>('speech_recognition_status'),
      invoke<boolean>('accessibility_status'),
      invoke<boolean>('input_monitoring_status')
    ])

    microphoneGranted.value = microphone
    speechRecognitionGranted.value = speechRecognition
    accessibilityGranted.value = accessibility
    inputMonitoringGranted.value = inputMonitoring
    if (microphone && speechRecognition && accessibility && inputMonitoring) {
      statusSummary.value = '系统已就绪。主 App 负责配置，按 Fn 只会唤起底部波浪。'
    } else {
      const missing = [
        !microphone ? '麦克风' : '',
        !speechRecognition ? '语音识别' : '',
        !accessibility ? '辅助功能' : '',
        !inputMonitoring ? '输入监控' : ''
      ]
        .filter(Boolean)
        .join('、')
      statusSummary.value = `系统仍报告未放行：${missing}。若你已在「系统设置 → 隐私与安全性」里打开过，请点「刷新权限状态」，或从设置页切回本窗口（会自动重读）。`
    }
  } catch (error) {
    statusSummary.value = `环境状态读取失败：${String(error)}`
  }
}

async function requestMicrophone() {
  await invoke('request_microphone_permission')
  await refreshStatuses()
}

async function openMicrophoneSettings() {
  try {
    await invoke('open_microphone_settings')
    windowHint.value = '已打开「系统设置 → 隐私与安全性 → 麦克风」。请确认列表中已勾选 iterate-speech，然后回到本窗口点「刷新权限状态」。'
  } catch (error) {
    windowHint.value = `打开麦克风设置失败：${String(error)}`
  }
}

async function requestSpeechRecognition() {
  await invoke('request_speech_recognition_permission')
  await refreshStatuses()
}

async function requestAccessibility() {
  await invoke('request_accessibility_permission')
  await refreshStatuses()
}

async function requestInputMonitoring() {
  await invoke('request_input_monitoring_permission')
  await refreshStatuses()
}

const windowHint = ref('')

async function bringMainWindowForward() {
  windowHint.value = ''
  try {
    await invoke('show_main_window')
    windowHint.value = '已请求将主窗口置顶。若仍看不到，请试 Mission Control 或多桌面。'
  } catch (error) {
    windowHint.value = `置顶失败：${String(error)}`
  }
}

async function revealOverlayOnly() {
  windowHint.value = ''
  try {
    await invoke('reveal_overlay_window')
    windowHint.value = '已显示底部语音浮层（未开始录音）。按 Fn 开始监听。'
  } catch (error) {
    windowHint.value = `浮层失败：${String(error)}`
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * 只对「仍缺」的权限发起系统请求，避免每次一键都把四步跑满（反复打开辅助功能/输入监控页，
 * 容易误以为开关被关掉或要重复勾选）。
 */
async function runPermissionWizard() {
  windowHint.value = ''
  try {
    await refreshStatuses()

    if (
      microphoneGranted.value &&
      speechRecognitionGranted.value &&
      accessibilityGranted.value &&
      inputMonitoringGranted.value
    ) {
      windowHint.value =
        '四项权限系统已报告为已放行，无需重复向导。若仍异常请点「刷新权限状态」或重启 App。'
      return
    }

    type WizardStep = { name: string; run: () => Promise<void>; pauseMs: number }
    const steps: WizardStep[] = []

    if (!microphoneGranted.value) {
      steps.push({
        name: '麦克风',
        run: async () => {
          await invoke<boolean>('request_microphone_permission')
          await invoke('open_microphone_settings')
        },
        pauseMs: 500
      })
    }
    if (!speechRecognitionGranted.value) {
      steps.push({
        name: '语音识别',
        run: async () => {
          await invoke<boolean>('request_speech_recognition_permission')
        },
        pauseMs: 500
      })
    }
    if (!accessibilityGranted.value) {
      steps.push({
        name: '辅助功能',
        run: async () => {
          await invoke('request_accessibility_permission')
        },
        pauseMs: 800
      })
    }
    if (!inputMonitoringGranted.value) {
      steps.push({
        name: '输入监控',
        run: async () => {
          await invoke('request_input_monitoring_permission')
        },
        pauseMs: 500
      })
    }

    if (steps.length === 0) {
      await refreshStatuses()
      windowHint.value = '权限状态已更新，请查看上方卡片。'
      return
    }

    const total = steps.length
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const n = i + 1
      windowHint.value = `${n}/${total} 正在处理「${step.name}」…（若弹出系统对话框或设置页请按提示操作）`
      await step.run()
      await sleep(step.pauseMs)
    }

    await refreshStatuses()
    windowHint.value =
      '向导已仅针对缺项跑完。若某项仍为「待授权」，请到系统设置里勾选后，再点「刷新权限状态」。'
  } catch (error) {
    windowHint.value = `向导中断：${String(error)}`
  }
}

let disposeWindowFocus: (() => void) | undefined
let visibilityHandler: (() => void) | null = null

onMounted(async () => {
  await refreshStatuses()
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      void refreshStatuses()
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)
  try {
    disposeWindowFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void refreshStatuses()
      }
    })
  } catch {
    // ignore if API unavailable
  }
})

onUnmounted(() => {
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
  }
  disposeWindowFocus?.()
})
</script>

<template>
  <main class="shell">
    <section class="panel">
      <div class="hero">
        <div>
          <p class="eyebrow">iterate speech hub</p>
          <h1>主 App 保留，Fn 只唤起底部波浪</h1>
        </div>
        <div class="hero-chip">macOS 控制台</div>
      </div>

      <p class="lead">
        这个窗口现在回到“工具控制台”的角色，负责权限、入口、词典和历史这些长期能力。热键交互层单独拆成
        overlay。现在权限 onboarding 也回收到主 App：先完成四项授权，再按一次 <code>Fn</code>
        开始录音、再按一次停止并把文本注入当前输入框。若在「系统设置」里已勾选权限，回到本窗口后卡片仍显示「待授权」，请点
        <strong>刷新权限状态</strong>（或点一下别的 App 再点回来，会自动重读）。「一键权限向导」只会对<strong>仍显示待授权</strong>的项发起系统请求，不会每次把四项全跑一遍。测试请优先使用本仓库
        <code>pnpm tauri:build</code> 打出来的 <code>.app</code>，避免继续打开旧的「应用程序」里拷贝导致界面不是最新版。
      </p>

      <section class="status-grid">
        <article
          v-for="card in systemCards"
          :key="card.label"
          class="status-card"
          :class="`tone-${card.tone}`"
        >
          <p class="status-label">{{ card.label }}</p>
          <p class="status-value">{{ card.value }}</p>
        </article>
      </section>

      <section class="overview-card">
        <div>
          <p class="section-label">当前状态</p>
          <p class="section-copy">{{ statusSummary }}</p>
        </div>
        <div class="quick-actions">
          <button class="action-button accent" type="button" @click="bringMainWindowForward">
            主窗口置顶
          </button>
          <button class="action-button ghost" type="button" @click="revealOverlayOnly">
            显示底部浮层
          </button>
          <button class="action-button wizard" type="button" @click="runPermissionWizard">
            一键权限向导
          </button>
          <button class="action-button ghost" type="button" @click="refreshStatuses">
            刷新权限状态
          </button>
          <button class="action-button" type="button" @click="requestMicrophone">
            请求麦克风权限
          </button>
          <button class="action-button ghost" type="button" @click="openMicrophoneSettings">
            打开麦克风系统设置
          </button>
          <button class="action-button ghost" type="button" @click="requestSpeechRecognition">
            请求语音识别权限
          </button>
          <button class="action-button" type="button" @click="requestAccessibility">
            辅助功能（系统弹窗 + 设置）
          </button>
          <button class="action-button ghost" type="button" @click="requestInputMonitoring">
            请求输入监控权限
          </button>
        </div>
        <p v-if="windowHint" class="window-hint">{{ windowHint }}</p>
      </section>

      <section class="content-grid">
        <article class="overview-card">
          <p class="section-label">权限顺序</p>
          <ul class="list">
            <li>先放行麦克风和语音识别，不然底部波浪没有资格进入真监听态。</li>
            <li>再放行辅助功能和输入监控，负责热键监听与最终写回。</li>
            <li>四项齐了之后，再验证“第一次 Fn 开始，第二次 Fn 停止并注入”。</li>
          </ul>
        </article>

        <article class="overview-card">
          <p class="section-label">现在的交互约定</p>
          <ul class="list">
            <li>主应用窗口保留，并负责所有权限与长期设置。</li>
            <li>底边 overlay 只显示极小波形，不再承担权限解释工作。</li>
            <li>权限没齐时，Fn 不进入假监听态，而是把你带回主 App。</li>
          </ul>
        </article>

        <article class="overview-card">
          <p class="section-label">后续主页面分区</p>
          <div class="summary-grid">
            <div v-for="card in summaryCards" :key="card.title" class="summary-card">
              <p class="summary-title">{{ card.title }}</p>
              <p class="summary-body">{{ card.body }}</p>
            </div>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  font-family: "SF Pro Display", "PingFang SC", sans-serif;
  color: #f8f3eb;
  background: transparent;
}

:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
}

.shell {
  min-height: 100%;
  padding: 22px;
  background:
    radial-gradient(circle at top left, rgba(255, 167, 80, 0.34), transparent 32%),
    radial-gradient(circle at bottom right, rgba(255, 95, 45, 0.14), transparent 28%),
    linear-gradient(155deg, rgba(247, 240, 230, 0.98), rgba(232, 224, 214, 0.98));
}

.panel {
  min-height: calc(100% - 44px);
  border-radius: 34px;
  padding: 28px;
  background: linear-gradient(180deg, rgba(255, 250, 243, 0.94), rgba(247, 242, 235, 0.92));
  border: 1px solid rgba(92, 54, 28, 0.08);
  box-shadow:
    0 32px 90px rgba(68, 42, 19, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.84);
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.hero-chip {
  flex-shrink: 0;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(92, 54, 28, 0.08);
  color: rgba(92, 54, 28, 0.72);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(112, 72, 46, 0.68);
}

h1 {
  margin: 12px 0 0;
  font-size: 42px;
  line-height: 1.04;
  color: rgba(43, 27, 18, 0.96);
}

.lead {
  margin: 16px 0 0;
  color: rgba(84, 62, 49, 0.84);
  line-height: 1.7;
  font-size: 16px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 26px;
}

.status-card {
  border-radius: 22px;
  padding: 18px;
  border: 1px solid rgba(92, 54, 28, 0.08);
  background: rgba(255, 255, 255, 0.72);
}

.tone-good {
  box-shadow: inset 0 0 0 1px rgba(61, 136, 90, 0.1);
}

.tone-warn {
  box-shadow: inset 0 0 0 1px rgba(210, 122, 44, 0.12);
}

.status-label {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(112, 72, 46, 0.62);
}

.status-value {
  margin: 12px 0 0;
  font-size: 28px;
  color: rgba(38, 24, 16, 0.94);
}

.overview-card {
  margin-top: 18px;
  border-radius: 24px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(92, 54, 28, 0.08);
}

.section-label {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(112, 72, 46, 0.7);
}

.section-copy {
  margin: 12px 0 0;
  color: rgba(70, 50, 39, 0.82);
  line-height: 1.75;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}

.action-button {
  border: 0;
  border-radius: 999px;
  padding: 12px 16px;
  font: inherit;
  color: #fff7f0;
  background: linear-gradient(135deg, #201611, #7f4723);
  box-shadow: 0 14px 30px rgba(87, 49, 24, 0.18);
  cursor: pointer;
}

.action-button.ghost {
  color: rgba(56, 36, 24, 0.88);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(92, 54, 28, 0.1);
  box-shadow: none;
}

.action-button.accent {
  background: linear-gradient(135deg, #2a6b4a, #1d4a34);
  box-shadow: 0 14px 28px rgba(29, 74, 52, 0.22);
}

.action-button.wizard {
  background: linear-gradient(135deg, #5b3ea8, #3d2a72);
  box-shadow: 0 14px 28px rgba(61, 42, 114, 0.22);
}

.window-hint {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(70, 50, 39, 0.78);
}

.content-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 18px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.summary-card {
  border-radius: 18px;
  padding: 14px;
  background: rgba(250, 245, 238, 0.9);
  border: 1px solid rgba(92, 54, 28, 0.08);
}

.summary-title {
  margin: 0;
  font-size: 15px;
  color: rgba(38, 24, 16, 0.9);
}

.summary-body {
  margin: 8px 0 0;
  color: rgba(84, 62, 49, 0.76);
  line-height: 1.6;
}

.list {
  margin: 14px 0 0;
  padding-left: 20px;
  color: rgba(70, 50, 39, 0.82);
  line-height: 1.75;
}

code {
  font-family: "SF Mono", "Fira Code", monospace;
}

@media (max-width: 860px) {
  .hero,
  .content-grid,
  .status-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    flex-direction: column;
  }

  h1 {
    font-size: 34px;
  }
}
</style>

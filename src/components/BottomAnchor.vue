<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useSpeechOverlay } from '../composables/useSpeechOverlay'

const overlay = useSpeechOverlay()

const pulseScale = computed(() => 1 + overlay.micLevel.value * 0.22)
const isActive = computed(() =>
  overlay.sessionPhase.value === 'starting' ||
  overlay.sessionPhase.value === 'listening' ||
  overlay.sessionPhase.value === 'stopping'
)
const hasTranscript = computed(() =>
  Boolean(
    overlay.partialTranscript.value ||
      overlay.transcript.value ||
      overlay.lastCommittedText.value
  )
)

/** Fn 会话中只展示波浪，不铺大段说明文案 */
const isWaveOnlySession = computed(
  () =>
    overlay.sessionPhase.value === 'starting' ||
    overlay.sessionPhase.value === 'listening' ||
    overlay.sessionPhase.value === 'stopping',
)

/** 对齐 iOS `TypelessStyleMicLevelBar`：窄轨 + 黑填充，宽度随 micLevel 变 */
const levelBarFillPx = computed(() => {
  const raw = overlay.micLevel.value
  const v = Math.min(1, Math.max(0, raw))
  const eff = v < 0.022 ? 0 : v
  const track = 54
  if (eff <= 0) {
    return 0
  }
  return Math.min(track, Math.max(8, track * eff))
})

onMounted(async () => {
  await overlay.initialize()
})

onBeforeUnmount(() => {
  overlay.dispose()
})
</script>

<template>
  <main class="shell">
    <div class="dock-stack" data-tauri-drag-region>
      <!-- 失败文案不放浮层（难看）；详情见主窗口 diagnostics / statusMessage -->
      <p
        v-if="!isWaveOnlySession && hasTranscript"
        class="float-caption float-caption--preview"
      >
        {{ overlay.displayTranscript }}
      </p>
      <!-- iOS VoiceHalfCircleDock：录音态顶部细条电平 -->
      <div v-if="isActive" class="level-bar-track" aria-hidden="true">
        <div
          class="level-bar-fill"
          :style="{ width: levelBarFillPx > 0 ? `${levelBarFillPx}px` : '0' }"
        />
      </div>
      <div
        class="wave-anchor"
        :class="{ active: isActive, idle: !isActive }"
        :style="{ transform: `scale(${pulseScale})` }"
        aria-label="speech anchor"
      >
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  margin: 0;
  width: 100%;
  height: 100%;
  background: transparent !important;
  overflow: hidden;
  font-family: "SF Pro Display", "PingFang SC", sans-serif;
}

.shell {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  box-sizing: border-box;
  padding: 2px 4px;
}

.dock-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  max-width: calc(100vw - 8px);
  cursor: grab;
}

.dock-stack:active {
  cursor: grabbing;
}

.float-caption {
  margin: 0;
  max-width: 200px;
  text-align: center;
  font-size: 10px;
  line-height: 1.3;
  text-shadow:
    0 0 10px rgba(255, 255, 255, 0.95),
    0 1px 2px rgba(255, 255, 255, 0.9);
}

.float-caption--preview {
  color: rgba(58, 35, 20, 0.9);
  max-height: 2.6em;
  overflow: hidden;
  word-break: break-word;
}

.level-bar-track {
  width: 54px;
  height: 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.level-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: rgba(24, 24, 24, 0.88);
  transition: width 70ms ease-out;
}

.wave-anchor {
  position: relative;
  width: 78px;
  height: 42px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: transparent;
  border: none;
  box-shadow: none;
  filter: drop-shadow(0 3px 10px rgba(59, 37, 18, 0.22));
  transition: transform 140ms ease, opacity 140ms ease, filter 140ms ease;
}

.wave-anchor::before {
  display: none;
}

.wave-anchor.idle {
  opacity: 0.92;
}

.wave-anchor.active {
  filter: drop-shadow(0 4px 14px rgba(255, 120, 48, 0.35));
}

.wave-anchor span {
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffc883, #ff8e4c);
  transform-origin: center;
  animation: breathe 1.05s ease-in-out infinite;
}

.wave-anchor span:nth-child(1) {
  height: 9px;
  animation-delay: -0.18s;
}

.wave-anchor span:nth-child(2) {
  height: 15px;
  animation-delay: -0.42s;
}

.wave-anchor span:nth-child(3) {
  height: 19px;
  animation-delay: -0.08s;
}

.wave-anchor span:nth-child(4) {
  height: 15px;
  animation-delay: -0.3s;
}

.wave-anchor span:nth-child(5) {
  height: 9px;
  animation-delay: -0.14s;
}

@keyframes breathe {
  0%,
  100% {
    transform: scaleY(0.58);
    opacity: 0.42;
  }

  50% {
    transform: scaleY(1.06);
    opacity: 1;
  }
}

@media (max-width: 680px) {
  .wave-anchor {
    width: 70px;
    height: 38px;
  }
}
</style>

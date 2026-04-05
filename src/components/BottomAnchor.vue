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

const showErrorCaption = computed(
  () =>
    overlay.sessionPhase.value === 'error' ||
    overlay.sessionPhase.value === 'unsupported',
)

onMounted(async () => {
  await overlay.initialize()
})

onBeforeUnmount(() => {
  overlay.dispose()
})
</script>

<template>
  <main class="shell">
    <section class="anchor-card" :class="{ active: isActive }">
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
      <p v-if="showErrorCaption" class="err-caption">
        {{ overlay.statusMessage }}
      </p>
      <!-- 非会话态且已有文本时保留一行预览（例如待写回），避免完全黑盒 -->
      <p
        v-else-if="!isWaveOnlySession && hasTranscript"
        class="preview-line"
      >
        {{ overlay.displayTranscript }}
      </p>
    </section>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  background: transparent;
  overflow: hidden;
  font-family: "SF Pro Display", "PingFang SC", sans-serif;
}

:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
}

.shell {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  box-sizing: border-box;
  padding: 4px 8px;
}

.anchor-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  box-sizing: border-box;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 252, 248, 0.94), rgba(255, 245, 236, 0.88));
  border: 1px solid rgba(255, 255, 255, 0.92);
  box-shadow:
    0 14px 32px rgba(79, 52, 28, 0.14),
    0 0 0 4px rgba(255, 190, 132, 0.08);
  transition: box-shadow 140ms ease;
  max-width: calc(100vw - 16px);
}

.anchor-card.active {
  box-shadow:
    0 18px 40px rgba(79, 52, 28, 0.18),
    0 0 0 5px rgba(255, 173, 111, 0.12);
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
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.76));
  border: 1px solid rgba(255, 255, 255, 0.94);
  box-shadow:
    0 12px 24px rgba(59, 37, 18, 0.1),
    0 0 0 4px rgba(255, 173, 111, 0.08);
  transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
}

.wave-anchor::before {
  content: "";
  position: absolute;
  inset: auto 14px -8px;
  height: 16px;
  border-radius: 999px;
  background: rgba(255, 170, 108, 0.2);
  filter: blur(12px);
  z-index: -1;
}

.wave-anchor.idle {
  opacity: 0.92;
}

.wave-anchor.active {
  box-shadow:
    0 16px 30px rgba(59, 37, 18, 0.16),
    0 0 0 6px rgba(255, 173, 111, 0.12);
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

.err-caption {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  max-width: 220px;
  text-align: center;
  color: rgba(142, 48, 48, 0.92);
}

.preview-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.3;
  max-width: 260px;
  max-height: 2.6em;
  overflow: hidden;
  text-align: center;
  color: rgba(58, 35, 20, 0.88);
  word-break: break-word;
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

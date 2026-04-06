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

onMounted(async () => {
  await overlay.initialize()
})

onBeforeUnmount(() => {
  overlay.dispose()
})
</script>

<template>
  <main class="shell">
    <section class="capsule" :class="{ active: isActive }">
      <div class="capsule-head">
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
        <p class="phase-copy">{{ overlay.phaseLabel }}</p>
      </div>

      <p class="transcript-copy" :class="{ placeholder: !hasTranscript }">
        {{ overlay.displayTranscript }}
      </p>

      <p class="status-copy">{{ overlay.statusMessage }}</p>
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
  display: grid;
  place-items: center;
  background: transparent;
}

.capsule {
  width: min(420px, calc(100vw - 20px));
  min-height: 94px;
  padding: 14px 16px 12px;
  box-sizing: border-box;
  display: grid;
  gap: 8px;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 252, 248, 0.96), rgba(255, 245, 236, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.94);
  box-shadow:
    0 22px 50px rgba(79, 52, 28, 0.18),
    0 0 0 6px rgba(255, 190, 132, 0.1);
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.capsule.active {
  box-shadow:
    0 26px 58px rgba(79, 52, 28, 0.22),
    0 0 0 7px rgba(255, 173, 111, 0.14);
}

.capsule-head {
  display: flex;
  align-items: center;
  gap: 10px;
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

.phase-copy,
.transcript-copy,
.status-copy {
  margin: 0;
}

.phase-copy {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(124, 84, 51, 0.72);
}

.transcript-copy {
  min-height: 22px;
  font-size: 18px;
  line-height: 1.35;
  color: rgba(58, 35, 20, 0.96);
  word-break: break-word;
}

.transcript-copy.placeholder {
  color: rgba(132, 107, 88, 0.58);
}

.status-copy {
  font-size: 12px;
  line-height: 1.45;
  color: rgba(120, 89, 63, 0.78);
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
  .capsule {
    width: calc(100vw - 16px);
    padding: 12px 14px;
  }

  .wave-anchor {
    width: 70px;
    height: 38px;
  }

  .transcript-copy {
    font-size: 16px;
  }
}
</style>

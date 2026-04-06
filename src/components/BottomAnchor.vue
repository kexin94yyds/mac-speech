<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useSpeechOverlay } from '../composables/useSpeechOverlay'

const overlay = useSpeechOverlay()

const pulseScale = computed(() => 1 + overlay.micLevel.value * 0.22)
const isActive = computed(
  () =>
    overlay.sessionPhase.value === 'starting' ||
    overlay.sessionPhase.value === 'listening' ||
    overlay.sessionPhase.value === 'stopping',
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
    <!-- 整块可拖移窗口（与 c84decc 一致）；仅保留波浪，无白底胶囊 -->
    <div class="dock-stack" data-tauri-drag-region>
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
  display: grid;
  place-items: center;
  background: transparent;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

.dock-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: grab;
}

.dock-stack:active {
  cursor: grabbing;
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
  transition:
    transform 140ms ease,
    opacity 140ms ease,
    filter 140ms ease;
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

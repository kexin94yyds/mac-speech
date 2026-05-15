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
  <!-- 铺满 96×48，整块可拖；波浪仅视觉，不抢指针事件（否则只有中间一条能拖） -->
  <main class="shell" data-tauri-drag-region>
    <div class="dock-stack">
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
  cursor: grab;
  user-select: none;
}

.shell:active {
  cursor: grabbing;
}

.dock-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.wave-anchor {
  position: relative;
  pointer-events: none;
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
  /* 不用 drop-shadow，避免在透明 WebView 上像一圈浅色外框 */
  transition:
    transform 140ms ease,
    opacity 140ms ease;
}

.wave-anchor.idle {
  opacity: 0.92;
}

.wave-anchor.active {
  opacity: 1;
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

<script setup lang="ts">
import { computed } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import MainPanel from './components/MainPanel.vue'
import BottomAnchor from './components/BottomAnchor.vue'

const isOverlayView = computed(() => {
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'overlay' || getCurrentWindow().label === 'overlay'
})
</script>

<template>
  <BottomAnchor v-if="isOverlayView" />
  <MainPanel v-else />
</template>

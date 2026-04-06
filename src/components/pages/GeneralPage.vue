<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const launchAtLogin = ref(false)
const showInMenuBar = ref(true)
const showInDock = ref(true)
const hotkey = ref('Fn')
const menuBarAction = ref('toggle')
const loaded = ref(false)

async function loadSettings() {
  try {
    const s = await invoke<{
      launch_at_login: boolean
      show_in_menu_bar: boolean
      show_in_dock: boolean
      hotkey: string
      menu_bar_action: string
    }>('load_general_settings')
    launchAtLogin.value = s.launch_at_login
    showInMenuBar.value = s.show_in_menu_bar
    showInDock.value = s.show_in_dock
    hotkey.value = s.hotkey
    menuBarAction.value = s.menu_bar_action
  } catch (e) {
    console.error('load_general_settings failed', e)
  } finally {
    loaded.value = true
  }
}

async function persist() {
  if (!loaded.value) return
  try {
    await invoke('save_general_settings', {
      settings: {
        launch_at_login: launchAtLogin.value,
        show_in_menu_bar: showInMenuBar.value,
        show_in_dock: showInDock.value,
        hotkey: hotkey.value,
        menu_bar_action: menuBarAction.value,
      },
    })
  } catch (e) {
    console.error('save_general_settings failed', e)
  }
}

onMounted(() => { void loadSettings() })

watch([launchAtLogin, showInMenuBar, showInDock, hotkey, menuBarAction], () => {
  void persist()
})
</script>

<template>
  <div class="page">
    <h2 class="page-title">通用设置</h2>
    <p class="page-desc">管理应用的系统行为、菜单栏入口和全局快捷键。</p>

    <section class="card">
      <h3 class="card-title">启动与驻留</h3>
      <div class="setting-row">
        <div>
          <p class="setting-label">开机自动启动</p>
          <p class="setting-desc">登录后自动启动 iterate speech，常驻菜单栏。</p>
        </div>
        <label class="toggle">
          <input v-model="launchAtLogin" type="checkbox">
          <span class="toggle-track" />
        </label>
      </div>
      <div class="divider" />
      <div class="setting-row">
        <div>
          <p class="setting-label">菜单栏图标</p>
          <p class="setting-desc">在顶部菜单栏显示状态图标，可快速开始录音。</p>
        </div>
        <label class="toggle">
          <input v-model="showInMenuBar" type="checkbox">
          <span class="toggle-track" />
        </label>
      </div>
      <div class="divider" />
      <div class="setting-row">
        <div>
          <p class="setting-label">Dock 图标</p>
          <p class="setting-desc">在 Dock 中显示应用图标。关闭后仅通过菜单栏访问。</p>
        </div>
        <label class="toggle">
          <input v-model="showInDock" type="checkbox">
          <span class="toggle-track" />
        </label>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">快捷键</h3>
      <div class="setting-row">
        <div>
          <p class="setting-label">录音热键</p>
          <p class="setting-desc">按一次开始监听，再按一次停止并将文本写入当前输入框。</p>
        </div>
        <div class="key-badge">{{ hotkey }}</div>
      </div>
      <div class="divider" />
      <div class="setting-row">
        <div>
          <p class="setting-label">点击菜单栏图标</p>
          <p class="setting-desc">选择点击菜单栏图标时的默认行为。</p>
        </div>
        <select v-model="menuBarAction" class="select">
          <option value="toggle">开始 / 停止录音</option>
          <option value="open">打开主窗口</option>
          <option value="menu">显示菜单</option>
        </select>
      </div>
    </section>

    <p class="footnote">设置自动保存。快捷键后续版本将支持自定义组合键。</p>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: rgba(38, 24, 16, 0.94);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: rgba(84, 62, 49, 0.7);
}

.card {
  padding: 4px 0;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(92, 54, 28, 0.06);
  overflow: hidden;
}

.card-title {
  margin: 0;
  padding: 16px 20px 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(112, 72, 46, 0.6);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
}

.setting-label {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: rgba(38, 24, 16, 0.88);
}

.setting-desc {
  margin: 3px 0 0;
  font-size: 12px;
  color: rgba(84, 62, 49, 0.58);
}

.divider {
  height: 1px;
  margin: 0 20px;
  background: rgba(92, 54, 28, 0.06);
}

.toggle {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  z-index: 1;
}

.toggle-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(92, 54, 28, 0.14);
  transition: background 0.2s;
}

.toggle-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  transition: transform 0.2s;
}

.toggle input:checked + .toggle-track {
  background: #3d885a;
}

.toggle input:checked + .toggle-track::after {
  transform: translateX(20px);
}

.key-badge {
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(38, 24, 16, 0.88);
  background: rgba(250, 245, 238, 0.9);
  border: 1px solid rgba(92, 54, 28, 0.1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
}

.select {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(92, 54, 28, 0.1);
  background: rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 13px;
  color: rgba(38, 24, 16, 0.82);
  cursor: pointer;
}

.footnote {
  margin: 0;
  font-size: 12px;
  color: rgba(84, 62, 49, 0.5);
}
</style>

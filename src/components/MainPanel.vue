<script setup lang="ts">
import { ref, shallowRef, markRaw } from 'vue'
import OverviewPage from './pages/OverviewPage.vue'
import GeneralPage from './pages/GeneralPage.vue'
import SpeechPage from './pages/SpeechPage.vue'
import DictionaryPage from './pages/DictionaryPage.vue'
import HistoryPage from './pages/HistoryPage.vue'
import AccountPage from './pages/AccountPage.vue'
import HelpPage from './pages/HelpPage.vue'

interface NavItem {
  id: string
  label: string
  icon: string
  component: ReturnType<typeof markRaw>
}

const navItems: NavItem[] = [
  { id: 'overview', label: '总览', icon: '◉', component: markRaw(OverviewPage) },
  { id: 'general', label: '通用', icon: '⚙', component: markRaw(GeneralPage) },
  { id: 'speech', label: '语音', icon: '🎤', component: markRaw(SpeechPage) },
  { id: 'dictionary', label: '词典', icon: '📖', component: markRaw(DictionaryPage) },
  { id: 'history', label: '历史', icon: '📋', component: markRaw(HistoryPage) },
  { id: 'account', label: '账户', icon: '👤', component: markRaw(AccountPage) },
  { id: 'help', label: '帮助', icon: '?', component: markRaw(HelpPage) },
]

const activeId = ref('overview')
const activeComponent = shallowRef(navItems[0].component)

function navigate(item: NavItem) {
  activeId.value = item.id
  activeComponent.value = item.component
}
</script>

<template>
  <main class="shell">
    <!-- 侧栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-wave">
          <span /><span /><span /><span /><span />
        </div>
        <p class="app-name">iterate speech</p>
      </div>

      <nav class="nav">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: activeId === item.id }"
          @click="navigate(item)"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <p class="version">v0.1.0</p>
      </div>
    </aside>

    <!-- 内容区 -->
    <section class="content">
      <component :is="activeComponent" />
    </section>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  font-family: "SF Pro Display", "PingFang SC", -apple-system, sans-serif;
  color: rgba(38, 24, 16, 0.92);
  background: transparent;
  -webkit-font-smoothing: antialiased;
}

:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
}

.shell {
  display: flex;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at top left, rgba(255, 167, 80, 0.22), transparent 40%),
    radial-gradient(circle at bottom right, rgba(255, 95, 45, 0.08), transparent 35%),
    linear-gradient(155deg, #f7f0e6, #e8e0d6);
  overflow: hidden;
}

/* ---- 侧栏 ---- */
.sidebar {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
  background: rgba(255, 250, 243, 0.55);
  backdrop-filter: blur(20px);
  border-right: 1px solid rgba(92, 54, 28, 0.06);
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 20px;
}

.logo-wave {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.logo-wave span {
  width: 2.5px;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffc883, #ff8e4c);
  animation: logo-breathe 1.2s ease-in-out infinite;
}

.logo-wave span:nth-child(1) { height: 6px; animation-delay: -0.2s; }
.logo-wave span:nth-child(2) { height: 10px; animation-delay: -0.4s; }
.logo-wave span:nth-child(3) { height: 13px; animation-delay: -0.1s; }
.logo-wave span:nth-child(4) { height: 10px; animation-delay: -0.35s; }
.logo-wave span:nth-child(5) { height: 6px; animation-delay: -0.15s; }

@keyframes logo-breathe {
  0%, 100% { transform: scaleY(0.6); opacity: 0.5; }
  50% { transform: scaleY(1); opacity: 1; }
}

.app-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: rgba(38, 24, 16, 0.88);
  letter-spacing: -0.01em;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: rgba(84, 62, 49, 0.72);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.5);
  color: rgba(38, 24, 16, 0.88);
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.82);
  color: rgba(38, 24, 16, 0.94);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.nav-icon {
  width: 20px;
  text-align: center;
  font-size: 15px;
}

.sidebar-footer {
  padding: 12px 10px 0;
  border-top: 1px solid rgba(92, 54, 28, 0.06);
}

.version {
  margin: 0;
  font-size: 11px;
  color: rgba(84, 62, 49, 0.38);
}

/* ---- 内容区 ---- */
.content {
  flex: 1;
  padding: 28px 32px;
  overflow-y: auto;
  overflow-x: hidden;
}

.content::-webkit-scrollbar {
  width: 6px;
}

.content::-webkit-scrollbar-thumb {
  background: rgba(92, 54, 28, 0.12);
  border-radius: 3px;
}

@media (max-width: 860px) {
  .sidebar { width: 56px; padding: 16px 8px; }
  .nav-label { display: none; }
  .app-name { display: none; }
  .sidebar-header { justify-content: center; padding-bottom: 16px; }
  .nav-item { justify-content: center; padding: 10px; }
  .nav-icon { width: auto; }
  .content { padding: 20px 18px; }
}
</style>

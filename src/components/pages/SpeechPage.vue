<script setup lang="ts">
import { ref } from 'vue'
import { IOS_STYLE_DRAFT_EXPERIMENT, IS_LAB_VARIANT } from '../../config/appVariant'

const language = ref('zh-CN')
const recognitionMode = ref('native')
const autoWriteBack = ref(true)
const keepLastResult = ref(true)
const fallbackStrategy = ref('whisper')
</script>

<template>
  <div class="page">
    <h2 class="page-title">语音设置</h2>
    <p class="page-desc">配置语言、识别模式、双模增强和写回策略。</p>

    <section v-if="IS_LAB_VARIANT" class="card card-accent">
      <h3 class="card-title">实验线</h3>
      <div class="setting-row setting-row-stack">
        <div>
          <p class="setting-label">当前包</p>
          <p class="setting-desc">这是独立的 `iterate-speech-lab`，不会覆盖主版。</p>
        </div>
        <div>
          <p class="setting-label">iOS 风格草稿实验</p>
          <p class="setting-desc">
            {{ IOS_STYLE_DRAFT_EXPERIMENT
              ? '已启用：先验证停顿切段、partial 重启和多段草稿聚合；外部输入框实时回改后续再补。'
              : '未启用。' }}
          </p>
        </div>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">识别引擎</h3>
      <div class="setting-row">
        <div>
          <p class="setting-label">输入语言</p>
          <p class="setting-desc">选择语音输入的主语言。</p>
        </div>
        <select v-model="language" class="select">
          <option value="zh-CN">中文（简体）</option>
          <option value="zh-TW">中文（繁体）</option>
          <option value="en-US">English (US)</option>
          <option value="ja-JP">日本語</option>
        </select>
      </div>
      <div class="divider" />
      <div class="setting-row">
        <div>
          <p class="setting-label">识别模式</p>
          <p class="setting-desc">原生使用 macOS Speech.framework；停止后进入本地 Ollama 双模增强。</p>
        </div>
        <select v-model="recognitionMode" class="select">
          <option value="native">原生 Speech.framework</option>
          <option value="whisper">本地 Whisper</option>
          <option value="auto">自动（原生优先，失败回退 Whisper）</option>
        </select>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">双模增强</h3>
      <div class="setting-row">
        <div>
          <p class="setting-label">Ctrl+1 / Fn：中文润色</p>
          <p class="setting-desc">短句日常输入，删除口头禅、补标点、修正中英混排空格。</p>
        </div>
        <div class="key-badge">qwen3:14b</div>
      </div>
      <div class="divider" />
      <div class="setting-row">
        <div>
          <p class="setting-label">Ctrl+2：结构化整理</p>
          <p class="setting-desc">长篇口述整理成自然段落，保留信息点和原表达习惯。</p>
        </div>
        <div class="key-badge">Ollama</div>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">写回行为</h3>
      <div class="setting-row">
        <div>
          <p class="setting-label">自动写回</p>
          <p class="setting-desc">停止后先完成双模增强，再自动粘贴到当前聚焦输入框。</p>
        </div>
        <label class="toggle">
          <input v-model="autoWriteBack" type="checkbox">
          <span class="toggle-track" />
        </label>
      </div>
      <div class="divider" />
      <div class="setting-row">
        <div>
          <p class="setting-label">保留上次结果</p>
          <p class="setting-desc">写回后保留最近一次识别结果以便复制。</p>
        </div>
        <label class="toggle">
          <input v-model="keepLastResult" type="checkbox">
          <span class="toggle-track" />
        </label>
      </div>
      <div class="divider" />
      <div class="setting-row">
        <div>
          <p class="setting-label">出错回退</p>
          <p class="setting-desc">原生识别失败时的备选策略。</p>
        </div>
        <select v-model="fallbackStrategy" class="select">
          <option value="whisper">回退到本地 Whisper</option>
          <option value="retry">重试一次</option>
          <option value="none">不回退，直接提示</option>
        </select>
      </div>
    </section>

    <p class="footnote">Phase 1 固定使用本机 Ollama `qwen3:14b`；Ollama 不可用时回退原始转写。</p>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-title { margin: 0; font-size: 22px; font-weight: 700; color: rgba(38, 24, 16, 0.94); }
.page-desc { margin: 0; font-size: 14px; color: rgba(84, 62, 49, 0.7); }
.card { padding: 4px 0; border-radius: 16px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(92, 54, 28, 0.06); overflow: hidden; }
.card-title { margin: 0; padding: 16px 20px 8px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(112, 72, 46, 0.6); }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 20px; }
.setting-label { margin: 0; font-size: 14px; font-weight: 500; color: rgba(38, 24, 16, 0.88); }
.setting-desc { margin: 3px 0 0; font-size: 12px; color: rgba(84, 62, 49, 0.58); }
.divider { height: 1px; margin: 0 20px; background: rgba(92, 54, 28, 0.06); }
.toggle { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
.toggle input { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; z-index: 1; }
.toggle-track { position: absolute; inset: 0; border-radius: 999px; background: rgba(92, 54, 28, 0.14); transition: background 0.2s; }
.toggle-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.12); transition: transform 0.2s; }
.toggle input:checked + .toggle-track { background: #3d885a; }
.toggle input:checked + .toggle-track::after { transform: translateX(20px); }
.select { padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(92, 54, 28, 0.1); background: rgba(255, 255, 255, 0.9); font: inherit; font-size: 13px; color: rgba(38, 24, 16, 0.82); cursor: pointer; }
.key-badge { padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 600; color: rgba(38, 24, 16, 0.82); background: rgba(250, 245, 238, 0.9); border: 1px solid rgba(92, 54, 28, 0.1); white-space: nowrap; }
.footnote { margin: 0; font-size: 12px; color: rgba(84, 62, 49, 0.5); }
</style>

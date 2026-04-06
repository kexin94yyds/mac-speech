<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

interface DictEntry {
  id: number
  word: string
  replacement: string
}

const entries = ref<DictEntry[]>([])
const newWord = ref('')
const newReplacement = ref('')
const saving = ref(false)

async function loadEntries() {
  try {
    entries.value = await invoke<DictEntry[]>('load_dictionary')
  } catch (e) {
    console.error('load_dictionary failed', e)
  }
}

async function persist() {
  saving.value = true
  try {
    await invoke('save_dictionary', { entries: entries.value })
  } catch (e) {
    console.error('save_dictionary failed', e)
  } finally {
    saving.value = false
  }
}

function addEntry() {
  if (!newWord.value.trim()) return
  const id = Date.now()
  entries.value.push({
    id,
    word: newWord.value.trim(),
    replacement: newReplacement.value.trim() || newWord.value.trim(),
  })
  newWord.value = ''
  newReplacement.value = ''
  void persist()
}

function removeEntry(id: number) {
  entries.value = entries.value.filter(e => e.id !== id)
  void persist()
}

onMounted(() => {
  void loadEntries()
})
</script>

<template>
  <div class="page">
    <h2 class="page-title">个人词典</h2>
    <p class="page-desc">添加专有名词、人名、品牌名和自定义替换规则，提高识别准确率。</p>

    <section class="card">
      <h3 class="card-title">添加词条</h3>
      <div class="add-row">
        <input v-model="newWord" class="input" placeholder="词汇（如 iterate）" @keyup.enter="addEntry">
        <input v-model="newReplacement" class="input" placeholder="替换为（可选）" @keyup.enter="addEntry">
        <button class="btn primary" @click="addEntry">添加</button>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">词条列表 <span class="count">{{ entries.length }} 条</span></h3>
      <div v-if="entries.length === 0" class="empty">暂无词条。添加常用专有名词可提高语音识别准确率。</div>
      <div v-for="entry in entries" :key="entry.id" class="entry-row">
        <div class="entry-word">{{ entry.word }}</div>
        <span class="entry-arrow">→</span>
        <div class="entry-replacement">{{ entry.replacement }}</div>
        <button class="btn-icon" @click="removeEntry(entry.id)">✕</button>
      </div>
    </section>

    <p class="footnote">词典数据保存在本地，后续版本将支持 iCloud 同步。{{ saving ? '正在保存…' : '' }}</p>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-title { margin: 0; font-size: 22px; font-weight: 700; color: rgba(38, 24, 16, 0.94); }
.page-desc { margin: 0; font-size: 14px; color: rgba(84, 62, 49, 0.7); }
.card { padding: 4px 0; border-radius: 16px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(92, 54, 28, 0.06); overflow: hidden; }
.card-title { margin: 0; padding: 16px 20px 8px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(112, 72, 46, 0.6); display: flex; align-items: baseline; gap: 8px; }
.count { font-size: 11px; font-weight: 400; color: rgba(84, 62, 49, 0.5); }

.add-row { display: flex; gap: 10px; padding: 12px 20px 16px; }

.input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(92, 54, 28, 0.1);
  background: rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 13px;
  color: rgba(38, 24, 16, 0.82);
  outline: none;
}
.input:focus { border-color: rgba(91, 62, 168, 0.4); }

.btn {
  border: 0;
  border-radius: 10px;
  padding: 10px 18px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn.primary {
  color: #fff;
  background: linear-gradient(135deg, #5b3ea8, #3d2a72);
  box-shadow: 0 4px 12px rgba(61, 42, 114, 0.2);
}

.entry-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-top: 1px solid rgba(92, 54, 28, 0.05);
}

.entry-word { font-size: 14px; font-weight: 500; color: rgba(38, 24, 16, 0.88); min-width: 100px; }
.entry-arrow { font-size: 12px; color: rgba(84, 62, 49, 0.4); }
.entry-replacement { flex: 1; font-size: 14px; color: rgba(84, 62, 49, 0.72); }

.btn-icon {
  border: 0;
  background: none;
  color: rgba(84, 62, 49, 0.4);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.btn-icon:hover { background: rgba(210, 80, 60, 0.08); color: #d25040; }

.empty { padding: 20px; text-align: center; font-size: 13px; color: rgba(84, 62, 49, 0.5); }
.footnote { margin: 0; font-size: 12px; color: rgba(84, 62, 49, 0.5); }
</style>

<script setup lang="ts">
import { ref } from 'vue'

interface HistoryItem {
  id: number
  text: string
  targetApp: string
  time: string
  writtenBack: boolean
}

const items = ref<HistoryItem[]>([
  { id: 1, text: '这是一段测试语音输入的文本示例。', targetApp: 'TextEdit', time: '刚刚', writtenBack: true },
  { id: 2, text: '我想让它可以在任何应用里使用。', targetApp: '备忘录', time: '2 分钟前', writtenBack: true },
  { id: 3, text: '明天下午三点开会，记得提前准备材料。', targetApp: 'Cursor', time: '5 分钟前', writtenBack: false },
])

function copyText(text: string) {
  navigator.clipboard.writeText(text)
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">历史记录</h2>
    <p class="page-desc">最近的语音转写结果。</p>

    <section class="card">
      <h3 class="card-title">最近转写 <span class="count">{{ items.length }} 条</span></h3>
      <div v-if="items.length === 0" class="empty">暂无转写记录。按 Fn 开始第一次语音输入。</div>
      <div v-for="item in items" :key="item.id" class="history-row">
        <div class="history-main">
          <p class="history-text">{{ item.text }}</p>
          <div class="history-meta">
            <span class="meta-app">{{ item.targetApp }}</span>
            <span class="meta-dot">·</span>
            <span class="meta-time">{{ item.time }}</span>
            <span v-if="item.writtenBack" class="meta-badge ok">已写回</span>
            <span v-else class="meta-badge pending">未写回</span>
          </div>
        </div>
        <button class="btn-copy" @click="copyText(item.text)">复制</button>
      </div>
    </section>

    <p class="footnote">历史记录存储在本地，重启后保留。后续版本将支持搜索和筛选。</p>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-title { margin: 0; font-size: 22px; font-weight: 700; color: rgba(38, 24, 16, 0.94); }
.page-desc { margin: 0; font-size: 14px; color: rgba(84, 62, 49, 0.7); }
.card { padding: 4px 0; border-radius: 16px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(92, 54, 28, 0.06); overflow: hidden; }
.card-title { margin: 0; padding: 16px 20px 8px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(112, 72, 46, 0.6); display: flex; align-items: baseline; gap: 8px; }
.count { font-size: 11px; font-weight: 400; color: rgba(84, 62, 49, 0.5); }

.history-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 20px;
  border-top: 1px solid rgba(92, 54, 28, 0.05);
}

.history-main { flex: 1; }

.history-text {
  margin: 0;
  font-size: 14px;
  color: rgba(38, 24, 16, 0.88);
  line-height: 1.5;
}

.history-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: rgba(84, 62, 49, 0.5);
}

.meta-dot { opacity: 0.4; }

.meta-badge {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.meta-badge.ok {
  background: rgba(61, 136, 90, 0.1);
  color: #3d885a;
}

.meta-badge.pending {
  background: rgba(210, 122, 44, 0.1);
  color: #d27a2c;
}

.btn-copy {
  border: 0;
  border-radius: 8px;
  padding: 6px 12px;
  font: inherit;
  font-size: 12px;
  color: rgba(56, 36, 24, 0.72);
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(92, 54, 28, 0.08);
  cursor: pointer;
  white-space: nowrap;
}

.btn-copy:hover { background: rgba(255, 255, 255, 1); }

.empty {
  padding: 30px 20px;
  text-align: center;
  font-size: 13px;
  color: rgba(84, 62, 49, 0.5);
}

.footnote { margin: 0; font-size: 12px; color: rgba(84, 62, 49, 0.5); }
</style>

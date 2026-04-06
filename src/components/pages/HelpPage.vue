<template>
  <div class="page">
    <h2 class="page-title">帮助</h2>
    <p class="page-desc">排查常见问题，获取支持信息。</p>

    <section class="card">
      <h3 class="card-title">权限排查</h3>
      <div class="help-item">
        <p class="help-q">按 Fn 没反应？</p>
        <p class="help-a">确认「辅助功能」和「输入监控」都已在系统设置中开启。如果刚开启，可能需要重启应用。</p>
      </div>
      <div class="divider" />
      <div class="help-item">
        <p class="help-q">波浪出来了但没有识别到文字？</p>
        <p class="help-a">确认「麦克风」和「语音识别」权限已放行。检查系统偏好设置中麦克风输入设备是否正确（蓝牙耳机可能切断内建麦克风）。</p>
      </div>
      <div class="divider" />
      <div class="help-item">
        <p class="help-q">文字没有写回到目标应用？</p>
        <p class="help-a">写回依赖「辅助功能」权限进行 Cmd+V 模拟。如果目标应用不支持标准粘贴，写回可能失败。可在历史页复制文本手动粘贴。</p>
      </div>
      <div class="divider" />
      <div class="help-item">
        <p class="help-q">每次只有第一轮能用，之后就卡住？</p>
        <p class="help-a">已知多轮识别时音频引擎状态可能残留。尝试重启应用；如果频繁发生，请反馈给我们。</p>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">快捷键说明</h3>
      <div class="key-row">
        <div class="key-combo"><span class="key">Fn</span></div>
        <p class="key-desc">开始 / 停止语音输入</p>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">关于</h3>
      <div class="about-grid">
        <div class="about-item">
          <p class="about-label">版本</p>
          <p class="about-value">v0.1.0</p>
        </div>
        <div class="about-item">
          <p class="about-label">框架</p>
          <p class="about-value">Tauri 2 + Vue 3</p>
        </div>
        <div class="about-item">
          <p class="about-label">识别引擎</p>
          <p class="about-value">Speech.framework + Whisper</p>
        </div>
        <div class="about-item">
          <p class="about-label">反馈</p>
          <p class="about-value link">github.com/kexin94yyds/mac-speech</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-title { margin: 0; font-size: 22px; font-weight: 700; color: rgba(38, 24, 16, 0.94); }
.page-desc { margin: 0; font-size: 14px; color: rgba(84, 62, 49, 0.7); }
.card { padding: 4px 0; border-radius: 16px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(92, 54, 28, 0.06); overflow: hidden; }
.card-title { margin: 0; padding: 16px 20px 8px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(112, 72, 46, 0.6); }
.divider { height: 1px; margin: 0 20px; background: rgba(92, 54, 28, 0.06); }

.help-item { padding: 14px 20px; }
.help-q { margin: 0; font-size: 14px; font-weight: 600; color: rgba(38, 24, 16, 0.88); }
.help-a { margin: 6px 0 0; font-size: 13px; color: rgba(84, 62, 49, 0.68); line-height: 1.6; }

.key-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
}

.key {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(38, 24, 16, 0.82);
  background: rgba(250, 245, 238, 0.9);
  border: 1px solid rgba(92, 54, 28, 0.1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
}

.key-desc { margin: 0; font-size: 14px; color: rgba(84, 62, 49, 0.72); }

.about-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

.about-item {
  padding: 12px 20px;
  border-top: 1px solid rgba(92, 54, 28, 0.04);
}

.about-label { margin: 0; font-size: 12px; color: rgba(84, 62, 49, 0.5); }
.about-value { margin: 4px 0 0; font-size: 14px; font-weight: 500; color: rgba(38, 24, 16, 0.88); }
.link { color: #5b3ea8; }
</style>

<script setup lang="ts">
import { ref } from 'vue'

const plan = ref('免费版')
const deviceName = ref('MacBook Air')
const activationStatus = ref('未激活')
</script>

<template>
  <div class="page">
    <h2 class="page-title">账户</h2>
    <p class="page-desc">管理激活状态和设备信息。</p>

    <section class="card">
      <h3 class="card-title">当前套餐</h3>
      <div class="plan-row">
        <div class="plan-badge">{{ plan }}</div>
        <div>
          <p class="plan-label">{{ activationStatus }}</p>
          <p class="plan-desc">使用激活码解锁完整功能，支持多设备。</p>
        </div>
        <button class="btn primary">输入激活码</button>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">设备信息</h3>
      <div class="info-row">
        <p class="info-label">设备名称</p>
        <p class="info-value">{{ deviceName }}</p>
      </div>
      <div class="divider" />
      <div class="info-row">
        <p class="info-label">应用版本</p>
        <p class="info-value">v0.1.0</p>
      </div>
      <div class="divider" />
      <div class="info-row">
        <p class="info-label">Bundle ID</p>
        <p class="info-value mono">xin.iterate.speech</p>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">购买</h3>
      <div class="purchase-row">
        <p class="purchase-desc">从官网购买永久授权或订阅，获取激活码后在上方输入。</p>
        <button class="btn ghost">前往官网</button>
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

.plan-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px 18px;
}

.plan-badge {
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  color: rgba(45, 28, 72, 0.92);
  background: linear-gradient(135deg, rgba(91, 62, 168, 0.14), rgba(61, 42, 114, 0.08));
  border: 1px solid rgba(91, 62, 168, 0.22);
}

.plan-label { margin: 0; font-size: 14px; font-weight: 500; color: rgba(38, 24, 16, 0.88); }
.plan-desc { margin: 3px 0 0; font-size: 12px; color: rgba(84, 62, 49, 0.58); flex: 1; }

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
}

.info-label { margin: 0; font-size: 14px; color: rgba(84, 62, 49, 0.72); }
.info-value { margin: 0; font-size: 14px; font-weight: 500; color: rgba(38, 24, 16, 0.88); }
.mono { font-family: "SF Mono", "Fira Code", monospace; font-size: 13px; }

.divider { height: 1px; margin: 0 20px; background: rgba(92, 54, 28, 0.06); }

.purchase-row { padding: 14px 20px 18px; }
.purchase-desc { margin: 0 0 12px; font-size: 13px; color: rgba(84, 62, 49, 0.65); line-height: 1.5; }

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
  margin-left: auto;
}

.btn.ghost {
  color: rgba(56, 36, 24, 0.82);
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(92, 54, 28, 0.1);
}
</style>

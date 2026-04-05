# iterate-speech

一个独立的桌面语音输入器骨架项目。

## 定位

- 形态：Tauri + Vue 桌面应用
- 目标：先做本 App 内可控的语音输入 MVP
- 核心：语音会话管理、partial/final 回写、肌肉记忆预留

## 第一版范围

- 圆形麦克风按钮
- 录音状态展示
- partial / final 文本展示区
- 本地输入框
- 语音 session 边界管理

## 暂不进入

- 系统级全局输入注入
- 复杂语音命令
- 长时间连续听写
- 云端识别依赖

## 目录

- `src/`：前端壳子
- `src-tauri/`：桌面主进程
- `docs/`：架构与阶段计划

## 下一步

1. 接入本地录音能力
2. 增加 speech engine adapter
3. 实现 voice session manager
4. 接入肌肉记忆数据结构

# iterate-speech 架构草案

## 模块

- `Audio Capture Layer`
- `Speech Engine Adapter`
- `Voice Session Manager`
- `Input Composer`
- `Speech Muscle Memory Adapter`

## 关键约束

- partial 只能替换当前语音段
- final 只有在 session 仍有效时才允许提交
- 用户改光标、重新录音、发送消息时，旧 session 立即失效

## 推荐顺序

1. 本地录音
2. 文本回写
3. session 取消
4. 肌肉记忆复用

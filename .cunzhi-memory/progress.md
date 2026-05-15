# iterate-speech Progress

## 2026-05-15 语音共享库闭环进度

- Relearn 目标：让 iterate 语音桌面和手机同步，知道用户常用词，并形成本地肌肉记忆库。
- 当前共享锚点：`~/.cunzhi/speech-muscle-memory.json`。
- 当前验证词：`派发 -> pai`，Mac bridge `GET /api/speech-muscle-memory` 返回正常，`trainingCount = 5`。
- 桌面端：`/Applications/iterate-speech.app` 已覆盖为新构建版本，旧版备份在 `/Applications/iterate-speech.app.backup-20260515-210037`。
- 桌面端状态：用户确认 `pai` 可以，说明桌面 `派发 -> pai` 主验收已通过。
- 桌面端日志能力：`src-tauri/src/main.rs` 和 `src/composables/useSpeechOverlay.ts` 已加入共享库/词典合并日志，并被自动 checkpoint commit `b9512df` 收录。
- iOS Native：`ContentView.swift` / `NativeMainPageView.swift` 已补只读远端同步路径；启动、回前台、打开肌肉记忆库、录音前都会尝试从 Mac bridge 拉取并合并。
- iOS 验证：`generic/platform=iOS Simulator` build 成功；device build 仍受 Xcode/CoreSimulator runtime 注册问题影响，详见 `P-2026-1417`。
- 尚未完成：iOS 真机/模拟器中实际说 `派发` 并输出 `pai`；iOS 本地训练双向写回 Mac；桌面原生 ASR contextual hints；完整 Typeless-like 系统级输入。

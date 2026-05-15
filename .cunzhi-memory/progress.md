# iterate-speech Progress

## 2026-05-15 语音共享库闭环进度

- Relearn 目标：让 iterate 语音桌面和手机同步，知道用户常用词，并形成本地肌肉记忆库。
- 当前共享锚点：`~/.cunzhi/speech-muscle-memory.json`。
- 当前验证词：`派发 -> pai`，Mac bridge `GET /api/speech-muscle-memory` 返回正常，`trainingCount = 5`。
- 桌面端：`/Applications/iterate-speech.app` 已覆盖为新构建版本，旧版备份在 `/Applications/iterate-speech.app.backup-20260515-210037`。
- 桌面端状态：用户确认 `pai` 可以，说明桌面 `派发 -> pai` 主验收已通过。
- 桌面端日志能力：`src-tauri/src/main.rs` 和 `src/composables/useSpeechOverlay.ts` 已加入共享库/词典合并日志，并被自动 checkpoint commit `b9512df` 收录。
- 桌面端确定性替换：`src/composables/useSpeechOverlay.ts` 已在 Ollama 前加入精确肌肉记忆命中；`trainingCount >= 4` 的共享词（如 `派发 -> pai`）会直接输出目标文本并跳过 Ollama。Release 包已覆盖 `/Applications/iterate-speech.app`，旧版备份在 `/Applications/iterate-speech.app.backup-20260516-065930`，安装二进制 hash 为 `addd02f5e5037d011019f3e82fc8b056b201fd2fb26e327f135b33edaddd65e0`。
- 桌面端速度优化：macOS Speech bridge 已接入 `contextualStrings` 和 `addsPunctuation`；前端启动录音前会把个人词典/肌肉记忆短语传入原生识别。短句快通道默认开启，短命令/短消息会跳过 `qwen3:14b`；通用设置页可关闭。Ollama 返回的 `total/load/prompt/eval` duration 已写入 debug log。Release 包已覆盖 `/Applications/iterate-speech.app`，旧版备份在 `/Applications/iterate-speech.app.backup-20260516-071327`，安装二进制 hash 为 `6ff7fdc09d525e8f2bbff485fded35c83419931d82e1fc74029f6047fe3afbbe`。
- iOS Native：`ContentView.swift` / `NativeMainPageView.swift` 已补只读远端同步路径；启动、回前台、打开肌肉记忆库、录音前都会尝试从 Mac bridge 拉取并合并。
- iOS 验证：`generic/platform=iOS Simulator` build 成功；device build 仍受 Xcode/CoreSimulator runtime 注册问题影响，详见 `P-2026-1417`。
- 尚未完成：iOS 真机/模拟器中实际说 `派发` 并输出 `pai`；iOS 本地训练双向写回 Mac；桌面原生 ASR contextual hints；完整 Typeless-like 系统级输入。

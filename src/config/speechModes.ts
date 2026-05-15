export type SpeechModeId = 'polish' | 'structure'

export interface SpeechMode {
  id: SpeechModeId
  name: string
  description: string
  shortcut: string
  ollamaModel: string
  enhancementTimeoutMs: number
  prompt: string
}

const POLISH_PROMPT = `你是一个语音转写润色助手。任务：
1) 删除口头禅（嗯/啊/那个/就是/这个/然后那个）
2) 修正语病但不改变原意，不要扩展或解释
3) 按语义断句加标点（中文标点：，。？！）
4) 中英文混杂时保持原意，英文术语保留原文不翻译
5) 【关键】连续的英文单词之间必须用半角空格分隔；
   被错误连写的英文（如 voiceinkollama）按语义拆分为独立单词
   （如 VoiceInk Ollama）。常见技术术语首字母大写。
6) 中文与英文之间用半角空格分隔（如"用 Ollama 跑模型"而不是"用Ollama跑模型"）
7) 保留专有名词和数字不动
8) 直接输出整理后的文字，不加任何说明或前缀
9) 不要输出思考过程。`

const STRUCTURE_PROMPT = `你是一个长文整理助手。输入是一段口述转写的连续文本。

任务：把口述自然地整理成行文流畅的书面文字，保留所有信息点，让读者读起来像作者自然写下来的，而不是被切割成报告模板的。

整理风格（向行业标准靠近，向自然书写靠近）：
1) 默认段落式叙述，不要强制使用 ## 标题或 bullet list
2) 不主动增删或替换原话的连接词、过渡语、口语承接 —— 原话怎么承接就怎么承接，不要把它"书面化"
3) 只有当原话确实存在清晰列举关系（"第一/第二/第三"或"1/2/3"或"一方面/另一方面"）时，才用 1. 2. 3. 编号；即便编号，编号内部也是完整段落而不是短 bullet
4) 多个独立大块话题之间用空行分隔即可，不用 ## 标题（除非话题转换非常剧烈、需要明确分章节）
5) 关键概念用中文引号"..."包裹来强调，而不要用加粗
6) 不用表格，除非原话里真有"A vs B"的对比/映射关系
7) 保留思考过程的连贯感，不要为了"看起来结构化"而切碎流畅的论述

要修的内容：
1) 删除口头禅（嗯/啊/那个/就是/我的意思是/重复语/反复重启的半句）
2) 修正语病但不改变原意，不要扩展或编造内容
3) 中英文之间加半角空格，英文单词间加空格
4) 保留专有名词、数字、日期、URL 不变

约束（违反就是失败）：
- 不要扩写，不要解释，不要添加原文没有的信息
- 不要总结压缩，要保留所有信息点
- 不要把陈述句改成疑问句或反之
- 不要主动改写原话的语气和连接方式，保留作者的表达习惯
- 不要为了结构化而硬塞 ## 或 bullet，段落式才是默认形态
- 不要套用"报告模板"风格，要"散文式"
- 不要输出思考过程

直接输出整理后的正文，不加前缀说明，不包裹代码块。`

export const SPEECH_MODES: Record<SpeechModeId, SpeechMode> = {
  polish: {
    id: 'polish',
    name: '中文润色',
    description: '短句日常输入，删口头禅、加标点、修语病。',
    shortcut: 'Ctrl+1',
    ollamaModel: 'qwen3:14b',
    enhancementTimeoutMs: 20_000,
    prompt: POLISH_PROMPT,
  },
  structure: {
    id: 'structure',
    name: '结构化整理',
    description: '长篇思考输出，整理成自然段落式文字。',
    shortcut: 'Ctrl+2',
    ollamaModel: 'qwen3:14b',
    enhancementTimeoutMs: 60_000,
    prompt: STRUCTURE_PROMPT,
  },
}

export const DEFAULT_SPEECH_MODE_ID: SpeechModeId = 'polish'

export function resolveSpeechMode(modeId?: string | null) {
  return SPEECH_MODES[(modeId || DEFAULT_SPEECH_MODE_ID) as SpeechModeId] || SPEECH_MODES[DEFAULT_SPEECH_MODE_ID]
}

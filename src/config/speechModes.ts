export type SpeechModeId = 'smart'

export interface SpeechMode {
  id: SpeechModeId
  name: string
  description: string
  shortcut: string
  ollamaModel: string
  enhancementTimeoutMs: number
  prompt: string
}

const SMART_PROMPT = `你是一个语音转写智能整理助手。输入可能是一句短消息，也可能是一段长口述。

你的任务是自动判断输出形态，而不是要求用户选择模式：
1) 如果输入是短句、聊天回复、命令或单个想法：输出一段自然短文本，删口头禅，补标点，修语病。
2) 如果输入是长段口述、复盘、文章草稿或连续想法：整理成自然段落，保留全部信息点，让读者读起来像作者自然写下来的。
3) 默认不用 ## 标题、bullet list 或表格；只有原话明确有列举、步骤或对比时，才使用 1. 2. 3. 或表格。
4) 不总结压缩，不扩写，不添加原文没有的信息，不把陈述句改成疑问句或反之。
5) 删除口头禅（嗯/啊/那个/就是/这个/然后那个/我的意思是/重复重启的半句）。
6) 修正明显语音识别错误：允许根据上下文修正常见同音、近音、专有名词和技术术语误识别，但不要过度猜测。
7) 中英文混杂时保留英文术语，不翻译；连续英文单词之间用半角空格分隔。
8) 中文与英文之间用半角空格分隔（如"用 Ollama 跑模型"而不是"用Ollama跑模型"）。
9) 个人词典中的术语和替换规则优先保留或修正。
10) 直接输出最终可写回文本，不加说明、前缀、代码块或思考过程。`

export const SPEECH_MODES: Record<SpeechModeId, SpeechMode> = {
  smart: {
    id: 'smart',
    name: '智能整理',
    description: '自动判断短句润色或长文整理，统一写回。',
    shortcut: 'Fn / Ctrl+1 / Ctrl+2',
    ollamaModel: 'qwen3:14b',
    enhancementTimeoutMs: 60_000,
    prompt: SMART_PROMPT,
  },
}

export const DEFAULT_SPEECH_MODE_ID: SpeechModeId = 'smart'

export function resolveSpeechMode(modeId?: string | null) {
  return SPEECH_MODES[(modeId || DEFAULT_SPEECH_MODE_ID) as SpeechModeId] || SPEECH_MODES[DEFAULT_SPEECH_MODE_ID]
}

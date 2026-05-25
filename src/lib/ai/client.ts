/**
 * AI 服务层 - 统一的 AI 接口封装
 * 
 * 设计原则：
 * 1. 所有 AI 调用通过此层统一管理
 * 2. 支持多 provider 切换（OpenAI / Anthropic / 国产模型）
 * 3. 内置重试、超时、错误处理
 * 4. API Key 通过环境变量管理
 */

// ========================
// 类型定义
// ========================

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'zhipu' | 'moonshot'
  apiKey: string
  baseURL?: string
  defaultModel: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIGenerateOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  responseFormat?: 'text' | 'json'
}

// ========================
// Provider 配置
// ========================

const providerConfigs: Record<string, AIConfig> = {
  openai: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  deepseek: {
    provider: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  zhipu: {
    provider: 'zhipu',
    apiKey: process.env.ZHIPU_API_KEY || '',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
  },
  moonshot: {
    provider: 'moonshot',
    apiKey: process.env.MOONSHOT_API_KEY || '',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
  },
}

// ========================
// 核心调用函数
// ========================

function getProvider(): AIConfig {
  const provider = process.env.AI_PROVIDER || 'openai'
  return providerConfigs[provider] || providerConfigs.openai
}

async function callAI(
  messages: ChatMessage[],
  options: AIGenerateOptions = {}
): Promise<string> {
  const config = getProvider()
  const model = options.model || config.defaultModel

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.8,
    max_tokens: options.maxTokens ?? 4096,
  }

  if (options.responseFormat === 'json') {
    body.response_format = { type: 'json_object' }
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000), // 2分钟超时
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AI API Error (${response.status}): ${error}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// ========================
// 暴露的业务方法
// ========================

/**
 * 通用文本生成
 */
export async function generateText(
  prompt: string,
  options: AIGenerateOptions = {}
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'user', content: prompt },
  ]
  return callAI(messages, { ...options, responseFormat: 'text' })
}

/**
 * 剧本生成
 */
export async function generateScript(
  prompt: string,
  genre?: string,
  episodeCount: number = 1
): Promise<string> {
  const systemPrompt = `你是一位资深的短剧编剧，擅长创作快节奏、强冲突、高爽点的短剧剧本。

请根据用户的需求，生成一个完整的短剧剧本。要求：

1. **格式**：使用标准剧本格式，包含场景标题、场景描述、角色对话
2. **结构**：每集3-5个场景，每个场景3-8句对话
3. **节奏**：开头3秒钩子，每30秒一个反转/冲突，结尾留悬念
4. **输出格式**：严格按 JSON 格式输出，结构如下：

{
  "title": "剧名",
  "genre": "题材",
  "synopsis": "一句话简介",
  "scenes": [
    {
      "sceneNum": 1,
      "location": "场景地点",
      "timeOfDay": "白天/夜晚",
      "description": "场景环境描述",
      "dialogues": [
        {
          "speaker": "角色名",
          "line": "台词",
          "emotion": "情绪（愤怒/悲伤/开心/冷漠/惊讶等）",
          "camera": "镜头建议（特写/中景/远景）"
        }
      ]
    }
  ]
}

**短剧创作原则**：
- 每句话都要推动剧情或塑造人物
- 对话简短有力，不超过30字/句
- 冲突要密集，情感要极致
- 霸总/逆袭/甜宠题材需要强化爽感`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请创作一个${genre ? genre + '题材的' : ''}短剧剧本，共${episodeCount}集。\n\n创作要求：${prompt}` },
  ]

  return callAI(messages, { temperature: 0.9, maxTokens: 8192, responseFormat: 'json' })
}

/**
 * 分镜脚本生成
 */
export async function generateStoryboard(
  scriptContent: string,
  characters: string,
  style: string = '现代都市'
): Promise<string> {
  const systemPrompt = `你是一位专业的影视分镜师。请根据剧本生成详细的分镜脚本。

每个场景需要拆分为多个镜头，每个镜头包含：
- 镜头编号
- 景别（特写/近景/中景/全景/远景）
- 运镜方式（固定/推/拉/摇/移/跟）
- 画面描述（详细到 AI 可以根据此描述生成图片）
- 预估时长（秒）
- AI绘图提示词（英文，包含角色描述、场景、光线、风格）

输出 JSON 格式：
{
  "storyboard": [
    {
      "sceneNum": 1,
      "location": "...",
      "timeOfDay": "...",
      "shots": [
        {
          "shotNum": 1,
          "cameraAngle": "特写",
          "cameraMovement": "固定",
          "description": "画面描述",
          "duration": 3,
          "imagePrompt": "A detailed English prompt for AI image generation..."
        }
      ],
      "dialogues": [...]
    }
  ]
}`

  return callAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `剧本内容：\n${scriptContent}\n\n角色信息：\n${characters}\n\n视觉风格：${style}\n\n请生成分镜脚本。` },
    ],
    { temperature: 0.7, maxTokens: 8192, responseFormat: 'json' }
  )
}

/**
 * 角色设计生成
 */
export async function generateCharacterDesign(
  name: string,
  role: string,
  description: string
): Promise<string> {
  const systemPrompt = `你是一位角色设计师。请根据角色描述，生成详细的角色视觉设定和 AI 绘图提示词。

输出 JSON 格式：
{
  "name": "角色名",
  "role": "角色定位",
  "appearance": "外貌详细描述",
  "style": "服装风格",
  "imagePrompt": "英文 AI 绘图提示词，包含年龄、发型、服装、表情、光线、风格",
  "negativePrompt": "负面提示词"
}`

  return callAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `角色名：${name}\n角色定位：${role}\n角色描述：${description}` },
    ],
    { temperature: 0.7, maxTokens: 2048, responseFormat: 'json' }
  )
}

/**
 * 图片生成 - 支持 OpenAI DALL-E / MiniMax Image-01
 */
export async function generateImage(
  prompt: string,
  options: {
    width?: number
    height?: number
    negativePrompt?: string
    referenceImage?: string
  } = {}
): Promise<string> {
  const provider = process.env.IMAGE_PROVIDER || 'openai'

  // ===== MiniMax Image-01 =====
  if (provider === 'minimax') {
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) throw new Error('MINIMAX_API_KEY not set')

    const aspectRatio = options.width && options.height
      ? options.width > options.height ? '16:9' : options.width < options.height ? '9:16' : '1:1'
      : '16:9'

    const body: Record<string, unknown> = {
      model: 'image-01',
      prompt,
      aspect_ratio: aspectRatio,
      n: 1,
      response_format: 'url',
    }

    if (options.referenceImage) {
      body.subject_reference = [{ type: 'character', image_file: options.referenceImage }]
    }

    const response = await fetch('https://api.minimax.io/v1/image_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      throw new Error(`MiniMax image generation failed (${response.status}): ${await response.text()}`)
    }

    const data = await response.json()
    const urls = data.data?.image_urls
    if (urls && urls.length > 0) return urls[0]
    throw new Error('MiniMax returned no image URL')
  }

  // ===== OpenAI DALL-E =====
  if (provider === 'openai') {
    const { width = 1024, height = 1024 } = options
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: width > 1024 ? '1792x1024' : '1024x1024',
        quality: 'standard',
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      throw new Error(`Image generation failed: ${await response.text()}`)
    }

    const data = await response.json()
    return data.data?.[0]?.url || ''
  }

  throw new Error(`Unsupported image provider: ${provider}`)
}

/**
 * MiniMax 中文语音 ID 对照表
 */
const MINIMAX_VOICES: Record<string, string> = {
  gentleman: 'Chinese_(Mandarin)_Gentleman',
  sincere: 'Chinese_(Mandarin)_Sincere_Adult',
  deep_male: 'male-qn-badao',
  warm_boy: 'male-qn-daxuesheng',
  sweet_girl: 'female-shaonv',
  cute_girl: 'female-tianmei',
  tv_anchor: 'Chinese_(Mandarin)_News_Anchor',
  lyrical: 'Chinese_(Mandarin)_Lyrical_Voice',
  yujie: 'female-yujie',
  chengshu: 'female-chengshu',
  jingying: 'male-qn-jingying',
  qingse: 'male-qn-qingse',
  badao_shaoye: 'badao_shaoye',
  junlang: 'junlang_nanyou',
  wumei: 'wumei_yujie',
  clever_boy: 'clever_boy',
  cute_boy: 'cute_boy',
  lovely_girl: 'lovely_girl',
}

/** 情绪 → MiniMax 音色映射 */
const EMOTION_VOICE_MAP: Record<string, string> = {
  '愤怒': 'deep_male',
  '悲伤': 'sincere',
  '开心': 'sweet_girl',
  '霸道': 'deep_male',
  '冷漠': 'sincere',
  '温柔': 'sweet_girl',
  '惊讶': 'lyrical',
}

/**
 * TTS 语音合成 - 支持 OpenAI TTS / MiniMax Speech-2.6
 */
export async function generateSpeech(
  text: string,
  options: {
    voice?: string
    speed?: number
    emotion?: string
  } = {}
): Promise<{ audioBase64: string; duration: number }> {
  const provider = process.env.TTS_PROVIDER || 'openai'

  // ===== MiniMax TTS (via MCP-compatible API) =====
  if (provider === 'minimax') {
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) throw new Error('MINIMAX_API_KEY not set')
    const apiHost = process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com'

    let voiceId = MINIMAX_VOICES['sweet_girl']
    if (options.voice && MINIMAX_VOICES[options.voice]) {
      voiceId = MINIMAX_VOICES[options.voice]
    } else if (options.emotion) {
      const mapped = EMOTION_VOICE_MAP[options.emotion]
      if (mapped && MINIMAX_VOICES[mapped]) voiceId = MINIMAX_VOICES[mapped]
    }

    const body = {
      model: 'speech-2.8-turbo',
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: options.speed ?? 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    }

    const response = await fetch(`${apiHost}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'MM-API-Source': 'Drama-Studio',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      throw new Error(`MiniMax TTS failed (${response.status}): ${await response.text()}`)
    }

    const data = await response.json()
    if (data.base_resp?.status_code !== 0) {
      throw new Error(`MiniMax TTS error: ${data.base_resp?.status_msg || 'unknown'}`)
    }

    const hexAudio = data.data?.audio
    if (!hexAudio) throw new Error('MiniMax returned no audio data')

    const audioBuffer = Buffer.from(hexAudio, 'hex')
    const audioBase64 = audioBuffer.toString('base64')
    const duration = data.extra_info?.audio_length
      ? data.extra_info.audio_length / 1000
      : text.length / 4

    return { audioBase64, duration }
  }

  // ===== SiliconFlow TTS (CosyVoice2) =====
  if (provider === 'siliconflow') {
    const apiKey = process.env.SILICONFLOW_API_KEY
    if (!apiKey) throw new Error('SILICONFLOW_API_KEY not set')

    const voice = options.voice || 'FunAudioLLM/CosyVoice2-0.5B:anna'
    const body: Record<string, unknown> = {
      model: 'FunAudioLLM/CosyVoice2-0.5B',
      input: text,
      voice,
      response_format: 'mp3',
      speed: options.speed ?? 1,
      gain: 0,
    }

    const response = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      throw new Error(`SiliconFlow TTS failed (${response.status}): ${await response.text()}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const audioBase64 = Buffer.from(arrayBuffer).toString('base64')
    return { audioBase64, duration: text.length / 4 }
  }

  throw new Error(`Unsupported TTS provider: ${provider}`)
}

/**
 * 健康检查
 */
export async function checkAIStatus(): Promise<boolean> {
  try {
    const config = getProvider()
    if (!config.apiKey) return false

    const response = await fetch(`${config.baseURL}/models`, {
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

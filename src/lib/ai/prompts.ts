/**
 * 提示词模板 — 按模型分组的 prompt 构建工厂
 * 
 * 每个模型有不同的 prompt 格式和最佳实践，此处统一管理。
 */

// ========================
// 模板类型
// ========================

export interface ImagePromptContext {
  shotType?: "wide" | "medium" | "close"
  sceneSummary?: string
  sceneLocation?: string
  characterDesc?: string
  styleDesc?: string
}

export interface VideoPromptContext {
  sceneDesc: string       // DeepSeek 场景描述
  motionDesc?: string     // 用户输入的动效描述
  shotType?: string       // 景别
}

export interface ScriptPromptContext {
  logline: string
  sceneOutlines: string
  characters: string
}

export interface DialogueExtractionContext {
  fullScript: string
  charactersDesc: string
}

export interface CharacterDesignContext {
  name: string
  description: string
  storyContext: string
}

export interface CharacterInferenceContext {
  names: string[]
  scriptContext: string
}

// ========================
// MiniMax Image-01 图片提示词
// ========================

export function buildMiniMaxImagePrompt(ctx: ImagePromptContext): string {
  const parts: string[] = []

  if (ctx.shotType) {
    const framing: Record<string, string> = {
      wide: "full body shot, wide angle lens, entire room visible, characters small in frame",
      medium: "waist-up framing, characters occupy half of frame height, medium focal length",
      close: "close-up, head and shoulders, shallow depth of field, blurred background",
    }
    parts.push(framing[ctx.shotType] || ctx.shotType)
  }

  if (ctx.sceneLocation) parts.push(`location: ${ctx.sceneLocation}`)
  if (ctx.sceneSummary) parts.push(ctx.sceneSummary.slice(0, 150))

  if (ctx.characterDesc) {
    parts.push(`characters: ${ctx.characterDesc}`)
  }

  parts.push("Asian drama cinematography, photorealistic, cinematic lighting, 16:9")
  if (ctx.styleDesc) parts.push(ctx.styleDesc)

  return parts.join(", ")
}

// ========================
// DeepSeek 文本提示词
// ========================

export const DEEPSEEK_SCRIPT_SYSTEM = `你是专业网络小说作家，擅长快节奏、强冲突、高爽点的短篇小说。
- 第三人称叙述 + 自然嵌入对话，不要用剧本格式
- ⚠️ 场景总数与大纲完全一致，大纲N个场景就输出N个===SCENE===块，禁止新增/合并/跳过
- ⚠️ 每个 ===SCENE N=== 块的汉字数在 200-400 字之间，少于200描写不足，超400拖沓冗余
- 对话用中文引号""直接引用
- 段与段之间空一行，每段2-4句话
- 快节奏，避免拖沓环境描写
- 场景以 ===SCENE N=== 分隔，编号从1连续递增`

export function buildDeepSeekScriptPrompt(ctx: ScriptPromptContext): string {
  return [
    DEEPSEEK_SCRIPT_SYSTEM,
    `简介：${ctx.logline}`,
    `【分场大纲 - 必须逐条编写】\n${ctx.sceneOutlines}`,
    `【角色信息】\n${ctx.characters}`,
  ].join("\n\n")
}

export const DEEPSEEK_CHARACTER_TURNAROUND_SYSTEM = `你是角色概念设计师。根据角色属性卡和故事背景，生成一段英文角色外貌描述用于AI生图。

要求：
1. 纯英文，不含中文
2. 故事背景用于判断时代/风格基调
3. 描述：年龄感、脸型五官、发型发色、身高体态、服装款式颜色材质（符合时代）、配饰鞋子
4. 禁止硬汉/肌肉/战士等不符合故事类型的描述——严格根据属性卡
5. 控制在250字符以内
6. 直接输出纯文本`

export function buildDeepSeekCharacterTurnaroundPrompt(ctx: CharacterDesignContext): { system: string; user: string } {
  return {
    system: DEEPSEEK_CHARACTER_TURNAROUND_SYSTEM,
    user: `【故事背景】\n${ctx.storyContext}\n\n【角色属性卡】\n${ctx.description}`,
  }
}

export const DEEPSEEK_SCENE_SHOT_SYSTEM = `你是专业分镜师和AI绘图提示词专家。根据场景描述、镜头类型、出场角色和故事背景，生成英文绘图提示词。

要求：
1. 纯英文，250字符以内
2. 根据镜头类型严格构图
3. 包含场景地点、光线氛围、角色姿态/位置
4. 风格：Asian drama cinematography, photorealistic, cinematic lighting, 16:9
5. 直接输出纯文本`

export function buildDeepSeekSceneShotPrompt(
  sceneSummary: string,
  shotType: "wide" | "medium" | "close",
  charactersDesc: string,
  storyContext: string
): { system: string; user: string } {
  const shotTypeMap: Record<string, string> = {
    wide: "全景 — full body shot, wide angle, entire room visible, characters small in frame",
    medium: "中景 — waist-up framing, characters 40-60% of frame, natural interactions",
    close: "特写 — close-up, head and shoulders, shallow depth of field, emphasizing expressions",
  }
  return {
    system: DEEPSEEK_SCENE_SHOT_SYSTEM,
    user: [
      `【故事背景】${storyContext}`,
      `【场景概要】${sceneSummary}`,
      `【镜头类型】${shotType} (${shotTypeMap[shotType] || shotType})`,
      charactersDesc ? `【出场角色】${charactersDesc}` : "",
    ].filter(Boolean).join("\n\n"),
  }
}

export const DEEPSEEK_DIALOGUE_EXTRACTION_SYSTEM = `你是影视剧本分析员。通读剧本全文，提取所有对白和内心独白。

输出 JSON 数组，每个元素：sceneNum(数字), speaker(说话人，优先匹配角色列表，无匹配则根据上下文自动命名如"服务员""保安老张"), line(对白原文去引号), emotion(平静/愤怒/开心/冷漠/悲伤/温柔/惊讶/独白), isMonologue(布尔)

isMonologue为true的情况：角色"心想/暗想/在心里说/默默"后的引号；"自言自语/喃喃自语"的引号；独处场景的引号

不要提取：拟声词、标语/告示牌文字、大段环境描述中的引号

直接输出 JSON 数组，不要 markdown 标记`

export function buildDeepSeekDialogueExtractionPrompt(ctx: DialogueExtractionContext): { system: string; user: string } {
  return {
    system: DEEPSEEK_DIALOGUE_EXTRACTION_SYSTEM,
    user: `【角色列表】\n${ctx.charactersDesc}\n\n【剧本全文】\n${ctx.fullScript}`,
  }
}

export const DEEPSEEK_CHARACTER_INFERENCE_SYSTEM = `你是角色分析师。根据剧本中出现的龙套角色名和上下文，推断每个角色的基本属性。

对于仅有身份缺名字的角色（如"酒馆老板""服务员""保安"），根据故事背景起一个合适的名字：
- 古代背景 → "王掌柜""赵伯"
- 现代都市 → "老张""阿强"

输出 JSON 数组：[{"name":"原始标识","suggestedName":"建议名(已是人名则留空)","gender":"male/female","age":"青年/中年/老年/未知","identity":"身份","personality":"简短性格","role":"配角"}]

直接输出 JSON 数组，不要 markdown 标记`

export function buildDeepSeekCharacterInferencePrompt(ctx: CharacterInferenceContext): { system: string; user: string } {
  return {
    system: DEEPSEEK_CHARACTER_INFERENCE_SYSTEM,
    user: `【待推断角色】${ctx.names.join("、")}\n\n【剧本上下文】${ctx.scriptContext.slice(0, 3000)}`,
  }
}

// ========================
// SiliconFlow Wan2.2 视频提示词
// ========================

/** Wan2.2 公式：Subject+Scene + Motion + 光影/镜头 + Style + Quality */
export function buildWanVideoPrompt(ctx: VideoPromptContext): string {
  const motion = ctx.motionDesc?.trim() || "subtle natural motion, gentle camera drift"
  return [
    ctx.sceneDesc,
    motion,
    "cinematic lighting, photorealistic, 24fps, professional color grading",
  ].filter(Boolean).join(". ")
}

/** Wan2.2 通用负向词 */
export const WAN_NEGATIVE_PROMPT = "blurry, deformed, duplicate frames, jittery motion, watermark, text, low quality, oversaturated, washed out, ugly, distorted"

// ========================
// 剧本相关类型
// ========================

export interface ScriptScene {
  id: string
  sceneNum: number
  location: string
  timeOfDay: string
  description: string
  dialogues: ScriptDialogue[]
}

export interface ScriptDialogue {
  speaker: string
  line: string
  emotion?: string
  camera?: string
}

export interface ScriptData {
  title: string
  genre: string
  synopsis: string
  scenes: ScriptScene[]
}

// ========================
// 分镜相关类型
// ========================

export interface StoryboardShot {
  id: string
  shotNum: number
  cameraAngle: string
  description: string
  duration: number
  imagePrompt: string
  referenceImage?: string
}

export interface StoryboardScene {
  id: string
  sceneNum: number
  location: string
  timeOfDay: string
  description: string
  shots: StoryboardShot[]
  dialogues: StoryboardDialogue[]
}

export interface StoryboardDialogue {
  speaker: string
  line: string
  emotion: string
}

// ========================
// 角色类型
// ========================

export interface CharacterProfile {
  id: string
  name: string
  role: string
  gender: string
  age: string
  description: string
  personality: string
  appearance: string
  avatarUrl?: string
  voiceId?: string
}

// ========================
// 项目类型
// ========================

export type ProjectStatus = 'draft' | 'in_progress' | 'completed' | 'published'
export type EpisodeStatus = 'draft' | 'script_done' | 'visual_done' | 'voice_done' | 'composited' | 'published'
export type SceneStatus = 'pending' | 'generating' | 'generated' | 'failed'

export interface ProjectSummary {
  id: string
  title: string
  description?: string
  thumbnail?: string
  status: ProjectStatus
  genre?: string
  episodeCount: number
  createdAt: string
  updatedAt: string
}

// ========================
// AI 生成请求/响应类型
// ========================

export interface ScriptGenRequest {
  prompt: string
  genre?: string
  episodeCount?: number
  style?: string
}

export interface ScriptGenResponse {
  script: ScriptData
  characters: CharacterProfile[]
  metadata: {
    wordCount: number
    sceneCount: number
    model: string
  }
}
// ========================
// 10步创作工作流类型
// ========================

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export const WIZARD_STEPS = [
  { step: 1 as WizardStep, title: "选题定赛道", desc: "确定故事方向" },
  { step: 2 as WizardStep, title: "一句话简介", desc: "高概念浓缩" },
  { step: 3 as WizardStep, title: "世界观+主题", desc: "规则与核心表达" },
  { step: 4 as WizardStep, title: "人物属性卡", desc: "角色与关系图" },
  { step: 5 as WizardStep, title: "悬念+伏笔", desc: "悬疑引擎" },
  { step: 6 as WizardStep, title: "整体大纲", desc: "起承转合" },
  { step: 7 as WizardStep, title: "分集大纲", desc: "逐集拆解" },
  { step: 8 as WizardStep, title: "复盘+过审", desc: "中间检查" },
  { step: 9 as WizardStep, title: "分场大纲", desc: "场景级细化" },
  { step: 10 as WizardStep, title: "剧本正文", desc: "正式写作" },
] as const

export const TOPIC_OPTIONS = [
  {
    id: "workplace",
    title: "职场悬疑逆袭",
    logline: "顶级程序员被同事陷害背锅开除，发现当年的项目事故是人为阴谋，一边卧底一边查真相，最终手撕恶人重回巅峰",
    tags: ["现实", "低成本", "共鸣强"],
  },
  {
    id: "business",
    title: "商业悬疑逆袭",
    logline: "年轻创业者被兄弟合伙人坑走公司、破产负债，发现所有意外亏损都是对手的圈套，靠商业嗅觉+推理能力拆穿骗局夺回一切",
    tags: ["爽点密集", "逆袭感强"],
  },
  {
    id: "wrongful",
    title: "冤案洗底逆袭",
    logline: "前法医被冤枉杀人入狱，出狱后当外卖员，靠刑侦能力重新调查当年冤案，找到真凶洗清污名重回警队",
    tags: ["悬疑拉满", "追更率极高"],
  },
  {
    id: "family",
    title: "家庭情感悬疑",
    logline: "富家千金发现丈夫接近自己是为了谋夺家产，甚至和姐姐勾结，她假装傻白甜暗中收集证据，最后反杀全家恶人",
    tags: ["女性最爱", "情绪冲突强"],
  },
]

export interface CharacterCard {
  id: string
  name: string
  role: string           // 主角/反派/配角
  gender: string
  age: string
  identity: string       // 身份：他是谁
  personality: string    // 性格
  secret: string         // 隐藏秘密（悬疑核心）
  goal: string           // 核心目的
  weakness: string       // 弱点
  signature: string      // 标志性动作/台词
  relationship?: string  // 与其他角色的关系
}

export interface SuspenseItem {
  id: string
  type: "major" | "medium" | "hook" // 大悬念/中层悬念/小钩子
  description: string
  revealEpisode?: number  // 在第几集揭晓
  status: "pending" | "revealed"
}

export interface StoryOutline {
  qi: string      // 起：跌落谷底
  cheng: string   // 承：发现疑点
  zhuan: string   // 转：逐层反击
  he: string      // 合：真相大白+逆袭
}

export interface EpisodeOutline {
  episodeNum: number
  title: string
  summary: string
  conflict: string    // 本集核心冲突
  hook: string        // 结尾钩子
  keyScenes: string[] // 关键场景列表
}

export interface SceneOutline {
  sceneNum: number
  location: string
  characters: string[]
  summary: string
  purpose: string     // 本场景推进了什么剧情
}

// ========================
// 审查规范
// ========================

export interface ReviewSpec {
  logic: string[]       // 逻辑检查标准
  character: string[]   // 人设检查标准
  pacing: string[]      // 节奏检查标准
  suspense: string[]    // 悬念检查标准
  compliance: string[]  // 合规检查标准
}

export const DEFAULT_REVIEW_SPEC: ReviewSpec = {
  logic: [
    "时间线是否连贯，前后场景的因果关系是否成立",
    "人物行为是否符合其动机和处境",
    "信息揭露顺序是否合理，有无前后矛盾",
    "关键情节转折是否有充分铺垫",
  ],
  character: [
    "角色性格是否前后一致，有无崩人设",
    "对白是否符合角色身份、性格和情绪",
    "角色行为是否符合其核心目的和弱点设定",
    "角色是否有合理的成长弧线",
  ],
  pacing: [
    "每集是否有明确的核心冲突和推进",
    "结尾钩子是否有效，能否勾住观众",
    "冲突、高潮、缓和的分布是否合理",
    "是否存在拖沓或信息密度过低的段落",
  ],
  suspense: [
    "已设置的伏笔是否都有回收计划",
    "悬念的设置是否足够吸引人",
    "揭晓时机是否恰当，不过早也不过晚",
    "是否存在逻辑上无法解释的未解之谜",
  ],
  compliance: [
    "是否涉及私刑、暴力执法等非法解决方式",
    "是否丑化或抹黑公职人员形象",
    "是否涉及色情、低俗、诱导不良行为内容",
    "是否涉及政治敏感话题或影射",
    "结局是否传递正能量，坏人是否受到法律制裁",
  ],
}

export interface ScriptWizardData {
  currentStep: WizardStep
  // Step 1
  topicId?: string
  topicTitle?: string
  // Step 2
  logline?: string
  // Step 3
  worldBuilding?: string
  theme?: string
  // Step 4
  characters: CharacterCard[]
  // Step 5
  suspenseList: SuspenseItem[]
  // Step 6
  storyOutline?: StoryOutline
  // Step 7
  episodeOutlines: EpisodeOutline[]
  totalEpisodes?: number
  // Step 8 - 中间复盘
  reviewNotes?: string
  reviewSpec?: ReviewSpec
  // Step 9 - 分场大纲
  activeSceneEpisode?: number
  episodeSceneOutlines?: Record<number, SceneOutline[]>
  // Step 10 - 剧本正文
  activeEpisode?: number
  episodeScripts?: Record<number, string>
  // 修复日志
  fixLogs?: FixLogEntry[]
}

export interface FixLogEntry {
  id: string
  time: string
  category: string       // 逻辑/人设/节奏/悬念/合规
  target: string          // 分集大纲/角色卡/悬念清单
  before: string          // 修改前摘要
  after: string           // 修改后摘要
}
// ========================
// 通用 UI 类型
// ========================

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

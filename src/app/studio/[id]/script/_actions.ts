"use server"

import { prisma } from "@/lib/db/prisma"
import { generateText } from "@/lib/ai"
import { buildDeepSeekScriptPrompt } from "@/lib/ai/prompts"
import type { ScriptWizardData, CharacterCard, SuspenseItem, EpisodeOutline, SceneOutline, ReviewSpec } from "@/types"
import { DEFAULT_REVIEW_SPEC } from "@/types"

export async function saveScriptData(projectId: string, data: ScriptWizardData) {
  // 合并已有数据，避免覆盖视觉工坊写入的 visualAssets
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  const existing = project?.scriptData ? JSON.parse(project.scriptData) : {}
  await prisma.project.update({
    where: { id: projectId },
    data: { scriptData: JSON.stringify({ ...existing, ...data }) },
  })
}

export async function loadScriptData(projectId: string): Promise<ScriptWizardData | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project?.scriptData) return null
  try { return JSON.parse(project.scriptData) as ScriptWizardData } catch { return null }
}

// AI 根据一句话创意推荐选题方向
export async function suggestTopicByIdea(idea: string): Promise<{ title: string; desc: string; tags: string[] }[]> {
  const raw = await generateText(
    `你是短剧选题专家。用户说："${idea}"。基于这个创意，推荐1-3个最适合的短剧选题方向。

格式（每个选题一行，JSON数组）：
[
  {"title": "选题名称", "desc": "一句话剧情描述（30字内）", "tags": ["标签1","标签2"]}
]

只返回JSON数组，不要其他文字。`
  )
  try {
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// AI 生成热门选题推荐（基于训练数据中的趋势知识）
export async function searchTrendingTopics(): Promise<{ title: string; desc: string; tags: string[]; reason: string }[]> {
  const raw = await generateText(
    `你是短剧市场分析师。请基于2024-2026年中国短剧市场的真实趋势，推荐5个当前最热门、最容易出爆款的短剧选题方向。

要求：
1. 必须是经过市场验证的热门题材
2. 包含具体的选题名称和一句话剧情描述
3. 说明为什么这个方向会火

格式（JSON数组）：
[
  {"title": "选题名称", "desc": "剧情描述（30字）", "tags": ["标签"], "reason": "为什么火（20字内）"}
]

只返回JSON数组。`
  )
  try {
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function generateLogline(topicTitle: string, topicDesc: string): Promise<string> {
  return generateText(`你是专业短剧编剧。基于选题"${topicTitle}"（参考：${topicDesc}），写一个30-50字的一句话高概念简介。格式：主角身份+惨状+被谁坑+悬疑秘密+逆袭结果。只输出一句话。`)
}

export async function generateWorldBuilding(topicTitle: string, logline: string): Promise<{ world: string; theme: string }> {
  const r = await generateText(`你是专业短剧编剧。基于选题"${topicTitle}"和简介"${logline}"，写出世界观和核心主题。世界观4条规则（100字内），主题一句话。格式：---WORLD---\n内容\n---THEME---\n内容`)
  const wm = r.match(/---WORLD---\s*([\s\S]*?)\s*---THEME---/); const tm = r.match(/---THEME---\s*([\s\S]*)/)
  return { world: wm?.[1]?.trim() || r.split("---THEME---")[0]?.replace("---WORLD---", "").trim() || r, theme: tm?.[1]?.trim() || "" }
}

export async function generateCharacters(topicTitle: string, logline: string, worldBuilding: string): Promise<CharacterCard[]> {
  const raw = await generateText(
    `你是专业短剧编剧。选题：${topicTitle}，简介：${logline}，世界观：${worldBuilding}。创建5-8个核心角色，角色分配必须满足以下约束：

⚠️ 硬性约束：
- 主角至少男女各一位（必须有男有女）
- 反派至少男女各一位（必须有男有女）
- 其余为配角

严格按以下格式输出，每个角色以 ---CHARACTER--- 开头、---END--- 结尾：

---CHARACTER---
名字：角色名
定位：主角/反派/配角
性别：男/女
年龄：XX岁
身份：他是谁，做什么的
性格：性格描述
隐藏秘密：悬疑核心秘密
核心目的：他想要什么
弱点：软肋
标志性动作/台词：标志性细节
---END---

必须严格按照此格式，每个角色之间不要有空行。`
  )

  // Parse characters from AI output
  const cards: CharacterCard[] = []
  const blocks = raw.split(/---CHARACTER---/g).filter((b) => b.includes("---END---"))

  for (const block of blocks) {
    const content = block.split("---END---")[0]?.trim()
    if (!content) continue

    const extract = (label: string) => {
      const re = new RegExp(`${label}[：:]\\s*(.+)`, "i")
      return content.match(re)?.[1]?.trim() || ""
    }

    const card: CharacterCard = {
      id: crypto.randomUUID(),
      name: extract("名字") || "未命名",
      role: extract("定位") || "配角",
      gender: extract("性别") || "未知",
      age: extract("年龄") || "未知",
      identity: extract("身份"),
      personality: extract("性格"),
      secret: extract("隐藏秘密"),
      goal: extract("核心目的"),
      weakness: extract("弱点"),
      signature: extract("标志性动作|标志性动作/台词|标志性台词"),
    }

    if (card.name && card.name !== "未命名") {
      cards.push(card)
    }
  }

  return cards.length > 0 ? cards : []
}

export async function generateSuspenseList(logline: string, storyOutline: string, totalEpisodes: number = 12, characters: string = ""): Promise<SuspenseItem[]> {
  const charSection = characters ? `\n【角色信息】\n${characters}` : ""
  const raw = await generateText(
    `你是悬疑短剧编剧。全剧共 ${totalEpisodes} 集。简介：${logline}，大纲：${storyOutline || "待定"}。${charSection}

根据集数规划悬念：
- 大悬念：1个，贯穿全剧
- 中层悬念：${Math.max(2, Math.floor(totalEpisodes / 5))} 个，均匀分布
- 小钩子：${totalEpisodes} 个，每集结尾一个

悬念必须与角色的隐藏秘密、核心目的、弱点紧密关联，基于角色特性设计。

严格按以下格式：
【MAJOR】
1. 大悬念描述（贯穿全剧）
【MAJOR_END】

【MEDIUM】
1. 描述 - 第X集揭晓（X在1-${totalEpisodes}之间）
【MEDIUM_END】

【HOOK】
1. 描述（第1集结尾）
2. 描述（第2集结尾）
...
【HOOK_END】

中层悬念末尾必须标注"-第X集揭晓"，揭晓集数必须在1-${totalEpisodes}范围内。`
  )

  const items: SuspenseItem[] = []

  const parseSection = (raw: string, tag: string, type: SuspenseItem["type"]) => {
    const re = new RegExp(`【${tag}】\\s*([\\s\\S]*?)\\s*【${tag}_END】`, "i")
    const match = raw.match(re)
    if (!match?.[1]) return
    const lines = match[1].trim().split("\n").filter(Boolean)
    for (const line of lines) {
      const desc = line.replace(/^\d+[.、]\s*/, "").trim()
      if (!desc) continue
      const epMatch = desc.match(/[第]?(\d+)[集]?揭晓/)
      items.push({
        id: crypto.randomUUID(),
        type,
        description: desc.replace(/\s*[-—]\s*第?\d+集?揭晓/, "").trim(),
        revealEpisode: epMatch ? parseInt(epMatch[1]) : undefined,
        status: "pending",
      })
    }
  }

  parseSection(raw, "MAJOR", "major")
  parseSection(raw, "MEDIUM", "medium")
  parseSection(raw, "HOOK", "hook")

  return items
}

export async function generateStoryOutline(topicTitle: string, logline: string, worldBuilding: string, characters: string = ""): Promise<string> {
  const charSection = characters ? `\n【角色信息】\n${characters}\n大纲需围绕角色的核心目的和隐藏秘密展开。` : ""
  return generateText(`你是专业短剧编剧。基于：选题${topicTitle}，简介${logline}，世界观${worldBuilding}。${charSection}用起承转合四段写出完整短剧大纲（每段100-200字）。格式：【起：跌落谷底】【承：发现疑点】【转：逐层反击】【合：真相大白+逆袭】`)
}

export async function generateEpisodeOutlines(
  logline: string,
  storyOutline: string,
  startEpisode: number,
  count: number,
  totalEpisodes: number,
  characters: string = ""
): Promise<EpisodeOutline[]> {
  const endEpisode = startEpisode + count - 1
  const estimatedTokens = Math.max(4096, count * 80 + 2048)
  const charSection = characters ? `\n【角色信息】\n${characters}\n确保每集有至少1个角色驱动剧情发展。` : ""
  const raw = await generateText(
    `你是专业短剧编剧。简介：${logline}，大纲：${storyOutline}。全剧共${totalEpisodes}集，现在写出第${startEpisode}集到第${endEpisode}集的分集大纲（共${count}集）。${charSection}严格按以下格式：

===EPISODE===
集数：${startEpisode}
标题：本集标题
概要：本集50-80字概要
冲突：核心冲突
钩子：结尾钩子
===END===

===EPISODE===
集数：${startEpisode + 1}
...
===END===

每集一个 ===EPISODE=== 块，集数必须从${startEpisode}开始连续编号到${endEpisode}，字段名固定（集数/标题/概要/冲突/钩子），冒号分隔。`,
    { maxTokens: estimatedTokens }
  )

  const episodes: EpisodeOutline[] = []
  const blocks = raw.split(/===EPISODE===/g).filter((b) => b.includes("===END==="))

  for (const block of blocks) {
    const content = block.split("===END===")[0]?.trim()
    if (!content) continue

    const extract = (label: string) => {
      const re = new RegExp(`${label}[：:]\\s*(.+)`, "i")
      return content.match(re)?.[1]?.trim() || ""
    }

    const num = parseInt(extract("集数")) || episodes.length + startEpisode
    const title = extract("标题")
    const summary = extract("概要")
    const conflict = extract("冲突")
    const hook = extract("钩子")

    if (title || summary) {
      episodes.push({ episodeNum: num, title: title || `第${num}集`, summary, conflict, hook, keyScenes: [] })
    }
  }

  return episodes.length > 0 ? episodes : []
}

export async function generateSceneOutlines(episodeOutlines: string, targetEpisode: number, durationSeconds: number = 300, aiGenSeconds: number = 10, characters: string = ""): Promise<SceneOutline[]> {
  const sceneCount = Math.max(4, Math.round(durationSeconds / aiGenSeconds))
  const charSection = characters ? `\n【可用角色】\n${characters}\n每个场景的"人物"字段必须从上述角色中选择。` : ""
  const raw = await generateText(
    `你是专业短剧编剧。为第${targetEpisode}集写${sceneCount}个场景的分场大纲。

本集总时长${Math.floor(durationSeconds / 60)}分${durationSeconds % 60}秒，约${sceneCount}个场景。
⚠️ 每个场景的时长由你根据剧情重要性分配（5-15秒），关键转折、冲突爆发场景给长一些（12-15秒），过渡/铺垫场景给短一些（5-8秒）。所有场景时长总和尽量接近${durationSeconds}秒。

本集信息：${episodeOutlines}${charSection}

严格按以下格式：
===SCENE===
编号：1
地点：场景地点
人物：角色A,角色B
概要：1-2句话描述本场景
目的：这个场景推进了什么剧情
时长：数字（5-15之间）
===END===`
  )

  const scenes: SceneOutline[] = []
  const blocks = raw.split(/===SCENE===/g).filter((b) => b.includes("===END==="))

  for (const block of blocks) {
    const content = block.split("===END===")[0]?.trim()
    if (!content) continue

    const extract = (label: string) => {
      const re = new RegExp(`${label}[：:]\\s*(.+)`, "i")
      return content.match(re)?.[1]?.trim() || ""
    }

    const num = parseInt(extract("编号")) || scenes.length + 1
    const location = extract("地点")
    const chars = extract("人物").split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
    const summary = extract("概要")
    const purpose = extract("目的")
    const dur = parseInt(extract("时长")) || 0

    if (location || summary) {
      scenes.push({ sceneNum: num, location, characters: chars, summary, purpose, durationSeconds: dur })
    }
  }

  return scenes
}

/** 为已有分场的集追加 N 个新场景，承接之前剧情 */
export async function generateAdditionalScenes(
  episodeOutlines: string,
  existingScenes: string,
  targetEpisode: number,
  nextSceneNum: number,
  count: number = 5,
  aiGenSeconds: number = 10,
  characters: string = ""
): Promise<SceneOutline[]> {
  const charSection = characters ? `\n【可用角色】\n${characters}\n新场景的"人物"字段必须从上述角色中选择。` : ""
  const raw = await generateText(
    `你是专业短剧编剧。第${targetEpisode}集已有以下场景，请继续写出${count}个新场景，承接之前的剧情发展：

【本集信息】
${episodeOutlines}

【已有场景】
${existingScenes}${charSection}

现在从场景${nextSceneNum}开始，续写${count}个新场景。⚠️ 每个场景的时长由你根据剧情重要性分配（5-15秒），关键场景给长一些（12-15秒），过渡场景给短一些（5-8秒）。严格按以下格式：

===SCENE===
编号：${nextSceneNum}
地点：场景地点
人物：角色A,角色B
概要：1-2句话描述本场景
目的：这个场景推进了什么剧情
时长：数字（5-15之间）
===END===

编号从${nextSceneNum}开始连续编号到${nextSceneNum + count - 1}，每个场景之间不要有空行。`,
    { maxTokens: Math.max(4096, count * 150 + 1024) }
  )

  const scenes: SceneOutline[] = []
  const blocks = raw.split(/===SCENE===/g).filter((b) => b.includes("===END==="))

  for (const block of blocks) {
    const content = block.split("===END===")[0]?.trim()
    if (!content) continue

    const extract = (label: string) => {
      const re = new RegExp(`${label}[：:]\\s*(.+)`, "i")
      return content.match(re)?.[1]?.trim() || ""
    }

    const num = parseInt(extract("编号")) || scenes.length + nextSceneNum
    const location = extract("地点")
    const chars = extract("人物").split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
    const summary = extract("概要")
    const purpose = extract("目的")
    const dur = parseInt(extract("时长")) || aiGenSeconds

    if (location || summary) {
      scenes.push({ sceneNum: num, location, characters: chars, summary, purpose, durationSeconds: dur })
    }
  }

  return scenes
}

export async function generateScriptContent(logline: string, sceneOutlines: string, characters: string): Promise<string> {
  const basePrompt = buildDeepSeekScriptPrompt({ logline, sceneOutlines, characters })

  return generateText(
    `${basePrompt}

要求：
1. 网络小说叙事风格：第三人称叙述 + 自然嵌入对话，不要用剧本格式
2. ⚠️ 铁律：每个 ===SCENE N=== 块的汉字数必须在 200-400 字之间。少于 200 字说明描写不足，超过 400 字说明拖沓冗余。请在生成后自行数一遍每个场景的字数
3. 对话用中文引号"直接引用"，无需标注情绪标签
4. ⚠️ 段与段之间必须空一行（用空行分隔），每段2-4句话，禁止连续大段文字
5. 保持快节奏，每段推动剧情，避免拖沓的环境描写
6. 每个场景以 ===SCENE N=== 作为分隔标记
7. ⚠️ 铁律：场景编号 N 必须从 1 开始连续递增到最后一个场景号，禁止跳号、禁止合并、禁止漏号

输出格式（每个场景 200-400 字完整故事）：
===SCENE 1===
深夜的办公室只剩下电脑屏幕的冷光。林深盯着那行跳动的错误代码，指尖在键盘上微微发抖——三年的心血，全线崩盘。

"深哥，服务器被锁了。"周明的声音从身后传来，带着一丝他从未听过的平静。

林深猛地转身，对上周明那双不再掩饰的眼睛。"是你？"

周明没回答，只是把一份文件推到他面前——股权转让协议，签名处早就盖好了章。

林深盯着那份协议，忽然笑了。他伸手拿起协议，缓缓撕成两半。"你以为，我没有备份？"
===SCENE 2===
...`,
    { maxTokens: 8192 }
  )
}

export async function generateReview(fullScript: string, logline: string, spec?: ReviewSpec): Promise<string> {
  const s = spec || DEFAULT_REVIEW_SPEC

  const specText = `
【审查规范 - 请严格按以下标准逐条检查】

## 逻辑检查标准：
${s.logic.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## 人设检查标准：
${s.character.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## 节奏检查标准：
${s.pacing.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## 悬念检查标准：
${s.suspense.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## 合规检查标准：
${s.compliance.map((r, i) => `${i + 1}. ${r}`).join("\n")}
`

  return generateText(
    `你是专业短剧审核编辑。简介：${logline}。\n\n${specText}\n\n请逐条对照以上规范检查剧本（前4000字），找出所有不符合规范的问题。\n\n输出格式（严格）：\n【逻辑】\n- 问题描述\n【人设】\n- 问题描述\n【节奏】\n- 问题描述\n【悬念】\n- 问题描述\n【合规】\n- 问题描述\n【总体】\n总体评价和建议`
  )
}

// AI 一键修复问题
export async function fixIssue(
  category: string,
  issues: string,
  scriptContent: string,
  characterData: string,
  episodeData: string,
  suspenseData: string,
  reviewSpec?: string
): Promise<string> {
  const step1Analysis = `## 第一步：深度分析
请先通读以下所有问题，找出它们之间的关联和共同根因，不要孤立地逐条处理：

【待修复问题】
${issues}

【完整上下文】
- 简介：${scriptContent.substring(0, 500)}
- 角色：${characterData}
- 分集大纲：${episodeData.substring(0, 3000)}
- 悬念：${suspenseData}
${reviewSpec ? `- 审查标准：${reviewSpec}` : ""}

## 第二步：系统性修复
基于根因分析，进行系统性修复——不是打补丁，而是从结构上解决问题。确保修复后不会再产生同类型的新问题。`

  const prompts: Record<string, string> = {
    "逻辑": `${step1Analysis}

## 第三步：输出格式
只输出需要修改的集。格式：
===EPISODE===
集数：N
标题：XXX
概要：XXX（确保因果关系完整）
冲突：XXX（确保动机合理）
钩子：XXX（确保悬念自然引出）
===END===

只输出有实质性修改的集。如果某集只需要微调，合并到相邻集的修改中。`,

    "人设": `${step1Analysis}

## 第三步：输出格式
输出需要修改的角色卡片。每个角色的6要素必须内在一致（性格驱动秘密，秘密驱动目的，目的暴露弱点）。
---CHARACTER---
名字：XX
定位：主角/反派/配角
性别：男/女
年龄：XX岁
身份：XXX
性格：XXX
隐藏秘密：XXX
核心目的：XXX
弱点：XXX
标志性动作/台词：XXX
---END---`,

    "节奏": `${step1Analysis}

## 第三步：输出格式
调整需要修改的集，确保每集有明确冲突推进、结尾钩子有效、整体节奏张弛有度。
===EPISODE===
集数：N
标题：XXX
概要：XXX（控制信息密度）
冲突：XXX（有推进）
钩子：XXX（制造期待）
===END===`,

    "悬念": `${step1Analysis}

## 第三步：输出格式
输出需要新增或修改的悬念项。大悬念贯穿全剧，中层悬念每5集左右揭晓，小钩子每集结尾。
===SUSPENSE===
类型：major/medium/hook
描述：XXX（具体，可验证）
揭晓集：N
===END===`,

    "合规": `${step1Analysis}

## 第三步：输出格式
修改违规内容，确保符合政策要求且不损失剧情张力。
===EPISODE===
集数：N
标题：XXX
概要：XXX（合法合规）
冲突：XXX（用合法手段解决）
钩子：XXX
===END===`,
  }
  const prompt = prompts[category] || `修复以下问题：\n${issues}\n\n剧本：${scriptContent.substring(0, 3000)}`
  return generateText(prompt, { temperature: 0.4, maxTokens: 4096 })
}

// 清理重复悬念
export async function deduplicateSuspense(projectId: string): Promise<number> {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project?.scriptData) return 0
  const sd = JSON.parse(project.scriptData)
  const list: SuspenseItem[] = sd.suspenseList || []
  const seen = new Set<string>()
  const clean = list.filter(s => { const k = s.description.substring(0, 20); if (seen.has(k)) return false; seen.add(k); return true })
  const removed = list.length - clean.length
  if (removed > 0) { await prisma.project.update({ where: { id: projectId }, data: { scriptData: JSON.stringify({ ...sd, suspenseList: clean }) } }) }
  return removed
}

// 为新集数生成悬念钩子（衔接已有悬念）
export async function generateHooksForNewEpisodes(
  logline: string,
  existingSuspense: string,
  startEpisode: number,
  count: number,
  characters: string = ""
): Promise<SuspenseItem[]> {
  const charSection = characters ? `\n【角色信息】\n${characters}\n新钩子要充分利用角色的隐藏秘密和弱点。` : ""
  const raw = await generateText(
    `你是悬疑短剧编剧。现有悬念和钩子如下：

${existingSuspense}

现在要在第${startEpisode - 1}集之后新增${count}集（第${startEpisode}到${startEpisode + count - 1}集）。
${charSection}

要求：
1. 新钩子必须承接上一集的悬念，不能凭空出现
2. 新增 1 个中层悬念，作为新增剧集的叙事主线
3. 每个钩子要和已有的悬念体系产生关联

简介：${logline}

格式（先中层悬念，再逐集钩子）：
===SUSPENSE===
类型：medium
描述：新增剧集的核心悬念（与已有悬念如何衔接）
揭晓集：${startEpisode + count - 1}
===END===
===SUSPENSE===
类型：hook
描述：（第${startEpisode}集结尾钩子，承接上一集）
===END===
===SUSPENSE===
类型：hook
描述：（第${startEpisode + 1}集结尾钩子）
===END===
...`
  )
  const items: SuspenseItem[] = []
  const blocks = raw.split(/===SUSPENSE===/g).filter((b) => b.includes("===END==="))
  for (const block of blocks) {
    const content = block.split("===END===")[0]?.trim()
    if (!content) continue
    const ex = (l: string) => { const r = new RegExp(`${l}[：:]\\s*(.+)`, "i"); return content.match(r)?.[1]?.trim() || "" }
    const desc = ex("描述"); if (!desc) continue
    const type = (ex("类型") || "hook") as SuspenseItem["type"]
    const ep = parseInt(ex("揭晓集")) || undefined
    items.push({ id: crypto.randomUUID(), type, description: desc, revealEpisode: ep, status: "pending" })
  }
  return items
}

// AI 推荐场景时长
export async function suggestSceneDurations(sceneOutlines: string, totalDuration: number): Promise<number[]> {
  const raw = await generateText(`分配每个场景时长（5-15秒），总和接近${totalDuration}秒。场景列表：${sceneOutlines}。只输出JSON数组：[10,12,8,...]`)
  try { const m = raw.match(/\[[\d,\s]+\]/); return m ? JSON.parse(m[0]) : [] } catch { return [] }
}

// AI 搜索相关事实
export async function searchFacts(topic: string, logline: string, outline: string): Promise<{ title: string, detail: string, relevance: string }[]> {
  const raw = await generateText(`基于"${topic}"和"${logline}"，找3-5个真实事件参考。输出JSON：[{"title":"","detail":"","relevance":""}]`)
  try { const m = raw.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : [] } catch { return [] }
}

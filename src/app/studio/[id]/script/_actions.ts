"use server"

import { prisma } from "@/lib/db/prisma"
import { generateText } from "@/lib/ai"
import type { ScriptWizardData, CharacterCard, SuspenseItem, EpisodeOutline, SceneOutline, ReviewSpec } from "@/types"
import { DEFAULT_REVIEW_SPEC } from "@/types"

export async function saveScriptData(projectId: string, data: ScriptWizardData) {
  await prisma.project.update({ where: { id: projectId }, data: { scriptData: JSON.stringify(data) } })
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
    `你是专业短剧编剧。选题：${topicTitle}，简介：${logline}，世界观：${worldBuilding}。创建4-6个核心角色。严格按以下格式输出，每个角色以 ---CHARACTER--- 开头、---END--- 结尾：

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

export async function generateSuspenseList(logline: string, storyOutline: string): Promise<SuspenseItem[]> {
  const raw = await generateText(
    `你是悬疑短剧编剧。简介：${logline}，大纲：${storyOutline || "待定"}。列出悬念清单，严格按以下格式：

【MAJOR】
1. 大悬念描述（贯穿全剧）
【MAJOR_END】

【MEDIUM】
1. 中层悬念描述 - 第X集揭晓
2. 中层悬念描述 - 第X集揭晓
【MEDIUM_END】

【HOOK】
1. 小钩子描述（第1集结尾）
2. 小钩子描述（第2集结尾）
...
【HOOK_END】

每个条目一行，编号+描述，中层悬念末尾必须标注"-第X集揭晓"。`
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

export async function generateStoryOutline(topicTitle: string, logline: string, worldBuilding: string): Promise<string> {
  return generateText(`你是专业短剧编剧。基于：选题${topicTitle}，简介${logline}，世界观${worldBuilding}。用起承转合四段写出完整短剧大纲（每段100-200字）。格式：【起：跌落谷底】【承：发现疑点】【转：逐层反击】【合：真相大白+逆袭】`)
}

export async function generateEpisodeOutlines(logline: string, storyOutline: string, totalEpisodes: number): Promise<EpisodeOutline[]> {
  const raw = await generateText(
    `你是专业短剧编剧。简介：${logline}，大纲：${storyOutline}。写出${totalEpisodes}集分集大纲，严格按以下格式：

===EPISODE===
集数：1
标题：本集标题
概要：本集50-80字概要
冲突：核心冲突
钩子：结尾钩子
===END===

===EPISODE===
集数：2
...
===END===

每集一个 ===EPISODE=== 块，字段名固定（集数/标题/概要/冲突/钩子），冒号分隔。`
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

    const num = parseInt(extract("集数")) || episodes.length + 1
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

export async function generateSceneOutlines(episodeOutlines: string, targetEpisode: number): Promise<SceneOutline[]> {
  const raw = await generateText(
    `你是专业短剧编剧。为第${targetEpisode}集写6-10个场景分场大纲。本集信息：${episodeOutlines}。严格按以下格式：

===SCENE===
编号：1
地点：场景地点
人物：角色A,角色B
概要：1-2句话描述本场景
目的：这个场景推进了什么剧情
===END===

===SCENE===
编号：2
...
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

    if (location || summary) {
      scenes.push({ sceneNum: num, location, characters: chars, summary, purpose })
    }
  }

  return scenes
}

export async function generateScriptContent(logline: string, sceneOutlines: string, characters: string): Promise<string> {
  return generateText(`你是专业短剧编剧。简介：${logline}，分场：${sceneOutlines}，角色：${characters}。写出完整剧本正文，标准格式：场景标题→场景描述→对话（标情绪：愤怒/悲伤/开心/冷漠/霸道/温柔）。`)
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

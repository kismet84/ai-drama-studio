"use server"

import { prisma } from "@/lib/db/prisma"
import { extractScriptDialogue, inferCharacterAttributes } from "@/lib/ai"
import type { CharacterCard } from "@/types"

export interface ExtractedDialogueLine {
  sceneNum: number
  speaker: string
  line: string
  emotion: string
  isMonologue: boolean
}

export async function analyzeEpisodeDialogue(
  projectId: string,
  episodeNum: number,
  force = false
): Promise<ExtractedDialogueLine[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return []

  const scriptData = project.scriptData ? JSON.parse(project.scriptData) : {}

  // 有缓存且未强制刷新 → 直接返回
  const cached = scriptData.episodeDialogue?.[episodeNum]
  if (!force && Array.isArray(cached) && cached.length > 0) {
    return cached as ExtractedDialogueLine[]
  }

  const fullScript: string = scriptData.episodeScripts?.[episodeNum] || ""
  if (!fullScript.trim()) return []

  const characters: CharacterCard[] = scriptData.characters || []
  const charactersDesc = characters
    .filter(c => c.name)
    .map(c => [c.name, c.role, c.gender, c.identity, c.personality].filter(Boolean).join("，"))
    .join("\n")

  const result = await extractScriptDialogue(fullScript, charactersDesc)

  // 检测龙套角色：不在角色表中 + 角色表中仅有泛称未起名的
  const existingNames = new Set(characters.filter(c => c.name).map(c => c.name))
  const genericTitlePattern = /(老板|服务员|保安|医生|警察|司机|路人|顾客|学生|老师|同事|邻居|快递|外卖|前台|秘书|经理|主管|厨师|护士|记者|编辑)$/
  const newSpeakers = [...new Set(result.map(r => r.speaker))]
    .filter(name => name && name.length >= 2 && !existingNames.has(name) && !/^[0-9a-zA-Z_]+$/.test(name))

  // 已有角色中仅有泛称没名字的也一起推断
  const unnamedChars = characters.filter(c =>
    c.name && genericTitlePattern.test(c.name) && !c.identity
  )
  const toInfer = [...new Set([...newSpeakers, ...unnamedChars.map(c => c.name)])]

  let updatedChars = [...characters]
  if (toInfer.length > 0) {
    let inferred: { name: string; suggestedName?: string; gender: string; age: string; identity: string; personality: string; role: string }[] = []
    try {
      inferred = await inferCharacterAttributes(toInfer, fullScript)
    } catch {}

    for (const name of toInfer) {
      const info = inferred.find(i => i.name === name)
      const displayName = info?.suggestedName || name
      const isNew = newSpeakers.includes(name)

      if (isNew) {
        updatedChars.push({
          id: crypto.randomUUID(),
          name: displayName,
          role: info?.role || "配角",
          gender: info?.gender === "male" ? "男" : info?.gender === "female" ? "女" : "未知",
          age: info?.age || "",
          identity: info?.identity || name,
          personality: info?.personality || "",
          secret: "", goal: "", weakness: "", signature: "",
        })
      } else {
        // 更新已有泛称角色的姓名
        const idx = updatedChars.findIndex(c => c.name === name)
        if (idx >= 0 && displayName !== name) {
          updatedChars[idx] = {
            ...updatedChars[idx],
            name: displayName,
            identity: info?.identity || updatedChars[idx].identity || name,
            gender: info?.gender === "male" ? "男" : info?.gender === "female" ? "女" : updatedChars[idx].gender,
            age: info?.age || updatedChars[idx].age,
            personality: info?.personality || updatedChars[idx].personality,
          }
        }
      }
    }
  }

  // 持久化缓存 + 新角色
  const episodeDialogue = { ...(scriptData.episodeDialogue || {}), [episodeNum]: result }
  await prisma.project.update({
    where: { id: projectId },
    data: { scriptData: JSON.stringify({ ...scriptData, episodeDialogue, characters: updatedChars }) },
  })

  return result
}

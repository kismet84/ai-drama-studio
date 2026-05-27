"use server"

import { prisma } from "@/lib/db/prisma"
import { generateImage, generateCharacterTurnaround, generateSceneShotPrompt, generateVideo } from "@/lib/ai"
import { buildWanVideoPrompt } from "@/lib/ai/prompts"
import type { CharacterCard, SceneOutline } from "@/types"

// ========================
// 类型定义
// ========================

export interface VisualAssetItem {
  id: string
  type: "image" | "video"
  name: string
  url: string
  thumbnail?: string
  source: string // "shot" | "character" | "upload"
  sourceId: string
  createdAt: string
}

export interface CharacterTurnaround {
  front: string
  side: string
  back: string
}

export interface VisualAssets {
  shotImages: Record<string, string>
  shotPrompts: Record<string, string>
  characterAvatars: Record<string, CharacterTurnaround>
  shotVideos: Record<string, string>
  assets: VisualAssetItem[]
}

export interface VisualProjectData {
  projectId: string
  projectTitle: string
  genre: string
  logline: string
  worldBuilding: string
  characters: CharacterCard[]
  episodeOutlines: { episodeNum: number; title: string; summary: string }[]
  episodeSceneOutlines: Record<number, SceneOutline[]>
  episodeScripts: Record<number, string>
  visualAssets: VisualAssets
}

// ========================
// 数据加载
// ========================

export async function getVisualData(projectId: string): Promise<VisualProjectData | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  })
  if (!project) return null

  const scriptData = project.scriptData ? JSON.parse(project.scriptData) : {}
  const visualAssets: VisualAssets = scriptData.visualAssets || {
    shotImages: {},
    shotPrompts: {},
    characterAvatars: {},
    shotVideos: {},
    assets: [],
  }

  // 补全缺失字段（兼容旧数据）
  if (!visualAssets.shotPrompts) visualAssets.shotPrompts = {}

  // 兼容旧数据：string → { front, side, back }
  const migratedAvatars: Record<string, CharacterTurnaround> = {}
  for (const [id, val] of Object.entries(visualAssets.characterAvatars)) {
    if (typeof val === "string") {
      migratedAvatars[id] = { front: val, side: "", back: "" }
    } else {
      migratedAvatars[id] = val as CharacterTurnaround
    }
  }
  visualAssets.characterAvatars = migratedAvatars

  return {
    projectId: project.id,
    projectTitle: project.title,
    genre: project.genre || "",
    logline: scriptData.logline || "",
    worldBuilding: scriptData.worldBuilding || "",
    characters: scriptData.characters || [],
    episodeOutlines: scriptData.episodeOutlines || [],
    episodeSceneOutlines: scriptData.episodeSceneOutlines || {},
    episodeScripts: scriptData.episodeScripts || {},
    visualAssets,
  }
}

// ========================
// 场景画面生成
// ========================

export async function generateShotImageAction(
  projectId: string,
  shotKey: string,
  options: {
    shotType: "wide" | "medium" | "close"
    sceneEpisode: number
    sceneNum: number
    sceneSummary: string
    sceneLocation: string
    sceneChars: string[]
    referenceImages?: string[]
  }
): Promise<{ imageUrl: string; prompt: string }> {
  // 读取故事上下文 + 角色卡
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  const scriptData = project?.scriptData ? JSON.parse(project.scriptData) : {}
  const genre = project?.genre || ""
  const logline = scriptData.logline || ""
  const worldBuilding = scriptData.worldBuilding || ""
  const storyContext = [
    genre ? `类型：${genre}` : "",
    logline ? `简介：${logline}` : "",
    worldBuilding ? `世界观：${worldBuilding}` : "",
  ].filter(Boolean).join("\n")
  const characters: CharacterCard[] = scriptData.characters || []

  // 构建角色描述（只取出场角色）
  const charDescs: string[] = []
  for (const name of options.sceneChars) {
    const ch = characters.find((c) => c.name === name)
    if (ch) {
      charDescs.push(`${ch.name}：${[ch.gender, ch.identity, ch.personality, ch.signature].filter(Boolean).join("，")}`)
    }
  }
  const charactersDesc = charDescs.join("\n")

  const sceneSummary = `地点：${options.sceneLocation}\n概要：${options.sceneSummary}`

  // Step 1: DeepSeek 生成场景画面 prompt
  let imagePrompt = ""
  try {
    imagePrompt = await generateSceneShotPrompt(
      sceneSummary,
      options.shotType,
      charactersDesc,
      storyContext
    )
  } catch { /* 降级 */ }
  if (!imagePrompt) {
    const typeLabel: Record<string, string> = { wide: "wide angle, full room, characters small in frame", medium: "waist-up framing, half-body, characters interacting", close: "close-up, face, shallow depth of field" }
    imagePrompt = `${typeLabel[options.shotType]}, ${options.sceneLocation}, ${options.sceneSummary.slice(0, 100)}, Asian drama, cinematic lighting`
  }

  // Step 2: MiniMax 出图
  const imageUrl = await generateImage(imagePrompt, {
    width: 1024,
    height: 576,
    referenceImage: options.referenceImages?.[0],
  })

  // 持久化（复用已读取的 project/scriptData）
  const visualAssets: VisualAssets = scriptData.visualAssets || {
    shotImages: {},
    shotPrompts: {},
    characterAvatars: {},
    shotVideos: {},
    assets: [],
  }
  if (!visualAssets.shotPrompts) visualAssets.shotPrompts = {}

  visualAssets.shotImages = { ...visualAssets.shotImages, [shotKey]: imageUrl }
  visualAssets.shotPrompts = { ...visualAssets.shotPrompts, [shotKey]: imagePrompt }

  // 添加到素材库
  const assetItem: VisualAssetItem = {
    id: `${shotKey}-${Date.now()}`,
    type: "image",
    name: `场景画面_${shotKey}`,
    url: imageUrl,
    source: "shot",
    sourceId: shotKey,
    createdAt: new Date().toISOString(),
  }
  visualAssets.assets = [assetItem, ...visualAssets.assets]

  await prisma.project.update({
    where: { id: projectId },
    data: { scriptData: JSON.stringify({ ...scriptData, visualAssets }) },
  })

  return { imageUrl, prompt: imagePrompt }
}

// ========================
// 角色头像生成
// ========================

export async function generateCharacterAvatarAction(
  projectId: string,
  characterId: string,
  characterDesc: string,
  options?: { model?: string; provider?: string }
): Promise<{ frontUrl: string; sideUrl: string; backUrl: string }> {
  const charName = characterDesc.split("\n")[0]?.replace("名字: ", "") || "角色"

  // 读取项目故事上下文
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  const scriptData = project?.scriptData ? JSON.parse(project.scriptData) : {}
  const genre = project?.genre || ""
  const logline = scriptData.logline || ""
  const worldBuilding = scriptData.worldBuilding || ""
  const theme = scriptData.theme || ""
  const storyContext = [
    genre ? `类型：${genre}` : "",
    logline ? `一句话简介：${logline}` : "",
    worldBuilding ? `世界观：${worldBuilding}` : "",
    theme ? `主题：${theme}` : "",
  ].filter(Boolean).join("\n")

  // Step 1: DeepSeek 结合故事背景生成角色外貌英文描述
  let baseDesc = ""
  try {
    baseDesc = await generateCharacterTurnaround(charName, characterDesc, storyContext)
  } catch { /* 降级 */ }
  if (!baseDesc) {
    const extract = (key: string) => {
      const m = characterDesc.match(new RegExp(`${key}[：:]\\s*(.+)`, "i"))
      return m?.[1]?.trim() || ""
    }
    baseDesc = [extract("性别"), extract("身份"), extract("性格"), extract("标志")]
      .filter(Boolean).join(", ") || characterDesc.slice(0, 200)
  }

  // Step 2: 生成正面（无参考），再以正面为参考生成侧/背面保证一致性
  const fullBody = "full body, standing pose, clean white background, professional character design, consistent lighting"
  const frontPrompt = `Front view, facing camera, ${baseDesc}, ${fullBody}`
  const sidePrompt = `Side profile view, 90-degree angle, same character, ${fullBody}`
  const backPrompt = `Back view, facing away from camera, same character, ${fullBody}`

  const frontUrl = await generateImage(frontPrompt, {
    width: 512, height: 768, model: options?.model, provider: options?.provider,
  })

  // 以正面为参考生成侧/背面
  const [sideUrl, backUrl] = await Promise.all([
    generateImage(sidePrompt, {
      width: 512, height: 768, model: options?.model, provider: options?.provider,
      referenceImage: frontUrl,
    }),
    generateImage(backPrompt, {
      width: 512, height: 768, model: options?.model, provider: options?.provider,
      referenceImage: frontUrl,
    }),
  ])

  // 持久化（复用已读取的 project 和 scriptData）
  const visualAssets: VisualAssets = scriptData.visualAssets || {
    shotImages: {},
    shotPrompts: {},
    characterAvatars: {},
    shotVideos: {},
    assets: [],
  }
  if (!visualAssets.shotPrompts) visualAssets.shotPrompts = {}

  visualAssets.characterAvatars = {
    ...visualAssets.characterAvatars,
    [characterId]: { front: frontUrl, side: sideUrl, back: backUrl },
  }

  const now = Date.now()
  const newAssets: VisualAssetItem[] = [
    { id: `char-${characterId}-front-${now}`, type: "image", name: `${charName}_正面`, url: frontUrl, source: "character", sourceId: characterId, createdAt: new Date().toISOString() },
    { id: `char-${characterId}-side-${now}`, type: "image", name: `${charName}_侧面`, url: sideUrl, source: "character", sourceId: characterId, createdAt: new Date().toISOString() },
    { id: `char-${characterId}-back-${now}`, type: "image", name: `${charName}_背面`, url: backUrl, source: "character", sourceId: characterId, createdAt: new Date().toISOString() },
  ]
  visualAssets.assets = [...newAssets, ...visualAssets.assets]

  await prisma.project.update({
    where: { id: projectId },
    data: { scriptData: JSON.stringify({ ...scriptData, visualAssets }) },
  })

  return { frontUrl, sideUrl, backUrl }
}

// ========================
// 图生视频
// ========================

export async function generateShotVideoAction(
  projectId: string,
  shotKey: string,
  imageUrl: string,
  prompt: string
): Promise<{ videoUrl: string }> {
  // 读取该镜头的 DeepSeek 画面 prompt 作为视频描述基础
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  const scriptData = project?.scriptData ? JSON.parse(project.scriptData) : {}
  const shotPrompt = scriptData.visualAssets?.shotPrompts?.[shotKey] || ""

  // Wan2.2 公式：Subject+Scene + Motion + 光影/镜头 + Style
  const videoPrompt = buildWanVideoPrompt({
    sceneDesc: shotPrompt,
    motionDesc: prompt?.trim() || undefined,
  })

  const videoUrl = await generateVideo(videoPrompt, {
    imageUrl,
    duration: 6,
  })

  // 持久化（复用已读取的 project/scriptData）
  const visualAssets: VisualAssets = scriptData.visualAssets || {
    shotImages: {},
    shotPrompts: {},
    characterAvatars: {},
    shotVideos: {},
    assets: [],
  }
  if (!visualAssets.shotPrompts) visualAssets.shotPrompts = {}

  visualAssets.shotVideos = { ...visualAssets.shotVideos, [shotKey]: videoUrl }

  const assetItem: VisualAssetItem = {
    id: `vid-${shotKey}-${Date.now()}`,
    type: "video",
    name: `视频片段_${shotKey}`,
    url: videoUrl,
    thumbnail: imageUrl,
    source: "shot",
    sourceId: shotKey,
    createdAt: new Date().toISOString(),
  }
  visualAssets.assets = [assetItem, ...visualAssets.assets]

  await prisma.project.update({
    where: { id: projectId },
    data: { scriptData: JSON.stringify({ ...scriptData, visualAssets }) },
  })

  return { videoUrl }
}

// ========================
// 素材管理
// ========================

export async function deleteVisualAsset(
  projectId: string,
  assetId: string
): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return false

  const scriptData = project.scriptData ? JSON.parse(project.scriptData) : {}
  const visualAssets: VisualAssets = scriptData.visualAssets || {
    shotImages: {},
    shotPrompts: {},
    characterAvatars: {},
    shotVideos: {},
    assets: [],
  }
  if (!visualAssets.shotPrompts) visualAssets.shotPrompts = {}

  const target = visualAssets.assets.find((a) => a.id === assetId)
  if (!target) return false

  // 清除对应关联
  if (target.source === "shot") {
    if (target.type === "image") {
      delete visualAssets.shotImages[target.sourceId]
    } else if (target.type === "video") {
      delete visualAssets.shotVideos[target.sourceId]
    }
  } else if (target.source === "character" && target.type === "image") {
    delete visualAssets.characterAvatars[target.sourceId]
  }

  visualAssets.assets = visualAssets.assets.filter((a) => a.id !== assetId)

  await prisma.project.update({
    where: { id: projectId },
    data: { scriptData: JSON.stringify({ ...scriptData, visualAssets }) },
  })

  return true
}

export async function renameVisualAsset(
  projectId: string,
  assetId: string,
  newName: string
): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return false

  const scriptData = project.scriptData ? JSON.parse(project.scriptData) : {}
  const visualAssets: VisualAssets = scriptData.visualAssets || {
    shotImages: {},
    shotPrompts: {},
    characterAvatars: {},
    shotVideos: {},
    assets: [],
  }
  if (!visualAssets.shotPrompts) visualAssets.shotPrompts = {}

  visualAssets.assets = visualAssets.assets.map((a) =>
    a.id === assetId ? { ...a, name: newName } : a
  )

  await prisma.project.update({
    where: { id: projectId },
    data: { scriptData: JSON.stringify({ ...scriptData, visualAssets }) },
  })

  return true
}

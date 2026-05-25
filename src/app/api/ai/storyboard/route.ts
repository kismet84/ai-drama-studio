import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { generateStoryboard } from "@/lib/ai"

// POST /api/ai/storyboard - AI 分镜生成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { episodeId, style } = body

    if (!episodeId) {
      return NextResponse.json({ error: "请指定剧集" }, { status: 400 })
    }

    // 获取剧集和最新剧本
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        scripts: { orderBy: { version: "desc" }, take: 1 },
        scenes: {
          where: { scriptId: { not: null } },
          orderBy: { sceneNum: "asc" },
          include: { dialogues: { orderBy: { order: "asc" } } },
        },
        project: { include: { characters: true } },
      },
    })

    if (!episode || !episode.scripts[0]) {
      return NextResponse.json({ error: "请先生成剧本" }, { status: 400 })
    }

    // 构建角色信息
    const characters = episode.project.characters
      .map((c) => `${c.name}(${c.role || "角色"}): ${c.description || ""}`)
      .join("\n")

    // 构建剧本内容
    const scriptContent = episode.scenes
      .map((s) => {
        const dialogues = s.dialogues.map((d) => `  ${d.speaker}: ${d.line}`).join("\n")
        return `场景${s.sceneNum}: ${s.location} - ${s.timeOfDay}\n${s.description}\n${dialogues}`
      })
      .join("\n\n")

    // 调用 AI 分镜
    const aiResponse = await generateStoryboard(scriptContent, characters, style || "现代都市")

    // 解析分镜数据
    let storyboardData: {
      storyboard?: Array<{
        sceneNum: number
        shots: Array<{
          shotNum: number
          cameraAngle: string
          cameraMovement?: string
          description: string
          duration: number
          imagePrompt: string
        }>
        dialogues?: Array<{ speaker: string; line: string; emotion: string }>
      }>
    }

    try {
      storyboardData = JSON.parse(aiResponse)
    } catch {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        storyboardData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error("无法解析分镜数据")
      }
    }

    // 保存分镜镜头到数据库
    if (storyboardData.storyboard) {
      for (const sbScene of storyboardData.storyboard) {
        const scene = episode.scenes.find((s) => s.sceneNum === sbScene.sceneNum)
        if (!scene) continue

        for (const shot of sbScene.shots) {
          await prisma.shot.create({
            data: {
              sceneId: scene.id,
              shotNum: shot.shotNum,
              cameraAngle: shot.cameraAngle,
              description: shot.description,
              duration: shot.duration || 5,
              aiPrompt: shot.imagePrompt,
              status: "pending",
            },
          })
        }
      }
    }

    // 更新剧集状态
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "visual_done" },
    })

    return NextResponse.json({
      storyboard: storyboardData.storyboard || [],
      metadata: {
        totalShots: storyboardData.storyboard?.reduce((sum, s) => sum + s.shots.length, 0) || 0,
      },
    })
  } catch (error) {
    console.error("Storyboard generation failed:", error)
    const message = error instanceof Error ? error.message : "分镜生成失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

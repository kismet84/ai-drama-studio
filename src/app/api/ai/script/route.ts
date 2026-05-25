import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { generateScript } from "@/lib/ai"

// POST /api/ai/script - AI 剧本生成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt, genre, episodeId } = body

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: "请输入创作需求" }, { status: 400 })
    }

    if (!episodeId) {
      return NextResponse.json({ error: "请指定剧集" }, { status: 400 })
    }

    // 验证剧集存在
    const episode = await prisma.episode.findUnique({ where: { id: episodeId } })
    if (!episode) {
      return NextResponse.json({ error: "剧集不存在" }, { status: 404 })
    }

    // 调用 AI 生成
    const aiResponse = await generateScript(prompt, genre)
    
    // 解析 JSON
    let scriptData: {
      title?: string
      genre?: string
      synopsis?: string
      scenes?: Array<{
        sceneNum: number
        location: string
        timeOfDay: string
        description: string
        dialogues: Array<{
          speaker: string
          line: string
          emotion?: string
          camera?: string
        }>
      }>
    }
    
    try {
      scriptData = JSON.parse(aiResponse)
    } catch {
      // 尝试提取 JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        scriptData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error("无法解析 AI 返回的剧本数据")
      }
    }

    // 保存到数据库
    const content = JSON.stringify(scriptData)
    const wordCount = content.length
    const sceneCount = scriptData.scenes?.length || 0

    // 获取当前最大版本号
    const latestScript = await prisma.script.findFirst({
      where: { episodeId },
      orderBy: { version: "desc" },
    })
    const newVersion = (latestScript?.version || 0) + 1

    const script = await prisma.script.create({
      data: {
        episodeId,
        version: newVersion,
        content,
        wordCount,
        sceneCount,
        aiModel: process.env.AI_PROVIDER || "openai",
        aiPrompt: prompt,
      },
    })

    // 创建场景和台词记录
    if (scriptData.scenes) {
      for (const scene of scriptData.scenes) {
        const createdScene = await prisma.scene.create({
          data: {
            episodeId,
            scriptId: script.id,
            sceneNum: scene.sceneNum,
            location: scene.location,
            timeOfDay: scene.timeOfDay,
            description: scene.description,
            status: "pending",
          },
        })

        if (scene.dialogues) {
          await prisma.dialogue.createMany({
            data: scene.dialogues.map((d, idx) => ({
              sceneId: createdScene.id,
              speaker: d.speaker,
              line: d.line,
              emotion: d.emotion || null,
              order: idx,
            })),
          })
        }
      }
    }

    // 更新剧集状态
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "script_done", title: scriptData.title || episode.title },
    })

    return NextResponse.json({
      script: {
        id: script.id,
        version: script.version,
        content: scriptData,
        wordCount: script.wordCount,
        sceneCount: script.sceneCount,
      },
      metadata: {
        model: script.aiModel,
        version: script.version,
      },
    })
  } catch (error) {
    console.error("Script generation failed:", error)
    const message = error instanceof Error ? error.message : "剧本生成失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

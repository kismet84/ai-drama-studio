import { NextRequest, NextResponse } from "next/server"
import { generateImage, generateSpeech, checkAIStatus } from "@/lib/ai"

// POST /api/ai/image - AI 图片生成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt, negativePrompt, width, height, shotId } = body

    if (!prompt) {
      return NextResponse.json({ error: "请输入绘图提示词" }, { status: 400 })
    }

    const imageUrl = await generateImage(prompt, {
      negativePrompt,
      width: width || 1024,
      height: height || 1024,
    })

    return NextResponse.json({ imageUrl, model: "dall-e-3" })
  } catch (error) {
    console.error("Image generation failed:", error)
    const message = error instanceof Error ? error.message : "图片生成失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

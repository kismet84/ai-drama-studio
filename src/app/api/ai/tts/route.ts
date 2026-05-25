import { NextRequest, NextResponse } from "next/server"
import { generateSpeech } from "@/lib/ai"

// POST /api/ai/tts - AI 语音合成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, voice, speed, emotion } = body

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "请输入配音文本" }, { status: 400 })
    }

    const result = await generateSpeech(text, { voice, speed, emotion })

    return NextResponse.json({
      audioBase64: result.audioBase64,
      duration: result.duration,
      format: "mp3",
    })
  } catch (error) {
    console.error("TTS failed:", error)
    const message = error instanceof Error ? error.message : "语音合成失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

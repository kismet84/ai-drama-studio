import { NextResponse } from "next/server"
import { checkAIStatus } from "@/lib/ai"

// GET /api/ai/status - 检查 AI 服务状态
export async function GET() {
  try {
    const isOnline = await checkAIStatus()
    return NextResponse.json({
      status: isOnline ? "online" : "offline",
      provider: process.env.AI_PROVIDER || "openai",
    })
  } catch {
    return NextResponse.json({ status: "offline", error: "无法连接 AI 服务" })
  }
}

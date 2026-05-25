import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

// GET /api/projects/[id]/episodes - 获取项目剧集列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const episodes = await prisma.episode.findMany({
      where: { projectId: id },
      include: {
        scripts: { orderBy: { version: "desc" }, take: 1 },
        _count: { select: { scenes: true } },
      },
      orderBy: { episodeNum: "asc" },
    })

    return NextResponse.json(episodes)
  } catch (error) {
    return NextResponse.json({ error: "获取剧集列表失败" }, { status: 500 })
  }
}

// POST /api/projects/[id]/episodes - 创建新剧集
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { title, episodeNum } = body

    // 自动计算集数
    let num = episodeNum
    if (!num) {
      const maxEpisode = await prisma.episode.findFirst({
        where: { projectId: id },
        orderBy: { episodeNum: "desc" },
        select: { episodeNum: true },
      })
      num = (maxEpisode?.episodeNum || 0) + 1
    }

    const episode = await prisma.episode.create({
      data: {
        projectId: id,
        episodeNum: num,
        title: title || `第${num}集`,
      },
    })

    return NextResponse.json(episode, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: "创建剧集失败" }, { status: 500 })
  }
}

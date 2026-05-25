import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

// GET /api/projects/[id]/episodes/[episodeId] - 获取单个剧集详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { episodeId } = await params

    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        scripts: {
          orderBy: { version: "desc" },
          include: {
            scenes: {
              orderBy: { sceneNum: "asc" },
              include: {
                shots: { orderBy: { shotNum: "asc" } },
                dialogues: { orderBy: { order: "asc" } },
              },
            },
          },
        },
        scenes: {
          where: { scriptId: null },
          orderBy: { sceneNum: "asc" },
          include: {
            shots: { orderBy: { shotNum: "asc" } },
            dialogues: { orderBy: { order: "asc" } },
          },
        },
      },
    })

    if (!episode) {
      return NextResponse.json({ error: "剧集不存在" }, { status: 404 })
    }

    return NextResponse.json(episode)
  } catch (error) {
    return NextResponse.json({ error: "获取剧集详情失败" }, { status: 500 })
  }
}

// PATCH /api/projects/[id]/episodes/[episodeId] - 更新剧集
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { episodeId } = await params
    const body = await req.json()

    const episode = await prisma.episode.update({
      where: { id: episodeId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.status !== undefined && { status: body.status }),
      },
    })

    return NextResponse.json(episode)
  } catch (error) {
    return NextResponse.json({ error: "更新剧集失败" }, { status: 500 })
  }
}

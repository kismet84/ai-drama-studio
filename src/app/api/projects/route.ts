import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

// GET /api/projects - 获取项目列表
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        _count: { select: { episodes: true } },
      },
      orderBy: { updatedAt: "desc" },
    })

    const data = projects.map((p) => {
      const sd = p.scriptData ? JSON.parse(p.scriptData) : null
      // 集数优先从剧本正文统计（scriptData.episodeScripts），其次 Prisma Episode 表
      const scriptEps = sd?.episodeScripts
        ? Object.values(sd.episodeScripts as Record<number, string>).filter(Boolean).length
        : 0
      const episodeCount = scriptEps || p._count.episodes

      return {
        id: p.id,
        title: p.title,
        description: p.description,
        thumbnail: p.thumbnail,
        status: p.status,
        genre: p.genre,
        scriptData: sd,
        episodeCount,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch projects:", error)
    return NextResponse.json({ error: "获取项目列表失败" }, { status: 500 })
  }
}

// POST /api/projects - 创建新项目
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, description, genre } = body

    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: "项目名称不能为空" }, { status: 400 })
    }

    const project = await prisma.project.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        genre: genre || null,
        status: "draft",
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error("Failed to create project:", error)
    return NextResponse.json({ error: "创建项目失败" }, { status: 500 })
  }
}

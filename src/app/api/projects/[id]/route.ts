import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

// GET /api/projects/[id] - 获取单个项目详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: { episodeNum: "asc" },
          include: {
            scripts: { orderBy: { version: "desc" }, take: 1 },
            _count: { select: { scenes: true } },
          },
        },
        characters: true,
        _count: { select: { assets: true } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 })
    }

    return NextResponse.json({
      ...project,
      scriptData: project.scriptData ? JSON.parse(project.scriptData) : null,
    })
  } catch (error) {
    console.error("Failed to fetch project:", error)
    return NextResponse.json({ error: "获取项目详情失败" }, { status: 500 })
  }
}

// PATCH /api/projects/[id] - 更新项目
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.thumbnail !== undefined && { thumbnail: body.thumbnail }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.genre !== undefined && { genre: body.genre }),
        ...(body.scriptData !== undefined && { scriptData: typeof body.scriptData === "string" ? body.scriptData : JSON.stringify(body.scriptData) }),
      },
    })

    return NextResponse.json(project)
  } catch (error) {
    console.error("Failed to update project:", error)
    return NextResponse.json({ error: "更新项目失败" }, { status: 500 })
  }
}

// DELETE /api/projects/[id] - 删除项目
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await prisma.project.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete project:", error)
    return NextResponse.json({ error: "删除项目失败" }, { status: 500 })
  }
}

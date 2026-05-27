"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { generateText } from "@/lib/ai"

export async function quickCreateProject() {
  const project = await prisma.project.create({
    data: {
      title: "新项目",
      status: "draft",
    },
  })

  redirect(`/studio/${project.id}/script`)
}

export async function suggestProjectTitle(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project?.scriptData) return "未命名项目"

  const sd = JSON.parse(project.scriptData)
  const logline = sd.logline || ""
  const topic = sd.topicTitle || ""
  const genre = project.genre || ""

  if (!logline && !topic) return "未命名项目"

  const result = await generateText(
    `你是短剧策划。基于以下信息，生成 1 个短剧名称，优先用国风诗词风格（如"桃花马上请长缨"）。

选题：${topic}
简介：${logline}

命名要求：
- 10 字以内
- 有记忆点，不低俗
- 严禁输出除剧名外的任何文字
- 严禁加引号、书名号、序号、标点
- 只输出剧名本身`

  )

  return result.trim().replace(/^[《〈「『\s\d\.、。，,]+/, "").replace(/[》〉」』\s]+$/, "").slice(0, 20) || "未命名项目"
}

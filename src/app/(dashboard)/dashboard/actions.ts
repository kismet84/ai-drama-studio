"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"

export async function quickCreateProject() {
  const project = await prisma.project.create({
    data: {
      title: "新项目",
      status: "draft",
    },
  })

  redirect(`/studio/${project.id}/script`)
}

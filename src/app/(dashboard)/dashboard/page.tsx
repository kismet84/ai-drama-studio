"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Film,
  MoreHorizontal,
  Play,
  Clock,
  Edit3,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { quickCreateProject } from "./actions"
import type { ProjectSummary } from "@/types"

const statusLabels: Record<string, string> = {
  draft: "草稿",
  in_progress: "制作中",
  completed: "已完成",
  published: "已发布",
}

const statusVariants: Record<string, "default" | "secondary" | "success" | "warning"> = {
  draft: "secondary",
  in_progress: "warning",
  completed: "success",
  published: "default",
}

const genreColors: Record<string, string> = {
  "霸总": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "甜宠": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  "逆袭": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "悬疑": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "古装": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "都市": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    try {
      setLoading(true)
      const res = await fetch("/api/projects")
      if (!res.ok) throw new Error("加载失败")
      const data = await res.json()
      setProjects(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载项目失败")
    } finally {
      setLoading(false)
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("确定要删除这个项目吗？此操作不可撤销。")) return
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" })
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch {
      alert("删除失败")
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">项目总览</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            {projects.length === 0
              ? "创建你的第一个AI短剧项目"
              : `共 ${projects.length} 个项目`}
          </p>
        </div>
        <form action={quickCreateProject}>
          <Button type="submit" variant="primary">
            <Play className="h-4 w-4" />
            创建新项目
          </Button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <Button variant="link" size="sm" onClick={fetchProjects} className="ml-2">
            重试
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!loading && projects.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Film className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2">还没有项目</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-4 text-center max-w-md">
              开始你的第一个AI短剧创作之旅。从剧本到成片，AI全程助力。
            </p>
            <form action={quickCreateProject}>
              <Button type="submit" variant="primary">创建第一个项目</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Project Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <Card
            key={project.id}
            className="group hover:shadow-md transition-all duration-200 hover:border-indigo-200 dark:hover:border-indigo-800"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">
                    <Link
                      href={`/studio/${project.id}/script`}
                      className="hover:text-indigo-600 transition-colors"
                    >
                      {project.title}
                    </Link>
                  </CardTitle>
                  <CardDescription className="mt-1 line-clamp-2">
                    {project.description || "暂无描述"}
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0 -mr-2">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/studio/${project.id}/script`}>
                        <Edit3 className="h-4 w-4 mr-2" />
                        编辑项目
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => deleteProject(project.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      删除项目
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 flex-wrap">
                {project.genre && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      genreColors[project.genre] || "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {project.genre}
                  </span>
                )}
                <Badge variant={statusVariants[project.status] || "secondary"}>
                  {statusLabels[project.status] || project.status}
                </Badge>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto flex items-center gap-1">
                  <Film className="h-3 w-3" />
                  {project.episodeCount} 集
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-zinc-400">
                <Clock className="h-3 w-3" />
                {new Date(project.updatedAt).toLocaleDateString("zh-CN")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

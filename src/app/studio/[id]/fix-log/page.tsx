"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, Clock, FileText, Loader2 } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { FixLogEntry } from "@/types"

const categoryColors: Record<string, string> = {
  "逻辑": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "人设": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "节奏": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "悬念": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "合规": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

export default function FixLogPage() {
  const params = useParams()
  const projectId = params.id as string
  const [logs, setLogs] = useState<FixLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.scriptData?.fixLogs || [])
      })
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/studio/${projectId}/script`} className="text-zinc-400 hover:text-zinc-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h2 className="text-lg font-bold">修复日志</h2>
            <p className="text-sm text-zinc-500">每次一键调整的修改记录</p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无修复记录</p>
            <p className="text-xs mt-1">在 Step 8 复盘中使用「一键调整」后，修改记录会显示在这里</p>
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={categoryColors[log.category] || "bg-zinc-100"}>{log.category}</Badge>
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{log.target}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <Clock className="h-3 w-3" />
                      {log.time}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Before */}
                  <div>
                    <span className="text-xs font-semibold text-red-500 dark:text-red-400 mb-1 block">修改前</span>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 bg-red-50/50 dark:bg-red-950/20 rounded-lg p-3 whitespace-pre-wrap border border-red-100 dark:border-red-900/30">
                      {log.before || "(无内容)"}
                    </div>
                  </div>
                  {/* After */}
                  <div>
                    <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400 mb-1 block">修改后</span>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg p-3 whitespace-pre-wrap border border-emerald-100 dark:border-emerald-900/30">
                      {log.after || "(无内容)"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

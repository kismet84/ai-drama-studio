"use client"

import { useState } from "react"
import { User, Loader2, Sparkles, RefreshCw, Maximize2, X, Settings2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import type { CharacterCard } from "@/types"
import type { VisualAssets } from "../_actions"

// 可用模型列表（与 lib/ai/client.ts IMAGE_MODELS 保持同步）
const AVATAR_MODELS = [
  { id: "image-01", label: "MiniMax Image-01", desc: "通用写实风格" },
  { id: "image-01-live", label: "MiniMax Image-01 Live", desc: "多画风可选" },
]

interface CharacterImagePanelProps {
  characters: CharacterCard[]
  visualAssets: VisualAssets
  onGenerateAvatar: (characterId: string, desc: string, model?: string) => Promise<void>
  generating: string | null
}

export default function CharacterImagePanel({
  characters,
  visualAssets,
  onGenerateAvatar,
  generating,
}: CharacterImagePanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>(AVATAR_MODELS[0].id)
  const [showModelConfig, setShowModelConfig] = useState(false)

  const roleBadgeVariant: Record<string, string> = {
    "主角": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "反派": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "配角": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  }

  const buildCharDesc = (char: CharacterCard): string => {
    const parts: string[] = []
    parts.push(`名字: ${char.name}`)
    if (char.role) parts.push(`定位: ${char.role}`)
    if (char.gender) parts.push(`性别: ${char.gender}`)
    if (char.identity) parts.push(`身份: ${char.identity}`)
    if (char.personality) parts.push(`性格: ${char.personality}`)
    if (char.secret) parts.push(`秘密: ${char.secret}`)
    if (char.goal) parts.push(`目的: ${char.goal}`)
    if (char.signature) parts.push(`标志: ${char.signature}`)
    return parts.join("\n")
  }

  const currentModel = AVATAR_MODELS.find((m) => m.id === selectedModel)

  if (characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-3">
        <User className="h-10 w-10 opacity-50" />
        <p className="text-sm">暂无角色数据</p>
        <p className="text-xs">请先在剧本工坊完成 Step 4 人物属性卡</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={previewUrl}
            alt="预览"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}

      {/* 模型配置栏 */}
      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          onClick={() => setShowModelConfig(!showModelConfig)}
        >
          <Settings2 className="h-3.5 w-3.5" />
          模型配置
          <ChevronDown className={cn("h-3 w-3 transition-transform", showModelConfig && "rotate-180")} />
        </button>
        {!showModelConfig && currentModel && (
          <span className="text-xs text-zinc-400">
            {currentModel.label}
          </span>
        )}
      </div>

      {showModelConfig && (
        <Card className="border-dashed">
          <CardContent className="py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-zinc-500 shrink-0">生图模型：</span>
              {AVATAR_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs transition-colors text-left",
                    selectedModel === m.id
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 ring-1 ring-indigo-500"
                      : "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  )}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {characters
          .filter((c) => c.name)
          .map((char) => {
            const turnaround = visualAssets.characterAvatars[char.id]
            const isGen = generating === char.id

            return (
              <Card key={char.id} className="overflow-hidden">
                {/* 三视图预览区 */}
                {turnaround ? (
                  <div className="flex h-40 bg-zinc-100 dark:bg-zinc-800">
                    {(["front", "side", "back"] as const).map((view) => (
                      <div key={view} className="flex-1 relative border-r border-zinc-200 dark:border-zinc-700 last:border-r-0">
                        <img
                          src={turnaround[view]}
                          alt={`${char.name}_${view}`}
                          className="w-full h-full object-cover cursor-zoom-in"
                          onClick={() => setPreviewUrl(turnaround[view])}
                        />
                        <span className="absolute bottom-0.5 left-1 text-[9px] bg-black/50 text-white px-1 rounded">
                          {view === "front" ? "正" : view === "side" ? "侧" : "背"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : isGen ? (
                  <div className="h-40 flex flex-col items-center justify-center text-zinc-400 gap-2 bg-zinc-50 dark:bg-zinc-800/50">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-xs">AI 生成中...</span>
                  </div>
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center text-zinc-400 gap-2 bg-zinc-50 dark:bg-zinc-800/50">
                    <User className="h-8 w-8 opacity-50" />
                    <span className="text-xs">点击下方按钮生成三视图</span>
                  </div>
                )}

                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold truncate">
                        {char.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            roleBadgeVariant[char.role] ||
                              "bg-zinc-100 text-zinc-600 dark:bg-zinc-800"
                          )}
                        >
                          {char.role}
                        </span>
                        {char.gender && char.gender !== "未知" && (
                          <span className="text-[10px] text-zinc-400">
                            {char.gender === "male" ? "男" : char.gender === "female" ? "女" : char.gender}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Character details */}
                  <div className="text-xs text-zinc-500 space-y-0.5">
                    {char.identity && (
                      <p className="truncate" title={char.identity}>
                        身份: {char.identity}
                      </p>
                    )}
                    {char.personality && (
                      <p className="truncate" title={char.personality}>
                        性格: {char.personality}
                      </p>
                    )}
                    {char.secret && (
                      <p className="truncate text-amber-600 dark:text-amber-400" title={char.secret}>
                        秘密: {char.secret}
                      </p>
                    )}
                  </div>

                  <Button
                    variant={turnaround ? "outline" : "primary"}
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5"
                    disabled={isGen || !!generating}
                    onClick={() =>
                      onGenerateAvatar(char.id, buildCharDesc(char), selectedModel)
                    }
                  >
                    {isGen ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : turnaround ? (
                      <>
                        <RefreshCw className="h-3 w-3" />
                        重新生成
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3" />
                        AI 生成三视图
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
      </div>
    </div>
  )
}

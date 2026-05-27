"use client"

import { useState } from "react"
import {
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Play,
  X,
  Maximize2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import type { SceneOutline, CharacterCard } from "@/types"
import type { VisualAssets } from "../_actions"

interface SceneImagePanelProps {
  episodeOutlines: { episodeNum: number; title: string; summary: string }[]
  episodeSceneOutlines: Record<number, SceneOutline[]>
  characters: CharacterCard[]
  visualAssets: VisualAssets
  logline: string
  onGenerateShot: (
    shotKey: string,
    shotType: "wide" | "medium" | "close",
    sceneEpisode: number,
    sceneNum: number,
    sceneSummary: string,
    sceneLocation: string,
    sceneChars: string[],
    referenceImages?: string[]
  ) => Promise<void>
  generating: string | null
}

export default function SceneImagePanel({
  episodeOutlines,
  episodeSceneOutlines,
  characters,
  visualAssets,
  logline,
  onGenerateShot,
  generating,
}: SceneImagePanelProps) {
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set())
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set())
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const toggleEpisode = (ep: number) => {
    setExpandedEpisodes((prev) => {
      const next = new Set(prev)
      if (next.has(ep)) next.delete(ep)
      else next.add(ep)
      return next
    })
  }

  const toggleScene = (key: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** 根据场景角色列表匹配已生成的三视图 front 图作为人物参考 */
  const getCharReferences = (scene: SceneOutline): string[] => {
    const refs: string[] = []
    for (const name of scene.characters || []) {
      const char = characters.find((c) => c.name === name)
      if (!char) continue
      const turnaround = visualAssets.characterAvatars[char.id]
      if (turnaround?.front) refs.push(turnaround.front)
    }
    return refs
  }

  // Default shot types with explicit camera framing
  const defaultShotTypes = [
    {
      key: "wide",
      label: "全景",
      prompt: "full body shot, wide angle lens, the entire room visible, characters are small figures within the environment, establishing shot showing spatial relationships and room layout",
    },
    {
      key: "medium",
      label: "中景",
      prompt: "waist-up or knee-up framing, two or more characters interacting, characters occupy about half of the frame height, medium focal length, natural body language visible",
    },
    {
      key: "close",
      label: "特写",
      prompt: "close-up shot, head and shoulders or face only, shallow depth of field, blurred background, emphasizing facial expressions and emotional reactions, portrait framing",
    },
  ]

  if (episodeOutlines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-3">
        <ImageIcon className="h-10 w-10 opacity-50" />
        <p className="text-sm">暂无分集数据</p>
        <p className="text-xs">请先在剧本工坊完成 Step 7 分集大纲和 Step 8 分场大纲</p>
      </div>
    )
  }

  const sortedEps = [...episodeOutlines].sort((a, b) => a.episodeNum - b.episodeNum)

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

      {sortedEps.map((ep) => {
        const scenes = (episodeSceneOutlines[ep.episodeNum] || []).sort(
          (a, b) => a.sceneNum - b.sceneNum
        )
        const epExpanded = expandedEpisodes.has(ep.episodeNum)

        return (
          <Card key={ep.episodeNum}>
            <CardHeader
              className="pb-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors rounded-t-xl"
              onClick={() => toggleEpisode(ep.episodeNum)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {epExpanded ? (
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-400" />
                  )}
                  <CardTitle className="text-sm">
                    第{ep.episodeNum}集 {ep.title}
                  </CardTitle>
                  <Badge className="text-xs">{scenes.length} 场</Badge>
                </div>
              </div>
            </CardHeader>

            {epExpanded && (
              <CardContent className="space-y-2 pt-0">
                {scenes.length === 0 && (
                  <p className="text-xs text-zinc-400 py-4 text-center">
                    该集暂无分场数据，请先在剧本工坊生成分场大纲
                  </p>
                )}

                {scenes.map((scene) => {
                  const sceneKey = `${ep.episodeNum}-${scene.sceneNum}`
                  const sceneExpanded = expandedScenes.has(sceneKey)

                  return (
                    <div
                      key={sceneKey}
                      className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden"
                    >
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                        onClick={() => toggleScene(sceneKey)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {sceneExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          )}
                          <span className="text-xs font-medium">
                            场景 {scene.sceneNum}
                          </span>
                          <span className="text-xs text-zinc-500 truncate">
                            {scene.location}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-400 shrink-0 ml-2">
                          {scene.characters?.join("、") || "无角色"}
                        </span>
                      </button>

                      {sceneExpanded && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                          <p className="text-xs text-zinc-500 my-2">
                            {scene.summary}
                          </p>

                          {/* Quick shot type buttons */}
                          <div className="space-y-2">
                            {defaultShotTypes.map((shot) => {
                              const shotKey = `${sceneKey}-${shot.key}`
                              const imageUrl = visualAssets.shotImages[shotKey]
                              const isGen = generating === shotKey

                              return (
                                <div key={shot.key}>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge className="text-[10px] bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30">
                                          {shot.label}
                                        </Badge>
                                        <span className="text-xs text-zinc-400 truncate">
                                          {visualAssets.shotPrompts?.[shotKey] || "DeepSeek 自动生成 prompt"}
                                        </span>
                                      </div>
                                      {imageUrl ? (
                                        <div className="relative group rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                                          <img
                                            src={imageUrl}
                                            alt={`场景${scene.sceneNum}-${shot.label}`}
                                            className="w-full h-32 object-cover cursor-zoom-in"
                                            onClick={() => setPreviewUrl(imageUrl)}
                                          />
                                          <button
                                            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => setPreviewUrl(imageUrl)}
                                          >
                                            <Maximize2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700 h-20 flex items-center justify-center">
                                          {isGen ? (
                                            <div className="flex items-center gap-2 text-sm text-zinc-400">
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                              AI 生成中...
                                            </div>
                                          ) : (
                                            <p className="text-xs text-zinc-400">点击右侧按钮生成</p>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs gap-1 shrink-0"
                                      disabled={isGen || !!generating}
                                      onClick={() => {
                                        const refs = getCharReferences(scene)
                                        onGenerateShot(
                                          shotKey,
                                          shot.key as "wide" | "medium" | "close",
                                          ep.episodeNum,
                                          scene.sceneNum,
                                          scene.summary || "",
                                          scene.location || "室内",
                                          scene.characters || [],
                                          refs.length > 0 ? refs : undefined
                                        )
                                      }}
                                    >
                                      {isGen ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : imageUrl ? (
                                        <>
                                          <Sparkles className="h-3 w-3" />
                                          重生成
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-3 w-3" />
                                          生成
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}

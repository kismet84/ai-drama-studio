"use client"

import { useState } from "react"
import { Film, Loader2, Sparkles, Play, X, Image as ImageIcon, Combine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { VisualAssets } from "../_actions"

interface VideoPanelProps {
  visualAssets: VisualAssets
  onGenerateVideo: (shotKey: string, imageUrl: string, prompt: string) => Promise<void>
  generating: string | null
}

export default function VideoPanel({
  visualAssets,
  onGenerateVideo,
  generating,
}: VideoPanelProps) {
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [concating, setConcating] = useState<string | null>(null)
  const [concatResults, setConcatResults] = useState<Record<string, string>>({})

  const sceneShots = new Map<string, { episode: string; scene: string; wide?: string; medium?: string; close?: string }>()
  for (const [key, url] of Object.entries(visualAssets.shotImages)) {
    const parts = key.split("-")
    const sceneKey = `${parts[0]}-${parts[1]}`
    if (!sceneShots.has(sceneKey)) sceneShots.set(sceneKey, { episode: parts[0], scene: parts[1] })
    const entry = sceneShots.get(sceneKey)!
    if (key.endsWith("-wide")) entry.wide = url
    else if (key.endsWith("-medium")) entry.medium = url
    else if (key.endsWith("-close")) entry.close = url
  }

  const handleConcat = async (sceneKey: string) => {
    const shots = sceneShots.get(sceneKey)
    if (!shots) return
    const mKey = `${sceneKey}-medium`; const cKey = `${sceneKey}-close`
    const mVid = visualAssets.shotVideos[mKey]; const cVid = visualAssets.shotVideos[cKey]
    if (!mVid || !cVid) return

    setConcating(sceneKey)
    try {
      const res = await fetch("/api/video/concat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [mVid, cVid] }),
      })
      const data = await res.json()
      if (data.videoBase64) setConcatResults(prev => ({ ...prev, [sceneKey]: data.videoBase64 }))
      else alert("合成失败")
    } catch { alert("合成失败") }
    finally { setConcating(null) }
  }

  const typeLabel: Record<string, string> = { medium: "中景", close: "特写" }
  const videoTypes = ["medium", "close"] as const

  if (sceneShots.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-3">
        <Film className="h-10 w-10 opacity-50" />
        <p className="text-sm">暂无可用的场景画面</p>
        <p className="text-xs">请先在"场景画面"标签页中生成画面</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out" onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setPreviewUrl(null)}><X className="h-8 w-8" /></button>
          <video src={previewUrl} controls autoPlay loop className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl" />
        </div>
      )}

      <p className="text-xs text-zinc-400">中景和特写各自生成视频后，点击「合成镜头」拼接为一段</p>

      {Array.from(sceneShots.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([sceneKey, shots]) => {
        const mKey = `${sceneKey}-medium`; const cKey = `${sceneKey}-close`
        const mVid = visualAssets.shotVideos[mKey]; const cVid = visualAssets.shotVideos[cKey]
        const bothReady = !!mVid && !!cVid
        const concatResult = concatResults[sceneKey]
        const isConcating = concating === sceneKey

        return (
          <div key={sceneKey} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">第{shots.episode}集 场景{shots.scene}</h3>
              {bothReady && !concatResult && (
                <Button variant="primary" size="sm" className="h-6 text-[10px] gap-1" disabled={isConcating} onClick={() => handleConcat(sceneKey)}>
                  {isConcating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Combine className="h-3 w-3" />}
                  {isConcating ? "合成中..." : "合成镜头"}
                </Button>
              )}
              {concatResult && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setPreviewUrl(`data:video/mp4;base64,${concatResult}`)}>
                  <Play className="h-3 w-3" />播放合成
                </Button>
              )}
            </div>

            {/* 全景参考 */}
            {shots.wide && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-14 rounded overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0">
                  <img src={shots.wide} alt="全景" className="w-full h-full object-cover opacity-50" />
                </div>
                <span className="text-[10px] text-zinc-400">全景（参考）</span>
              </div>
            )}

            {/* 中景 + 特写 */}
            <div className="flex gap-3">
              {videoTypes.map(type => {
                const imageUrl = shots[type]
                if (!imageUrl) return null
                const shotKey = `${sceneKey}-${type}`
                const videoUrl = visualAssets.shotVideos[shotKey]
                const isGen = generating === shotKey

                return (
                  <Card key={type} className="overflow-hidden flex-1 min-w-0">
                    <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 relative">
                      <img src={imageUrl} alt={type} className="w-full h-full object-cover" />
                      <Badge className="absolute top-1 left-1 text-[9px] bg-black/60 text-white border-none">{typeLabel[type]}</Badge>
                      {videoUrl && <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <button className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30" onClick={() => setPreviewUrl(videoUrl)}><Play className="h-5 w-5 fill-white" /></button>
                      </div>}
                    </div>
                    <CardContent className="p-2 space-y-1">
                      {!videoUrl ? (
                        <>
                          <input className="w-full text-[10px] px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" placeholder="动效（可选）"
                            value={prompts[shotKey] || ""} onChange={e => setPrompts(prev => ({ ...prev, [shotKey]: e.target.value }))} />
                          <Button variant="primary" size="sm" className="w-full h-6 text-[10px] gap-1" disabled={isGen || !!generating}
                            onClick={() => onGenerateVideo(shotKey, imageUrl, prompts[shotKey] || "Smooth camera movement, cinematic clip")}>
                            {isGen ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            {isGen ? "生成中..." : "生成视频"}
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <Badge className="text-[9px] bg-emerald-50 text-emerald-600">已生成</Badge>
                          <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setPreviewUrl(videoUrl)}><Play className="h-3 w-3 mr-1" />播放</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

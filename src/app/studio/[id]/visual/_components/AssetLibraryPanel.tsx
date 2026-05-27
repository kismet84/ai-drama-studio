"use client"

import { useState, useCallback } from "react"
import {
  FolderOpen,
  Loader2,
  Trash2,
  Download,
  Edit3,
  Check,
  X,
  SlidersHorizontal,
  Maximize2,
  Image as ImageIcon,
  Film,
  Play,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import type { VisualAssetItem, VisualAssets } from "../_actions"

interface AssetLibraryPanelProps {
  visualAssets: VisualAssets
  onDeleteAsset: (assetId: string) => Promise<void>
  onRenameAsset: (assetId: string, newName: string) => Promise<void>
}

export default function AssetLibraryPanel({
  visualAssets,
  onDeleteAsset,
  onRenameAsset,
}: AssetLibraryPanelProps) {
  const [filter, setFilter] = useState<"all" | "image" | "video">("all")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<"image" | "video" | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)

  // Color grading state
  const [activeGrading, setActiveGrading] = useState<string | null>(null)
  const [gradingValues, setGradingValues] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
  })

  const assets = visualAssets.assets || []
  const filtered =
    filter === "all"
      ? assets
      : assets.filter((a) => a.type === filter)

  const handleDelete = async (assetId: string) => {
    setDeleting(assetId)
    try {
      await onDeleteAsset(assetId)
    } finally {
      setDeleting(null)
    }
  }

  const handleStartRename = (asset: VisualAssetItem) => {
    setEditingId(asset.id)
    setEditName(asset.name)
  }

  const handleSaveRename = async (assetId: string) => {
    if (editName.trim()) {
      await onRenameAsset(assetId, editName.trim())
    }
    setEditingId(null)
  }

  const getCssFilter = () => {
    const { brightness, contrast, saturation, hue, blur } = gradingValues
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg) blur(${blur}px)`
  }

  const resetGrading = () => {
    setGradingValues({ brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0 })
  }

  const imageCount = assets.filter((a) => a.type === "image").length
  const videoCount = assets.filter((a) => a.type === "video").length

  return (
    <div className="space-y-4">
      {/* Filter & Stats Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button
            variant={filter === "all" ? "primary" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter("all")}
          >
            全部 ({assets.length})
          </Button>
          <Button
            variant={filter === "image" ? "primary" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setFilter("image")}
          >
            <ImageIcon className="h-3 w-3" />
            图片 ({imageCount})
          </Button>
          <Button
            variant={filter === "video" ? "primary" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setFilter("video")}
          >
            <Film className="h-3 w-3" />
            视频 ({videoCount})
          </Button>
        </div>
        {assets.length > 0 && (
          <span className="text-xs text-zinc-400">{assets.length} 个素材</span>
        )}
      </div>

      {/* Full-screen preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => {
            setPreviewUrl(null)
            setPreviewType(null)
            setActiveGrading(null)
          }}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
            onClick={(e) => {
              e.stopPropagation()
              setPreviewUrl(null)
              setPreviewType(null)
              setActiveGrading(null)
            }}
          >
            <X className="h-8 w-8" />
          </button>
          {previewType === "video" ? (
            <video
              src={previewUrl}
              controls
              autoPlay
              loop
              className="max-w-[90vw] max-h-[80vh] rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={previewUrl}
              alt="预览"
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
              style={activeGrading ? { filter: getCssFilter() } : undefined}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-zinc-400 gap-3">
          <FolderOpen className="h-10 w-10 opacity-50" />
          <p className="text-sm">
            {assets.length === 0
              ? "素材库为空"
              : filter === "image"
              ? "暂无图片素材"
              : "暂无视频素材"}
          </p>
          <p className="text-xs">
            {assets.length === 0
              ? "生成的场景画面和角色头像会自动加入素材库"
              : "请切换筛选条件查看其他素材"}
          </p>
        </div>
      )}

      {/* Asset Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filtered.map((asset) => (
          <Card
            key={asset.id}
            className={cn(
              "overflow-hidden group transition-all duration-200 hover:shadow-md",
              deleting === asset.id && "opacity-50"
            )}
          >
            {/* Thumbnail */}
            <div
              className={cn(
                "relative bg-zinc-100 dark:bg-zinc-800 cursor-pointer",
                asset.type === "video" ? "aspect-video" : "aspect-square"
              )}
              onClick={() => {
                setPreviewUrl(asset.url)
                setPreviewType(asset.type as "image" | "video")
              }}
            >
              {asset.type === "video" ? (
                <>
                  {asset.thumbnail && (
                    <img
                      src={asset.thumbnail}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="p-2 rounded-full bg-black/40 text-white">
                      <Play className="h-4 w-4 fill-white" />
                    </div>
                  </div>
                </>
              ) : (
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                />
              )}
              <Badge
                className={cn(
                  "absolute top-2 left-2 text-[9px]",
                  asset.type === "video"
                    ? "bg-purple-600/80 text-white border-none"
                    : "bg-amber-600/80 text-white border-none"
                )}
              >
                {asset.type === "video" ? "视频" : "图片"}
              </Badge>
            </div>

            {/* Info & Actions */}
            <CardContent className="p-2 space-y-1.5">
              {editingId === asset.id ? (
                <div className="flex items-center gap-1">
                  <input
                    className="flex-1 text-xs px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 min-w-0"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename(asset.id)
                      if (e.key === "Escape") setEditingId(null)
                    }}
                    autoFocus
                  />
                  <button
                    className="p-0.5 text-emerald-600 hover:text-emerald-700"
                    onClick={() => handleSaveRename(asset.id)}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    className="p-0.5 text-zinc-400 hover:text-zinc-600"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <p className="text-xs font-medium truncate" title={asset.name}>
                  {asset.name}
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400">
                  {new Date(asset.createdAt).toLocaleDateString("zh-CN", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Color grading button for images */}
                  {asset.type === "image" && (
                    <button
                      className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-purple-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveGrading(
                          activeGrading === asset.id ? null : asset.id
                        )
                        setPreviewUrl(asset.url)
                        setPreviewType("image")
                      }}
                      title="调色"
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartRename(asset)
                    }}
                    title="重命名"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                    title="下载"
                    download
                  >
                    <Download className="h-3 w-3" />
                  </a>
                  <button
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(asset.id)
                    }}
                    disabled={deleting === asset.id}
                    title="删除"
                  >
                    {deleting === asset.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Color Grading Panel (floating) */}
      {activeGrading && previewUrl && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-4 w-[400px] max-w-[90vw]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-purple-600" />
              调色面板
            </h4>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={resetGrading}
              >
                重置
              </Button>
              <button
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setActiveGrading(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {/* Brightness */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">亮度</span>
                <span className="text-zinc-400">{gradingValues.brightness}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                value={gradingValues.brightness}
                onChange={(e) =>
                  setGradingValues((g) => ({
                    ...g,
                    brightness: parseInt(e.target.value),
                  }))
                }
                className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-purple-600"
              />
            </div>

            {/* Contrast */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">对比度</span>
                <span className="text-zinc-400">{gradingValues.contrast}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                value={gradingValues.contrast}
                onChange={(e) =>
                  setGradingValues((g) => ({
                    ...g,
                    contrast: parseInt(e.target.value),
                  }))
                }
                className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-purple-600"
              />
            </div>

            {/* Saturation */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">饱和度</span>
                <span className="text-zinc-400">{gradingValues.saturation}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                value={gradingValues.saturation}
                onChange={(e) =>
                  setGradingValues((g) => ({
                    ...g,
                    saturation: parseInt(e.target.value),
                  }))
                }
                className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-purple-600"
              />
            </div>

            {/* Hue */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">色相</span>
                <span className="text-zinc-400">{gradingValues.hue}°</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                value={gradingValues.hue}
                onChange={(e) =>
                  setGradingValues((g) => ({
                    ...g,
                    hue: parseInt(e.target.value),
                  }))
                }
                className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-purple-600"
              />
            </div>

            {/* Blur */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">模糊</span>
                <span className="text-zinc-400">{gradingValues.blur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={gradingValues.blur}
                onChange={(e) =>
                  setGradingValues((g) => ({
                    ...g,
                    blur: parseInt(e.target.value),
                  }))
                }
                className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer accent-purple-600"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  Image as ImageIcon,
  User,
  Film,
  FolderOpen,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils/cn"
import SceneImagePanel from "./_components/SceneImagePanel"
import CharacterImagePanel from "./_components/CharacterImagePanel"
import VideoPanel from "./_components/VideoPanel"
import AssetLibraryPanel from "./_components/AssetLibraryPanel"
import {
  getVisualData,
  generateShotImageAction,
  generateCharacterAvatarAction,
  generateShotVideoAction,
  deleteVisualAsset,
  renameVisualAsset,
} from "./_actions"
import type { VisualProjectData } from "./_actions"

type VisualTab = "scene" | "character" | "video" | "assets"

const tabs: { key: VisualTab; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { key: "scene", label: "场景画面", icon: ImageIcon, desc: "AI 生成分镜画面" },
  { key: "character", label: "角色形象", icon: User, desc: "AI 生成角色头像" },
  { key: "video", label: "图生视频", icon: Film, desc: "AI 画面转视频" },
  { key: "assets", label: "素材库", icon: FolderOpen, desc: "管理 & 调色" },
]

export default function VisualWorkshopPage() {
  const params = useParams()
  const projectId = params.id as string

  const [data, setData] = useState<VisualProjectData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<VisualTab>("scene")
  const [generating, setGenerating] = useState<string | null>(null)

  // Load project data
  useEffect(() => {
    getVisualData(projectId)
      .then((result) => {
        setData(result)
        setLoaded(true)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载失败")
        setLoaded(true)
      })
  }, [projectId])

  // Refresh data after actions
  const refresh = useCallback(async () => {
    const result = await getVisualData(projectId)
    setData(result)
  }, [projectId])

  // Generate scene shot image
  const handleGenerateShot = useCallback(
    async (
      shotKey: string,
      shotType: "wide" | "medium" | "close",
      sceneEpisode: number,
      sceneNum: number,
      sceneSummary: string,
      sceneLocation: string,
      sceneChars: string[],
      referenceImages?: string[]
    ) => {
      if (generating || !data) return
      setGenerating(shotKey)
      try {
        await generateShotImageAction(projectId, shotKey, {
          shotType, sceneEpisode, sceneNum, sceneSummary, sceneLocation, sceneChars, referenceImages,
        })
        await refresh()
      } catch (e) {
        console.error("Shot image generation failed:", e)
        alert("场景生成失败: " + (e instanceof Error ? e.message : "未知错误"))
      } finally {
        setGenerating(null)
      }
    },
    [generating, projectId, refresh, data]
  )

  // Generate character avatar
  const handleGenerateAvatar = useCallback(
    async (characterId: string, desc: string, model?: string) => {
      if (generating || !data) return
      setGenerating(characterId)
      try {
        await generateCharacterAvatarAction(projectId, characterId, desc, { model })
        await refresh()
      } catch (e) {
        console.error("Avatar generation failed:", e)
        alert("头像生成失败: " + (e instanceof Error ? e.message : "未知错误"))
      } finally {
        setGenerating(null)
      }
    },
    [generating, projectId, refresh, data]
  )

  // Generate video from shot
  const handleGenerateVideo = useCallback(
    async (shotKey: string, imageUrl: string, prompt: string) => {
      if (generating || !data) return
      setGenerating(shotKey)
      try {
        await generateShotVideoAction(projectId, shotKey, imageUrl, prompt)
        await refresh()
      } catch (e) {
        console.error("Video generation failed:", e)
        alert("视频生成失败: " + (e instanceof Error ? e.message : "未知错误"))
      } finally {
        setGenerating(null)
      }
    },
    [generating, projectId, refresh, data]
  )

  // Delete asset
  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      try {
        await deleteVisualAsset(projectId, assetId)
        await refresh()
      } catch (e) {
        console.error("Asset delete failed:", e)
        alert("删除失败: " + (e instanceof Error ? e.message : "未知错误"))
      }
    },
    [projectId, refresh]
  )

  // Rename asset
  const handleRenameAsset = useCallback(
    async (assetId: string, newName: string) => {
      try {
        await renameVisualAsset(projectId, assetId, newName)
        await refresh()
      } catch (e) {
        console.error("Asset rename failed:", e)
      }
    },
    [projectId, refresh]
  )

  // Loading state
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  // Error state
  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500 mb-2">加载失败</p>
          <p className="text-xs text-zinc-400">{error || "项目不存在"}</p>
        </div>
      </div>
    )
  }

  const tabContent = () => {
    switch (activeTab) {
      case "scene":
        return (
          <SceneImagePanel
            episodeOutlines={data.episodeOutlines}
            episodeSceneOutlines={data.episodeSceneOutlines}
            characters={data.characters}
            visualAssets={data.visualAssets}
            logline={data.logline}
            onGenerateShot={handleGenerateShot}
            generating={generating}
          />
        )
      case "character":
        return (
          <CharacterImagePanel
            characters={data.characters}
            visualAssets={data.visualAssets}
            onGenerateAvatar={handleGenerateAvatar}
            generating={generating}
          />
        )
      case "video":
        return (
          <VideoPanel
            visualAssets={data.visualAssets}
            onGenerateVideo={handleGenerateVideo}
            generating={generating}
          />
        )
      case "assets":
        return (
          <AssetLibraryPanel
            visualAssets={data.visualAssets}
            onDeleteAsset={handleDeleteAsset}
            onRenameAsset={handleRenameAsset}
          />
        )
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6">
        <div className="flex items-center justify-between h-14">
          <div>
            <h2 className="text-base font-bold">视觉工坊</h2>
            <p className="text-xs text-zinc-500">
              {data.projectTitle} · AI 视觉内容生产
            </p>
          </div>
          <div className="text-xs text-zinc-400">
            {data.visualAssets.assets.length} 个素材
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6">
        <div className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative",
                activeTab === tab.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">{tabContent()}</div>
      </div>
    </div>
  )
}

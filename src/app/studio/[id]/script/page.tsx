"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Sparkles, Save, ArrowRight, ArrowLeft, Trash2, Plus, Loader2, ChevronDown, ChevronRight, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import StepIndicator from "./_components/StepIndicator"
import {
  saveScriptData,
  loadScriptData,
  generateLogline,
  generateWorldBuilding,
  generateCharacters,
  generateSuspenseList,
  generateStoryOutline,
  generateEpisodeOutlines,
  generateSceneOutlines,
  generateAdditionalScenes,
  generateScriptContent,
  generateReview,
  fixIssue,
  suggestTopicByIdea,
  searchTrendingTopics,
  searchFacts,
  deduplicateSuspense,
  generateHooksForNewEpisodes,
} from "./_actions"
import type {
  ScriptWizardData,
  WizardStep,
  CharacterCard,
  SuspenseItem,
  EpisodeOutline,
  SceneOutline,
  FixLogEntry,
  FactItem,
} from "@/types"
import { TOPIC_OPTIONS } from "@/types"

const EMPTY_DATA: ScriptWizardData = {
  currentStep: 1,
  characters: [],
  suspenseList: [],
  episodeOutlines: [],
  collapsedEpisodeGroups: [],
  collapsedHookGroups: [],
  collapsedMediumSuspense: false,
  facts: [],
}

const REVIEW_CATEGORIES = ["逻辑", "人设", "节奏", "悬念", "合规"] as const

/** 根据已写剧本同步锁定状态：钩子按序号对应集数，分集按 episodeNum 判断，角色按出场锁定 */
function syncLockedStatus(data: ScriptWizardData): ScriptWizardData {
  const scripts = data.episodeScripts || {}
  const writtenEpNums = new Set(
    Object.entries(scripts)
      .filter(([, content]) => content?.trim())
      .map(([num]) => parseInt(num))
  )
  // 分场大纲进度锁：场景到了第 N 集 → 前 N-1 集剧本视为已锁定
  const sceneOutlines = data.episodeSceneOutlines || {}
  const sceneMaxEp = Math.max(0, ...Object.keys(sceneOutlines).map(Number))
  const sceneLockedEpNums = new Set<number>()
  for (let i = 1; i < sceneMaxEp; i++) sceneLockedEpNums.add(i)
  // 综合锁定集号：已写剧本 ∪ 场景进度锁
  const allLockedEpNums = new Set([...writtenEpNums, ...sceneLockedEpNums])

  let hookIdx = 0
  const syncedSuspense = data.suspenseList.map(s => {
    if (s.type === "hook") {
      hookIdx++
      return { ...s, locked: allLockedEpNums.has(hookIdx) }
    }
    return s
  })
  const syncedEpisodes = data.episodeOutlines.map(ep => ({
    ...ep,
    locked: allLockedEpNums.has(ep.episodeNum),
  }))
  const syncedSceneOutlines: Record<number, SceneOutline[]> = {}
  for (const [epNum, scenes] of Object.entries(sceneOutlines)) {
    const locked = allLockedEpNums.has(parseInt(epNum))
    syncedSceneOutlines[parseInt(epNum)] = scenes.map(s => ({ ...s, locked }))
  }

  // 角色锁定：在任一锁定集的分场大纲 characters 数组中出场 → 锁定
  const lockedCharNames = new Set<string>()
  for (const epNum of allLockedEpNums) {
    const scenes = sceneOutlines[epNum]
    if (!scenes) continue
    for (const scene of scenes) {
      for (const name of scene.characters || []) {
        if (name && name.length >= 2) lockedCharNames.add(name)
      }
    }
  }
  const syncedCharacters = data.characters.map(ch => ({
    ...ch,
    locked: lockedCharNames.has(ch.name),
  }))

  return {
    ...data,
    suspenseList: syncedSuspense,
    episodeOutlines: syncedEpisodes,
    episodeSceneOutlines: syncedSceneOutlines,
    characters: syncedCharacters,
  }
}

export default function ScriptWizardPage() {
  const params = useParams()
  const projectId = params.id as string

  const [data, setData] = useState<ScriptWizardData>(EMPTY_DATA)
  const [loaded, setLoaded] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [aiResult, setAiResult] = useState("")
  const [trendingTopics, setTrendingTopics] = useState<{ title: string, desc: string, tags: string[], reason: string }[]>([])
  const [ideaInput, setIdeaInput] = useState("")
  const [ideaSuggestions, setIdeaSuggestions] = useState<{ title: string, desc: string, tags: string[] }[]>([])
  const [fixing, setFixing] = useState<string | null>(null)
  const [fixLog, setFixLog] = useState<FixLogEntry[]>([])

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const fixingActive = !!fixing
    const handler = (e: BeforeUnloadEvent) => {
      if (fixingActive) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [fixing])

  useEffect(() => {
    loadScriptData(projectId).then((loadedData) => {
      if (loadedData) setData(syncLockedStatus({ ...EMPTY_DATA, ...loadedData }))
      setLoaded(true)
    })
  }, [projectId])

  const autoSave = useCallback(
    (newData: ScriptWizardData) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setSaving(true)
        saveScriptData(projectId, { ...newData }).finally(() => setSaving(false))
      }, 20000)
    },
    [projectId]
  )

  const update = useCallback(
    (patch: Partial<ScriptWizardData>) => {
      setData((prev) => {
        let next = { ...prev, ...patch }
        if ("episodeScripts" in patch || "episodeSceneOutlines" in patch) {
          next = syncLockedStatus(next)
        }
        autoSave(next)
        return next
      })
    },
    [autoSave]
  )

  const goStep = useCallback((step: WizardStep) => update({ currentStep: step }), [update])
  const next = useCallback(() => {
    const s = Math.min(data.currentStep + 1, 9) as WizardStep
    if (s !== data.currentStep) goStep(s)
  }, [data.currentStep, goStep])
  const prev = useCallback(() => {
    const s = Math.max(data.currentStep - 1, 1) as WizardStep
    if (s !== data.currentStep) goStep(s)
  }, [data.currentStep, goStep])

  const scheduleGenerate = useCallback(
    (key: string, fn: () => Promise<void>) => {
      if (generating) return
      setGenerating(key)
      setAiResult("")
      fn().finally(() => setGenerating(null))
    },
    [generating]
  )

  const handleSuggestByIdea = useCallback(async () => {
    if (!ideaInput.trim()) return
    setGenerating("suggest")
    try {
      const result = await suggestTopicByIdea(ideaInput)
      setIdeaSuggestions(result)
    } finally {
      setGenerating(null)
    }
  }, [ideaInput])

  const handleTrendingSearch = useCallback(async () => {
    setGenerating("trending")
    try {
      const result = await searchTrendingTopics()
      setTrendingTopics(result)
    } finally {
      setGenerating(null)
    }
  }, [])

  const genLogline = useCallback(() => {
    scheduleGenerate("logline", async () => {
      const topic = TOPIC_OPTIONS.find((t) => t.id === data.topicId)
      const topicDisplay = topic?.title || data.topicTitle || "未选择"
      const topicDesc = topic?.logline || ""
      const result = await generateLogline(topicDisplay, topicDesc)
      setAiResult(result)
      update({ logline: result })
    })
  }, [scheduleGenerate, data.topicId, data.topicTitle, update])

  const genWorld = useCallback(() => {
    scheduleGenerate("world", async () => {
      const topicDisplay = TOPIC_OPTIONS.find((t) => t.id === data.topicId)?.title || data.topicTitle || "未选择"
      const { world, theme } = await generateWorldBuilding(topicDisplay, data.logline || "")
      setAiResult(`世界观：\n${world}\n\n主题：\n${theme}`)
      update({ worldBuilding: world, theme })
    })
  }, [scheduleGenerate, data.topicId, data.topicTitle, data.logline, update])

  const genChars = useCallback(() => {
    scheduleGenerate("chars", async () => {
      const topicDisplay = TOPIC_OPTIONS.find((t) => t.id === data.topicId)?.title || data.topicTitle || ""
      const result = await generateCharacters(topicDisplay, data.logline || "", data.worldBuilding || "")
      update({ characters: result })
    })
  }, [scheduleGenerate, data.topicId, data.topicTitle, data.logline, data.worldBuilding, update])

  const genSuspense = useCallback(() => {
    scheduleGenerate("suspense", async () => {
      const outlineStr = data.storyOutline ? JSON.stringify(data.storyOutline) : ""
      const charsStr = data.characters
        .map((c) => `${c.name}(${c.role}): ${c.personality}, 秘密: ${c.secret}, 目的: ${c.goal}`)
        .join("\n")
      const result = await generateSuspenseList(data.logline || "", outlineStr, data.totalEpisodes || 12, charsStr)
      // 保留已锁定的钩子/悬念，不被 AI 重新生成覆盖
      const oldList = data.suspenseList
      const oldHooks = oldList.filter(s => s.type === "hook")
      let hookIdx = 0
      const merged: SuspenseItem[] = []
      for (const item of result) {
        if (item.type === "hook") {
          if (oldHooks[hookIdx]?.locked) {
            merged.push(oldHooks[hookIdx])
          } else {
            merged.push(item)
          }
          hookIdx++
        } else {
          const lockedMatch = oldList.find(o => o.type === item.type && o.locked)
          merged.push(lockedMatch || item)
        }
      }
      // 追加不在结果中的已锁定项
      for (const old of oldList) {
        if (old.locked && !merged.some(m => m.id === old.id)) {
          merged.push(old)
        }
      }
      update({ suspenseList: merged })
    })
  }, [scheduleGenerate, data.logline, data.storyOutline, data.totalEpisodes, data.suspenseList, update])

  const genOutline = useCallback(() => {
    scheduleGenerate("outline", async () => {
      const topicDisplay = TOPIC_OPTIONS.find((t) => t.id === data.topicId)?.title || data.topicTitle || ""
      const charsStr = data.characters.map((c) => `${c.name}(${c.role}): ${c.personality}, 秘密:${c.secret}`).join("\n")
      const result = await generateStoryOutline(topicDisplay, data.logline || "", data.worldBuilding || "", charsStr)
      setAiResult(result)
      const qm = result.match(/起[：:][\s\S]*?】?\s*([\s\S]*?)(?=承|$)/) || result.match(/【起[：:][\s\S]*?】?\s*([\s\S]*?)(?=【承|$)/)
      const cm = result.match(/承[：:][\s\S]*?】?\s*([\s\S]*?)(?=转|$)/) || result.match(/【承[：:][\s\S]*?】?\s*([\s\S]*?)(?=【转|$)/)
      const zm = result.match(/转[：:][\s\S]*?】?\s*([\s\S]*?)(?=合|$)/) || result.match(/【转[：:][\s\S]*?】?\s*([\s\S]*?)(?=【合|$)/)
      const hm = result.match(/合[：:][\s\S]*?】?\s*([\s\S]*)/) || result.match(/【合[：:][\s\S]*?】?\s*([\s\S]*)/)
      update({
        storyOutline: {
          qi: qm?.[1]?.trim() || "",
          cheng: cm?.[1]?.trim() || "",
          zhuan: zm?.[1]?.trim() || "",
          he: hm?.[1]?.trim() || "",
        },
      })
    })
  }, [scheduleGenerate, data.topicId, data.topicTitle, data.logline, data.worldBuilding, update])

  const genEps = useCallback(() => {
    scheduleGenerate("eps", async () => {
      const outlineStr = data.storyOutline ? JSON.stringify(data.storyOutline) : ""
      const hookCount = data.suspenseList.filter(s => s.type === "hook").length
      const epCount = data.totalEpisodes || hookCount || 12
      const BATCH = 30
      const charsStr = data.characters.map((c) => `${c.name}(${c.role}): ${c.personality}, 秘密:${c.secret}`).join("\n")

      const scripts = data.episodeScripts || {}
      const oldOutlines = data.episodeOutlines || []
      const lockedEpNums = new Set(Object.keys(scripts).map(Number).filter(n => scripts[n]?.trim()))

      // 分批生成，每批30集，顺延不超总集数
      let allGenerated: EpisodeOutline[] = []
      for (let start = 1; start <= epCount; start += BATCH) {
        const batchSize = Math.min(BATCH, epCount - start + 1)
        const batch = await generateEpisodeOutlines(
          data.logline || "",
          outlineStr,
          start,
          batchSize,
          epCount,
          charsStr
        )
        allGenerated = allGenerated.concat(batch)
        // 每批完成后更新 UI，让用户看到进度
        const progress = [...allGenerated]
        oldOutlines.forEach(ep => {
          if (lockedEpNums.has(ep.episodeNum) && !progress.some(p => p.episodeNum === ep.episodeNum)) {
            progress.push(ep)
          }
        })
        update({ episodeOutlines: progress.sort((a, b) => a.episodeNum - b.episodeNum) })
      }

      // 最终合并：锁定的集保留旧大纲，其余用新生成的结果
      const newEpNums = new Set(allGenerated.map(e => e.episodeNum))
      const merged = allGenerated.map(ep => {
        if (lockedEpNums.has(ep.episodeNum)) {
          const old = oldOutlines.find(o => o.episodeNum === ep.episodeNum)
          return old || ep
        }
        return ep
      })
      oldOutlines.forEach(ep => {
        if (lockedEpNums.has(ep.episodeNum) && !newEpNums.has(ep.episodeNum)) {
          merged.push(ep)
        }
      })

      update({ episodeOutlines: merged.sort((a, b) => a.episodeNum - b.episodeNum), totalEpisodes: epCount })
    })
  }, [scheduleGenerate, data.logline, data.storyOutline, data.totalEpisodes, data.suspenseList, data.episodeScripts, data.episodeOutlines, update])

  const genScenes = useCallback(
    (epNum: number) => {
      scheduleGenerate(`scenes-${epNum}`, async () => {
        const ep = data.episodeOutlines.find((e) => e.episodeNum === epNum)
        const epStr = ep ? `标题: ${ep.title}\n概要: ${ep.summary}\n冲突: ${ep.conflict}` : ""
        const dur = Math.max(240, Math.min(300, data.episodeDurationSeconds ?? 270))
        const aiGen = data.aiGenerationDuration ?? 10
        const charsStr = data.characters.map((c) => `${c.name}(${c.role})`).join(",")
        const result = await generateSceneOutlines(epStr, epNum, dur, aiGen, charsStr)
        const current = data.episodeSceneOutlines || {}
        update({
          episodeSceneOutlines: { ...current, [epNum]: result },
          activeSceneEpisode: epNum,
        })
      })
    },
    [scheduleGenerate, data.episodeOutlines, data.episodeSceneOutlines, update]
  )

  const genScript = useCallback(
    (epNum: number) => {
      scheduleGenerate(`script-${epNum}`, async () => {
        const scenes = data.episodeSceneOutlines?.[epNum] || []
        const scenesStr = scenes
          .map((s) => `场景${s.sceneNum}: ${s.location} | ${s.characters.join("，")} | ${s.summary}`)
          .join("\n")
        const charsStr = data.characters
          .map((c) => `${c.name}(${c.role}): ${c.personality}`)
          .join("\n")
        const prompt = `${data.logline || ""}\n\n当前编写：第${epNum}集`
        const result = await generateScriptContent(prompt, scenesStr || "暂无分场", charsStr || "暂无角色")
        const current = data.episodeScripts || {}
        update({
          episodeScripts: { ...current, [epNum]: result },
          activeEpisode: epNum,
        })
      })
    },
    [scheduleGenerate, data.logline, data.characters, data.episodeSceneOutlines, data.episodeScripts, update]
  )

  const genReview = useCallback(() => {
    scheduleGenerate("review", async () => {
      if (!data.episodeOutlines.length || !data.logline) return
      const reviewContent = data.episodeOutlines
        .map((e) => `第${e.episodeNum}集《${e.title}》\n概要：${e.summary}\n冲突：${e.conflict}\n钩子：${e.hook}`)
        .join("\n\n")
      const worldCtx = data.worldBuilding ? `\n【世界观】\n${data.worldBuilding}\n【主题】${data.theme || "未设定"}` : ""
      const charCtx = data.characters.length > 0 ? `\n【角色列表】\n${data.characters.map((c) => `${c.name}(${c.role}): ${c.personality || ""}, 秘密: ${c.secret || ""}`).join("\n")}` : ""
      const suspCtx = data.suspenseList.length > 0 ? `\n【悬念清单】\n${data.suspenseList.map((s) => `[${s.type}] ${s.description}${s.revealEpisode ? ` (第${s.revealEpisode}集揭晓)` : ""}`).join("\n")}` : ""
      const outlineCtx = data.storyOutline?.qi ? `\n【整体大纲】\n起：${data.storyOutline.qi}\n承：${data.storyOutline.cheng}\n转：${data.storyOutline.zhuan}\n合：${data.storyOutline.he}` : ""
      const fullContent = `【审查对象 - 分集大纲】\n${reviewContent}${worldCtx}${charCtx}${suspCtx}${outlineCtx}`
      const result = await generateReview(fullContent, data.logline, data.reviewSpec)
      setAiResult(result)
      update({ reviewNotes: result })
    })
  }, [scheduleGenerate, data.episodeOutlines, data.logline, data.reviewSpec, data.worldBuilding, data.theme, data.characters, data.suspenseList, data.storyOutline, update])

  const handleIgnore = useCallback(
    (category: string, issue: string) => {
      if (!data.reviewNotes) return
      const escaped = issue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const newNotes = data.reviewNotes.replace(
        new RegExp(`(🔴\\s*待修复\\s*-\\s*)?${escaped}`, "g"),
        `🚫 已忽略 - ${issue}`
      )
      update({ reviewNotes: newNotes })
    },
    [data.reviewNotes, update]
  )

  const handleSearchFacts = useCallback(() => {
    const outlineSummary = data.storyOutline
      ? `起：${data.storyOutline.qi}\n承：${data.storyOutline.cheng}\n转：${data.storyOutline.zhuan}\n合：${data.storyOutline.he}`
      : ""
    scheduleGenerate("facts", async () => {
      const results = await searchFacts(data.topicTitle || "", data.logline || "", outlineSummary)
      if (results.length > 0) update({ facts: results })
    })
  }, [scheduleGenerate, data.topicTitle, data.logline, data.storyOutline])

  const handleFix = useCallback(
    async (category: string) => {
      const re = new RegExp(`【${category}[检審]?[查核]?[：:]?】?\\s*([\\s\\S]*?)(?=【|【总体|$)`, "i")
      const m = data.reviewNotes?.match(re)
      const catIssues = m?.[1]?.trim() || data.reviewNotes || ""
      const pendingIssues = catIssues.split("\n").filter((l) => {
        const c = l.replace(/^[-•]?\s*/, "").trim()
        return c && !c.startsWith("✅") && !c.startsWith("🚫") && c !== "---"
      }).join("\n")
      if (!pendingIssues.trim()) return

      const epData = data.episodeOutlines
        .map((e) => `第${e.episodeNum}集《${e.title}》\n概要：${e.summary}\n冲突：${e.conflict}\n钩子：${e.hook}`)
        .join("\n\n")
      const charData = data.characters.map((c) => `${c.name}(${c.role}): 性格${c.personality}, 秘密${c.secret}`).join("\n")
      const suspData = JSON.stringify(data.suspenseList)

      const targetMap: Record<string, string> = { "逻辑": "分集大纲", "人设": "角色卡", "节奏": "分集大纲", "悬念": "悬念清单", "合规": "分集大纲" }
      const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      const beforeSnapshot = category === "人设"
        ? data.characters.map((c) => `${c.name}: ${c.personality}, 秘密: ${c.secret}`).join("\n")
        : category === "悬念"
        ? data.suspenseList.map((s) => `[${s.type}] ${s.description}`).join("\n")
        : data.episodeOutlines.slice(0, 3).map((e) => `第${e.episodeNum}集: ${e.summary}`).join("\n") + (data.episodeOutlines.length > 3 ? `\n...共${data.episodeOutlines.length}集` : "")
      const logEntry: FixLogEntry = { id: crypto.randomUUID(), time: now, category, target: targetMap[category] || category, before: beforeSnapshot, after: "" }

      setFixing(category)

      let updatedEpisodes = data.episodeOutlines
      let updatedChars = data.characters
      let updatedSuspense = data.suspenseList
      let reviewNotes = data.reviewNotes || ""

      const maxRounds = 3
      for (let round = 0; round < maxRounds; round++) {
        try {
          if (round === 0) {
            const epD = updatedEpisodes.map((e) => `第${e.episodeNum}集《${e.title}》\n概要：${e.summary}\n冲突：${e.conflict}\n钩子：${e.hook}`).join("\n\n")
            const chD = updatedChars.map((c) => `${c.name}(${c.role}): 性格${c.personality}, 秘密${c.secret}`).join("\n")
            const spD2 = JSON.stringify(updatedSuspense)
            const specJson = data.reviewSpec ? JSON.stringify(data.reviewSpec) : ""
            const result = await fixIssue(category, pendingIssues, data.logline || "", chD, epD, spD2, specJson)
            applyFix(result, category, updatedEpisodes, updatedChars, updatedSuspense, ({ eps, chars, susp }) => {
              updatedEpisodes = eps
              updatedChars = chars
              updatedSuspense = susp
            })
            update({ characters: updatedChars, episodeOutlines: updatedEpisodes, suspenseList: updatedSuspense })
          }
          if (round >= maxRounds - 1) break

          const epD = updatedEpisodes.map((e) => `第${e.episodeNum}集《${e.title}》\n概要：${e.summary}\n冲突：${e.conflict}\n钩子：${e.hook}`).join("\n\n")
          const chD = updatedChars.map((c) => `${c.name}(${c.role}): 性格${c.personality}, 秘密${c.secret}`).join("\n")
          const spD2 = JSON.stringify(updatedSuspense)
          const worldCtx2 = data.worldBuilding ? `\n【世界观】${data.worldBuilding}` : ""
          const charCtx2 = updatedChars.length > 0 ? `\n【角色】${chD}` : ""
          const suspCtx2 = updatedSuspense.length > 0 ? `\n【悬念】${spD2}` : ""
          const fullReview = `【分集大纲】\n${epD}${worldCtx2}${charCtx2}${suspCtx2}`

          const newReview = await generateReview(fullReview, data.logline || "", data.reviewSpec)
          if (!newReview) break

          const newRe = new RegExp(`【${category}[检審]?[查核]?[：:]?】?\\s*([\\s\\S]*?)(?=【|【总体|$)`, "i")
          const newCatIssues = newReview.match(newRe)?.[1]?.trim() || ""
          const newPending = newCatIssues.split("\n").filter((l) => {
            const c = l.replace(/^[-•]?\s*/, "").trim()
            return c && !c.startsWith("✅") && !c.startsWith("🚫")
          })

          if (newPending.length === 0) {
            reviewNotes = reviewNotes.replace(re, (match) => {
              const oldBody = match.match(re)?.[1] || ""
              const fixedBody = oldBody.split("\n").filter(Boolean).map((l) => "✅ 已修复 - " + l.replace(/^[-•]?\s*/, "").replace(/^✅\s*已修复\s*-\s*/, "").replace(/^🔴\s*待修复\s*-\s*/, "").trim()).join("\n")
              return match.replace(oldBody, fixedBody)
            })
            break
          } else {
            reviewNotes = reviewNotes.replace(re, (match) => {
              const oldBody = match.match(re)?.[1] || ""
              const fixedLines = oldBody.split("\n").filter(Boolean).map((l) => "✅ 已修复 - " + l.replace(/^[-•]?\s*/, "").replace(/^✅\s*已修复\s*-\s*/, "").replace(/^🔴\s*待修复\s*-\s*/, "").trim())
              const pendingLines = newPending.map((l) => "🔴 待修复 - " + l.replace(/^[-•]?\s*/, "").trim())
              return match.replace(oldBody, [...fixedLines, "---", ...pendingLines].join("\n"))
            })
            const specJson = data.reviewSpec ? JSON.stringify(data.reviewSpec) : ""
            const result = await fixIssue(category, newPending.join("\n"), data.logline || "", chD, epD, spD2, specJson)
            applyFix(result, category, updatedEpisodes, updatedChars, updatedSuspense, ({ eps, chars, susp }) => {
              updatedEpisodes = eps
              updatedChars = chars
              updatedSuspense = susp
            })
            update({ characters: updatedChars, episodeOutlines: updatedEpisodes, suspenseList: updatedSuspense })
          }
        } catch { break }
      }

      update({ reviewNotes })

      const afterSnapshot = category === "人设"
        ? updatedChars.slice(0, 3).map((c) => `${c.name}: ${c.personality || ""}, 秘密: ${c.secret || ""}`).join("\n") + (updatedChars.length > 3 ? `\n...共${updatedChars.length}个角色` : "")
        : category === "悬念"
        ? updatedSuspense.slice(0, 5).map((s) => `[${s.type}] ${s.description}`).join("\n") + (updatedSuspense.length > 5 ? `\n...共${updatedSuspense.length}条` : "")
        : updatedEpisodes.slice(0, 3).map((e) => `第${e.episodeNum}集: ${e.summary}`).join("\n") + (updatedEpisodes.length > 3 ? `\n...共${updatedEpisodes.length}集` : "")
      const finalEntry = { ...logEntry, after: afterSnapshot || "(无内容)" }
      setFixLog((prev) => [finalEntry, ...prev].slice(0, 20))
      update({ fixLogs: [finalEntry, ...(data.fixLogs || [])].slice(0, 50) })
      setFixing(null)
    },
    [data, update]
  )

  const addChar = useCallback(() => {
    const newChar: CharacterCard = {
      id: crypto.randomUUID(),
      name: "",
      role: "配角",
      gender: "未知",
      age: "",
      identity: "",
      personality: "",
      secret: "",
      goal: "",
      weakness: "",
      signature: "",
    }
    update({ characters: [...data.characters, newChar] })
  }, [data.characters, update])

  const updChar = useCallback(
    (id: string, patch: Partial<CharacterCard>) => {
      update({ characters: data.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
    },
    [data.characters, update]
  )

  const delChar = useCallback(
    (id: string) => {
      const ch = data.characters.find((c) => c.id === id)
      if (ch?.locked) return
      update({ characters: data.characters.filter((c) => c.id !== id) })
    },
    [data.characters, update]
  )

  const addSusp = useCallback(
    (type?: SuspenseItem["type"]) => {
      const item: SuspenseItem = {
        id: crypto.randomUUID(),
        type: type || "hook",
        description: "",
        status: "pending",
      }
      update({ suspenseList: [...data.suspenseList, item] })
    },
    [data.suspenseList, update]
  )

  const updSusp = useCallback(
    (id: string, patch: Partial<SuspenseItem>) => {
      update({ suspenseList: data.suspenseList.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
    },
    [data.suspenseList, update]
  )

  const delSusp = useCallback(
    (id: string) => {
      update({ suspenseList: data.suspenseList.filter((s) => s.id !== id) })
    },
    [data.suspenseList, update]
  )

  const addEpsFive = useCallback(async () => {
    if (generating) return
    const maxNum = data.episodeOutlines.length > 0
      ? Math.max(...data.episodeOutlines.map((e) => e.episodeNum))
      : 0
    const startEp = maxNum + 1
    const outlineStr = data.storyOutline ? JSON.stringify(data.storyOutline) : ""
    const newTotal = Math.max(data.totalEpisodes || 0, startEp + 4)
    const charsStr = data.characters.map((c) => `${c.name}(${c.role}): ${c.personality}`).join("\n")
    setGenerating("addEps")
    try {
      const batch = await generateEpisodeOutlines(
        data.logline || "",
        outlineStr,
        startEp,
        5,
        newTotal,
        charsStr
      )
      if (batch.length > 0) {
        update({
          episodeOutlines: [...data.episodeOutlines, ...batch],
          totalEpisodes: newTotal,
        })
      }
    } finally {
      setGenerating(null)
    }
  }, [generating, data.episodeOutlines, data.storyOutline, data.totalEpisodes, data.logline, update])

  const updEp = useCallback(
    (epNum: number, patch: Partial<EpisodeOutline>) => {
      update({
        episodeOutlines: data.episodeOutlines.map((e) => (e.episodeNum === epNum ? { ...e, ...patch } : e)),
      })
    },
    [data.episodeOutlines, update]
  )

  const delEp = useCallback(
    (epNum: number) => {
      update({ episodeOutlines: data.episodeOutlines.filter((e) => e.episodeNum !== epNum) })
    },
    [data.episodeOutlines, update]
  )

  const addScenesFive = useCallback(async () => {
    if (generating) return
    const epNum = data.activeSceneEpisode || 1
    const current = data.episodeSceneOutlines || {}
    const existingScenes = current[epNum] || []
    const nextNum = existingScenes.length > 0
      ? Math.max(...existingScenes.map(s => s.sceneNum)) + 1
      : 1

    const ep = data.episodeOutlines.find(e => e.episodeNum === epNum)
    const epStr = ep ? `标题: ${ep.title}\n概要: ${ep.summary}\n冲突: ${ep.conflict}` : ""
    const existingStr = existingScenes.map(s => `场景${s.sceneNum}: ${s.location} | ${s.characters.join(",")} | ${s.summary}`).join("\n")
    const aiGen = data.aiGenerationDuration ?? 10
    const charsStr = data.characters.map((c) => `${c.name}(${c.role})`).join(",")

    setGenerating("addScenes")
    try {
      const batch = await generateAdditionalScenes(epStr, existingStr, epNum, nextNum, 5, aiGen, charsStr)
      if (batch.length > 0) {
        update({ episodeSceneOutlines: { ...current, [epNum]: [...existingScenes, ...batch] } })
      }
    } finally {
      setGenerating(null)
    }
  }, [generating, data.activeSceneEpisode, data.episodeSceneOutlines, data.episodeOutlines, data.aiGenerationDuration, update])

  const updSc = useCallback(
    (epNum: number, sceneIdx: number, patch: Partial<SceneOutline>) => {
      const current = data.episodeSceneOutlines || {}
      const scenes = current[epNum] || []
      update({
        episodeSceneOutlines: {
          ...current,
          [epNum]: scenes.map((s) => (s.sceneNum === sceneIdx ? { ...s, ...patch } : s)),
        },
      })
    },
    [data.episodeSceneOutlines, update]
  )

  const delSc = useCallback(
    (epNum: number, sceneIdx: number) => {
      const current = data.episodeSceneOutlines || {}
      const scenes = current[epNum] || []
      update({
        episodeSceneOutlines: {
          ...current,
          [epNum]: scenes.filter((s) => s.sceneNum !== sceneIdx),
        },
      })
    },
    [data.episodeSceneOutlines, update]
  )

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  const step = data.currentStep
  const episodeScripts = data.episodeScripts || {}
  const episodeScenes = data.episodeSceneOutlines || {}

  // 分场大纲进度锁：场景大纲到了第 N 集 → 锁定前 N-1 集的剧本正文
  const sceneMaxEp = Math.max(0, ...Object.keys(episodeScenes).map(Number))
  const scriptLockedEpNums = new Set<number>()
  for (let i = 1; i < sceneMaxEp; i++) {
    scriptLockedEpNums.add(i)
  }

  const completedSteps: Set<number> = (() => {
    const s = new Set<number>()
    if (data.topicId || data.topicTitle) s.add(1)
    if (data.logline) s.add(2)
    if (data.worldBuilding && data.theme) s.add(3)
    if (data.characters.length > 0) s.add(4)
    if (data.suspenseList.length > 0) s.add(5)
    if (data.storyOutline) s.add(6)
    if (data.episodeOutlines.length > 0) s.add(7)
    if (data.episodeSceneOutlines && Object.keys(data.episodeSceneOutlines).length > 0) s.add(8)
    if (data.episodeScripts && Object.keys(data.episodeScripts).length > 0) s.add(9)
    return s
  })()

  const topic = TOPIC_OPTIONS.find((t) => t.id === data.topicId)
  const topicDisplay = topic?.title || data.topicTitle || "未选择"
  const topicDesc = topic?.logline || ""

  const handleSave = async () => {
    setSaving(true)
    await saveScriptData(projectId, data)
    setSaving(false)
  }

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-52 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">创作步骤</h2>
          <p className="text-xs text-zinc-500 mt-0.5">完成 {completedSteps.size}/9 步</p>
          <div className="mt-2 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(completedSteps.size / 9) * 100}%` }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <StepIndicator currentStep={step} completedSteps={completedSteps} onStepClick={goStep} />
        </div>
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
          <Button variant="outline" className="h-8 w-full gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}保存进度
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={prev} disabled={step === 1}><ArrowLeft className="h-4 w-4" /> 上一步</Button>
            <span className="text-sm text-zinc-500">第 {step} 步 / 共 9 步</span>
            <Button variant="ghost" onClick={next} disabled={step === 9}>下一步 <ArrowRight className="h-4 w-4" /></Button>
          </div>
          {step === 1 && <div className="space-y-4">
            <div><h3 className="text-lg font-bold">Step 1: 选题定赛道</h3><p className="text-sm text-zinc-500 mt-1">选已被市场验证过的方向，或用 AI 帮你出主意。</p></div>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">💬 一句话推荐</CardTitle><p className="text-xs text-zinc-500">描述你的想法，AI 推荐最合适的选题</p></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input value={ideaInput} onChange={(e) => setIdeaInput(e.target.value)} placeholder="例如：外卖员被冤枉后复仇的故事" className="flex-1 h-9 text-sm" />
                  <Button variant="outline" onClick={handleSuggestByIdea} disabled={!!generating} className="gap-1.5 shrink-0">{generating === "suggest" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}推荐</Button>
                </div>
                {ideaSuggestions.map((s, i) => (
                  <Card key={i} className={cn("cursor-pointer hover:shadow-sm", data.topicId === s.title ? "ring-2 ring-indigo-500" : "")} onClick={() => update({ topicId: s.title, topicTitle: s.title })}>
                    <CardContent className="py-3"><div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium">{s.title}</span>{data.topicId === s.title && <Badge className="text-xs bg-indigo-100 text-indigo-700">已选择</Badge>}</div><p className="text-xs text-zinc-500">{s.desc}</p></CardContent></Card>
                ))}
              </CardContent>
            </Card>
            <Card><CardHeader className="pb-2"><div className="flex items-center justify-between"><div><CardTitle className="text-sm">🔥 热度推荐</CardTitle><p className="text-xs text-zinc-500">AI 基于市场趋势推荐热门选题</p></div><Button variant="outline" size="sm" onClick={handleTrendingSearch} disabled={!!generating} className="gap-1.5">{generating === "trending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}搜索热度</Button></div></CardHeader>
              <CardContent><div className="grid grid-cols-1 gap-2">{trendingTopics.map((t, i) => (
                <Card key={i} className={cn("cursor-pointer hover:shadow-sm", data.topicId === t.title ? "ring-2 ring-indigo-500" : "")} onClick={() => update({ topicId: t.title, topicTitle: t.title })}>
                  <CardContent className="py-3"><div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium">{t.title}</span><span className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">{t.reason}</span>{data.topicId === t.title && <Badge className="text-xs bg-indigo-100 text-indigo-700">已选择</Badge>}</div><p className="text-xs text-zinc-500">{t.desc}</p></CardContent></Card>
              ))}</div></CardContent>
            </Card>
            <div><h4 className="text-sm font-semibold mb-2">📋 成熟选题（已验证爆款）</h4></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{TOPIC_OPTIONS.map((t) => <Card key={t.id} className={cn("cursor-pointer transition-all hover:shadow-md", data.topicId === t.id ? "ring-2 ring-indigo-500" : "")} onClick={() => update({ topicId: t.id, topicTitle: t.title })}><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">{t.title}{data.topicId === t.id && <Badge className="bg-indigo-100 text-indigo-700 text-xs">已选择</Badge>}</CardTitle></CardHeader><CardContent><p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">{t.logline}</p><div className="flex gap-1.5 flex-wrap">{t.tags.map((tag) => <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{tag}</span>)}</div></CardContent></Card>)}</div>
            {data.topicId && <div className="pt-4 flex justify-end"><Button variant="primary" onClick={next}>确认选题 <ArrowRight className="h-4 w-4" /></Button></div>}
          </div>}
          {step === 2 && <div className="space-y-4"><div><h3 className="text-lg font-bold">Step 2: 一句话高概念简介</h3><p className="text-sm text-zinc-500 mt-1">公式：主角身份 + 惨状 + 被谁坑 + 悬疑秘密 + 逆袭结果。30-50字。</p></div>
            <Card><CardContent className="pt-6 space-y-3"><Button variant="outline" onClick={genLogline} disabled={!!generating} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 生成简介</Button>
              <Textarea placeholder="例如：前顶级法医被冤枉杀人入狱，出狱后当外卖员，暗中调查当年的冤案..." value={data.logline || ""} onChange={(e) => update({ logline: e.target.value })} rows={3} /></CardContent></Card>
            {data.logline && <div className="flex justify-end"><Button variant="primary" onClick={next}>保存并继续 <ArrowRight className="h-4 w-4" /></Button></div>}
          </div>}
          {step === 3 && <div className="space-y-4"><div><h3 className="text-lg font-bold">Step 3: 极简世界观 + 核心主题</h3><p className="text-sm text-zinc-500 mt-1">写清楚4条世界规则和核心主题。</p></div>
            <Card><CardContent className="pt-6 space-y-3"><Button variant="outline" onClick={genWorld} disabled={!!generating} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 生成世界观</Button>
              <div><label className="text-sm font-medium mb-1.5 block">世界观（4条规则）</label><Textarea placeholder="1. 现代普通都市..." value={data.worldBuilding || ""} onChange={(e) => update({ worldBuilding: e.target.value })} rows={5} /></div>
              <div><label className="text-sm font-medium mb-1.5 block">核心主题</label><Input value={data.theme || ""} onChange={(e) => update({ theme: e.target.value })} placeholder="如：正义或许会迟到，但永远不会缺席" /></div></CardContent></Card>
            {data.worldBuilding && <div className="flex justify-end"><Button variant="primary" onClick={next}>保存并继续 <ArrowRight className="h-4 w-4" /></Button></div>}
          </div>}
          {step === 4 && <div className="space-y-4"><div><h3 className="text-lg font-bold">Step 4: 人物属性卡</h3><p className="text-sm text-zinc-500 mt-1">每个角色6要素：身份、性格、隐藏秘密、核心目的、弱点、标志性动作。建议4-6个。</p></div>
            <div className="flex gap-2"><Button variant="outline" onClick={genChars} disabled={!!generating} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 生成角色</Button><Button variant="outline" onClick={addChar} className="gap-1.5"><Plus className="h-4 w-4" /> 手动添加</Button></div>
            <div className="space-y-3">{data.characters.map((c) => <Card key={c.id} className={cn(c.locked && "opacity-70")}><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-sm flex items-center gap-1.5">{c.locked && <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}{c.name || "未命名"}</CardTitle><Button variant="ghost" size="icon" onClick={() => delChar(c.id)} disabled={c.locked}>{c.locked ? <Lock className="h-3.5 w-3.5 text-zinc-400" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}</Button></div></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="text-xs text-zinc-500">名字</label><Input value={c.name} onChange={(e) => updChar(c.id, { name: e.target.value })} disabled={c.locked} className="h-8 text-sm" /></div>
                <div><label className="text-xs text-zinc-500">定位</label><select value={c.role} onChange={(e) => updChar(c.id, { role: e.target.value })} disabled={c.locked} className="w-full h-8 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 disabled:opacity-50"><option>主角</option><option>反派</option><option>配角</option></select></div>
                <div><label className="text-xs text-zinc-500">身份</label><Input value={c.identity} onChange={(e) => updChar(c.id, { identity: e.target.value })} disabled={c.locked} className="h-8 text-sm" placeholder={c.locked ? "已锁定" : "他是谁"} /></div>
                <div><label className="text-xs text-zinc-500">性格</label><Input value={c.personality} onChange={(e) => updChar(c.id, { personality: e.target.value })} disabled={c.locked} className="h-8 text-sm" /></div>
                <div className="sm:col-span-2"><label className="text-xs text-zinc-500">隐藏秘密</label><Input value={c.secret} onChange={(e) => updChar(c.id, { secret: e.target.value })} disabled={c.locked} className="h-8 text-sm" placeholder={c.locked ? "已锁定" : "悬疑核心"} /></div>
                <div><label className="text-xs text-zinc-500">核心目的</label><Input value={c.goal} onChange={(e) => updChar(c.id, { goal: e.target.value })} disabled={c.locked} className="h-8 text-sm" /></div>
                <div><label className="text-xs text-zinc-500">弱点</label><Input value={c.weakness} onChange={(e) => updChar(c.id, { weakness: e.target.value })} disabled={c.locked} className="h-8 text-sm" /></div>
                <div className="sm:col-span-2"><label className="text-xs text-zinc-500">标志性动作/台词</label><Input value={c.signature} onChange={(e) => updChar(c.id, { signature: e.target.value })} disabled={c.locked} className="h-8 text-sm" /></div></CardContent></Card>)}</div>
            {data.characters.length >= 4 && <div className="flex justify-end"><Button variant="primary" onClick={next}>保存并继续 <ArrowRight className="h-4 w-4" /></Button></div>}
          </div>}
          {step === 5 && <div className="space-y-4"><div><h3 className="text-lg font-bold">Step 5: 悬念 + 伏笔清单</h3><p className="text-sm text-zinc-500 mt-1">大悬念（1个全剧）、中层悬念（3-4个）、小钩子（每集结尾）。先设定预计集数再规划悬念。</p></div>
            <div className="flex gap-2 flex-wrap"><Button variant="outline" onClick={genSuspense} disabled={!!generating} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 生成悬念</Button><Button variant="outline" size="sm" onClick={async () => { const ep = data.totalEpisodes || 0; const suspCtx = data.suspenseList.map(s => `[${s.type}] ${s.description}${s.revealEpisode ? ` (第${s.revealEpisode}集揭晓)` : ""}`).join("\n"); const charsStr = data.characters.map(c => `${c.name}(${c.role}): ${c.personality}, 秘密:${c.secret}`).join("\n"); const hooks = await generateHooksForNewEpisodes(data.logline || "", suspCtx, ep + 1, 5, charsStr); if (hooks.length) update({ suspenseList: [...data.suspenseList, ...hooks], totalEpisodes: ep + 5 }) }} className="gap-1"><Plus className="h-3 w-3" />+5集</Button><div className="flex items-center gap-1.5 ml-auto"><span className="text-xs text-zinc-500">预计集数:</span><Input type="number" value={data.totalEpisodes || 12} onChange={(e) => update({ totalEpisodes: parseInt(e.target.value) || 12 })} className="h-8 w-16 text-sm" /><Button variant="outline" size="sm" className="ml-1 text-xs" onClick={() => { const hooks = data.suspenseList.filter(s => s.type === "hook").length; if (hooks > (data.totalEpisodes || 0)) update({ totalEpisodes: hooks }) }}>同步({data.suspenseList.filter(s => s.type === "hook").length})</Button></div></div>
            <div className="space-y-2">{(["major", "medium", "hook"] as const).map((t) => { const items = data.suspenseList.filter((s) => s.type === t); if (!items.length) return null; const ls: Record<string, string> = { major: "大悬念", medium: "中层悬念", hook: "小钩子" }; const cs: Record<string, string> = { major: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700", hook: "bg-blue-100 text-blue-700" }
              if (t === "hook") { const groupSize = 10; const groups: SuspenseItem[][] = []; for (let i = 0; i < items.length; i += groupSize) groups.push(items.slice(i, i + groupSize)); const savedHook = data.collapsedHookGroups; const hasSavedHook = savedHook && savedHook.length > 0
                return <div key={t}><h4 className="text-sm font-semibold mb-2">{ls[t]}（{items.length}个，每10集一组折叠）</h4>{groups.map((group, gi) => { const startEp = gi * groupSize + 1; const endEp = Math.min((gi + 1) * groupSize, items.length); const collapsed = hasSavedHook ? savedHook!.includes(gi) : gi > 0; const toggle = () => { const s = new Set(hasSavedHook ? savedHook! : []); if (collapsed) s.delete(gi); else s.add(gi); update({ collapsedHookGroups: Array.from(s) }) }
                  return <div key={gi} className="mb-1"><button type="button" className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-1.5 transition-colors" onClick={toggle}>{collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}第 {startEp}-{endEp} 集钩子（{group.length}个）</button>{!collapsed && group.map((item, itemIdx) => <Card key={item.id} className={cn("mb-2", item.locked && "opacity-70")}><CardContent className="pt-3 pb-3 flex gap-2 items-start"><Badge className={cn("text-xs shrink-0", cs[t])}>第{startEp + itemIdx}集</Badge>{item.locked && <Lock className="h-3 w-3 text-amber-500 shrink-0" />}<Input value={item.description} onChange={(e) => updSusp(item.id, { description: e.target.value })} placeholder={item.locked ? "已锁定" : "悬念描述..."} disabled={item.locked} className="h-8 text-sm flex-1" /><Button variant="ghost" size="icon" onClick={() => delSusp(item.id)} disabled={item.locked}>{item.locked ? <Lock className="h-3.5 w-3.5 text-zinc-400" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}</Button></CardContent></Card>)}</div> })}
              </div> }
              if (t === "medium") { const collapsed = !!data.collapsedMediumSuspense
                return <div key={t}><button type="button" className="flex items-center gap-1.5 text-sm font-semibold mb-2 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors" onClick={() => update({ collapsedMediumSuspense: !collapsed })}>{collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}{ls[t]}（{items.length}个）</button>{!collapsed && items.map((item) => <Card key={item.id} className={cn("mb-2", item.locked && "opacity-70")}><CardContent className="pt-3 pb-3 flex gap-2 items-start"><Badge className={cn("text-xs shrink-0", cs[t])}>{ls[t]}</Badge>{item.locked && <Lock className="h-3 w-3 text-amber-500 shrink-0" />}<Input value={item.description} onChange={(e) => updSusp(item.id, { description: e.target.value })} placeholder={item.locked ? "已锁定" : "悬念描述..."} disabled={item.locked} className="h-8 text-sm flex-1" /><Input type="number" value={item.revealEpisode || ""} onChange={(e) => updSusp(item.id, { revealEpisode: parseInt(e.target.value) || undefined })} placeholder="揭晓集(Step7后回填)" disabled={item.locked} className="h-8 text-sm w-20" /><Button variant="ghost" size="icon" onClick={() => delSusp(item.id)} disabled={item.locked}>{item.locked ? <Lock className="h-3.5 w-3.5 text-zinc-400" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}</Button></CardContent></Card>)}</div> }
              return <div key={t}><h4 className="text-sm font-semibold mb-2">{ls[t]}</h4>{items.map((item) => <Card key={item.id} className={cn("mb-2", item.locked && "opacity-70")}><CardContent className="pt-3 pb-3 flex gap-2 items-start"><Badge className={cn("text-xs shrink-0", cs[t])}>{ls[t]}</Badge>{item.locked && <Lock className="h-3 w-3 text-amber-500 shrink-0" />}<Input value={item.description} onChange={(e) => updSusp(item.id, { description: e.target.value })} placeholder={item.locked ? "已锁定" : "悬念描述..."} disabled={item.locked} className="h-8 text-sm flex-1" /><Input type="number" value={item.revealEpisode || ""} onChange={(e) => updSusp(item.id, { revealEpisode: parseInt(e.target.value) || undefined })} placeholder="揭晓集(Step7后回填)" disabled={item.locked} className="h-8 text-sm w-20" /><Button variant="ghost" size="icon" onClick={() => delSusp(item.id)} disabled={item.locked}>{item.locked ? <Lock className="h-3.5 w-3.5 text-zinc-400" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}</Button></CardContent></Card>)}</div> })}</div>
            {data.suspenseList.length > 0 && <div className="flex justify-end"><Button variant="primary" onClick={next}>保存并继续 <ArrowRight className="h-4 w-4" /></Button></div>}
          </div>}
          {step === 6 && <div className="space-y-4"><div><h3 className="text-lg font-bold">Step 6: 整体大纲（起承转合）</h3><p className="text-sm text-zinc-500 mt-1">起（跌落谷底）→ 承（发现疑点）→ 转（逐层反击）→ 合（真相大白+逆袭）</p></div>
            <Button variant="outline" onClick={genOutline} disabled={!!generating} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 生成大纲</Button>
            {[{ k: "qi" as const, l: "起：跌落谷底", h: "主角如何被陷害，跌入人生最低谷" }, { k: "cheng" as const, l: "承：发现疑点", h: "偶然发现当年的不对劲，决定调查" }, { k: "zhuan" as const, l: "转：逐层反击", h: "隐藏身份步步调查，拆穿小阴谋" }, { k: "he" as const, l: "合：真相大白+逆袭", h: "找到终极黑手，拿出证据，重返巅峰" }].map(({ k, l, h }) => <Card key={k}><CardHeader className="pb-2"><CardTitle className="text-sm">{l}</CardTitle></CardHeader><CardContent><Textarea placeholder={h} value={data.storyOutline?.[k] || ""} onChange={(e) => update({ storyOutline: { ...data.storyOutline, [k]: e.target.value, qi: data.storyOutline?.qi || "", cheng: data.storyOutline?.cheng || "", zhuan: data.storyOutline?.zhuan || "", he: data.storyOutline?.he || "" } })} rows={4} /></CardContent></Card>)}
            {/* 参考事实 */}
            <Card className="border-dashed"><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-sm">📚 参考事实</CardTitle><Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleSearchFacts} disabled={!!generating || !data.topicTitle}>{generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}搜索相关事件</Button></div><p className="text-xs text-zinc-500">AI 检索真实发生过的事件/案例，为剧情提供参考素材</p></CardHeader>
              {(data.facts || []).length > 0 && <CardContent><div className="space-y-2">{(data.facts || []).map((f, i) => <div key={i} className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-medium">{f.title}</span><Badge className="text-[10px] bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30">{f.relevance}</Badge></div><p className="text-xs text-zinc-600 dark:text-zinc-400">{f.detail}</p></div>)}</div></CardContent>}
            </Card>
            {data.storyOutline?.qi && <div className="flex justify-end"><Button variant="primary" onClick={next}>保存并继续 <ArrowRight className="h-4 w-4" /></Button></div>}
          </div>}
          {step === 7 && <div className="space-y-4"><div><h3 className="text-lg font-bold">Step 7: 分集大纲</h3><p className="text-sm text-zinc-500 mt-1">每集：标题、概要、核心冲突、结尾钩子。</p></div>
            <div className="flex gap-2 items-center"><Button variant="outline" onClick={genEps} disabled={!!generating} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 生成分集</Button><Button variant="outline" size="sm" onClick={addEpsFive} disabled={!!generating} className="gap-1">{generating === "addEps" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}+5集</Button><div className="flex items-center gap-1.5 ml-auto"><span className="text-xs text-zinc-500">总集数:</span><Input type="number" value={data.totalEpisodes || 12} onChange={(e) => update({ totalEpisodes: parseInt(e.target.value) || 12 })} className="h-8 w-16 text-sm" /></div></div>
            <div className="space-y-2">{(() => { const GROUP = 10; const groups: EpisodeOutline[][] = []; for (let i = 0; i < data.episodeOutlines.length; i += GROUP) groups.push(data.episodeOutlines.slice(i, i + GROUP)); const saved = data.collapsedEpisodeGroups; const hasSaved = saved && saved.length > 0; return groups.map((group, gi) => { const start = gi * GROUP + 1; const end = Math.min((gi + 1) * GROUP, data.episodeOutlines.length); const collapsed = hasSaved ? saved!.includes(gi) : gi > 0; const toggle = () => { const s = new Set(hasSaved ? saved! : []); if (collapsed) s.delete(gi); else s.add(gi); update({ collapsedEpisodeGroups: Array.from(s) }) }; return <div key={gi} className="mb-3"><button type="button" className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-2 transition-colors w-full text-left" onClick={toggle}>{collapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}第 {start}-{end} 集（{group.length}集）</button>{!collapsed && <div className="space-y-2">{group.map((ep) => <Card key={ep.episodeNum} className={cn(ep.locked && "opacity-70")}><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-sm">第{ep.episodeNum}集：{ep.title}{ep.locked ? " 🔒" : ""}</CardTitle><Button variant="ghost" size="icon" onClick={() => delEp(ep.episodeNum)} disabled={ep.locked}>{ep.locked ? <Lock className="h-3.5 w-3.5 text-zinc-400" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}</Button></div></CardHeader><CardContent className="space-y-2"><Input value={ep.title} onChange={(e) => updEp(ep.episodeNum, { title: e.target.value })} placeholder={ep.locked ? "已锁定" : "标题"} disabled={ep.locked} className="h-8 text-sm" /><Textarea value={ep.summary} onChange={(e) => updEp(ep.episodeNum, { summary: e.target.value })} placeholder={ep.locked ? "已锁定" : "本集概要"} disabled={ep.locked} rows={2} className="text-sm" /><Input value={ep.conflict} onChange={(e) => updEp(ep.episodeNum, { conflict: e.target.value })} placeholder={ep.locked ? "已锁定" : "核心冲突"} disabled={ep.locked} className="h-8 text-sm" /><Input value={ep.hook} onChange={(e) => updEp(ep.episodeNum, { hook: e.target.value })} placeholder={ep.locked ? "已锁定" : "结尾钩子"} disabled={ep.locked} className="h-8 text-sm" /></CardContent></Card>)}</div>}</div> }) })()}</div>
            {data.episodeOutlines.length > 0 && <div className="flex justify-end"><Button variant="primary" onClick={next}>保存并继续 <ArrowRight className="h-4 w-4" /></Button></div>}
          </div>}
          {step === 8 && <div className="space-y-4"><div><h3 className="text-lg font-bold">Step 8: 分场大纲</h3><p className="text-sm text-zinc-500 mt-1">每集按 AI 生成时长拆分为多个场景。</p></div>
            {data.episodeOutlines.length > 0 && <div className="flex gap-1 flex-wrap">{data.episodeOutlines.map((ep) => { const active = (data.activeSceneEpisode || 1) === ep.episodeNum; const hasScenes = !!(episodeScenes[ep.episodeNum]?.length); return <button key={ep.episodeNum} onClick={() => update({ activeSceneEpisode: ep.episodeNum })} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", active ? "bg-indigo-600 text-white" : hasScenes ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200")}>第{ep.episodeNum}集 {hasScenes ? "✓" : ""}</button> })}</div>}
            <div className="flex gap-2"><Button variant="outline" onClick={() => genScenes(data.activeSceneEpisode || 1)} disabled={!!generating || !!(data.episodeOutlines.find(e => e.episodeNum === (data.activeSceneEpisode || 1))?.locked)} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 生成分场</Button><Button variant="outline" size="sm" onClick={addScenesFive} disabled={!!generating || !!(data.episodeOutlines.find(e => e.episodeNum === (data.activeSceneEpisode || 1))?.locked)} className="gap-1">{generating === "addScenes" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}+5场</Button><Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" disabled={!!(data.episodeOutlines.find(e => e.episodeNum === (data.activeSceneEpisode || 1))?.locked)} onClick={() => { const ep = data.activeSceneEpisode || 1; const sc = { ...(data.episodeSceneOutlines || {}) }; delete sc[ep]; update({ episodeSceneOutlines: sc }) }}><Trash2 className="h-3 w-3" /> 删除整集分场</Button></div>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium w-10">#</th>
                    <th className="px-2 py-1.5 text-left font-medium w-20">时长(秒)</th>
                    <th className="px-2 py-1.5 text-left font-medium w-24">地点</th>
                    <th className="px-2 py-1.5 text-left font-medium w-24">人物</th>
                    <th className="px-2 py-1.5 text-left font-medium">概要</th>
                    <th className="px-2 py-1.5 text-left font-medium">目的</th>
                    <th className="px-2 py-1.5 text-center font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {(episodeScenes[data.activeSceneEpisode || 1] || []).map((s, i) => (
                    <tr key={`${s.sceneNum}-${i}`} className={cn("border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30", s.locked && "opacity-60")}>
                      <td className="px-2 py-1 text-zinc-400">{s.sceneNum}{s.locked ? " 🔒" : ""}</td>
                      <td className="px-2 py-1"><Input type="number" value={s.durationSeconds || ""} onChange={(e) => updSc(data.activeSceneEpisode || 1, s.sceneNum, { durationSeconds: parseInt(e.target.value) || 0 })} disabled={s.locked} className="h-7 text-xs w-16" /></td>
                      <td className="px-2 py-1"><Input value={s.location} onChange={(e) => updSc(data.activeSceneEpisode || 1, s.sceneNum, { location: e.target.value })} disabled={s.locked} className="h-7 text-xs w-full" /></td>
                      <td className="px-2 py-1"><Input value={s.characters.join(",")} onChange={(e) => updSc(data.activeSceneEpisode || 1, s.sceneNum, { characters: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} disabled={s.locked} className="h-7 text-xs w-full" /></td>
                      <td className="px-2 py-1"><Input value={s.summary} onChange={(e) => updSc(data.activeSceneEpisode || 1, s.sceneNum, { summary: e.target.value })} disabled={s.locked} className="h-7 text-xs w-full" /></td>
                      <td className="px-2 py-1"><Input value={s.purpose} onChange={(e) => updSc(data.activeSceneEpisode || 1, s.sceneNum, { purpose: e.target.value })} disabled={s.locked} className="h-7 text-xs w-full" /></td>
                      <td className="px-2 py-1 text-center"><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => delSc(data.activeSceneEpisode || 1, s.sceneNum)} disabled={s.locked}>{s.locked ? <Lock className="h-3 w-3 text-zinc-400" /> : <Trash2 className="h-3 w-3 text-red-400" />}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => { const scenes = episodeScenes[data.activeSceneEpisode || 1] || []; const total = scenes.reduce((sum, s) => sum + (s.durationSeconds || 0), 0); const target = data.episodeDurationSeconds ?? 300; const diff = Math.abs(total - target); if (scenes.length === 0) return null; const avg = scenes.length > 0 ? Math.round(total / scenes.length) : 0; return <div className={cn("text-xs mt-2", diff > 30 ? "text-red-500" : diff > 10 ? "text-amber-500" : "text-emerald-500")}>⏱ {scenes.length} 场景 | 平均 ~{avg}s | 总 {Math.floor(total / 60)}分{total % 60}秒 / 目标 {Math.floor(target / 60)}分{target % 60}秒</div> })()}
            {Object.keys(episodeScenes).length > 0 && <div className="flex justify-end"><Button variant="primary" onClick={next}>保存并继续 <ArrowRight className="h-4 w-4" /></Button></div>}
          </div>}
          {step === 9 && <div className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-lg font-bold">Step 9: 剧本正文</h3><p className="text-sm text-zinc-500 mt-1">小说式叙事，每个场景 200-400 字完整故事。</p></div></div>
            {data.episodeOutlines.length > 0 && <div className="flex gap-1 flex-wrap">{data.episodeOutlines.map((ep) => { const active = (data.activeEpisode || 1) === ep.episodeNum; const hasContent = !!episodeScripts[ep.episodeNum]; const isLocked = scriptLockedEpNums.has(ep.episodeNum); return <button key={ep.episodeNum} onClick={() => update({ activeEpisode: ep.episodeNum })} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1", active ? "bg-indigo-600 text-white" : isLocked ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 cursor-not-allowed" : hasContent ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200")}>第{ep.episodeNum}集 {isLocked ? "🔒" : hasContent ? "✓" : ""}</button> })}</div>}
            <Button variant="outline" onClick={() => genScript(data.activeEpisode || 1)} disabled={!!generating || scriptLockedEpNums.has(data.activeEpisode || 1)} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 生成第{data.activeEpisode || 1}集剧本{scriptLockedEpNums.has(data.activeEpisode || 1) ? "（已锁定）" : ""}</Button><Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" disabled={scriptLockedEpNums.has(data.activeEpisode || 1)} onClick={() => { const ep = data.activeEpisode || 1; const sc = { ...episodeScripts }; delete sc[ep]; update({ episodeScripts: sc }) }}><Trash2 className="h-3 w-3" /> 删除本集剧本</Button>
            {scriptLockedEpNums.has(data.activeEpisode || 1) ? (
              <div className="relative">
                <Textarea value={episodeScripts[data.activeEpisode || 1] || ""} disabled rows={20} className="text-sm leading-relaxed opacity-60" />
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg pointer-events-none">
                  <span className="text-sm text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                    <Lock className="h-4 w-4" />已锁定 — 分场大纲已推进到第 {sceneMaxEp} 集，前 {sceneMaxEp - 1} 集剧本受保护
                  </span>
                </div>
              </div>
            ) : (
              <Textarea placeholder="===SCENE 1===\n深夜的办公室只剩下电脑屏幕的冷光。林深盯着那行不断跳动的错误代码，指尖在键盘上微微发抖——三年的心血，全线崩盘。\n\n&#34;深哥，服务器被锁了。&#34;周明的声音从身后传来，带着一丝他从未听过的平静。\n\n林深猛地转身，对上周明那双不再掩饰的眼睛。&#34;是你？&#34;\n\n周明没回答，只是把一份文件推到他面前——股权转让协议，签名处早就盖好了章。" value={episodeScripts[data.activeEpisode || 1] || ""} onChange={(e) => update({ episodeScripts: { ...episodeScripts, [data.activeEpisode || 1]: e.target.value } })} rows={20} className="text-sm leading-relaxed" />
            )}
            {Object.keys(episodeScripts).length > 0 && <div className="flex justify-end"><Button variant="primary" onClick={next}>完成</Button></div>}
          </div>}
          <div className="flex items-center justify-between pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <Button variant="ghost" onClick={prev} disabled={step === 1}><ArrowLeft className="h-4 w-4" /> 上一步</Button>
            <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}保存进度</Button>
            <Button variant="primary" onClick={next} disabled={step === 9}>下一步 <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function applyFix(
  result: string,
  category: string,
  episodes: EpisodeOutline[],
  chars: CharacterCard[],
  susp: SuspenseItem[],
  setter: (v: { eps: EpisodeOutline[], chars: CharacterCard[], susp: SuspenseItem[] }) => void
) {
  if (category === "人设") {
    const blocks = result.split(/---CHARACTER---/g).filter((b) => b.includes("---END---"))
    let newChars = [...chars]
    for (const block of blocks) {
      const content = block.split("---END---")[0]?.trim()
      if (!content) continue
      const ex = (l: string) => { const r = new RegExp(`${l}[：:]\\s*(.+)`, "i"); const m = content.match(r)?.[1]; return m ? m.trim().replace(/\*\*.*?\*\*/g, "").replace(/【.*?】/g, "").trim() : "" }
      const name = ex("名字")
      if (!name || name.length > 8 || name.includes("核心") || name.includes("修复")) continue
      const idx = newChars.findIndex((c) => c.name === name)
      const card: CharacterCard = { id: idx >= 0 ? newChars[idx].id : crypto.randomUUID(), name, role: ex("定位") || "配角", gender: ex("性别") || "未知", age: ex("年龄") || "未知", identity: ex("身份"), personality: ex("性格"), secret: ex("隐藏秘密"), goal: ex("核心目的"), weakness: ex("弱点"), signature: ex("标志性动作|标志性动作/台词|标志性台词") }
      if (idx >= 0) newChars = newChars.map((c, i) => i === idx ? card : c)
      else newChars = [...newChars, card]
    }
    setter({ eps: episodes, chars: newChars, susp })
  } else if (category === "悬念") {
    const items = result.split(/===SUSPENSE===/g).filter((b) => b.includes("===END==="))
    const newItems: SuspenseItem[] = []
    for (const block of items) {
      const content = block.split("===END===")[0]?.trim()
      if (!content) continue
      const ex = (l: string) => { const r = new RegExp(`${l}[：:]\\s*(.+)`, "i"); return content.match(r)?.[1]?.trim() || "" }
      const desc = ex("描述"); if (!desc) continue
      const newItem: SuspenseItem = { id: crypto.randomUUID(), type: (ex("类型") || "hook") as SuspenseItem["type"], description: desc, revealEpisode: parseInt(ex("揭晓集")) || undefined, status: "pending" }
      // Dedup: skip if similar description already exists
      const isDuplicate = susp.some(s => s.description === desc || (s.description.length > 10 && desc.length > 10 && s.description.includes(desc.substring(0, 10)) || desc.includes(s.description.substring(0, 10))))
      if (!isDuplicate) newItems.push(newItem)
    }
    if (newItems.length) setter({ eps: episodes, chars, susp: [...susp, ...newItems] })
  } else {
    const eps = result.split(/===EPISODE===/g).filter((b) => b.includes("===END==="))
    if (eps.length > 0) {
      let newEps = [...episodes]
      for (const block of eps) {
        const content = block.split("===END===")[0]?.trim()
        if (!content) continue
        const ex = (l: string) => { const r = new RegExp(`${l}[：:]\\s*(.+)`, "i"); return content.match(r)?.[1]?.trim() || "" }
        const num = parseInt(ex("集数")) || 0
        const idx = newEps.findIndex((e) => e.episodeNum === num)
        if (idx >= 0) newEps = newEps.map((e, i) => i === idx ? { ...e, title: ex("标题") || e.title, summary: ex("概要") || e.summary, conflict: ex("冲突") || e.conflict, hook: ex("钩子") || e.hook } : e)
      }
      setter({ eps: newEps, chars, susp })
    }
  }
}

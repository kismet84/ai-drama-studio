"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Volume2, Loader2, Play, Square, Download, RefreshCw, ChevronDown, ChevronRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import { analyzeEpisodeDialogue } from "./_actions"

interface DialogueLine {
  id: string
  sceneNum: number
  speaker: string
  line: string
  emotion: string
  voiceId?: string
  audioBase64?: string
  generating: boolean
}

const SILICONFLOW_VOICES: Record<string, string> = {
  "温柔女声": "FunAudioLLM/CosyVoice2-0.5B:anna",
  "沉稳男声": "FunAudioLLM/CosyVoice2-0.5B:alex", 
  "活泼女声": "FunAudioLLM/CosyVoice2-0.5B:bella",
  "知性女声": "FunAudioLLM/CosyVoice2-0.5B:alice",
  "磁性男声": "FunAudioLLM/CosyVoice2-0.5B:ben",
  "甜美少女": "FunAudioLLM/CosyVoice2-0.5B:luna",
  "霸道总裁": "FunAudioLLM/CosyVoice2-0.5B:alex",
  "温暖少年": "FunAudioLLM/CosyVoice2-0.5B:ben",
}

// 对白提取已迁移到服务端 DeepSeek (_actions.ts → analyzeEpisodeDialogue)

export default function VoiceStudioPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([])
  const [loaded, setLoaded] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [activeEp, setActiveEp] = useState(1)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ lineId: string; field: "speaker" | "emotion" | "line" } | null>(null)
  const [editValue, setEditValue] = useState("")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set())
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    setDialogueLines([])
    setLoaded(false)
    loadDialogue(activeEp).finally(() => setLoaded(true))
  }, [projectId, activeEp])

  const generateLine = async (lineId: string) => {
    setDialogueLines(prev => prev.map(l => l.id === lineId ? { ...l, generating: true } : l))
    try {
      const line = dialogueLines.find(l => l.id === lineId)
      if (!line) return
      const voice = line.voiceId || SILICONFLOW_VOICES["温柔女声"]
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.line, voice, emotion: line.emotion }),
      })
      const data = await res.json()
      if (data.audioBase64) {
        setDialogueLines(prev => prev.map(l => l.id === lineId ? { ...l, audioBase64: data.audioBase64, generating: false } : l))
        // 持久化：按集号嵌套
        fetch(`/api/projects/${projectId}`).then(r => r.json()).then((proj: any) => {
          const sd = proj.scriptData || {}
          const episodeAudio = sd.episodeAudio || {}
          const epAudio = { ...(episodeAudio[activeEp] || {}) }
          epAudio[lineId] = data.audioBase64
          return fetch(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scriptData: { ...sd, episodeAudio: { ...episodeAudio, [activeEp]: epAudio } } })
          })
        }).catch(() => {})
      } else {
        setDialogueLines(prev => prev.map(l => l.id === lineId ? { ...l, generating: false } : l))
      }
    } catch {
      setDialogueLines(prev => prev.map(l => l.id === lineId ? { ...l, generating: false } : l))
    }
  }

  const generateAll = async () => {
    setGeneratingAll(true)
    const pending = dialogueLines.filter(l => !l.audioBase64)
    for (const line of pending) {
      await generateLine(line.id)
    }
    setGeneratingAll(false)
  }

  const generateScene = async (sceneNum: number) => {
    const sceneLines = dialogueLines.filter(l => l.sceneNum === sceneNum && !l.audioBase64)
    for (const line of sceneLines) {
      await generateLine(line.id)
    }
  }

  // Group lines by scene
  const sceneGroups = new Map<number, DialogueLine[]>()
  dialogueLines.forEach(l => {
    const arr = sceneGroups.get(l.sceneNum) || []
    arr.push(l)
    sceneGroups.set(l.sceneNum, arr)
  })

  const playAudio = (lineId: string) => {
    const line = dialogueLines.find(l => l.id === lineId)
    if (!line?.audioBase64) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (playing === lineId) { setPlaying(null); return }
    
    const audio = new Audio(`data:audio/mp3;base64,${line.audioBase64}`)
    audio.onended = () => setPlaying(null)
    audio.play()
    audioRef.current = audio
    setPlaying(lineId)
  }

  const downloadLine = (line: DialogueLine) => {
    if (!line.audioBase64) return
    const a = document.createElement("a")
    a.href = `data:audio/mp3;base64,${line.audioBase64}`
    a.download = `场景${line.sceneNum}_${line.speaker}.mp3`
    a.click()
  }

  const startEdit = (lineId: string, field: "speaker" | "emotion" | "line", current: string) => {
    setEditingCell({ lineId, field })
    setEditValue(current)
  }

  const saveEdit = () => {
    if (!editingCell) return
    setDialogueLines(prev => prev.map(l =>
      l.id === editingCell.lineId ? { ...l, [editingCell.field]: editValue } : l
    ))
    setEditingCell(null)
  }

  const emotions = ["平静", "愤怒", "开心", "冷漠", "悲伤", "温柔", "惊讶", "独白"]

  const loadDialogue = async (ep: number, force = false) => {
    setAnalyzing(true)
    try {
      const extracted = await analyzeEpisodeDialogue(projectId, ep, force)
      const data = await fetch(`/api/projects/${projectId}`).then(r => r.json())
      const sd = data.scriptData || {}
      const savedAudio = (sd.episodeAudio || {})[ep] || {}
      const chars = sd.characters || []
      const lines: DialogueLine[] = extracted.map((l, i) => ({
        id: `${ep}-${l.sceneNum}-${i}`,
        sceneNum: l.sceneNum,
        speaker: l.speaker,
        emotion: l.emotion || "平静",
        line: l.line,
        generating: false,
      }))
      lines.forEach(line => {
        const char = chars.find((c: any) => c.name === line.speaker)
        if (char?.voiceId) line.voiceId = char.voiceId
        if (savedAudio[line.id]) line.audioBase64 = savedAudio[line.id]
      })
      setDialogueLines(lines)
      setProject(data)
    } catch {
      setDialogueLines([])
    } finally {
      setAnalyzing(false)
    }
  }

  if (!loaded) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-zinc-400" /></div>
  }

  const episodeScripts = project?.scriptData?.episodeScripts || {}
  const epNums = Object.keys(episodeScripts).map(Number).sort((a: number, b: number) => a - b)
  const totalLines = dialogueLines.length
  const doneLines = dialogueLines.filter(l => !!l.audioBase64).length

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">配音工坊</h2>
            <p className="text-sm text-zinc-500 mt-1">逐句生成 TTS 配音，支持 MiniMax 8 种音色</p>
          </div>
          {totalLines > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => loadDialogue(activeEp, true)} disabled={analyzing}>
                {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                重新分析
              </Button>
              <Button variant="primary" onClick={generateAll} disabled={generatingAll} className="gap-2">
                {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                一键生成全部 ({doneLines}/{totalLines})
              </Button>
            </div>
          )}
        </div>

        {/* Episode tabs */}
        {epNums.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {epNums.map((n: number) => (
              <button key={n} onClick={() => setActiveEp(n)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", activeEp === n ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200")}>第{n}集</button>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {totalLines > 0 && (
          <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(doneLines / totalLines) * 100}%` }} />
          </div>
        )}

        {analyzing ? (
          <div className="text-center py-16 text-zinc-400">
            <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin" />
            <p className="text-sm">DeepSeek 正在通读全文，提取对白...</p>
            <p className="text-xs mt-1">分析全文语境，识别说话人、情绪和内心独白</p>
          </div>
        ) : totalLines === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <Volume2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无对白数据</p>
            <p className="text-xs mt-1">请先在 Step 10 生成剧本正文</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const scenes = Array.from(sceneGroups.entries()).sort(([a], [b]) => a - b)
              const GROUP = 5
              const groups: [number, DialogueLine[]][][] = []
              for (let i = 0; i < scenes.length; i += GROUP) {
                groups.push(scenes.slice(i, i + GROUP))
              }
              return groups.map((group, gi) => {
                const startScene = group[0][0]
                const endScene = group[group.length - 1][0]
                const collapsed = collapsedGroups.has(gi)
                const toggle = () => {
                  setCollapsedGroups(prev => {
                    const next = new Set(prev)
                    if (collapsed) next.delete(gi); else next.add(gi)
                    return next
                  })
                }
                return (
                  <div key={gi}>
                    <button
                      className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-2 transition-colors"
                      onClick={toggle}
                    >
                      {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      场景 {startScene} — {endScene}（{group.length} 个场景）
                    </button>
                    {!collapsed && (
                      <div className="space-y-4">
                        {group.map(([sceneNum, lines]) => {
                          const sceneDone = lines.filter(l => !!l.audioBase64).length
                          const sceneTotal = lines.length
                          return (
                            <div key={sceneNum}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold">场景 {sceneNum}</span>
                                  <Badge className="text-[10px]">{sceneDone}/{sceneTotal}</Badge>
                                </div>
                                {sceneDone < sceneTotal && (
                                  <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => generateScene(sceneNum)}>
                                    <Volume2 className="h-3 w-3" /> 生成本场景
                                  </Button>
                                )}
                              </div>
                              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left font-medium w-8">#</th>
                                      <th className="px-2 py-1.5 text-left font-medium w-16">角色</th>
                                      <th className="px-2 py-1.5 text-left font-medium w-14">情绪</th>
                                      <th className="px-2 py-1.5 text-left font-medium">对白</th>
                                      <th className="px-2 py-1.5 text-center font-medium w-24">配音</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((line, i) => (
                                      <tr key={line.id} className={cn(
                                        "border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30",
                                        line.audioBase64 && "bg-emerald-50/30 dark:bg-emerald-950/10"
                                      )}>
                                        <td className="px-2 py-1.5 text-zinc-400">{i + 1}</td>
                                        <td className="px-2 py-1.5">
                                          {editingCell?.lineId === line.id && editingCell?.field === "speaker" ? (
                                            <input className="w-full h-5 text-[11px] px-1 rounded border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-zinc-900" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingCell(null) }} autoFocus />
                                          ) : (
                                            <span className="font-medium cursor-pointer hover:text-indigo-600" onClick={() => startEdit(line.id, "speaker", line.speaker)}>{line.speaker}</span>
                                          )}
                                        </td>
                                        <td className="px-2 py-1.5">
                                          {editingCell?.lineId === line.id && editingCell?.field === "emotion" ? (
                                            <select className="w-full h-5 text-[10px] rounded border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-zinc-900" value={editValue} onChange={e => { setEditValue(e.target.value); setDialogueLines(prev => prev.map(l => l.id === line.id ? { ...l, emotion: e.target.value } : l)); setEditingCell(null) }} onBlur={() => setEditingCell(null)} autoFocus>
                                              {emotions.map(e => <option key={e} value={e}>{e}</option>)}
                                            </select>
                                          ) : (
                                            <Badge className="text-[10px] bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 cursor-pointer hover:ring-1 hover:ring-indigo-400" onClick={() => startEdit(line.id, "emotion", line.emotion)}>{line.emotion}</Badge>
                                          )}
                                        </td>
                                        <td className="px-2 py-1.5 text-zinc-600 dark:text-zinc-400 max-w-xs">
                                          {editingCell?.lineId === line.id && editingCell?.field === "line" ? (
                                            <input className="w-full h-5 text-[11px] px-1 rounded border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-zinc-900" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingCell(null) }} autoFocus />
                                          ) : (
                                            <span className="cursor-pointer hover:text-indigo-600 block truncate" onClick={() => startEdit(line.id, "line", line.line)}>{line.line}</span>
                                          )}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          {!line.audioBase64 ? (
                                            <Button variant="outline" size="sm" className="h-5 text-[10px] gap-1" onClick={() => generateLine(line.id)} disabled={line.generating}>
                                              {line.generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}生成
                                            </Button>
                                          ) : (
                                            <div className="flex items-center justify-center gap-0.5">
                                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => playAudio(line.id)}>
                                                {playing === line.id ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                                              </Button>
                                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => downloadLine(line)}><Download className="h-3 w-3" /></Button>
                                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => generateLine(line.id)}><RefreshCw className="h-3 w-3" /></Button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

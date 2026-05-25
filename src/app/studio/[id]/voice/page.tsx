"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Volume2, Loader2, Play, Square, Download, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"

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

// Parse script content into dialogue lines
function parseScript(scriptContent: string): DialogueLine[] {
  const lines: DialogueLine[] = []
  const scenes = scriptContent.split(/===SCENE\s*\d+\s*===/g).filter(Boolean)
  
  scenes.forEach((sceneBlock, sceneIdx) => {
    const sceneLines = sceneBlock.split("\n").filter(Boolean)
    sceneLines.forEach((rawLine) => {
      // Match pattern: 角色名（情绪）：台词 or 角色名：台词
      const match = rawLine.match(/^([^（(]+)[（(]([^）)]+)[）)]\s*[：:]\s*(.+)/)
      if (match) {
        lines.push({
          id: `${sceneIdx + 1}-${lines.length}`,
          sceneNum: sceneIdx + 1,
          speaker: match[1].trim(),
          emotion: match[2].trim(),
          line: match[3].trim(),
          generating: false,
        })
      } else {
        const simpleMatch = rawLine.match(/^([^：:]+)[：:]\s*(.+)/)
        if (simpleMatch && !rawLine.startsWith("场景描述") && !rawLine.startsWith("===")) {
          lines.push({
            id: `${sceneIdx + 1}-${lines.length}`,
            sceneNum: sceneIdx + 1,
            speaker: simpleMatch[1].trim(),
            emotion: "平静",
            line: simpleMatch[2].trim(),
            generating: false,
          })
        }
      }
    })
  })

  return lines
}

export default function VoiceStudioPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([])
  const [loaded, setLoaded] = useState(false)
  const [activeEp, setActiveEp] = useState(1)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}`).then(r => r.json()).then(data => {
      setProject(data)
      const sd = data.scriptData
      if (sd?.episodeScripts) {
        const script = sd.episodeScripts[activeEp] || ""
        const parsed = parseScript(script)
        // Match voice IDs from character cards
        const chars = sd.characters || []
        parsed.forEach(line => {
          const char = chars.find((c: any) => c.name === line.speaker)
          if (char?.voiceId) line.voiceId = char.voiceId
        })
        setDialogueLines(parsed)
      }
      setLoaded(false)
      setLoaded(true)
    })
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

  if (!loaded) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-zinc-400" /></div>
  }

  const episodeScripts = project?.scriptData?.episodeScripts || {}
  const epNums = Object.keys(episodeScripts).map(Number).sort((a: number, b: number) => a - b)
  const totalLines = dialogueLines.length
  const doneLines = dialogueLines.filter(l => !!l.audioBase64).length

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">配音工坊</h2>
            <p className="text-sm text-zinc-500 mt-1">逐句生成 TTS 配音，支持 MiniMax 8 种音色</p>
          </div>
          {totalLines > 0 && (
            <Button variant="primary" onClick={generateAll} disabled={generatingAll} className="gap-2">
              {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              一键生成全部 ({doneLines}/{totalLines})
            </Button>
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

        {totalLines === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <Volume2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无对白数据</p>
            <p className="text-xs mt-1">请先在 Step 10 生成剧本正文，包含对白后回到这里</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(sceneGroups.entries()).sort(([a], [b]) => a - b).map(([sceneNum, lines]) => {
              const sceneDone = lines.filter(l => !!l.audioBase64).length
              const sceneTotal = lines.length
              return (
                <div key={sceneNum} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">场景 {sceneNum}</span>
                      <Badge className="text-xs">{sceneDone}/{sceneTotal}</Badge>
                    </div>
                    {sceneDone < sceneTotal && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => generateScene(sceneNum)}>
                        <Volume2 className="h-3 w-3" /> 生成本场景
                      </Button>
                    )}
                  </div>
                  {lines.map((line) => (
                    <Card key={line.id} className={cn(line.audioBase64 ? "border-emerald-200 dark:border-emerald-800" : "")}>
                      <CardContent className="py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-sm font-medium">{line.speaker}</span>
                            <span className="text-[10px] text-zinc-400">({line.emotion})</span>
                          </div>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{line.line}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!line.audioBase64 ? (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => generateLine(line.id)} disabled={line.generating}>
                              {line.generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
                            </Button>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => playAudio(line.id)}>
                                {playing === line.id ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => downloadLine(line)}>
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => generateLine(line.id)}>
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

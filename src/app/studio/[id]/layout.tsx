import Link from "next/link"
import {
  ArrowLeft,
  FileText,
  Palette,
  Mic,
  Clapperboard,
} from "lucide-react"
import { cn } from "@/lib/utils/cn"

const studioLinks = [
  { href: "script", label: "剧本工坊", icon: FileText, desc: "AI 编剧 & 编辑" },
  { href: "visual", label: "视觉工坊", icon: Palette, desc: "角色 & 分镜 & 画面" },
  { href: "voice", label: "配音工坊", icon: Mic, desc: "TTS & 音效" },
  { href: "composition", label: "合成工坊", icon: Clapperboard, desc: "剪辑 & 导出" },
]

interface StudioLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export default async function StudioLayout({ children, params }: StudioLayoutProps) {
  const { id } = await params

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 flex flex-col shrink-0">
        <div className="px-4 h-14 flex items-center border-b border-zinc-200 dark:border-zinc-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回项目列表
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <div className="px-3 py-4 space-y-1">
            {studioLinks.map((link) => (
              <Link
                key={link.href}
                href={`/studio/${id}/${link.href}`}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                  "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100",
                  "dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-800"
                )}
              >
                <link.icon className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{link.label}</span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{link.desc}</span>
                </div>
              </Link>
            ))}
          </div>
        </nav>
      </aside>
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}

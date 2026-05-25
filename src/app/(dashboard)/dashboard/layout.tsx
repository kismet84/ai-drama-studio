import Link from "next/link"
import {
  LayoutDashboard,
  Plus,
  Clapperboard,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"
import { quickCreateProject } from "./actions"

const sidebarLinks = [
  { href: "/dashboard", label: "项目总览", icon: LayoutDashboard, exact: true },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 h-14 border-b border-zinc-200 dark:border-zinc-800">
          <Clapperboard className="h-6 w-6 text-indigo-600" />
          <span className="font-bold text-lg">Drama Studio</span>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {sidebarLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100",
                "dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-800"
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Create Project Button */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
          <form action={quickCreateProject}>
            <Button className="w-full gap-2" variant="primary" type="submit">
              <Plus className="h-4 w-4" />
              创建新项目
            </Button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

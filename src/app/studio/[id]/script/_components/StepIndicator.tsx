"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { WIZARD_STEPS, type WizardStep } from "@/types"

interface StepIndicatorProps {
  currentStep: WizardStep
  completedSteps: Set<number>
  onStepClick: (step: WizardStep) => void
}

const stepColors: Record<number, string> = {
  1: "bg-rose-500", 2: "bg-orange-500", 3: "bg-amber-500", 4: "bg-emerald-500",
  5: "bg-purple-500", 6: "bg-blue-500", 7: "bg-cyan-500", 8: "bg-teal-500",
  9: "bg-indigo-500", 10: "bg-green-500",
}

export default function StepIndicator({ currentStep, completedSteps, onStepClick }: StepIndicatorProps) {
  return (
    <nav className="flex flex-col gap-0.5">
      {WIZARD_STEPS.map(({ step, title, desc }) => {
        const isCompleted = completedSteps.has(step)
        const isCurrent = currentStep === step
        const isClickable = isCompleted || step === currentStep || step === currentStep + 1
        return (
          <button key={step} onClick={() => isClickable && onStepClick(step)} disabled={!isClickable}
            className={cn(
              "flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 group",
              isCurrent && "bg-zinc-100 dark:bg-zinc-800 shadow-sm",
              isClickable && !isCurrent && "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer",
              !isClickable && "opacity-40 cursor-not-allowed"
            )}>
            <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold transition-colors",
              isCompleted ? `${stepColors[step]} text-white`
              : isCurrent ? `${stepColors[step]} text-white ring-2 ring-offset-1 ring-zinc-200 dark:ring-zinc-700`
              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400")}>
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : step}
            </div>
            <div className="flex flex-col min-w-0">
              <span className={cn("text-sm font-medium truncate", isCurrent ? "text-zinc-900 dark:text-zinc-50" : isCompleted ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-400")}>{title}</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{desc}</span>
            </div>
          </button>
        )
      })}
    </nav>
  )
}

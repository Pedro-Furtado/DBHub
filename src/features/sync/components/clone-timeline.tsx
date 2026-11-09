import { AlertTriangle, CheckCircle2, CircleDashed, CircleMinus, XCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn, formatNumber } from '@/lib/utils'

export type TimelineStep = {
  id: string
  label: string
  status: 'running' | 'done' | 'skipped' | 'failed'
  detail?: string
  progress?: { done: number; total: number; detail?: string }
}

export type TimelineItem = { kind: 'step'; step: TimelineStep } | { kind: 'warn'; id: string; message: string }

function StepIcon({ status }: { status: TimelineStep['status'] }) {
  if (status === 'running') return <Spinner className="size-4 text-primary" />
  if (status === 'done') return <CheckCircle2 className="size-4 text-emerald-500" />
  if (status === 'skipped') return <CircleMinus className="size-4 text-muted-foreground" />
  if (status === 'failed') return <XCircle className="size-4 text-destructive" />
  return <CircleDashed className="size-4 text-muted-foreground" />
}

/** Linha do tempo ao vivo do clone: cada etapa que o server anuncia via SSE aparece aqui. */
export function CloneTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative space-y-1">
      {items.map((item) => {
        if (item.kind === 'warn') {
          return (
            <li key={item.id} className="flex gap-3 rounded-md bg-warning/5 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span className="text-warning">{item.message}</span>
            </li>
          )
        }
        const { step } = item
        const pct = step.progress && step.progress.total > 0 ? Math.min(100, (step.progress.done / step.progress.total) * 100) : null
        return (
          <li key={step.id} className={cn('rounded-md px-3 py-2', step.status === 'running' && 'bg-primary/5')}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                <StepIcon status={step.status} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={cn('text-sm', step.status === 'skipped' && 'text-muted-foreground')}>{step.label}</span>
                  {step.progress && step.status === 'running' && (
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {formatNumber(step.progress.done)} / {formatNumber(step.progress.total)}
                    </span>
                  )}
                </div>
                {step.detail && <p className="text-xs text-muted-foreground">{step.detail}</p>}
                {step.status === 'running' && step.progress?.detail && (
                  <p className="truncate font-mono text-xs text-muted-foreground">{step.progress.detail}</p>
                )}
                {pct !== null && step.status === 'running' && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

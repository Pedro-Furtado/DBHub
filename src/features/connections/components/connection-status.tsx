import { cn } from '@/lib/utils'
import type { ConnectionStatus as Status } from '@/types/database'

const styles: Record<Status, { dot: string; label: string }> = {
  online: { dot: 'bg-primary shadow-[0_0_0_3px] shadow-primary/20', label: 'Online' },
  offline: { dot: 'bg-destructive shadow-[0_0_0_3px] shadow-destructive/20', label: 'Offline' },
  unknown: { dot: 'bg-muted-foreground', label: 'Não testada' },
}

export function ConnectionStatusDot({ status, className }: { status: Status; className?: string }) {
  return <span aria-label={styles[status].label} className={cn('inline-block size-2 shrink-0 rounded-full', styles[status].dot, className)} />
}

export function ConnectionStatusLabel({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <ConnectionStatusDot status={status} />
      {styles[status].label}
    </span>
  )
}

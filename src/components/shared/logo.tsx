import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-7', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary/15" />
      <g fill="none" strokeWidth="2.2" className="stroke-primary">
        <ellipse cx="16" cy="9.5" rx="8" ry="3.2" />
        <path d="M8 9.5v13c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-13" />
        <path d="M8 16c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2" />
      </g>
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <LogoMark />
      DBHub
    </span>
  )
}

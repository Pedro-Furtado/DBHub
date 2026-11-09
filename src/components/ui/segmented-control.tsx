import { cn } from '@/lib/utils'

type SegmentedControlProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  'aria-label': string
  className?: string
}

/** Grupo de botões exclusivos (ex.: ALL · SELECT · INSERT…). Navegável por teclado como radio group. */
export function SegmentedControl<T extends string>({ value, onChange, options, className, ...props }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={props['aria-label']} className={cn('inline-flex rounded-lg bg-muted p-[3px]', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-7 flex-1 rounded-md px-3 font-mono text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active ? 'bg-background text-foreground shadow-sm dark:bg-input/40' : 'hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

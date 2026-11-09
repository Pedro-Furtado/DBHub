import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

type FieldProps = {
  label: string
  htmlFor: string
  hint?: ReactNode
  error?: string
  className?: string
  children: ReactNode
}

/** Agrupa label + controle + dica/erro, para formulários consistentes. */
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

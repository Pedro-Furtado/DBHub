import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const inputBase =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20'

type InputProps = ComponentProps<'input'> & {
  /** Ícone à esquerda (ex.: lupa de busca). */
  icon?: ReactNode
  /** Classe do wrapper quando há ícone. */
  containerClassName?: string
}

export function Input({ className, containerClassName, type, icon, ...props }: InputProps) {
  if (!icon) {
    return <input type={type} data-slot="input" className={cn(inputBase, className)} {...props} />
  }
  return (
    <div className={cn('relative w-full', containerClassName)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <input type={type} data-slot="input" className={cn(inputBase, 'pl-9', className)} {...props} />
    </div>
  )
}

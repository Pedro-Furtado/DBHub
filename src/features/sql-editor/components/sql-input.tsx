import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

type SqlInputProps = {
  value: string
  onChange: (value: string) => void
  onRun: () => void
  className?: string
}

/**
 * Editor SQL simples (textarea com números de linha).
 * Fase 3: substituir por Monaco com autocomplete de tabelas/colunas —
 * a interface (value/onChange/onRun) continua a mesma.
 */
export function SqlInput({ value, onChange, onRun, className }: SqlInputProps) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const lines = value.split('\n').length

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      onRun()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const el = event.currentTarget
      const { selectionStart, selectionEnd } = el
      const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`
      onChange(next)
      requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2))
    }
  }

  return (
    <div className={cn('flex min-h-0 overflow-hidden bg-background font-mono text-[13px] leading-6', className)}>
      <div ref={gutterRef} aria-hidden className="select-none overflow-hidden border-r bg-sidebar px-3 py-3 text-right text-muted-foreground/60">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        aria-label="Editor SQL"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
        }}
        className="flex-1 resize-none whitespace-pre bg-transparent px-4 py-3 outline-none placeholder:text-muted-foreground"
        placeholder="select * from public.leads limit 100;"
      />
    </div>
  )
}

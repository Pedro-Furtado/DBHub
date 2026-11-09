import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type EnumValuesInputProps = {
  id?: string
  values: string[]
  onChange: (values: string[]) => void
  /** Valores que já existem no banco: não podem ser removidos nem reordenados (limitação do Postgres). */
  locked?: string[]
}

/** Lista ordenada de valores do enum: digite e Enter (ou vírgula) para adicionar. */
export function EnumValuesInput({ id, values, onChange, locked = [] }: EnumValuesInputProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  function add(raw = draft) {
    const items = raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (!items.length) return
    const repeated = items.find((v) => values.includes(v))
    if (repeated) return setError(`"${repeated}" já está na lista`)
    const tooLong = items.find((v) => new TextEncoder().encode(v).length > 63)
    if (tooLong) return setError('Máximo de 63 caracteres por valor')
    onChange([...values, ...new Set(items)])
    setDraft('')
    setError(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add()
    } else if (event.key === 'Backspace' && !draft && values.length && !locked.includes(values.at(-1)!)) {
      onChange(values.slice(0, -1))
    }
  }

  const move = (index: number, delta: number) => {
    const next = [...values]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item!)
    onChange(next)
  }

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          className="font-mono text-xs"
          placeholder="ex.: pendente, pago, enviado"
          value={draft}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => draft.trim() && add()}
        />
        <Button type="button" variant="outline" size="icon" aria-label="Adicionar valor" onClick={() => add()}>
          <Plus />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {values.length > 0 ? (
        <ol className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-1">
          {values.map((value, index) => {
            const isLocked = locked.includes(value)
            // Valores novos só podem ser movidos entre si, depois dos que já existem
            const firstMovable = locked.length
            return (
              <li key={value} className="group flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                <span className="w-5 text-right font-mono text-[11px] text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{value}</span>
                {isLocked ? (
                  <span className="text-[11px] text-muted-foreground">existente</span>
                ) : (
                  <div className="flex items-center opacity-60 group-hover:opacity-100">
                    <Button type="button" variant="ghost" size="icon-xs" className="size-6" aria-label={`Subir ${value}`} disabled={index <= firstMovable} onClick={() => move(index, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" className="size-6" aria-label={`Descer ${value}`} disabled={index === values.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" className="size-6" aria-label={`Remover ${value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
                      <X />
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum valor ainda. A ordem da lista é a ordem do enum (usada no ORDER BY).</p>
      )}
    </div>
  )
}

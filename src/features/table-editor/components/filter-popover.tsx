import { Filter, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FilterOperator, RowFilter } from '@/features/database/api/database-api'
import type { ColumnInfo } from '@/types/database'

const operators: { value: FilterOperator; label: string; noValue?: boolean }[] = [
  { value: 'eq', label: 'igual a' },
  { value: 'neq', label: 'diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'starts', label: 'começa com' },
  { value: 'ends', label: 'termina com' },
  { value: 'gt', label: 'maior que' },
  { value: 'gte', label: 'maior ou igual' },
  { value: 'lt', label: 'menor que' },
  { value: 'lte', label: 'menor ou igual' },
  { value: 'in', label: 'em (lista, vírgula)' },
  { value: 'is_null', label: 'é nulo', noValue: true },
  { value: 'not_null', label: 'não é nulo', noValue: true },
]
const needsValue = (op: FilterOperator) => !operators.find((o) => o.value === op)?.noValue

type FilterPopoverProps = {
  columns: ColumnInfo[]
  filters: RowFilter[]
  match: 'all' | 'any'
  onApply: (filters: RowFilter[], match: 'all' | 'any') => void
}

/**
 * Filtros por coluna (como no Supabase). Edita um rascunho e só aplica no "Aplicar",
 * para não disparar uma consulta a cada tecla.
 */
export function FilterPopover({ columns, filters, match, onApply }: FilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<RowFilter[]>(filters)
  const [draftMatch, setDraftMatch] = useState(match)

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(filters.length ? filters : [{ column: columns[0]?.name ?? '', op: 'eq', value: '' }])
      setDraftMatch(match)
    }
    setOpen(next)
  }

  const update = (i: number, patch: Partial<RowFilter>) => setDraft((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const complete = draft.filter((f) => f.column && (!needsValue(f.op) || (f.value ?? '') !== ''))

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant={filters.length ? 'secondary' : 'ghost'} size="sm" className={filters.length ? 'text-primary' : undefined}>
          <Filter /> {filters.length ? `${filters.length} ${filters.length === 1 ? 'filtro' : 'filtros'}` : 'Filtrar'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[34rem] p-3">
        <div className="grid gap-2">
          {draft.length > 1 && (
            <SegmentedControl
              aria-label="Combinar filtros"
              value={draftMatch}
              onChange={setDraftMatch}
              options={[
                { value: 'all', label: 'todos (E)' },
                { value: 'any', label: 'qualquer um (OU)' },
              ]}
              className="w-fit"
            />
          )}

          {draft.map((filter, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_9.5rem_minmax(0,1fr)_auto] items-center gap-2">
              <Select value={filter.column} onValueChange={(v) => update(i, { column: v })}>
                <SelectTrigger size="sm" className="w-full font-mono text-xs" aria-label="Coluna">
                  <SelectValue placeholder="coluna" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.name} value={c.name} className="font-mono text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filter.op} onValueChange={(v) => update(i, { op: v as FilterOperator })}>
                <SelectTrigger size="sm" className="w-full text-xs" aria-label="Operador">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Valor"
                className="h-8 font-mono text-xs"
                placeholder={needsValue(filter.op) ? 'valor' : '—'}
                disabled={!needsValue(filter.op)}
                value={filter.value ?? ''}
                onChange={(e) => update(i, { value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onApply(complete, draftMatch)
                    setOpen(false)
                  }
                }}
              />
              <Button variant="ghost" size="icon-sm" aria-label="Remover filtro" onClick={() => setDraft((prev) => prev.filter((_, idx) => idx !== i))}>
                <X />
              </Button>
            </div>
          ))}

          <div className="mt-1 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setDraft((prev) => [...prev, { column: columns[0]?.name ?? '', op: 'eq', value: '' }])}>
              <Plus /> Adicionar filtro
            </Button>
            <div className="flex gap-2">
              {filters.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onApply([], 'all')
                    setOpen(false)
                  }}
                >
                  Limpar
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  onApply(complete, draftMatch)
                  setOpen(false)
                }}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

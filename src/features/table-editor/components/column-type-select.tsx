import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEnums } from '@/features/database/hooks/use-database'
import { cn } from '@/lib/utils'
import type { ColumnType } from '@/types/database'
import { columnTypeOptions, enumKey, isEnumType, typeGroups, typeLabel } from '../lib/column-types'
import { CreateEnumDialog } from './enum/create-enum-dialog'

const NEW_ENUM = '__new_enum__'

type ColumnTypeSelectProps = {
  connectionId: string
  value: string
  onChange: (type: ColumnType) => void
  id?: string
  size?: 'sm' | 'default'
  className?: string
  /** Item extra no topo (ex.: "manter: tipo atual") */
  keep?: { value: string; label: string }
}

/** Seletor de tipo de coluna: tipos nativos agrupados + enums do banco + atalho para criar enum. */
export function ColumnTypeSelect({ connectionId, value, onChange, id, size = 'default', className, keep }: ColumnTypeSelectProps) {
  const [creating, setCreating] = useState(false)
  const enums = useEnums(connectionId)
  const selectedIsEnum = value !== keep?.value && isEnumType(value as ColumnType)

  return (
    <>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next === NEW_ENUM) return setCreating(true)
          onChange(next as ColumnType)
        }}
      >
        <SelectTrigger id={id} size={size} className={cn('w-full font-mono text-xs', className)} aria-label="Tipo">
          {/* Enum recém-criado pode ainda não estar na lista: mostra o nome mesmo assim */}
          <SelectValue>{selectedIsEnum ? typeLabel(value as ColumnType) : undefined}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {keep && (
            <SelectItem value={keep.value} className="font-mono text-xs">
              {keep.label}
            </SelectItem>
          )}
          {typeGroups.map((group) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {columnTypeOptions
                .filter((t) => t.group === group)
                .map((t) => (
                  <SelectItem key={t.value} value={t.value} className="font-mono text-xs">
                    {t.label}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Enums</SelectLabel>
            {(enums.data ?? []).map((e) => (
              <SelectItem key={enumKey(e)} value={enumKey(e)} className="font-mono text-xs">
                <span>{typeLabel(enumKey(e))}</span>
                <span className="ml-2 truncate text-[11px] text-muted-foreground">{e.values.slice(0, 3).join(', ')}{e.values.length > 3 ? '…' : ''}</span>
              </SelectItem>
            ))}
            <SelectItem value={NEW_ENUM} className="text-xs text-primary">
              <Plus /> Criar enum…
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <CreateEnumDialog connectionId={connectionId} open={creating} onOpenChange={setCreating} onCreated={onChange} />
    </>
  )
}

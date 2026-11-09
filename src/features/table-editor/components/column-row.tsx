import { KeyRound, Link2, Settings2, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { useColumns, useEnums } from '@/features/database/hooks/use-database'
import { cn } from '@/lib/utils'
import type { ColumnDefinition, TableInfo } from '@/types/database'
import { acceptsTypeArgs, defaultSuggestions, type DraftColumn, isEnumType, isIntegerType, typeLabel } from '../lib/column-types'
import { parsePgType } from '../lib/pg-type'
import { ColumnTypeSelect } from './column-type-select'

type ColumnRowProps = {
  connectionId: string
  column: DraftColumn
  tables: TableInfo[]
  errors?: Partial<Record<keyof ColumnDefinition, string>>
  onChange: (patch: Partial<ColumnDefinition>) => void
  onRemove?: () => void
  /** Ao adicionar coluna numa tabela que já tem PK */
  disablePrimaryKey?: boolean
}

/** Uma linha do editor de colunas: nome · tipo · padrão · PK · opções avançadas. */
export function ColumnRow({ connectionId, column, tables, errors, onChange, onRemove, disablePrimaryKey }: ColumnRowProps) {
  const enums = useEnums(connectionId)
  const suggestions = defaultSuggestions(column.type, enums.data)
  const listId = `defaults-${column.key}`
  const optionsCount = [!column.nullable && !column.isPrimaryKey, column.unique, column.isArray, column.isIdentity, column.references].filter(Boolean).length

  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto_auto_auto] items-start gap-2">
      <div>
        <Input
          aria-label="Nome da coluna"
          placeholder="nome_da_coluna"
          className="h-8 font-mono text-xs"
          value={column.name}
          aria-invalid={Boolean(errors?.name)}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {errors?.name && <p className="mt-1 text-[11px] text-destructive">{errors.name}</p>}
      </div>

      <ColumnTypeSelect
        connectionId={connectionId}
        size="sm"
        value={column.type}
        onChange={(type) =>
          onChange({
            type,
            isIdentity: column.isIdentity && isIntegerType(type),
            typeArgs: acceptsTypeArgs(type) ? column.typeArgs : undefined,
            // Padrão de outro tipo raramente serve no novo (ex.: 0 → enum)
            defaultValue: type === column.type ? column.defaultValue : undefined,
          })
        }
      />

      <div>
        <Input
          aria-label="Valor padrão"
          placeholder={column.isIdentity ? 'auto incremento' : isEnumType(column.type) && suggestions[0] ? `ex.: ${suggestions[0]}` : 'NULL'}
          disabled={column.isIdentity}
          list={listId}
          className="h-8 font-mono text-xs"
          value={column.defaultValue ?? ''}
          aria-invalid={Boolean(errors?.defaultValue)}
          onChange={(e) => onChange({ defaultValue: e.target.value || undefined })}
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {errors?.defaultValue && <p className="mt-1 text-[11px] text-destructive">{errors.defaultValue}</p>}
      </div>

      <Tooltip content={disablePrimaryKey ? 'A tabela já tem chave primária' : 'Chave primária'}>
        <label className="flex h-8 w-10 cursor-pointer items-center justify-center">
          <Checkbox
            aria-label="Chave primária"
            disabled={disablePrimaryKey}
            checked={column.isPrimaryKey}
            onCheckedChange={(v) => onChange({ isPrimaryKey: v === true, nullable: v === true ? false : column.nullable })}
          />
        </label>
      </Tooltip>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Mais opções" className="relative">
            <Settings2 />
            {optionsCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                {optionsCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96">
          <ColumnOptions connectionId={connectionId} column={column} tables={tables} onChange={onChange} />
        </PopoverContent>
      </Popover>

      <Tooltip content={onRemove ? 'Remover coluna' : 'A tabela precisa de pelo menos uma coluna'}>
        <span>
          <Button variant="ghost" size="icon-sm" aria-label="Remover coluna" disabled={!onRemove} onClick={onRemove}>
            <Trash2 />
          </Button>
        </span>
      </Tooltip>

      {(column.isPrimaryKey || column.references || column.isIdentity) && (
        <div className="col-span-6 -mt-1 flex flex-wrap gap-1.5">
          {column.isPrimaryKey && (
            <Badge variant="warning">
              <KeyRound /> chave primária
            </Badge>
          )}
          {column.isIdentity && <Badge variant="secondary">auto incremento</Badge>}
          {column.references && (
            <Badge>
              <Link2 /> {column.references.schema}.{column.references.table}.{column.references.column}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

function OptionSwitch({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', disabled && 'opacity-50')}>
      <Label htmlFor={id} className="flex-col items-start gap-0.5 text-sm">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      <Switch id={id} size="sm" checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

function ColumnOptions({ connectionId, column, tables, onChange }: Pick<ColumnRowProps, 'connectionId' | 'column' | 'tables' | 'onChange'>) {
  const ref = column.references
  const targets = tables.filter((t) => t.kind === 'table')
  const targetColumns = useColumns(connectionId, ref?.schema, ref?.table)

  // Chave estrangeira precisa do mesmo tipo da coluna referenciada (ex.: users.id bigint → int8).
  // Ajusta o tipo uma vez por relacionamento escolhido; depois o usuário pode mudar à vontade.
  const appliedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!ref) {
      appliedFor.current = null
      return
    }
    const key = `${ref.schema}.${ref.table}.${ref.column}`
    const target = targetColumns.data?.find((c) => c.name === ref.column)
    if (!target || appliedFor.current === key) return
    appliedFor.current = key
    const parsed = target.enum ? { type: `${target.enum.schema}.${target.enum.name}` as const, typeArgs: undefined, isArray: false } : parsePgType(target.type)
    if (parsed && (parsed.type !== column.type || parsed.typeArgs !== column.typeArgs)) {
      onChange({ type: parsed.type, typeArgs: parsed.typeArgs, isArray: false, isIdentity: false })
    }
  }, [ref, targetColumns.data, column.type, column.typeArgs, onChange])

  return (
    <div className="grid gap-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Opções da coluna</p>
      <OptionSwitch
        id={`nullable-${column.key}`}
        label="Pode ser nulo"
        hint="Desmarcado = NOT NULL"
        checked={column.nullable && !column.isPrimaryKey}
        disabled={column.isPrimaryKey}
        onChange={(v) => onChange({ nullable: v })}
      />
      <OptionSwitch id={`unique-${column.key}`} label="Único" hint="Não permite valores repetidos" checked={column.unique} disabled={column.isPrimaryKey} onChange={(v) => onChange({ unique: v })} />
      <OptionSwitch
        id={`identity-${column.key}`}
        label="Auto incremento"
        hint="generated by default as identity"
        checked={column.isIdentity}
        disabled={!isIntegerType(column.type)}
        onChange={(v) => onChange({ isIdentity: v, defaultValue: v ? undefined : column.defaultValue })}
      />
      <OptionSwitch id={`array-${column.key}`} label="Lista (array)" hint={`${typeLabel(column.type)}[]`} checked={column.isArray} onChange={(v) => onChange({ isArray: v })} />

      {acceptsTypeArgs(column.type) && (
        <div className="grid gap-1.5">
          <Label htmlFor={`args-${column.key}`}>{column.type === 'varchar' ? 'Tamanho máximo' : 'Precisão, escala'}</Label>
          <Input
            id={`args-${column.key}`}
            className="h-8 font-mono text-xs"
            placeholder={column.type === 'varchar' ? '255' : '10,2'}
            value={column.typeArgs ?? ''}
            onChange={(e) => onChange({ typeArgs: e.target.value || undefined })}
          />
        </div>
      )}

      <Separator />
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Chave estrangeira</p>
      <Select
        value={ref ? `${ref.schema}.${ref.table}` : '__none__'}
        onValueChange={(value) => {
          if (value === '__none__') return onChange({ references: undefined })
          const [schema, table] = value.split('.') as [string, string]
          onChange({ references: { schema, table, column: 'id', onDelete: ref?.onDelete ?? 'no action' } })
        }}
      >
        <SelectTrigger size="sm" className="w-full text-xs" aria-label="Tabela referenciada">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Sem relacionamento</SelectItem>
          {targets.map((t) => (
            <SelectItem key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`} className="font-mono text-xs">
              {t.schema}.{t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {ref && (
        <div className="grid grid-cols-2 gap-2">
          <Select value={ref.column} onValueChange={(v) => onChange({ references: { ...ref, column: v } })}>
            <SelectTrigger size="sm" className="w-full font-mono text-xs" aria-label="Coluna referenciada">
              <SelectValue placeholder="coluna" />
            </SelectTrigger>
            <SelectContent>
              {(targetColumns.data ?? []).map((c) => (
                <SelectItem key={c.name} value={c.name} className="font-mono text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ref.onDelete} onValueChange={(v) => onChange({ references: { ...ref, onDelete: v as typeof ref.onDelete } })}>
            <SelectTrigger size="sm" className="w-full text-xs" aria-label="Ao excluir">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no action">Ao excluir: bloquear</SelectItem>
              <SelectItem value="cascade">Ao excluir: cascata</SelectItem>
              <SelectItem value="set null">Ao excluir: NULL</SelectItem>
              <SelectItem value="restrict">Ao excluir: restrict</SelectItem>
            </SelectContent>
          </Select>
          <p className="col-span-2 text-[11px] text-muted-foreground">O tipo desta coluna é ajustado para o mesmo da coluna referenciada.</p>
        </div>
      )}
    </div>
  )
}

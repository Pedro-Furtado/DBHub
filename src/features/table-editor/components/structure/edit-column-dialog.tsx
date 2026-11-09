import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { SqlPreview } from '@/components/shared/sql-preview'
import { LockKeyhole } from 'lucide-react'
import { isTextType } from '@/components/data-grid/cell-format'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { databaseApi } from '@/features/database/api/database-api'
import { useDdlPreview, useEnums, useInvalidateStructure } from '@/features/database/hooks/use-database'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import type { AlterColumnInput, ColumnInfo, ColumnType } from '@/types/database'
import { acceptsTypeArgs, defaultSuggestions, enumKey } from '../../lib/column-types'
import { ColumnTypeSelect } from '../column-type-select'
import { parsePgType } from '../../lib/pg-type'

type EditColumnDialogProps = {
  connectionId: string
  schema: string
  table: string
  column: ColumnInfo | null
  onClose: () => void
}

const KEEP = '__keep__'

function initialState(column: ColumnInfo) {
  const parsed = column.enum
    ? { type: enumKey(column.enum), typeArgs: undefined, isArray: column.type.endsWith('[]') }
    : parsePgType(column.type)
  return {
    name: column.name,
    type: (parsed?.type ?? KEEP) as ColumnType | typeof KEEP,
    typeArgs: parsed?.typeArgs ?? '',
    isArray: parsed?.isArray ?? false,
    defaultValue: column.isIdentity ? '' : (column.defaultValue ?? ''),
    nullable: column.nullable,
    unique: Boolean(column.isUnique),
    hashed: Boolean(column.isHashed),
    hashExisting: true,
  }
}

/** Só manda para o server o que mudou de verdade. */
function diff(column: ColumnInfo, form: ReturnType<typeof initialState>): AlterColumnInput {
  const start = initialState(column)
  const change: AlterColumnInput = {}
  if (form.name.trim() !== column.name) change.name = form.name.trim()
  if (form.type !== KEEP && (form.type !== start.type || form.typeArgs !== start.typeArgs || form.isArray !== start.isArray)) {
    change.type = form.type
    change.isArray = form.isArray
    if (acceptsTypeArgs(form.type) && form.typeArgs) change.typeArgs = form.typeArgs
  }
  if (form.defaultValue.trim() !== start.defaultValue) change.defaultValue = form.defaultValue.trim() || null
  if (form.nullable !== start.nullable) change.nullable = form.nullable
  if (form.unique !== start.unique) change.unique = form.unique
  if (form.hashed !== start.hashed) {
    change.hashed = form.hashed
    if (form.hashed) change.hashExisting = form.hashExisting
  }
  return change
}

export function EditColumnDialog({ connectionId, schema, table, column, onClose }: EditColumnDialogProps) {
  const [form, setForm] = useState(() => (column ? initialState(column) : null))
  const [editing, setEditing] = useState(column)
  const [saving, setSaving] = useState(false)
  const invalidate = useInvalidateStructure(connectionId)
  const enums = useEnums(connectionId)

  // Reinicia o formulário ao abrir para outra coluna
  if (column !== editing) {
    setEditing(column)
    setForm(column ? initialState(column) : null)
  }

  const change = column && form ? diff(column, form) : {}
  const hasChanges = Object.keys(change).length > 0
  const debounced = useDebouncedValue(hasChanges ? change : null, 350)
  const preview = useDdlPreview(`alter-column:${schema}.${table}.${column?.name}`, debounced, (c) =>
    databaseApi.alterColumn(connectionId, schema, table, column!.name, c, { dryRun: true }),
  )

  if (!column || !form) return <Dialog open={false} />

  const set = (patch: Partial<typeof form>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev))
  const type = form.type === KEEP ? null : form.type

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!hasChanges || !column) return onClose()
    setSaving(true)
    try {
      await databaseApi.alterColumn(connectionId, schema, table, column.name, change)
      await invalidate()
      toast.success(`Coluna ${change.name ?? column.name} atualizada`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar a coluna')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar coluna</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {schema}.{table}.{column.name} · {column.type}
          </DialogDescription>
        </DialogHeader>

        <form id="edit-column-form" onSubmit={handleSubmit} className="grid min-w-0 gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="col-name">
              <Input id="col-name" className="font-mono" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Tipo" htmlFor="col-type" hint={type ? 'Os dados existentes são convertidos (USING)' : undefined}>
              <ColumnTypeSelect
                id="col-type"
                connectionId={connectionId}
                value={form.type}
                keep={!column.enum && !parsePgType(column.type) ? { value: KEEP, label: `manter: ${column.type}` } : undefined}
                onChange={(t) => set({ type: t })}
              />
            </Field>
          </div>

          {type && (
            <div className="grid gap-4 sm:grid-cols-2">
              {acceptsTypeArgs(type) && (
                <Field label={type === 'varchar' ? 'Tamanho máximo' : 'Precisão, escala'} htmlFor="col-args">
                  <Input id="col-args" className="font-mono" placeholder={type === 'varchar' ? '255' : '10,2'} value={form.typeArgs} onChange={(e) => set({ typeArgs: e.target.value })} />
                </Field>
              )}
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-start-2 sm:mt-6">
                <Label htmlFor="col-array">Lista (array)</Label>
                <Switch id="col-array" size="sm" checked={form.isArray} onCheckedChange={(v) => set({ isArray: v })} />
              </div>
            </div>
          )}

          <Field
            label="Valor padrão"
            htmlFor="col-default"
            hint={column.isIdentity ? 'Coluna auto incremento — o valor é gerado pelo banco' : 'Expressão SQL. Vazio = sem valor padrão'}
          >
            <Input
              id="col-default"
              className="font-mono text-xs"
              disabled={column.isIdentity}
              list="col-default-suggestions"
              placeholder="NULL"
              value={form.defaultValue}
              onChange={(e) => set({ defaultValue: e.target.value })}
            />
            <datalist id="col-default-suggestions">
              {type && defaultSuggestions(type, enums.data).map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>

          <div className="grid gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="col-nullable" className="flex-col items-start gap-0.5">
                Pode ser nulo
                <span className="text-xs font-normal text-muted-foreground">
                  {column.isPrimaryKey ? 'Coluna da chave primária é sempre NOT NULL' : 'Desligar falha se já existir linha com NULL'}
                </span>
              </Label>
              <Switch id="col-nullable" size="sm" disabled={column.isPrimaryKey} checked={form.nullable} onCheckedChange={(v) => set({ nullable: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="col-unique" className="flex-col items-start gap-0.5">
                Único
                <span className="text-xs font-normal text-muted-foreground">Falha se já existirem valores repetidos</span>
              </Label>
              <Switch id="col-unique" size="sm" disabled={column.isPrimaryKey} checked={form.unique} onCheckedChange={(v) => set({ unique: v })} />
            </div>
          </div>

          {isTextType(column.type) && (
            <div className={cn('grid gap-3 rounded-md border p-3', form.hashed && 'border-primary/40 bg-primary/5')}>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="col-hashed" className="flex-col items-start gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <LockKeyhole className="size-3.5 text-primary" /> Coluna de senha — sempre salvar como hash
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Um trigger no banco aplica bcrypt em todo INSERT/UPDATE: vale para o DBHub, sua aplicação e o SQL Editor. Usa a extensão pgcrypto.
                  </span>
                </Label>
                <Switch id="col-hashed" size="sm" checked={form.hashed} onCheckedChange={(v) => set({ hashed: v })} />
              </div>
              {form.hashed && !column.isHashed && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={form.hashExisting} onCheckedChange={(v) => set({ hashExisting: v === true })} />
                  Converter as senhas que já estão em texto puro
                </label>
              )}
              {!form.hashed && column.isHashed && (
                <p className="text-xs text-warning">Desligando, as próximas senhas serão salvas como texto puro. As que já estão em hash continuam em hash.</p>
              )}
            </div>
          )}

          <SqlPreview
            sql={hasChanges ? preview.data?.sql : undefined}
            error={hasChanges ? preview.error : null}
            loading={hasChanges && preview.isFetching}
            placeholder="Nenhuma alteração ainda."
          />
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-column-form" disabled={!hasChanges} loading={saving}>
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

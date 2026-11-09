import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { SqlPreview } from '@/components/shared/sql-preview'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { databaseApi } from '@/features/database/api/database-api'
import { useDdlPreview, useInvalidateStructure, useTables } from '@/features/database/hooks/use-database'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { type DraftColumn, newColumn } from '../../lib/column-types'
import { ColumnRow } from '../column-row'

type AddColumnDialogProps = {
  connectionId: string
  schema: string
  table: string
  open: boolean
  hasPrimaryKey: boolean
  onOpenChange: (open: boolean) => void
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/** Adicionar coluna reaproveita a mesma linha de edição do "Nova tabela". */
export function AddColumnDialog({ connectionId, schema, table, open, hasPrimaryKey, onOpenChange }: AddColumnDialogProps) {
  const [column, setColumn] = useState<DraftColumn>(() => newColumn())
  const [saving, setSaving] = useState(false)
  const tables = useTables(connectionId)
  const invalidate = useInvalidateStructure(connectionId)

  const { key: _key, ...definition } = column
  const valid = IDENTIFIER.test(column.name.trim())
  const debounced = useDebouncedValue(valid && open ? { ...definition, name: definition.name.trim() } : null, 350)
  const preview = useDdlPreview(`add-column:${schema}.${table}`, debounced, (c) => databaseApi.addColumn(connectionId, schema, table, c, { dryRun: true }))

  function close(next: boolean) {
    if (!next) setColumn(newColumn())
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    setSaving(true)
    try {
      await databaseApi.addColumn(connectionId, schema, table, { ...definition, name: definition.name.trim() })
      await invalidate()
      toast.success(`Coluna ${column.name} adicionada`)
      close(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível adicionar a coluna')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Adicionar coluna</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {schema}.{table}
          </DialogDescription>
        </DialogHeader>

        <form id="add-column-form" onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto_auto_auto] gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Nome</span>
            <span>Tipo</span>
            <span>Valor padrão</span>
            <span className="w-10 text-center">PK</span>
            <span className="w-8" />
            <span className="w-8" />
          </div>
          <ColumnRow
            connectionId={connectionId}
            column={column}
            tables={tables.data ?? []}
            disablePrimaryKey={hasPrimaryKey}
            onChange={(patch) => setColumn((prev) => ({ ...prev, ...patch }))}
          />
          <p className="text-xs text-muted-foreground">
            Coluna obrigatória (NOT NULL) numa tabela com dados precisa de um valor padrão — senão o Postgres recusa.
          </p>
          <SqlPreview sql={preview.data?.sql} error={preview.error} loading={preview.isFetching} placeholder="Dê um nome à coluna para ver o SQL." />
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="add-column-form" disabled={!valid} loading={saving}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { SqlPreview } from '@/components/shared/sql-preview'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { databaseApi } from '@/features/database/api/database-api'
import { useDdlPreview, useInvalidateStructure, useSchemas, useStructure } from '@/features/database/hooks/use-database'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { AlterTableInput } from '@/types/database'

type EditTableDialogProps = {
  connectionId: string
  schema: string
  table: string
  comment: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function EditTableDialog({ connectionId, schema, table, comment, open, onOpenChange }: EditTableDialogProps) {
  const navigate = useNavigate()
  const schemas = useSchemas(connectionId)
  const invalidate = useInvalidateStructure(connectionId)
  const [form, setForm] = useState({ name: table, schema, comment: comment ?? '' })
  const [saving, setSaving] = useState(false)
  const [openedWith, setOpenedWith] = useState(open)

  // Ao abrir, recarrega os valores atuais
  if (open !== openedWith) {
    setOpenedWith(open)
    if (open) setForm({ name: table, schema, comment: comment ?? '' })
  }

  const change: AlterTableInput = {}
  if (form.name.trim() !== table) change.name = form.name.trim()
  if (form.schema !== schema) change.schema = form.schema
  if (form.comment.trim() !== (comment ?? '')) change.comment = form.comment.trim() || null
  const valid = IDENTIFIER.test(form.name.trim())
  const hasChanges = Object.keys(change).length > 0

  const debounced = useDebouncedValue(open && valid && hasChanges ? change : null, 350)
  const preview = useDdlPreview(`alter-table:${schema}.${table}`, debounced, (c) => databaseApi.alterTable(connectionId, schema, table, c, { dryRun: true }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!hasChanges || !valid) return onOpenChange(false)
    setSaving(true)
    try {
      const result = await databaseApi.alterTable(connectionId, schema, table, change)
      toast.success('Tabela atualizada')
      onOpenChange(false)
      // Renomeou/moveu: vai para o nome novo e não recarrega o nome antigo (daria 404)
      const moved = result.schema !== schema || result.name !== table
      // Só troca de tela se você estava vendo essa tabela (renomear pela lista lateral não te tira da tela atual)
      const viewing = window.location.pathname.endsWith(`/tables/${schema}/${table}`)
      if (moved && viewing) await navigate(`/c/${connectionId}/tables/${result.schema}/${result.name}${window.location.search}`, { replace: true })
      await invalidate(moved ? { schema, table } : undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar a tabela')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar tabela</DialogTitle>
          <DialogDescription>Renomear, mover de schema ou mudar a descrição.</DialogDescription>
        </DialogHeader>
        <form id="edit-table-form" onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <Field label="Schema" htmlFor="tbl-schema">
              <Select value={form.schema} onValueChange={(v) => setForm((f) => ({ ...f, schema: v }))}>
                <SelectTrigger id="tbl-schema" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(schemas.data ?? [schema]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nome" htmlFor="tbl-name" error={!valid ? 'Use letras, números e _' : undefined}>
              <Input id="tbl-name" className="font-mono" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
          </div>
          <Field label="Descrição" htmlFor="tbl-comment">
            <Textarea id="tbl-comment" rows={2} value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
          </Field>
          {(change.name || change.schema) && (
            <p className="text-xs text-warning">Apps e queries que usam o nome antigo deixam de funcionar.</p>
          )}
          <SqlPreview sql={hasChanges ? preview.data?.sql : undefined} error={hasChanges ? preview.error : null} loading={preview.isFetching} placeholder="Nenhuma alteração ainda." />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-table-form" disabled={!hasChanges || !valid} loading={saving}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Abre o "Editar tabela" de qualquer lugar (lista lateral, cabeçalho): busca a descrição atual antes. */
export function EditTableLoader({ connectionId, schema, table, onClose }: { connectionId: string; schema: string; table: string; onClose: () => void }) {
  const structure = useStructure(connectionId, schema, table)
  if (structure.isLoading) return null
  return (
    <EditTableDialog
      connectionId={connectionId}
      schema={schema}
      table={table}
      comment={structure.data?.comment ?? null}
      open
      onOpenChange={(open) => !open && onClose()}
    />
  )
}

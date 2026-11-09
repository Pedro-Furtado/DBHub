import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { SqlPreview } from '@/components/shared/sql-preview'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { databaseApi } from '@/features/database/api/database-api'
import { useDdlPreview, useEnums, useInvalidateStructure, useSchemas } from '@/features/database/hooks/use-database'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { ColumnType } from '@/types/database'
import { enumKey } from '../../lib/column-types'
import { EnumValuesInput } from './enum-values-input'

type CreateEnumDialogProps = {
  connectionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado com o tipo criado ("schema.nome") para já selecioná-lo na coluna */
  onCreated?: (type: ColumnType) => void
  defaultSchema?: string
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/** Cria um tipo enum (CREATE TYPE … AS ENUM) com prévia do SQL. */
export function CreateEnumDialog({ connectionId, open, onOpenChange, onCreated, defaultSchema = 'public' }: CreateEnumDialogProps) {
  const [schema, setSchema] = useState(defaultSchema)
  const [name, setName] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const schemas = useSchemas(connectionId)
  const enums = useEnums(connectionId)
  const invalidate = useInvalidateStructure(connectionId)

  const trimmed = name.trim()
  const nameError = trimmed && !IDENTIFIER.test(trimmed) ? 'Use letras, números e _ (sem espaços ou acentos), começando por letra' : undefined
  const exists = enums.data?.some((e) => e.schema === schema && e.name === trimmed)
  const valid = Boolean(trimmed) && !nameError && !exists && values.length > 0

  const input = { schema, name: trimmed, values }
  const debounced = useDebouncedValue(valid && open ? input : null, 300)
  const preview = useDdlPreview('create-enum', debounced, (i) => databaseApi.createEnum(connectionId, i, { dryRun: true }))

  function close(next: boolean) {
    if (!next) {
      setName('')
      setValues([])
      setSchema(defaultSchema)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Impede que o submit suba para o formulário da tabela por trás
    event.stopPropagation()
    if (!valid) return
    setSaving(true)
    try {
      const created = await databaseApi.createEnum(connectionId, input)
      await invalidate()
      toast.success(`Enum ${created.name} criado`)
      onCreated?.(enumKey(created))
      close(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o enum')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo enum</DialogTitle>
          <DialogDescription>Um tipo com uma lista fechada de valores — a coluna só aceita o que estiver na lista.</DialogDescription>
        </DialogHeader>

        <form id="create-enum-form" onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field label="Schema" htmlFor="enum-schema">
              <Select value={schema} onValueChange={setSchema}>
                <SelectTrigger id="enum-schema" className="w-full font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(schemas.data ?? [defaultSchema]).map((s) => (
                    <SelectItem key={s} value={s} className="font-mono text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nome" htmlFor="enum-name" error={nameError ?? (exists ? 'Já existe um enum com esse nome' : undefined)}>
              <Input id="enum-name" autoFocus className="font-mono" placeholder="status_pedido" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>

          <Field label="Valores" htmlFor="enum-values">
            <EnumValuesInput id="enum-values" values={values} onChange={setValues} />
          </Field>

          <SqlPreview sql={valid ? preview.data?.sql : undefined} error={valid ? preview.error : null} loading={valid && preview.isFetching} placeholder="Dê um nome e adicione pelo menos um valor." />
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="create-enum-form" disabled={!valid} loading={saving}>
            Criar enum
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

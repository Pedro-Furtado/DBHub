import { useQuery } from '@tanstack/react-query'
import { Code2, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { databaseApi } from '@/features/database/api/database-api'
import { useCreateTable, useSchemas, useTables } from '@/features/database/hooks/use-database'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { ApiError } from '@/lib/api-client'
import type { ColumnDefinition, CreateTableInput } from '@/types/database'
import { initialColumns, newColumn, type DraftColumn } from '../lib/column-types'
import { ColumnRow } from './column-row'

type CreateTableSheetProps = {
  connectionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/
type FieldErrors = Record<string, string>

function toInput(schema: string, name: string, comment: string, columns: DraftColumn[]): CreateTableInput {
  return {
    schema,
    name: name.trim(),
    comment: comment.trim() || undefined,
    columns: columns.map(({ key: _key, ...c }) => ({ ...c, name: c.name.trim() })),
  }
}

/** Painel "Nova tabela" — o server gera e executa o DDL; a prévia mostra exatamente o SQL que vai rodar. */
export function CreateTableSheet({ connectionId, open, onOpenChange }: CreateTableSheetProps) {
  const navigate = useNavigate()
  const schemas = useSchemas(connectionId)
  const tables = useTables(connectionId)
  const createTable = useCreateTable(connectionId)

  const [schema, setSchema] = useState('public')
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [columns, setColumns] = useState<DraftColumn[]>(initialColumns)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [showSql, setShowSql] = useState(true)

  const input = toInput(schema, name, comment, columns)
  const debounced = useDebouncedValue(input, 400)
  // Checa o valor com debounce (o que vai na requisição), não o atual — senão a prévia sai com dados velhos
  const ready = IDENTIFIER.test(debounced.name) && debounced.columns.every((c) => IDENTIFIER.test(c.name))

  const preview = useQuery({
    queryKey: ['create-table-preview', connectionId, debounced],
    queryFn: () => databaseApi.previewCreateTable(connectionId, debounced),
    enabled: open && showSql && ready,
    retry: false,
    placeholderData: (prev) => prev,
  })

  function reset() {
    setSchema('public')
    setName('')
    setComment('')
    setColumns(initialColumns())
    setErrors({})
  }

  function updateColumn(key: number, patch: Partial<ColumnDefinition>) {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
    setErrors({})
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!input.name) next.name = 'Informe o nome da tabela'
    else if (!IDENTIFIER.test(input.name)) next.name = 'Use letras, números e _ (sem espaços ou acentos)'
    const seen = new Set<string>()
    input.columns.forEach((c, i) => {
      if (!c.name) next[`columns.${i}.name`] = 'Obrigatório'
      else if (!IDENTIFIER.test(c.name)) next[`columns.${i}.name`] = 'Nome inválido'
      else if (seen.has(c.name.toLowerCase())) next[`columns.${i}.name`] = 'Repetido'
      seen.add(c.name.toLowerCase())
    })
    return next
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    try {
      const created = await createTable.mutateAsync(input)
      toast.success(`Tabela ${created.schema}.${created.name} criada`)
      onOpenChange(false)
      reset()
      navigate(`/c/${connectionId}/tables/${created.schema}/${created.name}`)
    } catch (error) {
      // Erros de validação do server vêm com o caminho do campo (ex.: columns.2.defaultValue)
      if (error instanceof ApiError && Array.isArray(error.details)) {
        setErrors(Object.fromEntries((error.details as { path: string; message: string }[]).map((d) => [d.path, d.message])))
      }
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar a tabela')
    }
  }

  const columnErrors = (i: number) => ({
    name: errors[`columns.${i}.name`],
    defaultValue: errors[`columns.${i}.defaultValue`],
  })

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setErrors({})
      }}
    >
      <SheetContent className="sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Nova tabela</SheetTitle>
          <SheetDescription>Defina as colunas — o SQL gerado aparece embaixo antes de criar.</SheetDescription>
        </SheetHeader>

        <SheetBody>
          <form id="create-table-form" onSubmit={handleSubmit} className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field label="Schema" htmlFor="table-schema">
                <Select value={schema} onValueChange={setSchema}>
                  <SelectTrigger id="table-schema" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(schemas.data ?? ['public']).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nome" htmlFor="table-name" error={errors.name} hint="Minúsculas e _ são o padrão do Postgres, ex.: pedidos_itens">
                <Input
                  id="table-name"
                  autoFocus
                  placeholder="nome_da_tabela"
                  className="font-mono"
                  value={name}
                  aria-invalid={Boolean(errors.name)}
                  onChange={(e) => {
                    setName(e.target.value)
                    setErrors({})
                  }}
                />
              </Field>
            </div>

            <Field label="Descrição (opcional)" htmlFor="table-comment">
              <Textarea id="table-comment" rows={2} placeholder="Para que serve esta tabela" value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>

            <section className="grid gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Colunas</h3>
                <span className="text-xs text-muted-foreground">{columns.length} {columns.length === 1 ? 'coluna' : 'colunas'}</span>
              </div>

              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto_auto_auto] gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Nome</span>
                <span>Tipo</span>
                <span>Valor padrão</span>
                <span className="w-10 text-center">PK</span>
                <span className="w-8" />
                <span className="w-8" />
              </div>

              <div className="grid gap-3">
                {columns.map((column, i) => (
                  <ColumnRow
                    key={column.key}
                    connectionId={connectionId}
                    column={column}
                    tables={tables.data ?? []}
                    errors={columnErrors(i)}
                    onChange={(patch) => updateColumn(column.key, patch)}
                    onRemove={columns.length > 1 ? () => setColumns((prev) => prev.filter((c) => c.key !== column.key)) : undefined}
                  />
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setColumns((prev) => [...prev, newColumn()])}>
                <Plus /> Adicionar coluna
              </Button>
            </section>

            <section className="grid gap-2">
              <button
                type="button"
                className="flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setShowSql((v) => !v)}
              >
                <Code2 className="size-4" /> {showSql ? 'Ocultar SQL' : 'Ver SQL gerado'}
              </button>
              {showSql && (
                <div className="rounded-lg border bg-sidebar">
                  {!ready ? (
                    <p className="p-4 text-xs text-muted-foreground">Preencha os nomes da tabela e das colunas para ver o SQL.</p>
                  ) : preview.isError ? (
                    <p className="p-4 text-xs text-destructive">{preview.error.message}</p>
                  ) : preview.data ? (
                    <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">{preview.data.sql}</pre>
                  ) : (
                    <div className="grid gap-2 p-4">
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-3 w-72" />
                      <Skeleton className="h-3 w-60" />
                    </div>
                  )}
                </div>
              )}
            </section>
          </form>
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="create-table-form" loading={createTable.isPending}>
            Criar tabela
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

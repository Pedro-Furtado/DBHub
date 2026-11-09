import { KeyRound, LockKeyhole } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { isBooleanType, isJsonType, isTextType, looksLikeSecretColumn, validateEditValue } from '@/components/data-grid/cell-format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { dateKindOf } from '@/components/ui/date-kind'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useInsertRow } from '@/features/database/hooks/use-database'
import type { ColumnInfo, Row } from '@/types/database'

type InsertRowDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  schema: string
  table: string
  columns: ColumnInfo[]
}

/** Valor especial: campo vazio = deixa o Postgres usar o DEFAULT da coluna. */
const DEFAULT = '__default__'
const NULL = '__null__'

export function InsertRowDialog({ open, onOpenChange, connectionId, schema, table, columns }: InsertRowDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Colunas salvas como hash bcrypt; as com cara de senha começam ligadas
  const [hashed, setHashed] = useState<Record<string, boolean>>({})
  const isHashed = (column: ColumnInfo) => isTextType(column.type) && (column.isHashed || (hashed[column.name] ?? looksLikeSecretColumn(column.name)))
  const insertRow = useInsertRow(connectionId, schema, table)

  function close(next: boolean) {
    if (!next) {
      setValues({})
      setErrors({})
      setHashed({})
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const payload: Row = {}
    const nextErrors: Record<string, string> = {}

    for (const column of columns) {
      const raw = values[column.name] ?? ''
      if (raw === '' || raw === DEFAULT) {
        if (!column.nullable && column.defaultValue === null) nextErrors[column.name] = 'Obrigatório'
        continue
      }
      if (raw === NULL) {
        payload[column.name] = null
        continue
      }
      const invalid = validateEditValue(raw, column.type)
      if (invalid) nextErrors[column.name] = invalid
      payload[column.name] = raw
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    try {
      const hash = columns.filter((c) => isHashed(c) && typeof payload[c.name] === 'string').map((c) => c.name)
      await insertRow.mutateAsync({ values: payload, hash })
      toast.success('Linha inserida')
      close(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível inserir')
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] grid-rows-[auto_1fr_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inserir linha</DialogTitle>
          <DialogDescription>
            <span className="font-mono">
              {schema}.{table}
            </span>{' '}
            · campos vazios usam o valor padrão da coluna.
          </DialogDescription>
        </DialogHeader>

        <form id="insert-row-form" onSubmit={handleSubmit} className="-mx-6 grid gap-4 overflow-y-auto px-6 py-1">
          {columns.map((column) => {
            const id = `col-${column.name}`
            const required = !column.nullable && column.defaultValue === null
            const set = (v: string) => {
              setValues((prev) => ({ ...prev, [column.name]: v }))
              setErrors((prev) => ({ ...prev, [column.name]: '' }))
            }
            const placeholder = column.defaultValue ? `padrão: ${column.defaultValue}` : column.nullable ? 'NULL' : ''

            return (
              <div key={column.name} className="grid gap-1.5 sm:grid-cols-[12rem_1fr] sm:items-start sm:gap-4">
                <div className="flex flex-col gap-1 pt-2">
                  <Label htmlFor={id} className="gap-1.5 font-mono text-xs">
                    {column.isPrimaryKey && <KeyRound className="size-3 text-warning" />}
                    {column.name}
                    {required && <span className="text-destructive">*</span>}
                  </Label>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {column.type}
                    </Badge>
                    {/* Colunas de texto comuns: atalho discreto para ligar o hash (ex.: senha com outro nome) */}
                    {isTextType(column.type) && !column.isHashed && !looksLikeSecretColumn(column.name) && hashed[column.name] === undefined && (
                      <button
                        type="button"
                        title="Salvar este campo como hash bcrypt"
                        aria-label={`Salvar ${column.name} como hash`}
                        className="rounded-sm px-1 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={() => setHashed((prev) => ({ ...prev, [column.name]: true }))}
                      >
                        #hash
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-1">
                  {column.enum && !column.type.endsWith('[]') ? (
                    <Select value={values[column.name] || DEFAULT} onValueChange={set}>
                      <SelectTrigger id={id} className="w-full font-mono text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT}>{column.defaultValue ? `Padrão (${column.defaultValue})` : column.nullable ? 'Padrão (NULL)' : 'Escolha um valor'}</SelectItem>
                        {column.enum.values.map((v) => (
                          <SelectItem key={v} value={v} className="font-mono text-xs">
                            {v}
                          </SelectItem>
                        ))}
                        {column.nullable && <SelectItem value={NULL}>NULL</SelectItem>}
                      </SelectContent>
                    </Select>
                  ) : isBooleanType(column.type) ? (
                    <Select value={values[column.name] || DEFAULT} onValueChange={set}>
                      <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT}>{column.defaultValue ? `Padrão (${column.defaultValue})` : 'Padrão'}</SelectItem>
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                        {column.nullable && <SelectItem value={NULL}>NULL</SelectItem>}
                      </SelectContent>
                    </Select>
                  ) : isJsonType(column.type) ? (
                    <Textarea
                      id={id}
                      rows={3}
                      placeholder={placeholder || '{ }'}
                      className="font-mono text-xs"
                      value={values[column.name] ?? ''}
                      aria-invalid={Boolean(errors[column.name])}
                      onChange={(e) => set(e.target.value)}
                    />
                  ) : dateKindOf(column.type) ? (
                    <DateTimeInput
                      id={id}
                      kind={dateKindOf(column.type)!}
                      placeholder={placeholder || undefined}
                      value={values[column.name] ?? ''}
                      invalid={Boolean(errors[column.name])}
                      onChange={set}
                    />
                  ) : isHashed(column) ? (
                    <PasswordInput
                      id={id}
                      placeholder={placeholder || '********'}
                      autoComplete="new-password"
                      className="font-mono text-xs"
                      value={values[column.name] ?? ''}
                      aria-invalid={Boolean(errors[column.name])}
                      onChange={(e) => set(e.target.value)}
                    />
                  ) : (
                    <Input
                      id={id}
                      placeholder={placeholder}
                      className="font-mono text-xs"
                      value={values[column.name] ?? ''}
                      aria-invalid={Boolean(errors[column.name])}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}
                  {errors[column.name] && <p className="text-xs text-destructive">{errors[column.name]}</p>}
                  {column.isHashed ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <LockKeyhole className="size-3 text-primary" /> Coluna de senha: o banco salva como hash bcrypt
                    </p>
                  ) : isTextType(column.type) && (looksLikeSecretColumn(column.name) || hashed[column.name] !== undefined) && (
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <Switch size="sm" checked={isHashed(column)} onCheckedChange={(v) => setHashed((prev) => ({ ...prev, [column.name]: v }))} />
                      Salvar como hash (bcrypt)
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="insert-row-form" loading={insertRow.isPending}>
            Inserir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

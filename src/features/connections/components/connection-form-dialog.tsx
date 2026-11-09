import { CircleCheck, CircleX, Plug } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Environment } from '@/types/database'
import { useCreateConnection, useTestConnection } from '../hooks/use-connections'
import { environmentOptions } from '../lib/environment'
import { parseConnectionUrl } from '../lib/parse-connection-url'

type ConnectionFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const initialState = { name: '', url: '', environment: 'production' as Environment, readOnly: false }

export function ConnectionFormDialog({ open, onOpenChange }: ConnectionFormDialogProps) {
  const [form, setForm] = useState(initialState)
  const createConnection = useCreateConnection()
  const testConnection = useTestConnection()

  const parsed = useMemo(() => parseConnectionUrl(form.url), [form.url])
  const urlError = form.url.length > 10 && !parsed ? 'Formato esperado: postgresql://usuario:senha@host:porta/banco' : undefined
  const canSubmit = form.name.trim().length > 0 && parsed !== null

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'url') testConnection.reset()
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(initialState)
      testConnection.reset()
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    try {
      await createConnection.mutateAsync({ ...form, name: form.name.trim(), url: form.url.trim() })
      toast.success(`Conexão "${form.name}" adicionada`)
      handleOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a conexão')
    }
  }

  const testResult = testConnection.data

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova conexão</DialogTitle>
          <DialogDescription>
            Cole a connection string do Postgres. Ela é criptografada no servidor e nunca volta para o navegador.
          </DialogDescription>
        </DialogHeader>

        <form id="connection-form" onSubmit={handleSubmit} className="grid gap-4">
          <Field label="Nome" htmlFor="cn-name">
            <Input
              id="cn-name"
              placeholder="Ex.: Leadflow produção"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              autoFocus
            />
          </Field>

          <Field
            label="Connection string"
            htmlFor="cn-url"
            error={urlError}
            hint={
              parsed ? (
                <span className="font-mono">
                  {parsed.user}@{parsed.host}:{parsed.port}/{parsed.database}
                  {parsed.ssl && ' · SSL'}
                </span>
              ) : (
                'No Railway: serviço Postgres → Variables → DATABASE_PUBLIC_URL'
              )
            }
          >
            <PasswordInput
              id="cn-url"
              autoComplete="off"
              spellCheck={false}
              placeholder="postgresql://postgres:••••@host:5432/railway"
              className="font-mono text-xs"
              value={form.url}
              aria-invalid={Boolean(urlError)}
              onChange={(e) => update('url', e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ambiente" htmlFor="cn-env">
              <Select value={form.environment} onValueChange={(v) => update('environment', v as Environment)}>
                <SelectTrigger id="cn-env" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {environmentOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:mt-6">
              <Label htmlFor="cn-readonly" className="flex-col items-start gap-1">
                Somente leitura
                <span className="text-xs font-normal text-muted-foreground">Bloqueia INSERT, UPDATE e DELETE</span>
              </Label>
              <Switch id="cn-readonly" checked={form.readOnly} onCheckedChange={(v) => update('readOnly', v)} />
            </div>
          </div>

          {testResult && (
            <div
              role="status"
              className={
                testResult.ok
                  ? 'flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary'
                  : 'flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
              }
            >
              {testResult.ok ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
              {testResult.ok ? `Conectado · ${testResult.version} · ${testResult.latencyMs} ms` : testResult.message}
            </div>
          )}
        </form>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={!parsed}
            loading={testConnection.isPending}
            onClick={() => testConnection.mutate(form.url.trim())}
          >
            {!testConnection.isPending && <Plug />}
            Testar conexão
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="connection-form" disabled={!canSubmit} loading={createConnection.isPending}>
              Salvar conexão
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

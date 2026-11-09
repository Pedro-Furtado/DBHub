import { useQuery } from '@tanstack/react-query'
import { Code2, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { ApiError } from '@/lib/api-client'
import type { Policy, PolicyCommand, PolicyInput } from '@/types/database'
import { policiesApi } from '../api/policies-api'
import { useRoles, useSavePolicy } from '../hooks/use-policies'
import { clausesFor, commandOptions, policyTemplates } from '../lib/policy-templates'
import { RolesPicker } from './roles-picker'

type PolicyFormSheetProps = {
  connectionId: string
  target: { schema: string; table: string; policy?: Policy } | null
  onClose: () => void
}

const empty: PolicyInput = { name: '', command: 'SELECT', permissive: true, roles: ['public'], using: '', withCheck: '' }

function fromPolicy(p: Policy): PolicyInput {
  return { name: p.name, command: p.command, permissive: p.permissive, roles: p.roles, using: p.using ?? '', withCheck: p.withCheck ?? '' }
}

/** Remove a cláusula que o comando não aceita e campos vazios. */
function clean(form: PolicyInput): PolicyInput {
  const clauses = clausesFor(form.command)
  return {
    ...form,
    name: form.name.trim(),
    using: clauses.using ? form.using?.trim() || undefined : undefined,
    withCheck: clauses.withCheck ? form.withCheck?.trim() || undefined : undefined,
  }
}

export function PolicyFormSheet({ connectionId, target, onClose }: PolicyFormSheetProps) {
  const editing = target?.policy
  const [form, setForm] = useState<PolicyInput>(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [templateId, setTemplateId] = useState<string>()
  const roles = useRoles(connectionId)
  const save = useSavePolicy(connectionId)

  // Reinicia o formulário quando abre para outra tabela/política (padrão "ajustar estado no render" do React)
  const [openedFor, setOpenedFor] = useState(target)
  if (target !== openedFor) {
    setOpenedFor(target)
    if (target) {
      setForm(target.policy ? fromPolicy(target.policy) : empty)
      setErrors({})
      setTemplateId(undefined)
    }
  }

  const payload = clean(form)
  const debounced = useDebouncedValue(payload, 400)
  const preview = useQuery({
    queryKey: ['policy-preview', connectionId, target?.schema, target?.table, debounced],
    queryFn: () => policiesApi.preview(connectionId, target!.schema, target!.table, debounced),
    enabled: Boolean(target && debounced.name),
    retry: false,
    placeholderData: (prev) => prev,
  })

  const clauses = clausesFor(form.command)
  const set = (patch: Partial<PolicyInput>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setErrors({})
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!target) return
    try {
      await save.mutateAsync({ schema: target.schema, table: target.table, oldName: editing?.name, policy: payload })
      toast.success(editing ? 'Política atualizada' : 'Política criada')
      onClose()
    } catch (error) {
      if (error instanceof ApiError && Array.isArray(error.details)) {
        setErrors(Object.fromEntries((error.details as { path: string; message: string }[]).map((d) => [d.path, d.message])))
      }
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a política')
    }
  }

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar política' : 'Nova política'}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {target?.schema}.{target?.table}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <form id="policy-form" onSubmit={handleSubmit} className="grid gap-5">
            {!editing && (
              <Field label="Começar de um modelo" htmlFor="policy-template">
                <Select
                  value={templateId}
                  onValueChange={(id) => {
                    setTemplateId(id)
                    const t = policyTemplates.find((x) => x.id === id)
                    if (t) set({ ...t.policy, using: t.policy.using ?? '', withCheck: t.policy.withCheck ?? '' })
                  }}
                >
                  <SelectTrigger id="policy-template" className="w-full">
                    <Sparkles className="text-primary" />
                    {/* No gatilho mostra só o título; a descrição aparece na lista */}
                    <SelectValue placeholder="Escolha um modelo (opcional)">
                      {policyTemplates.find((t) => t.id === templateId)?.title}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {policyTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex flex-col items-start">
                          <span>{t.title}</span>
                          <span className="text-xs text-muted-foreground">{t.description}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field label="Nome" htmlFor="policy-name" error={errors.name}>
              <Input id="policy-name" placeholder="Ex.: Usuários leem os próprios pedidos" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <Field label="Comando" htmlFor="policy-command" hint="Para qual operação a política vale">
                <SegmentedControl
                  aria-label="Comando"
                  value={form.command}
                  onChange={(command: PolicyCommand) => set({ command })}
                  options={[...commandOptions]}
                  className="w-full"
                />
              </Field>
              <Field label="Tipo" htmlFor="policy-type" hint={form.permissive ? 'Libera acesso (combina com OU)' : 'Restringe (combina com E)'}>
                <Select value={form.permissive ? 'permissive' : 'restrictive'} onValueChange={(v) => set({ permissive: v === 'permissive' })}>
                  <SelectTrigger id="policy-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permissive">Permissiva</SelectItem>
                    <SelectItem value="restrictive">Restritiva</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Roles" htmlFor="policy-roles" error={errors.roles} hint="A quais usuários do banco a política se aplica">
              <RolesPicker id="policy-roles" roles={roles.data ?? ['public']} value={form.roles} onChange={(r) => set({ roles: r })} />
            </Field>

            {clauses.using && (
              <Field
                label="USING"
                htmlFor="policy-using"
                error={errors.using}
                hint="Quais linhas existentes ficam visíveis/alteráveis. Ex.: user_id::text = current_setting('app.user_id', true)"
              >
                <Textarea
                  id="policy-using"
                  rows={3}
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder="true"
                  value={form.using ?? ''}
                  onChange={(e) => set({ using: e.target.value })}
                />
              </Field>
            )}

            {clauses.withCheck && (
              <Field label="WITH CHECK" htmlFor="policy-check" error={errors.withCheck} hint="Quais valores novos podem ser gravados (INSERT/UPDATE)">
                <Textarea
                  id="policy-check"
                  rows={3}
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder={form.command === 'INSERT' ? 'true' : 'vazio = mesma regra do USING'}
                  value={form.withCheck ?? ''}
                  onChange={(e) => set({ withCheck: e.target.value })}
                />
              </Field>
            )}

            <section className="grid gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Code2 className="size-4" /> SQL gerado
              </p>
              <div className="rounded-lg border bg-sidebar">
                {!form.name.trim() ? (
                  <p className="p-4 text-xs text-muted-foreground">Dê um nome à política para ver o SQL.</p>
                ) : preview.isError ? (
                  <p className="p-4 text-xs text-destructive">{preview.error.message}</p>
                ) : (
                  <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
                    {editing && preview.data && `-- substitui a política "${editing.name}"\n`}
                    {preview.data?.sql ?? '…'}
                  </pre>
                )}
              </div>
            </section>
          </form>
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="policy-form" loading={save.isPending}>
            {editing ? 'Salvar alterações' : 'Criar política'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

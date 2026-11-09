import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/lib/api-client'
import { useCreateRole } from '../hooks/use-roles'
import { generatePassword } from '../lib/password'
import { PasswordField } from './password-field'

type CreateRoleDialogProps = {
  connectionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (role: string, password: string) => void
}

export function CreateRoleDialog({ connectionId, open, onOpenChange, onCreated }: CreateRoleDialogProps) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState(generatePassword)
  const [canLogin, setCanLogin] = useState(true)
  const [limit, setLimit] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const create = useCreateRole(connectionId)

  function close(next: boolean) {
    if (!next) {
      setName('')
      setPassword(generatePassword())
      setCanLogin(true)
      setLimit('')
      setErrors({})
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await create.mutateAsync({
        name: name.trim(),
        password: canLogin ? password : undefined,
        canLogin,
        connectionLimit: limit ? Number(limit) : -1,
      })
      toast.success(`Role ${name} criado`)
      onCreated(name.trim(), canLogin ? password : '')
      close(false)
    } catch (error) {
      if (error instanceof ApiError && Array.isArray(error.details)) {
        setErrors(Object.fromEntries((error.details as { path: string; message: string }[]).map((d) => [d.path, d.message])))
      }
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o role')
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo usuário do banco</DialogTitle>
          <DialogDescription>Um role do Postgres para seus apps conectarem com permissões limitadas (e respeitando o RLS).</DialogDescription>
        </DialogHeader>
        <form id="create-role-form" onSubmit={handleSubmit} className="grid gap-4">
          <Field label="Nome" htmlFor="role-name" error={errors.name} hint="Minúsculas, números e _ — ex.: app_leadflow">
            <Input id="role-name" autoFocus className="font-mono" placeholder="app_user" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <Label htmlFor="role-login" className="flex-col items-start gap-0.5">
              Pode fazer login
              <span className="text-xs font-normal text-muted-foreground">Desligado = role de grupo (só agrupa permissões)</span>
            </Label>
            <Switch id="role-login" checked={canLogin} onCheckedChange={setCanLogin} />
          </div>
          {canLogin && (
            <Field label="Senha" htmlFor="role-password" error={errors.password} hint="Copie agora: depois de criada, a senha não pode ser vista de novo">
              <PasswordField id="role-password" value={password} onChange={setPassword} />
            </Field>
          )}
          <Field label="Limite de conexões" htmlFor="role-limit" hint="Vazio = sem limite">
            <Input id="role-limit" type="number" min={1} className="w-32" placeholder="∞" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="create-role-form" disabled={!name.trim()} loading={create.isPending}>
            Criar usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { useUpdateRole } from '../hooks/use-roles'
import { generatePassword } from '../lib/password'
import { PasswordField } from './password-field'

export function ChangePasswordDialog({ connectionId, role, onClose }: { connectionId: string; role: string | null; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword)
  const update = useUpdateRole(connectionId)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!role) return
    try {
      await update.mutateAsync({ role, input: { password } })
      toast.success(`Senha de ${role} alterada`)
      onClose()
      setPassword(generatePassword())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar a senha')
    }
  }

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar senha</DialogTitle>
          <DialogDescription>
            De <span className="font-mono">{role}</span>. Os apps que usam a senha antiga param de conectar.
          </DialogDescription>
        </DialogHeader>
        <form id="password-form" onSubmit={handleSubmit}>
          <Field label="Nova senha" htmlFor="new-password" hint="Mínimo de 8 caracteres">
            <PasswordField id="new-password" value={password} onChange={setPassword} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="password-form" disabled={password.length < 8} loading={update.isPending}>
            Alterar senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

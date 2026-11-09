import { type FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { useLogin } from '../hooks/use-auth'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useLogin()
  const [key, setKey] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    login.mutate(key, { onSuccess: () => navigate(from === '/login' ? '/' : from, { replace: true }) })
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-primary)/8%,transparent_60%)] p-6">
      <div className="w-full max-w-sm space-y-6">
        <Logo className="mx-auto flex w-fit text-lg" />
        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Use a chave de acesso do seu DBHub.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <Field
                label="Chave de acesso"
                htmlFor="access-key"
                error={login.error?.message}
                hint="No Railway, está em Variables → DBHUB_ACCESS_KEY. Rodando local sem a variável, a chave aparece no log do primeiro boot."
              >
                <PasswordInput
                  id="access-key"
                  name="password"
                  placeholder="********"
                  autoComplete="current-password"
                  autoFocus
                  required
                  value={key}
                  aria-invalid={login.isError}
                  onChange={(e) => setKey(e.target.value)}
                />
              </Field>
              <Button type="submit" loading={login.isPending} className="mt-2 w-full">
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

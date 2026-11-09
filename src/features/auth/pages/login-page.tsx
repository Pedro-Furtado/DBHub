import { type FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { useLogin } from '../hooks/use-auth'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => navigate(from === '/login' ? '/' : from, { replace: true }) })
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-primary)/8%,transparent_60%)] p-6">
      <div className="w-full max-w-sm space-y-6">
        <Logo className="mx-auto flex w-fit text-lg" />
        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Acesse o painel dos seus bancos.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <Field label="E-mail" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Senha" htmlFor="password" error={login.error?.message}>
                <PasswordInput
                  id="password"
                  placeholder="********"
                  autoComplete="current-password"
                  required
                  value={password}
                  aria-invalid={login.isError}
                  onChange={(e) => setPassword(e.target.value)}
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

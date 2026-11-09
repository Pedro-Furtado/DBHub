import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-sm text-primary">404</p>
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">O endereço que você tentou abrir não existe.</p>
      <Button asChild variant="outline">
        <Link to="/">Voltar para conexões</Link>
      </Button>
    </main>
  )
}

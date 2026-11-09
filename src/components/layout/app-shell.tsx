import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { Spinner } from '@/components/ui/spinner'
import { RequireAuth } from '@/features/auth/components/require-auth'
import { NavRail } from './nav-rail'
import { TopBar } from './top-bar'

/** Layout das áreas autenticadas: rail à esquerda, barra no topo, conteúdo rolável. */
export function AppShell() {
  return (
    <RequireAuth fallback={<PageLoader />}>
      <div className="flex h-full">
        <NavRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-auto">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </RequireAuth>
  )
}

export function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Spinner className="size-5" />
    </div>
  )
}

import { CopyPlus, Database, LayoutDashboard, Lightbulb, LogOut, Network, Settings, ShieldCheck, SquareTerminal, Table2, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useMatch, useNavigate, useParams } from 'react-router'
import { useLogout } from '@/features/auth/hooks/use-auth'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LogoMark } from '@/components/shared/logo'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

function RailLink({ to, label, icon: Icon, end = false }: NavItem) {
  // useMatch em vez de NavLink: o Slot do Tooltip não repassa className em função
  const isActive = useMatch({ path: to, end }) !== null
  return (
    <Tooltip content={label} side="right">
      <Link
        to={to}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          isActive && 'bg-accent text-primary',
        )}
      >
        <Icon className="size-[18px]" />
      </Link>
    </Tooltip>
  )
}

/** Barra lateral de ícones — os itens do banco só aparecem dentro de /c/:connectionId. */
export function NavRail() {
  const { connectionId } = useParams()
  const base = `/c/${connectionId}`

  const connectionItems: NavItem[] = connectionId
    ? [
        { to: base, label: 'Visão geral', icon: LayoutDashboard, end: true },
        { to: `${base}/tables`, label: 'Table Editor', icon: Table2 },
        { to: `${base}/sql`, label: 'SQL Editor', icon: SquareTerminal },
        { to: `${base}/schema`, label: 'Schema Visualizer', icon: Network },
        { to: `${base}/policies`, label: 'Políticas (RLS)', icon: ShieldCheck },
        { to: `${base}/roles`, label: 'Usuários do banco', icon: Users },
        { to: `${base}/advisors`, label: 'Advisors', icon: Lightbulb },
      ]
    : []

  return (
    <nav aria-label="Principal" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3">
      <Link to="/" aria-label="DBHub — início" className="mb-3">
        <LogoMark />
      </Link>
      <RailLink to="/" label="Conexões" icon={Database} end />
      <RailLink to="/sync" label="Clonar banco" icon={CopyPlus} />
      {connectionItems.length > 0 && <div className="my-2 h-px w-6 bg-sidebar-border" />}
      {connectionItems.map((item) => (
        <RailLink key={item.to} {...item} />
      ))}
      <div className="mt-auto flex flex-col items-center gap-1">
        <RailLink to="/settings" label="Configurações" icon={Settings} />
        <LogoutButton />
      </div>
    </nav>
  )
}

/** Sair pede confirmação: um clique sem querer não derruba a sessão. */
function LogoutButton() {
  const [confirming, setConfirming] = useState(false)
  const logout = useLogout()
  const navigate = useNavigate()

  return (
    <>
      <Tooltip content="Sair" side="right">
        <button
          type="button"
          aria-label="Sair"
          onClick={() => setConfirming(true)}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="size-[18px]" />
        </button>
      </Tooltip>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !logout.isPending && setConfirming(open)}
        title="Sair do DBHub?"
        description="Sua sessão será encerrada neste navegador. Consultas não salvas no SQL Editor serão perdidas."
        confirmLabel="Sair"
        destructive
        loading={logout.isPending}
        onConfirm={() =>
          logout.mutate(undefined, {
            onSettled: () => {
              setConfirming(false)
              navigate('/login', { replace: true })
            },
          })
        }
      />
    </>
  )
}

import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConnectionStatusDot } from '@/features/connections/components/connection-status'
import { useConnections } from '@/features/connections/hooks/use-connections'

/** Troca de banco mantendo a seção atual (tables, sql…). */
export function ConnectionSwitcher() {
  const { connectionId } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: connections = [] } = useConnections()
  const current = connections.find((c) => c.id === connectionId)

  function switchTo(id: string) {
    const section = pathname.split('/')[3] // /c/:id/<section>
    navigate(section && ['sql', 'tables', 'policies', 'roles', 'schema', 'advisors'].includes(section) ? `/c/${id}/${section}` : `/c/${id}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2 font-medium">
          {current && <ConnectionStatusDot status={current.status} />}
          {current?.name ?? 'Selecionar banco'}
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Conexões</DropdownMenuLabel>
        {connections.map((connection) => (
          <DropdownMenuItem key={connection.id} onSelect={() => switchTo(connection.id)}>
            <ConnectionStatusDot status={connection.status} />
            <span className="truncate">{connection.name}</span>
            {connection.id === connectionId && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/?new=1')}>
          <Plus /> Nova conexão
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

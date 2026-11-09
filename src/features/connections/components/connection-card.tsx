import { Ellipsis, Lock, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatBytes, formatNumber } from '@/lib/utils'
import type { Connection } from '@/types/database'
import { ConnectionStatusLabel } from './connection-status'
import { EnvironmentBadge } from './environment-badge'

type ConnectionCardProps = {
  connection: Connection
  onDelete: (connection: Connection) => void
}

export function ConnectionCard({ connection, onDelete }: ConnectionCardProps) {
  const base = `/c/${connection.id}`

  return (
    <Card className="group relative cursor-pointer gap-4 transition-colors hover:border-primary/40 has-[[data-card-link]:focus-visible]:border-primary has-[[data-card-link]:focus-visible]:ring-[3px] has-[[data-card-link]:focus-visible]:ring-ring/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {/* Link "esticado": o ::after cobre o card inteiro, então clicar em qualquer lugar abre a conexão. */}
          <Link
            to={base}
            data-card-link
            className="truncate outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] group-hover:text-primary"
          >
            {connection.name}
          </Link>
          {connection.readOnly && (
            <Badge variant="outline">
              <Lock /> Leitura
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="truncate font-mono text-xs">
          {connection.user}@{connection.host}:{connection.port}/{connection.database}
        </CardDescription>
        <CardAction className="relative z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Ações da conexão">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(connection)}>
                <Trash2 /> Remover conexão
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Tabelas" value={connection.tableCount != null ? formatNumber(connection.tableCount) : '—'} />
        <Stat label="Tamanho" value={connection.sizeBytes != null ? formatBytes(connection.sizeBytes) : '—'} />
        <Stat label="Versão" value={connection.version?.replace('PostgreSQL ', 'PG ') ?? '—'} />
      </CardContent>

      <CardFooter className="justify-between">
        <ConnectionStatusLabel status={connection.status} />
        <EnvironmentBadge environment={connection.environment} />
      </CardFooter>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  )
}

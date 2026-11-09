import { ArrowRight, Database, HardDrive, Lock, SquareTerminal, Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectionStatusLabel } from '@/features/connections/components/connection-status'
import { EnvironmentBadge } from '@/features/connections/components/environment-badge'
import { useConnection } from '@/features/connections/hooks/use-connections'
import { useConnectionId } from '@/hooks/use-connection-id'
import { formatBytes, formatNumber } from '@/lib/utils'

export function OverviewPage() {
  const connectionId = useConnectionId()
  const { data: connection, isLoading } = useConnection(connectionId)

  if (isLoading || !connection) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-8">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {connection.name}
            <EnvironmentBadge environment={connection.environment} />
            {connection.readOnly && (
              <Badge variant="outline">
                <Lock /> Somente leitura
              </Badge>
            )}
          </span>
        }
        description={
          <span className="font-mono text-xs">
            {connection.user}@{connection.host}:{connection.port}/{connection.database}
          </span>
        }
        actions={<ConnectionStatusLabel status={connection.status} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Table2 />} label="Tabelas" value={connection.tableCount != null ? formatNumber(connection.tableCount) : '—'} />
        <StatCard icon={<HardDrive />} label="Tamanho do banco" value={connection.sizeBytes != null ? formatBytes(connection.sizeBytes) : '—'} />
        <StatCard icon={<Database />} label="Versão" value={connection.version ?? '—'} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <QuickLink
          to={`/c/${connectionId}/tables`}
          icon={<Table2 />}
          title="Table Editor"
          description="Navegue pelas tabelas, filtre, edite e insira linhas."
        />
        <QuickLink
          to={`/c/${connectionId}/sql`}
          icon={<SquareTerminal />}
          title="SQL Editor"
          description="Escreva e execute queries, salve as que você mais usa."
        />
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="gap-3">
      <CardHeader className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </CardHeader>
      <CardContent className="text-2xl font-semibold tabular-nums tracking-tight">{value}</CardContent>
    </Card>
  )
}

function QuickLink({ to, icon, title, description }: { to: string; icon: ReactNode; title: string; description: string }) {
  return (
    <Card className="group transition-colors hover:border-primary/40">
      <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-x-4">
        <div className="row-span-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">{icon}</div>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="col-start-2">{description}</CardDescription>
        <Button asChild variant="ghost" size="icon-sm" className="col-start-3 row-span-2 row-start-1">
          <Link to={to} aria-label={`Abrir ${title}`}>
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardHeader>
    </Card>
  )
}

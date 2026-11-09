import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Gauge, Info, RefreshCw, ShieldAlert, SquareTerminal, TriangleAlert, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CopyButton } from '@/components/shared/copy-button'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { useConnectionId } from '@/hooks/use-connection-id'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

type Finding = {
  id: string
  category: 'security' | 'performance' | 'integrity'
  level: 'error' | 'warn' | 'info'
  title: string
  description: string
  objects: string[]
  fix?: string
}
type AdvisorsReport = { findings: Finding[]; skipped: string[]; checkedAt: string; total: number }
type Filter = 'all' | Finding['category']

const levelStyle = {
  error: { icon: CircleAlert, label: 'Crítico', className: 'text-destructive', badge: 'destructive' as const },
  warn: { icon: TriangleAlert, label: 'Atenção', className: 'text-warning', badge: 'warning' as const },
  info: { icon: Info, label: 'Info', className: 'text-sky-400', badge: 'secondary' as const },
}
const categoryLabel = { security: 'Segurança', performance: 'Performance', integrity: 'Integridade' }
const categoryIcon = { security: ShieldAlert, performance: Gauge, integrity: Wrench }

/** Advisors: checagens automáticas de segurança, integridade e performance, com SQL de correção para revisar. */
export function AdvisorsPage() {
  const connectionId = useConnectionId()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const report = useQuery({
    queryKey: ['advisors', connectionId],
    queryFn: () => api.get<AdvisorsReport>(`/c/${connectionId}/advisors`),
    staleTime: 5 * 60_000,
  })

  const findings = report.data?.findings ?? []
  const visible = filter === 'all' ? findings : findings.filter((f) => f.category === filter)
  const count = (level: Finding['level']) => findings.filter((f) => f.level === level).length

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Advisors"
        description="Checagens automáticas no seu banco. Nada é alterado: cada item traz o SQL sugerido para você revisar e rodar no SQL Editor."
        actions={
          <Button variant="outline" onClick={() => report.refetch()} loading={report.isFetching}>
            {!report.isFetching && <RefreshCw />} Verificar de novo
          </Button>
        }
      />

      {report.data && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(['error', 'warn', 'info'] as const).map((level) => {
            const style = levelStyle[level]
            const Icon = style.icon
            return (
              <Card key={level} className="flex-row items-center gap-3 px-4 py-4">
                <Icon className={cn('size-5', style.className)} />
                <div>
                  <p className="text-2xl font-semibold tabular-nums leading-none">{count(level)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{style.label}</p>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {findings.length > 0 && (
        <SegmentedControl
          aria-label="Categoria"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Todos (${findings.length})` },
            { value: 'security', label: 'Segurança' },
            { value: 'performance', label: 'Performance' },
            { value: 'integrity', label: 'Integridade' },
          ]}
          className="[&_button]:font-sans"
        />
      )}

      {report.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : report.isError ? (
        <EmptyState icon={<CircleAlert />} title="Não foi possível rodar as checagens" description={report.error.message} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<CircleCheck className="text-primary" />}
          title={filter === 'all' ? 'Tudo certo por aqui' : `Nada encontrado em ${categoryLabel[filter]}`}
          description={`${report.data?.total ?? 0} checagens rodadas sem nenhum alerta.`}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((finding) => {
            const style = levelStyle[finding.level]
            const Icon = style.icon
            const CategoryIcon = categoryIcon[finding.category]
            return (
              <Card key={finding.id} className="gap-3 px-5 py-4">
                <div className="flex items-start gap-3">
                  <Icon className={cn('mt-0.5 size-5 shrink-0', style.className)} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{finding.title}</h3>
                      <Badge variant={style.badge}>{style.label}</Badge>
                      <Badge variant="outline">
                        <CategoryIcon /> {categoryLabel[finding.category]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{finding.description}</p>
                  </div>
                </div>

                <div className="ml-8 flex flex-wrap gap-1.5">
                  {finding.objects.slice(0, 12).map((o) => (
                    <span key={o} className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px]">
                      {o}
                    </span>
                  ))}
                  {finding.objects.length > 12 && <span className="text-xs text-muted-foreground">+{finding.objects.length - 12}</span>}
                </div>

                {finding.fix && (
                  <div className="ml-8 overflow-hidden rounded-lg border bg-sidebar">
                    <div className="flex items-center justify-between border-b px-3 py-1.5">
                      <span className="text-xs text-muted-foreground">Correção sugerida — revise antes de rodar</span>
                      <div className="flex items-center gap-1">
                        <CopyButton value={finding.fix} label="Copiar SQL" />
                        <Button variant="ghost" size="xs" onClick={() => navigate(`/c/${connectionId}/sql`, { state: { sql: finding.fix } })}>
                          <SquareTerminal /> Abrir no SQL Editor
                        </Button>
                      </div>
                    </div>
                    <pre className="max-h-48 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed">{finding.fix}</pre>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {report.data && (
        <p className="text-xs text-muted-foreground">
          {report.data.total} checagens · verificado às {new Date(report.data.checkedAt).toLocaleTimeString('pt-BR')}
          {report.data.skipped.length > 0 && ` · ${report.data.skipped.length} não puderam rodar (permissão ou versão do Postgres)`}
        </p>
      )}
    </div>
  )
}

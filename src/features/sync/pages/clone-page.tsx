import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Info, KeyRound, Lock, OctagonX, RotateCcw, Square, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { SqlPreview } from '@/components/shared/sql-preview'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { EnvironmentBadge } from '@/features/connections/components/environment-badge'
import { useConnections } from '@/features/connections/hooks/use-connections'
import { cn, formatBytes, formatNumber } from '@/lib/utils'
import type { Connection, Environment } from '@/types/database'
import { type ClonePlan, type CloneEvent, type CloneWarning, syncApi } from '../api/sync-api'
import { CloneTimeline, type TimelineItem, type TimelineStep } from '../components/clone-timeline'

type Phase = 'select' | 'review' | 'running' | 'finished'
type Outcome = { ok: true; durationMs: number; tables: number; rows: number } | { ok: false; message: string; step?: string; cancelled?: boolean }

const COUNT_LABELS: [keyof ClonePlan['counts'], string][] = [
  ['tables', 'tabelas'],
  ['views', 'views'],
  ['enums', 'enums'],
  ['functions', 'funções'],
  ['indexes', 'índices'],
  ['foreignKeys', 'relacionamentos'],
  ['triggers', 'triggers'],
  ['policies', 'policies'],
  ['sequences', 'sequences'],
  ['extensions', 'extensões'],
  ['schemas', 'schemas'],
]

function ConnectionSelect({
  label,
  value,
  onChange,
  connections,
  disabledIds,
  hint,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  connections: Connection[]
  disabledIds?: Set<string>
  hint?: string
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Escolha uma conexão" />
        </SelectTrigger>
        <SelectContent>
          {connections.map((c) => (
            <SelectItem key={c.id} value={c.id} disabled={disabledIds?.has(c.id)}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{c.name}</span>
                <EnvironmentBadge environment={c.environment} />
                {c.readOnly && <Lock className="size-3 text-muted-foreground" aria-label="Somente leitura" />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function WarningList({ warnings }: { warnings: CloneWarning[] }) {
  if (!warnings.length) return null
  const order = { danger: 0, warn: 1, info: 2 }
  return (
    <ul className="space-y-2">
      {[...warnings]
        .sort((a, b) => order[a.level] - order[b.level])
        .map((w, i) => {
          const Icon = w.level === 'danger' ? OctagonX : w.level === 'warn' ? AlertTriangle : Info
          return (
            <li
              key={i}
              className={cn(
                'flex gap-2.5 rounded-md border px-3 py-2 text-sm',
                w.level === 'danger' && 'border-destructive/30 bg-destructive/5 text-destructive',
                w.level === 'warn' && 'border-warning/30 bg-warning/5',
                w.level === 'info' && 'bg-muted/40 text-muted-foreground',
              )}
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', w.level === 'warn' && 'text-warning')} />
              <span>{w.message}</span>
            </li>
          )
        })}
    </ul>
  )
}

/** Clonar um banco para outro (vazio): revisão antes, passo a passo ao vivo durante. */
export function ClonePage() {
  const { data: connections = [], isLoading } = useConnections()
  const queryClient = useQueryClient()

  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [phase, setPhase] = useState<Phase>('select')
  const [plan, setPlan] = useState<ClonePlan | null>(null)
  const [dataTables, setDataTables] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState('')
  const [showSql, setShowSql] = useState(false)
  const [items, setItems] = useState<TimelineItem[]>([])
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runCardRef = useRef<HTMLDivElement>(null)

  // Sair da tela no meio do clone cancela (o server desfaz tudo no destino)
  useEffect(() => () => abortRef.current?.abort(), [])

  // Ao começar, leva a tela até o passo a passo
  useEffect(() => {
    if (phase === 'running') runCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [phase])

  // Fechar/recarregar a aba no meio do clone: pede confirmação
  useEffect(() => {
    if (phase !== 'running') return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  const byId = useMemo(() => new Map(connections.map((c) => [c.id, c])), [connections])
  const readOnlyIds = useMemo(() => new Set(connections.filter((c) => c.readOnly).map((c) => c.id)), [connections])

  const analyze = useMutation({
    mutationFn: () => syncApi.planClone(sourceId, targetId),
    onSuccess: (result) => {
      setPlan(result)
      setDataTables(new Set())
      setConfirm('')
      setShowSql(false)
      setPhase('review')
    },
    onError: (error) => toast.error(error.message),
  })

  const resetToSelect = () => {
    setPhase('select')
    setPlan(null)
    setItems([])
    setOutcome(null)
  }

  const handleEvent = (event: CloneEvent) => {
    switch (event.type) {
      case 'step':
        setItems((prev) => {
          const index = prev.findIndex((i) => i.kind === 'step' && i.step.id === event.id)
          if (index === -1) {
            return [...prev, { kind: 'step', step: { id: event.id, label: event.label, status: event.status, detail: event.detail } }]
          }
          const next = [...prev]
          const old = (next[index] as { kind: 'step'; step: TimelineStep }).step
          next[index] = { kind: 'step', step: { ...old, label: event.label, status: event.status, detail: event.detail ?? old.detail } }
          return next
        })
        break
      case 'progress':
        setItems((prev) =>
          prev.map((i) =>
            i.kind === 'step' && i.step.id === event.id ? { kind: 'step', step: { ...i.step, progress: { done: event.done, total: event.total, detail: event.detail } } } : i,
          ),
        )
        break
      case 'warn':
        setItems((prev) => [...prev, { kind: 'warn', id: `w${prev.length}`, message: event.message }])
        break
      case 'done':
        setOutcome({ ok: true, durationMs: event.durationMs, tables: event.summary.tables, rows: event.summary.rows })
        break
      case 'error':
        markRunningAsFailed()
        setOutcome({ ok: false, message: event.message, step: event.step })
        break
    }
  }

  const markRunningAsFailed = () =>
    setItems((prev) => prev.map((i) => (i.kind === 'step' && i.step.status === 'running' ? { kind: 'step', step: { ...i.step, status: 'failed' } } : i)))

  const start = async () => {
    if (!plan) return
    const controller = new AbortController()
    abortRef.current = controller
    setItems([])
    setOutcome(null)
    setPhase('running')
    try {
      await syncApi.runClone(
        { sourceId: plan.source.id, targetId: plan.target.id, dataTables: [...dataTables], confirm: plan.requiresConfirm ? confirm : undefined },
        handleEvent,
        controller.signal,
      )
      // Stream terminou sem "done"/"error" (conexão caiu): trata como falha
      setOutcome((prev) => prev ?? { ok: false, message: 'A conexão com o servidor caiu antes do fim. O destino não foi alterado.' })
    } catch (error) {
      markRunningAsFailed()
      if (controller.signal.aborted) setOutcome({ ok: false, message: 'Clone cancelado. Tudo que tinha sido feito no destino foi desfeito.', cancelled: true })
      else setOutcome({ ok: false, message: error instanceof Error ? error.message : 'Erro inesperado' })
    } finally {
      abortRef.current = null
      setPhase('finished')
      void queryClient.invalidateQueries()
    }
  }

  const tables = plan?.tables ?? []
  const allChecked = tables.length > 0 && dataTables.size === tables.length
  const selectedRows = tables.filter((t) => dataTables.has(t.key)).reduce((sum, t) => sum + Math.max(0, t.rowEstimate), 0)
  const selectedBytes = tables.filter((t) => dataTables.has(t.key)).reduce((sum, t) => sum + t.sizeBytes, 0)
  const confirmOk = !plan?.requiresConfirm || confirm === plan.target.name
  const canRun = !!plan && plan.blocking.length === 0 && confirmOk

  const toggleTable = (key: string, checked: boolean) =>
    setDataTables((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })

  const source = byId.get(sourceId)
  const target = byId.get(targetId)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Clonar banco"
        description="Copia a estrutura (e, se quiser, os dados) de uma conexão para um banco vazio — ex.: produção → staging para testar com dados reais."
      />

      {/* 1. Origem e destino */}
      <Card>
        <CardHeader>
          <CardTitle>Origem e destino</CardTitle>
          <CardDescription>A origem só é lida. O destino precisa estar vazio — tudo roda numa transação: se algo falhar, nada fica pela metade.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Spinner className="size-5" />
          ) : connections.length < 2 ? (
            <p className="text-sm text-muted-foreground">Você precisa de pelo menos duas conexões. Adicione o banco vazio em Conexões primeiro.</p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <ConnectionSelect
                label="Copiar de"
                value={sourceId}
                connections={connections}
                disabledIds={new Set([targetId])}
                onChange={(id) => {
                  setSourceId(id)
                  if (phase !== 'running') resetToSelect()
                }}
              />
              <ArrowRight className="mx-auto hidden size-5 shrink-0 text-muted-foreground sm:mt-8 sm:block" />
              <ConnectionSelect
                label="Para (banco vazio)"
                value={targetId}
                connections={connections}
                disabledIds={new Set([sourceId, ...readOnlyIds])}
                hint="Conexões somente leitura não aparecem como destino."
                onChange={(id) => {
                  setTargetId(id)
                  if (phase !== 'running') resetToSelect()
                }}
              />
            </div>
          )}
          {phase === 'select' && connections.length >= 2 && (
            <div className="mt-4 flex justify-end">
              <Button disabled={!sourceId || !targetId} loading={analyze.isPending} onClick={() => analyze.mutate()}>
                Analisar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Revisão */}
      {plan && phase === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Revisão
              <span className="text-sm font-normal text-muted-foreground">
                {plan.source.name} <ArrowRight className="inline size-3.5" /> {plan.target.name}
              </span>
              {target && <EnvironmentBadge environment={target.environment as Environment} />}
            </CardTitle>
            <CardDescription>Nada foi alterado ainda. Confira o que vai ser criado no destino.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-1.5">
              {COUNT_LABELS.filter(([k]) => plan.counts[k] > 0).map(([k, label]) => (
                <Badge key={k} variant="secondary">
                  {formatNumber(plan.counts[k])} {label}
                </Badge>
              ))}
            </div>

            {plan.blocking.length > 0 && (
              <Alert variant="destructive">
                <XCircle />
                <AlertTitle>Não dá para clonar</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-4">
                    {plan.blocking.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <WarningList warnings={plan.warnings} />

            {plan.blocking.length === 0 && (
              <>
                {/* Tabelas: quais levam dados */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium">Dados</h3>
                      <p className="text-xs text-muted-foreground">
                        Todas as tabelas são criadas. Marque as que devem levar os dados junto — sem marcar, vão vazias.
                      </p>
                    </div>
                    {dataTables.size > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ~{formatNumber(selectedRows)} linhas · {formatBytes(selectedBytes)}
                      </span>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-md border">
                    <label className="flex cursor-pointer items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <Checkbox
                        checked={allChecked ? true : dataTables.size > 0 ? 'indeterminate' : false}
                        onCheckedChange={(v) => setDataTables(v === true ? new Set(tables.map((t) => t.key)) : new Set())}
                      />
                      <span className="flex-1">Tabela</span>
                      <span className="w-24 text-right">Linhas (aprox.)</span>
                      <span className="w-20 text-right">Tamanho</span>
                    </label>
                    <ul className="max-h-80 divide-y overflow-y-auto">
                      {tables.map((t) => (
                        <li key={t.key}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                            <Checkbox checked={dataTables.has(t.key)} onCheckedChange={(v) => toggleTable(t.key, v === true)} />
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="truncate font-mono text-xs">
                                {t.schema !== 'public' && <span className="text-muted-foreground">{t.schema}.</span>}
                                {t.name}
                              </span>
                              {t.hasPasswordHash && (
                                <Badge variant="outline" title="Senhas já estão em hash — são copiadas como estão">
                                  <KeyRound /> hash
                                </Badge>
                              )}
                            </span>
                            <span className="w-24 text-right font-mono text-xs text-muted-foreground tabular-nums">
                              {t.rowEstimate < 0 ? '—' : formatNumber(t.rowEstimate)}
                            </span>
                            <span className="w-20 text-right font-mono text-xs text-muted-foreground tabular-nums">{formatBytes(t.sizeBytes)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {plan.source.environment === 'production' && dataTables.size > 0 && (
                    <p className="flex items-start gap-1.5 text-xs text-warning">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      Você está levando dados de produção. Cuidado com dados pessoais (e-mails, telefones) num ambiente de teste.
                    </p>
                  )}
                </div>

                {/* SQL */}
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSql((v) => !v)}
                  >
                    <ChevronDown className={cn('size-4 transition-transform', !showSql && '-rotate-90')} />
                    Ver SQL da estrutura
                  </button>
                  {showSql && <SqlPreview sql={plan.sql} title="Estrutura que será criada" className="mt-2" />}
                </div>

                {plan.requiresConfirm && (
                  <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <Label htmlFor="clone-confirm" className="text-destructive">
                      O destino é de produção. Digite <span className="font-mono font-semibold">{plan.target.name}</span> para confirmar.
                    </Label>
                    <Input id="clone-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                  </div>
                )}
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={resetToSelect}>
                Voltar
              </Button>
              <Button variant="outline" loading={analyze.isPending} onClick={() => analyze.mutate()}>
                <RotateCcw /> Analisar de novo
              </Button>
              <Button disabled={!canRun} variant={plan.requiresConfirm ? 'destructive' : 'default'} onClick={start}>
                {dataTables.size > 0 ? `Clonar estrutura + dados (${dataTables.size})` : 'Clonar só a estrutura'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Execução ao vivo */}
      {(phase === 'running' || phase === 'finished') && (
        <Card ref={runCardRef} className="scroll-mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {phase === 'running' ? (
                <>
                  <Spinner className="size-4" /> Clonando…
                </>
              ) : outcome?.ok ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-500" /> Clone concluído
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-destructive" /> {outcome && !outcome.ok && outcome.cancelled ? 'Clone cancelado' : 'Clone falhou'}
                </>
              )}
            </CardTitle>
            <CardDescription>
              {source?.name ?? plan?.source.name} <ArrowRight className="inline size-3.5" /> {target?.name ?? plan?.target.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 && phase === 'running' && <p className="text-sm text-muted-foreground">Conectando nos dois bancos…</p>}
            <CloneTimeline items={items} />

            {phase === 'running' && (
              <p className="text-xs text-muted-foreground">
                Tudo acontece numa transação só: se cancelar ou der erro, o destino volta a ficar vazio.
              </p>
            )}

            {outcome?.ok && (
              <Alert variant="info">
                <CheckCircle2 />
                <AlertTitle>Pronto em {(outcome.durationMs / 1000).toFixed(1)}s</AlertTitle>
                <AlertDescription>
                  {formatNumber(outcome.tables)} {outcome.tables === 1 ? 'tabela criada' : 'tabelas criadas'}
                  {outcome.rows > 0 ? ` · ${formatNumber(outcome.rows)} linhas copiadas` : ' · só estrutura'}.
                </AlertDescription>
              </Alert>
            )}
            {outcome && !outcome.ok && (
              <Alert variant={outcome.cancelled ? 'warning' : 'destructive'}>
                <XCircle />
                <AlertTitle>{outcome.step ? `Erro em: ${outcome.step}` : outcome.cancelled ? 'Cancelado' : 'Erro'}</AlertTitle>
                <AlertDescription>
                  <p>{outcome.message}</p>
                  {!outcome.cancelled && <p className="mt-1">Nada foi alterado no destino — a transação foi desfeita.</p>}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {phase === 'running' ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Square /> Cancelar
                </Button>
              ) : (
                <>
                  {!outcome?.ok && plan && (
                    <Button variant="outline" onClick={() => setPhase('review')}>
                      Voltar para a revisão
                    </Button>
                  )}
                  <Button variant={outcome?.ok ? 'default' : 'outline'} onClick={resetToSelect}>
                    Novo clone
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

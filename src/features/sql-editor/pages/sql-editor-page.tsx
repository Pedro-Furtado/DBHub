import { Braces, ChevronDown, CircleAlert, CircleCheck, Clock, Copy, Download, FileSpreadsheet, Play, Save } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useLocation } from 'react-router'
import { DataGrid } from '@/components/data-grid/data-grid'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { toast } from 'sonner'
import { useRunQuery, useSaveQuery, useSavedQueries } from '@/features/database/hooks/use-database'
import { useConnectionId } from '@/hooks/use-connection-id'
import { formatNumber } from '@/lib/utils'
import type { QueryResult } from '@/types/database'
import { SaveQueryDialog } from '../components/save-query-dialog'
import { SavedQueries } from '../components/saved-queries'
import { SqlInput } from '../components/sql-input'
import { useSchemaGraph } from '@/features/schema/api/schema-api'
import { downloadText, toCsv } from '@/lib/csv'

// Monaco é pesado (~1 MB): só carrega ao abrir o SQL Editor; até lá mostra o editor simples
const MonacoSqlEditor = lazy(() => import('../components/monaco-sql-editor'))

const DESTRUCTIVE = /^\s*(drop|truncate|alter)\b|^\s*(delete|update)\b(?![\s\S]*\bwhere\b)/i

export function SqlEditorPage() {
  const connectionId = useConnectionId()
  const savedQueries = useSavedQueries(connectionId)
  const runQuery = useRunQuery(connectionId)
  // Outras telas (ex.: Advisors) podem abrir o editor com um SQL pronto
  const initialSql = (useLocation().state as { sql?: string } | null)?.sql
  const [sql, setSql] = useState(initialSql ?? 'select *\nfrom information_schema.tables\nwhere table_schema = \'public\'\nlimit 100;')
  const schemaGraph = useSchemaGraph(connectionId)
  const [lastSql, setLastSql] = useState<string>()
  const [resetKey, setResetKey] = useState(0)
  /** Troca o conteúdo do editor (queries salvas, nova query) */
  const replaceSql = (next: string) => {
    setSql(next)
    setResetKey((k) => k + 1)
  }
  const [activeId, setActiveId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const saveQuery = useSaveQuery(connectionId)
  const active = savedQueries.data?.find((q) => q.id === activeId)

  /** Query já salva: atualiza direto. Nova: pede um nome. */
  function handleSave() {
    if (!sql.trim()) return
    if (active) persist(active.title, active.id)
    else setSaveOpen(true)
  }

  function persist(title: string, id?: string) {
    saveQuery.mutate(
      { id, title, sql },
      {
        onSuccess: (saved) => {
          setActiveId(saved.id)
          setSaveOpen(false)
          toast.success(id ? 'Query atualizada' : 'Query salva')
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  const [pendingSql, setPendingSql] = useState<string>()

  function execute(text = pendingSql ?? sql) {
    setConfirmOpen(false)
    setPendingSql(undefined)
    setLastSql(text)
    runQuery.mutate(text)
  }

  /** text = trecho selecionado no editor (Ctrl+Enter com seleção roda só ele) */
  function run(text = sql) {
    if (!text.trim() || runQuery.isPending) return
    // DROP / TRUNCATE / ALTER ou DELETE/UPDATE sem WHERE pedem confirmação
    if (DESTRUCTIVE.test(text)) {
      setPendingSql(text)
      setConfirmOpen(true)
    } else execute(text)
  }

  return (
    <div className="flex h-full min-h-0">
      <SavedQueries
        queries={savedQueries.data ?? []}
        loading={savedQueries.isLoading}
        activeId={activeId}
        onSelect={(query) => {
          setActiveId(query.id)
          replaceSql(query.sql)
        }}
        onNew={() => {
          setActiveId(null)
          replaceSql('')
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <h2 className="text-sm font-medium">
            {active?.title ?? 'Nova query'}
            {active && active.sql !== sql && <span className="ml-2 text-xs font-normal text-muted-foreground">· alterada</span>}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleSave} loading={saveQuery.isPending && !saveOpen} disabled={!sql.trim()}>
              {!(saveQuery.isPending && !saveOpen) && <Save />} Salvar
            </Button>
            <Button size="sm" onClick={() => run()} loading={runQuery.isPending} title="Ctrl+Enter executa a seleção, se houver">
              {!runQuery.isPending && <Play />} Executar
              <Kbd className="ml-1 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">Ctrl ↵</Kbd>
            </Button>
          </div>
        </header>

        <Suspense fallback={<SqlInput value={sql} onChange={setSql} onRun={() => run()} className="h-[40%] shrink-0 border-b" />}>
          <MonacoSqlEditor value={sql} resetKey={resetKey} onChange={setSql} onRun={run} schema={schemaGraph.data ?? []} className="h-[40%] shrink-0 border-b" />
        </Suspense>

        <ResultPanel result={runQuery.data} error={runQuery.error} loading={runQuery.isPending} executedSql={lastSql} />
      </section>

      <SaveQueryDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        loading={saveQuery.isPending}
        onSave={(title) => persist(title)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Executar comando destrutivo?"
        description="Essa query pode apagar ou alterar muitos dados de uma vez (DROP, TRUNCATE, ALTER ou DELETE/UPDATE sem WHERE)."
        confirmLabel="Executar mesmo assim"
        destructive
        onConfirm={() => execute()}
      />
    </div>
  )
}

function ResultPanel({ result, error, loading, executedSql }: { result?: QueryResult; error: Error | null; loading: boolean; executedSql?: string }) {
  if (error && !loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-destructive/10 px-3 text-xs font-medium text-destructive">
          <CircleAlert className="size-3.5" /> Erro na query
        </div>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[13px] text-destructive">{error.message}</pre>
      </div>
    )
  }

  if (!result && !loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Execute uma query para ver o resultado aqui
      </div>
    )
  }

  const hasRows = (result?.columns.length ?? 0) > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b bg-card px-3 text-xs text-muted-foreground">
        {result && (
          <>
            <Badge variant="secondary">{result.command}</Badge>
            <span className="tabular-nums">
              {formatNumber(result.rowCount)} {hasRows ? 'linhas' : 'linhas afetadas'}
            </span>
            {result.truncated && <Badge variant="warning">mostrando as primeiras {formatNumber(result.rows.length)}</Badge>}
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="size-3" /> {result.durationMs} ms
            </span>
            {executedSql && executedSql.length < 2000 && executedSql !== '' && (
              <span className="hidden truncate font-mono text-[11px] text-muted-foreground/70 lg:inline" title={executedSql}>
                {executedSql.replace(/\s+/g, ' ').slice(0, 80)}
              </span>
            )}
            {hasRows && result && (
              <ExportResultMenu result={result} />
            )}
          </>
        )}
      </div>
      {hasRows || loading ? (
        <DataGrid columns={result?.columns ?? [{ name: '…' }]} rows={result?.rows ?? []} loading={loading} />
      ) : (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-primary" /> Comando executado com sucesso
        </div>
      )}
    </div>
  )
}

/** Exporta o resultado da query: CSV (vírgula ou ponto e vírgula, para o Excel em pt-BR) ou JSON. */
function ExportResultMenu({ result }: { result: QueryResult }) {
  const stamp = () => `resultado-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
  const columns = result.columns.map((c) => c.name)
  const json = () => JSON.stringify(result.rows, null, 2)

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json())
      toast.success(`${formatNumber(result.rows.length)} ${result.rows.length === 1 ? 'linha copiada' : 'linhas copiadas'} como JSON`)
    } catch {
      toast.error('Não foi possível copiar — o navegador bloqueou a área de transferência')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="ml-auto">
          <Download /> Exportar <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {result.truncated && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-warning">
              Exporta as {formatNumber(result.rows.length)} linhas exibidas. Para tudo, use LIMIT/OFFSET ou o CSV do Table Editor.
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => downloadText(`${stamp()}.csv`, toCsv(columns, result.rows))}>
          <FileSpreadsheet /> CSV (vírgula)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadText(`${stamp()}.csv`, toCsv(columns, result.rows, ';'))}>
          <FileSpreadsheet /> CSV para Excel (ponto e vírgula)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => downloadText(`${stamp()}.json`, json(), 'application/json;charset=utf-8')}>
          <Braces /> JSON
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyJson()}>
          <Copy /> Copiar como JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

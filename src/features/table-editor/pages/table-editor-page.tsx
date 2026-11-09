import { Pencil, Plus, RefreshCw, Search, ShieldCheck, ShieldOff, Table2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { DataGrid, type GridColumn } from '@/components/data-grid/data-grid'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Separator } from '@/components/ui/separator'
import { Tooltip } from '@/components/ui/tooltip'
import { useConnection } from '@/features/connections/hooks/use-connections'
import { databaseApi, type RowFilter } from '@/features/database/api/database-api'
import { useDeleteRows, useRows, useTables, useUpdateRow } from '@/features/database/hooks/use-database'
import { usePoliciesOverview } from '@/features/policies/hooks/use-policies'
import { useConnectionId } from '@/hooks/use-connection-id'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { Row } from '@/types/database'
import { CreateTableSheet } from '../components/create-table-sheet'
import { ExportMenu } from '../components/export-menu'
import { FilterPopover } from '../components/filter-popover'
import { ImportCsvDialog } from '../components/import-csv-dialog'
import { InsertRowDialog } from '../components/insert-row-dialog'
import { Pagination } from '../components/pagination'
import { EditTableLoader } from '../components/structure/edit-table-dialog'
import { StructureView } from '../components/structure/structure-view'
import { TableList } from '../components/table-list'

export function TableEditorPage() {
  const connectionId = useConnectionId()
  const { schema, table } = useParams()
  const tables = useTables(connectionId)
  const connection = useConnection(connectionId)
  const [createOpen, setCreateOpen] = useState(false)
  const canWrite = connection.data ? !connection.data.readOnly : false

  // Sem tabela na URL: abre a primeira automaticamente
  if (!table && tables.data?.length) {
    const first = tables.data[0]
    return <Navigate to={`/c/${connectionId}/tables/${first.schema}/${first.name}`} replace />
  }

  return (
    <div className="flex h-full min-h-0">
      <TableList
        connectionId={connectionId}
        tables={tables.data ?? []}
        loading={tables.isLoading}
        onCreateTable={canWrite ? () => setCreateOpen(true) : undefined}
      />
      <CreateTableSheet connectionId={connectionId} open={createOpen} onOpenChange={setCreateOpen} />
      {schema && table ? (
        // key: reseta paginação/busca/seleção ao trocar de tabela
        <TableView key={`${schema}.${table}`} connectionId={connectionId} schema={schema} table={table} canWrite={canWrite} />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          {!tables.isLoading && (
            <EmptyState
              icon={<Table2 />}
              title="Este banco não tem tabelas"
              description="Crie a primeira pelo painel ou com create table no SQL Editor."
              action={
                canWrite && (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus /> Nova tabela
                  </Button>
                )
              }
            />
          )}
        </div>
      )}
    </div>
  )
}

type Sort = { column: string; direction: 'asc' | 'desc' }

function TableView({ connectionId, schema, table, canWrite }: { connectionId: string; schema: string; table: string; canWrite: boolean }) {
  // Aba atual na URL (?view=structure) para dar para compartilhar o link
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'structure' ? 'structure' : 'data'
  const setView = (next: 'data' | 'structure') => setSearchParams(next === 'data' ? {} : { view: next }, { replace: true })

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [search, setSearch] = useState('')
  const [editingTable, setEditingTable] = useState(false)
  const [filters, setFilters] = useState<RowFilter[]>([])
  const [match, setMatch] = useState<'all' | 'any'>('all')
  const [sort, setSort] = useState<Sort>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const deleteRows = useDeleteRows(connectionId, schema, table)
  const updateRow = useUpdateRow(connectionId, schema, table)
  const debouncedSearch = useDebouncedValue(search)
  const rls = usePoliciesOverview(connectionId).data?.tables.find((t) => t.schema === schema && t.table === table)

  const query = { search: debouncedSearch || undefined, filters, match, sort }
  const { data, isLoading, isFetching, refetch } = useRows(connectionId, { schema, table, page, pageSize, ...query })

  const columns = (data?.columns ?? []).map((c) => ({
    name: c.name,
    type: c.type,
    isPrimaryKey: c.isPrimaryKey,
    isForeignKey: Boolean(c.foreignKey),
    nullable: c.nullable,
    // Array de enum continua como texto ({a,b}); enum simples vira select
    enumValues: c.enum && !c.type.endsWith('[]') ? c.enum.values : undefined,
    hashed: c.isHashed,
  }))
  const pkColumns = (data?.columns ?? []).filter((c) => c.isPrimaryKey).map((c) => c.name)
  const pk = pkColumns[0]
  const rows = data?.rows ?? []
  const filtered = Boolean(debouncedSearch || filters.length)

  /** Qualquer mudança de busca/filtro/ordem volta para a página 1 e limpa a seleção. */
  function resetPaging() {
    setPage(1)
    setSelected(new Set())
  }

  /** Salva uma célula: identifica a linha pela chave primária original. */
  async function handleCellEdit(row: Row, column: GridColumn, value: string | null, opts: { hash?: boolean } = {}) {
    const key = Object.fromEntries(pkColumns.map((c) => [c, row[c]]))
    await updateRow.mutateAsync({ key, changes: { [column.name]: value }, hash: opts.hash && value !== null ? [column.name] : undefined })
    toast.success(opts.hash ? `${column.name} salvo como hash` : `${column.name} atualizado`)
  }

  async function handleDelete() {
    // Monta a chave completa (inclusive PK composta) de cada linha selecionada
    const keys = rows.filter((r) => selected.has(String(r[pk!]))).map((r) => Object.fromEntries(pkColumns.map((c) => [c, r[c]])))
    try {
      const { deleted } = await deleteRows.mutateAsync(keys)
      toast.success(`${deleted} ${deleted === 1 ? 'linha excluída' : 'linhas excluídas'}`)
      setSelected(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir')
    } finally {
      setConfirmDelete(false)
    }
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => String(r[pk!])))))
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">{schema}.</span>
          {table}
        </h2>
        {/* rls só existe para tabelas (views não são renomeadas aqui) */}
        {canWrite && rls && (
          <Tooltip content="Editar tabela (nome, schema, descrição)">
            <Button variant="ghost" size="icon-xs" className="-ml-1 size-6 text-muted-foreground" aria-label="Editar tabela" onClick={() => setEditingTable(true)}>
              <Pencil />
            </Button>
          </Tooltip>
        )}
        {editingTable && <EditTableLoader connectionId={connectionId} schema={schema} table={table} onClose={() => setEditingTable(false)} />}
        {rls && (
          <Badge asChild variant={rls.rlsEnabled ? 'default' : 'outline'}>
            <Link to={`/c/${connectionId}/policies`} title="Ver políticas desta tabela">
              {rls.rlsEnabled ? <ShieldCheck /> : <ShieldOff />}
              {rls.rlsEnabled ? `RLS · ${rls.policies.length} ${rls.policies.length === 1 ? 'política' : 'políticas'}` : 'RLS desativado'}
            </Link>
          </Badge>
        )}
        <SegmentedControl
          aria-label="Visualização"
          value={view}
          onChange={setView}
          options={[
            { value: 'data', label: 'Dados' },
            { value: 'structure', label: 'Estrutura' },
          ]}
          className="ml-2 [&_button]:font-sans"
        />

        {view === 'data' && (
          <>
            <Separator orientation="vertical" className="mx-1 h-5!" />
            <Input
              icon={<Search />}
              placeholder="Buscar em todas as colunas…"
              className="h-8 text-xs"
              containerClassName="w-60"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetPaging()
              }}
            />
            <FilterPopover
              columns={data?.columns ?? []}
              filters={filters}
              match={match}
              onApply={(next, nextMatch) => {
                setFilters(next)
                setMatch(nextMatch)
                resetPaging()
              }}
            />
            {sort && (
              <Badge variant="secondary" className="gap-1.5">
                ordem: <span className="font-mono">{sort.column}</span> {sort.direction === 'asc' ? '↑' : '↓'}
                <button type="button" aria-label="Remover ordenação" onClick={() => setSort(undefined)} className="hover:text-foreground">
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            {data && !pk && <Badge variant="warning">Sem chave primária · edição desativada</Badge>}

            <div className="ml-auto flex items-center gap-1.5">
              {selected.size > 0 && (
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Excluir {selected.size}
                </Button>
              )}
              <ExportMenu
                filtered={filtered}
                exportUrl={(delimiter) => databaseApi.exportUrl(connectionId, schema, table, query, delimiter)}
                onImport={canWrite ? () => setImportOpen(true) : undefined}
              />
              <Tooltip content="Recarregar">
                <Button variant="ghost" size="icon-sm" aria-label="Recarregar" onClick={() => refetch()}>
                  <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
                </Button>
              </Tooltip>
              {canWrite && (
                <Button size="sm" disabled={!data} onClick={() => setInsertOpen(true)}>
                  <Plus /> Inserir linha
                </Button>
              )}
            </div>
          </>
        )}
      </header>

      {view === 'structure' ? (
        <StructureView connectionId={connectionId} schema={schema} table={table} canWrite={canWrite} />
      ) : (
        <>
          <DataGrid
            columns={columns}
            rows={rows}
            loading={isLoading}
            rowKey={pk}
            selectedKeys={selected}
            onToggleRow={pk && canWrite ? toggleRow : undefined}
            onToggleAll={toggleAll}
            // Sem PK não dá para saber qual linha alterar com segurança; a própria PK também não é editável
            onCellEdit={pk && canWrite ? handleCellEdit : undefined}
            isColumnEditable={(column) => !column.isPrimaryKey}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              resetPaging()
            }}
            empty={filtered ? 'Nenhuma linha com esses filtros' : 'Tabela vazia'}
          />

          <Pagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </>
      )}

      <InsertRowDialog
        open={insertOpen}
        onOpenChange={setInsertOpen}
        connectionId={connectionId}
        schema={schema}
        table={table}
        columns={data?.columns ?? []}
      />

      <ImportCsvDialog
        connectionId={connectionId}
        schema={schema}
        table={table}
        columns={data?.columns ?? []}
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir ${selected.size} ${selected.size === 1 ? 'linha' : 'linhas'}?`}
        description={`As linhas selecionadas de ${schema}.${table} serão apagadas do banco. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        loading={deleteRows.isPending}
        onConfirm={handleDelete}
      />
    </section>
  )
}

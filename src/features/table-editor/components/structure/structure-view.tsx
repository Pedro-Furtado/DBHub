import { Ellipsis, KeyRound, Link2, LockKeyhole, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { DangerDialog } from '@/components/shared/danger-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { databaseApi } from '@/features/database/api/database-api'
import { useInvalidateStructure, useStructure } from '@/features/database/hooks/use-database'
import type { ColumnInfo } from '@/types/database'
import { AddColumnDialog } from './add-column-dialog'
import { EditColumnDialog } from './edit-column-dialog'
import { EditTableDialog } from './edit-table-dialog'

type StructureViewProps = {
  connectionId: string
  schema: string
  table: string
  canWrite: boolean
}

type Drop = { kind: 'column'; column: ColumnInfo } | { kind: 'table' }

/** Aba "Estrutura": colunas da tabela com edição, adicionar, renomear e excluir. */
export function StructureView({ connectionId, schema, table, canWrite }: StructureViewProps) {
  const navigate = useNavigate()
  const structure = useStructure(connectionId, schema, table)
  const invalidate = useInvalidateStructure(connectionId)
  const [editing, setEditing] = useState<ColumnInfo | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingTable, setEditingTable] = useState(false)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [dropSql, setDropSql] = useState<string>()
  const [dropping, setDropping] = useState(false)

  const columns = structure.data?.columns ?? []

  async function previewDrop(target: Drop, cascade: boolean) {
    try {
      const result =
        target.kind === 'table'
          ? await databaseApi.dropTable(connectionId, schema, table, { dryRun: true, cascade })
          : await databaseApi.dropColumn(connectionId, schema, table, target.column.name, { dryRun: true, cascade })
      setDropSql(result.sql)
    } catch {
      setDropSql(undefined)
    }
  }

  function openDrop(target: Drop) {
    setDrop(target)
    void previewDrop(target, false)
  }

  async function confirmDrop({ cascade }: { cascade: boolean }) {
    if (!drop) return
    setDropping(true)
    try {
      if (drop.kind === 'table') {
        await databaseApi.dropTable(connectionId, schema, table, { cascade })
        toast.success(`Tabela ${schema}.${table} excluída`)
        await navigate(`/c/${connectionId}/tables`, { replace: true })
        // A tabela não existe mais: não recarrega as consultas dela (evita 404)
        await invalidate({ schema, table })
      } else {
        await databaseApi.dropColumn(connectionId, schema, table, drop.column.name, { cascade })
        toast.success(`Coluna ${drop.column.name} excluída`)
        await invalidate()
      }
      setDrop(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir')
    } finally {
      setDropping(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-medium">Colunas</h3>
            <p className="text-sm text-muted-foreground">{structure.data?.comment ?? 'Sem descrição.'}</p>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus /> Adicionar coluna
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings2 /> Tabela
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditingTable(true)}>
                    <Pencil /> Renomear / descrição
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => openDrop({ kind: 'table' })}>
                    <Trash2 /> Excluir tabela
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor padrão</TableHead>
                <TableHead>Nulo</TableHead>
                <TableHead>Restrições</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {structure.isLoading
                ? Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : columns.map((column) => (
                    <TableRow key={column.name} onDoubleClick={canWrite ? () => setEditing(column) : undefined} className={canWrite ? 'cursor-pointer' : undefined}>
                      <TableCell className="font-mono text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          {column.isPrimaryKey && <KeyRound className="size-3 text-warning" />}
                          {column.name}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          {column.type}
                          {column.enum && (
                            <Tooltip content={column.enum.values.join(' · ') || 'sem valores'}>
                              <Badge variant="outline" className="font-sans text-[10px]">
                                enum · {column.enum.values.length}
                              </Badge>
                            </Tooltip>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs text-muted-foreground">{column.defaultValue ?? '—'}</TableCell>
                      <TableCell className="text-xs">{column.nullable ? 'sim' : <span className="text-muted-foreground">não</span>}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {column.isPrimaryKey && <Badge variant="warning">chave primária</Badge>}
                          {column.isIdentity && <Badge variant="secondary">auto incremento</Badge>}
                          {column.isUnique && <Badge variant="secondary">único</Badge>}
                          {column.isHashed && (
                            <Tooltip content="Senha: o banco salva sempre como hash bcrypt">
                              <Badge>
                                <LockKeyhole /> hash
                              </Badge>
                            </Tooltip>
                          )}
                          {column.foreignKey && (
                            <Badge asChild>
                              <Link to={`/c/${connectionId}/tables/${column.foreignKey.table.replace('.', '/')}`}>
                                <Link2 /> {column.foreignKey.table}.{column.foreignKey.column}
                              </Link>
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canWrite && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-xs" aria-label={`Ações da coluna ${column.name}`}>
                                <Ellipsis />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(column)}>
                                <Pencil /> Editar coluna
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" disabled={columns.length === 1} onSelect={() => openDrop({ kind: 'column', column })}>
                                <Trash2 /> Excluir coluna
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        {canWrite && <p className="text-xs text-muted-foreground">Dica: duplo clique numa coluna para editar.</p>}
      </div>

      <EditColumnDialog connectionId={connectionId} schema={schema} table={table} column={editing} onClose={() => setEditing(null)} />
      <AddColumnDialog
        connectionId={connectionId}
        schema={schema}
        table={table}
        open={adding}
        onOpenChange={setAdding}
        hasPrimaryKey={columns.some((c) => c.isPrimaryKey)}
      />
      <EditTableDialog
        connectionId={connectionId}
        schema={schema}
        table={table}
        comment={structure.data?.comment ?? null}
        open={editingTable}
        onOpenChange={setEditingTable}
      />
      <DangerDialog
        open={drop !== null}
        onOpenChange={(open) => !open && setDrop(null)}
        title={drop?.kind === 'table' ? `Excluir a tabela ${table}?` : `Excluir a coluna ${drop?.kind === 'column' ? drop.column.name : ''}?`}
        description={
          drop?.kind === 'table'
            ? 'A tabela e todos os dados dela serão apagados permanentemente.'
            : 'A coluna e todos os valores dela serão apagados permanentemente.'
        }
        confirmLabel={drop?.kind === 'table' ? 'Excluir tabela' : 'Excluir coluna'}
        confirmText={drop?.kind === 'table' ? table : undefined}
        allowCascade
        sql={dropSql}
        loading={dropping}
        onCascadeChange={(cascade) => drop && void previewDrop(drop, cascade)}
        onConfirm={confirmDrop}
      />
    </div>
  )
}

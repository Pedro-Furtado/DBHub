import { DatabaseZap, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Connection } from '@/types/database'
import { ConnectionCard } from '../components/connection-card'
import { ConnectionFormDialog } from '../components/connection-form-dialog'
import { useConnections, useDeleteConnection } from '../hooks/use-connections'

export function ConnectionsPage() {
  const { data: connections = [], isLoading } = useConnections()
  const deleteConnection = useDeleteConnection()
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [formOpen, setFormOpenState] = useState(searchParams.get('new') === '1')

  function setFormOpen(open: boolean) {
    setFormOpenState(open)
    if (!open && searchParams.has('new')) setSearchParams({}, { replace: true })
  }
  const [toDelete, setToDelete] = useState<Connection | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return connections
    return connections.filter((c) => [c.name, c.host, c.database].some((v) => v.toLowerCase().includes(term)))
  }, [connections, search])

  async function confirmDelete() {
    if (!toDelete) return
    await deleteConnection.mutateAsync(toDelete.id)
    toast.success(`Conexão "${toDelete.name}" removida`)
    setToDelete(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Conexões"
        description="Seus bancos Postgres em um só lugar. Adicione a URL e comece a gerenciar."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus /> Nova conexão
          </Button>
        }
      />

      {connections.length > 0 && (
        <Input
          icon={<Search />}
          placeholder="Buscar por nome, host ou banco…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          containerClassName="max-w-sm"
        />
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={<DatabaseZap />}
          title="Nenhuma conexão ainda"
          description="Cole a connection string de um banco Postgres (Railway, Neon, VPS…) para começar."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus /> Adicionar primeira conexão
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search />} title="Nada encontrado" description={`Nenhuma conexão corresponde a "${search}".`} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} onDelete={setToDelete} />
          ))}
        </div>
      )}

      <ConnectionFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Remover conexão?"
        description={
          <>
            A conexão <strong className="text-foreground">{toDelete?.name}</strong> sai do DBHub. O banco em si não é alterado.
          </>
        }
        confirmLabel="Remover"
        destructive
        loading={deleteConnection.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

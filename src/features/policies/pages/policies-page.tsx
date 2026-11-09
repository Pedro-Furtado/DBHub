import { Info, Lock, Search, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useConnection } from '@/features/connections/hooks/use-connections'
import { useConnectionId } from '@/hooks/use-connection-id'
import type { Policy, TableRls } from '@/types/database'
import { PolicyFormSheet } from '../components/policy-form-sheet'
import { TablePoliciesCard } from '../components/table-policies-card'
import { useDeletePolicy, usePoliciesOverview, useSetRls } from '../hooks/use-policies'

type Confirm =
  | { kind: 'rls'; table: TableRls; enabled: boolean }
  | { kind: 'delete'; table: TableRls; policy: Policy }

export function PoliciesPage() {
  const connectionId = useConnectionId()
  const connection = useConnection(connectionId)
  const overview = usePoliciesOverview(connectionId)
  const setRls = useSetRls(connectionId)
  const deletePolicy = useDeletePolicy(connectionId)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ schema: string; table: string; policy?: Policy } | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const canWrite = connection.data ? !connection.data.readOnly : false
  const session = overview.data?.session
  const tables = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (overview.data?.tables ?? []).filter((t) => !term || `${t.schema}.${t.table}`.toLowerCase().includes(term))
  }, [overview.data, search])
  const enabledCount = overview.data?.tables.filter((t) => t.rlsEnabled).length ?? 0

  async function runConfirm() {
    if (!confirm) return
    const { table } = confirm
    try {
      if (confirm.kind === 'rls') {
        await setRls.mutateAsync({ schema: table.schema, table: table.table, enabled: confirm.enabled })
        toast.success(`RLS ${confirm.enabled ? 'ativado' : 'desativado'} em ${table.table}`)
      } else {
        await deletePolicy.mutateAsync({ schema: table.schema, table: table.table, name: confirm.policy.name })
        toast.success(`Política "${confirm.policy.name}" excluída`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir')
    } finally {
      setConfirm(null)
    }
  }

  async function toggleForce(table: TableRls, forced: boolean) {
    try {
      await setRls.mutateAsync({ schema: table.schema, table: table.table, forced })
      toast.success(forced ? 'RLS forçado também para o dono' : 'RLS não é mais forçado para o dono')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar')
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Políticas (RLS)"
        description="Row Level Security: regras do próprio Postgres que decidem quais linhas cada role pode ler e gravar."
        actions={overview.data && <Badge variant="secondary">{enabledCount} de {overview.data.tables.length} tabelas com RLS</Badge>}
      />

      {session && (session.superuser || session.bypass) && (
        <Alert variant="info">
          <Info />
          <AlertTitle>
            O DBHub conecta como <span className="font-mono">{session.user}</span>, que ignora o RLS
          </AlertTitle>
          <AlertDescription>
            <p>
              Superusuários e roles com BYPASSRLS sempre veem tudo, então o Table Editor continua mostrando todas as linhas. As políticas valem
              para os <strong className="text-foreground">outros roles</strong> — os usuários que seus apps usam para conectar. Diferente do
              Supabase, aqui não existe <span className="font-mono">auth.uid()</span>: o app informa o usuário com{' '}
              <span className="font-mono">set local app.user_id = '…'</span> e a política lê com{' '}
              <span className="font-mono">current_setting('app.user_id', true)</span>.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {!canWrite && connection.data && (
        <Alert variant="warning">
          <Lock />
          <AlertTitle>Conexão somente leitura</AlertTitle>
          <AlertDescription>Você pode ver as políticas, mas não alterar.</AlertDescription>
        </Alert>
      )}

      {(overview.data?.tables.length ?? 0) > 0 && (
        <Input icon={<Search />} placeholder="Filtrar tabelas…" className="max-w-sm" containerClassName="max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}

      {overview.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : overview.isError ? (
        <EmptyState title="Não foi possível carregar as políticas" description={overview.error.message} />
      ) : tables.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title={search ? 'Nenhuma tabela encontrada' : 'Este banco não tem tabelas'} />
      ) : (
        <div className="space-y-4">
          {tables.map((table) => (
            <TablePoliciesCard
              key={`${table.schema}.${table.table}`}
              connectionId={connectionId}
              table={table}
              canWrite={canWrite}
              onToggleRls={(enabled) => setConfirm({ kind: 'rls', table, enabled })}
              onToggleForce={(forced) => void toggleForce(table, forced)}
              onNewPolicy={() => setForm({ schema: table.schema, table: table.table })}
              onEditPolicy={(policy) => setForm({ schema: table.schema, table: table.table, policy })}
              onDeletePolicy={(policy) => setConfirm({ kind: 'delete', table, policy })}
            />
          ))}
        </div>
      )}

      <PolicyFormSheet connectionId={connectionId} target={form} onClose={() => setForm(null)} />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === 'delete'
            ? `Excluir a política "${confirm.policy.name}"?`
            : confirm?.enabled
              ? `Ativar RLS em ${confirm?.table.table}?`
              : `Desativar RLS em ${confirm?.table.table}?`
        }
        description={
          confirm?.kind === 'delete'
            ? 'Os roles que dependiam dela podem perder (ou ganhar) acesso às linhas imediatamente.'
            : confirm?.enabled
              ? confirm.table.policies.length === 0
                ? 'A tabela ainda não tem políticas: assim que ativar, nenhum role (exceto dono e superusuário) consegue ler ou gravar nela até você criar uma.'
                : `As ${confirm.table.policies.length} políticas desta tabela passam a valer imediatamente.`
              : 'As políticas deixam de ser aplicadas: qualquer role com permissão na tabela passa a ver todas as linhas.'
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Excluir' : confirm?.enabled ? 'Ativar RLS' : 'Desativar RLS'}
        destructive={confirm?.kind === 'delete' || confirm?.enabled === false}
        loading={setRls.isPending || deletePolicy.isPending}
        onConfirm={runConfirm}
      />
    </div>
  )
}

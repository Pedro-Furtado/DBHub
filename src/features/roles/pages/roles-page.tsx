import { Crown, KeyRound, Lock, Plus, ShieldOff, Trash2, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CopyButton } from '@/components/shared/copy-button'
import { DangerDialog } from '@/components/shared/danger-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useConnection } from '@/features/connections/hooks/use-connections'
import { useConnectionId } from '@/hooks/use-connection-id'
import { cn } from '@/lib/utils'
import { rolesApi, type DbRole } from '../api/roles-api'
import { ChangePasswordDialog } from '../components/change-password-dialog'
import { CreateRoleDialog } from '../components/create-role-dialog'
import { GrantsMatrix } from '../components/grants-matrix'
import { useDbRoles, useDropRole, useUpdateRole } from '../hooks/use-roles'

export function RolesPage() {
  const connectionId = useConnectionId()
  const connection = useConnection(connectionId)
  const roles = useDbRoles(connectionId)
  const [selectedName, setSelectedName] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [justCreated, setJustCreated] = useState<{ role: string; password: string } | null>(null)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [dropping, setDropping] = useState<DbRole | null>(null)
  const [dropSql, setDropSql] = useState<string>()
  const update = useUpdateRole(connectionId)
  const drop = useDropRole(connectionId)

  const canWrite = connection.data ? !connection.data.readOnly : false
  const list = roles.data ?? []
  const selected = list.find((r) => r.name === selectedName) ?? list.find((r) => !r.isCurrent && !r.superuser) ?? list[0]
  const c = connection.data
  const connString = (role: string, password = 'SENHA') => (c ? `postgresql://${role}:${encodeURIComponent(password)}@${c.host}:${c.port}/${c.database}` : '')

  async function previewDrop(role: DbRole, reassign: boolean) {
    try {
      setDropSql((await rolesApi.remove(connectionId, role.name, { reassign, dryRun: true })).sql)
    } catch {
      setDropSql(undefined)
    }
  }

  async function confirmDrop({ cascade }: { cascade: boolean }) {
    if (!dropping) return
    try {
      await drop.mutateAsync({ role: dropping.name, reassign: cascade })
      toast.success(`Role ${dropping.name} excluído`)
      setDropping(null)
      setSelectedName(undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir')
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Usuários do banco"
        description="Roles do Postgres e o que cada um pode fazer em cada tabela. É com eles que seus apps devem conectar — não com o usuário administrador."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Novo usuário
            </Button>
          )
        }
      />

      {justCreated && (
        <Alert variant="info">
          <KeyRound />
          <AlertTitle>Usuário {justCreated.role} criado — guarde a connection string agora</AlertTitle>
          <AlertDescription>
            <div className="mt-2 flex items-center gap-2 rounded-md border bg-background px-3 py-2 font-mono text-xs text-foreground">
              <span className="truncate">{connString(justCreated.role, justCreated.password || 'SENHA')}</span>
              <CopyButton value={connString(justCreated.role, justCreated.password || 'SENHA')} label="Copiar connection string" />
            </div>
            <p className="mt-2">A senha não fica salva no DBHub e não pode ser vista de novo (só trocada). Agora dê permissões nas tabelas abaixo.</p>
            <Button variant="ghost" size="xs" className="mt-1" onClick={() => setJustCreated(null)}>
              Fechar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {roles.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : list.length === 0 ? (
        <EmptyState icon={<Users />} title="Nenhum role encontrado" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Roles" className="grid content-start gap-1">
            {list.map((role) => (
              <button
                key={role.name}
                type="button"
                onClick={() => setSelectedName(role.name)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-accent',
                  selected?.name === role.name && 'border-border bg-card',
                )}
              >
                {role.superuser ? <Crown className="size-4 shrink-0 text-warning" /> : <UserRound className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm">{role.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {role.superuser ? 'superusuário' : role.canLogin ? 'pode conectar' : 'grupo (sem login)'}
                    {role.isCurrent && ' · usado pelo DBHub'}
                  </span>
                </span>
              </button>
            ))}
          </nav>

          {selected && (
            <div className="grid content-start gap-6">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center gap-3">
                  <CardTitle className="font-mono text-base">{selected.name}</CardTitle>
                  {selected.superuser && (
                    <Badge variant="warning">
                      <Crown /> superusuário
                    </Badge>
                  )}
                  {selected.bypassRls && !selected.superuser && (
                    <Badge variant="warning">
                      <ShieldOff /> ignora RLS
                    </Badge>
                  )}
                  {selected.isCurrent && <Badge variant="secondary">usado pelo DBHub</Badge>}
                  {selected.memberOf.length > 0 && <Badge variant="outline">membro de {selected.memberOf.join(', ')}</Badge>}
                  {canWrite && !selected.isCurrent && (
                    <div className="ml-auto flex items-center gap-2">
                      {selected.canLogin && (
                        <Button variant="outline" size="sm" onClick={() => setPasswordFor(selected.name)}>
                          <Lock /> Alterar senha
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          setDropping(selected)
                          void previewDrop(selected, false)
                        }}
                      >
                        <Trash2 /> Excluir
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="grid gap-4">
                  {selected.canLogin && c && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground">Connection string para seus apps</Label>
                      <div className="flex items-center gap-2 rounded-md border bg-sidebar px-3 py-2 font-mono text-xs">
                        <span className="truncate">{connString(selected.name)}</span>
                        <CopyButton value={connString(selected.name)} />
                      </div>
                    </div>
                  )}
                  {canWrite && !selected.isCurrent && !selected.superuser && (
                    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <Label htmlFor="role-can-login" className="flex-col items-start gap-0.5">
                        Pode fazer login
                        <span className="text-xs font-normal text-muted-foreground">Desligar bloqueia novas conexões com este usuário</span>
                      </Label>
                      <Switch
                        id="role-can-login"
                        size="sm"
                        checked={selected.canLogin}
                        disabled={update.isPending}
                        onCheckedChange={(v) =>
                          update.mutate(
                            { role: selected.name, input: { canLogin: v } },
                            { onSuccess: () => toast.success(v ? 'Login liberado' : 'Login bloqueado'), onError: (e) => toast.error(e.message) },
                          )
                        }
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <section className="grid gap-3">
                <h3 className="font-medium">Permissões por tabela</h3>
                <GrantsMatrix key={selected.name} connectionId={connectionId} role={selected.name} canWrite={canWrite} superuser={selected.superuser} />
              </section>
            </div>
          )}
        </div>
      )}

      <CreateRoleDialog
        connectionId={connectionId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(role, password) => {
          setSelectedName(role)
          setJustCreated({ role, password })
        }}
      />
      <ChangePasswordDialog connectionId={connectionId} role={passwordFor} onClose={() => setPasswordFor(null)} />
      <DangerDialog
        open={dropping !== null}
        onOpenChange={(open) => !open && setDropping(null)}
        title={`Excluir o usuário ${dropping?.name}?`}
        description="Apps que conectam com ele vão parar de funcionar."
        confirmLabel="Excluir usuário"
        confirmText={dropping?.name}
        allowCascade
        cascadeLabel="Transferir objetos e remover permissões"
        cascadeHint="Tabelas que pertencem a ele passam para o usuário do DBHub e os GRANTs dele são removidos (REASSIGN OWNED + DROP OWNED)."
        sql={dropSql}
        loading={drop.isPending}
        onCascadeChange={(reassign) => dropping && void previewDrop(dropping, reassign)}
        onConfirm={confirmDrop}
      />
    </div>
  )
}

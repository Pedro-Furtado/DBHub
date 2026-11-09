import { Ellipsis, Pencil, Plus, ShieldAlert, ShieldCheck, ShieldOff, Table2, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Policy, TableRls } from '@/types/database'

type TablePoliciesCardProps = {
  connectionId: string
  table: TableRls
  canWrite: boolean
  onToggleRls: (enabled: boolean) => void
  onToggleForce: (forced: boolean) => void
  onNewPolicy: () => void
  onEditPolicy: (policy: Policy) => void
  onDeletePolicy: (policy: Policy) => void
}

const commandColor: Record<Policy['command'], string> = {
  ALL: 'bg-primary/15 text-primary',
  SELECT: 'bg-sky-500/15 text-sky-400',
  INSERT: 'bg-emerald-500/15 text-emerald-400',
  UPDATE: 'bg-amber-500/15 text-amber-400',
  DELETE: 'bg-red-500/15 text-red-400',
}

export function TablePoliciesCard({
  connectionId,
  table,
  canWrite,
  onToggleRls,
  onToggleForce,
  onNewPolicy,
  onEditPolicy,
  onDeletePolicy,
}: TablePoliciesCardProps) {
  const id = `${table.schema}.${table.table}`
  // RLS ligado e nenhuma política = ninguém (fora dono/superuser) acessa nada
  const lockedOut = table.rlsEnabled && table.policies.length === 0

  return (
    <Card id={id} className="gap-0 overflow-hidden py-0">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Table2 className="size-4 text-muted-foreground" />
        <Link to={`/c/${connectionId}/tables/${table.schema}/${table.table}`} className="font-medium hover:text-primary">
          <span className="text-muted-foreground">{table.schema}.</span>
          {table.table}
        </Link>
        {table.rlsEnabled ? (
          <Badge>
            <ShieldCheck /> RLS ativo
          </Badge>
        ) : (
          <Badge variant="outline">
            <ShieldOff /> RLS desativado
          </Badge>
        )}
        {table.rlsForced && <Badge variant="warning">forçado para o dono</Badge>}

        {canWrite && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant={table.rlsEnabled ? 'outline' : 'default'} size="sm" onClick={() => onToggleRls(!table.rlsEnabled)}>
              {table.rlsEnabled ? 'Desativar RLS' : 'Ativar RLS'}
            </Button>
            <Button variant="outline" size="sm" onClick={onNewPolicy}>
              <Plus /> Nova política
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Mais opções de RLS">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuCheckboxItem checked={table.rlsForced} disabled={!table.rlsEnabled} onCheckedChange={(v) => onToggleForce(v === true)}>
                  <span className="flex flex-col">
                    Forçar RLS para o dono da tabela
                    <span className="text-xs text-muted-foreground">FORCE ROW LEVEL SECURITY</span>
                  </span>
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      {table.policies.length === 0 ? (
        <div className={cn('flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground', lockedOut && 'text-warning')}>
          {lockedOut && <ShieldAlert className="size-4 shrink-0" />}
          {lockedOut
            ? 'RLS ativo sem políticas: nenhum role (exceto dono e superusuário) consegue ler ou gravar nesta tabela.'
            : 'Nenhuma política. Com o RLS desativado, todos os roles com permissão na tabela veem todas as linhas.'}
        </div>
      ) : (
        <ul className="divide-y">
          {table.policies.map((policy) => (
            <li key={policy.name} className="flex items-start gap-3 px-4 py-3">
              <span className={cn('mt-0.5 w-16 shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold', commandColor[policy.command])}>
                {policy.command}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {policy.name}
                  {!policy.permissive && <Badge variant="warning">restritiva</Badge>}
                  <span className="text-xs font-normal text-muted-foreground">
                    para <span className="font-mono">{policy.roles.join(', ')}</span>
                  </span>
                </p>
                {policy.using && (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    <span className="text-foreground/70">using</span> ({policy.using})
                  </p>
                )}
                {policy.withCheck && (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    <span className="text-foreground/70">with check</span> ({policy.withCheck})
                  </p>
                )}
              </div>
              {canWrite && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label={`Ações da política ${policy.name}`}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEditPolicy(policy)}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => onDeletePolicy(policy)}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      {!canWrite && (
        <Tooltip content="Conexão somente leitura">
          <span className="sr-only">Somente leitura</span>
        </Tooltip>
      )}
    </Card>
  )
}

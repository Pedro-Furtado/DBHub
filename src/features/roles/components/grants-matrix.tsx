import { Eye, Search, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SqlPreview } from '@/components/shared/sql-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDdlPreview } from '@/features/database/hooks/use-database'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { rolesApi, type GrantItem, type Privilege, type TableGrant } from '../api/roles-api'
import { useRoleGrants, useSetGrants } from '../hooks/use-roles'

const PRIVILEGES: Privilege[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
const key = (t: { schema: string; table: string }) => `${t.schema}.${t.table}`

type GrantsMatrixProps = { connectionId: string; role: string; canWrite: boolean; superuser: boolean }

/** Matriz tabela × privilégio. Edita um rascunho e aplica só o que mudou, numa transação. */
export function GrantsMatrix({ connectionId, role, canWrite, superuser }: GrantsMatrixProps) {
  const grants = useRoleGrants(connectionId, role)
  const save = useSetGrants(connectionId, role)
  const [draft, setDraft] = useState<Record<string, Privilege[]>>({})
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (grants.data ?? []).filter((t) => !term || key(t).toLowerCase().includes(term))
  }, [grants.data, search])

  const current = (t: TableGrant) => draft[key(t)] ?? t.privileges
  const changed: GrantItem[] = (grants.data ?? [])
    .filter((t) => draft[key(t)] && [...draft[key(t)]!].sort().join() !== [...t.privileges].sort().join())
    .map((t) => ({ schema: t.schema, table: t.table, privileges: draft[key(t)]! }))

  const debounced = useDebouncedValue(changed.length ? changed : null, 300)
  const preview = useDdlPreview(`grants:${role}`, debounced, (items) => rolesApi.setGrants(connectionId, role, items, true))

  function toggle(t: TableGrant, p: Privilege) {
    const now = current(t)
    setDraft((d) => ({ ...d, [key(t)]: now.includes(p) ? now.filter((x) => x !== p) : [...now, p] }))
  }

  /** Cabeçalho: marca/desmarca o privilégio em todas as tabelas visíveis */
  function toggleColumn(p: Privilege) {
    const all = rows.every((t) => current(t).includes(p))
    setDraft((d) => {
      const next = { ...d }
      for (const t of rows) {
        const now = current(t)
        next[key(t)] = all ? now.filter((x) => x !== p) : [...new Set([...now, p])]
      }
      return next
    })
  }

  async function apply() {
    try {
      await save.mutateAsync(changed)
      toast.success(`Permissões de ${role} atualizadas em ${changed.length} ${changed.length === 1 ? 'tabela' : 'tabelas'}`)
      setDraft({})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar as permissões')
    }
  }

  if (superuser) {
    return <p className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">Superusuário tem acesso total a tudo — permissões por tabela não se aplicam.</p>
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input icon={<Search />} placeholder="Filtrar tabelas…" className="h-8 text-xs" containerClassName="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        {canWrite && changed.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{changed.length} alteradas</Badge>
            <Button variant="ghost" size="sm" onClick={() => setDraft({})}>
              Descartar
            </Button>
            <Button size="sm" loading={save.isPending} onClick={apply}>
              Aplicar permissões
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tabela</th>
              {PRIVILEGES.map((p) => {
                const all = rows.length > 0 && rows.every((t) => current(t).includes(p))
                const some = rows.some((t) => current(t).includes(p))
                return (
                  <th key={p} className="w-24 px-2 py-2 font-medium">
                    <label className="flex cursor-pointer flex-col items-center gap-1.5">
                      <span className="font-mono">{p}</span>
                      <Checkbox
                        size="sm"
                        aria-label={`${p} em todas`}
                        disabled={!canWrite || rows.length === 0}
                        checked={all ? true : some ? 'indeterminate' : false}
                        onCheckedChange={() => toggleColumn(p)}
                      />
                    </label>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {grants.isLoading
              ? Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="border-t">
                    <td colSpan={5} className="px-3 py-2.5">
                      <Skeleton className="h-4" />
                    </td>
                  </tr>
                ))
              : rows.map((t) => {
                  const dirty = draft[key(t)] !== undefined && changed.some((c) => key(c) === key(t))
                  return (
                    <tr key={key(t)} className={dirty ? 'border-t bg-primary/5' : 'border-t'}>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          {t.kind === 'view' ? <Eye className="size-3.5 text-muted-foreground" /> : <Table2 className="size-3.5 text-muted-foreground" />}
                          <span className="text-muted-foreground">{t.schema}.</span>
                          {t.table}
                          {t.owner && <Badge variant="outline">dono</Badge>}
                        </span>
                      </td>
                      {PRIVILEGES.map((p) => (
                        <td key={p} className="text-center">
                          <Checkbox
                            aria-label={`${p} em ${t.table}`}
                            disabled={!canWrite || t.owner || (t.kind === 'view' && p !== 'SELECT')}
                            checked={t.owner || current(t).includes(p)}
                            onCheckedChange={() => toggle(t, p)}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      {changed.length > 0 && <SqlPreview sql={preview.data?.sql} error={preview.error} loading={preview.isFetching} title="Será executado ao aplicar" />}
      <p className="text-xs text-muted-foreground">
        Ao dar INSERT, o DBHub também libera as sequences da tabela (para o id automático funcionar). Lembre que o RLS continua valendo por cima destas permissões.
      </p>
    </div>
  )
}

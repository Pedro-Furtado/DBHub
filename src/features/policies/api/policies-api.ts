import { api } from '@/lib/api-client'
import { env } from '@/lib/env'
import { sleep } from '@/lib/utils'
import { mockTables } from '@/mocks/data'
import type { PoliciesOverview, PolicyInput, TableRls } from '@/types/database'

const base = (id: string, schema: string, table: string) => `/c/${id}/tables/${schema}/${table}`
const enc = encodeURIComponent

let mockState: TableRls[] = mockTables
  .filter((t) => t.kind === 'table')
  .map((t) => ({ schema: t.schema, table: t.name, rlsEnabled: false, rlsForced: false, policies: [] }))

const mock = {
  async overview(_id: string): Promise<PoliciesOverview> {
    await sleep(200)
    return { session: { user: 'postgres', superuser: true, bypass: true }, tables: mockState }
  },
  roles: async (_id: string) => ['public', 'postgres', 'app_user'],
  async setRls(_id: string, schema: string, table: string, change: { enabled?: boolean; forced?: boolean }) {
    await sleep(200)
    mockState = mockState.map((t) =>
      t.schema === schema && t.table === table
        ? { ...t, rlsEnabled: change.enabled ?? t.rlsEnabled, rlsForced: change.forced ?? t.rlsForced }
        : t,
    )
  },
  async preview(_id: string, schema: string, table: string, p: PolicyInput) {
    return { sql: `create policy "${p.name}" on ${schema}.${table} for ${p.command.toLowerCase()} ...;` }
  },
  async create(_id: string, schema: string, table: string, p: PolicyInput) {
    await sleep(300)
    mockState = mockState.map((t) =>
      t.schema === schema && t.table === table ? { ...t, policies: [...t.policies, { ...p, using: p.using ?? null, withCheck: p.withCheck ?? null }] } : t,
    )
  },
  async update(id: string, schema: string, table: string, oldName: string, p: PolicyInput) {
    await mock.remove(id, schema, table, oldName)
    await mock.create(id, schema, table, p)
  },
  async remove(_id: string, schema: string, table: string, name: string) {
    await sleep(200)
    mockState = mockState.map((t) => (t.schema === schema && t.table === table ? { ...t, policies: t.policies.filter((p) => p.name !== name) } : t))
  },
}

const real = {
  overview: (id: string) => api.get<PoliciesOverview>(`/c/${id}/policies`),
  roles: (id: string) => api.get<string[]>(`/c/${id}/roles`),
  setRls: (id: string, schema: string, table: string, change: { enabled?: boolean; forced?: boolean }) =>
    api.patch<TableRls>(`${base(id, schema, table)}/rls`, change),
  preview: (id: string, schema: string, table: string, p: PolicyInput) =>
    api.post<{ sql: string }>(`${base(id, schema, table)}/policies/preview`, p),
  create: (id: string, schema: string, table: string, p: PolicyInput) => api.post<{ sql: string }>(`${base(id, schema, table)}/policies`, p),
  update: (id: string, schema: string, table: string, oldName: string, p: PolicyInput) =>
    api.put<{ sql: string }>(`${base(id, schema, table)}/policies/${enc(oldName)}`, p),
  remove: (id: string, schema: string, table: string, name: string) =>
    api.delete<{ sql: string }>(`${base(id, schema, table)}/policies/${enc(name)}`),
}

/** Os mocks não devolvem o SQL executado; a interface pública é a da API real. */
export const policiesApi = (env.useMocks ? mock : real) as typeof real

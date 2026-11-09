import { api } from '@/lib/api-client'
import type { DdlResult } from '@/types/database'

export type DbRole = {
  name: string
  canLogin: boolean
  superuser: boolean
  bypassRls: boolean
  createDb: boolean
  createRole: boolean
  connectionLimit: number
  memberOf: string[]
  isCurrent: boolean
}

export type Privilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
export type TableGrant = { schema: string; table: string; kind: 'table' | 'view'; privileges: Privilege[]; owner: boolean }
export type GrantItem = { schema: string; table: string; privileges: Privilege[] }

export type CreateRoleInput = { name: string; password?: string; canLogin: boolean; connectionLimit: number }
export type UpdateRoleInput = Partial<{ password: string; canLogin: boolean; connectionLimit: number }>

const base = (id: string) => `/c/${id}/db-roles`
const q = (dryRun?: boolean) => (dryRun ? '?dryRun=true' : '')

export const rolesApi = {
  list: (id: string) => api.get<DbRole[]>(base(id)),
  create: (id: string, input: CreateRoleInput, dryRun?: boolean) => api.post<DdlResult>(`${base(id)}${q(dryRun)}`, input),
  update: (id: string, role: string, input: UpdateRoleInput, dryRun?: boolean) =>
    api.patch<DdlResult>(`${base(id)}/${encodeURIComponent(role)}${q(dryRun)}`, input),
  remove: (id: string, role: string, opts: { reassign?: boolean; dryRun?: boolean } = {}) => {
    const p = new URLSearchParams()
    if (opts.reassign) p.set('reassign', 'true')
    if (opts.dryRun) p.set('dryRun', 'true')
    return api.delete<DdlResult>(`${base(id)}/${encodeURIComponent(role)}${p.size ? `?${p}` : ''}`)
  },
  grants: (id: string, role: string) => api.get<TableGrant[]>(`${base(id)}/${encodeURIComponent(role)}/grants`),
  setGrants: (id: string, role: string, items: GrantItem[], dryRun?: boolean) =>
    api.put<DdlResult>(`${base(id)}/${encodeURIComponent(role)}/grants${q(dryRun)}`, { items }),
}

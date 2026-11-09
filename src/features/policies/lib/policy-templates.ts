import type { PolicyInput } from '@/types/database'

export type PolicyTemplate = {
  id: string
  title: string
  description: string
  policy: PolicyInput
}

/**
 * Modelos prontos. Em Postgres comum (fora do Supabase) não existe auth.uid():
 * o app informa o usuário da sessão com  set local app.user_id = '...'
 * e a política lê com  current_setting('app.user_id', true).
 */
export const policyTemplates: PolicyTemplate[] = [
  {
    id: 'read-all',
    title: 'Leitura liberada',
    description: 'Qualquer role pode ler todas as linhas.',
    policy: { name: 'Leitura liberada', command: 'SELECT', permissive: true, roles: ['public'], using: 'true' },
  },
  {
    id: 'owner',
    title: 'Somente o dono da linha',
    description: 'Cada usuário vê e altera só as próprias linhas (coluna user_id).',
    policy: {
      name: 'Dono da linha',
      command: 'ALL',
      permissive: true,
      roles: ['public'],
      using: "user_id::text = current_setting('app.user_id', true)",
      withCheck: "user_id::text = current_setting('app.user_id', true)",
    },
  },
  {
    id: 'tenant',
    title: 'Isolamento por empresa (multi-tenant)',
    description: 'Linhas filtradas pelo tenant da sessão (coluna tenant_id).',
    policy: {
      name: 'Isolamento por tenant',
      command: 'ALL',
      permissive: true,
      roles: ['public'],
      using: "tenant_id::text = current_setting('app.tenant_id', true)",
      withCheck: "tenant_id::text = current_setting('app.tenant_id', true)",
    },
  },
  {
    id: 'insert-all',
    title: 'Inserção liberada',
    description: 'Qualquer role pode inserir (ex.: formulário de contato).',
    policy: { name: 'Inserção liberada', command: 'INSERT', permissive: true, roles: ['public'], withCheck: 'true' },
  },
  {
    id: 'soft-delete',
    title: 'Esconder registros apagados',
    description: 'Restritiva: nunca mostra linhas com deleted_at preenchido.',
    policy: { name: 'Ocultar apagados', command: 'SELECT', permissive: false, roles: ['public'], using: 'deleted_at is null' },
  },
]

export const commandOptions = [
  { value: 'ALL', label: 'ALL' },
  { value: 'SELECT', label: 'SELECT' },
  { value: 'INSERT', label: 'INSERT' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
] as const

/** Quais cláusulas cada comando aceita. */
export const clausesFor = (command: PolicyInput['command']) => ({
  using: command !== 'INSERT',
  withCheck: command === 'ALL' || command === 'INSERT' || command === 'UPDATE',
})

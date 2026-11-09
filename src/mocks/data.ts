import type { ColumnInfo, Connection, Row, SavedQuery, TableInfo } from '@/types/database'

/**
 * Dados de exemplo usados enquanto o server não existe.
 * Quando VITE_USE_MOCKS=false, o front passa a chamar a API real.
 */
export const mockConnections: Connection[] = [
  {
    id: 'cn_leadflow',
    name: 'Leadflow',
    environment: 'production',
    host: 'switchyard.proxy.rlwy.net',
    port: 41532,
    database: 'railway',
    user: 'postgres',
    readOnly: false,
    status: 'online',
    version: 'PostgreSQL 17.4',
    sizeBytes: 182_452_224,
    tableCount: 14,
    lastUsedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    createdAt: '2026-10-02T12:00:00.000Z',
  },
  {
    id: 'cn_uniko',
    name: 'Uniko',
    environment: 'staging',
    host: 'monorail.proxy.rlwy.net',
    port: 28411,
    database: 'uniko',
    user: 'postgres',
    readOnly: false,
    status: 'online',
    version: 'PostgreSQL 16.8',
    sizeBytes: 54_001_664,
    tableCount: 9,
    lastUsedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    createdAt: '2026-09-18T12:00:00.000Z',
  },
  {
    id: 'cn_email',
    name: 'Plataforma de e-mail',
    environment: 'development',
    host: 'localhost',
    port: 5432,
    database: 'mailer_dev',
    user: 'pedro',
    readOnly: true,
    status: 'offline',
    createdAt: '2026-10-31T12:00:00.000Z',
  },
]

export const mockTables: TableInfo[] = [
  { schema: 'public', name: 'leads', kind: 'table', rowEstimate: 12_480, sizeBytes: 6_291_456 },
  { schema: 'public', name: 'flows', kind: 'table', rowEstimate: 38, sizeBytes: 196_608 },
  { schema: 'public', name: 'flow_steps', kind: 'table', rowEstimate: 412, sizeBytes: 344_064 },
  { schema: 'public', name: 'users', kind: 'table', rowEstimate: 6, sizeBytes: 49_152 },
  { schema: 'public', name: 'webhooks', kind: 'table', rowEstimate: 21, sizeBytes: 65_536 },
  { schema: 'public', name: 'leads_by_source', kind: 'view', rowEstimate: 0, sizeBytes: 0 },
  { schema: 'audit', name: 'events', kind: 'table', rowEstimate: 98_301, sizeBytes: 41_943_040 },
]

export const mockColumns: ColumnInfo[] = [
  { name: 'id', type: 'uuid', nullable: false, defaultValue: 'gen_random_uuid()', isPrimaryKey: true },
  { name: 'name', type: 'text', nullable: false, defaultValue: null, isPrimaryKey: false },
  { name: 'email', type: 'text', nullable: true, defaultValue: null, isPrimaryKey: false },
  { name: 'phone', type: 'varchar(20)', nullable: true, defaultValue: null, isPrimaryKey: false },
  { name: 'source', type: 'text', nullable: false, defaultValue: "'instagram'", isPrimaryKey: false },
  {
    name: 'flow_id',
    type: 'uuid',
    nullable: true,
    defaultValue: null,
    isPrimaryKey: false,
    foreignKey: { table: 'flows', column: 'id' },
  },
  { name: 'converted', type: 'boolean', nullable: false, defaultValue: 'false', isPrimaryKey: false },
  { name: 'metadata', type: 'jsonb', nullable: true, defaultValue: null, isPrimaryKey: false },
  { name: 'created_at', type: 'timestamptz', nullable: false, defaultValue: 'now()', isPrimaryKey: false },
]

const firstNames = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Larissa', 'Marcos']
const lastNames = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Pereira', 'Costa', 'Rocha', 'Almeida']
const sources = ['instagram', 'whatsapp', 'site', 'indicação', 'google']

export function generateRows(count: number, offset = 0): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const n = offset + i
    const first = firstNames[n % firstNames.length]
    const last = lastNames[(n * 7) % lastNames.length]
    return {
      id: `8f${(n * 2654435761).toString(16).padStart(8, '0').slice(0, 6)}-4c1e-4a7b-9d2e-${String(n).padStart(12, '0')}`,
      name: `${first} ${last}`,
      email: n % 5 === 3 ? null : `${first.toLowerCase()}.${last.toLowerCase()}${n}@email.com`,
      phone: `(63) 9${String(81000000 + n * 137).slice(0, 4)}-${String(1000 + ((n * 53) % 9000))}`,
      source: sources[n % sources.length],
      flow_id: n % 3 === 0 ? null : 'b71c2e04-9a51-4f0c-8e1d-55aa13c0f9e2',
      converted: n % 4 === 0,
      metadata: n % 2 === 0 ? { utm: 'reels', score: (n * 13) % 100 } : null,
      created_at: new Date(Date.UTC(2026, 10, 7, 18) - n * 1000 * 60 * 47).toISOString(),
    }
  })
}

export const mockSavedQueries: SavedQuery[] = [
  {
    id: 'q_1',
    title: 'Leads convertidos por origem',
    sql: "select source, count(*) as total\nfrom public.leads\nwhere converted = true\ngroup by source\norder by total desc;",
    updatedAt: '2026-11-06T15:20:00.000Z',
  },
  {
    id: 'q_2',
    title: 'Últimos 50 leads',
    sql: 'select id, name, email, source, created_at\nfrom public.leads\norder by created_at desc\nlimit 50;',
    updatedAt: '2026-11-04T10:02:00.000Z',
  },
]

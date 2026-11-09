import pg from 'pg'
import { decrypt } from '../../lib/crypto.ts'
import { AppError, badRequest, conflict, forbidden } from '../../lib/errors.ts'
import { createLogger } from '../../lib/logger.ts'
import { connectionsService } from '../connections/connections.service.ts'
import { ident, qualified } from '../database/pg-utils.ts'
import { commentsSql, policySql, readSnapshot, sequenceSql, type Snapshot, type Table, tableSql } from './snapshot.ts'

const log = createLogger('clone')

type ConnectionRow = Awaited<ReturnType<typeof connectionsService.get>>

export type Warning = { level: 'info' | 'warn' | 'danger'; message: string }

export type ClonePlan = {
  source: { id: string; name: string; environment: string; database: string }
  target: { id: string; name: string; environment: string; database: string; readOnly: boolean }
  counts: { schemas: number; extensions: number; enums: number; sequences: number; functions: number; tables: number; views: number; indexes: number; foreignKeys: number; triggers: number; policies: number }
  tables: { key: string; schema: string; name: string; rowEstimate: number; sizeBytes: number; columns: number; hasPasswordHash: boolean }[]
  /** Impede o clone (ex.: destino não está vazio) */
  blocking: string[]
  warnings: Warning[]
  /** Destino de produção: precisa digitar o nome para confirmar */
  requiresConfirm: boolean
  sql: string
}

export type CloneEvent =
  | { type: 'step'; id: string; label: string; status: 'running' | 'done' | 'skipped'; detail?: string }
  | { type: 'progress'; id: string; done: number; total: number; detail?: string }
  | { type: 'warn'; message: string }
  | { type: 'done'; durationMs: number; summary: { tables: number; rows: number } }
  | { type: 'error'; message: string; step?: string }

/** Cliente dedicado (fora do pool): o clone pode levar minutos e precisa da mesma sessão do começo ao fim. */
async function openClient(row: ConnectionRow, purpose: string) {
  const client = new pg.Client({
    connectionString: decrypt(row.urlEncrypted),
    connectionTimeoutMillis: 10_000,
    application_name: `dbhub-clone-${purpose}`,
  })
  try {
    await client.connect()
  } catch (error) {
    throw badRequest(`Não foi possível conectar em "${row.name}": ${error instanceof Error ? error.message : error}`, 'CLONE_CONNECT')
  }
  return client
}

/** Objetos do usuário que já existem no destino (o clone só vai para banco vazio). */
async function existingObjects(client: pg.ClientBase) {
  const { rows } = await client.query<{ kind: string; name: string }>(`
    select case c.relkind when 'r' then 'tabela' when 'v' then 'view' when 'm' then 'view materializada' when 'S' then 'sequence' when 'p' then 'tabela' end as kind,
           n.nspname || '.' || c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'v', 'm', 'S', 'p')
       and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_%'
       and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    union all
    select 'enum', n.nspname || '.' || t.typname
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where t.typtype = 'e' and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_%'
       and not exists (select 1 from pg_depend d where d.classid = 'pg_type'::regclass and d.objid = t.oid and d.deptype = 'e')
    limit 50`)
  return rows
}

const stripSemicolon = (sql: string) => sql.trim().replace(/;\s*$/, '')

/** SQL completo da estrutura, na ordem de execução (é o que aparece na revisão). */
export function buildStructureSql(s: Snapshot, skipPolicy: (role: string) => boolean = () => false) {
  const out: string[] = []
  const section = (title: string, lines: string[]) => {
    if (lines.length) out.push(`-- ${title}`, ...lines, '')
  }
  section('Schemas', s.schemas.filter((n) => n !== 'public').map((n) => `create schema if not exists ${ident(n)};`))
  section('Extensões', s.extensions.map((e) => `create extension if not exists ${ident(e.name)} with schema ${ident(e.schema)};`))
  section('Enums', s.enums.map((e) => `create type ${qualified(e.schema, e.name)} as enum (${e.values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')});`))
  section('Sequences', s.sequences.map(sequenceSql))
  section('Funções', s.functions.map((f) => `${stripSemicolon(f.def)};`))
  section('Tabelas', s.tables.flatMap((t) => [tableSql(t), ...commentsSql(t)]))
  section('(dados das tabelas selecionadas são copiados aqui)', [])
  section(
    'Sequences: dono e posição',
    s.sequences.flatMap((q) => [
      ...(q.ownedBy ? [`alter sequence ${qualified(q.schema, q.name)} owned by ${q.ownedBy};`] : []),
      ...(q.lastValue ? [`select setval('${qualified(q.schema, q.name).replace(/'/g, "''")}', ${q.lastValue}, true); -- só se a tabela levar dados`] : []),
    ]),
  )
  section('Chaves estrangeiras', s.tables.flatMap((t) => t.foreignKeys.map((f) => `alter table ${qualified(t.schema, t.name)} add constraint ${ident(f.name)} ${f.def};`)))
  section('Índices', s.tables.flatMap((t) => t.indexes.map((i) => `${i};`)))
  section('Views', s.views.map((v) => `create ${v.materialized ? 'materialized view' : 'view'} ${qualified(v.schema, v.name)} as ${stripSemicolon(v.def)}${v.materialized ? ' with data' : ''};`))
  section('Triggers', s.tables.flatMap((t) => t.triggers.map((tr) => `${tr.def};`)))
  section(
    'RLS e políticas',
    s.tables.flatMap((t) => [
      ...(t.rls ? [`alter table ${qualified(t.schema, t.name)} enable row level security;`] : []),
      ...(t.forceRls ? [`alter table ${qualified(t.schema, t.name)} force row level security;`] : []),
      ...t.policies.filter((p) => !p.roles.some(skipPolicy)).map((p) => policySql(t, p)),
    ]),
  )
  return out.join('\n').trim()
}

const isPasswordHashTrigger = (t: Table) => t.triggers.some((tr) => tr.name.startsWith('dbhub_hash_'))

/** Analisa origem e destino e monta a revisão (não altera nada em nenhum dos dois). */
async function analyze(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw badRequest('Escolha bancos diferentes para origem e destino', 'CLONE_SAME')
  const [sourceRow, targetRow] = await Promise.all([connectionsService.get(sourceId), connectionsService.get(targetId)])
  if (sourceRow.host === targetRow.host && sourceRow.port === targetRow.port && sourceRow.database === targetRow.database) {
    throw badRequest('Origem e destino apontam para o mesmo banco', 'CLONE_SAME')
  }

  const source = await openClient(sourceRow, 'source')
  const target = await openClient(targetRow, 'target').catch(async (e) => {
    await source.end()
    throw e
  })
  try {
    await source.query('begin isolation level repeatable read read only')
    const snapshot = await readSnapshot(source)
    await source.query('rollback')

    const existing = await existingObjects(target)
    const targetRoles = new Set((await target.query<{ rolname: string }>('select rolname from pg_roles')).rows.map((r) => r.rolname))
    const available = new Set((await target.query<{ name: string }>('select name from pg_available_extensions')).rows.map((r) => r.name))
    return { sourceRow, targetRow, snapshot, existing, targetRoles, available }
  } finally {
    await Promise.all([source.end().catch(() => undefined), target.end().catch(() => undefined)])
  }
}

function buildPlan(a: Awaited<ReturnType<typeof analyze>>): ClonePlan {
  const { sourceRow, targetRow, snapshot: s, existing, targetRoles, available } = a
  const blocking: string[] = []
  const warnings: Warning[] = []

  if (targetRow.readOnly) blocking.push(`"${targetRow.name}" está como somente leitura no DBHub — desligue o modo somente leitura para usar como destino.`)
  if (existing.length) {
    const sample = existing.slice(0, 5).map((e) => `${e.kind} ${e.name}`).join(', ')
    blocking.push(`O destino não está vazio (${existing.length >= 50 ? '50+' : existing.length} objetos: ${sample}${existing.length > 5 ? '…' : ''}). O clone só vai para um banco vazio, para não sobrescrever nada.`)
  }
  const missingExt = s.extensions.filter((e) => !available.has(e.name))
  if (missingExt.length) blocking.push(`Extensões que o destino não tem disponíveis: ${missingExt.map((e) => e.name).join(', ')}.`)

  if (targetRow.environment === 'production') {
    warnings.push({ level: 'danger', message: `O destino "${targetRow.name}" está marcado como Produção. Confira se é isso mesmo — você vai precisar digitar o nome para confirmar.` })
  }
  if (sourceRow.environment === 'production') {
    warnings.push({ level: 'info', message: 'A origem é Produção: ela só é lida (transação somente leitura), nada é alterado nela.' })
  }

  const missingRoles = new Set(s.tables.flatMap((t) => t.policies.flatMap((p) => p.roles)).filter((r) => r !== 'public' && !targetRoles.has(r)))
  if (missingRoles.size) {
    warnings.push({ level: 'warn', message: `Políticas RLS que usam usuários do banco que não existem no destino (${[...missingRoles].join(', ')}) serão puladas. Crie esses usuários no destino e recrie as políticas.` })
  }
  const hashed = s.tables.filter(isPasswordHashTrigger)
  if (hashed.length) {
    warnings.push({ level: 'info', message: `Colunas de senha com hash automático (${hashed.map((t) => t.name).join(', ')}) são recriadas com o trigger. Senhas copiadas já estão em hash e não são refeitas.` })
  }
  if (s.unsupported.length) {
    warnings.push({ level: 'warn', message: `Não são copiados: ${s.unsupported.map((u) => `${u.kind} ${u.name}`).join(', ')}. Recrie pelo SQL Editor.` })
  }
  warnings.push({ level: 'info', message: 'Usuários do banco e permissões (GRANT) não são copiados — eles pertencem ao servidor, não ao banco.' })

  const count = (fn: (t: Table) => number) => s.tables.reduce((n, t) => n + fn(t), 0)
  return {
    source: { id: sourceRow.id, name: sourceRow.name, environment: sourceRow.environment, database: sourceRow.database },
    target: { id: targetRow.id, name: targetRow.name, environment: targetRow.environment, database: targetRow.database, readOnly: targetRow.readOnly },
    counts: {
      schemas: s.schemas.length,
      extensions: s.extensions.length,
      enums: s.enums.length,
      sequences: s.sequences.length,
      functions: s.functions.length,
      tables: s.tables.length,
      views: s.views.length,
      indexes: count((t) => t.indexes.length),
      foreignKeys: count((t) => t.foreignKeys.length),
      triggers: count((t) => t.triggers.length),
      policies: count((t) => t.policies.length),
    },
    tables: s.tables.map((t) => ({
      key: `${t.schema}.${t.name}`,
      schema: t.schema,
      name: t.name,
      rowEstimate: t.rowEstimate,
      sizeBytes: t.sizeBytes,
      columns: t.columns.length,
      hasPasswordHash: isPasswordHashTrigger(t),
    })),
    blocking,
    warnings,
    requiresConfirm: targetRow.environment === 'production',
    sql: buildStructureSql(s, (role) => role !== 'public' && !targetRoles.has(role)),
  }
}

export async function planClone(sourceId: string, targetId: string) {
  return buildPlan(await analyze(sourceId, targetId))
}

// Um clone por destino de cada vez
const running = new Set<string>()

/** Copia as linhas de uma tabela em lotes, tudo como texto (o Postgres converte de volta, sem perder nada). */
async function copyTable(source: pg.ClientBase, target: pg.ClientBase, t: Table, onBatch: (done: number, total: number) => void, signal: AbortSignal) {
  const columns = t.columns.filter((c) => !c.generated)
  if (!columns.length) return 0
  const from = qualified(t.schema, t.name)
  const total = Number((await source.query<{ n: string }>(`select count(*)::text as n from ${from}`)).rows[0]!.n)
  if (total === 0) return 0

  const columnList = columns.map((c) => ident(c.name)).join(', ')
  const overriding = columns.some((c) => c.identity === 'a') ? ' overriding system value' : ''
  const batch = Math.max(1, Math.min(1000, Math.floor(30_000 / columns.length)))

  await source.query(`declare dbhub_clone no scroll cursor for select ${columns.map((c) => `${ident(c.name)}::text`).join(', ')} from ${from}`)
  let done = 0
  try {
    for (;;) {
      if (signal.aborted) throw new AppError(499, 'CLONE_ABORTED', 'Clone cancelado')
      const { rows } = await source.query<unknown[]>({ text: `fetch ${batch} from dbhub_clone`, rowMode: 'array' })
      if (!rows.length) break
      const params: unknown[] = []
      const values = rows.map((row) => `(${row.map((v) => (params.push(v), `$${params.length}`)).join(', ')})`)
      await target.query(`insert into ${from} (${columnList})${overriding} values ${values.join(', ')}`, params)
      done += rows.length
      onBatch(done, total)
    }
  } finally {
    await source.query('close dbhub_clone').catch(() => undefined)
  }
  return done
}

/**
 * Executa o clone emitindo cada etapa (SSE).
 * Destino: uma transação só — se qualquer passo falhar ou a tela for fechada, nada fica no destino.
 * Origem: transação somente leitura com snapshot consistente (dados e estrutura do mesmo instante).
 */
export async function runClone(
  input: { sourceId: string; targetId: string; dataTables: string[]; confirm?: string },
  emit: (event: CloneEvent) => void,
  signal: AbortSignal,
) {
  const startedAt = Date.now()
  if (running.has(input.targetId)) throw conflict('Já existe um clone rodando para esse destino', 'CLONE_RUNNING')
  running.add(input.targetId)
  let currentStep: string | undefined

  try {
    const analysis = await analyze(input.sourceId, input.targetId)
    const plan = buildPlan(analysis)
    if (plan.blocking.length) throw badRequest(plan.blocking.join(' '), 'CLONE_BLOCKED')
    if (plan.requiresConfirm && input.confirm?.trim() !== analysis.targetRow.name) {
      throw forbidden(`Digite "${analysis.targetRow.name}" para confirmar o clone em produção`, 'CLONE_CONFIRM')
    }

    log.warn({ source: analysis.sourceRow.name, target: analysis.targetRow.name, dataTables: input.dataTables.length }, 'Clone iniciado')
    const source = await openClient(analysis.sourceRow, 'source')
    const target = await openClient(analysis.targetRow, 'target').catch(async (e) => {
      await source.end()
      throw e
    })

    let rowsCopied = 0
    try {
      await source.query('begin isolation level repeatable read read only')
      const s = await readSnapshot(source)
      const { targetRoles } = analysis
      const skipRole = (role: string) => role !== 'public' && !targetRoles.has(role)

      await target.query('begin')
      await target.query(`set local lock_timeout = '15s'`)
      await target.query(`set local statement_timeout = '30min'`)
      // Funções podem citar tabelas que ainda vão ser criadas
      await target.query('set local check_function_bodies = off')

      const step = async (id: string, label: string, statements: string[], detail?: string) => {
        currentStep = label
        if (!statements.length) {
          emit({ type: 'step', id, label, status: 'skipped', detail: 'nada para criar' })
          return
        }
        emit({ type: 'step', id, label, status: 'running', detail })
        for (const [i, sql] of statements.entries()) {
          if (signal.aborted) throw new AppError(499, 'CLONE_ABORTED', 'Clone cancelado')
          await target.query(sql)
          if (statements.length > 3) emit({ type: 'progress', id, done: i + 1, total: statements.length })
        }
        emit({ type: 'step', id, label, status: 'done', detail: `${statements.length} ${statements.length === 1 ? 'comando' : 'comandos'}` })
      }

      // A conexão do destino já foi validada como vazia na análise; checa de novo dentro da transação
      const existing = await existingObjects(target)
      if (existing.length) throw badRequest('O destino deixou de estar vazio durante o clone', 'CLONE_BLOCKED')

      await step('schemas', 'Criando schemas', s.schemas.filter((n) => n !== 'public').map((n) => `create schema if not exists ${ident(n)}`))
      await step('extensions', 'Instalando extensões', s.extensions.map((e) => `create extension if not exists ${ident(e.name)} with schema ${ident(e.schema)}`), s.extensions.map((e) => e.name).join(', '))
      await step('enums', 'Criando enums', s.enums.map((e) => `create type ${qualified(e.schema, e.name)} as enum (${e.values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')})`))
      await step('sequences', 'Criando sequences', s.sequences.map(sequenceSql))
      await step('functions', 'Criando funções', s.functions.map((f) => stripSemicolon(f.def)))
      await step('tables', `Criando tabelas (${s.tables.length})`, s.tables.flatMap((t) => [tableSql(t), ...commentsSql(t)]))

      // ── Dados ──
      const wanted = new Set(input.dataTables)
      const dataTables = s.tables.filter((t) => wanted.has(`${t.schema}.${t.name}`))
      currentStep = 'Copiando dados'
      if (!dataTables.length) {
        emit({ type: 'step', id: 'data', label: 'Copiando dados', status: 'skipped', detail: 'só estrutura (nenhuma tabela marcada)' })
      } else {
        emit({ type: 'step', id: 'data', label: `Copiando dados (${dataTables.length} ${dataTables.length === 1 ? 'tabela' : 'tabelas'})`, status: 'running' })
        for (const t of dataTables) {
          const key = `${t.schema}.${t.name}`
          currentStep = `Copiando dados de ${key}`
          const copied = await copyTable(source, target, t, (done, total) => emit({ type: 'progress', id: 'data', done, total, detail: key }), signal)
          rowsCopied += copied
          emit({ type: 'progress', id: 'data', done: copied, total: copied, detail: `${key} · ${copied.toLocaleString('pt-BR')} linhas` })
        }
        emit({ type: 'step', id: 'data', label: `Copiando dados (${dataTables.length} ${dataTables.length === 1 ? 'tabela' : 'tabelas'})`, status: 'done', detail: `${rowsCopied.toLocaleString('pt-BR')} linhas` })
      }

      // Sequences: dono + continuar do número certo (senão o próximo insert repete id)
      const identitySync = s.tables.flatMap((t) =>
        t.columns
          .filter((c) => c.identity)
          .map((c) => {
            const table = qualified(t.schema, t.name)
            return `select setval(pg_get_serial_sequence('${table.replace(/'/g, "''")}', '${c.name.replace(/'/g, "''")}'), coalesce(max(${ident(c.name)}), 1), max(${ident(c.name)}) is not null) from ${table}`
          }),
      )
      // Sequence de tabela que foi só com estrutura começa do zero; com dados (ou avulsa) continua de onde a origem parou
      await step('sequence-values', 'Ajustando sequences e auto incremento', [
        ...s.sequences.flatMap((q) => [
          ...(q.ownedBy ? [`alter sequence ${qualified(q.schema, q.name)} owned by ${q.ownedBy}`] : []),
          ...(q.lastValue && (!q.ownerTable || wanted.has(q.ownerTable)) ? [`select setval('${qualified(q.schema, q.name).replace(/'/g, "''")}', ${q.lastValue}, true)`] : []),
        ]),
        ...identitySync,
      ])
      await step('foreign-keys', 'Criando chaves estrangeiras', s.tables.flatMap((t) => t.foreignKeys.map((f) => `alter table ${qualified(t.schema, t.name)} add constraint ${ident(f.name)} ${f.def}`)))
      await step('indexes', 'Criando índices', s.tables.flatMap((t) => t.indexes))
      await step('views', 'Criando views', s.views.map((v) => `create ${v.materialized ? 'materialized view' : 'view'} ${qualified(v.schema, v.name)} as ${stripSemicolon(v.def)}${v.materialized ? ' with data' : ''}`))
      await step('triggers', 'Criando triggers', s.tables.flatMap((t) => t.triggers.map((tr) => tr.def)))

      const skipped = s.tables.flatMap((t) => t.policies.filter((p) => p.roles.some(skipRole)).map((p) => `${t.name}.${p.name}`))
      if (skipped.length) emit({ type: 'warn', message: `Políticas puladas (usuário do banco não existe no destino): ${skipped.join(', ')}` })
      await step(
        'rls',
        'Ativando RLS e políticas',
        s.tables.flatMap((t) => [
          ...(t.rls ? [`alter table ${qualified(t.schema, t.name)} enable row level security`] : []),
          ...(t.forceRls ? [`alter table ${qualified(t.schema, t.name)} force row level security`] : []),
          ...t.policies.filter((p) => !p.roles.some(skipRole)).map((p) => policySql(t, p)),
        ]),
      )

      currentStep = 'Confirmando'
      if (signal.aborted) throw new AppError(499, 'CLONE_ABORTED', 'Clone cancelado')
      await target.query('commit')
      await source.query('rollback').catch(() => undefined)
    } catch (error) {
      await target.query('rollback').catch(() => undefined)
      await source.query('rollback').catch(() => undefined)
      throw error
    } finally {
      await Promise.all([source.end().catch(() => undefined), target.end().catch(() => undefined)])
    }

    const durationMs = Date.now() - startedAt
    log.info({ source: analysis.sourceRow.name, target: analysis.targetRow.name, rows: rowsCopied, durationMs }, 'Clone concluído')
    emit({ type: 'done', durationMs, summary: { tables: analysis.snapshot.tables.length, rows: rowsCopied } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn({ targetId: input.targetId, step: currentStep, err: error instanceof AppError ? undefined : error }, `Clone falhou: ${message}`)
    emit({ type: 'error', message, step: currentStep })
  } finally {
    running.delete(input.targetId)
  }
}

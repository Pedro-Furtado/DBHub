import type pg from 'pg'
import { createLogger } from '../../lib/logger.ts'
import { ident, qualified } from '../database/pg-utils.ts'

const log = createLogger('advisors')

export type Finding = {
  id: string
  category: 'security' | 'performance' | 'integrity'
  level: 'error' | 'warn' | 'info'
  title: string
  description: string
  /** Objetos afetados (tabelas, índices, funções…) */
  objects: string[]
  /** SQL sugerido para corrigir — o usuário revisa antes de rodar */
  fix?: string
}

type Check = (client: pg.PoolClient) => Promise<Finding | null>

const SYS = `n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp_%'`
const list = (rows: { name: string }[]) => rows.map((r) => r.name)

// ── Segurança ───────────────────────────────────────────────────────────

/** Tabelas sem RLS que outros usuários (não superusuários) conseguem ler. */
const rlsDisabledExposed: Check = async (client) => {
  const { rows } = await client.query<{ name: string; schema: string; table: string }>(`
    select distinct n.nspname || '.' || c.relname as name, n.nspname as schema, c.relname as table
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      left join pg_roles r on r.oid = a.grantee
     where c.relkind in ('r','p') and not c.relrowsecurity and ${SYS}
       and a.privilege_type = 'SELECT' and a.grantee <> c.relowner
       and (a.grantee = 0 or (r.rolcanlogin and not r.rolsuper and not r.rolbypassrls) or exists (
             select 1 from pg_auth_members m join pg_roles u on u.oid = m.member
              where m.roleid = a.grantee and u.rolcanlogin and not u.rolsuper))
     order by 1`)
  if (!rows.length) return null
  return {
    id: 'rls_disabled_exposed',
    category: 'security',
    level: 'error',
    title: 'Tabelas acessíveis por outros usuários sem RLS',
    description: 'Usuários do banco que não são administradores têm permissão de leitura e veem todas as linhas, porque o Row Level Security está desligado.',
    objects: list(rows),
    fix: rows.map((r) => `alter table ${qualified(r.schema, r.table)} enable row level security;`).join('\n') + '\n-- depois crie as políticas em Políticas (RLS)',
  }
}

const rlsWithoutPolicy: Check = async (client) => {
  const { rows } = await client.query<{ name: string }>(`
    select n.nspname || '.' || c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r','p') and c.relrowsecurity and ${SYS}
       and not exists (select 1 from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname)
     order by 1`)
  if (!rows.length) return null
  return {
    id: 'rls_no_policy',
    category: 'security',
    level: 'info',
    title: 'RLS ativo sem nenhuma política',
    description: 'Ninguém além do dono e dos superusuários consegue ler ou gravar nessas tabelas. Se não for intencional, crie políticas.',
    objects: list(rows),
  }
}

const permissiveWritePolicies: Check = async (client) => {
  const { rows } = await client.query<{ name: string }>(`
    select schemaname || '.' || tablename || ' → ' || policyname as name
      from pg_policies
     where permissive = 'PERMISSIVE' and cmd in ('ALL','INSERT','UPDATE','DELETE')
       and 'public' = any(roles)
       and (coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true')
     order by 1`)
  if (!rows.length) return null
  return {
    id: 'permissive_write_policy',
    category: 'security',
    level: 'warn',
    title: 'Políticas que liberam escrita para todos',
    description: 'Estas políticas permitem INSERT/UPDATE/DELETE para qualquer role com condição "true". Confira se é isso mesmo que você quer.',
    objects: list(rows),
  }
}

const securityDefinerSearchPath: Check = async (client) => {
  const { rows } = await client.query<{ name: string; sig: string }>(`
    select n.nspname || '.' || p.proname as name, p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef and ${SYS}
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
     order by 1`)
  if (!rows.length) return null
  return {
    id: 'security_definer_search_path',
    category: 'security',
    level: 'warn',
    title: 'Funções SECURITY DEFINER sem search_path fixo',
    description: 'Rodam com os privilégios do dono. Sem search_path fixo, um usuário pode criar um objeto com o mesmo nome e sequestrar a execução.',
    objects: list(rows),
    fix: rows.map((r) => `alter function ${r.sig} set search_path = pg_catalog, public, pg_temp;`).join('\n'),
  }
}

const extraSuperusers: Check = async (client) => {
  const { rows } = await client.query<{ name: string }>(`
    select rolname as name from pg_roles where rolsuper and rolcanlogin and rolname <> current_user and rolname not like 'pg\\_%' order by 1`)
  if (!rows.length) return null
  return {
    id: 'extra_superusers',
    category: 'security',
    level: 'warn',
    title: 'Outros superusuários com login',
    description: 'Superusuários ignoram permissões e RLS. Apps não devem conectar com eles — use um usuário com permissões limitadas.',
    objects: list(rows),
  }
}

const publicSchemaCreate: Check = async (client) => {
  const { rows } = await client.query<{ ok: boolean }>(`select has_schema_privilege('public', 'public', 'CREATE') as ok`)
  if (!rows[0]?.ok) return null
  return {
    id: 'public_schema_create',
    category: 'security',
    level: 'warn',
    title: 'Qualquer usuário pode criar objetos no schema public',
    description: 'Padrão antigo do Postgres (antes da versão 15). Um usuário com login pode criar tabelas e funções que confundem outros usuários.',
    objects: ['schema public'],
    fix: 'revoke create on schema public from public;',
  }
}

// ── Integridade ────────────────────────────────────────────────────────

const noPrimaryKey: Check = async (client) => {
  const { rows } = await client.query<{ name: string }>(`
    select n.nspname || '.' || c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r','p') and not c.relispartition and ${SYS}
       and not exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisprimary)
     order by 1`)
  if (!rows.length) return null
  return {
    id: 'no_primary_key',
    category: 'integrity',
    level: 'warn',
    title: 'Tabelas sem chave primária',
    description: 'Sem chave primária não dá para identificar uma linha com segurança: o DBHub bloqueia a edição, e replicação/ORMs costumam falhar.',
    objects: list(rows),
    fix: rows.map((r) => {
      const [schema, table] = r.name.split('.') as [string, string]
      return `alter table ${qualified(schema, table)} add column id bigint generated by default as identity primary key;`
    }).join('\n'),
  }
}

// ── Performance ─────────────────────────────────────────────────────────

const unindexedForeignKeys: Check = async (client) => {
  const { rows } = await client.query<{ name: string; schema: string; table: string; columns: string[] }>(`
    select n.nspname || '.' || c.relname || ' (' || string_agg(a.attname, ', ' order by k.ord) || ')' as name,
           n.nspname as schema, c.relname as table, array_agg(a.attname::text order by k.ord) as columns
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral unnest(con.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
     where con.contype = 'f' and ${SYS}
       and not exists (
         select 1 from pg_index i
          where i.indrelid = con.conrelid
            and (i.indkey::int2[])[0:cardinality(con.conkey) - 1] @> con.conkey
            and (i.indkey::int2[])[0:cardinality(con.conkey) - 1] <@ con.conkey)
     group by n.nspname, c.relname, con.oid
     order by 1`)
  if (!rows.length) return null
  return {
    id: 'unindexed_foreign_keys',
    category: 'performance',
    level: 'warn',
    title: 'Chaves estrangeiras sem índice',
    description:
      'JOINs e exclusões na tabela referenciada ficam lentos (o Postgres varre a tabela inteira para checar a FK). Em tabelas grandes de produção, prefira rodar cada comando sozinho com CREATE INDEX CONCURRENTLY.',
    objects: list(rows),
    fix: rows
      .map((r) => `create index on ${qualified(r.schema, r.table)} (${r.columns.map(ident).join(', ')});`)
      .join('\n'),
  }
}

const unusedIndexes: Check = async (client) => {
  const { rows } = await client.query<{ name: string; index: string; size: string }>(`
    select s.schemaname || '.' || s.indexrelname || ' em ' || s.relname || ' (' || pg_size_pretty(pg_relation_size(s.indexrelid)) || ')' as name,
           quote_ident(s.schemaname) || '.' || quote_ident(s.indexrelname) as index
      from pg_stat_user_indexes s
      join pg_index i on i.indexrelid = s.indexrelid
     where s.idx_scan = 0 and not i.indisprimary and not i.indisunique
       and pg_relation_size(s.indexrelid) > 1024 * 1024
     order by pg_relation_size(s.indexrelid) desc
     limit 50`)
  if (!rows.length) return null
  return {
    id: 'unused_indexes',
    category: 'performance',
    level: 'info',
    title: 'Índices que nunca foram usados',
    description: 'Ocupam espaço e deixam INSERT/UPDATE mais lentos. Confirme que nenhum relatório raro depende deles antes de remover (as estatísticas zeram quando o banco reinicia).',
    objects: list(rows),
    fix: rows.map((r) => `drop index ${r.index};`).join('\n'),
  }
}

const duplicateIndexes: Check = async (client) => {
  const { rows } = await client.query<{ name: string; drop: string }>(`
    select n.nspname || '.' || t.relname || ': ' || string_agg(ic.relname, ' = ' order by ic.relname) as name,
           (array_agg(quote_ident(n.nspname) || '.' || quote_ident(ic.relname) order by i.indisprimary desc, i.indisunique desc, ic.relname))[2] as drop
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where ${SYS}
     group by n.nspname, t.relname, i.indrelid, i.indkey::text, i.indclass::text, coalesce(pg_get_expr(i.indexprs, i.indrelid), ''), coalesce(pg_get_expr(i.indpred, i.indrelid), '')
    having count(*) > 1
     order by 1`)
  if (!rows.length) return null
  return {
    id: 'duplicate_indexes',
    category: 'performance',
    level: 'warn',
    title: 'Índices duplicados',
    description: 'Índices idênticos na mesma tabela: um deles é desperdício de espaço e de tempo de escrita.',
    objects: list(rows),
    fix: rows.map((r) => `drop index ${r.drop};`).join('\n'),
  }
}

const bloatedTables: Check = async (client) => {
  const { rows } = await client.query<{ name: string; target: string }>(`
    select schemaname || '.' || relname || ' (' || n_dead_tup || ' linhas mortas, ' ||
           round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0)) || '%)' as name,
           quote_ident(schemaname) || '.' || quote_ident(relname) as target
      from pg_stat_user_tables
     where n_dead_tup > 1000 and n_dead_tup > 0.2 * (n_live_tup + n_dead_tup)
     order by n_dead_tup desc limit 30`)
  if (!rows.length) return null
  return {
    id: 'table_bloat',
    category: 'performance',
    level: 'warn',
    title: 'Tabelas com muitas linhas mortas',
    description: 'UPDATE/DELETE deixam versões antigas das linhas. Acima de 20% elas deixam consultas mais lentas — o autovacuum não está dando conta.',
    objects: list(rows),
    fix: rows.map((r) => `vacuum (analyze) ${r.target};`).join('\n'),
  }
}

const neverAnalyzed: Check = async (client) => {
  const { rows } = await client.query<{ name: string; target: string }>(`
    select schemaname || '.' || relname as name, quote_ident(schemaname) || '.' || quote_ident(relname) as target
      from pg_stat_user_tables
     where last_analyze is null and last_autoanalyze is null and n_live_tup + n_mod_since_analyze > 0
     order by 1 limit 50`)
  if (!rows.length) return null
  return {
    id: 'never_analyzed',
    category: 'performance',
    level: 'info',
    title: 'Tabelas sem estatísticas',
    description: 'O planejador de consultas ainda não sabe quantas linhas existem nelas e pode escolher planos ruins.',
    objects: list(rows),
    fix: rows.map((r) => `analyze ${r.target};`).join('\n'),
  }
}

const heavySeqScans: Check = async (client) => {
  const { rows } = await client.query<{ name: string }>(`
    select schemaname || '.' || relname || ' (' || seq_scan || ' varreduras, ' || n_live_tup || ' linhas)' as name
      from pg_stat_user_tables
     where seq_scan > 1000 and n_live_tup > 10000 and seq_scan > 10 * coalesce(idx_scan, 0)
     order by seq_tup_read desc limit 20`)
  if (!rows.length) return null
  return {
    id: 'heavy_seq_scans',
    category: 'performance',
    level: 'warn',
    title: 'Tabelas grandes lidas sem índice com frequência',
    description: 'Muitas consultas varrem a tabela inteira. Veja quais filtros (WHERE) elas usam e crie índices para essas colunas.',
    objects: list(rows),
  }
}

const cacheHitRatio: Check = async (client) => {
  const { rows } = await client.query<{ ratio: number | null; total: string }>(`
    select round(blks_hit::numeric / nullif(blks_hit + blks_read, 0), 4)::float as ratio, (blks_hit + blks_read)::text as total
      from pg_stat_database where datname = current_database()`)
  const ratio = rows[0]?.ratio
  if (ratio === null || ratio === undefined || Number(rows[0]!.total) < 100_000 || ratio >= 0.95) return null
  return {
    id: 'cache_hit_ratio',
    category: 'performance',
    level: 'warn',
    title: `Cache hit ratio baixo (${(ratio * 100).toFixed(1)}%)`,
    description: 'Menos de 95% das leituras vêm da memória. O banco está lendo muito do disco: talvez precise de mais memória (plano maior) ou de índices melhores.',
    objects: [`banco ${(await client.query<{ db: string }>('select current_database() as db')).rows[0]!.db}`],
  }
}

const longTransactions: Check = async (client) => {
  const { rows } = await client.query<{ name: string }>(`
    select pid || ' · ' || coalesce(usename, '?') || ' · ' || state || ' há ' || date_trunc('second', now() - xact_start)::text as name
      from pg_stat_activity
     where datname = current_database() and pid <> pg_backend_pid() and xact_start is not null
       and now() - xact_start > interval '5 minutes' and state <> 'active'
     order by xact_start limit 20`)
  if (!rows.length) return null
  return {
    id: 'long_idle_transactions',
    category: 'performance',
    level: 'warn',
    title: 'Transações abertas paradas há mais de 5 minutos',
    description: '"idle in transaction" segura locks e impede o vacuum de limpar a tabela. Normalmente é um app que esqueceu de dar COMMIT.',
    objects: list(rows),
  }
}

const slowQueries: Check = async (client) => {
  const { rows: ext } = await client.query(`select 1 from pg_extension where extname = 'pg_stat_statements'`)
  if (!ext.length) return null
  try {
    const { rows } = await client.query<{ name: string }>(`
      select round(mean_exec_time::numeric, 1) || ' ms × ' || calls || ' — ' || left(regexp_replace(query, '\\s+', ' ', 'g'), 140) as name
        from pg_stat_statements
       where dbid = (select oid from pg_database where datname = current_database()) and mean_exec_time > 100
       order by mean_exec_time * calls desc limit 10`)
    if (!rows.length) return null
    return {
      id: 'slow_queries',
      category: 'performance',
      level: 'info',
      title: 'Queries mais lentas (pg_stat_statements)',
      description: 'Ordenadas pelo tempo total gasto. Rode EXPLAIN ANALYZE nelas no SQL Editor para ver onde está a lentidão.',
      objects: list(rows),
    }
  } catch {
    return null // extensão instalada mas não carregada em shared_preload_libraries
  }
}

const checks: Record<string, Check> = {
  rlsDisabledExposed,
  rlsWithoutPolicy,
  permissiveWritePolicies,
  securityDefinerSearchPath,
  extraSuperusers,
  publicSchemaCreate,
  noPrimaryKey,
  unindexedForeignKeys,
  unusedIndexes,
  duplicateIndexes,
  bloatedTables,
  neverAnalyzed,
  heavySeqScans,
  cacheHitRatio,
  longTransactions,
  slowQueries,
}

const order = { error: 0, warn: 1, info: 2 }

/** Roda todas as checagens; uma que falhe (permissão, versão do Postgres) não derruba as outras. */
export async function runAdvisors(client: pg.PoolClient) {
  const findings: Finding[] = []
  const skipped: string[] = []
  for (const [name, check] of Object.entries(checks)) {
    try {
      await client.query('savepoint advisor')
      const finding = await check(client)
      await client.query('release savepoint advisor')
      if (finding) findings.push(finding)
    } catch (error) {
      await client.query('rollback to savepoint advisor').catch(() => undefined)
      skipped.push(name)
      log.debug({ err: error, check: name }, 'Checagem do advisor ignorada')
    }
  }
  findings.sort((a, b) => order[a.level] - order[b.level])
  return { findings, skipped, checkedAt: new Date().toISOString(), total: Object.keys(checks).length }
}

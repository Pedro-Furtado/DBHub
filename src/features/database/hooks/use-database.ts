import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTableInput, Row } from '@/types/database'
import { databaseApi, type RowsParams } from '../api/database-api'

export const databaseKeys = {
  tables: (connectionId: string) => ['tables', connectionId] as const,
  rows: (connectionId: string, params: RowsParams) => ['rows', connectionId, params] as const,
  savedQueries: (connectionId: string) => ['saved-queries', connectionId] as const,
  schemas: (connectionId: string) => ['schemas', connectionId] as const,
  columns: (connectionId: string, schema: string, table: string) => ['columns', connectionId, schema, table] as const,
  structure: (connectionId: string, schema: string, table: string) => ['structure', connectionId, schema, table] as const,
  enums: (connectionId: string) => ['enums', connectionId] as const,
}

export function useTables(connectionId: string) {
  return useQuery({ queryKey: databaseKeys.tables(connectionId), queryFn: () => databaseApi.tables(connectionId) })
}

export function useRows(connectionId: string, params: RowsParams | null) {
  return useQuery({
    queryKey: databaseKeys.rows(connectionId, params!),
    queryFn: () => databaseApi.rows(connectionId, params!),
    enabled: params !== null,
    placeholderData: keepPreviousData,
  })
}

/** Comandos que mudam a estrutura do banco: a lista de tabelas precisa ser recarregada. */
const STRUCTURE_CHANGES = /\b(create|alter|drop|rename|truncate|comment|grant|revoke|vacuum|analyze)\b/i

export function useRunQuery(connectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sql: string) => databaseApi.query(connectionId, sql),
    onSuccess: (_result, sql) => {
      void queryClient.invalidateQueries({ queryKey: ['rows', connectionId] })
      if (STRUCTURE_CHANGES.test(sql)) {
        void queryClient.invalidateQueries({ queryKey: databaseKeys.tables(connectionId) })
        void queryClient.invalidateQueries({ queryKey: databaseKeys.schemas(connectionId) })
        void queryClient.invalidateQueries({ queryKey: ['columns', connectionId] })
        // create/alter/drop policy e enable/disable row level security
        void queryClient.invalidateQueries({ queryKey: ['policies', connectionId] })
        void queryClient.invalidateQueries({ queryKey: ['roles', connectionId] })
        void queryClient.invalidateQueries({ queryKey: ['schema-graph', connectionId] })
        void queryClient.invalidateQueries({ queryKey: ['structure', connectionId] })
        void queryClient.invalidateQueries({ queryKey: databaseKeys.enums(connectionId) })
        void queryClient.invalidateQueries({ queryKey: ['advisors', connectionId] })
      }
    },
  })
}

export function useSavedQueries(connectionId: string) {
  return useQuery({ queryKey: databaseKeys.savedQueries(connectionId), queryFn: () => databaseApi.savedQueries(connectionId) })
}

/** Depois de qualquer escrita: recarrega as linhas e a contagem das tabelas. */
function useInvalidateRows(connectionId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['rows', connectionId] })
    void queryClient.invalidateQueries({ queryKey: databaseKeys.tables(connectionId) })
  }
}

export function useDeleteRows(connectionId: string, schema: string, table: string) {
  const invalidate = useInvalidateRows(connectionId)
  return useMutation({
    mutationFn: (keys: Row[]) => databaseApi.deleteRows(connectionId, schema, table, keys),
    onSuccess: invalidate,
  })
}

export function useInsertRow(connectionId: string, schema: string, table: string) {
  const invalidate = useInvalidateRows(connectionId)
  return useMutation({
    mutationFn: ({ values, hash }: { values: Row; hash?: string[] }) => databaseApi.insertRow(connectionId, schema, table, values, hash),
    onSuccess: invalidate,
  })
}

export function useUpdateRow(connectionId: string, schema: string, table: string) {
  const invalidate = useInvalidateRows(connectionId)
  return useMutation({
    mutationFn: ({ key, changes, hash }: { key: Row; changes: Row; hash?: string[] }) =>
      databaseApi.updateRow(connectionId, schema, table, key, changes, hash),
    onSuccess: invalidate,
  })
}

export function useSaveQuery(connectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id?: string; title: string; sql: string }) => databaseApi.saveQuery(connectionId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: databaseKeys.savedQueries(connectionId) }),
  })
}

export function useEnums(connectionId: string) {
  return useQuery({ queryKey: databaseKeys.enums(connectionId), queryFn: () => databaseApi.enums(connectionId) })
}

export function useSchemas(connectionId: string) {
  return useQuery({ queryKey: databaseKeys.schemas(connectionId), queryFn: () => databaseApi.schemas(connectionId) })
}

export function useColumns(connectionId: string, schema: string | undefined, table: string | undefined) {
  return useQuery({
    queryKey: databaseKeys.columns(connectionId, schema ?? '', table ?? ''),
    queryFn: () => databaseApi.columns(connectionId, schema!, table!),
    enabled: Boolean(schema && table),
  })
}

export function useCreateTable(connectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTableInput) => databaseApi.createTable(connectionId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: databaseKeys.tables(connectionId) })
      void queryClient.invalidateQueries({ queryKey: databaseKeys.schemas(connectionId) })
    },
  })
}

export function useStructure(connectionId: string, schema: string, table: string) {
  return useQuery({
    queryKey: databaseKeys.structure(connectionId, schema, table),
    queryFn: () => databaseApi.structure(connectionId, schema, table),
  })
}

/** Depois de mudar a estrutura, tudo que depende dela é recarregado. */
/** A chave de cache se refere a essa tabela? (structure/columns: [k, id, schema, table] · rows: [k, id, { schema, table }]) */
function refersToTable(key: readonly unknown[], schema: string, table: string) {
  if (key[2] === schema && key[3] === table) return true
  const params = key[2] as { schema?: string; table?: string } | undefined
  return typeof params === 'object' && params?.schema === schema && params?.table === table
}

/**
 * Depois de mudar a estrutura, tudo que depende dela é recarregado.
 * `gone`: tabela que deixou de existir com esse nome (renomeada/movida/excluída) —
 * as consultas dela não são recarregadas (dariam 404); o cache some sozinho quando a tela fecha.
 */
export function useInvalidateStructure(connectionId: string) {
  const queryClient = useQueryClient()
  return (gone?: { schema: string; table: string }) => {
    return Promise.all(
      ['structure', 'columns', 'rows', 'tables', 'policies', 'schema-graph', 'enums'].map((key) =>
        queryClient.invalidateQueries({
          queryKey: [key, connectionId],
          predicate: (q) => !gone || !refersToTable(q.queryKey, gone.schema, gone.table),
        }),
      ),
    )
  }
}

/**
 * Prévia do SQL de uma alteração (dryRun no server), com debounce.
 * `input` precisa ser serializável — vira parte da chave do cache.
 */
export function useDdlPreview<T>(key: string, input: T | null, fetcher: (input: T) => Promise<{ sql: string }>) {
  return useQuery({
    queryKey: ['ddl-preview', key, input],
    queryFn: () => fetcher(input as T),
    enabled: input !== null,
    retry: false,
    placeholderData: (prev) => prev,
    staleTime: 0,
  })
}

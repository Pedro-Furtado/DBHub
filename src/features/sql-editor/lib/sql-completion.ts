import type { GraphTable } from '@/features/schema/api/schema-api'
import { monaco } from '@/lib/monaco/setup'

const KEYWORDS = [
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike', 'between', 'exists',
  'insert into', 'values', 'update', 'set', 'delete from', 'returning', 'join', 'left join', 'right join', 'inner join',
  'full join', 'on', 'using', 'group by', 'order by', 'having', 'limit', 'offset', 'distinct', 'as', 'case', 'when',
  'then', 'else', 'end', 'union all', 'with', 'create table', 'alter table', 'drop table', 'add column', 'create index',
  'begin', 'commit', 'rollback', 'explain analyze', 'asc', 'desc', 'nulls last', 'true', 'false', 'coalesce', 'count',
  'sum', 'avg', 'min', 'max', 'now()', 'current_date', 'gen_random_uuid()', 'jsonb_build_object', 'string_agg', 'array_agg',
]

/** Schema atual da conexão aberta — o provider é global, então lê daqui. */
let tables: GraphTable[] = []
export const setCompletionSchema = (next: GraphTable[]) => {
  tables = next
}

let registered = false

/**
 * Autocomplete do SQL Editor:
 * - depois de "tabela." ou "alias." → colunas daquela tabela (resolve aliases do FROM/JOIN);
 * - fora disso → tabelas, colunas e palavras-chave.
 */
export function registerSqlCompletion() {
  if (registered) return
  registered = true

  monaco.languages.registerCompletionItemProvider('pgsql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn))
      const K = monaco.languages.CompletionItemKind

      // alias → tabela, a partir de "from tabela alias" / "join schema.tabela as alias"
      const text = model.getValue()
      const aliases = new Map<string, GraphTable>()
      for (const m of text.matchAll(/\b(?:from|join)\s+([\w."]+)(?:\s+(?:as\s+)?(\w+))?/gi)) {
        const ref = m[1]!.replace(/"/g, '')
        const table = tables.find((t) => `${t.schema}.${t.name}` === ref || t.name === ref)
        if (!table) continue
        aliases.set(table.name, table)
        if (m[2] && !/^(where|on|join|left|right|inner|full|group|order|limit|using|set)$/i.test(m[2])) aliases.set(m[2], table)
      }

      const dotted = before.match(/([\w"]+)\.$/)
      if (dotted) {
        const name = dotted[1]!.replace(/"/g, '')
        const table = aliases.get(name) ?? tables.find((t) => t.name === name)
        if (table) {
          return {
            suggestions: table.columns.map((c) => ({
              label: c.name,
              kind: c.isPrimaryKey ? K.Property : K.Field,
              detail: c.type,
              insertText: c.name,
              range,
              sortText: `0${c.name}`,
            })),
          }
        }
        // "public." → tabelas do schema
        const inSchema = tables.filter((t) => t.schema === name)
        return {
          suggestions: inSchema.map((t) => ({ label: t.name, kind: K.Struct, detail: `${t.kind} · ${t.columns.length} colunas`, insertText: t.name, range })),
        }
      }

      const inScope = [...new Set(aliases.values())]
      const columnSource = inScope.length ? inScope : tables
      const seen = new Set<string>()
      const columns = columnSource.flatMap((t) =>
        t.columns
          .filter((c) => !seen.has(c.name) && seen.add(c.name))
          .map((c) => ({ label: c.name, kind: K.Field, detail: `${t.name} · ${c.type}`, insertText: c.name, range, sortText: `1${c.name}` })),
      )

      return {
        suggestions: [
          ...tables.map((t) => ({
            label: t.schema === 'public' ? t.name : `${t.schema}.${t.name}`,
            kind: K.Struct,
            detail: `${t.kind === 'view' ? 'view' : 'tabela'} · ${t.columns.length} colunas`,
            insertText: t.schema === 'public' ? t.name : `${t.schema}.${t.name}`,
            range,
            sortText: `2${t.name}`,
          })),
          ...columns,
          ...KEYWORDS.map((k) => ({ label: k, kind: K.Keyword, insertText: k, range, sortText: `3${k}` })),
          {
            label: 'select * from …',
            kind: K.Snippet,
            insertText: 'select *\nfrom ${1:tabela}\nlimit ${2:100};',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: '4',
          },
        ],
      }
    },
  })
}

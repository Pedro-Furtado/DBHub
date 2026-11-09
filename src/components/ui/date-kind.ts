export type DateKind = 'date' | 'timestamp' | 'timestamptz' | 'time'

/** Que tipo de seletor usar para o tipo Postgres (format_type). Arrays e outros: null. */
export function dateKindOf(type?: string): DateKind | null {
  if (!type || type.endsWith('[]')) return null
  if (type === 'date') return 'date'
  if (/^timestamp(\(\d\))? with time zone$|^timestamptz$/.test(type)) return 'timestamptz'
  if (/^timestamp/.test(type)) return 'timestamp'
  if (/^time(\(\d\))?( without time zone)?$/.test(type)) return 'time'
  return null
}

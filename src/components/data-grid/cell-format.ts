/** Converte o valor vindo da API em texto editável (o Postgres converte de volta pelo tipo da coluna). */
export function toEditString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export const isBooleanType = (type?: string) => type === 'boolean' || type === 'bool'
export const isJsonType = (type?: string) => type === 'json' || type === 'jsonb'

/** Colunas de texto (as únicas onde faz sentido salvar hash de senha). */
export const isTextType = (type?: string) => Boolean(type && /^(text|character varying|varchar|character|char|bpchar|citext)\b/.test(type) && !type.endsWith('[]'))

/** Nome com cara de senha: o hash já vem ligado nessas colunas. */
export const looksLikeSecretColumn = (name: string) => /(senha|password|passwd|pwd|secret|segredo)/i.test(name)

/** Valor já está em bcrypt ($2a$/$2b$/$2y$) — o server não refaz o hash. */
export const isBcryptHash = (value: unknown) => typeof value === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value)

/** Valida antes de mandar para o server (erros comuns, mensagem amigável). */
export function validateEditValue(text: string, type?: string): string | null {
  if (isJsonType(type) && text.trim()) {
    try {
      JSON.parse(text)
    } catch {
      return 'JSON inválido'
    }
  }
  return null
}

import bcrypt from 'bcryptjs'
import { badRequest } from './errors.ts'

/**
 * Hash de senha no padrão bcrypt ($2b$, custo 10) — o mesmo formato que
 * bcrypt/bcryptjs (Node), password_hash (PHP), Devise (Rails) e Spring Security verificam.
 */
const COST = 10
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

export const isBcryptHash = (value: string) => BCRYPT.test(value)

/** Aplica hash nas colunas pedidas. Valor já em bcrypt não é refeito; null continua null. */
export async function hashColumns<T extends Record<string, unknown>>(values: T, columns: string[] | undefined): Promise<T> {
  if (!columns?.length) return values
  const result: Record<string, unknown> = { ...values }
  for (const column of columns) {
    const value = result[column]
    if (value === null || value === undefined) continue
    if (typeof value !== 'string') throw badRequest(`A coluna ${column} precisa de texto para gerar o hash`, 'HASH_NOT_TEXT')
    if (value === '') throw badRequest(`A senha da coluna ${column} está vazia`, 'HASH_EMPTY')
    // bcrypt só considera os primeiros 72 bytes: acima disso, recusa em vez de truncar calado
    if (Buffer.byteLength(value, 'utf8') > 72) throw badRequest(`A senha da coluna ${column} passa de 72 bytes (limite do bcrypt)`, 'HASH_TOO_LONG')
    if (!isBcryptHash(value)) result[column] = await bcrypt.hash(value, COST)
  }
  return result as T
}

import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { env } from '../config/env.ts'

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>
/** 32 bytes em base64 são usados direto (compatível com instalações antigas); qualquer outro segredo vira chave via SHA-256. */
function deriveKey(secret: string) {
  const raw = Buffer.from(secret, 'base64')
  return raw.length === 32 && /^[A-Za-z0-9+/]{43}=?$/.test(secret) ? raw : createHash('sha256').update(secret, 'utf8').digest()
}
const key = deriveKey(env.ENCRYPTION_KEY)

/**
 * AES-256-GCM: confidencialidade + integridade.
 * Formato salvo: v1:<iv>:<authTag>:<ciphertext> (base64) — o prefixo permite trocar
 * o algoritmo/chave no futuro sem quebrar o que já está salvo.
 */
export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':')
}

export function decrypt(payload: string) {
  const [version, iv, tag, data] = payload.split(':')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato de dado criptografado inválido')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

/** Hash de senha com scrypt (nativo do Node, sem dependência binária). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password.normalize('NFKC'), salt, 64)
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, salt, hash] = stored.split(':')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

/** Token aleatório para sessão; no banco guardamos só o SHA-256 dele. */
export const generateToken = () => randomBytes(32).toString('base64url')
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

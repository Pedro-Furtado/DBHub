import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../config/env.ts'
import { createLogger } from '../lib/logger.ts'
import * as schema from './schema.ts'

const log = createLogger('db')

/** Pool do banco interno do DBHub (não confundir com os bancos externos). */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'dbhub',
})

pool.on('error', (err) => log.error({ err }, 'Erro inesperado no pool do banco interno'))

export const db = drizzle(pool, { schema, casing: 'snake_case' })
export type Db = typeof db

import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { connections } from '../../db/schema.ts'

export type ConnectionRow = typeof connections.$inferSelect
export type NewConnectionRow = typeof connections.$inferInsert

/** Acesso ao banco interno — sem regra de negócio aqui. */
export const connectionsRepository = {
  list: () => db.select().from(connections).orderBy(desc(connections.lastUsedAt), desc(connections.createdAt)),

  findById: async (id: string) => {
    const [row] = await db.select().from(connections).where(eq(connections.id, id)).limit(1)
    return row
  },

  create: async (data: NewConnectionRow) => {
    const [row] = await db.insert(connections).values(data).returning()
    return row!
  },

  update: async (id: string, data: Partial<NewConnectionRow>) => {
    const [row] = await db.update(connections).set(data).where(eq(connections.id, id)).returning()
    return row
  },

  remove: async (id: string) => {
    const [row] = await db.delete(connections).where(eq(connections.id, id)).returning({ id: connections.id })
    return row
  },

  touch: (id: string) => db.update(connections).set({ lastUsedAt: new Date() }).where(eq(connections.id, id)),
}

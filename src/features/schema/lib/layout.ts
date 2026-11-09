import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { GraphTable } from '../api/schema-api'

export const NODE_WIDTH = 260
const HEADER = 40
const ROW = 26

export type TableNodeData = { table: GraphTable; highlighted: boolean; dimmed: boolean }
export type TableNode = Node<TableNodeData, 'table'>

export const tableId = (t: { schema: string; name?: string; table?: string }) => `${t.schema}.${t.name ?? t.table}`

/** Layout automático (esquerda → direita): tabelas referenciadas ficam à direita de quem aponta para elas. */
export function buildGraph(tables: GraphTable[], focus: string) {
  const term = focus.trim().toLowerCase()
  const ids = new Set(tables.map(tableId))

  const edges: Edge[] = []
  for (const t of tables) {
    for (const c of t.columns) {
      if (!c.references) continue
      const target = tableId(c.references)
      if (!ids.has(target)) continue
      edges.push({
        id: `${tableId(t)}.${c.name}->${target}.${c.references.column}`,
        source: tableId(t),
        sourceHandle: `${c.name}-source`,
        target,
        targetHandle: `${c.references.column}-target`,
        type: 'smoothstep',
        animated: false,
      })
    }
  }

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 120, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const t of tables) g.setNode(tableId(t), { width: NODE_WIDTH, height: HEADER + t.columns.length * ROW })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)

  const nodes: TableNode[] = tables.map((t) => {
    const pos = g.node(tableId(t))
    const match = term && tableId(t).toLowerCase().includes(term)
    return {
      id: tableId(t),
      type: 'table',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - (HEADER + t.columns.length * ROW) / 2 },
      data: { table: t, highlighted: Boolean(match), dimmed: Boolean(term) && !match },
    }
  })
  return { nodes, edges }
}

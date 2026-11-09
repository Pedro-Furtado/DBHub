import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { LayoutGrid, Network, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useSchemas } from '@/features/database/hooks/use-database'
import { useConnectionId } from '@/hooks/use-connection-id'
import { useSchemaGraph } from '../api/schema-api'
import { TableNodeCard } from '../components/table-node'
import { buildGraph } from '../lib/layout'

const nodeTypes: NodeTypes = { table: TableNodeCard }
const ALL = '__all__'

export function SchemaPage() {
  return (
    <ReactFlowProvider>
      <SchemaCanvas />
    </ReactFlowProvider>
  )
}

function SchemaCanvas() {
  const connectionId = useConnectionId()
  const schemas = useSchemas(connectionId)
  const [schema, setSchema] = useState('public')
  const [search, setSearch] = useState('')
  const graph = useSchemaGraph(connectionId, schema === ALL ? undefined : schema)
  const { fitView } = useReactFlow()

  const layout = useMemo(() => buildGraph(graph.data ?? [], search), [graph.data, search])
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges)

  // Novo dado/busca: aplica o layout calculado (o usuário ainda pode arrastar as tabelas)
  useEffect(() => {
    setNodes(layout.nodes)
    setEdges(layout.edges)
    // Com busca, aproxima nas tabelas encontradas; sem busca, mostra tudo
    const matches = layout.nodes.filter((n) => n.data.highlighted).map((n) => ({ id: n.id }))
    requestAnimationFrame(() => void fitView({ nodes: matches.length ? matches : undefined, padding: matches.length ? 0.6 : 0.15, maxZoom: 1, duration: 300 }))
  }, [layout, setNodes, setEdges, fitView])

  const relations = layout.edges.length

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Network className="size-4 text-primary" />
        <h1 className="text-sm font-medium">Schema Visualizer</h1>
        <Select value={schema} onValueChange={setSchema}>
          <SelectTrigger size="sm" className="ml-2 h-8 w-40 text-xs" aria-label="Schema">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os schemas</SelectItem>
            {(schemas.data ?? ['public']).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input icon={<Search />} placeholder="Destacar tabela…" className="h-8 text-xs" containerClassName="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        {graph.data && (
          <Badge variant="secondary">
            {graph.data.length} tabelas · {relations} {relations === 1 ? 'relação' : 'relações'}
          </Badge>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setNodes(buildGraph(graph.data ?? [], search).nodes)}>
          <LayoutGrid /> Reorganizar
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        {graph.isLoading ? (
          <div className="grid h-full place-items-center">
            <Skeleton className="h-64 w-96 rounded-xl" />
          </div>
        ) : !graph.data?.length ? (
          <div className="grid h-full place-items-center p-6">
            <EmptyState icon={<Network />} title="Nenhuma tabela neste schema" />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
            minZoom={0.1}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ style: { stroke: 'var(--primary)', strokeWidth: 1.5, opacity: 0.7 } }}
            nodesConnectable={false}
            className="dbhub-flow"
          >
            <Background gap={20} size={1} color="var(--border)" />
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap pannable zoomable position="bottom-left" nodeColor="var(--muted)" maskColor="rgb(0 0 0 / 0.5)" />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}

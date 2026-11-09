import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Eye, KeyRound, Link2, Table2 } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import type { TableNode } from '../lib/layout'

/** Card de tabela no diagrama: uma linha por coluna, com "pontos" de conexão para as chaves estrangeiras. */
export const TableNodeCard = memo(function TableNodeCard({ data }: NodeProps<TableNode>) {
  const { table, highlighted, dimmed } = data
  return (
    <div
      className={cn(
        'w-[260px] overflow-hidden rounded-lg border bg-card text-card-foreground shadow-md transition-opacity',
        highlighted && 'border-primary ring-2 ring-primary/30',
        dimmed && 'opacity-30',
      )}
    >
      <div className="flex h-10 items-center gap-2 border-b bg-muted/60 px-3">
        {table.kind === 'view' ? <Eye className="size-3.5 text-muted-foreground" /> : <Table2 className="size-3.5 text-primary" />}
        <Link
          to={`../tables/${table.schema}/${table.name}`}
          relative="path"
          className="nodrag truncate text-sm font-semibold hover:text-primary"
          title="Abrir no Table Editor"
        >
          {table.name}
        </Link>
        <span className="ml-auto truncate text-[10px] text-muted-foreground">{table.schema}</span>
      </div>
      <ul>
        {table.columns.map((c) => (
          <li key={c.name} className="relative flex h-[26px] items-center gap-1.5 border-b px-3 text-xs last:border-b-0">
            {/* destino de FKs que apontam para esta coluna */}
            <Handle type="target" position={Position.Left} id={`${c.name}-target`} className="!size-1.5 !min-w-0 !border-0 !bg-primary/60" />
            {c.isPrimaryKey ? (
              <KeyRound className="size-3 shrink-0 text-warning" />
            ) : c.references ? (
              <Link2 className="size-3 shrink-0 text-primary" />
            ) : (
              <span className="size-3 shrink-0" />
            )}
            <span className={cn('truncate font-mono', c.isPrimaryKey && 'font-semibold')}>{c.name}</span>
            <span className="ml-auto truncate pl-2 font-mono text-[10px] text-muted-foreground">
              {c.type}
              {!c.nullable && !c.isPrimaryKey && ' *'}
            </span>
            <Handle type="source" position={Position.Right} id={`${c.name}-source`} className="!size-1.5 !min-w-0 !border-0 !bg-primary/60" />
          </li>
        ))}
      </ul>
    </div>
  )
})

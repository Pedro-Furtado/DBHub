import { Bot, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { useConnections } from '@/features/connections/hooks/use-connections'
import type { McpKey } from '../api/mcp-api'
import { useMcpKeys, useRevokeMcpKey } from '../hooks/use-mcp-keys'
import { mcpEndpoint, relativeTime } from '../lib/mcp-config'
import { CodeBlock, CreateMcpKeyDialog } from './create-mcp-key-dialog'

/** Configurações › MCP: endpoint + chaves de acesso para agentes de IA. */
export function McpSettingsCard() {
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<McpKey | null>(null)
  const keys = useMcpKeys()
  const revoke = useRevokeMcpKey()

  async function confirmRevoke() {
    if (!revoking) return
    try {
      await revoke.mutateAsync(revoking.id)
      toast.success(`Chave "${revoking.name}" revogada`)
      setRevoking(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível revogar')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-4 text-primary" /> MCP · agentes de IA
        </CardTitle>
        <CardDescription>
          Conecte o Claude (ou outro agente compatível com MCP) ao DBHub para consultar e gerenciar os bancos cadastrados — inclusive de clientes — sem dar acesso ao Railway deles.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> Nova chave
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-5">
        <CodeBlock label="URL do servidor MCP" value={mcpEndpoint()} />

        <div className="grid gap-2">
          <Label>Chaves de acesso</Label>
          {keys.isLoading ? (
            <Skeleton className="h-16" />
          ) : keys.data?.length ? (
            <ul className="divide-y rounded-md border">
              {keys.data.map((key) => (
                <KeyRow key={key.id} mcpKey={key} onRevoke={() => setRevoking(key)} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<KeyRound />} title="Nenhuma chave ainda" description="Gere uma chave e cole no seu agente junto com a URL acima." className="rounded-md border py-8" />
          )}
        </div>
      </CardContent>

      <CreateMcpKeyDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revogar chave?"
        description={
          <>
            Agentes usando <strong>{revoking?.name}</strong> perdem o acesso na hora. Não dá para desfazer.
          </>
        }
        confirmLabel="Revogar"
        destructive
        loading={revoke.isPending}
        onConfirm={() => void confirmRevoke()}
      />
    </Card>
  )
}

function KeyRow({ mcpKey, onRevoke }: { mcpKey: McpKey; onRevoke: () => void }) {
  const connections = useConnections()
  const scope = mcpKey.connectionIds
    ? mcpKey.connectionIds.map((id) => connections.data?.find((c) => c.id === id)?.name ?? 'conexão removida')
    : null

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <KeyRound className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{mcpKey.name}</span>
          <Badge variant={mcpKey.access === 'write' ? 'warning' : 'secondary'}>{mcpKey.access === 'write' ? 'leitura e escrita' : 'somente leitura'}</Badge>
          {scope ? (
            <Tooltip content={scope.join(', ')}>
              <Badge variant="outline">
                {scope.length} {scope.length === 1 ? 'conexão' : 'conexões'}
              </Badge>
            </Tooltip>
          ) : (
            <Badge variant="outline">todas as conexões</Badge>
          )}
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {mcpKey.prefix}… · criada {relativeTime(mcpKey.createdAt)} · último uso {relativeTime(mcpKey.lastUsedAt)}
        </p>
      </div>
      <Tooltip content="Revogar">
        <Button variant="ghost" size="icon-sm" aria-label={`Revogar ${mcpKey.name}`} onClick={onRevoke}>
          <Trash2 />
        </Button>
      </Tooltip>
    </li>
  )
}

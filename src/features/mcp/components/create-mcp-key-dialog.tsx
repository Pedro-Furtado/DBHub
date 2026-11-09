import { AlertTriangle, Check, Copy } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EnvironmentBadge } from '@/features/connections/components/environment-badge'
import { useConnections } from '@/features/connections/hooks/use-connections'
import { cn } from '@/lib/utils'
import type { McpAccess } from '../api/mcp-api'
import { useCreateMcpKey } from '../hooks/use-mcp-keys'
import { mcpSnippets } from '../lib/mcp-config'

type CreateMcpKeyDialogProps = { open: boolean; onOpenChange: (open: boolean) => void }

const accessOptions: { value: McpAccess; label: string }[] = [
  { value: 'read', label: 'Somente leitura' },
  { value: 'write', label: 'Leitura e escrita' },
]

/** Cria a chave e mostra uma única vez, com os trechos de configuração prontos. */
export function CreateMcpKeyDialog({ open, onOpenChange }: CreateMcpKeyDialogProps) {
  const [name, setName] = useState('')
  const [access, setAccess] = useState<McpAccess>('read')
  const [allConnections, setAllConnections] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [token, setToken] = useState<string | null>(null)
  const connections = useConnections()
  const createKey = useCreateMcpKey()

  const valid = name.trim().length > 0 && (allConnections || selected.length > 0)

  function close(next: boolean) {
    if (!next) {
      setName('')
      setAccess('read')
      setAllConnections(true)
      setSelected([])
      setToken(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    try {
      const created = await createKey.mutateAsync({ name: name.trim(), access, connectionIds: allConnections ? null : selected })
      setToken(created.token)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar a chave')
    }
  }

  const toggle = (id: string, checked: boolean) => setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>Chave criada</DialogTitle>
              <DialogDescription>Configure o agente com um dos formatos abaixo.</DialogDescription>
            </DialogHeader>
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Copie agora — ela não aparece de novo</AlertTitle>
              <AlertDescription>O DBHub guarda só uma impressão digital da chave. Se perder, revogue e crie outra.</AlertDescription>
            </Alert>
            <CodeBlock label="Chave" value={token} />
            <McpSnippets token={token} />
            <DialogFooter>
              <Button onClick={() => close(false)}>Concluído</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nova chave MCP</DialogTitle>
              <DialogDescription>Permite que um agente de IA (Claude, Cursor…) acesse os bancos pelo DBHub.</DialogDescription>
            </DialogHeader>
            <form id="mcp-key-form" onSubmit={handleSubmit} className="grid gap-5">
              <Field label="Nome" htmlFor="mcp-name" hint="Para reconhecer depois, ex.: Claude Code — notebook">
                <Input id="mcp-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Claude Code" />
              </Field>

              <div className="grid gap-2">
                <Label>Permissão</Label>
                <SegmentedControl aria-label="Permissão" value={access} onChange={setAccess} options={accessOptions} />
                <p className="text-xs text-muted-foreground">
                  {access === 'read'
                    ? 'Consulta estrutura e dados; qualquer SQL roda em transação somente leitura.'
                    : 'Também cria/altera tabelas, enums e dados. Conexões marcadas como somente leitura continuam protegidas.'}
                </p>
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="mcp-all" className="flex-col items-start gap-0.5">
                    Todas as conexões
                    <span className="text-xs font-normal text-muted-foreground">Inclui as que forem adicionadas no futuro</span>
                  </Label>
                  <Switch id="mcp-all" checked={allConnections} onCheckedChange={setAllConnections} />
                </div>
                {!allConnections && (
                  <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-1">
                    {(connections.data ?? []).map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-accent/50">
                        <Checkbox checked={selected.includes(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} aria-label={c.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{c.name}</span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">
                            {c.host}/{c.database}
                          </span>
                        </span>
                        <EnvironmentBadge environment={c.environment} />
                      </label>
                    ))}
                    {connections.data?.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nenhuma conexão cadastrada.</p>}
                  </div>
                )}
              </div>
            </form>
            <DialogFooter>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="mcp-key-form" disabled={!valid} loading={createKey.isPending}>
                Gerar chave
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Abas com os formatos de configuração dos clientes MCP. */
export function McpSnippets({ token }: { token: string }) {
  const s = mcpSnippets(token)
  return (
    <Tabs defaultValue="claude-code" className="min-w-0">
      <TabsList>
        <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
        <TabsTrigger value="json">JSON (Cursor, Claude Desktop…)</TabsTrigger>
        <TabsTrigger value="url">Só URL</TabsTrigger>
      </TabsList>
      <TabsContent value="claude-code">
        <CodeBlock value={s.claudeCode} />
      </TabsContent>
      <TabsContent value="json">
        <CodeBlock value={s.json} />
      </TabsContent>
      <TabsContent value="url" className="grid gap-2">
        <CodeBlock value={s.urlWithKey} />
        <p className="text-xs text-muted-foreground">Para clientes que não deixam enviar cabeçalho. A chave fica na própria URL — trate a URL como senha.</p>
      </TabsContent>
    </Tabs>
  )
}

export function CodeBlock({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="grid min-w-0 gap-1.5">
      {label && <Label>{label}</Label>}
      <div className="relative rounded-md border bg-sidebar">
        <pre className={cn('overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed', !value.includes('\n') && 'whitespace-pre-wrap break-all')}>{value}</pre>
        <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1.5 top-1.5" aria-label="Copiar" onClick={() => void copy()}>
          {copied ? <Check className="text-primary" /> : <Copy />}
        </Button>
      </div>
    </div>
  )
}

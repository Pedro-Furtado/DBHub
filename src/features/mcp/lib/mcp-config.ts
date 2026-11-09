/** URL pública do endpoint MCP — mesma origem do painel (em dev o Vite repassa /mcp para o server). */
export const mcpEndpoint = () => `${window.location.origin}/mcp`

/** Trechos prontos para colar nos clientes de agentes mais comuns. */
export function mcpSnippets(token: string) {
  const url = mcpEndpoint()
  return {
    claudeCode: `claude mcp add --transport http dbhub ${url} --header "Authorization: Bearer ${token}"`,
    json: JSON.stringify({ mcpServers: { dbhub: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    /** Para clientes que só aceitam URL (sem cabeçalho), ex.: conectores personalizados */
    urlWithKey: `${url}/${token}`,
  }
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function relativeTime(iso: string | null) {
  if (!iso) return 'nunca'
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Infinity],
  ]
  let value = diff
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit)
    value /= size
  }
  return ''
}

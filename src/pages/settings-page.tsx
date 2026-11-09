import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { McpSettingsCard } from '@/features/mcp/components/mcp-settings-card'

export function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <PageHeader title="Configurações" description="Preferências do painel." />
      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
          <CardDescription>Proteções aplicadas em todas as conexões.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SettingRow id="confirm-destructive" label="Confirmar comandos destrutivos" hint="DROP, TRUNCATE e DELETE/UPDATE sem WHERE" defaultChecked />
          <SettingRow id="prod-readonly" label="Novas conexões de produção começam em somente leitura" defaultChecked={false} />
        </CardContent>
      </Card>
      <McpSettingsCard />
    </div>
  )
}

function SettingRow({ id, label, hint, defaultChecked }: { id: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="flex-col items-start gap-1">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      <Switch id={id} defaultChecked={defaultChecked} />
    </div>
  )
}

import { ChevronsUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type RolesPickerProps = {
  id?: string
  roles: string[]
  value: string[]
  onChange: (roles: string[]) => void
}

/** Seleção múltipla de roles. "public" = todos os roles. */
export function RolesPicker({ id, roles, value, onChange }: RolesPickerProps) {
  function toggle(role: string) {
    if (role === 'public') return onChange(['public'])
    const next = value.filter((r) => r !== 'public')
    onChange(next.includes(role) ? next.filter((r) => r !== role) : [...next, role])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="h-auto min-h-9 w-full justify-between py-1.5 font-normal">
          <span className="flex flex-wrap gap-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground">Escolha os roles</span>
            ) : (
              value.map((r) => (
                <Badge key={r} variant="secondary" className="font-mono">
                  {r === 'public' ? 'public (todos)' : r}
                </Badge>
              ))
            )}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1">
        <div className="max-h-64 overflow-y-auto">
          {roles.map((role) => (
            <label key={role} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox checked={value.includes(role)} onCheckedChange={() => toggle(role)} />
              <span className="font-mono text-xs">{role}</span>
              {role === 'public' && <span className="ml-auto text-xs text-muted-foreground">todos os roles</span>}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

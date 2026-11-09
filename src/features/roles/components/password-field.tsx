import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { CopyButton } from '@/components/shared/copy-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { generatePassword } from '../lib/password'

/** Campo de senha com gerar, mostrar/ocultar e copiar. */
export function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [visible, setVisible] = useState(true)
  return (
    <div className="flex items-center gap-1">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        spellCheck={false}
        className="font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Tooltip content="Gerar senha forte">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Gerar senha" onClick={() => onChange(generatePassword())}>
          <RefreshCw />
        </Button>
      </Tooltip>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible((v) => !v)}>
        {visible ? <EyeOff /> : <Eye />}
      </Button>
      {value && <CopyButton value={value} label="Copiar senha" />}
    </div>
  )
}

import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { Input } from './input'

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'icon'>

/** Campo de senha com o "olhinho" para mostrar/ocultar o que foi digitado. */
export function PasswordInput({ className, containerClassName, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const label = visible ? 'Ocultar' : 'Mostrar'

  return (
    <div className={cn('relative w-full', containerClassName)}>
      <Input type={visible ? 'text' : 'password'} disabled={disabled} className={cn('pr-10', className)} {...props} />
      <button
        type="button"
        aria-label={label}
        aria-pressed={visible}
        title={label}
        disabled={disabled}
        // Não tira o foco do campo ao clicar no olhinho
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  )
}

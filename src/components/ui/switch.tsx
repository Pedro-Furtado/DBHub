import { cva, type VariantProps } from 'class-variance-authority'
import { Switch as SwitchPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/*
 * Medidas pensadas para o thumb andar a mesma distância dos dois lados:
 * trilho com padding de 2px → largura interna − thumb = deslocamento exato.
 *   default: trilho 36×20, thumb 16 → anda 16px
 *   sm:      trilho 28×16, thumb 12 → anda 12px
 */
const switchVariants = cva(
  'peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 shadow-inner outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input hover:data-[state=unchecked]:bg-muted-foreground/40 dark:data-[state=unchecked]:bg-muted-foreground/25',
  {
    variants: {
      size: {
        default: 'h-5 w-9',
        sm: 'h-4 w-7',
      },
    },
    defaultVariants: { size: 'default' },
  },
)

const thumbVariants = cva(
  'pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-out data-[state=unchecked]:translate-x-0',
  {
    variants: {
      size: {
        default: 'size-4 data-[state=checked]:translate-x-4',
        sm: 'size-3 data-[state=checked]:translate-x-3',
      },
    },
    defaultVariants: { size: 'default' },
  },
)

type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & VariantProps<typeof switchVariants>

export function Switch({ className, size, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn(switchVariants({ size }), className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className={thumbVariants({ size })} />
    </SwitchPrimitive.Root>
  )
}

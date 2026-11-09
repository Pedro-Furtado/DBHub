import { cva, type VariantProps } from 'class-variance-authority'
import { Check, Minus } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/*
 * Checkbox do design system — usa só tokens do tema (primary, input, ring),
 * então acompanha qualquer mudança de cor em globals.css.
 * Estados: desmarcado · marcado · indeterminado ("alguns selecionados").
 */
const checkboxVariants = cva(
  [
    'peer group/checkbox inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-input bg-background shadow-xs outline-none',
    'transition-[background-color,border-color,box-shadow] duration-150',
    'hover:border-primary/60 dark:bg-input/30',
    'focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
    'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
    // no tema escuro o fundo padrão (bg-input/30) tem a mesma especificidade — reforça o estado marcado
    'dark:data-[state=checked]:bg-primary dark:data-[state=indeterminate]:bg-primary',
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
  ],
  {
    variants: {
      size: {
        sm: 'size-3.5 rounded-[4px] [&_svg]:size-2.5',
        default: 'size-4 [&_svg]:size-3',
        lg: 'size-5 rounded-md [&_svg]:size-3.5',
      },
    },
    defaultVariants: { size: 'default' },
  },
)

type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root> & VariantProps<typeof checkboxVariants>

export function Checkbox({ className, size, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root data-slot="checkbox" className={cn(checkboxVariants({ size }), className)} {...props}>
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current data-[state=checked]:animate-in data-[state=checked]:zoom-in-50 data-[state=indeterminate]:animate-in data-[state=indeterminate]:zoom-in-50"
      >
        <Check strokeWidth={3.5} className="hidden group-data-[state=checked]/checkbox:block" />
        <Minus strokeWidth={3.5} className="hidden group-data-[state=indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

import { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

/**
 * Conteúdo do popover que nunca sai da tela: troca de lado/desliza quando falta espaço
 * (collisionPadding) e, se ainda assim não couber, limita a altura/largura e rola por dentro.
 */
export function PopoverContent({ className, align = 'center', sideOffset = 6, collisionPadding = 8, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-50 max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain w-72 origin-(--radix-popover-content-transform-origin) rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

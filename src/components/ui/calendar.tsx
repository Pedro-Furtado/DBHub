import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ComponentProps } from 'react'
import { DayPicker, getDefaultClassNames } from 'react-day-picker'
import { ptBR } from 'react-day-picker/locale'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button-variants'

type CalendarProps = ComponentProps<typeof DayPicker>

/** Calendário no padrão shadcn (react-day-picker v9), em pt-BR e com o tema do DBHub. */
export function Calendar({ className, classNames, showOutsideDays = true, captionLayout = 'dropdown', ...props }: CalendarProps) {
  const d = getDefaultClassNames()
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn('p-3 [--cell-size:2rem]', className)}
      classNames={{
        root: cn('w-fit', d.root),
        months: cn('relative flex flex-col gap-4', d.months),
        month: cn('flex w-full flex-col gap-4', d.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', d.nav),
        button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'size-(--cell-size) select-none aria-disabled:opacity-50', d.button_previous),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'size-(--cell-size) select-none aria-disabled:opacity-50', d.button_next),
        month_caption: cn('flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)', d.month_caption),
        dropdowns: cn('flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium', d.dropdowns),
        dropdown_root: cn('relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50', d.dropdown_root),
        dropdown: cn('absolute inset-0 bg-popover opacity-0', d.dropdown),
        caption_label: cn(
          'select-none font-medium',
          captionLayout === 'label' ? 'text-sm' : 'flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          d.caption_label,
        ),
        month_grid: 'w-full border-collapse',
        weekdays: cn('flex', d.weekdays),
        weekday: cn('flex-1 select-none rounded-md text-[0.8rem] font-normal text-muted-foreground', d.weekday),
        week: cn('mt-1 flex w-full', d.week),
        day: cn('group/day relative aspect-square h-full w-full select-none p-0 text-center', d.day),
        today: cn('rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none', d.today),
        outside: cn('text-muted-foreground aria-selected:text-muted-foreground', d.outside),
        disabled: cn('text-muted-foreground opacity-50', d.disabled),
        hidden: cn('invisible', d.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cls, ...rest }) => {
          const Icon = orientation === 'left' ? ChevronLeft : orientation === 'right' ? ChevronRight : ChevronDown
          return <Icon className={cn('size-4', cls)} {...rest} />
        },
        DayButton: ({ day, modifiers, className: cls, ...rest }) => (
          <button
            data-day={day.date.toLocaleDateString('pt-BR')}
            data-selected={modifiers.selected}
            className={cn(
              'flex aspect-square size-auto w-full min-w-(--cell-size) items-center justify-center rounded-md text-sm font-normal leading-none transition-colors',
              'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              'data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:hover:bg-primary/90',
              modifiers.outside && 'text-muted-foreground',
              cls,
            )}
            {...rest}
          />
        ),
      }}
      {...props}
    />
  )
}

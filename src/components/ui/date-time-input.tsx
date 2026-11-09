import { CalendarDays, Clock } from 'lucide-react'
import { useState } from 'react'
import { Button } from './button'
import { Calendar } from './calendar'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import type { DateKind } from './date-kind'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hms = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

/** Fuso do navegador no formato do Postgres, ex.: -03:00 */
function offset(d: Date) {
  const m = -d.getTimezoneOffset()
  return `${m >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`
}

/** Monta o texto que vai para o Postgres a partir do dia + hora escolhidos. */
function format(kind: DateKind, day: Date, time: string) {
  if (kind === 'date') return ymd(day)
  const [h = '00', m = '00', s = '00'] = time.split(':')
  const base = `${ymd(day)} ${pad(Number(h))}:${pad(Number(m))}:${pad(Number(s))}`
  if (kind === 'timestamp') return base
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(h), Number(m), Number(s))
  return `${base}${offset(at)}`
}

/** Lê o texto do campo de volta (aceita "2026-11-08", "2026-11-08 14:30", "…T14:30:00-03:00"). */
function parse(value: string): { day?: Date; time: string } {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return { time: '00:00:00' }
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = match
  return { day: new Date(Number(y), Number(mo) - 1, Number(d)), time: `${h}:${mi}:${s}` }
}

type DateTimeInputProps = {
  id?: string
  kind: DateKind
  value: string
  onChange: (value: string) => void
  placeholder?: string
  invalid?: boolean
}

/**
 * Campo de data/hora: dá para digitar (formato do Postgres) ou escolher no calendário.
 * timestamptz leva o fuso do navegador; time usa o seletor de hora nativo.
 */
export function DateTimeInput({ id, kind, value, onChange, placeholder, invalid }: DateTimeInputProps) {
  const [open, setOpen] = useState(false)
  const parsed = parse(value)
  const [time, setTime] = useState(parsed.time.slice(0, 5))
  const [browserOffset] = useState(() => offset(new Date()))

  if (kind === 'time') {
    return (
      <div className="relative">
        <Input id={id} type="time" step={1} className="pr-9 font-mono text-xs [&::-webkit-calendar-picker-indicator]:opacity-0" value={value} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />
        <Clock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    )
  }

  const pick = (day: Date | undefined, t = time) => {
    if (!day) return
    onChange(format(kind, day, t))
    if (kind === 'date') setOpen(false)
  }

  const now = () => {
    const d = new Date()
    setTime(hms(d).slice(0, 5))
    onChange(format(kind, d, hms(d)))
    setOpen(false)
  }

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        className="font-mono text-xs"
        placeholder={placeholder ?? (kind === 'date' ? 'AAAA-MM-DD' : 'AAAA-MM-DD HH:MM:SS')}
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Abrir calendário" className="shrink-0">
            <CalendarDays />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar mode="single" selected={parsed.day} defaultMonth={parsed.day} onSelect={(d) => pick(d)} startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)} autoFocus />
          <div className="flex items-center gap-2 border-t p-3">
            {kind !== 'date' && (
              <div className="relative flex-1">
                <Input
                  type="time"
                  aria-label="Hora"
                  className="h-8 pr-8 font-mono text-xs [&::-webkit-calendar-picker-indicator]:opacity-0"
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value)
                    if (parsed.day) onChange(format(kind, parsed.day, e.target.value))
                  }}
                />
                <Clock className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}
            <Button type="button" variant="ghost" size="sm" className={kind === 'date' ? 'flex-1' : ''} onClick={now}>
              {kind === 'date' ? 'Hoje' : 'Agora'}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Limpar
              </Button>
            )}
          </div>
          {kind === 'timestamptz' && <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Fuso do navegador: {browserOffset}</p>}
        </PopoverContent>
      </Popover>
    </div>
  )
}

import { Check, Hash, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { isBcryptHash, isBooleanType, isTextType, looksLikeSecretColumn, toEditString, validateEditValue } from './cell-format'

type CellEditorProps = {
  value: unknown
  type?: string
  nullable?: boolean
  /** Valores permitidos (colunas enum): vira um select */
  options?: string[]
  /** Nome da coluna — colunas com cara de senha já abrem com o hash ligado */
  columnName?: string
  /** O banco já aplica hash nessa coluna: hash sempre ligado */
  hashed?: boolean
  onSave: (value: string | null, opts?: { hash?: boolean }) => Promise<void>
  onCancel: () => void
}

/**
 * Editor inline de uma célula.
 * Enter salva · Esc cancela · clicar fora salva (se mudou) · botão NULL quando a coluna aceita nulo.
 */
export function CellEditor({ value, type, nullable, options, columnName = '', hashed = false, onSave, onCancel }: CellEditorProps) {
  const hashable = isTextType(type) && !options
  const [hash, setHash] = useState(() => hashable && (hashed || looksLikeSecretColumn(columnName)))
  // Com hash ligado sobre um hash já salvo, começa vazio: o usuário digita a senha nova
  const initial = hash && isBcryptHash(value) ? '' : toEditString(value)
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  async function commit(next: string | null) {
    if (done.current) return
    const unchanged = next === null ? value === null : (next === initial && value !== null) || (hash && next === '')
    if (unchanged) {
      done.current = true
      onCancel()
      return
    }
    const validation = next === null ? null : validateEditValue(next, type)
    if (validation) {
      setError(validation)
      return
    }
    done.current = true
    setSaving(true)
    try {
      await onSave(next, hash && next !== null ? { hash: true } : undefined)
    } catch (err) {
      // Mantém o editor aberto para corrigir
      done.current = false
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    done.current = true
    onCancel()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commit(text)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  if (isBooleanType(type) || options) {
    const choices = options ?? ['true', 'false']
    return (
      <div className="flex items-center gap-1">
        <select
          autoFocus
          aria-label="Valor"
          className="h-7 flex-1 rounded-sm border border-ring bg-background px-1 text-xs outline-none"
          defaultValue={value === null ? 'null' : String(value)}
          onKeyDown={handleKeyDown}
          onChange={(e) => void commit(e.target.value === 'null' ? null : e.target.value)}
          onBlur={cancel}
          disabled={saving}
        >
          {/* Valor atual fora da lista (raro) continua visível */}
          {value !== null && !choices.includes(String(value)) && <option value={String(value)}>{String(value)}</option>}
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
          {nullable && <option value="null">NULL</option>}
        </select>
        {saving && <Spinner className="size-3.5" />}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          autoFocus
          aria-label="Valor"
          aria-invalid={Boolean(error)}
          type={hash ? 'password' : 'text'}
          value={text}
          placeholder={hash ? 'nova senha' : value === null ? 'NULL' : undefined}
          disabled={saving}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            // Clique nos botões do próprio editor não conta como "sair"
            if (e.relatedTarget?.closest('[data-cell-editor]')) return
            void commit(text)
          }}
          className={cn(
            'h-7 min-w-40 flex-1 rounded-sm border border-ring bg-background px-2 font-mono text-xs outline-none ring-[3px] ring-ring/30',
            error && 'border-destructive ring-destructive/30',
          )}
        />
        <div data-cell-editor className="flex items-center gap-0.5">
          {saving ? (
            <Spinner className="size-3.5" />
          ) : (
            <>
              {hashable && (
                <button
                  type="button"
                  aria-pressed={hash}
                  disabled={hashed}
                  aria-label="Salvar como hash (bcrypt)"
                  title={hashed ? 'Coluna de senha: o banco sempre salva como hash' : hash ? 'Será salvo como hash bcrypt — clique para salvar o texto puro' : 'Salvar como hash bcrypt (senhas)'}
                  className={cn(
                    'flex h-6 items-center gap-0.5 rounded-sm border px-1 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground',
                    hash && 'border-primary/50 bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setHash((h) => !h)
                    setError(null)
                    inputRef.current?.focus()
                  }}
                >
                  <Hash className="size-3" />
                  hash
                </button>
              )}
              {nullable && (
                <button
                  type="button"
                  className="h-6 rounded-sm border px-1.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void commit(null)}
                  title="Definir como NULL"
                >
                  NULL
                </button>
              )}
              <button
                type="button"
                aria-label="Salvar"
                className="flex size-6 items-center justify-center rounded-sm text-primary hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void commit(text)}
              >
                <Check className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Cancelar"
                className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancel}
              >
                <X className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="absolute left-0 top-full z-20 mt-1 max-w-80 whitespace-normal rounded-sm bg-destructive px-2 py-1 text-[11px] text-destructive-foreground shadow-md">
          {error}
        </p>
      )}
    </div>
  )
}

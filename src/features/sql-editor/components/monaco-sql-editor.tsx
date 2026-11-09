import { useEffect, useLayoutEffect, useRef } from 'react'
import type { GraphTable } from '@/features/schema/api/schema-api'
import { monaco } from '@/lib/monaco/setup'
import { cn } from '@/lib/utils'
import { registerSqlCompletion, setCompletionSchema } from '../lib/sql-completion'

type MonacoSqlEditorProps = {
  value: string
  onChange: (value: string) => void
  /** Recebe o trecho selecionado (se houver) ou o SQL inteiro */
  onRun: (sql: string) => void
  schema: GraphTable[]
  /** Mude este número para substituir o conteúdo pelo `value` atual (abrir query salva, nova query) */
  resetKey?: number
  className?: string
}

/** Editor SQL com Monaco: realce de sintaxe Postgres, autocomplete de tabelas/colunas e Ctrl+Enter. */
export default function MonacoSqlEditor({ value, onChange, onRun, schema, resetKey = 0, className }: MonacoSqlEditorProps) {
  const container = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  // Callbacks sempre atuais sem recriar o editor
  const callbacks = useRef({ onChange, onRun })
  // Valor mais recente vindo do pai (lido na criação e quando resetKey muda)
  const latestValue = useRef(value)
  useLayoutEffect(() => {
    callbacks.current = { onChange, onRun }
    latestValue.current = value
  })

  useEffect(() => {
    setCompletionSchema(schema)
  }, [schema])

  useEffect(() => {
    if (!container.current) return
    registerSqlCompletion()
    const editor = monaco.editor.create(container.current, {
      value: latestValue.current,
      language: 'pgsql',
      theme: 'dbhub-dark',
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 22,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      tabSize: 2,
      renderLineHighlight: 'all',
      suggest: { showWords: false },
      quickSuggestions: { other: true, comments: false, strings: false },
      fixedOverflowWidgets: true,
    })
    editorRef.current = editor

    const sub = editor.onDidChangeModelContent(() => callbacks.current.onChange(editor.getValue()))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const selection = editor.getSelection()
      const selected = selection && !selection.isEmpty() ? editor.getModel()?.getValueInRange(selection) : undefined
      callbacks.current.onRun(selected?.trim() ? selected : editor.getValue())
    })
    editor.focus()

    return () => {
      sub.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  // O editor é "não controlado": o texto só é substituído quando o pai pede (resetKey).
  // Sincronizar a cada render reescreveria o editor com valores atrasados e comeria letras digitadas.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || resetKey === 0) return
    editor.executeEdits('external', [{ range: editor.getModel()!.getFullModelRange(), text: latestValue.current }])
    editor.pushUndoStop()
    editor.focus()
  }, [resetKey])

  return <div ref={container} className={cn('min-h-0', className)} data-testid="monaco-sql-editor" />
}

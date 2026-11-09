import { FileUp, TriangleAlert, Upload } from 'lucide-react'
import Papa from 'papaparse'
import { useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { databaseApi } from '@/features/database/api/database-api'
import { useInvalidateStructure } from '@/features/database/hooks/use-database'
import { cn, formatNumber } from '@/lib/utils'
import type { ColumnInfo, Row } from '@/types/database'

type ImportCsvDialogProps = {
  connectionId: string
  schema: string
  table: string
  columns: ColumnInfo[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const IGNORE = '__ignore__'
const BATCH = 500
type Parsed = { file: string; headers: string[]; rows: Record<string, string>[] }

const normalize = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_')

/** Importação de CSV: lê no navegador, mapeia colunas e envia em lotes de 500 linhas. */
export function ImportCsvDialog({ connectionId, schema, table, columns, open, onOpenChange }: ImportCsvDialogProps) {
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [emptyAs, setEmptyAs] = useState<'default' | 'null'>('default')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const invalidate = useInvalidateStructure(connectionId)

  function reset() {
    setParsed(null)
    setMapping({})
    setProgress(null)
    setError(null)
  }

  function readFile(file: File) {
    setError(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        const headers = (result.meta.fields ?? []).filter(Boolean)
        if (!headers.length || !result.data.length) {
          setError('O arquivo não tem cabeçalho ou está vazio.')
          return
        }
        // Liga automaticamente as colunas com o mesmo nome (ignorando acentos/maiúsculas)
        const byName = new Map(columns.map((c) => [normalize(c.name), c.name]))
        setMapping(Object.fromEntries(headers.map((h) => [h, byName.get(normalize(h)) ?? IGNORE])))
        setParsed({ file: file.name, headers, rows: result.data })
      },
      error: (err) => setError(`Não foi possível ler o arquivo: ${err.message}`),
    })
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) readFile(file)
  }

  const mapped = Object.entries(mapping).filter(([, col]) => col !== IGNORE)
  const duplicated = mapped.map(([, c]) => c).filter((c, i, all) => all.indexOf(c) !== i)

  function toRow(source: Record<string, string>): Row {
    const row: Row = {}
    for (const [header, column] of mapped) {
      const value = source[header] ?? ''
      if (value === '') {
        if (emptyAs === 'null') row[column] = null
        continue // padrão da coluna
      }
      row[column] = value
    }
    return row
  }

  async function handleImport() {
    if (!parsed) return
    setError(null)
    const rows = parsed.rows.map(toRow)
    setProgress({ done: 0, total: rows.length })
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      try {
        await databaseApi.insertBulk(connectionId, schema, table, batch)
        setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao importar'
        setError(
          `Falha nas linhas ${formatNumber(i + 1)}–${formatNumber(i + batch.length)}: ${message}` +
            (i > 0 ? ` · As ${formatNumber(i)} linhas anteriores já foram importadas.` : ' · Nada foi importado.'),
        )
        await invalidate()
        return
      }
    }
    await invalidate()
    toast.success(`${formatNumber(rows.length)} linhas importadas em ${table}`)
    onOpenChange(false)
    reset()
  }

  const importing = progress !== null && progress.done < progress.total && !error

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importing) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] grid-rows-[auto_1fr_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar CSV</DialogTitle>
          <DialogDescription>
            Para <span className="font-mono">{schema}.{table}</span>. A primeira linha do arquivo precisa ser o cabeçalho.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 grid gap-4 overflow-y-auto px-6">
          {!parsed ? (
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors hover:border-primary/50',
                dragging && 'border-primary bg-primary/5',
              )}
            >
              <FileUp className="size-8 text-muted-foreground" />
              <span className="text-sm font-medium">Arraste o arquivo .csv aqui ou clique para escolher</span>
              <span className="text-xs text-muted-foreground">Separador vírgula ou ponto e vírgula (detectado automaticamente)</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
            </label>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">{parsed.file}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {formatNumber(parsed.rows.length)} linhas
                  {!progress && (
                    <Button variant="ghost" size="xs" onClick={reset}>
                      Trocar
                    </Button>
                  )}
                </span>
              </div>

              <div className="grid gap-2">
                <p className="text-sm font-medium">Colunas</p>
                <div className="grid gap-2 rounded-md border p-3">
                  {parsed.headers.map((header) => (
                    <div key={header} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                      <span className="truncate font-mono text-xs">{header}</span>
                      <span className="text-muted-foreground">→</span>
                      <Select value={mapping[header]} onValueChange={(v) => setMapping((m) => ({ ...m, [header]: v }))}>
                        <SelectTrigger size="sm" className={cn('w-full font-mono text-xs', mapping[header] === IGNORE && 'text-muted-foreground')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={IGNORE}>não importar</SelectItem>
                          {columns.map((c) => (
                            <SelectItem key={c.name} value={c.name} className="font-mono text-xs">
                              {c.name} <span className="text-muted-foreground">{c.type}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {duplicated.length > 0 && <p className="text-xs text-destructive">A coluna {duplicated[0]} está ligada a mais de um campo do arquivo.</p>}
              </div>

              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">Campos vazios no arquivo</Label>
                <Select value={emptyAs} onValueChange={(v) => setEmptyAs(v as 'default' | 'null')}>
                  <SelectTrigger size="sm" className="w-56 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">usar o valor padrão da coluna</SelectItem>
                    <SelectItem value="null">gravar como NULL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <p className="text-sm font-medium">Prévia</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        {mapped.map(([, col]) => (
                          <th key={col} className="whitespace-nowrap px-2 py-1.5 text-left font-mono font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t">
                          {mapped.map(([header, col]) => (
                            <td key={col} className="max-w-48 truncate whitespace-nowrap px-2 py-1.5">
                              {r[header] === '' ? <span className="italic text-muted-foreground">{emptyAs === 'null' ? 'NULL' : 'padrão'}</span> : r[header]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {progress && (
                <div className="grid gap-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(progress.done)} de {formatNumber(progress.total)} linhas
                  </p>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
        </div>

        <DialogFooter className="items-center">
          {parsed && mapped.length > 0 && (
            <Badge variant="secondary" className="mr-auto">
              {mapped.length} de {parsed.headers.length} colunas
            </Badge>
          )}
          <Button variant="ghost" disabled={importing} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!parsed || !mapped.length || duplicated.length > 0} loading={importing} onClick={handleImport}>
            {!importing && <Upload />} Importar {parsed ? formatNumber(parsed.rows.length) : ''} linhas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SqlPreview } from './sql-preview'

type DangerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  /** Exige digitar este texto para liberar o botão (ex.: nome da tabela) */
  confirmText?: string
  /** Mostra a opção CASCADE (apaga também o que depende do objeto) */
  allowCascade?: boolean
  sql?: string
  loading?: boolean
  onConfirm: (opts: { cascade: boolean }) => void
  onCascadeChange?: (cascade: boolean) => void
  /** Texto da opção extra (padrão: CASCADE) */
  cascadeLabel?: string
  cascadeHint?: string
}

/** Confirmação para ações destrutivas de estrutura (DROP TABLE, DROP COLUMN…). */
export function DangerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmText,
  allowCascade,
  sql,
  loading,
  onConfirm,
  onCascadeChange,
  cascadeLabel = 'Excluir também o que depende disso (CASCADE)',
  cascadeHint = 'Views, chaves estrangeiras e políticas que usam este objeto também serão apagadas.',
}: DangerDialogProps) {
  const [typed, setTyped] = useState('')
  const [cascade, setCascade] = useState(false)
  const blocked = Boolean(confirmText) && typed !== confirmText

  function handleOpenChange(next: boolean) {
    if (!next) {
      setTyped('')
      setCascade(false)
      onCascadeChange?.(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {allowCascade && (
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={cascade}
              onCheckedChange={(v) => {
                setCascade(v === true)
                onCascadeChange?.(v === true)
              }}
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{cascadeLabel}</span>
              <span className="text-xs text-muted-foreground">{cascadeHint}</span>
            </span>
          </label>
        )}

        {sql && <SqlPreview sql={sql} title="Será executado" />}

        {confirmText && (
          <div className="grid gap-2">
            <Label htmlFor="danger-confirm" className="text-sm font-normal">
              Digite <span className="font-mono font-semibold text-foreground">{confirmText}</span> para confirmar
            </Label>
            <Input id="danger-confirm" autoComplete="off" className="font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={blocked} loading={loading} onClick={() => onConfirm({ cascade })}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

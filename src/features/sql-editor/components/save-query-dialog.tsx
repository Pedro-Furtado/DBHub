import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type SaveQueryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading?: boolean
  onSave: (title: string) => void
}

export function SaveQueryDialog({ open, onOpenChange, loading, onSave }: SaveQueryDialogProps) {
  const [title, setTitle] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (title.trim()) onSave(title.trim())
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTitle('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar query</DialogTitle>
          <DialogDescription>Ela fica disponível na lista desta conexão.</DialogDescription>
        </DialogHeader>
        <form id="save-query-form" onSubmit={handleSubmit}>
          <Field label="Nome" htmlFor="query-title">
            <Input
              id="query-title"
              autoFocus
              maxLength={160}
              placeholder="Ex.: Leads convertidos no mês"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="save-query-form" disabled={!title.trim()} loading={loading}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

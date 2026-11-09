import { Download, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type ExportMenuProps = {
  exportUrl: (delimiter: ',' | ';') => string
  onImport?: () => void
  filtered: boolean
}

/** Exportar (respeita filtros/busca/ordem atuais) e importar CSV. */
export function ExportMenu({ exportUrl, onImport, filtered }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Download /> CSV
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Exportar {filtered ? 'linhas filtradas' : 'tabela'} (até 100 mil)</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={exportUrl(',')} download>
            <Download /> CSV padrão (vírgula)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={exportUrl(';')} download>
            <Download /> CSV para Excel (ponto e vírgula)
          </a>
        </DropdownMenuItem>
        {onImport && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onImport}>
              <FileUp /> Importar CSV…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

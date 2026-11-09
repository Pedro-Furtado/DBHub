import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNumber } from '@/lib/utils'

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const pageSizes = [50, 100, 500]

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-4 border-t bg-card px-3 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {formatNumber(from)}–{formatNumber(to)} de {formatNumber(total)} linhas
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Linhas por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon-xs" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">
          {page} / {formatNumber(totalPages)}
        </span>
        <Button
          variant="outline"
          size="icon-xs"
          aria-label="Próxima página"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

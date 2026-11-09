/** CSV (RFC 4180) com BOM para o Excel reconhecer acentos — usado para exportar o resultado do SQL Editor. */
export function toCsv(columns: string[], rows: Record<string, unknown>[], delimiter: ',' | ';' = ',') {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return ''
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `﻿${[columns.map(escape).join(delimiter), ...rows.map((r) => columns.map((c) => escape(r[c])).join(delimiter))].join('\r\n')}\r\n`
}

export function downloadText(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

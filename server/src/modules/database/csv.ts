/** Serialização CSV (RFC 4180) com BOM para o Excel reconhecer UTF-8 e acentos. */
export function toCsv(columns: string[], rows: Record<string, unknown>[], delimiter: ',' | ';' = ',') {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return ''
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.map(escape).join(delimiter), ...rows.map((row) => columns.map((c) => escape(row[c])).join(delimiter))]
  return `﻿${lines.join('\r\n')}\r\n`
}

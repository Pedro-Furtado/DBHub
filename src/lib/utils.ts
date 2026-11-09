import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Junta classes condicionais e resolve conflitos do Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formata números no padrão brasileiro (ex.: 12.480). */
export function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

/** Formata bytes em KB/MB/GB. */
export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** Pequeno atraso — útil para simular latência nos mocks. */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

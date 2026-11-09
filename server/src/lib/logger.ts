import pino, { type LoggerOptions } from 'pino'
import { env, isProduction } from '../config/env.ts'

/**
 * Data/hora no fuso configurado (TZ), em ISO 8601 com offset.
 * Ex.: 2026-11-08T11:55:03.482-03:00
 */
const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
})

export function formatTimestamp(date = new Date()) {
  const p = Object.fromEntries(dateParts.formatToParts(date).map((x) => [x.type, x.value]))
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  const offset = p.timeZoneName === 'GMT' ? '+00:00' : p.timeZoneName.replace('GMT', '')
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${ms}${offset}`
}

/** Campos que nunca podem aparecer em log. */
const redact = {
  paths: [
    'password',
    '*.password',
    'url',
    '*.url',
    'connectionString',
    '*.connectionString',
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
  ],
  censor: '[REDACTED]',
}

const base: LoggerOptions = {
  level: env.LOG_LEVEL,
  messageKey: 'message',
  base: { service: 'dbhub-server', env: env.NODE_ENV },
  timestamp: () => `,"time":"${formatTimestamp()}"`,
  formatters: {
    // Nível como texto em maiúsculo (INFO, WARN, ERROR) — o Railway reconhece e colore
    level: (label) => ({ level: label.toUpperCase() }),
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  redact,
}

/**
 * Produção: uma linha JSON por log (padrão de mercado, lido pelo Railway).
 * Dev: saída legível e colorida:
 *   [08/11/2026 11:55:03.482] INFO  [http] GET /api/connections 200 - 12ms
 */
const options: LoggerOptions = isProduction
  ? base
  : {
      level: env.LOG_LEVEL,
      messageKey: 'message',
      serializers: base.serializers,
      redact,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          messageKey: 'message',
          translateTime: 'SYS:dd/mm/yyyy HH:MM:ss.l',
          // Em dev os campos de acesso já aparecem na mensagem; o JSON de produção mantém tudo
          ignore: 'pid,hostname,module,method,path,statusCode,ip',
          messageFormat: '{if module}[{module}] {end}{message}',
          singleLine: true,
        },
      },
    }

export const logger = pino(options)

/** Logger com contexto fixo do módulo: logger.child({ module: 'connections' }) */
export const createLogger = (module: string) => logger.child({ module })

/**
 * Los importes viajan siempre como enteros en unidades mínimas (céntimos).
 * Nunca se opera con decimales en coma flotante para evitar que 0,1 + 0,2 deje de ser 0,3.
 */

const decimalsCache = new Map<string, number>()

/** Decimales oficiales de una divisa, deducidos de Intl para cubrir las 170+ sin mantener una tabla. */
export function currencyDecimals(code: string): number {
  const key = (code || 'EUR').toUpperCase()
  const cached = decimalsCache.get(key)
  if (cached !== undefined) return cached
  let decimals = 2
  try {
    const opts = new Intl.NumberFormat('es-ES', { style: 'currency', currency: key }).resolvedOptions()
    decimals = opts.minimumFractionDigits ?? 2
  } catch {
    decimals = 2
  }
  decimalsCache.set(key, decimals)
  return decimals
}

export function minorFactor(code: string): number {
  return 10 ** currencyDecimals(code)
}

/** Convierte un importe mayor (12,34) a unidades mínimas (1234). */
export function toMinor(value: number, code: string): number {
  return Math.round(value * minorFactor(code))
}

/** Convierte unidades mínimas (1234) al importe mayor (12,34). */
export function toMajor(minor: number, code: string): number {
  return minor / minorFactor(code)
}

export function formatMoney(
  minor: number,
  code: string,
  opts: { sign?: boolean; compact?: boolean; noSymbol?: boolean } = {}
): string {
  const value = toMajor(minor, code)
  const decimals = currencyDecimals(code)
  const formatter = new Intl.NumberFormat('es-ES', {
    style: opts.noSymbol ? 'decimal' : 'currency',
    currency: code,
    minimumFractionDigits: opts.compact ? 0 : decimals,
    maximumFractionDigits: opts.compact ? 0 : decimals,
    notation: opts.compact ? 'compact' : 'standard'
  })
  const text = formatter.format(Math.abs(value))
  if (opts.sign) {
    if (value > 0) return `+${text}`
    if (value < 0) return `−${text}`
    return text
  }
  return value < 0 ? `−${text}` : text
}

/** Símbolo de la divisa aislado, para etiquetas y campos de formulario. */
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol'
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

/**
 * Interpreta lo que el usuario teclea aceptando tanto "1.234,56" como "1234.56".
 * Devuelve null si no hay ningún número reconocible.
 */
export function parseAmount(input: string, code: string): number | null {
  if (input == null) return null
  let text = String(input).trim().replace(/\s/g, '').replace(/[€$£¥]/g, '')
  if (!text) return null
  const negative = /^[-−(]/.test(text)
  text = text.replace(/[-−()]/g, '')
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // El separador decimal es el que aparece más a la derecha.
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.')
    else text = text.replace(/,/g, '')
  } else if (lastComma > -1) {
    // Una coma sola separa decimales salvo que agrupe millares (1,234).
    const decimalPart = text.length - lastComma - 1
    text = decimalPart === 3 && text.length > 4 ? text.replace(/,/g, '') : text.replace(',', '.')
  }
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  const minor = toMinor(value, code)
  return negative ? -minor : minor
}

/**
 * Convierte entre divisas. Los tipos indican cuántas unidades de esa divisa
 * equivalen a una unidad de la divisa base.
 */
export function convert(
  minor: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (!minor) return 0
  const origin = from.toUpperCase()
  const target = to.toUpperCase()
  if (origin === target) return minor
  const rateFrom = origin in rates ? rates[origin] : 1
  const rateTo = target in rates ? rates[target] : 1
  if (!rateFrom || !rateTo) return minor
  const inBase = toMajor(minor, origin) / rateFrom
  return toMinor(inBase * rateTo, target)
}

/** Divisas que se ofrecen primero en los desplegables. */
export const COMMON_CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'RUB', 'UAH', 'MXN', 'BRL', 'ARS', 'CLP',
  'COP', 'PEN', 'UYU', 'MAD', 'ZAR', 'INR', 'KRW', 'SGD', 'HKD', 'THB', 'IDR', 'MYR',
  'PHP', 'VND', 'ILS', 'AED', 'SAR', 'EGP', 'ISK', 'HRK', 'RSD'
]

export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(['es-ES'], { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

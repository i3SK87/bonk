/**
 * Las fechas se guardan como cadenas "YYYY-MM-DD" en hora local.
 * Se evita el constructor Date(string) porque interpreta ISO corto como UTC
 * y desplaza el día en España.
 */

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function today(): string {
  return toISO(new Date())
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** Suma meses conservando el último día cuando el mes destino es más corto (31 ene + 1 mes = 28 feb). */
export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return toISO(d)
}

export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12)
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01'
}

export function endOfMonth(iso: string): string {
  const d = parseISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function startOfWeek(iso: string, mondayFirst = true): string {
  const d = parseISO(iso)
  const day = d.getDay()
  const diff = mondayFirst ? (day === 0 ? 6 : day - 1) : day
  return addDays(iso, -diff)
}

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`
}

export function endOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-12-31`
}

export function startOfQuarter(iso: string): string {
  const month = Number(iso.slice(5, 7))
  const first = Math.floor((month - 1) / 3) * 3 + 1
  return `${iso.slice(0, 4)}-${String(first).padStart(2, '0')}-01`
}

export function daysBetween(a: string, b: string): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime()
  return Math.round(ms / 86400000)
}

export function monthsBetween(a: string, b: string): number {
  const from = parseISO(a)
  const to = parseISO(b)
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

/** Rango del periodo de un presupuesto que contiene a `reference`, anclado en `startDate`. */
export function periodRange(
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly',
  startDate: string,
  reference: string,
  mondayFirst = true
): { start: string; end: string; index: number } {
  switch (period) {
    case 'weekly': {
      const anchor = startOfWeek(startDate, mondayFirst)
      const index = Math.floor(daysBetween(anchor, reference) / 7)
      const start = addDays(anchor, index * 7)
      return { start, end: addDays(start, 6), index }
    }
    case 'monthly': {
      const anchor = startOfMonth(startDate)
      const index = monthsBetween(anchor, reference)
      const start = addMonths(anchor, index)
      return { start, end: endOfMonth(start), index }
    }
    case 'quarterly': {
      const anchor = startOfQuarter(startDate)
      const index = Math.floor(monthsBetween(anchor, reference) / 3)
      const start = addMonths(anchor, index * 3)
      return { start, end: addDays(addMonths(start, 3), -1), index }
    }
    case 'yearly': {
      const anchor = startOfYear(startDate)
      const index = Number(reference.slice(0, 4)) - Number(anchor.slice(0, 4))
      const start = addYears(anchor, index)
      return { start, end: endOfYear(start), index }
    }
  }
}

export function nextOccurrence(
  iso: string,
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
  interval: number
): string {
  const step = Math.max(1, interval)
  switch (freq) {
    case 'daily':
      return addDays(iso, step)
    case 'weekly':
      return addDays(iso, step * 7)
    case 'monthly':
      return addMonths(iso, step)
    case 'yearly':
      return addYears(iso, step)
  }
}

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const shortMonthFmt = new Intl.DateTimeFormat('es-ES', { month: 'short' })

export function formatDate(iso: string): string {
  return dateFmt.format(parseISO(iso))
}

export function formatMonth(iso: string): string {
  const text = monthFmt.format(parseISO(iso))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatShortMonth(iso: string): string {
  return shortMonthFmt.format(parseISO(iso)).replace('.', '')
}

/** Cabecera de grupo en la lista de movimientos: "Hoy", "Ayer" o el día escrito. */
export function formatDayHeading(iso: string): string {
  const t = today()
  if (iso === t) return 'Hoy'
  if (iso === addDays(t, -1)) return 'Ayer'
  if (iso === addDays(t, 1)) return 'Mañana'
  const text = dayFmt.format(parseISO(iso))
  const label = text.charAt(0).toUpperCase() + text.slice(1)
  return iso.slice(0, 4) === t.slice(0, 4) ? label : `${label} de ${iso.slice(0, 4)}`
}

export function relativeDays(iso: string): string {
  const diff = daysBetween(today(), iso)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff === -1) return 'ayer'
  if (diff > 0) return `en ${diff} días`
  return `hace ${Math.abs(diff)} días`
}

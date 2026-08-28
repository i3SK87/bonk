/**
 * Las fechas se guardan como cadenas "YYYY-MM-DD" en hora local.
 * Se evita el constructor Date(string) porque interpreta ISO corto como UTC
 * y desplaza el día en España.
 */

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function today(): string {
  return toISO(new Date())
}

/**
 * Cuánto falta, en milisegundos, para que cambie el día.
 *
 * Lo usa el repaso de fondo para despertarse justo al dar las doce en vez de
 * esperar a su vuelta de media hora. Se calcula sobre la hora local y no sobre
 * un día de 24 h fijas: en la noche del cambio de hora el día dura 23 o 25, y
 * sumar 86.400.000 dejaría la cita una hora corrida.
 */
export function msHastaElCambioDeDia(desde: Date = new Date()): number {
  const medianoche = new Date(desde)
  // Las 24:00 de hoy son las 00:00 de mañana, y `setHours` ya tiene en cuenta
  // el huso y el cambio de hora.
  medianoche.setHours(24, 0, 0, 0)
  return medianoche.getTime() - desde.getTime()
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

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`
}

export function endOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-12-31`
}

export function daysBetween(a: string, b: string): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime()
  return Math.round(ms / 86400000)
}

export function nextOccurrence(
  iso: string,
  freq: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly',
  interval: number
): string {
  const step = Math.max(1, interval)
  switch (freq) {
    /*
     * «Una vez» no tiene siguiente, y aun así hay que contestar algo.
     *
     * Se devuelve el día de después porque una programada de una vez se guarda
     * con la fecha de fin igual que la de inicio: en cuanto se registra, su
     * siguiente fecha rebasa el fin y se sella sola, por el mismo camino que
     * una deuda que acaba de pagar su última cuota. Devolver el mismo día la
     * dejaría dando vueltas para siempre.
     */
    case 'once':
      return addDays(iso, 1)
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

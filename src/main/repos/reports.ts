import { getDb } from '../db'
import { convert } from '@shared/money'
import { today, startOfMonth, endOfMonth, addMonths } from '@shared/dates'
import { getSettings, rateMap } from './settings'
import type {
  CategoryTotal,
  MonthlyPoint,
  CategoryKind,
  NoteTotal
} from '@shared/types'

/**
 * Reparto por categorías en un rango. Se agrupa también por divisa de la cuenta
 * para poder convertir cada bloque con su tipo antes de sumar.
 */
export function categoryTotals(from: string, to: string, kind: CategoryKind = 'expense'): CategoryTotal[] {
  const rates = rateMap()
  const base = getSettings().baseCurrency

  // En los gastos, los reembolsos entran con signo negativo: rebajan lo gastado
  // en su categoría en lugar de figurar como ingreso aparte.
  const types = kind === 'expense' ? ['expense', 'refund'] : ['income']

  const rows = getDb()
    .prepare(
      `SELECT t.category_id            AS categoryId,
              COALESCE(c.name, 'Sin categoría') AS name,
              COALESCE(c.icon, 'tag')  AS icon,
              COALESCE(c.color, '#8E8E93') AS color,
              a.currency               AS currency,
              SUM(CASE WHEN t.type = 'refund' THEN -t.amount ELSE t.amount END) AS total,
              SUM(CASE WHEN t.type = 'refund' THEN 0 ELSE 1 END) AS count
         FROM transactions t
         JOIN accounts a        ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.type IN (${types.map(() => '?').join(',')}) AND t.date >= ? AND t.date <= ?
        GROUP BY t.category_id, a.currency`
    )
    .all(...types, from, to) as unknown as Array<{
    categoryId: number | null
    name: string
    icon: string
    color: string
    currency: string
    total: number
    count: number
  }>

  const merged = new Map<number | null, CategoryTotal>()
  for (const row of rows) {
    const key = row.categoryId
    const existing = merged.get(key) ?? {
      categoryId: key,
      name: row.name,
      icon: row.icon,
      color: row.color,
      total: 0,
      count: 0,
      percent: 0,
      notes: []
    }
    existing.total += convert(Number(row.total ?? 0), row.currency, base, rates)
    existing.count += Number(row.count ?? 0)
    merged.set(key, existing)
  }

  const list = [...merged.values()].sort((a, b) => b.total - a.total)
  const grandTotal = list.reduce((sum, item) => sum + item.total, 0)
  for (const item of list) item.percent = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0

  // Sin los reembolsos: el desglose enseña en qué se ha ido el dinero, y una
  // devolución no es un sitio donde se haya ido nada. Ver `noteTotals`.
  const byNote = noteTotals(from, to, types.filter((item) => item !== 'refund'), rates, base)
  for (const item of list) {
    if (item.categoryId === null) continue
    item.notes = byNote.get(item.categoryId) ?? []
  }
  return list
}

/** Clave con la que dos notas cuentan como la misma: sin mayúsculas ni espacios de más. */
function noteKey(note: string): string {
  return note.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Desglose por notas de cada categoría que lo tenga activado. Va aparte de
 * `categoryTotals` porque una categoría fija (el alquiler es el alquiler) no
 * tiene nada que abrir, y sacarlo todo en la misma consulta obligaría a filtrar
 * después lo que la base ya sabe descartar.
 *
 * Aquí solo entran los gastos. Un reembolso sin nota se abría su propio cajón
 * —«Sin nota», en rojo y con cero movimientos— y lo que se veía al desplegar
 * Compras era la devolución, no las compras. Cada nota dice lo que costó lo que
 * compraste; lo que te devolvieron ya está descontado arriba, en el total de la
 * categoría, así que el desglose no tiene por qué sumarlo: puede quedar por
 * encima del total de su categoría, y eso es lo pedido.
 */
function noteTotals(
  from: string,
  to: string,
  types: string[],
  rates: Record<string, number>,
  base: string
): Map<number, NoteTotal[]> {
  const rows = getDb()
    .prepare(
      `SELECT t.category_id AS categoryId,
              COALESCE(NULLIF(TRIM(t.note), ''), '') AS noteText,
              a.currency     AS currency,
              SUM(t.amount)  AS total,
              COUNT(*)       AS count
         FROM transactions t
         JOIN accounts a  ON a.id = t.account_id
         JOIN categories c ON c.id = t.category_id
        WHERE t.type IN (${types.map(() => '?').join(',')})
          AND t.date >= ? AND t.date <= ?
          AND c.breakdown_by_note = 1
        GROUP BY t.category_id, TRIM(t.note) COLLATE NOCASE, a.currency`
    )
    .all(...types, from, to) as unknown as Array<{
    categoryId: number
    noteText: string
    currency: string
    total: number
    count: number
  }>

  const grouped = new Map<number, Map<string, NoteTotal>>()
  for (const row of rows) {
    const categoryId = Number(row.categoryId)
    const bucket = grouped.get(categoryId) ?? new Map<string, NoteTotal>()
    const key = noteKey(row.noteText)
    const entry = bucket.get(key) ?? {
      note: row.noteText.trim() || 'Sin nota',
      total: 0,
      count: 0,
      percent: 0
    }
    entry.total += convert(Number(row.total ?? 0), row.currency, base, rates)
    entry.count += Number(row.count ?? 0)
    bucket.set(key, entry)
    grouped.set(categoryId, bucket)
  }

  const result = new Map<number, NoteTotal[]>()
  for (const [categoryId, bucket] of grouped) {
    const notes = [...bucket.values()].sort((a, b) => b.total - a.total)
    const total = notes.reduce((sum, item) => sum + item.total, 0)
    for (const item of notes) item.percent = total > 0 ? (item.total / total) * 100 : 0
    result.set(categoryId, notes)
  }
  return result
}

/** Ingresos y gastos mes a mes, ya convertidos a la divisa base. */
/**
 * De cuándo es el primer movimiento y de cuándo el último. Es lo que necesita
 * el periodo «Todo», que no puede inventarse un rango: sin esto habría que
 * elegir entre un año arbitrario o unas fechas absurdas que dejarían la media
 * diaria sin sentido.
 */
export function transactionsSpan(): { from: string; to: string } | null {
  const row = getDb()
    .prepare('SELECT MIN(date) AS first, MAX(date) AS last FROM transactions')
    .get() as unknown as { first: string | null; last: string | null }
  return row?.first && row?.last ? { from: row.first, to: row.last } : null
}

export function monthlySeries(months = 12, reference = today()): MonthlyPoint[] {
  const rates = rateMap()
  const base = getSettings().baseCurrency
  const first = startOfMonth(addMonths(reference, -(months - 1)))
  const last = endOfMonth(reference)

  const rows = getDb()
    .prepare(
      `SELECT substr(t.date, 1, 7) AS month,
              t.type               AS type,
              a.currency           AS currency,
              SUM(t.amount)        AS total
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
        WHERE t.type IN ('expense','income','refund') AND t.date >= ? AND t.date <= ?
        GROUP BY month, t.type, a.currency`
    )
    .all(first, last) as unknown as Array<{ month: string; type: string; currency: string; total: number }>

  const points = new Map<string, MonthlyPoint>()
  for (let i = 0; i < months; i++) {
    const monthIso = startOfMonth(addMonths(first, i))
    points.set(monthIso.slice(0, 7), { month: monthIso, income: 0, expense: 0, net: 0 })
  }

  for (const row of rows) {
    const point = points.get(row.month)
    if (!point) continue
    const value = convert(Number(row.total ?? 0), row.currency, base, rates)
    if (row.type === 'income') point.income += value
    else if (row.type === 'refund') point.expense -= value
    else point.expense += value
  }

  for (const point of points.values()) point.net = point.income - point.expense
  return [...points.values()]
}

/**
 * Suma de un tipo de movimiento en un rango, en divisa base. El gasto va neto:
 * lo que te hayan reembolsado no cuenta como gastado.
 */
export function totalFor(type: 'expense' | 'income', from: string, to: string): number {
  const rates = rateMap()
  const base = getSettings().baseCurrency
  const types = type === 'expense' ? ['expense', 'refund'] : ['income']

  const rows = getDb()
    .prepare(
      `SELECT a.currency AS currency,
              SUM(CASE WHEN t.type = 'refund' THEN -t.amount ELSE t.amount END) AS total
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
        WHERE t.type IN (${types.map(() => '?').join(',')}) AND t.date >= ? AND t.date <= ?
        GROUP BY a.currency`
    )
    .all(...types, from, to) as unknown as Array<{ currency: string; total: number }>
  return rows.reduce((sum, row) => sum + convert(Number(row.total ?? 0), row.currency, base, rates), 0)
}

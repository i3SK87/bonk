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
 * La cuenta que se está mirando, o `null` para todas juntas.
 *
 * Va como un trozo de SQL y sus parámetros porque las cuatro consultas de aquí
 * lo pegan igual, y porque escribirlo suelto en cada una es cómo se acaba
 * teniendo un informe que filtra y un desglose que no.
 */
function filtroDeCuenta(accountId: number | null): { sql: string; params: number[] } {
  return accountId == null
    ? { sql: '', params: [] }
    : { sql: ' AND t.account_id = ?', params: [accountId] }
}

/**
 * La fila de los traspasos, que no es una categoría de nadie.
 *
 * Un traspaso nunca lleva categoría —`saveTransaction` se la quita a
 * propósito—, así que no hay bajo qué repartirlo. Va en una fila suya, con un
 * identificador que no puede chocar con ninguna categoría real ni con el `-1`
 * que la tabla usa para plegar «Sin categoría».
 */
const FILA_TRASPASOS = -2

/**
 * Lo que un traspaso le hace a la cuenta que se está mirando.
 *
 * Es el mismo criterio que la lista de Movimientos —`efectoSobre`—: sale por
 * `account_id` y entra por `to_account_id`, y lo que entra va con su importe de
 * destino cuando las divisas no coinciden. Las dos patas se leen en la divisa de
 * su propia cuenta, que aquí es siempre la mirada, porque se filtra por una.
 *
 * No es un gasto ni un ingreso: el dinero sigue siendo tuyo y solo cambia de
 * bolsillo. Pero del saldo de esta cuenta sale o entra, y eso es lo que cuenta
 * un informe de una cuenta.
 */
function traspasosDe(
  from: string,
  to: string,
  kind: CategoryKind,
  accountId: number,
  rates: Record<string, number>,
  base: string
): { total: number; count: number } {
  const entrando = kind === 'income'
  const lado = entrando ? 't.to_account_id' : 't.account_id'
  const importe = entrando ? 'COALESCE(t.amount_to, t.amount)' : 't.amount'

  const rows = getDb()
    .prepare(
      `SELECT a.currency      AS currency,
              SUM(${importe}) AS total,
              COUNT(*)        AS count
         FROM transactions t
         JOIN accounts a ON a.id = ${lado}
        WHERE t.type = 'transfer' AND t.date >= ? AND t.date <= ? AND ${lado} = ?
        GROUP BY a.currency`
    )
    .all(from, to, accountId) as unknown as Array<{
    currency: string
    total: number
    count: number
  }>

  let total = 0
  let count = 0
  for (const row of rows) {
    total += convert(Number(row.total ?? 0), row.currency, base, rates)
    count += Number(row.count ?? 0)
  }
  return { total, count }
}

/**
 * Reparto por categorías en un rango. Se agrupa también por divisa de la cuenta
 * para poder convertir cada bloque con su tipo antes de sumar.
 *
 * Con una cuenta elegida entran además sus traspasos, en una fila aparte: en una
 * hucha son lo único que pasa, y sin ellos el informe salía en blanco.
 */
export function categoryTotals(
  from: string,
  to: string,
  kind: CategoryKind = 'expense',
  accountId: number | null = null
): CategoryTotal[] {
  const rates = rateMap()
  const base = getSettings().baseCurrency
  const cuenta = filtroDeCuenta(accountId)

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
        WHERE t.type IN (${types.map(() => '?').join(',')}) AND t.date >= ? AND t.date <= ?${cuenta.sql}
        GROUP BY t.category_id, a.currency`
    )
    .all(...types, from, to, ...cuenta.params) as unknown as Array<{
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

  const list = [...merged.values()]
  if (accountId != null) {
    const traspasos = traspasosDe(from, to, kind, accountId, rates, base)
    // Sin ninguno no se enseña la fila: una línea a cero no dice nada.
    if (traspasos.count > 0) {
      list.push({
        categoryId: FILA_TRASPASOS,
        name: 'Traspasos',
        icon: 'transfer',
        // Gris, como en la lista de Movimientos: en rojo parecería gastado.
        color: '#8E8E93',
        total: traspasos.total,
        count: traspasos.count,
        percent: 0,
        notes: []
      })
    }
  }
  list.sort((a, b) => b.total - a.total)
  const grandTotal = list.reduce((sum, item) => sum + item.total, 0)
  for (const item of list) item.percent = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0

  // Sin los reembolsos: el desglose enseña en qué se ha ido el dinero, y una
  // devolución no es un sitio donde se haya ido nada. Ver `noteTotals`.
  const byNote = noteTotals(
    from,
    to,
    types.filter((item) => item !== 'refund'),
    rates,
    base,
    accountId
  )
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
  base: string,
  accountId: number | null
): Map<number, NoteTotal[]> {
  const cuenta = filtroDeCuenta(accountId)
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
          AND c.breakdown_by_note = 1${cuenta.sql}
        GROUP BY t.category_id, TRIM(t.note) COLLATE NOCASE, a.currency`
    )
    .all(...types, from, to, ...cuenta.params) as unknown as Array<{
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
export function transactionsSpan(accountId: number | null = null): { from: string; to: string } | null {
  /*
   * Las dos patas del traspaso, también aquí.
   *
   * Con solo `account_id`, el histórico de una hucha empezaba hoy: lo único que
   * le pasa es recibir, y recibir se lee por `to_account_id`. «Todo» arrancaba
   * entonces en un rango vacío y el informe salía en blanco.
   */
  const filtro = accountId == null ? '' : ' AND (t.account_id = ? OR t.to_account_id = ?)'
  const params = accountId == null ? [] : [accountId, accountId]
  const row = getDb()
    .prepare(
      // El filtro se pega con AND, así que hace falta un WHERE del que colgar.
      `SELECT MIN(t.date) AS first, MAX(t.date) AS last
         FROM transactions t
        WHERE 1 = 1${filtro}`
    )
    .get(...params) as unknown as { first: string | null; last: string | null }
  return row?.first && row?.last ? { from: row.first, to: row.last } : null
}

export function monthlySeries(
  months = 12,
  accountId: number | null = null,
  reference = today()
): MonthlyPoint[] {
  const rates = rateMap()
  const base = getSettings().baseCurrency
  const cuenta = filtroDeCuenta(accountId)
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
        WHERE t.type IN ('expense','income','refund') AND t.date >= ? AND t.date <= ?${cuenta.sql}
        GROUP BY month, t.type, a.currency`
    )
    .all(first, last, ...cuenta.params) as unknown as Array<{ month: string; type: string; currency: string; total: number }>

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

  /*
   * Y los traspasos de la cuenta mirada, por el mismo criterio que el reparto:
   * lo que sale de ella baja el mes y lo que entra lo sube. Sin esto, la cinta
   * de arriba y la gráfica de abajo contarían cosas distintas de la misma
   * pantalla, que es el fallo que ya se arregló una vez en Movimientos.
   */
  if (accountId != null) {
    for (const entrando of [false, true]) {
      const lado = entrando ? 't.to_account_id' : 't.account_id'
      const importe = entrando ? 'COALESCE(t.amount_to, t.amount)' : 't.amount'
      const traspasos = getDb()
        .prepare(
          `SELECT substr(t.date, 1, 7) AS month,
                  a.currency            AS currency,
                  SUM(${importe})       AS total
             FROM transactions t
             JOIN accounts a ON a.id = ${lado}
            WHERE t.type = 'transfer' AND t.date >= ? AND t.date <= ? AND ${lado} = ?
            GROUP BY month, a.currency`
        )
        .all(first, last, accountId) as unknown as Array<{
        month: string
        currency: string
        total: number
      }>

      for (const row of traspasos) {
        const point = points.get(row.month)
        if (!point) continue
        const value = convert(Number(row.total ?? 0), row.currency, base, rates)
        if (entrando) point.income += value
        else point.expense += value
      }
    }
  }

  for (const point of points.values()) point.net = point.income - point.expense
  return [...points.values()]
}

/**
 * Suma de un tipo de movimiento en un rango, en divisa base. El gasto va neto:
 * lo que te hayan reembolsado no cuenta como gastado.
 */
export function totalFor(
  type: 'expense' | 'income',
  from: string,
  to: string,
  accountId: number | null = null
): number {
  const rates = rateMap()
  const base = getSettings().baseCurrency
  const cuenta = filtroDeCuenta(accountId)
  const types = type === 'expense' ? ['expense', 'refund'] : ['income']

  const rows = getDb()
    .prepare(
      `SELECT a.currency AS currency,
              SUM(CASE WHEN t.type = 'refund' THEN -t.amount ELSE t.amount END) AS total
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
        WHERE t.type IN (${types.map(() => '?').join(',')}) AND t.date >= ? AND t.date <= ?${cuenta.sql}
        GROUP BY a.currency`
    )
    .all(...types, from, to, ...cuenta.params) as unknown as Array<{ currency: string; total: number }>
  const propio = rows.reduce(
    (sum, row) => sum + convert(Number(row.total ?? 0), row.currency, base, rates),
    0
  )
  // Con una cuenta elegida esto ya no es «lo gastado» sino lo que sale de ella,
  // y de una cuenta también sale lo que se traspasa.
  if (accountId == null) return propio
  return propio + traspasosDe(from, to, type, accountId, rates, base).total
}

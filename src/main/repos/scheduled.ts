import { getDb, transaction as atomic, bind, nowISO } from '../db'
import { today, nextOccurrence } from '@shared/dates'
import { saveTransaction } from './transactions'
import { getSettings, rateMap } from './settings'
import { convert } from '@shared/money'
import type { Scheduled, ScheduledView, ProjectedTransaction, TxType, Frequency } from '@shared/types'

interface ScheduledRow {
  id: number
  name: string | null
  type: string
  account_id: number
  to_account_id: number | null
  category_id: number | null
  amount: number
  amount_to: number | null
  payee: string | null
  note: string | null
  freq: string
  interval: number
  next_date: string
  end_date: string | null
  auto_post: number
  active: number
  last_posted: string | null
  created_at: string
  refund_for_scheduled_id: number | null
  remind: number
  reminded_for: string | null
}

interface ScheduledViewRow extends ScheduledRow {
  account_name: string
  account_currency: string
  to_account_name: string | null
  category_name: string | null
  category_icon: string | null
  category_color: string | null
}

function mapScheduled(row: ScheduledRow): Scheduled {
  return {
    id: row.id,
    name: row.name,
    type: row.type as TxType,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    categoryId: row.category_id,
    amount: row.amount,
    amountTo: row.amount_to,
    payee: row.payee,
    note: row.note,
    freq: row.freq as Frequency,
    interval: row.interval,
    nextDate: row.next_date,
    endDate: row.end_date,
    autoPost: row.auto_post === 1,
    active: row.active === 1,
    lastPosted: row.last_posted,
    createdAt: row.created_at,
    refundForScheduledId: row.refund_for_scheduled_id,
    remind: row.remind === 1,
    remindedFor: row.reminded_for
  }
}

const VIEW_SELECT = `
  SELECT s.*,
         a.name     AS account_name,
         a.currency AS account_currency,
         d.name     AS to_account_name,
         c.name     AS category_name,
         c.icon     AS category_icon,
         c.color    AS category_color
    FROM scheduled s
    JOIN accounts a        ON a.id = s.account_id
    LEFT JOIN accounts d   ON d.id = s.to_account_id
    LEFT JOIN categories c ON c.id = s.category_id
`

function toView(row: ScheduledViewRow): ScheduledView {
  return {
    ...mapScheduled(row),
    accountName: row.account_name,
    accountCurrency: row.account_currency,
    toAccountName: row.to_account_name,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color
  }
}

export function listScheduled(includeInactive = true): ScheduledView[] {
  const where = includeInactive ? '' : 'WHERE s.active = 1'
  const rows = getDb().prepare(`${VIEW_SELECT} ${where} ORDER BY s.next_date, s.id`).all() as unknown as ScheduledViewRow[]
  return rows.map(toView)
}

export function getScheduled(id: number): ScheduledView | null {
  const rows = getDb().prepare(`${VIEW_SELECT} WHERE s.id = ?`).all(id) as unknown as ScheduledViewRow[]
  return rows.length ? toView(rows[0]) : null
}

export interface ScheduledInput {
  id?: number
  name?: string | null
  type: TxType
  accountId: number
  toAccountId?: number | null
  categoryId?: number | null
  amount: number
  amountTo?: number | null
  payee?: string | null
  note?: string | null
  freq: Frequency
  interval: number
  nextDate: string
  endDate?: string | null
  autoPost: boolean
  active?: boolean
  refundForScheduledId?: number | null
  remind?: boolean
}

export function saveScheduled(input: ScheduledInput): ScheduledView {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('El importe tiene que ser mayor que cero')
  }
  if (input.type === 'transfer' && !input.toAccountId) {
    throw new Error('Un traspaso programado necesita una cuenta de destino')
  }
  if (input.interval < 1) throw new Error('La repetición tiene que ser de al menos 1')

  const db = getDb()
  const isTransfer = input.type === 'transfer'
  const toAccountId = isTransfer ? (input.toAccountId ?? null) : null
  const categoryId = isTransfer ? null : (input.categoryId ?? null)
  // Solo una devolución puede colgar de otra programada; y nunca de sí misma.
  const refundForScheduledId =
    input.type === 'refund' && input.refundForScheduledId !== input.id
      ? (input.refundForScheduledId ?? null)
      : null

  if (input.id) {
    db.prepare(
      `UPDATE scheduled
          SET name = ?, type = ?, account_id = ?, to_account_id = ?, category_id = ?, amount = ?,
              amount_to = ?, payee = ?, note = ?, freq = ?, interval = ?, next_date = ?, end_date = ?,
              auto_post = ?, active = ?, refund_for_scheduled_id = ?, remind = ?
        WHERE id = ?`
    ).run(
      bind(input.name?.trim() || null),
      input.type,
      input.accountId,
      bind(toAccountId),
      bind(categoryId),
      input.amount,
      bind(input.amountTo),
      bind(input.payee?.trim() || null),
      bind(input.note?.trim() || null),
      input.freq,
      input.interval,
      input.nextDate,
      bind(input.endDate || null),
      input.autoPost ? 1 : 0,
      input.active === false ? 0 : 1,
      bind(refundForScheduledId),
      input.remind === false ? 0 : 1,
      input.id
    )
    return getScheduled(input.id)!
  }

  const result = db
    .prepare(
      `INSERT INTO scheduled
         (name, type, account_id, to_account_id, category_id, amount, amount_to, payee, note,
          freq, interval, next_date, end_date, auto_post, active, created_at, refund_for_scheduled_id, remind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      bind(input.name?.trim() || null),
      input.type,
      input.accountId,
      bind(toAccountId),
      bind(categoryId),
      input.amount,
      bind(input.amountTo),
      bind(input.payee?.trim() || null),
      bind(input.note?.trim() || null),
      input.freq,
      input.interval,
      input.nextDate,
      bind(input.endDate || null),
      input.autoPost ? 1 : 0,
      input.active === false ? 0 : 1,
      nowISO(),
      bind(refundForScheduledId),
      input.remind === false ? 0 : 1
    )
  return getScheduled(Number(result.lastInsertRowid))!
}

export function deleteScheduled(id: number): void {
  getDb().prepare('DELETE FROM scheduled WHERE id = ?').run(id)
}

export function setScheduledActive(id: number, active: boolean): void {
  getDb().prepare('UPDATE scheduled SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
}

/**
 * Cierra una programación para siempre: la apaga y le pone fecha de fin en el
 * día en que se cierra. A diferencia de pausarla, no se puede reanudar sola ni
 * se proyecta hacia delante; es lo que toca cuando una deuda se salda antes de
 * tiempo y esas cuotas ya no van a existir.
 */
export function finishScheduled(id: number, date = today()): void {
  getDb()
    .prepare('UPDATE scheduled SET active = 0, end_date = ? WHERE id = ?')
    .run(date, id)
}

/**
 * Movimiento que dejó la programada del gasto, para engancharle la devolución.
 * Se coge el más reciente que no sea posterior a la fecha del reembolso: si el
 * alquiler se cobra el día 1 y la parte del otro entra el 3, la devolución va
 * contra el recibo de ese mes y no contra el del siguiente.
 */
function postedByScheduled(scheduledId: number, date: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT id FROM transactions
        WHERE scheduled_id = ? AND type = 'expense' AND date <= ?
        ORDER BY date DESC, id DESC LIMIT 1`
    )
    .get(scheduledId, date) as unknown as { id: number } | undefined
  return row ? Number(row.id) : null
}

/** Crea el movimiento de una programada y avanza su fecha a la siguiente repetición. */
function post(row: Scheduled, date: string): void {
  saveTransaction({
    type: row.type,
    date,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    amount: row.amount,
    amountTo: row.amountTo,
    payee: row.payee,
    note: row.note,
    scheduledId: row.id,
    refundForId:
      row.type === 'refund' && row.refundForScheduledId
        ? postedByScheduled(row.refundForScheduledId, date)
        : null
  })

  const upcoming = nextOccurrence(date, row.freq, row.interval)
  const exhausted = row.endDate != null && upcoming > row.endDate
  getDb()
    .prepare('UPDATE scheduled SET next_date = ?, last_posted = ?, active = ? WHERE id = ?')
    .run(upcoming, date, exhausted ? 0 : 1, row.id)
}

/**
 * Materializa todas las repeticiones vencidas hasta hoy. Se llama al arrancar,
 * así que si la app lleva meses cerrada recupera todo lo pendiente de una vez.
 */
export function postDue(reference = today()): number {
  // Los gastos van delante de sus devoluciones: si el reembolso se registrara
  // primero, no habría todavía movimiento al que engancharlo.
  const rows = getDb()
    .prepare(
      `SELECT * FROM scheduled
        WHERE active = 1 AND auto_post = 1 AND next_date <= ?
        ORDER BY (refund_for_scheduled_id IS NOT NULL), next_date, id`
    )
    .all(reference) as unknown as ScheduledRow[]

  let created = 0
  atomic(() => {
    for (const raw of rows) {
      let current = mapScheduled(raw)
      // Tope de seguridad por si una diaria lleva años sin abrirse.
      let guard = 0
      while (current.active && current.nextDate <= reference && guard < 500) {
        if (current.endDate && current.nextDate > current.endDate) break
        post(current, current.nextDate)
        created++
        guard++
        const refreshed = getDb().prepare('SELECT * FROM scheduled WHERE id = ?').get(current.id) as
          | ScheduledRow
          | undefined
        if (!refreshed) break
        current = mapScheduled(refreshed)
      }
    }
  })
  return created
}

/** Ejecuta ahora una programada concreta, sin esperar a su fecha. */
export function postNow(id: number): void {
  const row = getDb().prepare('SELECT * FROM scheduled WHERE id = ?').get(id) as unknown as ScheduledRow | undefined
  if (!row) throw new Error('La programación ya no existe')
  post(mapScheduled(row), mapScheduled(row).nextDate)
}

/**
 * Proyecta las repeticiones que caen dentro de un rango, sin escribir nada.
 * Sirve para enseñar en la lista lo que está por venir; en cuanto la programada
 * se registra de verdad, su fecha avanza y la proyección desaparece sola.
 */
export function projectUpcoming(from: string, to: string, limit = 300): ProjectedTransaction[] {
  if (!from || !to || from > to) return []

  const rows = getDb()
    .prepare(`${VIEW_SELECT} WHERE s.active = 1 AND s.next_date <= ?`)
    .all(to) as unknown as ScheduledViewRow[]

  const projected: ProjectedTransaction[] = []
  const rates = rateMap()
  const base = getSettings().baseCurrency

  for (const row of rows) {
    const scheduled = toView(row)
    // Mismo criterio que en los movimientos reales: el traspaso no cambia el
    // patrimonio, el gasto resta y el ingreso o el reembolso suman.
    const converted = convert(scheduled.amount, scheduled.accountCurrency, base, rates)
    const amountInBase =
      scheduled.type === 'transfer' ? 0 : scheduled.type === 'expense' ? -converted : converted

    let date = scheduled.nextDate
    let first = true
    // Tope por programada, para que una diaria a diez años no llene la lista.
    let guard = 0

    while (date <= to && guard < 400) {
      if (scheduled.endDate && date > scheduled.endDate) break
      if (date >= from) {
        projected.push({
          scheduledId: scheduled.id,
          date,
          type: scheduled.type,
          amount: scheduled.amount,
          amountTo: scheduled.amountTo,
          amountInBase,
          accountId: scheduled.accountId,
          accountCurrency: scheduled.accountCurrency,
          accountName: scheduled.accountName,
          toAccountId: scheduled.toAccountId,
          toAccountName: scheduled.toAccountName,
          categoryName: scheduled.categoryName,
          categoryIcon: scheduled.categoryIcon,
          categoryColor: scheduled.categoryColor,
          name: scheduled.name,
          payee: scheduled.payee,
          note: scheduled.note,
          refundForScheduledId: scheduled.refundForScheduledId,
          isNext: first
        })
        first = false
      }
      date = nextOccurrence(date, scheduled.freq, scheduled.interval)
      guard++
      if (projected.length >= limit) return projected
    }
  }

  return projected.sort((a, b) => (a.date === b.date ? a.scheduledId - b.scheduledId : a.date < b.date ? 1 : -1))
}

/**
 * Programaciones que vencen en `date` y de las que aún no se ha avisado. Se
 * pregunta por la fecha de mañana, que es de lo que avisa el recordatorio.
 *
 * La fecha avisada se guarda en la fila en vez de contar con que la aplicación
 * siga abierta: así abrirla y cerrarla cinco veces en la misma tarde no trae
 * cinco veces el mismo aviso.
 */
export function pendingReminders(date: string): ScheduledView[] {
  const rows = getDb()
    .prepare(
      `${VIEW_SELECT}
        WHERE s.active = 1
          AND s.remind = 1
          AND s.next_date = ?
          AND (s.reminded_for IS NULL OR s.reminded_for <> ?)
        ORDER BY s.next_date, s.id`
    )
    .all(date, date) as unknown as ScheduledViewRow[]
  return rows.map(toView)
}

export function markReminded(id: number, date: string): void {
  getDb().prepare('UPDATE scheduled SET reminded_for = ? WHERE id = ?').run(date, id)
}

/** Próximos vencimientos ordenados por fecha, para el resumen. */
export function upcoming(limit = 5): ScheduledView[] {
  const rows = getDb()
    .prepare(`${VIEW_SELECT} WHERE s.active = 1 ORDER BY s.next_date LIMIT ?`)
    .all(limit) as unknown as ScheduledViewRow[]
  return rows.map(toView)
}

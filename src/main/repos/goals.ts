import { getDb, transaction as atomic, bind, nowISO } from '../db'
import { today, addDays } from '@shared/dates'
import { listAccountsWithBalance } from './accounts'
import { getSettings } from './settings'
import type { Goal, GoalProgress, GoalReached } from '@shared/types'

interface GoalRow {
  id: number
  name: string
  account_id: number
  target_amount: number
  target_date: string | null
  icon: string
  color: string
  note: string | null
  reserved: number
  achieved_at: string | null
  created_at: string
}

function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    accountId: row.account_id,
    targetAmount: row.target_amount,
    targetDate: row.target_date,
    icon: row.icon,
    color: row.color,
    note: row.note,
    reserved: row.reserved,
    achievedAt: row.achieved_at,
    createdAt: row.created_at
  }
}

export function listGoals(): Goal[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM goals
        ORDER BY achieved_at IS NOT NULL, target_date IS NULL, target_date, id`
    )
    .all() as unknown as GoalRow[]
  return rows.map(mapGoal)
}

export function getGoal(id: number): Goal | null {
  const row = getDb().prepare('SELECT * FROM goals WHERE id = ?').get(id) as unknown as GoalRow | undefined
  return row ? mapGoal(row) : null
}

export interface GoalInput {
  id?: number
  name: string
  accountId: number
  targetAmount: number
  targetDate?: string | null
  icon?: string
  color?: string
  note?: string | null
  achievedAt?: string | null
}

export function saveGoal(input: GoalInput): Goal {
  if (!input.name.trim()) throw new Error('El hito necesita un nombre')
  if (!Number.isInteger(input.targetAmount) || input.targetAmount <= 0) {
    throw new Error('La cantidad a juntar tiene que ser mayor que cero')
  }
  if (input.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) {
    throw new Error('La fecha del hito no es válida')
  }

  const db = getDb()
  if (input.id) {
    db.prepare(
      `UPDATE goals
          SET name = ?, account_id = ?, target_amount = ?, target_date = ?,
              icon = ?, color = ?, note = ?, achieved_at = ?
        WHERE id = ?`
    ).run(
      input.name.trim(),
      input.accountId,
      input.targetAmount,
      bind(input.targetDate || null),
      input.icon ?? 'piggy',
      input.color ?? '#34C759',
      bind(input.note?.trim() || null),
      bind(input.achievedAt || null),
      input.id
    )
    return getGoal(input.id)!
  }

  const result = db
    .prepare(
      `INSERT INTO goals (name, account_id, target_amount, target_date, icon, color, note, achieved_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      input.accountId,
      input.targetAmount,
      bind(input.targetDate || null),
      input.icon ?? 'piggy',
      input.color ?? '#34C759',
      bind(input.note?.trim() || null),
      bind(input.achievedAt || null),
      nowISO()
    )
  return getGoal(Number(result.lastInsertRowid))!
}

export function deleteGoal(id: number): void {
  getDb().prepare('DELETE FROM goals WHERE id = ?').run(id)
}

/** Da un hito por cumplido, o lo reabre. Un hito cumplido deja de repartirse saldo. */
export function setGoalAchieved(id: number, achieved: boolean, reference = today()): Goal {
  getDb()
    .prepare('UPDATE goals SET achieved_at = ? WHERE id = ?')
    .run(bind(achieved ? reference : null), id)
  // Darlo por conseguido a mano cuenta como celebrarlo: si no, quitarle el sello
  // estando ya cubierto soltaría el confeti de golpe. Al quitarlo no se toca la
  // marca: si de verdad se ha quedado corto, «pendingGoals» la desarma sola.
  if (achieved) markGoalReached(id)
  return getGoal(id)!
}

/**
 * Lo que se ha ingresado en una cuenta en los últimos noventa días, llevado a
 * ritmo mensual. Es el ritmo real de ahorro, con el que se puede decir si un
 * hito llega o no llega a su fecha.
 */
function monthlyPace(accountId: number, reference: string): number {
  const from = addDays(reference, -90)
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(entradas), 0) - COALESCE(SUM(salidas), 0) AS neto FROM (
         SELECT SUM(CASE WHEN type IN ('income','refund') THEN amount ELSE 0 END) AS entradas,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)             AS salidas
           FROM transactions WHERE account_id = ? AND date >= ? AND date <= ?
         UNION ALL
         SELECT SUM(COALESCE(amount_to, amount)), 0
           FROM transactions WHERE type = 'transfer' AND to_account_id = ? AND date >= ? AND date <= ?
         UNION ALL
         SELECT 0, SUM(amount)
           FROM transactions WHERE type = 'transfer' AND account_id = ? AND date >= ? AND date <= ?
       )`
    )
    .get(accountId, from, reference, accountId, from, reference, accountId, from, reference) as unknown as {
    neto: number
  }
  // De noventa días a mes: tres meses justos.
  return Math.round(Number(row.neto ?? 0) / 3)
}

/**
 * Reparte el saldo de cada hucha entre sus hitos, por orden de fecha: el que
 * antes vence se lleva el dinero primero. Sin este reparto, dos hitos sobre la
 * misma hucha enseñarían los mismos euros cada uno y sumarían más de lo que hay.
 *
 * Los hitos ya dados por cumplidos quedan fuera del reparto: ese dinero se
 * considera comprometido, aunque siga en la cuenta hasta que se gaste.
 */
/**
 * Hitos que han llegado a su meta y todavía no se han celebrado.
 *
 * Solo los que llegan por su propio pie: el que se sella a mano ya se da por
 * conseguido en ese gesto y no necesita fuegos artificiales.
 *
 * De paso desarma los que se han quedado por debajo. Sacar el dinero de la
 * hucha deshace el hito, y volver a juntarlo vuelve a costar lo mismo, así que
 * vuelve a merecer su enhorabuena: la marca dice «ya celebrado mientras siga
 * ahí», no «celebrado para siempre».
 */
export function pendingGoals(reference = today()): GoalReached[] {
  const marked = new Set(
    (
      getDb().prepare('SELECT id FROM goals WHERE reached_notified = 1').all() as unknown as Array<{
        id: number
      }>
    ).map((row) => row.id)
  )
  const accounts = new Map(listAccountsWithBalance().map((account) => [account.id, account]))
  const progress = goalProgress(reference)

  for (const goal of progress) {
    if (marked.has(goal.id) && goal.status !== 'complete' && goal.status !== 'achieved') {
      clearGoalReached(goal.id)
      marked.delete(goal.id)
    }
  }

  return progress
    .filter((goal) => goal.status === 'complete' && !marked.has(goal.id))
    .map((goal) => ({
      id: goal.id,
      title: goal.name,
      total: goal.targetAmount,
      currency: accounts.get(goal.accountId)?.currency ?? getSettings().baseCurrency,
      accountName: goal.accountName,
      since: goal.createdAt.slice(0, 10),
      targetDate: goal.targetDate
    }))
}

/** Celebrado: no se repite mientras el dinero siga en su sitio. */
export function markGoalReached(id: number): void {
  getDb().prepare('UPDATE goals SET reached_notified = 1 WHERE id = ?').run(id)
}

/** Y vuelta a empezar cuando el hito se deshace. */
export function clearGoalReached(id: number): void {
  getDb().prepare('UPDATE goals SET reached_notified = 0 WHERE id = ?').run(id)
}

/**
 * Reparte la hucha a mano.
 *
 * Lo que no aparece en la lista se deja como está, que así se puede tocar un
 * hito sin arrastrar a los demás. En negativo no se guarda nada: apartar menos
 * que nada no significa nada.
 */
export function setGoalReserves(entries: Array<{ id: number; amount: number }>): void {
  const db = getDb()
  return atomic(() => {
    const stmt = db.prepare('UPDATE goals SET reserved = ? WHERE id = ?')
    for (const entry of entries) stmt.run(Math.max(0, Math.round(entry.amount)), entry.id)
  })
}

/**
 * Suma —o resta— a la reserva de un hito. Es lo que hace el selector del
 * traspaso: apartar dinero al meterlo es lo mismo que repartirlo después, solo
 * que en el mismo gesto.
 */
export function addToGoalReserve(id: number, delta: number): void {
  if (!delta) return
  getDb()
    .prepare('UPDATE goals SET reserved = MAX(0, reserved + ?) WHERE id = ?')
    .run(Math.round(delta), id)
}

export function goalProgress(reference = today()): GoalProgress[] {
  const goals = listGoals()
  if (goals.length === 0) return []

  const accounts = new Map(listAccountsWithBalance().map((account) => [account.id, account]))
  const remaining = new Map<number, number>()
  const paces = new Map<number, number>()
  const savedByGoal = new Map<number, number>()

  /*
   * Cada plan tiene lo que se le haya reservado a mano, y nada más. Lo que no
   * esté en ninguno se queda como ahorro libre.
   *
   * Antes lo suelto se repartía solo entre los planes por orden de fecha. Sonaba
   * cómodo y era justo lo contrario: el dinero cambiaba de sitio sin que nadie lo
   * moviera. Si el ahorro libre es un plan más, no hay nada que repartir.
   *
   * El tope sigue siendo lo que hay: reservar no crea dinero, así que si el saldo
   * baja, las reservas se recortan por orden de fecha hasta donde llegue.
   */
  for (const goal of goals) {
    const balance = Math.max(0, accounts.get(goal.accountId)?.balance ?? 0)
    if (!remaining.has(goal.accountId)) remaining.set(goal.accountId, balance)
    if (!paces.has(goal.accountId)) paces.set(goal.accountId, monthlyPace(goal.accountId, reference))

    // El sellado a mano cuenta como cumplido y no toca la hucha.
    if (goal.achievedAt) {
      savedByGoal.set(goal.id, goal.targetAmount)
      continue
    }
    const pot = remaining.get(goal.accountId)!
    const saved = Math.min(goal.reserved, goal.targetAmount, pot)
    savedByGoal.set(goal.id, saved)
    remaining.set(goal.accountId, pot - saved)
  }

  return goals.map((goal) => {
    const account = accounts.get(goal.accountId)
    const saved = savedByGoal.get(goal.id)!

    const missing = Math.max(0, goal.targetAmount - saved)
    const percent = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0

    const daysLeft = goal.targetDate
      ? Math.round(
          (Date.parse(`${goal.targetDate}T00:00:00`) - Date.parse(`${reference}T00:00:00`)) / 86400000
        )
      : null
    // Con menos de un mes por delante se sigue midiendo en meses, para que la
    // cifra siga siendo comparable con el ritmo de ahorro.
    const perMonth =
      daysLeft != null && daysLeft > 0 && missing > 0
        ? Math.round(missing / Math.max(0.25, daysLeft / 30))
        : null

    const recentPace = paces.get(goal.accountId)!
    const status: GoalProgress['status'] = goal.achievedAt
      ? 'achieved'
      : missing === 0
        ? 'complete'
        : daysLeft == null
          ? 'open'
          : daysLeft < 0
            ? 'late'
            : perMonth != null && recentPace > 0 && recentPace >= perMonth
              ? 'onTrack'
              : 'behind'

    return {
      ...goal,
      accountName: account?.name ?? 'Cuenta borrada',
      saved,
      missing,
      percent,
      daysLeft,
      perMonth,
      recentPace,
      status
    }
  })
}

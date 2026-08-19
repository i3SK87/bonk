import { getDb, bind, nowISO } from '../db'
import { today, addDays } from '@shared/dates'
import { listAccountsWithBalance } from './accounts'
import type { Goal, GoalProgress } from '@shared/types'

interface GoalRow {
  id: number
  name: string
  account_id: number
  target_amount: number
  target_date: string | null
  icon: string
  color: string
  note: string | null
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
export function goalProgress(reference = today()): GoalProgress[] {
  const goals = listGoals()
  if (goals.length === 0) return []

  const accounts = new Map(listAccountsWithBalance().map((account) => [account.id, account]))
  const remaining = new Map<number, number>()
  const paces = new Map<number, number>()

  return goals.map((goal) => {
    const account = accounts.get(goal.accountId)
    const balance = account?.balance ?? 0
    if (!remaining.has(goal.accountId)) remaining.set(goal.accountId, Math.max(0, balance))
    if (!paces.has(goal.accountId)) paces.set(goal.accountId, monthlyPace(goal.accountId, reference))

    const pot = remaining.get(goal.accountId)!
    const saved = goal.achievedAt ? goal.targetAmount : Math.min(pot, goal.targetAmount)
    if (!goal.achievedAt) remaining.set(goal.accountId, pot - saved)

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

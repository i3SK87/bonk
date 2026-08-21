import { getDb, transaction as atomic, bind, nowISO } from '../db'
import { convert, formatMoney } from '@shared/money'
import { formatDate } from '@shared/dates'
import { getSettings, rateMap } from './settings'
import type { Account, AccountWithBalance, AccountType } from '@shared/types'

interface AccountRow {
  id: number
  name: string
  type: string
  currency: string
  initial_balance: number
  icon: string
  color: string
  exclude_from_total: number
  allow_negative: number
  archived: number
  is_primary: number
  sort_order: number
  note: string | null
  low_balance_threshold: number
  created_at: string
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    currency: row.currency,
    initialBalance: row.initial_balance,
    icon: row.icon,
    color: row.color,
    excludeFromTotal: row.exclude_from_total === 1,
    allowNegative: row.allow_negative === 1,
    archived: row.archived === 1,
    isPrimary: row.is_primary === 1,
    sortOrder: row.sort_order,
    note: row.note,
    lowBalanceThreshold: row.low_balance_threshold,
    createdAt: row.created_at
  }
}

/**
 * En qué orden se piensan los tipos de cuenta.
 *
 * Manda para elegir la cuenta que viene marcada al registrar un movimiento: se
 * apunta desde la del banco, no desde la hucha ni desde el préstamo del coche.
 */
const TYPE_ORDER: AccountType[] = ['bank', 'cash', 'card', 'investment', 'savings', 'debt']

/**
 * Todas las cuentas, con las principales por delante.
 *
 * El orden sale de aquí una sola vez y lo hereda todo lo demás —la pestaña
 * Cuentas, los desplegables de los formularios, las pastillas de los filtros—.
 * Delante van las principales de cada tipo, por orden de tipo, y detrás el resto
 * con el suyo.
 */
export function listAccounts(includeArchived = false): Account[] {
  const where = includeArchived ? '' : 'WHERE archived = 0'
  const rows = getDb().prepare(`SELECT * FROM accounts ${where}`).all() as unknown as AccountRow[]
  const rank = (row: AccountRow): number => {
    const tipo = TYPE_ORDER.indexOf(row.type as AccountType)
    return (row.is_primary === 1 ? 0 : 100) + (tipo < 0 ? TYPE_ORDER.length : tipo)
  }
  return rows
    .sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order || a.id - b.id)
    .map(mapAccount)
}

/**
 * La principal de un tipo, si la hay.
 *
 * Es lo que sustituye a los dos ajustes que había antes —una cuenta principal
 * suelta y una hucha principal aparte—: la marca vive en la cuenta y cada tipo
 * tiene la suya.
 */
export function primaryAccount(type: AccountType): Account | null {
  const row = getDb()
    .prepare('SELECT * FROM accounts WHERE type = ? AND is_primary = 1 AND archived = 0')
    .get(type) as unknown as AccountRow | undefined
  return row ? mapAccount(row) : null
}

/** La que viene marcada al registrar un movimiento. */
export function preferredAccount(): Account | null {
  for (const type of TYPE_ORDER) {
    const found = primaryAccount(type)
    if (found) return found
  }
  return listAccounts()[0] ?? null
}

/**
 * Marca esta cuenta como la principal de su tipo, o le quita la marca. Solo una
 * por tipo: poner una quita la que hubiera.
 */
export function setPrimaryAccount(id: number, primary: boolean): void {
  const db = getDb()
  const row = db.prepare('SELECT type FROM accounts WHERE id = ?').get(id) as unknown as
    | { type: string }
    | undefined
  if (!row) return
  atomic(() => {
    if (primary) db.prepare('UPDATE accounts SET is_primary = 0 WHERE type = ?').run(row.type)
    db.prepare('UPDATE accounts SET is_primary = ? WHERE id = ?').run(primary ? 1 : 0, id)
  })
}

export function getAccount(id: number): Account | null {
  const row = getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as unknown as AccountRow | undefined
  return row ? mapAccount(row) : null
}

/**
 * Saldo de cada cuenta: el inicial más los ingresos y traspasos recibidos,
 * menos los gastos y traspasos enviados. En un traspaso entre divisas distintas
 * la cuenta destino suma `amount_to`, que es lo que realmente entra.
 */
export function listAccountsWithBalance(includeArchived = false): AccountWithBalance[] {
  const accounts = listAccounts(includeArchived)
  const rates = rateMap()
  const base = getSettings().baseCurrency

  const movements = getDb()
    .prepare(
      `SELECT account_id AS id,
              -- El reembolso entra en la cuenta igual que un ingreso.
              SUM(CASE WHEN type IN ('income','refund') THEN amount ELSE -amount END) AS delta
         FROM transactions
        GROUP BY account_id
        UNION ALL
       SELECT to_account_id AS id,
              SUM(COALESCE(amount_to, amount)) AS delta
         FROM transactions
        WHERE type = 'transfer' AND to_account_id IS NOT NULL
        GROUP BY to_account_id`
    )
    .all() as unknown as Array<{ id: number; delta: number }>

  const deltas = new Map<number, number>()
  for (const row of movements) {
    deltas.set(row.id, (deltas.get(row.id) ?? 0) + Number(row.delta ?? 0))
  }

  return accounts.map((account) => {
    const balance = account.initialBalance + (deltas.get(account.id) ?? 0)
    return {
      ...account,
      balance,
      balanceInBase: convert(balance, account.currency, base, rates)
    }
  })
}

export function netWorth(): number {
  return listAccountsWithBalance()
    .filter((account) => !account.excludeFromTotal)
    .reduce((sum, account) => sum + account.balanceInBase, 0)
}

export interface AccountInput {
  id?: number
  name: string
  type: AccountType
  currency: string
  initialBalance: number
  icon: string
  color: string
  excludeFromTotal: boolean
  allowNegative?: boolean
  note?: string | null
  lowBalanceThreshold?: number
  archived?: boolean
}

/** Del efectivo y del ahorro no se puede sacar lo que no hay; una tarjeta sí vive en negativo. */
function defaultAllowNegative(type: AccountType): boolean {
  return type !== 'cash' && type !== 'savings'
}

export function saveAccount(input: AccountInput): Account {
  return atomic(() => saveAccountInner(input))
}

function saveAccountInner(input: AccountInput): Account {
  const db = getDb()
  const allowNegative = input.allowNegative ?? defaultAllowNegative(input.type)

  if (input.id) {
    db.prepare(
      `UPDATE accounts
          SET name = ?, type = ?, currency = ?, initial_balance = ?, icon = ?, color = ?,
              exclude_from_total = ?, allow_negative = ?, note = ?,
              low_balance_threshold = ?, archived = ?
        WHERE id = ?`
    ).run(
      input.name,
      input.type,
      input.currency.toUpperCase(),
      bind(input.initialBalance) as number,
      input.icon,
      input.color,
      input.excludeFromTotal ? 1 : 0,
      allowNegative ? 1 : 0,
      bind(input.note),
      Math.max(0, input.lowBalanceThreshold ?? 0),
      input.archived ? 1 : 0,
      input.id
    )
    // Una cuenta archivada desaparece de los desplegables, así que tampoco puede
    // seguir siendo la principal de su tipo.
    if (input.archived) db.prepare('UPDATE accounts SET is_primary = 0 WHERE id = ?').run(input.id)
    // Bajar el saldo de partida también puede meter la cuenta en números rojos.
    assertNoOverdraft([input.id])
    return getAccount(input.id)!
  }

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM accounts').get() as unknown as { m: number }
  const result = db
    .prepare(
      `INSERT INTO accounts
         (name, type, currency, initial_balance, icon, color, exclude_from_total, allow_negative,
          note, low_balance_threshold, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.type,
      input.currency.toUpperCase(),
      bind(input.initialBalance) as number,
      input.icon,
      input.color,
      input.excludeFromTotal ? 1 : 0,
      allowNegative ? 1 : 0,
      bind(input.note),
      Math.max(0, input.lowBalanceThreshold ?? 0),
      Number(maxOrder.m) + 1,
      nowISO()
    )
  return getAccount(Number(result.lastInsertRowid))!
}

/**
 * Borra la cuenta y sus movimientos.
 *
 * Los traspasos son el caso delicado: tocan dos cuentas, y si se borrasen en
 * bloque la cuenta que sobrevive vería cambiar su saldo sin que nadie haya
 * tocado nada. Por eso antes se degradan a gasto o ingreso simple en la cuenta
 * superviviente, que es lo que de verdad pasó con ese dinero.
 */
export function deleteAccount(id: number): void {
  const db = getDb()
  atomic(() => {
    // Salía de la cuenta borrada: para el destino sigue siendo un ingreso.
    db.prepare(
      `UPDATE transactions
          SET type = 'income',
              account_id = to_account_id,
              amount = COALESCE(amount_to, amount),
              to_account_id = NULL,
              amount_to = NULL
        WHERE type = 'transfer' AND account_id = ? AND to_account_id IS NOT NULL`
    ).run(id)

    // Entraba en la cuenta borrada: para el origen sigue siendo un gasto.
    db.prepare(
      `UPDATE transactions
          SET type = 'expense', to_account_id = NULL, amount_to = NULL
        WHERE type = 'transfer' AND to_account_id = ?`
    ).run(id)

    // El resto de movimientos de la cuenta se van en cascada con ella.
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id)

    // Si era la cuenta principal, el ajuste se queda sin apuntar a nada.

  })
}

/**
 * Punto más bajo por el que pasa el saldo de una cuenta a lo largo de su
 * historia, no solo el saldo de hoy: apuntar un gasto con fecha antigua puede
 * dejarla en descubierto en mitad del recorrido aunque hoy cuadre.
 */
export function lowestBalance(accountId: number): { amount: number; date: string | null } {
  const account = getAccount(accountId)
  if (!account) return { amount: 0, date: null }

  const row = getDb()
    .prepare(
      `WITH movimientos AS (
         SELECT date, id,
                CASE WHEN account_id = :id AND type IN ('income','refund') THEN amount
                     WHEN account_id = :id THEN -amount
                     ELSE 0 END
                + CASE WHEN to_account_id = :id AND type = 'transfer' THEN COALESCE(amount_to, amount)
                     ELSE 0 END AS delta
           FROM transactions
          WHERE account_id = :id OR to_account_id = :id
       ),
       saldos AS (
         SELECT date, SUM(delta) OVER (ORDER BY date, id) AS saldo FROM movimientos
       )
       SELECT saldo, date FROM saldos ORDER BY saldo ASC, date ASC LIMIT 1`
    )
    .get({ id: accountId }) as unknown as { saldo: number; date: string } | undefined

  if (!row) return { amount: account.initialBalance, date: null }
  return { amount: account.initialBalance + Number(row.saldo ?? 0), date: row.date }
}

/**
 * Rechaza los cambios que dejarían en descubierto una cuenta que no lo admite.
 * Se llama después de tocar los datos y dentro de la transacción, así que basta
 * con lanzar el error para que todo se deshaga.
 */
export function assertNoOverdraft(accountIds: Array<number | null | undefined>): void {
  const seen = new Set<number>()
  for (const id of accountIds) {
    if (!id || seen.has(id)) continue
    seen.add(id)

    const account = getAccount(id)
    if (!account || account.allowNegative) continue

    const lowest = lowestBalance(id)
    if (lowest.amount >= 0) continue

    const disponible = formatMoney(lowest.amount, account.currency)
    const cuando = lowest.date ? ` el ${formatDate(lowest.date)}` : ''
    throw new Error(
      `«${account.name}» se quedaría en ${disponible}${cuando}, y es una cuenta que no admite números rojos. ` +
        `Ajusta el importe, la fecha o el saldo de partida de la cuenta.`
    )
  }
}

export function countAccountTransactions(id: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?')
    .get(id, id) as unknown as { n: number }
  return Number(row.n)
}

/** Si a esta cuenta ya se le ha dado el aviso de saldo bajo. */
export function isLowBalanceWarned(id: number): boolean {
  const row = getDb().prepare('SELECT low_balance_warned AS w FROM accounts WHERE id = ?').get(id) as
    | { w: number }
    | undefined
  return row?.w === 1
}

/** Se arma al avisar y se desarma cuando el saldo remonta. */
export function setLowBalanceWarned(id: number, warned: boolean): void {
  getDb().prepare('UPDATE accounts SET low_balance_warned = ? WHERE id = ?').run(warned ? 1 : 0, id)
}

export function reorderAccounts(ids: number[]): void {
  const stmt = getDb().prepare('UPDATE accounts SET sort_order = ? WHERE id = ?')
  ids.forEach((id, index) => stmt.run(index, id))
}

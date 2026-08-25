import { getDb, transaction as atomic, bind, nowISO } from '../db'
import { convert, currencyDecimals } from '@shared/money'
import { getSettings, rateMap } from './settings'
import { assertNoOverdraft } from './accounts'
import { tagsForTransactions } from './tags'
import { addToGoalReserve } from './goals'
import type {
  Transaction,
  TransactionView,
  TransactionInput,
  TransactionFilter,
  FilterTotals,
  TxType
} from '@shared/types'

interface TxRow {
  id: number
  type: string
  date: string
  time: string | null
  account_id: number
  to_account_id: number | null
  category_id: number | null
  amount: number
  amount_to: number | null
  payee: string | null
  note: string | null
  place: string | null
  lat: number | null
  lon: number | null
  scheduled_id: number | null
  refund_for_id: number | null
  goal_id: number | null
  created_at: string
  updated_at: string
}

interface TxViewRow extends TxRow {
  account_name: string
  account_currency: string
  account_color: string
  to_account_name: string | null
  to_account_currency: string | null
  category_name: string | null
  category_icon: string | null
  category_color: string | null
  attachment_count: number
  is_debt: number | null
}

function mapTransaction(row: TxRow): Transaction {
  return {
    id: row.id,
    type: row.type as TxType,
    date: row.date,
    time: row.time,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    categoryId: row.category_id,
    amount: row.amount,
    amountTo: row.amount_to,
    payee: row.payee,
    note: row.note,
    place: row.place,
    lat: row.lat,
    lon: row.lon,
    scheduledId: row.scheduled_id,
    refundForId: row.refund_for_id,
    goalId: row.goal_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * Reembolsos enlazados a cada gasto, convertidos a la divisa del gasto para
 * poder restarlos aunque el dinero haya vuelto a una cuenta en otra moneda.
 */
function refundTotalsFor(ids: number[]): Map<number, number> {
  const totals = new Map<number, number>()
  if (ids.length === 0) return totals

  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT r.refund_for_id AS parentId,
              ra.currency     AS refundCurrency,
              pa.currency     AS parentCurrency,
              SUM(r.amount)   AS total
         FROM transactions r
         JOIN accounts ra ON ra.id = r.account_id
         JOIN transactions p ON p.id = r.refund_for_id
         JOIN accounts pa ON pa.id = p.account_id
        WHERE r.type = 'refund' AND r.refund_for_id IN (${placeholders})
        GROUP BY r.refund_for_id, ra.currency, pa.currency`
    )
    .all(...ids) as unknown as Array<{
    parentId: number
    refundCurrency: string
    parentCurrency: string
    total: number
  }>

  const rates = rateMap()
  for (const row of rows) {
    const value = convert(Number(row.total ?? 0), row.refundCurrency, row.parentCurrency, rates)
    totals.set(row.parentId, (totals.get(row.parentId) ?? 0) + value)
  }
  return totals
}


/** Cómo se llama cada tipo en la interfaz; es por donde se le busca. */
const NOMBRE_DE_TIPO: Record<TxType, string> = {
  expense: 'gasto',
  income: 'ingreso',
  transfer: 'traspaso',
  refund: 'reembolso'
}

const VIEW_SELECT = `
  SELECT t.*,
         a.name     AS account_name,
         a.currency AS account_currency,
         a.color    AS account_color,
         d.name     AS to_account_name,
         d.currency AS to_account_currency,
         c.name     AS category_name,
         c.icon     AS category_icon,
         c.color    AS category_color,
         /*
          * Si esto es la cuota de una deuda a plazos.
          *
          * No basta con mirar la programada que lo creó: el primer pago —el día
          * que compras el portátil— se apunta a mano y la programación se monta
          * después, así que nunca lleva su marca. Y una deuda de hace tres años
          * tiene cuotas apuntadas mucho antes de que existiera el plan.
          *
          * Así que vale la misma regla con la que debtSummary cuenta lo pagado:
          * un gasto de la misma categoría y la misma nota que una deuda es una
          * cuota suya. Tienen que decir lo mismo los dos —si Deudas lo cuenta
          * como cuota, la lista tiene que tratarlo como cuota—.
          */
         (CASE
            WHEN s.is_debt = 1 THEN 1
            WHEN t.type = 'expense' AND t.note IS NOT NULL AND EXISTS (
              SELECT 1 FROM scheduled q
               WHERE q.is_debt = 1
                 AND q.category_id = t.category_id
                 AND q.note = t.note
            ) THEN 1
            ELSE 0
          END) AS is_debt,
         (SELECT COUNT(*) FROM attachments x WHERE x.transaction_id = t.id) AS attachment_count
    FROM transactions t
    JOIN accounts a        ON a.id = t.account_id
    LEFT JOIN accounts d   ON d.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN scheduled s  ON s.id = t.scheduled_id
`

/** Traduce el filtro de la interfaz a una cláusula WHERE con parámetros posicionales. */
function buildWhere(filter: TransactionFilter): { sql: string; params: Array<string | number> } {
  const clauses: string[] = []
  const params: Array<string | number> = []

  if (filter.from) {
    clauses.push('t.date >= ?')
    params.push(filter.from)
  }
  if (filter.to) {
    clauses.push('t.date <= ?')
    params.push(filter.to)
  }
  if (filter.types?.length) {
    clauses.push(`t.type IN (${filter.types.map(() => '?').join(',')})`)
    params.push(...filter.types)
  }
  if (filter.accountIds?.length) {
    const marks = filter.accountIds.map(() => '?').join(',')
    // Una cuenta también aparece cuando es el destino de un traspaso.
    clauses.push(`(t.account_id IN (${marks}) OR t.to_account_id IN (${marks}))`)
    params.push(...filter.accountIds, ...filter.accountIds)
  }
  if (filter.categoryIds?.length || filter.uncategorized) {
    // Van en un solo paréntesis unidas por OR: elegir «Comida» y «Sin
    // categoría» a la vez pide las dos cosas, no la intersección, que sería
    // siempre vacía.
    const parts: string[] = []
    if (filter.categoryIds?.length) {
      parts.push(`t.category_id IN (${filter.categoryIds.map(() => '?').join(',')})`)
      params.push(...filter.categoryIds)
    }
    if (filter.uncategorized) parts.push("(t.category_id IS NULL AND t.type <> 'transfer')")
    clauses.push(`(${parts.join(' OR ')})`)
  }
  if (filter.tagIds?.length) {
    const marks = filter.tagIds.map(() => '?').join(',')
    clauses.push(`t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id IN (${marks}))`)
    params.push(...filter.tagIds)
  }
  if (filter.minAmount != null) {
    clauses.push('t.amount >= ?')
    params.push(filter.minAmount)
  }
  if (filter.maxAmount != null) {
    clauses.push('t.amount <= ?')
    params.push(filter.maxAmount)
  }
  if (filter.search?.trim()) {
    const text = filter.search.trim()
    const needle = `%${text}%`
    const parts = [
      't.payee LIKE ?',
      't.note LIKE ?',
      't.place LIKE ?',
      'c.name LIKE ?',
      'a.name LIKE ?',
      `t.id IN (SELECT tt.transaction_id FROM transaction_tags tt
                 JOIN tags g ON g.id = tt.tag_id WHERE g.name LIKE ?)`
    ]
    params.push(needle, needle, needle, needle, needle, needle)

    /*
     * Y por el nombre del tipo: «reembolso» trae las devoluciones.
     *
     * En la lista, lo que dice que algo es una devolución es una etiqueta que
     * pone «Reembolso», así que se busca como se busca cualquier otra etiqueta.
     * El tipo se guarda en inglés, de modo que la traducción se hace aquí.
     *
     * Por el principio de la palabra y con tres letras mínimo: «traspaso» lleva
     * una «a» dentro, y buscando «a» no puede salir de golpe todo lo que se ha
     * movido entre cuentas.
     */
    const suena = text.toLowerCase()
    if (suena.length >= 3) {
      const tipos = (Object.keys(NOMBRE_DE_TIPO) as TxType[]).filter((tipo) =>
        NOMBRE_DE_TIPO[tipo].startsWith(suena)
      )
      if (tipos.length > 0) {
        parts.push(`t.type IN (${tipos.map(() => '?').join(',')})`)
        params.push(...tipos)
      }
    }

    /*
     * Los importes se buscan por trozos, igual que los nombres.
     *
     * Buscaban por igualdad, así que hasta no escribir «9,17» entero no aparecía
     * nada: escribir «9» no encontraba los 9,17 € y el buscador parecía roto
     * mientras se teclea, justo al revés que con los nombres, que van
     * estrechando la lista letra a letra.
     *
     * Se compara contra el importe escrito como se lee —«9,17» y no 917— para
     * que la coma cuente y «9,1» no traiga los 91 €. Sin millares a propósito:
     * quien busca «1234» quiere los 1.234,00 € y no va a escribir el punto.
     *
     * Los decimales son los de la divisa base, que es con los que se escriben
     * los importes en la lista. El signo sobra: se guardan siempre en positivo.
     */
    const soloCifra = /^[0-9]*[.,]?[0-9]*$/.test(text) && /[0-9]/.test(text)
    if (soloCifra) {
      const decimales = currencyDecimals(getSettings().baseCurrency)
      const divisor = 10 ** decimales
      // El punto del teclado numérico vale igual que la coma.
      const trozo = `%${text.replace(/\./g, ',')}%`
      const comoSeLee = (columna: string): string =>
        `replace(printf('%.${decimales}f', ${columna} / ${divisor}.0), '.', ',')`
      parts.push(`${comoSeLee('t.amount')} LIKE ?`, `${comoSeLee('t.amount_to')} LIKE ?`)
      params.push(trozo, trozo)
    }
    clauses.push(`(${parts.join(' OR ')})`)
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** Efecto del movimiento sobre el patrimonio, convertido a la divisa base. */
function amountInBase(row: TxViewRow, rates: Record<string, number>, base: string): number {
  // Mover dinero entre cuentas propias no cambia el patrimonio total.
  if (row.type === 'transfer') return 0
  const value = convert(row.amount, row.account_currency, base, rates)
  // El reembolso devuelve dinero, así que suma igual que un ingreso.
  return row.type === 'expense' ? -value : value
}

function toView(
  row: TxViewRow,
  tags: Map<number, TransactionView['tags']>,
  refunds: Map<number, number>,
  rates: Record<string, number>,
  base: string
): TransactionView {
  return {
    ...mapTransaction(row),
    refundedTotal: refunds.get(row.id) ?? 0,
    accountName: row.account_name,
    accountCurrency: row.account_currency,
    accountColor: row.account_color,
    toAccountName: row.to_account_name,
    toAccountCurrency: row.to_account_currency,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    tags: tags.get(row.id) ?? [],
    attachmentCount: Number(row.attachment_count ?? 0),
    amountInBase: amountInBase(row, rates, base),
    isDebt: row.is_debt === 1
  }
}

export function listTransactions(filter: TransactionFilter = {}): TransactionView[] {
  const { sql, params } = buildWhere(filter)
  const limit = filter.limit ?? 500
  const offset = filter.offset ?? 0

  const rows = getDb()
    .prepare(`${VIEW_SELECT} ${sql} ORDER BY t.date DESC, t.time DESC, t.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as unknown as TxViewRow[]

  const tags = tagsForTransactions(rows.map((row) => row.id))
  const refunds = refundTotalsFor(rows.map((row) => row.id))
  const rates = rateMap()
  const base = getSettings().baseCurrency
  return rows.map((row) => toView(row, tags, refunds, rates, base))
}

/**
 * Los totales de todo lo que encaja con el filtro, no de lo que quepa en la
 * lista.
 *
 * La pantalla de Movimientos los sacaba sumando las filas que tenía cargadas, y
 * la lista viene con tope —doscientas— para no traerse años enteros de golpe.
 * Con más movimientos que ese tope, las tres cifras de arriba contaban solo un
 * trozo: en un año con trescientas noventa y tres, el balance salía en rojo
 * cuando estaba en verde. Contaba lo que se veía y lo llamaba «del periodo».
 *
 * Aquí se suma en la base de datos, con el mismo filtro y sin tope. Se agrupa
 * por divisa porque convertir hay que hacerlo antes de sumar: juntar euros con
 * libras y convertir el montón daría cualquier cosa.
 *
 * Las fechas extremas salen de la misma pasada, que es lo que permite repartir
 * el gasto entre los días que de verdad abarca lo filtrado.
 */
export function totalsForFilter(filter: TransactionFilter = {}): FilterTotals {
  const { sql, params } = buildWhere(filter)
  const rows = getDb()
    .prepare(
      `SELECT t.type       AS type,
              a.currency   AS currency,
              SUM(t.amount) AS total,
              COUNT(*)     AS n,
              MIN(t.date)  AS primera,
              MAX(t.date)  AS ultima
         FROM transactions t
         JOIN accounts a        ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
       ${sql}
       GROUP BY t.type, a.currency`
    )
    .all(...params) as unknown as Array<{
    type: string
    currency: string
    total: number
    n: number
    primera: string | null
    ultima: string | null
  }>

  const rates = rateMap()
  const base = getSettings().baseCurrency

  let income = 0
  let expense = 0
  let count = 0
  let firstDate: string | null = null
  let lastDate: string | null = null

  for (const row of rows) {
    count += Number(row.n)
    if (row.primera && (!firstDate || row.primera < firstDate)) firstDate = row.primera
    if (row.ultima && (!lastDate || row.ultima > lastDate)) lastDate = row.ultima

    const valor = convert(Number(row.total), row.currency, base, rates)
    // Igual que en la lista: un traspaso no mueve el patrimonio, y lo devuelto
    // deja de ser gasto en vez de convertirse en ingreso.
    if (row.type === 'income') income += valor
    else if (row.type === 'expense') expense += valor
    else if (row.type === 'refund') expense -= valor
  }

  return { income, expense, net: income - expense, count, firstDate, lastDate }
}

export function countTransactions(filter: TransactionFilter = {}): number {
  const { sql, params } = buildWhere(filter)
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n
         FROM transactions t
         JOIN accounts a        ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
       ${sql}`
    )
    .get(...params) as unknown as { n: number }
  return Number(row.n)
}

export function getTransaction(id: number): TransactionView | null {
  const rows = getDb().prepare(`${VIEW_SELECT} WHERE t.id = ?`).all(id) as unknown as TxViewRow[]
  if (rows.length === 0) return null
  const tags = tagsForTransactions([id])
  return toView(rows[0], tags, refundTotalsFor([id]), rateMap(), getSettings().baseCurrency)
}

/** Reembolsos enlazados a un gasto, para listarlos en su ficha. */
export function listRefundsFor(transactionId: number): TransactionView[] {
  const rows = getDb()
    .prepare(`${VIEW_SELECT} WHERE t.refund_for_id = ? ORDER BY t.date DESC, t.id DESC`)
    .all(transactionId) as unknown as TxViewRow[]
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  return rows.map((row) =>
    toView(row, tagsForTransactions(ids), refundTotalsFor(ids), rateMap(), getSettings().baseCurrency)
  )
}

/**
 * Gastos a los que un reembolso se puede enganchar: los de ese mismo día, con
 * algo pendiente de devolver. Un reembolso se apunta cuando se reparte el gasto,
 * así que el del día es el que se busca; para uno que llega semanas después está
 * el botón «Registrar reembolso» de la ficha del gasto.
 *
 * `linkedId` mantiene en la lista el gasto ya enlazado aunque sea de otro día:
 * al editar un reembolso antiguo, el desplegable no puede perder su valor.
 */
export function refundCandidates(
  date: string,
  excludeId?: number,
  linkedId?: number,
  limit = 25
): TransactionView[] {
  const rows = getDb()
    .prepare(
      `${VIEW_SELECT}
        WHERE t.type = 'expense'
          AND (t.date = ? OR t.id = ?)
          AND t.id <> ?
        ORDER BY t.date DESC, t.id DESC
        LIMIT ?`
    )
    .all(date, linkedId ?? -1, excludeId ?? -1, limit) as unknown as TxViewRow[]
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const refunds = refundTotalsFor(ids)
  const rates = rateMap()
  const base = getSettings().baseCurrency
  return rows
    .map((row) => toView(row, tagsForTransactions(ids), refunds, rates, base))
    .filter((row) => row.refundedTotal < row.amount || row.id === linkedId)
}

function validate(input: TransactionInput): void {
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error('La fecha del movimiento no es válida')
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('El importe tiene que ser mayor que cero')
  }
  if (input.type === 'transfer') {
    if (!input.toAccountId) throw new Error('Un traspaso necesita una cuenta de destino')
    if (input.toAccountId === input.accountId) {
      throw new Error('El origen y el destino de un traspaso no pueden ser la misma cuenta')
    }
  }
  if (input.type === 'refund') {
    // De un reembolso hay que saber de dónde sale el dinero que vuelve: el gasto
    // concreto —de donde además se saca la categoría— o, para las devoluciones
    // programadas que entran sueltas, al menos la categoría.
    if (!input.refundForId && !input.categoryId) throw new Error('Elige el gasto que te devuelven')
    if (input.refundForId && input.refundForId === input.id) {
      throw new Error('Un movimiento no puede reembolsarse a sí mismo')
    }
  }
}

export function saveTransaction(input: TransactionInput): TransactionView {
  validate(input)
  const db = getDb()

  return atomic(() => {
    const isTransfer = input.type === 'transfer'
    const toAccountId = isTransfer ? (input.toAccountId ?? null) : null
    let categoryId = isTransfer ? null : (input.categoryId ?? null)
    // Solo un reembolso puede colgar de otro movimiento.
    const refundForId = input.type === 'refund' ? (input.refundForId ?? null) : null

    // El dinero solo tiene dueño cuando se aparta a propósito: un traspaso que
    // entra en una hucha. En cualquier otro movimiento el hito no pinta nada.
    const goalId = isTransfer && toAccountId != null ? (input.goalId ?? null) : null

    // El reembolso hereda la categoría del gasto que devuelve: descuenta de ese
    // gasto, así que no puede contar en una categoría distinta de la suya.
    if (refundForId) {
      const parent = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(refundForId) as
        | { category_id: number | null }
        | undefined
      if (!parent) throw new Error('El gasto que quieres reembolsar ya no existe')
      categoryId = parent.category_id
    }

    // En traspasos entre divisas distintas guardamos además lo que entra en destino.
    let amountTo: number | null = null
    if (isTransfer && toAccountId) {
      const origin = db.prepare('SELECT currency FROM accounts WHERE id = ?').get(input.accountId) as
        | { currency: string }
        | undefined
      const target = db.prepare('SELECT currency FROM accounts WHERE id = ?').get(toAccountId) as
        | { currency: string }
        | undefined
      if (origin && target && origin.currency !== target.currency) {
        amountTo =
          input.amountTo && input.amountTo > 0
            ? input.amountTo
            : convert(input.amount, origin.currency, target.currency, rateMap())
      }
    }

    const now = nowISO()
    let id = input.id ?? 0

    // Al editar hay que vigilar también las cuentas de las que sale el movimiento,
    // por si se ha cambiado de cuenta y la anterior se queda descuadrada.
    const previous = id ? getTransaction(id) : null
    const previousAccountId = previous?.accountId ?? null
    const previousToAccountId = previous?.toAccountId ?? null

    if (id) {
      db.prepare(
        `UPDATE transactions
            SET type = ?, date = ?, time = ?, account_id = ?, to_account_id = ?, category_id = ?,
                amount = ?, amount_to = ?, payee = ?, note = ?, place = ?, lat = ?, lon = ?,
                refund_for_id = ?, goal_id = ?, updated_at = ?
          WHERE id = ?`
      ).run(
        input.type,
        input.date,
        bind(input.time),
        input.accountId,
        bind(toAccountId),
        bind(categoryId),
        input.amount,
        bind(amountTo),
        bind(input.payee?.trim() || null),
        bind(input.note?.trim() || null),
        bind(input.place),
        bind(input.lat),
        bind(input.lon),
        bind(refundForId),
        bind(goalId),
        now,
        id
      )

      /*
       * Corregir la categoría de un recibo la corrige también en su programación.
       *
       * Un movimiento que ha salido de una programada arrastra su categoría, así
       * que cambiarla solo aquí duraba hasta el mes siguiente: el recibo volvía a
       * entrar con la equivocada y había que corregirlo otra vez, sin saber que
       * la que había que tocar era la ficha de Programados.
       *
       * Solo cuando de verdad cambia, y solo la categoría: la fecha y el importe
       * de un mes concreto son suyos y no dicen nada de los que vienen.
       */
      if (previous?.scheduledId && previous.categoryId !== categoryId) {
        db.prepare('UPDATE scheduled SET category_id = ? WHERE id = ?').run(
          bind(categoryId),
          previous.scheduledId
        )
      }
    } else {
      const result = db
        .prepare(
          `INSERT INTO transactions
             (type, date, time, account_id, to_account_id, category_id, amount, amount_to,
              payee, note, place, lat, lon, refund_for_id, goal_id, scheduled_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.type,
          input.date,
          bind(input.time),
          input.accountId,
          bind(toAccountId),
          bind(categoryId),
          input.amount,
          bind(amountTo),
          bind(input.payee?.trim() || null),
          bind(input.note?.trim() || null),
          bind(input.place),
          bind(input.lat),
          bind(input.lon),
          bind(refundForId),
          bind(goalId),
          bind(input.scheduledId),
          now,
          now
        )
      id = Number(result.lastInsertRowid)
    }

    if (input.tagIds) {
      db.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').run(id)
      const link = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)')
      for (const tagId of input.tagIds) link.run(id, tagId)
    }

    // Con el movimiento ya escrito se mira el resultado; si deja en descubierto
    // una cuenta que no lo admite, el error deshace toda la transacción.
    assertNoOverdraft([input.accountId, toAccountId, previousAccountId, previousToAccountId])

    // La reserva del hito se mueve con el movimiento: se retira lo que aportaba
    // antes y se apunta lo que aporta ahora. Sin esto, cambiar de hito o bajar el
    // importe dejaría apartado un dinero que ya no está.
    if (previous?.goalId) addToGoalReserve(previous.goalId, -(previous.amountTo ?? previous.amount))
    if (goalId) addToGoalReserve(goalId, amountTo ?? input.amount)

    return getTransaction(id)!
  })
}

export function deleteTransaction(id: number): void {
  deleteTransactions([id])
}

export function deleteTransactions(ids: number[]): number {
  if (ids.length === 0) return 0
  return atomic(() => {
    // Borrar un ingreso también puede dejar una cuenta en descubierto.
    const affected: Array<number | null> = []
    const stmt = getDb().prepare('DELETE FROM transactions WHERE id = ?')
    for (const id of ids) {
      const row = getTransaction(id)
      if (row) affected.push(row.accountId, row.toAccountId)
      // El dinero que sostenía una reserva se va con él.
      if (row?.goalId) addToGoalReserve(row.goalId, -(row.amountTo ?? row.amount))
      stmt.run(id)
    }
    assertNoOverdraft(affected)
    return ids.length
  })
}

/** Reasigna la categoría de varios movimientos de una tacada. */
export function bulkSetCategory(ids: number[], categoryId: number | null): number {
  if (ids.length === 0) return 0
  return atomic(() => {
    const stmt = getDb().prepare(
      `UPDATE transactions SET category_id = ?, updated_at = ? WHERE id = ? AND type <> 'transfer'`
    )
    const now = nowISO()
    for (const id of ids) stmt.run(bind(categoryId), now, id)
    return ids.length
  })
}

export function duplicateTransaction(id: number): TransactionView {
  const original = getTransaction(id)
  if (!original) throw new Error('El movimiento que quieres duplicar ya no existe')
  return saveTransaction({
    type: original.type,
    date: original.date,
    time: original.time,
    accountId: original.accountId,
    toAccountId: original.toAccountId,
    categoryId: original.categoryId,
    amount: original.amount,
    amountTo: original.amountTo,
    payee: original.payee,
    note: original.note,
    place: original.place,
    lat: original.lat,
    lon: original.lon,
    refundForId: original.refundForId,
    tagIds: original.tags.map((tag) => tag.id)
  })
}

/** Beneficiarios ya usados, para autocompletar mientras se teclea. */
export function payeeSuggestions(query: string, limit = 8): string[] {
  const rows = getDb()
    .prepare(
      `SELECT payee, COUNT(*) AS n
         FROM transactions
        WHERE payee IS NOT NULL AND payee <> '' AND payee LIKE ?
        GROUP BY payee COLLATE NOCASE
        ORDER BY n DESC
        LIMIT ?`
    )
    .all(`%${query}%`, limit) as unknown as Array<{ payee: string }>
  return rows.map((row) => row.payee)
}

/** Categoría usada la última vez con ese beneficiario, para proponerla automáticamente. */
export function categoryForPayee(payee: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT category_id
         FROM transactions
        WHERE payee = ? COLLATE NOCASE AND category_id IS NOT NULL
        ORDER BY date DESC, id DESC
        LIMIT 1`
    )
    .get(payee) as unknown as { category_id: number } | undefined
  return row ? row.category_id : null
}

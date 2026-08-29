import { getDb, transaction as atomic, bind, nowISO } from '../db'
import { today, nextOccurrence, previousOccurrence, formatDate } from '@shared/dates'
import { saveTransaction, deleteTransaction, getTransaction } from './transactions'
import { getSettings, rateMap } from './settings'
import { convert } from '@shared/money'
import { tituloProgramada } from '@shared/text'
import type {
  TransactionInput,
  Scheduled,
  ScheduledView,
  ProjectedTransaction,
  ScheduledOccurrence,
  DebtAdjust,
  DebtProgress,
  TxType,
  Frequency
} from '@shared/types'

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
  goal_id: number | null
  debt_extra_count: number | null
  debt_last_amount: number | null
  debt_start_date: string | null
  lender: string | null
  debt_total: number | null
  is_debt: number
  remind: number
  reminded_for: string | null
  settled_at: string | null
  settled_notified: number
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
    goalId: row.goal_id,
    debtExtraCount: row.debt_extra_count,
    debtLastAmount: row.debt_last_amount,
    debtStartDate: row.debt_start_date,
    lender: row.lender,
    debtTotal: row.debt_total,
    isDebt: row.is_debt === 1,
    remind: row.remind === 1,
    remindedFor: row.reminded_for,
    settledAt: row.settled_at
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

interface ScheduledInput {
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
  /** Plan de ahorro al que va, cuando es un traspaso que entra en una hucha. */
  goalId?: number | null
  /** Quién cobra, cuando es una deuda. */
  lender?: string | null
  /** Si el plan es una deuda a plazos: lo que sale en la pestaña Deudas. */
  isDebt?: boolean
  remind?: boolean
}

/**
 * Le quita el sello de terminada a la que vuelve a tener cuotas por delante.
 *
 * Finalizadas dice «para revivir una, quítale la fecha de fin desde su ficha», y
 * eso era mentira: guardar escribía la fecha nueva pero el sello seguía puesto,
 * así que la programación se quedaba en Finalizadas —donde ya no genera nada— y
 * encima sin la fecha que esa lista enseña.
 *
 * El sello se cae solo cuando de verdad queda algo por venir: sin fecha de fin,
 * o con una que aún no ha llegado a la próxima cuota. Editar una terminada sin
 * tocarle el fin la deja terminada, que es lo suyo.
 */
function revivirSiVuelveATener(id: number): void {
  getDb()
    .prepare(
      `UPDATE scheduled
          SET settled_at = NULL, settled_notified = 0, active = 1
        WHERE id = ?
          AND settled_at IS NOT NULL
          AND (end_date IS NULL OR end_date >= next_date)`
    )
    .run(id)
}

export function saveScheduled(input: ScheduledInput): ScheduledView {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('El importe tiene que ser mayor que cero')
  }
  if (input.type === 'transfer' && !input.toAccountId) {
    throw new Error('Un traspaso programado necesita una cuenta de destino')
  }
  if (input.interval < 1) throw new Error('La repetición tiene que ser de al menos 1')

  /*
   * «Una vez» se guarda acotada a su propio día.
   *
   * Es lo que la convierte en algo que pasa y se acaba sin inventar ninguna
   * regla nueva: con la fecha de fin igual que la de inicio, en cuanto se
   * registra su siguiente fecha rebasa el fin y se sella sola, por el mismo
   * camino que una deuda al pagar la última cuota. El intervalo se ignora: «cada
   * 3 una vez» no quiere decir nada.
   */
  const unaVez = input.freq === 'once'
  const interval = unaVez ? 1 : input.interval
  const endDate = unaVez ? input.nextDate : input.endDate || null

  const db = getDb()
  const isTransfer = input.type === 'transfer'
  const toAccountId = isTransfer ? (input.toAccountId ?? null) : null
  const categoryId = isTransfer ? null : (input.categoryId ?? null)
  // Solo una devolución puede colgar de otra programada; y nunca de sí misma.
  // Solo el dinero que entra en una cuenta puede ir a un plan: el destino de
  // un traspaso o la cuenta de un ingreso. Igual que en los movimientos.
  const entra = isTransfer ? toAccountId : input.type === 'income' ? input.accountId : null
  const goalId = entra != null ? (input.goalId ?? null) : null
  const refundForScheduledId =
    input.type === 'refund' && input.refundForScheduledId !== input.id
      ? (input.refundForScheduledId ?? null)
      : null

  if (input.id) {
    db.prepare(
      `UPDATE scheduled
          SET name = ?, type = ?, account_id = ?, to_account_id = ?, category_id = ?, amount = ?,
              amount_to = ?, payee = ?, note = ?, freq = ?, interval = ?, next_date = ?, end_date = ?,
              auto_post = ?, active = ?, refund_for_scheduled_id = ?, goal_id = ?, remind = ?,
              lender = ?, is_debt = ?
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
      interval,
      input.nextDate,
      bind(endDate),
      input.autoPost ? 1 : 0,
      input.active === false ? 0 : 1,
      bind(refundForScheduledId),
      bind(goalId),
      input.remind === false ? 0 : 1,
      bind(input.lender?.trim() || null),
      input.isDebt ? 1 : 0,
      input.id
    )
    revivirSiVuelveATener(input.id)
    return getScheduled(input.id)!
  }

  const result = db
    .prepare(
      `INSERT INTO scheduled
         (name, type, account_id, to_account_id, category_id, amount, amount_to, payee, note,
          freq, interval, next_date, end_date, auto_post, active, created_at, refund_for_scheduled_id, goal_id, remind,
          lender, is_debt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      interval,
      input.nextDate,
      bind(endDate),
      input.autoPost ? 1 : 0,
      input.active === false ? 0 : 1,
      nowISO(),
      bind(refundForScheduledId),
      bind(goalId),
      input.remind === false ? 0 : 1,
      bind(input.lender?.trim() || null),
      input.isDebt ? 1 : 0
    )
  return getScheduled(Number(result.lastInsertRowid))!
}

/** Lo que se programa a partir de un movimiento, con su cadencia si la lleva. */
export interface FromTransactionInput extends TransactionInput {
  /**
   * Cada cuánto, si el movimiento venía marcado como cíclico. Sin esto es de una
   * vez: pasa ese día y se acabó.
   */
  cadencia?: { freq: Frequency; interval: number; endDate?: string | null } | null
  isDebt?: boolean
  lender?: string | null
}

/**
 * Convierte en programada un movimiento con fecha por delante.
 *
 * Un movimiento con fecha futura no es un movimiento: es algo que va a pasar. Y
 * el saldo no distingue —los suma todos sin mirar la fecha—, así que apuntar hoy
 * el recibo del día 5 dejaba el dinero descontado cinco días antes de salir de
 * la cuenta. Programado, el saldo se entera el día que toca.
 *
 * Si venía de editar uno que ya existía, el movimiento se borra: es el mismo
 * apunte que se muda al futuro, no una copia. Las dos cosas van dentro de la
 * misma transacción, que si no un fallo a mitad dejaría el apunte duplicado —una
 * vez en la lista y otra esperando— o desaparecido del todo.
 *
 * Lo que no puede viajar se queda donde está y por eso no se llama desde la
 * ficha en esos casos: las facturas cuelgan de un movimiento, y un reembolso
 * apunta a un gasto concreto que una programada no sabe señalar.
 */
export function scheduleFromTransaction(input: FromTransactionInput): ScheduledView {
  if (input.date <= today()) {
    throw new Error('Solo se programa lo que todavía no ha pasado')
  }

  return atomic(() => {
    if (input.id != null && getTransaction(input.id)) deleteTransaction(input.id)

    return saveScheduled({
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.toAccountId ?? null,
      categoryId: input.categoryId ?? null,
      amount: input.amount,
      amountTo: input.amountTo ?? null,
      payee: input.payee ?? null,
      note: input.note ?? null,
      goalId: input.goalId ?? null,
      freq: input.cadencia?.freq ?? 'once',
      interval: input.cadencia?.interval ?? 1,
      // Empieza el día que se puso en la ficha, no una vuelta después: esa fecha
      // es la primera vez que pasa, no una que ya haya pasado.
      nextDate: input.date,
      endDate: input.cadencia?.endDate ?? null,
      autoPost: true,
      remind: true,
      isDebt: input.isDebt === true && input.type === 'expense',
      lender: input.isDebt === true && input.type === 'expense' ? (input.lender ?? null) : null
    })
  })
}

export function deleteScheduled(id: number): void {
  getDb().prepare('DELETE FROM scheduled WHERE id = ?').run(id)
}

/**
 * Pausar apaga y nada más: la programación se queda en la lista esperando a que
 * la reanuden. Reanudarla deshace también el sello de terminada, por si lo que
 * se está reviviendo es un plan que se dio por cerrado.
 */
export function setScheduledActive(id: number, active: boolean): void {
  if (active) {
    getDb()
      .prepare('UPDATE scheduled SET active = 1, settled_at = NULL, settled_notified = 0 WHERE id = ?')
      .run(id)
    return
  }
  getDb().prepare('UPDATE scheduled SET active = 0 WHERE id = ?').run(id)
}

/**
 * Cierra una programación para siempre: la apaga, le pone fecha de fin y la
 * sella como terminada. A diferencia de pausarla, no se puede reanudar sola ni
 * se proyecta hacia delante; es lo que toca cuando una deuda se salda antes de
 * tiempo y esas cuotas ya no van a existir.
 */
export function finishScheduled(id: number, date = today()): void {
  getDb()
    .prepare('UPDATE scheduled SET active = 0, end_date = ?, settled_at = ? WHERE id = ?')
    .run(date, date, id)
}

/**
 * Lo contrario de finalizar: le quita el sello y la fecha de fin, y la enciende.
 *
 * La fecha de fin se va con el sello y no es un extra: una finalizada la tiene
 * en el pasado, así que reanimarla sin tocarla la dejaba encendida un rato y el
 * primer repaso volvía a sellarla por agotada. Un botón que deshace su propio
 * efecto a los cinco minutos no es un botón.
 *
 * Queda abierta, sin fecha de fin, que es la única forma de que de verdad tenga
 * cuotas por delante. Si el plan tenía un final concreto, se le pone desde su
 * ficha; lo que ya se pagó no se toca.
 */
export function resumeScheduled(id: number, endDate: string | null = null): void {
  const fila = getScheduled(id)
  if (!fila) throw new Error('La programación ya no existe')

  /*
   * La fecha nueva tiene que dejar sitio a algo.
   *
   * Con una anterior a la próxima cuota, el plan nace agotado: el primer repaso
   * la vuelve a sellar y el botón parece que no ha hecho nada. Mejor decirlo
   * aquí que dejar que se deshaga solo a los cinco minutos.
   */
  if (endDate && endDate < fila.nextDate) {
    throw new Error(
      `La fecha de fin no puede ser anterior a la próxima cuota, que es el ${formatDate(fila.nextDate)}.`
    )
  }

  getDb()
    .prepare(
      `UPDATE scheduled
          SET active = 1, end_date = ?, settled_at = NULL, settled_notified = 0
        WHERE id = ?`
    )
    .run(bind(endDate || null), id)
}

/**
 * Da el plan por agotado: la última cuota ya entró y la siguiente caería más
 * allá de la fecha de fin. Se apaga y se sella, que es lo que la manda a
 * Finalizadas.
 */
function settleExhausted(id: number, date: string): void {
  getDb()
    .prepare('UPDATE scheduled SET active = 0, settled_at = ? WHERE id = ? AND settled_at IS NULL')
    .run(date, id)
}

interface DebtSummary {
  /** Cuotas registradas de esta programación. */
  count: number
  /** Suma de todas ellas, en unidades menores de la divisa de la cuenta. */
  total: number
  currency: string
  firstDate: string | null
  lastDate: string | null
}

/**
 * Lo que de una deuda no se puede deducir de los movimientos: cuántas cuotas
 * llevas, cuánto es la última y cuánto suma entera.
 *
 * De las cuotas se pregunta el total, que es lo que se sabe, pero se guarda la
 * resta: las que la aplicación no ve. Guardando el total, la cuota siguiente no
 * movía el número —tapaba la cuenta en vez de sumarse a ella—; guardando la
 * resta, el total se rehace solo cada vez que entra una.
 *
 * El cero vale por «no lo sé» en los tres: se guarda como null y la cuenta
 * vuelve a salir de lo que se vea. La cuota de cada mes no está aquí porque
 * vive en la programación, que es de donde salen los recibos, y se cambia ahí.
 */
export function adjustDebt(id: number, patch: DebtAdjust): void {
  const limpio = (value: number | null | undefined): number | null =>
    value == null || value <= 0 ? null : Math.round(value)
  const total = limpio(patch.paidCount)
  const extra = total == null ? null : Math.max(0, total - debtSummary(id).count) || null
  getDb()
    .prepare(
      `UPDATE scheduled
          SET debt_extra_count = ?, debt_last_amount = ?, debt_total = ?, debt_start_date = ?
        WHERE id = ?`
    )
    .run(
      extra,
      limpio(patch.lastAmount),
      limpio(patch.total),
      bind(patch.startDate?.trim() || null),
      id
    )
}

/**
 * Cambiarle la categoría a una programación, y a nada más.
 *
 * Va por su cuenta y no por `saveScheduled` porque ahí hay que mandar la ficha
 * entera: para mover una deuda de «Tecnología» a «Formación» habría que
 * reconstruir su importe, su cadencia y sus fechas desde la pantalla que la
 * está enseñando, y cualquier campo que se quedara por el camino se guardaría
 * en blanco. Las cuotas ya apuntadas no se tocan: son movimientos hechos, y
 * cada uno lleva la categoría que tenía el día que entró.
 *
 * Lo que sí hay que sostener es el recuento de cuotas pagadas, y ahí está toda
 * la gracia de esta función. Una deuda no guarda cuántas lleva: las deduce
 * buscando gastos con su misma nota **y su misma categoría** (ver
 * `debtSummary`), y les suma las que le hayas dicho a mano que no puede ver.
 * Cambiarle la categoría cambia, por tanto, lo que encuentra: la deuda del
 * Kindle pasaba de 3/4 a 2/3 sin que nadie hubiera pagado ni dejado de pagar
 * nada. El dinero seguía donde estaba —el número es deducido, y por eso volvía
 * solo al deshacer el cambio—, pero un contador que se mueve al tocar algo que
 * no tiene que ver con él no vale para nada.
 *
 * Así que aquí se apunta cuántas cuotas valía antes, se cambia la categoría, y
 * se rehace el ajuste manual para que la suma dé lo mismo: lo que cambia es
 * cuántas ve la aplicación por su cuenta, no cuántas has pagado. Sin tocar un
 * solo movimiento.
 *
 * Queda un caso que no se puede sostener: mudar la deuda a una categoría que ya
 * tenga movimientos con su misma nota. Ahí la aplicación encuentra *más* de las
 * que valía, y el ajuste no puede restar —solo dice cuántas hay que no se ven—.
 * Se queda en cero y el recuento sube. Es lo honrado: esos movimientos existen
 * y son suyos por nota y categoría, igual que los demás.
 */
export function setScheduledCategory(id: number, categoryId: number | null): void {
  atomic(() => {
    const antes = getScheduled(id)
    // Solo las deudas llevan cuenta de cuotas; en una programada normal esto no
    // significa nada y no hay nada que sostener.
    const valia = antes?.isDebt ? debtSummary(id).count + (antes.debtExtraCount ?? 0) : null

    getDb().prepare('UPDATE scheduled SET category_id = ? WHERE id = ?').run(bind(categoryId), id)

    if (valia == null) return
    // Las que la aplicación ve ahora, ya con la categoría nueva puesta.
    const seVen = debtSummary(id).count
    getDb()
      .prepare('UPDATE scheduled SET debt_extra_count = ? WHERE id = ?')
      .run(Math.max(0, valia - seVen) || null, id)
  })
}

/** Lo que ha costado un plan, para poder contarlo al terminar. */
export function debtSummary(id: number): DebtSummary {
  const scheduled = getScheduled(id)

  /*
   * Lo pagado no puede medirse solo por los movimientos que ha dejado la
   * programación: una deuda casi siempre viene de antes de apuntarla aquí, y esos
   * pagos no llevan su marca. La cuota del PC de marzo es tan cuota como la que
   * generó la aplicación en agosto.
   *
   * Así que también cuentan los gastos de su misma categoría y su misma nota, que
   * es como se distinguen entre sí las deudas de una categoría compartida —Deuda:
   * Kindle, PC, 4Geeks—. Sin nota no hay con qué distinguirlas y se cuenta solo lo
   * suyo, que es mejor quedarse corto que sumar lo de otro.
   */
  const note = scheduled?.note ?? null
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.amount), 0) AS total,
              MIN(t.date) AS first_date, MAX(t.date) AS last_date
         FROM transactions t
        WHERE t.scheduled_id = ?
           OR (? IS NOT NULL AND t.type = 'expense' AND t.category_id = ? AND t.note = ?)`
    )
    .get(id, note, scheduled?.categoryId ?? null, note) as unknown as {
    n: number
    total: number
    first_date: string | null
    last_date: string | null
  }

  return {
    count: row.n,
    total: row.total,
    currency: scheduled?.accountCurrency ?? getSettings().baseCurrency,
    firstDate: row.first_date,
    lastDate: row.last_date
  }
}

/**
 * Deudas recién saldadas de las que todavía no se ha dado la enhorabuena. Solo
 * las de categorías marcadas como deuda a plazos: que se acabe una suscripción
 * no es una buena noticia, es que hay que renovarla.
 */
/**
 * Cómo van tus deudas a plazos.
 *
 * Solo las de categorías marcadas como deuda: una suscripción también es un
 * recibo que se repite, pero no se está pagando nada que se acabe.
 *
 * Lo pagado sale de los movimientos que la programación ha ido dejando, así que
 * cuenta lo que de verdad ha salido de la cuenta. Lo que queda se calcula desde
 * la próxima cuota hasta la fecha de fin: sin fecha no hay plan que medir, y
 * entonces se dice lo pagado y nada más.
 */
/**
 * Lo que cuesta al mes, venga cada semana o cada año.
 *
 * «Cuánto pago al mes» es la pregunta, y una deuda semanal no se responde con
 * su cuota. Cuatro semanas y pico al mes, treinta días, doce meses al año: son
 * aproximaciones, pero es la cifra que se busca.
 */
function monthlyCost(amount: number, freq: Frequency, interval: number): number {
  const veces =
    freq === 'daily' ? 30 : freq === 'weekly' ? 4.348 : freq === 'monthly' ? 1 : 1 / 12
  return Math.round((amount * veces) / Math.max(1, interval))
}

export function debtProgress(reference = today()): DebtProgress[] {
  const rows = getDb()
    .prepare(`${VIEW_SELECT} WHERE s.is_debt = 1 ORDER BY s.settled_at IS NOT NULL, s.next_date, s.id`)
    .all() as unknown as ScheduledViewRow[]

  return rows.map((row) => {
    const debt = toView(row)
    const summary = debtSummary(debt.id)

    // Las que quedan: se cuentan las repeticiones desde la próxima hasta el fin.
    let leftCount: number | null = null
    if (!debt.settledAt && debt.endDate) {
      leftCount = 0
      let date = debt.nextDate
      let guard = 0
      while (date <= debt.endDate && guard < 600) {
        leftCount++
        date = nextOccurrence(date, debt.freq, debt.interval)
        guard++
      }
    } else if (debt.settledAt) {
      leftCount = 0
    }

    /*
     * Lo pagado suma las cuotas que la aplicación ve y las que le hayas dicho que
     * se pagaron sin dejar rastro: una deuda de hace tres años con apuntes desde
     * abril saldría por los suelos. Las de antes se valoran a cuota entera, que
     * es lo que fueron.
     *
     * Al ser una suma y no un tope, la cuota que entra hoy sube el número: antes
     * se guardaba el total y la deuda se quedaba clavada donde la dejaste.
     *
     * De lo que queda, la última es la corta, y por eso los totales cuadran sin
     * tener que escribirlos. Aun así el total lo mandas tú si lo has puesto: hay
     * deudas con intereses o con una entrada que no salen de ninguna cuenta.
     */
    const deMas = debt.debtExtraCount ?? 0
    const paidCount = summary.count + deMas
    const paid = summary.total + deMas * debt.amount
    const ultima = debt.debtLastAmount ?? debt.amount
    const porCuotas =
      leftCount == null ? null : leftCount === 0 ? 0 : (leftCount - 1) * debt.amount + ultima
    const total = debt.debtTotal ?? (porCuotas == null ? null : paid + porCuotas)
    const left = total == null ? porCuotas : Math.max(0, total - paid)
    const daysLeft = debt.endDate
      ? Math.round(
          (Date.parse(`${debt.endDate}T00:00:00`) - Date.parse(`${reference}T00:00:00`)) / 86400000
        )
      : null

    return {
      scheduledId: debt.id,
      title: tituloProgramada(debt, 'Deuda'),
      categoryId: debt.categoryId,
      categoryName: debt.categoryName,
      categoryIcon: debt.categoryIcon,
      categoryColor: debt.categoryColor,
      accountName: debt.accountName,
      currency: debt.accountCurrency,
      installment: debt.amount,
      cadence:
        debt.interval !== 1
          ? 'cuota'
          : debt.freq === 'daily'
            ? 'día'
            : debt.freq === 'weekly'
              ? 'semana'
              : debt.freq === 'monthly'
                ? 'mes'
                : 'año',
      paidCount,
      paid,
      leftCount,
      left,
      total,
      fixedTotal: debt.debtTotal,
      lastInstallment: debt.debtLastAmount,
      lender: debt.lender,
      percent: total && total > 0 ? Math.min(100, (paid / total) * 100) : null,
      // La que digas manda: el movimiento más antiguo solo llega hasta donde
      // llegan tus registros.
      firstDate: debt.debtStartDate ?? summary.firstDate,
      fixedStart: debt.debtStartDate,
      nextDate: debt.nextDate,
      endDate: debt.endDate,
      daysLeft,
      monthlyCost: leftCount === 0 ? 0 : monthlyCost(debt.amount, debt.freq, debt.interval),
      settled: debt.settledAt != null,
      settledAt: debt.settledAt
    }
  })
}

export function pendingSettlements(): ScheduledView[] {
  const rows = getDb()
    .prepare(
      `${VIEW_SELECT}
        WHERE s.settled_at IS NOT NULL
          AND s.settled_notified = 0
          AND s.is_debt = 1
        ORDER BY s.settled_at, s.id`
    )
    .all() as unknown as ScheduledViewRow[]
  return rows.map(toView)
}

export function markSettlementNotified(id: number): void {
  getDb().prepare('UPDATE scheduled SET settled_notified = 1 WHERE id = ?').run(id)
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

/**
 * Crea el movimiento de una programada y avanza su fecha a la siguiente
 * repetición.
 *
 * Son dos fechas distintas y no siempre coinciden: `date` es la del movimiento
 * —cuándo sale el dinero de verdad— y `consumed` es la repetición que se da por
 * cumplida. Al registrar una cuota antes de tiempo el dinero sale hoy, pero la
 * que se gasta es la del día que tocaba, y el mes que viene sigue venciendo el
 * mismo día de siempre.
 */
function post(row: Scheduled, date: string, consumed = date): void {
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
    // El plan viaja con el movimiento: al registrarse, la reserva sube sola.
    goalId: row.goalId,
    refundForId:
      row.type === 'refund' && row.refundForScheduledId
        ? postedByScheduled(row.refundForScheduledId, date)
        : null
  })

  const upcoming = nextOccurrence(consumed, row.freq, row.interval)
  // Esta era la última: la siguiente caería más allá del fin. Se apaga y se
  // sella, que es lo que la manda a Finalizadas y dispara la enhorabuena.
  const exhausted = row.endDate != null && upcoming > row.endDate
  getDb()
    .prepare(
      `UPDATE scheduled
          SET next_date = ?, last_posted = ?, active = ?,
              settled_at = CASE WHEN ? = 1 AND settled_at IS NULL THEN ? ELSE settled_at END
        WHERE id = ?`
    )
    .run(upcoming, date, exhausted ? 0 : 1, exhausted ? 1 : 0, date, row.id)
}

/**
 * Materializa todas las repeticiones vencidas hasta hoy. Se llama al arrancar,
 * así que si la app lleva meses cerrada recupera todo lo pendiente de una vez.
 */
/** Lo que dejó el repaso: cuántas entraron y cuáles no pudieron, con su motivo. */
interface PostDueResult {
  created: number
  failed: Array<{ id: number; title: string; reason: string }>
}

/**
 * Materializa todas las repeticiones vencidas hasta hoy.
 *
 * Cada programada va en su propia transacción, y ese es el punto. Antes iban
 * todas dentro de una sola: la primera que reventaba deshacía también las que
 * ya habían entrado bien, así que un traspaso que dejaría la hucha en números
 * rojos —y la hucha no los admite— bastaba para que ese día no se registrara
 * nada, ni el alquiler ni la nómina ni las cuotas. Se veía un aviso y punto.
 *
 * Aisladas, la que no puede entrar se queda donde está —sin movimiento y sin
 * mover su fecha, para volver a intentarlo— y las demás siguen su camino.
 */
export function postDue(reference = today()): PostDueResult {
  // Se miran también las que ya no vencen: una cuyo plan se agotó con la última
  // cuota tiene la siguiente fecha más allá del fin, así que nunca volvería a
  // entrar aquí y se quedaría encendida para siempre.
  const rows = getDb()
    .prepare(
      `SELECT * FROM scheduled
        WHERE active = 1 AND auto_post = 1
          AND (next_date <= ? OR (end_date IS NOT NULL AND next_date > end_date))
        ORDER BY (refund_for_scheduled_id IS NOT NULL), next_date, id`
    )
    .all(reference) as unknown as ScheduledRow[]

  const resultado: PostDueResult = { created: 0, failed: [] }

  for (const raw of rows) {
    // Se cuenta aparte y solo se suma al total si su transacción sale adelante:
    // al volver atrás, sus movimientos dejan de existir y contarlos haría que la
    // ventana se recargara buscando apuntes que no están.
    let suyas = 0
    try {
      // Lo de una programada sí es todo o nada: si su tercera cuota no entra, no
      // puede quedarse con las dos primeras puestas y la fecha a medio camino.
      atomic(() => {
        suyas = 0
        let current = mapScheduled(raw)
        // Tope de seguridad por si una diaria lleva años sin abrirse.
        let guard = 0
        while (current.active && current.nextDate <= reference && guard < 500) {
          if (current.endDate && current.nextDate > current.endDate) break
          post(current, current.nextDate)
          suyas++
          guard++
          const refreshed = getDb().prepare('SELECT * FROM scheduled WHERE id = ?').get(current.id) as
            | ScheduledRow
            | undefined
          if (!refreshed) break
          current = mapScheduled(refreshed)
        }

        // El plan se ha agotado: la última cuota ya entró y la siguiente caería
        // más allá del fin. Se comprueba fuera del bucle porque esa fecha suele
        // quedar en el futuro, y entonces el bucle sale por su condición sin
        // llegar nunca a la ruptura de dentro.
        if (current.active && current.endDate && current.nextDate > current.endDate) {
          settleExhausted(current.id, current.lastPosted ?? current.endDate)
        }
      })
      resultado.created += suyas
    } catch (error) {
      resultado.failed.push({
        id: raw.id,
        // Con la categoría de vuelta: sin ella, una programación sin título
        // salía como «Programación» a secas justo al contar por qué falló, que
        // es cuando más falta hace saber de cuál se está hablando.
        title: tituloProgramada(getScheduled(raw.id) ?? mapScheduled(raw), 'Programación'),
        reason: (error as Error).message ?? 'Error inesperado'
      })
    }
  }

  return resultado
}

/** Ejecuta ahora una programada concreta, sin esperar a su fecha. */
export function postNow(id: number): void {
  const row = getDb().prepare('SELECT * FROM scheduled WHERE id = ?').get(id) as unknown as ScheduledRow | undefined
  if (!row) throw new Error('La programación ya no existe')
  // Con la fecha de hoy y no con la suya: «registrar ahora» es que el dinero
  // sale ahora. Fechándolo en su día, el movimiento se quedaba esperando en el
  // futuro de la lista mientras el saldo ya lo había descontado.
  const scheduled = mapScheduled(row)
  post(scheduled, today(), scheduled.nextDate)
}

/**
 * Salda una deuda de golpe: un pago por todo lo que falta, y se acabó.
 *
 * Es lo que pasa cuando la cancelas antes de tiempo —vendiste el portátil, te
 * llegó una paga—. Un solo movimiento por el importe pendiente y no una cuota
 * por cada mes que quedaba: el dinero salió una vez y en un día, y apuntar doce
 * cuotas con la fecha de hoy diría que pagaste doce veces hoy.
 *
 * El plan se sella con la fecha del pago. No se apaga y ya: apagada es una
 * pausada, y una pausada espera a que la reanuden. Esta no espera nada.
 *
 * Las dos escrituras van juntas o no van: un pago sin sellar dejaría la deuda
 * pagada dos veces y un sello sin pago la daría por saldada sin que saliera el
 * dinero.
 */
export function settleDebtNow(id: number, date = today()): { amount: number } {
  const debt = debtProgress(date).find((row) => row.scheduledId === id)
  if (!debt) throw new Error('Esa deuda ya no existe')
  if (debt.settled) throw new Error('Esa deuda ya está saldada')
  if (debt.left == null) {
    throw new Error('No se sabe cuánto queda: ponle una fecha de fin o un total a la deuda')
  }
  if (debt.left <= 0) throw new Error('No queda nada que pagar')

  const row = getScheduled(id)
  if (!row) throw new Error('La programación ya no existe')

  return atomic(() => {
    saveTransaction({
      type: row.type,
      date,
      accountId: row.accountId,
      toAccountId: row.toAccountId,
      categoryId: row.categoryId,
      amount: debt.left as number,
      payee: row.payee,
      note: row.note,
      scheduledId: row.id
    })
    finishScheduled(id, date)
    return { amount: debt.left as number }
  })
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

/** Lo que hace falta para que un movimiento ya apuntado empiece a repetirse. */
export interface RepeatInput {
  transactionId: number
  freq: Frequency
  interval: number
  endDate?: string | null
}

/**
 * Convierte un movimiento ya apuntado en el primero de una serie.
 *
 * No es lo mismo que `scheduleFromTransaction`, que se lleva al futuro algo que
 * todavía no ha pasado y por el camino borra el movimiento. Aquí el movimiento
 * ya ocurrió y se queda donde está: lo que se crea es el plan de lo que viene
 * detrás, con su primera vuelta en la primera fecha que caiga después de hoy.
 *
 * El movimiento se queda enganchado a la programación nueva, y esta anota que
 * aquel día ya lo dio por hecho. Así el calendario lo enseña como la primera
 * vuelta —dada— de la serie en vez de como un movimiento suelto, y el repaso de
 * vencidas no intenta volver a generarlo.
 */
export function repeatTransaction(input: RepeatInput): ScheduledView {
  const movimiento = getTransaction(input.transactionId)
  if (!movimiento) throw new Error('Ese movimiento ya no existe')
  if (movimiento.scheduledId != null) {
    throw new Error('Ese movimiento ya viene de una programación')
  }
  if (input.freq === 'once') {
    throw new Error('Para que se repita hay que decir cada cuánto')
  }
  if (input.interval < 1) throw new Error('La repetición tiene que ser de al menos 1')

  const hoy = today()

  /*
   * La primera vuelta que todavía no ha pasado.
   *
   * Se avanza desde el día del movimiento en vez de sumar una sola vez: un
   * recibo de hace ocho meses que se marca como mensual tiene que caer el mes
   * que viene, no ocho meses atrás. El tope es el mismo que usa la proyección,
   * para que una diaria de hace años no se quede dando vueltas.
   */
  let proxima = nextOccurrence(movimiento.date, input.freq, input.interval)
  let guarda = 0
  while (proxima <= hoy && guarda < 4000) {
    proxima = nextOccurrence(proxima, input.freq, input.interval)
    guarda++
  }

  if (input.endDate && proxima > input.endDate) {
    throw new Error('Con ese final no queda ninguna vuelta por delante')
  }

  return atomic(() => {
    const programada = saveScheduled({
      type: movimiento.type,
      accountId: movimiento.accountId,
      toAccountId: movimiento.toAccountId,
      categoryId: movimiento.categoryId,
      amount: movimiento.amount,
      amountTo: movimiento.amountTo,
      payee: movimiento.payee,
      note: movimiento.note,
      goalId: movimiento.goalId,
      freq: input.freq,
      interval: input.interval,
      nextDate: proxima,
      endDate: input.endDate ?? null,
      // Como en la ficha de un movimiento que nace programado: lo normal es que
      // algo que se repite se apunte solo. Se cambia luego desde su ficha.
      autoPost: true,
      remind: true
    })

    getDb()
      .prepare('UPDATE transactions SET scheduled_id = ?, updated_at = ? WHERE id = ?')
      .run(programada.id, nowISO(), movimiento.id)
    getDb()
      .prepare('UPDATE scheduled SET last_posted = ? WHERE id = ?')
      .run(movimiento.date, programada.id)

    // Releída, para que salga con el nombre de su cuenta y su categoría puestos.
    return getScheduled(programada.id) as ScheduledView
  })
}

/**
 * Las vueltas de cada programación que caen en un rango, hacia atrás y hacia
 * delante, con lo que pasó con cada una.
 *
 * `projectUpcoming` solo camina hacia delante desde la próxima fecha, y con eso
 * un mes ya empezado sale casi vacío: sus recibos ya cayeron y la próxima vuelta
 * es del mes siguiente. Aquí se recorre la cadencia en los dos sentidos y se
 * cruza con lo registrado, que es lo que permite decir de cada casilla si
 * aquello se hizo, si está por venir, o si venció y nadie lo apuntó.
 *
 * No escribe nada.
 */
export function occurrencesInRange(from: string, to: string): ScheduledOccurrence[] {
  if (!from || !to || from > to) return []

  const rows = getDb().prepare(VIEW_SELECT).all() as unknown as ScheduledViewRow[]
  const hoy = today()
  const rates = rateMap()
  const base = getSettings().baseCurrency

  /*
   * Lo que ya se registró en el rango por cuenta de una programada.
   *
   * Se cruza por programada y día. No basta con la marca `last_posted` de la
   * fila: dice hasta cuándo generó, pero no con qué importe, y una cuota que
   * se editó después vale por lo que acabó siendo, no por lo que decía el plan.
   */
  const registrados = getDb()
    .prepare(
      `SELECT id, scheduled_id, date, amount FROM transactions
        WHERE scheduled_id IS NOT NULL AND date BETWEEN ? AND ?`
    )
    .all(from, to) as unknown as Array<{
    id: number
    scheduled_id: number
    date: string
    amount: number
  }>

  const hechos = new Map<string, { id: number; amount: number }>()
  for (const t of registrados) hechos.set(`${t.scheduled_id}|${t.date}`, { id: t.id, amount: t.amount })

  const salida: ScheduledOccurrence[] = []
  const puestas = new Set<string>()

  const anota = (s: ScheduledView, date: string): void => {
    const clave = `${s.id}|${date}`
    if (puestas.has(clave)) return
    puestas.add(clave)

    const hecho = hechos.get(clave)
    // La marca de la fila cubre lo que se generó antes de que el movimiento
    // guardara de quién venía, y lo que se generó y luego se borró.
    const seHizo = hecho != null || (s.lastPosted != null && date <= s.lastPosted)
    const status: ScheduledOccurrence['status'] =
      date > hoy ? 'pending' : seHizo ? 'done' : date < hoy ? 'missed' : 'pending'

    const amount = hecho?.amount ?? s.amount
    const converted = convert(amount, s.accountCurrency, base, rates)
    // El mismo criterio que en los movimientos de verdad: el traspaso no cambia
    // el patrimonio, el gasto resta y el ingreso o el reembolso suman.
    const amountInBase =
      s.type === 'transfer' ? 0 : s.type === 'expense' ? -converted : converted

    salida.push({
      scheduledId: s.id,
      date,
      type: s.type,
      amount,
      amountTo: s.amountTo,
      amountInBase,
      accountId: s.accountId,
      accountCurrency: s.accountCurrency,
      accountName: s.accountName,
      toAccountId: s.toAccountId,
      toAccountName: s.toAccountName,
      categoryName: s.categoryName,
      categoryIcon: s.categoryIcon,
      categoryColor: s.categoryColor,
      name: s.name,
      payee: s.payee,
      note: s.note,
      refundForScheduledId: s.refundForScheduledId,
      isNext: s.active && date === s.nextDate,
      status,
      transactionId: hecho?.id ?? null
    })
  }

  for (const row of rows) {
    const s = toView(row)
    /*
     * El paso atrás se para el día en que se dio de alta la programación.
     *
     * No en el día en que arrancó el plan, que es lo que parecía natural para una
     * deuda: 4Geeks arrancó en junio de 2024 y se apuntó aquí en agosto de 2026,
     * y con aquel suelo salían veintiséis cuotas «vencidas» que llevaban dos años
     * pagadas fuera. De lo de antes de darla de alta esta aplicación no sabe
     * nada, y no puede echar en falta lo que nunca le tocó llevar.
     *
     * Nada real se pierde por esto: lo que se registró con la programada detrás
     * entra igual por el repaso de abajo, aunque sea anterior a su alta.
     */
    const suelo = row.created_at.slice(0, 10)
    const techo = s.endDate ?? '9999-12-31'

    if (s.freq === 'once') {
      // No tiene cadencia que recorrer: o ya se registró, o está por llegar.
      if (s.lastPosted) anota(s, s.lastPosted)
      if (s.active && s.nextDate <= techo) anota(s, s.nextDate)
      continue
    }

    // Hacia atrás desde la próxima, que es lo que faltaba.
    let atras = previousOccurrence(s.nextDate, s.freq, s.interval)
    let guarda = 0
    while (atras >= from && atras >= suelo && guarda < 400) {
      if (atras <= to && atras <= techo) anota(s, atras)
      atras = previousOccurrence(atras, s.freq, s.interval)
      guarda++
    }

    // Y hacia delante solo si sigue viva: una apagada no va a generar nada más.
    if (!s.active) continue
    let alante = s.nextDate
    guarda = 0
    while (alante <= to && alante <= techo && guarda < 400) {
      if (alante >= from) anota(s, alante)
      alante = nextOccurrence(alante, s.freq, s.interval)
      guarda++
    }
  }

  /*
   * Y lo que se registró sin caer en ninguna vuelta calculada.
   *
   * «Registrar ahora» fecha el movimiento hoy y no el día que le tocaba, así que
   * hay cuotas que no cuadran con la cadencia. Esconderlas sería peor que
   * enseñarlas descolocadas: son dinero que se movió de verdad.
   */
  const porId = new Map(rows.map((row) => [row.id, toView(row)]))
  for (const t of registrados) {
    const s = porId.get(t.scheduled_id)
    if (s) anota(s, t.date)
  }

  return salida.sort((a, b) =>
    a.date === b.date ? a.scheduledId - b.scheduledId : a.date < b.date ? -1 : 1
  )
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

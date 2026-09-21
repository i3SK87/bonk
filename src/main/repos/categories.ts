import { getDb } from '../db'
import type { Category, CategoryKind, EstadoPresupuesto } from '@shared/types'
import { reglaDeCategoria } from '@shared/ahorro'
import { porcentajeDePresupuesto } from '@shared/presupuestos'
import { byName } from '@shared/text'
import { convert } from '@shared/money'
import { startOfMonth, endOfMonth, today } from '@shared/dates'
import { getSettings, rateMap } from './settings'

interface CategoryRow {
  id: number
  name: string
  kind: string
  parent_id: number | null
  icon: string
  color: string
  archived: number
  sort_order: number
  breakdown_by_note: number
  keeps_invoices: number
  save_percent: number | null
  save_amount: number | null
  save_account_id: number | null
  save_goal_id: number | null
  spend_limit: number | null
  limit_warned: string | null
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CategoryKind,
    parentId: row.parent_id,
    icon: row.icon,
    color: row.color,
    archived: row.archived === 1,
    sortOrder: row.sort_order,
    breakdownByNote: row.breakdown_by_note === 1,
    keepsInvoices: row.keeps_invoices === 1,
    savePercent: row.save_percent,
    saveAmount: row.save_amount,
    saveAccountId: row.save_account_id,
    saveGoalId: row.save_goal_id,
    spendLimit: row.spend_limit
  }
}

/** El presupuesto que se guarda de verdad: solo en gastos, y cero es no tener. */
function presupuestoDe(input: { kind: CategoryKind; spendLimit?: number | null }): number | null {
  if (input.kind !== 'expense') return null
  const presupuesto = Math.round(Number(input.spendLimit ?? 0))
  return Number.isFinite(presupuesto) && presupuesto > 0 ? presupuesto : null
}


export function listCategories(includeArchived = false): Category[] {
  const where = includeArchived ? '' : 'WHERE archived = 0'
  const sql = `SELECT * FROM categories ${where}`
  const rows = (getDb().prepare(sql).all() as unknown as CategoryRow[]).map(mapCategory)
  // Alfabético y no por orden de creación: con muchas categorías se encuentra
  // una por su nombre, que es lo que se recuerda, no por cuándo se creó.
  return rows.sort((a, b) => (a.kind === b.kind ? byName.compare(a.name, b.name) : a.kind < b.kind ? 1 : -1))
}

function getCategory(id: number): Category | null {
  const row = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) as unknown as CategoryRow | undefined
  return row ? mapCategory(row) : null
}

interface CategoryInput {
  id?: number
  name: string
  kind: CategoryKind
  parentId?: number | null
  icon: string
  color: string
  archived?: boolean
  breakdownByNote?: boolean
  keepsInvoices?: boolean
  /** La regla de ahorro, solo si es de ingreso. */
  savePercent?: number | null
  saveAmount?: number | null
  saveAccountId?: number | null
  saveGoalId?: number | null
  /** El presupuesto de gasto del mes; `null` o 0 es no tener. */
  spendLimit?: number | null
}

export function saveCategory(input: CategoryInput): Category {
  // La regla la sostiene quien guarda, no solo quien teclea: el formulario ya
  // la pedía, pero una categoría sin nombre es una fila que la lista no sabe
  // enseñar, y esas son las que acaban rompiendo una pantalla entera.
  if (!input.name?.trim()) throw new Error('La categoría necesita un título')

  const db = getDb()
  const regla = reglaDeCategoria(input)
  if (input.id) {
    // Una categoría no puede colgar de sí misma.
    const parentId = input.parentId === input.id ? null : (input.parentId ?? null)
    /*
     * Un presupuesto nuevo es una cuenta nueva: se borra la marca del último aviso.
     *
     * Si no, bajar el presupuesto a la mitad a mitad de mes no avisaría de nada —ya
     * constaba avisado el 80 % de aquel otro presupuesto— y te enterarías el día 1
     * del mes que viene. Solo cuando cambia: retocar el icono no tiene por qué
     * devolverte un aviso que ya leíste.
     */
    const antes = getCategory(input.id)
    const presupuesto = presupuestoDe(input)
    const cambia = (antes?.spendLimit ?? null) !== presupuesto

    db.prepare(
      `UPDATE categories
          SET name = ?, kind = ?, parent_id = ?, icon = ?, color = ?, archived = ?,
              breakdown_by_note = ?, keeps_invoices = ?,
              save_percent = ?, save_amount = ?, save_account_id = ?, save_goal_id = ?,
              spend_limit = ?, limit_warned = CASE WHEN ? = 1 THEN NULL ELSE limit_warned END
        WHERE id = ?`
    ).run(
      input.name.trim(),
      input.kind,
      parentId,
      input.icon,
      input.color,
      input.archived ? 1 : 0,
      input.breakdownByNote === false ? 0 : 1,
      input.keepsInvoices ? 1 : 0,
      regla?.modo === 'porciento' ? regla.valor : null,
      regla?.modo === 'cifra' ? regla.valor : null,
      regla?.accountId ?? null,
      regla?.goalId ?? null,
      presupuesto,
      cambia ? 1 : 0,
      input.id
    )
    return getCategory(input.id)!
  }

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE kind = ?')
    .get(input.kind) as unknown as { m: number }
  const result = db
    .prepare(
      `INSERT INTO categories
         (name, kind, parent_id, icon, color, sort_order, breakdown_by_note, keeps_invoices,
          save_percent, save_amount, save_account_id, save_goal_id, spend_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      input.kind,
      input.parentId ?? null,
      input.icon,
      input.color,
      Number(maxOrder.m) + 1,
      input.breakdownByNote === false ? 0 : 1,
      input.keepsInvoices ? 1 : 0,
      regla?.modo === 'porciento' ? regla.valor : null,
      regla?.modo === 'cifra' ? regla.valor : null,
      regla?.accountId ?? null,
      regla?.goalId ?? null,
      presupuestoDe(input)
    )
  return getCategory(Number(result.lastInsertRowid))!
}

export function deleteCategory(id: number): void {
  // Los movimientos sobreviven al borrado y pasan a figurar como "Sin categoría".
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
}

/**
 * Cómo van los presupuestos en un mes: lo gastado contra lo que te pusiste.
 *
 * Neto y en divisa base, el mismo criterio que Informes: un reembolso rebaja lo
 * gastado en su categoría. Si no, devolver una compra dejaba el mes arruinado
 * en la barra aunque el dinero hubiera vuelto.
 *
 * Las archivadas se quedan fuera aunque conserven su presupuesto: archivar una
 * categoría es dejar de contar con ella, y un aviso de algo que ya no usas es
 * ruido.
 */
export function presupuestosDelMes(mes: string = today()): EstadoPresupuesto[] {
  const rates = rateMap()
  const base = getSettings().baseCurrency
  /*
   * Vale «2026-09» y vale «2026-09-21»: el día sobra, pero quien llama piensa
   * en meses y manda meses.
   *
   * Sin esto, un «2026-09» pelado se colaba entero hasta `startOfMonth`, que
   * corta por el carácter ocho y pega «01»: salía «2026-0901», ninguna fecha
   * de la tabla era mayor que eso, y las barras aparecían a cero con el mes
   * lleno de gastos. Las pruebas no lo cazaron porque llamaban con la fecha
   * completa; la ventana llama con el mes.
   */
  const dia = mes.length === 7 ? `${mes}-01` : mes
  const desde = startOfMonth(dia)
  const hasta = endOfMonth(dia)

  // El LEFT JOIN es lo que hace que una categoría con presupuesto y sin un solo gasto
  // este mes salga igual, con su barra a cero: es justo el mes que mejor va, y
  // sin esto era el único que no se veía.
  const rows = getDb()
    .prepare(
      `SELECT c.id          AS categoryId,
              c.name        AS name,
              c.icon        AS icon,
              c.color       AS color,
              c.spend_limit AS presupuesto,
              a.currency    AS currency,
              SUM(CASE WHEN t.type = 'refund' THEN -t.amount ELSE t.amount END) AS spent
         FROM categories c
         LEFT JOIN transactions t
                ON t.category_id = c.id
               AND t.type IN ('expense', 'refund')
               AND t.date >= ? AND t.date <= ?
         LEFT JOIN accounts a ON a.id = t.account_id
        WHERE c.kind = 'expense' AND c.archived = 0
          AND c.spend_limit IS NOT NULL AND c.spend_limit > 0
        GROUP BY c.id, a.currency`
    )
    .all(desde, hasta) as unknown as Array<{
    categoryId: number
    name: string
    icon: string
    color: string
    presupuesto: number
    currency: string | null
    spent: number | null
  }>

  const merged = new Map<number, EstadoPresupuesto>()
  for (const row of rows) {
    const estado = merged.get(row.categoryId) ?? {
      categoryId: Number(row.categoryId),
      name: row.name,
      icon: row.icon,
      color: row.color,
      limit: Number(row.presupuesto),
      spent: 0,
      percent: 0
    }
    // Sin divisa no hay movimientos que sumar: es la fila vacía del LEFT JOIN.
    if (row.currency) {
      estado.spent += convert(Number(row.spent ?? 0), row.currency, base, rates)
    }
    merged.set(row.categoryId, estado)
  }

  const presupuestos = [...merged.values()]
  for (const presupuesto of presupuestos) presupuesto.percent = porcentajeDePresupuesto(presupuesto.spent, presupuesto.limit)
  // El que peor va, primero: es el que se puso el presupuesto para mirar.
  return presupuestos.sort((a, b) => b.percent - a.percent || byName.compare(a.name, b.name))
}

/** De qué mes y escalón fue el último aviso de cada presupuesto. Para no repetirlo. */
export function marcasDePresupuesto(): Map<number, string | null> {
  const rows = getDb()
    .prepare('SELECT id, limit_warned FROM categories WHERE spend_limit IS NOT NULL AND spend_limit > 0')
    .all() as unknown as Array<{ id: number; limit_warned: string | null }>
  return new Map(rows.map((row) => [Number(row.id), row.limit_warned]))
}

/**
 * Deja dicho en qué escalón anda este presupuesto, o borra la marca con `null`.
 *
 * Borrarla es lo que rearma el aviso: sin marca, volver a cruzar la raya vuelve
 * a avisar. Ver `repasoDePresupuesto`.
 */
export function marcarPresupuestoAvisado(id: number, marca: string | null): void {
  getDb().prepare('UPDATE categories SET limit_warned = ? WHERE id = ?').run(marca, id)
}

export function countCategoryTransactions(id: number): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?').get(id) as unknown as {
    n: number
  }
  return Number(row.n)
}

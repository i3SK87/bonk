import { getDb } from '../db'
import type { Category, CategoryKind, ReglaDeAhorro } from '@shared/types'
import { byName } from '@shared/text'

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
    saveGoalId: row.save_goal_id
  }
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
}

/**
 * La regla de ahorro de una categoría, ya comprobada, o `null`.
 *
 * Se limpia en un solo sitio para que la base no guarde a medias lo que luego
 * hay que interpretar: una regla sin hucha, o del 0 %, o colgada de una
 * categoría de gasto, es una regla que no existe. Del 1 al 100, que apartar el
 * 150 % de un ingreso no significa nada.
 */
export function reglaDeCategoria(input: {
  kind: CategoryKind
  savePercent?: number | null
  saveAmount?: number | null
  saveAccountId?: number | null
  saveGoalId?: number | null
}): ReglaDeAhorro | null {
  if (input.kind !== 'income' || !input.saveAccountId) return null

  // La cifra manda sobre el porcentaje: puestas las dos, gana la que se escribió
  // como cifra, que es la más concreta de las dos.
  const cifra = Math.round(Number(input.saveAmount ?? 0))
  if (Number.isFinite(cifra) && cifra > 0) {
    return { modo: 'cifra', valor: cifra, accountId: input.saveAccountId, goalId: input.saveGoalId ?? null }
  }

  const porciento = Math.round(Number(input.savePercent ?? 0))
  if (!Number.isFinite(porciento) || porciento <= 0) return null
  return {
    modo: 'porciento',
    valor: Math.min(100, porciento),
    accountId: input.saveAccountId,
    goalId: input.saveGoalId ?? null
  }
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
    db.prepare(
      `UPDATE categories
          SET name = ?, kind = ?, parent_id = ?, icon = ?, color = ?, archived = ?,
              breakdown_by_note = ?, keeps_invoices = ?,
              save_percent = ?, save_amount = ?, save_account_id = ?, save_goal_id = ?
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
          save_percent, save_amount, save_account_id, save_goal_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      regla?.goalId ?? null
    )
  return getCategory(Number(result.lastInsertRowid))!
}

export function deleteCategory(id: number): void {
  // Los movimientos sobreviven al borrado y pasan a figurar como "Sin categoría".
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
}

export function countCategoryTransactions(id: number): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?').get(id) as unknown as {
    n: number
  }
  return Number(row.n)
}

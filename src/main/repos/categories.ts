import { getDb } from '../db'
import type { Category, CategoryKind } from '@shared/types'
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
    keepsInvoices: row.keeps_invoices === 1
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

export function getCategory(id: number): Category | null {
  const row = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) as unknown as CategoryRow | undefined
  return row ? mapCategory(row) : null
}

export interface CategoryInput {
  id?: number
  name: string
  kind: CategoryKind
  parentId?: number | null
  icon: string
  color: string
  archived?: boolean
  breakdownByNote?: boolean
  keepsInvoices?: boolean
}

export function saveCategory(input: CategoryInput): Category {
  const db = getDb()
  if (input.id) {
    // Una categoría no puede colgar de sí misma.
    const parentId = input.parentId === input.id ? null : (input.parentId ?? null)
    db.prepare(
      'UPDATE categories SET name = ?, kind = ?, parent_id = ?, icon = ?, color = ?, archived = ?, breakdown_by_note = ?, keeps_invoices = ? WHERE id = ?'
    ).run(
      input.name,
      input.kind,
      parentId,
      input.icon,
      input.color,
      input.archived ? 1 : 0,
      input.breakdownByNote === false ? 0 : 1,
      input.keepsInvoices ? 1 : 0,
      input.id
    )
    return getCategory(input.id)!
  }

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE kind = ?')
    .get(input.kind) as unknown as { m: number }
  const result = db
    .prepare(
      'INSERT INTO categories (name, kind, parent_id, icon, color, sort_order, breakdown_by_note, keeps_invoices) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      input.name,
      input.kind,
      input.parentId ?? null,
      input.icon,
      input.color,
      Number(maxOrder.m) + 1,
      input.breakdownByNote === false ? 0 : 1,
      input.keepsInvoices ? 1 : 0
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

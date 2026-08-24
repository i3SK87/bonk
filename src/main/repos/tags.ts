import { getDb } from '../db'
import type { Tag } from '@shared/types'

export function listTags(): Tag[] {
  return getDb().prepare('SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE').all() as unknown as Tag[]
}

function saveTag(input: { id?: number; name: string; color: string }): Tag {
  const db = getDb()
  const name = input.name.trim()
  if (!name) throw new Error('La etiqueta necesita un nombre')

  if (input.id) {
    db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name, input.color, input.id)
    return db.prepare('SELECT id, name, color FROM tags WHERE id = ?').get(input.id) as unknown as Tag
  }

  const existing = db.prepare('SELECT id, name, color FROM tags WHERE name = ? COLLATE NOCASE').get(name) as
    | Tag
    | undefined
  if (existing) return existing

  const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, input.color)
  return db.prepare('SELECT id, name, color FROM tags WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown as Tag
}

/** Devuelve los identificadores de una lista de nombres, creando los que no existan. */
export function ensureTags(names: string[], palette = '#8E8E93'): number[] {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => saveTag({ name, color: palette }).id)
}

export function tagsForTransactions(ids: number[]): Map<number, Tag[]> {
  const map = new Map<number, Tag[]>()
  if (ids.length === 0) return map

  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT tt.transaction_id AS txId, t.id, t.name, t.color
         FROM transaction_tags tt
         JOIN tags t ON t.id = tt.tag_id
        WHERE tt.transaction_id IN (${placeholders})
        ORDER BY t.name COLLATE NOCASE`
    )
    .all(...ids) as unknown as Array<{ txId: number; id: number; name: string; color: string }>

  for (const row of rows) {
    const list = map.get(row.txId) ?? []
    list.push({ id: row.id, name: row.name, color: row.color })
    map.set(row.txId, list)
  }
  return map
}

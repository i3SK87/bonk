import { copyFileSync, existsSync, unlinkSync, statSync, readFileSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDb, attachmentsDir, nowISO, bind } from '../db'
import type { Attachment } from '@shared/types'

interface AttachmentRow {
  id: number
  transaction_id: number
  filename: string
  original_name: string
  mime: string | null
  size: number | null
  created_at: string
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf'
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    filename: row.filename,
    originalName: row.original_name,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at
  }
}

export function listAttachments(transactionId: number): Attachment[] {
  const rows = getDb()
    .prepare('SELECT * FROM attachments WHERE transaction_id = ? ORDER BY id')
    .all(transactionId) as unknown as AttachmentRow[]
  return rows.map(mapAttachment)
}

export function attachmentPath(id: number): string | null {
  const row = getDb().prepare('SELECT filename FROM attachments WHERE id = ?').get(id) as
    | { filename: string }
    | undefined
  if (!row) return null
  const path = join(attachmentsDir(), row.filename)
  return existsSync(path) ? path : null
}

/**
 * Copia el archivo dentro de la carpeta de datos con un nombre único.
 * Guardar los adjuntos como ficheros y no como blobs mantiene la base de datos
 * pequeña y las copias de seguridad rápidas.
 */
export function addAttachment(transactionId: number, sourcePath: string): Attachment {
  if (!existsSync(sourcePath)) throw new Error('No se encuentra el archivo que quieres adjuntar')

  const stats = statSync(sourcePath)
  const maxBytes = 25 * 1024 * 1024
  if (stats.size > maxBytes) throw new Error('El archivo supera el límite de 25 MB')

  const ext = extname(sourcePath).toLowerCase()
  const filename = `${randomUUID()}${ext}`
  copyFileSync(sourcePath, join(attachmentsDir(), filename))

  const result = getDb()
    .prepare(
      `INSERT INTO attachments (transaction_id, filename, original_name, mime, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      transactionId,
      filename,
      basename(sourcePath),
      bind(MIME_BY_EXT[ext] ?? null),
      stats.size,
      nowISO()
    )

  const row = getDb()
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as unknown as AttachmentRow
  return mapAttachment(row)
}

export function deleteAttachment(id: number): void {
  const path = attachmentPath(id)
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(id)
  if (path) {
    try {
      unlinkSync(path)
    } catch {
      // Si Windows lo tiene bloqueado, la fila ya no existe y el archivo queda huérfano.
    }
  }
}

/** Devuelve el adjunto como data URL para poder pintarlo en la interfaz. */
export function readAttachmentData(id: number): string | null {
  const row = getDb().prepare('SELECT filename, mime FROM attachments WHERE id = ?').get(id) as
    | { filename: string; mime: string | null }
    | undefined
  if (!row) return null

  const path = join(attachmentsDir(), row.filename)
  if (!existsSync(path)) return null

  const buffer = readFileSync(path)
  const mime = row.mime ?? 'application/octet-stream'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/** Borra del disco los adjuntos cuya transacción ya no existe. */
export function pruneOrphanAttachments(): number {
  const orphans = getDb()
    .prepare(
      `SELECT a.id FROM attachments a
        LEFT JOIN transactions t ON t.id = a.transaction_id
        WHERE t.id IS NULL`
    )
    .all() as unknown as Array<{ id: number }>
  for (const orphan of orphans) deleteAttachment(orphan.id)
  return orphans.length
}

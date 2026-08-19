import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS } from './schema'
import { seedDefaults } from './seed'

let db: DatabaseSync | null = null
let dataDir = ''

export function getDb(): DatabaseSync {
  if (!db) throw new Error('La base de datos no está abierta todavía')
  return db
}

export function getDataDir(): string {
  return dataDir
}

export function attachmentsDir(): string {
  const dir = join(dataDir, 'attachments')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function dbPath(): string {
  return join(dataDir, 'moneyflow.db')
}

export function openDatabase(userDataPath: string): DatabaseSync {
  dataDir = userDataPath
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

  const file = dbPath()
  const isNew = !existsSync(file)
  db = new DatabaseSync(file)

  // WAL aguanta mucho mejor un cierre abrupto de Windows que el journal por defecto.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')

  // Las claves foráneas se apagan mientras se migra y solo entonces: hay
  // migraciones que reconstruyen tablas, y el interruptor no surte efecto si se
  // toca dentro de una transacción. Al terminar se comprueba que todo cuadre.
  db.exec('PRAGMA foreign_keys = OFF')
  migrate(db)
  db.exec('PRAGMA foreign_keys = ON')
  if (isNew) seedDefaults(db)

  return db
}

function migrate(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as unknown as { user_version: number }
  const current = Number(row?.user_version ?? 0)

  for (let version = current; version < MIGRATIONS.length; version++) {
    database.exec('BEGIN')
    try {
      database.exec(MIGRATIONS[version])

      // Si una reconstrucción de tablas dejó referencias huérfanas, mejor
      // enterarse aquí y deshacer que arrastrar una base incoherente.
      const broken = database.prepare('PRAGMA foreign_key_check').all()
      if (broken.length > 0) {
        throw new Error(`quedaron ${broken.length} referencias rotas`)
      }

      database.exec(`PRAGMA user_version = ${version + 1}`)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw new Error(`Falló la migración ${version + 1}: ${(error as Error).message}`)
    }
  }
}

/** Copia el archivo de base de datos a la carpeta de copias, rotando las antiguas. */
export function makeBackup(keep = 10): string {
  const dir = join(dataDir, 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // El checkpoint vuelca el WAL para que la copia contenga hasta el último apunte.
  getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const target = join(dir, `moneyflow-${stamp}.db`)
  copyFileSync(dbPath(), target)

  const old = readdirSync(dir)
    .filter((f) => f.startsWith('moneyflow-') && f.endsWith('.db'))
    .sort()
  while (old.length > keep) {
    const victim = old.shift()
    if (victim) unlinkSync(join(dir, victim))
  }
  return target
}

export function closeDatabase(): void {
  if (!db) return
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    db.close()
  } catch {
    // Cerrar es lo último que hacemos; si falla, no hay nada que salvar.
  }
  db = null
}

let transactionDepth = 0

/**
 * Ejecuta varias sentencias como una sola unidad atómica.
 *
 * Admite anidamiento: SQLite no deja abrir un BEGIN dentro de otro, así que a
 * partir del segundo nivel se usan savepoints. Hace falta porque hay operaciones
 * compuestas —generar las programadas vencidas, importar un CSV— que por dentro
 * llaman a otras que ya son atómicas por su cuenta.
 */
export function transaction<T>(fn: () => T): T {
  const database = getDb()

  if (transactionDepth > 0) {
    const savepoint = `mf_sp_${transactionDepth}`
    database.exec(`SAVEPOINT ${savepoint}`)
    transactionDepth++
    try {
      const result = fn()
      database.exec(`RELEASE ${savepoint}`)
      return result
    } catch (error) {
      database.exec(`ROLLBACK TO ${savepoint}`)
      database.exec(`RELEASE ${savepoint}`)
      throw error
    } finally {
      transactionDepth--
    }
  }

  database.exec('BEGIN')
  transactionDepth = 1
  try {
    const result = fn()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  } finally {
    transactionDepth = 0
  }
}

/** node:sqlite solo admite number, string, null, bigint y Uint8Array como parámetros. */
export function bind(value: unknown): number | string | null | bigint | Uint8Array {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' || typeof value === 'bigint') return value
  if (value instanceof Uint8Array) return value
  return String(value)
}

export const nowISO = (): string => new Date().toISOString()

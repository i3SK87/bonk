import { readFileSync, writeFileSync } from 'node:fs'
import { getDb, transaction as atomic } from '../db'
import { parseAmount, formatMoney, toMajor } from '@shared/money'
import { listTransactions } from './transactions'
import { listAccounts, saveAccount } from './accounts'
import { listCategories, saveCategory } from './categories'
import { getSettings } from './settings'
import { saveTransaction } from './transactions'
import type { Account, Category, CategoryKind, TransactionFilter, TxType } from '@shared/types'

const TYPE_LABEL: Record<TxType, string> = {
  refund: 'Reembolso',
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Traspaso'
}

/** Divide una línea respetando las comillas dobles y los saltos escapados. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields.map((field) => field.trim())
}

function escapeCsv(value: string | null | undefined): string {
  const text = value == null ? '' : String(value)
  return /[";\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Exporta a CSV separado por punto y coma y con BOM, que es lo que Excel
 * en español abre sin romper las tildes ni juntarlo todo en una columna.
 */
export function exportCsv(targetPath: string, filter: TransactionFilter = {}): number {
  const rows = listTransactions({ ...filter, limit: 1_000_000 })
  const header = ['Fecha', 'Hora', 'Tipo', 'Cuenta', 'Cuenta destino', 'Categoría', 'Importe', 'Notas', 'Lugar']

  const lines = [header.join(';')]
  for (const tx of rows) {
    lines.push(
      [
        tx.date,
        tx.time ?? '',
        TYPE_LABEL[tx.type],
        escapeCsv(tx.accountName),
        escapeCsv(tx.toAccountName),
        escapeCsv(tx.categoryName),
        // Con coma decimal para que Excel lo lea como número y no como texto.
        String(toMajor(tx.amount, tx.accountCurrency)).replace('.', ','),
        escapeCsv(tx.note?.replace(/\r?\n/g, ' ')),
        escapeCsv(tx.place)
      ].join(';')
    )
  }

  writeFileSync(targetPath, '﻿' + lines.join('\r\n'), 'utf8')
  return rows.length
}

const HEADER_ALIASES: Record<string, string> = {
  fecha: 'date',
  date: 'date',
  hora: 'time',
  time: 'time',
  tipo: 'type',
  type: 'type',
  cuenta: 'account',
  account: 'account',
  'cuenta destino': 'toAccount',
  'to account': 'toAccount',
  destino: 'toAccount',
  // Cabeceras de la exportación de Money Flow para iOS y Mac.
  'transferencia: cuenta': 'toAccount',
  'transfer: account': 'toAccount',
  'transferencia: suma': 'amountTo',
  'transfer: amount': 'amountTo',
  'transferencia: moneda': 'toCurrency',
  'transfer: currency': 'toCurrency',
  categoria: 'category',
  categoría: 'category',
  category: 'category',
  importe: 'amount',
  cantidad: 'amount',
  suma: 'amount',
  amount: 'amount',
  divisa: 'currency',
  moneda: 'currency',
  currency: 'currency',
  beneficiario: 'payee',
  comercio: 'payee',
  contraparte: 'payee',
  counterparty: 'payee',
  payee: 'payee',
  notas: 'note',
  nota: 'note',
  descripcion: 'note',
  descripción: 'note',
  note: 'note',
  notes: 'note',
  description: 'note',
  etiquetas: 'tags',
  tags: 'tags',
  lugar: 'place',
  place: 'place'
}

function normaliseHeader(value: string): string {
  const key = value.trim().toLowerCase().replace(/^﻿/, '')
  return HEADER_ALIASES[key] ?? key
}

/**
 * Clave para reconocer el mismo nombre escrito de otra forma: ignora mayúsculas,
 * tildes, espacios y puntuación. Así "Bart Bank" encuentra a "Bartbank" y
 * "Salud y Bienestar" a "Salud y bienestar", sin crear duplicados.
 */
function nameKey(value: string): string {
  // NFD separa la tilde de su letra; quedarse solo con letras y dígitos se lleva
  // por delante tildes, espacios y puntuación de una sola pasada.
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter((char) => (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9'))
    .join('')
}

/** Extrae la hora de una fecha completa tipo "2026-08-18 20:56:31". */
function parseTime(value: string): string | null {
  const match = value.trim().match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/)
  if (!match) return null
  const time = `${match[1].padStart(2, '0')}:${match[2]}`
  // Las exportaciones ponen 00:00:00 cuando no había hora; no aporta nada.
  return time === '00:00' ? null : time
}

/** Acepta 2026-08-18, 18/08/2026 y 18-08-2026, con o sin hora detrás. */
function parseDate(value: string): string | null {
  const text = value.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)

  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (!match) return null

  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  let year = match[3]
  if (year.length === 2) year = `20${year}`
  return `${year}-${month}-${day}`
}

function parseType(value: string, amountText: string): TxType {
  const text = value.trim().toLowerCase()
  if (text.startsWith('ingres') || text === 'income' || text === 'deposit') return 'income'
  if (text.startsWith('traspas') || text.startsWith('transfer')) return 'transfer'
  if (text.startsWith('reembols') || text === 'refund') return 'refund'
  if (text.startsWith('gast') || text === 'expense' || text === 'withdrawal') return 'expense'
  // Sin columna de tipo, el signo del importe decide.
  return amountText.trim().startsWith('-') ? 'expense' : 'income'
}

export interface ImportPreview {
  delimiter: string
  headers: string[]
  rows: string[][]
  total: number
}

export function previewCsv(sourcePath: string, sampleSize = 8): ImportPreview {
  const raw = readFileSync(sourcePath, 'utf8').replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) throw new Error('El archivo está vacío')

  const candidates = [';', ',', '\t', '|']
  const delimiter = candidates.reduce((best, candidate) =>
    splitCsvLine(lines[0], candidate).length > splitCsvLine(lines[0], best).length ? candidate : best
  )

  return {
    delimiter,
    headers: splitCsvLine(lines[0], delimiter),
    rows: lines.slice(1, sampleSize + 1).map((line) => splitCsvLine(line, delimiter)),
    total: lines.length - 1
  }
}

export interface ImportResult {
  imported: number
  skipped: number
  createdAccounts: string[]
  createdCategories: string[]
  errors: string[]
}

/**
 * Importa movimientos. Por defecto crea las cuentas y categorías que falten
 * para no perder filas por el camino.
 */
export interface ImportOptions {
  createMissing?: boolean
  defaultAccountId?: number
  /**
   * Sinónimos para los nombres que no se parecen literalmente pero significan lo
   * mismo ("Cerdito" es la "Hucha" de siempre). Van del nombre del archivo al
   * que ya existe en la aplicación; lo demás se encaja solo por parecido.
   */
  aliases?: {
    accounts?: Record<string, string>
    categories?: Record<string, string>
  }
}

export function importCsv(sourcePath: string, options: ImportOptions = {}): ImportResult {
  const createMissing = options.createMissing !== false
  const raw = readFileSync(sourcePath, 'utf8').replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) throw new Error('El archivo no tiene filas que importar')

  const preview = previewCsv(sourcePath, 1)
  const delimiter = preview.delimiter
  const headers = splitCsvLine(lines[0], delimiter).map(normaliseHeader)

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    createdAccounts: [],
    createdCategories: [],
    errors: []
  }

  const baseCurrency = getSettings().baseCurrency
  const accounts = new Map(listAccounts(true).map((account) => [nameKey(account.name), account]))
  const categories = new Map(listCategories(true).map((category) => [nameKey(category.name), category]))

  /** Aplica los sinónimos declarados antes de buscar nada. */
  const applyAlias = (name: string, table?: Record<string, string>): string => {
    if (!table) return name
    const key = nameKey(name)
    for (const [from, to] of Object.entries(table)) {
      if (nameKey(from) === key) return to
    }
    return name
  }

  /** Busca la cuenta por nombre y la crea si hace falta; sirve para origen y destino. */
  const resolveAccount = (rawName: string, currency?: string): Account => {
    const name = applyAlias(rawName, options.aliases?.accounts)
    const existing = accounts.get(nameKey(name))
    if (existing) return existing
    if (!createMissing) throw new Error(`la cuenta "${name}" no existe`)

    const created = saveAccount({
      name,
      type: 'bank',
      currency: (currency || baseCurrency).toUpperCase(),
      initialBalance: 0,
      icon: 'bank',
      color: '#0A84FF',
      excludeFromTotal: false
    })
    accounts.set(nameKey(name), created)
    result.createdAccounts.push(name)
    return created
  }

  /** Igual que las cuentas: encaja con la categoría existente antes de crear una nueva. */
  const resolveCategory = (rawName: string, kind: CategoryKind): Category | null => {
    const name = applyAlias(rawName, options.aliases?.categories).trim()
    if (!name) return null

    const existing = categories.get(nameKey(name))
    if (existing) return existing
    if (!createMissing) return null

    const created = saveCategory({ name, kind, icon: 'tag', color: '#8E8E93' })
    categories.set(nameKey(name), created)
    result.createdCategories.push(name)
    return created
  }

  const toRecord = (line: string): Record<string, string> => {
    const fields = splitCsvLine(line, delimiter)
    const record: Record<string, string> = {}
    headers.forEach((header, i) => {
      record[header] = fields[i] ?? ''
    })
    return record
  }

  /**
   * Sin columna de tipo, el signo del importe no basta: un positivo puede ser un
   * ingreso o la devolución de un gasto. Se recorre el archivo entero primero
   * para ver qué categorías se usan alguna vez en negativo; esas son de gasto, y
   * un positivo suyo es un reembolso. Así lo exporta Money Flow para iOS.
   */
  const hasTypeColumn = headers.includes('type')
  const expenseCategories = new Set<string>()
  if (!hasTypeColumn) {
    for (const line of lines.slice(1)) {
      const record = toRecord(line)
      if (record.toAccount?.trim()) continue
      const name = record.category?.trim()
      if (!name) continue
      const value = parseAmount(record.amount ?? '', baseCurrency)
      if (value != null && value < 0) {
        expenseCategories.add(nameKey(applyAlias(name, options.aliases?.categories)))
      }
    }
    // Una categoría que ya existe como gasto en la aplicación cuenta igual.
    for (const category of listCategories(true)) {
      if (category.kind === 'expense') expenseCategories.add(nameKey(category.name))
    }
  }

  atomic(() => {
    lines.slice(1).forEach((line, index) => {
      const rowNumber = index + 2
      try {
        const record = toRecord(line)

        const date = parseDate(record.date ?? '')
        if (!date) throw new Error('fecha ilegible')

        const signed = parseAmount(record.amount ?? '', baseCurrency)
        let type: TxType
        if (record.toAccount?.trim()) {
          type = 'transfer'
        } else if (hasTypeColumn && record.type?.trim()) {
          type = parseType(record.type, record.amount ?? '')
        } else if (signed != null && signed < 0) {
          type = 'expense'
        } else {
          // Misma clave normalizada que en la pre-exploración, o "Alimentación"
          // no reconocería a "alimentacion" y el reembolso pasaría por ingreso.
          const category = record.category?.trim()
          const key = category ? nameKey(applyAlias(category, options.aliases?.categories)) : ''
          type = key && expenseCategories.has(key) ? 'refund' : 'income'
        }

        // La cuenta manda sobre la divisa del importe.
        const account =
          (record.account ? accounts.get(record.account.trim().toLowerCase()) : undefined) ??
          (options.defaultAccountId
            ? listAccounts(true).find((item) => item.id === options.defaultAccountId)
            : undefined) ??
          resolveAccount(record.account?.trim() || 'Importada', record.currency)

        const amount = parseAmount(record.amount ?? '', account.currency)
        if (amount == null || amount === 0) throw new Error('importe ilegible')

        let categoryId: number | null = null
        if (type !== 'transfer' && record.category?.trim()) {
          const category = resolveCategory(record.category, type === 'income' ? 'income' : 'expense')
          categoryId = category?.id ?? null
        }

        let toAccountId: number | null = null
        let amountTo: number | null = null
        if (type === 'transfer') {
          const name = record.toAccount?.trim()
          if (!name) throw new Error('traspaso sin cuenta de destino')
          const target = resolveAccount(name, record.toCurrency || record.currency)
          toAccountId = target.id
          // Lo que llega al destino solo importa si las divisas no coinciden.
          const received = parseAmount(record.amountTo ?? '', target.currency)
          if (received != null && received !== 0) amountTo = Math.abs(received)
        }

        saveTransaction({
          type,
          date,
          // La hora puede venir en su propia columna o pegada a la fecha.
          time: record.time?.trim() || parseTime(record.date ?? ''),
          accountId: account.id,
          toAccountId,
          amountTo,
          categoryId,
          amount: Math.abs(amount),
          note: record.note?.trim() || null,
          place: record.place?.trim() || null
        })
        result.imported++
      } catch (error) {
        result.skipped++
        if (result.errors.length < 20) {
          result.errors.push(`Fila ${rowNumber}: ${(error as Error).message}`)
        }
      }
    })
  })

  return result
}

/** Resumen legible del último informe, para mostrarlo en un aviso. */
export function describeImport(result: ImportResult): string {
  const parts = [`${result.imported} movimientos importados`]
  if (result.skipped) parts.push(`${result.skipped} descartados`)
  if (result.createdAccounts.length) parts.push(`${result.createdAccounts.length} cuentas nuevas`)
  if (result.createdCategories.length) parts.push(`${result.createdCategories.length} categorías nuevas`)
  return parts.join(', ')
}

/** Exporta un resumen por categorías, pensado para llevárselo a una hoja de cálculo. */
export function exportCategoryReport(targetPath: string, rows: Array<{ name: string; total: number; count: number; percent: number }>, currency: string): void {
  const lines = ['Categoría;Total;Movimientos;Porcentaje']
  for (const row of rows) {
    lines.push(
      [
        escapeCsv(row.name),
        formatMoney(row.total, currency, { noSymbol: true }),
        String(row.count),
        `${row.percent.toFixed(1)}%`
      ].join(';')
    )
  }
  writeFileSync(targetPath, '﻿' + lines.join('\r\n'), 'utf8')
}

/** Vacía todos los movimientos manteniendo cuentas y categorías. */
export function clearTransactions(): number {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as unknown as { n: number }).n
  db.exec('DELETE FROM transactions')
  return Number(count)
}

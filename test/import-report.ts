/**
 * Importa un CSV sobre una carpeta de datos y cuenta con detalle cómo lo ha
 * interpretado. Pensado para probar en una copia antes de tocar los datos buenos.
 *
 *   node out/test/import-report.mjs <carpeta de datos> <archivo.csv>
 */
import { readFileSync } from 'node:fs'
import { openDatabase, closeDatabase } from '../src/main/db'
import * as accounts from '../src/main/repos/accounts'
import * as categories from '../src/main/repos/categories'
import * as transactions from '../src/main/repos/transactions'
import * as csv from '../src/main/repos/csv'
import { formatMoney } from '../src/shared/money'
import { formatDate } from '../src/shared/dates'
import type { TxType } from '../src/shared/types'

const [dir, file, aliasFile] = process.argv.slice(2)
if (!dir || !file) {
  console.error('Uso: import-report <carpeta> <csv> [sinonimos.json]')
  process.exit(1)
}

const aliases = aliasFile ? JSON.parse(readFileSync(aliasFile, 'utf8')) : undefined

openDatabase(dir)

const before = transactions.countTransactions({})
const started = Date.now()
const result = csv.importCsv(file, { aliases })
const elapsed = Date.now() - started

const LABELS: Record<TxType, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
  transfer: 'Traspasos',
  refund: 'Reembolsos'
}

console.log(`\n=== RESULTADO (${elapsed} ms) ===`)
console.log(`  importados      ${result.imported}`)
console.log(`  descartados     ${result.skipped}`)
console.log(`  antes había     ${before} movimientos`)
console.log(`  ahora hay       ${transactions.countTransactions({})}`)

console.log('\n=== CÓMO HA CLASIFICADO CADA FILA ===')
const all = transactions.listTransactions({ limit: 100000 })
for (const type of ['expense', 'income', 'transfer', 'refund'] as TxType[]) {
  const rows = all.filter((row) => row.type === type)
  const sum = rows.reduce((total, row) => total + row.amount, 0)
  console.log(`  ${LABELS[type].padEnd(12)} ${String(rows.length).padStart(4)}   ${formatMoney(sum, 'EUR')}`)
}

console.log('\n=== CUENTAS ===')
for (const account of accounts.listAccountsWithBalance(true)) {
  console.log(`  ${account.name.padEnd(20)} ${formatMoney(account.balance, account.currency).padStart(14)}`)
}
console.log(`  ${'PATRIMONIO'.padEnd(20)} ${formatMoney(accounts.netWorth(), 'EUR').padStart(14)}`)

console.log(`\n=== CATEGORÍAS CREADAS (${result.createdCategories.length}) ===`)
const created = new Set(result.createdCategories)
for (const category of categories.listCategories(true)) {
  if (!created.has(category.name)) continue
  const count = all.filter((row) => row.categoryId === category.id).length
  console.log(`  ${category.name.padEnd(26)} ${category.kind === 'expense' ? 'gasto  ' : 'ingreso'} ${String(count).padStart(4)} movimientos`)
}

console.log(`\n=== CUENTAS CREADAS: ${result.createdAccounts.join(', ') || 'ninguna'} ===`)

const refunds = all.filter((row) => row.type === 'refund')
console.log(`\n=== REEMBOLSOS DETECTADOS (${refunds.length}, se muestran 12) ===`)
for (const row of refunds.slice(0, 12)) {
  console.log(
    `  ${formatDate(row.date)}  ${(row.categoryName ?? 'sin categoría').padEnd(26)} ${formatMoney(row.amount, row.accountCurrency).padStart(10)}  ${row.note ?? ''}`
  )
}

const income = all.filter((row) => row.type === 'income')
console.log(`\n=== INGRESOS (${income.length}, se muestran 12) ===`)
for (const row of income.slice(0, 12)) {
  console.log(
    `  ${formatDate(row.date)}  ${(row.categoryName ?? 'sin categoría').padEnd(26)} ${formatMoney(row.amount, row.accountCurrency).padStart(10)}  ${row.note ?? ''}`
  )
}

const transfers = all.filter((row) => row.type === 'transfer')
console.log(`\n=== TRASPASOS (${transfers.length}, se muestran 5) ===`)
for (const row of transfers.slice(0, 5)) {
  console.log(
    `  ${formatDate(row.date)}  ${row.accountName} → ${row.toAccountName}  ${formatMoney(row.amount, row.accountCurrency)}`
  )
}

const withTime = all.filter((row) => row.time).length
const withNote = all.filter((row) => row.note).length
const withPlace = all.filter((row) => row.place).length
console.log(`\n=== DETALLES CONSERVADOS ===`)
console.log(`  con hora   ${withTime}`)
console.log(`  con nota   ${withNote}`)
console.log(`  con lugar  ${withPlace}`)

if (result.errors.length) {
  console.log(`\n=== FILAS DESCARTADAS ===`)
  for (const error of result.errors) console.log(`  ${error}`)
}

closeDatabase()

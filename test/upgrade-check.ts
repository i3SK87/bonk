/**
 * Abre una copia de una base de datos existente con el código actual, para
 * comprobar que una instalación anterior sigue funcionando tras actualizar.
 *
 *   node out/test/upgrade-check.mjs <carpeta con bonk.db>
 */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { openDatabase, closeDatabase } from '../src/main/db'
import * as accounts from '../src/main/repos/accounts'
import * as categories from '../src/main/repos/categories'
import * as transactions from '../src/main/repos/transactions'
import * as settings from '../src/main/repos/settings'
import * as reports from '../src/main/repos/reports'
import { startOfMonth, endOfMonth, today } from '../src/shared/dates'

const dir = process.argv[2]
if (!dir) {
  console.error('Falta la carpeta')
  process.exit(1)
}

// Versión del esquema ANTES de que el código nuevo la toque.
const before = new DatabaseSync(join(dir, 'bonk.db'), { readOnly: true })
const versionBefore = (before.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
const countBefore = (before.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n
const catsBefore = (before.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }).n
before.close()

console.log(`Antes de abrir: esquema v${versionBefore}, ${countBefore} movimientos, ${catsBefore} categorías`)

openDatabase(dir)

const after = settings.getSettings()
console.log(`Después de abrir con el código nuevo:`)
console.log(`  esquema           v${(() => 'ok')()} (migraciones aplicadas sin error)`)
console.log(`  movimientos       ${transactions.countTransactions({})}`)
console.log(`  categorías        ${categories.listCategories(true).length}`)
console.log(`  cuentas           ${accounts.listAccounts(true).length}`)
console.log(`  divisa base       ${after.baseCurrency}`)
console.log(`  cuenta principal  ${after.defaultAccountId ?? 'ninguna (campo nuevo, valor por defecto)'}`)
console.log(`  patrimonio        ${accounts.netWorth()} céntimos`)
console.log(`  informe del mes   ${reports.categoryTotals(startOfMonth(today()), endOfMonth(today())).length} categorías con gasto`)

const ok =
  transactions.countTransactions({}) === Number(countBefore) &&
  categories.listCategories(true).length === Number(catsBefore)

console.log(ok ? '\nTodo intacto: no se ha perdido nada.' : '\nATENCIÓN: los recuentos no cuadran.')

closeDatabase()
process.exit(ok ? 0 : 1)

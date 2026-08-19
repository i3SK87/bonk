/**
 * Imprime el reparto por categorías con su desglose por notas, leyendo una
 * COPIA de una base real. Sirve para ver qué saca el informe sin abrir la app.
 *
 *   npx esbuild test/breakdown-peek.ts --bundle --platform=node --format=esm \n *     --outfile=out/test/breakdown-peek.mjs --external:node:* --alias:@shared=./src/shared
 *   node out/test/breakdown-peek.mjs <carpeta con una copia de bonk.db>
 */
import { openDatabase, closeDatabase } from '../src/main/db'
import * as categories from '../src/main/repos/categories'
import * as reports from '../src/main/repos/reports'
import { formatMoney } from '../src/shared/money'

openDatabase(process.argv[2])
console.log('Sin desglose:', categories.listCategories(true).filter((c) => !c.breakdownByNote).map((c) => c.name).join(', '))
console.log()
for (const row of reports.categoryTotals('2020-01-01', '2030-12-31', 'expense')) {
  console.log(`${row.name.padEnd(16)} ${formatMoney(row.total, 'EUR').padStart(12)}  (${row.count})`)
  for (const note of row.notes) {
    console.log(`   · ${note.note.padEnd(28)} ${formatMoney(note.total, 'EUR').padStart(11)}  ${note.percent.toFixed(1)}%`)
  }
}
closeDatabase()

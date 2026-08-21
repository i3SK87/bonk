/**
 * Prueba de humo de la capa de datos. Se ejecuta con Node 24 (que ya trae
 * node:sqlite) sobre una carpeta temporal, así que no toca los datos reales.
 *
 *   npm run test
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, closeDatabase } from '../src/main/db'
import * as accounts from '../src/main/repos/accounts'
import * as categories from '../src/main/repos/categories'
import * as transactions from '../src/main/repos/transactions'
import * as goals from '../src/main/repos/goals'
import * as scheduled from '../src/main/repos/scheduled'
import * as reports from '../src/main/repos/reports'
import * as settings from '../src/main/repos/settings'
import * as tags from '../src/main/repos/tags'
import * as csv from '../src/main/repos/csv'
import { parseAmount, formatMoney, convert, toMinor } from '../src/shared/money'
import { keepNumericChars } from '../src/shared/numbers'
import { keepNumericChars } from '../src/shared/numbers'
import { evaluate } from '../src/shared/calc'
import { periodRange, addMonths, addDays, nextOccurrence, startOfMonth, endOfMonth, today } from '../src/shared/dates'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FALLO ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function equal(name: string, actual: unknown, expected: unknown): void {
  check(name, Object.is(actual, expected), `esperado ${String(expected)}, obtenido ${String(actual)}`)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

const dir = mkdtempSync(join(tmpdir(), 'bonk-test-'))

try {
  openDatabase(dir)

  section('Semilla inicial')
  const seededCategories = categories.listCategories()
  const seededAccounts = accounts.listAccounts()
  check('crea categorías por defecto', seededCategories.length >= 25, `hay ${seededCategories.length}`)
  // Alfabéticas dentro de cada tipo, con la ñ y los acentos donde toca.
  const gastos = seededCategories.filter((category) => category.kind === 'expense').map((c) => c.name)
  const alfabeticas = [...gastos].sort(new Intl.Collator('es', { sensitivity: 'base' }).compare)
  check('las categorías salen alfabéticas', gastos.join('|') === alfabeticas.join('|'), gastos.join(', '))
  check(
    'los ingresos van delante de los gastos',
    seededCategories.findIndex((c) => c.kind === 'expense') >
      seededCategories.findLastIndex((c) => c.kind === 'income')
  )
  check('crea cuentas por defecto', seededAccounts.length === 2, `hay ${seededAccounts.length}`)
  equal('la divisa base es el euro', settings.getSettings().baseCurrency, 'EUR')
  equal('arranca con la paleta base', settings.getSettings().palette, 'grafito')
  settings.updateSettings({ palette: 'sepia' })
  equal('la paleta elegida se guarda', settings.getSettings().palette, 'sepia')
  settings.updateSettings({ palette: 'grafito' })
  // Las previsiones cambian las cifras de cabecera, así que se entra a mano.
  check('las programadas previstas vienen apagadas', settings.getSettings().showScheduledInList === false)
  settings.setSetting('showScheduledInList', '')
  check(
    'y siguen apagadas si el ajuste no está guardado',
    settings.getSettings().showScheduledInList === false
  )

  check('no arranca con Windows sin pedirlo', settings.getSettings().startWithWindows === false)
  check('el aspa cierra, salvo que se pida lo contrario', settings.getSettings().closeToTray === false)
  settings.updateSettings({ startWithWindows: true, closeToTray: true })
  check('el arranque con Windows se guarda', settings.getSettings().startWithWindows === true)
  check('quedarse en la bandeja se guarda', settings.getSettings().closeToTray === true)
  settings.updateSettings({ startWithWindows: false, closeToTray: false })

  section('Importes y divisas')
  equal('interpreta "1.234,56" al estilo español', parseAmount('1.234,56', 'EUR'), 123456)
  equal('interpreta "1234.56" al estilo inglés', parseAmount('1234.56', 'EUR'), 123456)
  equal('interpreta "12,5"', parseAmount('12,5', 'EUR'), 1250)
  equal('interpreta "1,234" como millar', parseAmount('1,234', 'EUR'), 123400)
  equal('descarta texto sin números', parseAmount('hola', 'EUR'), null)
  equal('interpreta "1.234" como millar', parseAmount('1.234', 'EUR'), 123400)
  equal('y "1.234.567,89" con todos los millares', parseAmount('1.234.567,89', 'EUR'), 123456789)
  // La coma y el punto valen por igual: nadie tiene que acordarse de cuál
  // acepta el campo, ni cambiar de tecla según venga del teclado numérico.
  for (const [coma, punto] of [
    ['12,50', '12.50'],
    ['0,5', '0.5'],
    ['1,234', '1.234'],
    ['1.234,56', '1,234.56'],
    ['1500', '1500']
  ]) {
    equal(
      `"${coma}" y "${punto}" se leen igual`,
      parseAmount(coma, 'EUR'),
      parseAmount(punto, 'EUR')
    )
  }
  // Y en una divisa de tres decimales esas tres cifras sí son decimales.
  equal('"1,234" en dinares son 1,234', parseAmount('1,234', 'KWD'), 1234)

  // En el campo de importe la regla es otra: un solo separador y siempre
  // decimal. Los millares son cosa de lo que llega de fuera —el CSV de un
  // banco—, no de lo que se escribe a mano.
  const escrito = (text: string): string => keepNumericChars(text, { decimals: true })
  const tecleado = (text: string): number | null =>
    parseAmount(escrito(text), 'EUR', { grouping: false })
  equal('el campo solo admite un separador', escrito('1.233,34'), '1.23334')
  equal('venga en el orden que venga', escrito('1,233.34'), '1,23334')
  equal('y ese separador es el decimal', tecleado('1,23334'), 123)
  equal('con punto, lo mismo', tecleado('1.23334'), 123)
  equal('tecleando "12,50" entran 12,50 €', tecleado('12,50'), 1250)
  equal('tecleando "12.50" entran 12,50 €', tecleado('12.50'), 1250)
  equal('un separador suelto no rompe nada', tecleado('12,'), 1200)
  // El mismo texto, dos lecturas, y las dos son la que toca donde se usa.
  equal('escribiendo "1.234" es un euro con veintitrés', tecleado('1.234'), 123)
  equal('importándolo, mil doscientos treinta y cuatro', parseAmount('1.234', 'EUR'), 123400)
  equal('el yen no tiene decimales', toMinor(1500, 'JPY'), 1500)
  // Intl separa el símbolo con espacio duro; se normaliza para poder comparar.
  const plain = (value: string): string => value.replace(/ /g, ' ')
  equal('formatea en euros', plain(formatMoney(1234567, 'EUR')), '12.345,67 €')
  // El español no agrupa los millares de cuatro cifras: 1234,56 y no 1.234,56.
  equal('no agrupa las cifras de cuatro dígitos', plain(formatMoney(123456, 'EUR')), '1234,56 €')
  equal('formatea negativos con el signo menos tipográfico', plain(formatMoney(-500, 'EUR')), '−5,00 €')
  equal('convierte con tipo de cambio', convert(10000, 'EUR', 'USD', { EUR: 1, USD: 1.1 }), 11000)

  section('Campos que solo admiten números')
  equal('descarta las letras sueltas', keepNumericChars('12a3b'), '123')
  equal('descarta un texto entero', keepNumericChars('hola'), '')
  equal('descarta la notación científica', keepNumericChars('1e5'), '15')
  equal('conserva un separador decimal', keepNumericChars('12,50'), '12,50')
  equal('deja solo el primer separador', keepNumericChars('1,2,3'), '1,23')
  equal('mezcla de coma y punto: manda el primero', keepNumericChars('1.2,3'), '1.23')
  equal('en modo entero no admite decimales', keepNumericChars('12,5', { decimals: false }), '125')
  equal('sin signo permitido lo quita', keepNumericChars('-12'), '12')
  equal('con signo permitido lo conserva delante', keepNumericChars('-12', { negative: true }), '-12')
  equal('el signo en medio no cuenta', keepNumericChars('1-2', { negative: true }), '12')
  equal('descarta símbolos de moneda', keepNumericChars('12€'), '12')

  section('Calculadora')
  equal('reparte un recibo', evaluate('33,99/4'), 8.4975)
  equal('acepta el punto como decimal, que es lo que sale del teclado numérico', evaluate('33.99/4'), 8.4975)
  equal('con coma, el punto son millares', evaluate('1.234,50/2'), 617.25)
  equal('respeta la precedencia', evaluate('2+3*4'), 14)
  equal('los paréntesis mandan', evaluate('(2+3)*4'), 20)
  equal('los signos del teclado propio valen igual', evaluate('10−4×2÷4'), 8)
  equal('el porcentaje es entre cien', evaluate('33,99*25%'), 8.4975)
  equal('el menos delante niega', evaluate('-5+8'), 3)
  equal('la expresión a medias no da resultado', evaluate('12/'), null)
  equal('el paréntesis sin cerrar tampoco', evaluate('(2+3'), null)
  equal('dividir entre cero no da infinito', evaluate('5/0'), null)
  equal('las letras no cuelan', evaluate('5*a'), null)
  equal('la expresión vacía no da resultado', evaluate(''), null)

  section('Fechas')
  equal('suma meses recortando al último día', addMonths('2026-01-31', 1), '2026-02-28')
  equal('el mes siguiente de una programada mensual', nextOccurrence('2026-08-18', 'monthly', 1), '2026-09-18')
  const monthPeriod = periodRange('monthly', '2026-01-01', '2026-08-18')
  equal('el periodo mensual empieza el día 1', monthPeriod.start, '2026-08-01')
  equal('el periodo mensual acaba el día 31', monthPeriod.end, '2026-08-31')
  equal('el índice del periodo cuenta desde el inicio', monthPeriod.index, 7)

  section('Cuentas y saldos')
  const cash = accounts.saveAccount({
    name: 'Cartera',
    type: 'cash',
    currency: 'EUR',
    initialBalance: 10000,
    icon: 'wallet',
    color: '#34C759',
    excludeFromTotal: false
  })
  const bank = accounts.saveAccount({
    name: 'Banco',
    type: 'bank',
    currency: 'EUR',
    initialBalance: 100000,
    icon: 'bank',
    color: '#0A84FF',
    excludeFromTotal: false
  })
  const dollars = accounts.saveAccount({
    name: 'Cuenta en dólares',
    type: 'bank',
    currency: 'USD',
    initialBalance: 0,
    icon: 'bank',
    color: '#FF9500',
    excludeFromTotal: false
  })
  settings.setRate('USD', 1.1)

  const food = categories.listCategories().find((category) => category.name === 'Alimentación')!
  const salary = categories.listCategories().find((category) => category.name === 'Nómina')!
  const day = today()

  transactions.saveTransaction({ type: 'expense', date: day, accountId: cash.id, categoryId: food.id, amount: 2550 })
  transactions.saveTransaction({ type: 'income', date: day, accountId: bank.id, categoryId: salary.id, amount: 180000 })
  transactions.saveTransaction({ type: 'transfer', date: day, accountId: bank.id, toAccountId: cash.id, amount: 5000 })

  const balances = accounts.listAccountsWithBalance()
  const cashBalance = balances.find((account) => account.id === cash.id)!
  const bankBalance = balances.find((account) => account.id === bank.id)!
  equal('el gasto y el traspaso recibido cuadran en la cartera', cashBalance.balance, 10000 - 2550 + 5000)
  equal('el ingreso y el traspaso enviado cuadran en el banco', bankBalance.balance, 100000 + 180000 - 5000)

  // Traspaso entre divisas: sale en euros y entra en dólares al cambio guardado.
  transactions.saveTransaction({ type: 'transfer', date: day, accountId: bank.id, toAccountId: dollars.id, amount: 10000 })
  const afterFx = accounts.listAccountsWithBalance()
  equal('el destino en dólares recibe el importe convertido', afterFx.find((a) => a.id === dollars.id)!.balance, 11000)
  equal('el origen descuenta los euros enviados', afterFx.find((a) => a.id === bank.id)!.balance, 100000 + 180000 - 5000 - 10000)

  const worth = accounts.netWorth()
  // Patrimonio = cartera + banco + 110 USD convertidos de vuelta a 100 EUR.
  equal('el patrimonio suma las divisas convertidas', worth, 12450 + 265000 + 10000)

  section('Validaciones')
  let rejected = false
  try {
    transactions.saveTransaction({ type: 'expense', date: day, accountId: cash.id, amount: 0 })
  } catch {
    rejected = true
  }
  check('rechaza importes de cero', rejected)

  rejected = false
  try {
    transactions.saveTransaction({ type: 'transfer', date: day, accountId: cash.id, toAccountId: cash.id, amount: 100 })
  } catch {
    rejected = true
  }
  check('rechaza un traspaso a la misma cuenta', rejected)

  rejected = false
  try {
    transactions.saveTransaction({ type: 'expense', date: '18/08/2026', accountId: cash.id, amount: 100 })
  } catch {
    rejected = true
  }
  check('rechaza fechas mal formadas', rejected)

  section('Etiquetas y búsqueda')
  const tagIds = tags.ensureTags(['viaje', 'agosto'])
  transactions.saveTransaction({
    type: 'expense',
    date: day,
    accountId: cash.id,
    categoryId: food.id,
    amount: 4000,
    payee: 'Mercadona',
    note: 'Compra grande',
    tagIds
  })
  equal('no duplica etiquetas existentes', tags.ensureTags(['viaje']).length, 1)
  equal('hay dos etiquetas en total', tags.listTags().length, 2)
  check('encuentra por beneficiario', transactions.listTransactions({ search: 'mercadona' }).length === 1)
  check('encuentra por etiqueta', transactions.listTransactions({ tagIds: [tagIds[0]] }).length === 1)
  check('encuentra por nota', transactions.listTransactions({ search: 'compra grande' }).length === 1)
  equal('sugiere el beneficiario tecleado', transactions.payeeSuggestions('merca')[0], 'Mercadona')
  equal('recuerda la categoría del beneficiario', transactions.categoryForPayee('Mercadona'), food.id)

  section('Informes')
  const monthStart = startOfMonth(day)
  const expenses = reports.categoryTotals(monthStart, day, 'expense')
  const foodTotal = expenses.find((row) => row.categoryId === food.id)!
  equal('agrupa el gasto por categoría', foodTotal.total, 2550 + 4000)
  equal('el traspaso no cuenta como gasto', reports.totalFor('expense', monthStart, day), 6550)
  equal('el ingreso se contabiliza aparte', reports.totalFor('income', monthStart, day), 180000)
  const series = reports.monthlySeries(12)
  equal('la serie mensual trae doce puntos', series.length, 12)
  equal('el último mes acumula el gasto', series[11].expense, 6550)

  section('Desglose por notas')
  const debt = categories.saveCategory({ name: 'Deuda', kind: 'expense', icon: 'debt', color: '#FF3B30' })
  check('una categoría nueva se desglosa por defecto', debt.breakdownByNote)
  check('y no guarda facturas hasta que se le diga', debt.keepsInvoices === false)
  check(
    'la casilla de facturas se guarda',
    categories.saveCategory({ ...debt, keepsInvoices: true }).keepsInvoices
  )
  categories.saveCategory({ ...debt, keepsInvoices: false })
  const debtTx = (amount: number, note: string): void => {
    transactions.saveTransaction({ type: 'expense', date: day, accountId: bank.id, categoryId: debt.id, amount, note })
  }
  debtTx(10000, '4Geeks')
  debtTx(5000, 'PC')
  // Misma nota escrita de otra forma: debe caer en el mismo grupo.
  debtTx(2500, '  pc  ')
  debtTx(3000, 'Kindle')
  transactions.saveTransaction({
    type: 'refund',
    date: day,
    accountId: bank.id,
    categoryId: debt.id,
    amount: 1000,
    note: 'Kindle'
  })

  const withNotes = reports.categoryTotals(monthStart, day, 'expense')
  const debtRow = withNotes.find((row) => row.categoryId === debt.id)!
  equal('el desglose agrupa las notas', debtRow.notes.length, 3)
  equal('la nota mayor encabeza el desglose', debtRow.notes[0].note, '4Geeks')
  equal('suma las variantes de la misma nota', debtRow.notes[1].total, 7500)
  equal('el reembolso rebaja su nota', debtRow.notes[2].total, 2000)
  equal('los desgloses cuadran con el total de la categoría', debtRow.notes.reduce((sum, item) => sum + item.total, 0), debtRow.total)
  check('los porcentajes del desglose suman cien', Math.abs(debtRow.notes.reduce((sum, item) => sum + item.percent, 0) - 100) < 0.01)

  categories.saveCategory({ ...debt, breakdownByNote: false })
  const flat = reports
    .categoryTotals(monthStart, day, 'expense')
    .find((row) => row.categoryId === debt.id)!
  equal('una categoría fija no trae desglose', flat.notes.length, 0)
  equal('apagar el desglose no cambia el total', flat.total, debtRow.total)
  categories.saveCategory({ ...debt, breakdownByNote: true })

  section('Hitos de ahorro')
  const bote = accounts.saveAccount({
    name: 'Bote', type: 'savings', currency: 'EUR', initialBalance: 30000,
    icon: 'piggy', color: '#34C759', excludeFromTotal: false
  })
  const pc = goals.saveGoal({
    name: 'PC', accountId: bote.id, targetAmount: 100000, targetDate: addMonths(day, 5)
  })
  const viaje = goals.saveGoal({
    name: 'Viaje', accountId: bote.id, targetAmount: 50000, targetDate: addMonths(day, 2)
  })

  const hitos = goals.goalProgress(day)
  const conFecha = hitos.map((item) => item.name)
  equal('el hito con la fecha más cercana va primero', conFecha[0], 'Viaje')

  const viajeP = hitos.find((item) => item.id === viaje.id)!
  const pcP = hitos.find((item) => item.id === pc.id)!
  // El saldo de la hucha se reparte por orden de fecha: el viaje se lleva los
  // 300 € que hay y al PC no le llega nada todavía.
  equal('el hito más próximo se lleva el saldo', viajeP.saved, 30000)
  equal('y el siguiente se queda sin nada', pcP.saved, 0)
  equal('lo repartido nunca pasa del saldo', viajeP.saved + pcP.saved, 30000)
  equal('calcula lo que falta', viajeP.missing, 20000)
  check('el porcentaje va sobre su objetivo', Math.round(viajeP.percent) === 60)
  check('dice cuánto apartar al mes', viajeP.perMonth != null && viajeP.perMonth > 0)

  // Al darlo por cumplido, deja de repartir: su dinero está comprometido.
  goals.setGoalAchieved(viaje.id, true, day)
  const trasCumplir = goals.goalProgress(day)
  equal('un hito cumplido conserva su objetivo', trasCumplir.find((i) => i.id === viaje.id)!.saved, 50000)
  equal('y libera el saldo para el siguiente', trasCumplir.find((i) => i.id === pc.id)!.saved, 30000)
  equal('los cumplidos se van al final', trasCumplir[trasCumplir.length - 1].id, viaje.id)

  goals.setGoalAchieved(viaje.id, false, day)
  let goalRejected = false
  try {
    goals.saveGoal({ name: 'Sin cantidad', accountId: bote.id, targetAmount: 0 })
  } catch {
    goalRejected = true
  }
  check('rechaza un hito sin cantidad', goalRejected)

  goals.deleteGoal(pc.id)
  goals.deleteGoal(viaje.id)
  equal('borrar un hito no deja rastro', goals.listGoals().length, 0)

  section('Reembolsos')
  // El caso real: pagas una suscripción de 11,99 € y otras tres personas te
  // devuelven 3 € cada una. Tu gasto de verdad son 2,99 €.
  const subs = categories.listCategories().find((category) => category.name === 'Suscripciones')!
  const bankBeforeSubs = accounts.listAccountsWithBalance().find((a) => a.id === bank.id)!.balance
  const expenseBeforeSubs = reports.totalFor('expense', monthStart, day)
  const incomeBeforeSubs = reports.totalFor('income', monthStart, day)

  const premium = transactions.saveTransaction({
    type: 'expense', date: day, accountId: bank.id, categoryId: subs.id,
    amount: 1199, payee: 'YouTube Premium'
  })
  for (const friend of ['Ana', 'Bruno', 'Carla']) {
    transactions.saveTransaction({
      type: 'refund', date: day, accountId: bank.id, categoryId: subs.id,
      amount: 300, payee: friend, refundForId: premium.id
    })
  }

  const bankAfterSubs = accounts.listAccountsWithBalance().find((a) => a.id === bank.id)!.balance
  equal('el reembolso entra en la cuenta como el ingreso', bankAfterSubs, bankBeforeSubs - 1199 + 900)

  const subsTotal = reports
    .categoryTotals(monthStart, day, 'expense')
    .find((row) => row.categoryId === subs.id)!
  equal('la categoría solo carga el gasto neto', subsTotal.total, 299)
  equal('los reembolsos no inflan el número de movimientos', subsTotal.count, 1)

  equal('el gasto total sube solo lo que cuesta de verdad', reports.totalFor('expense', monthStart, day), expenseBeforeSubs + 299)
  equal('el reembolso no cuenta como ingreso', reports.totalFor('income', monthStart, day), incomeBeforeSubs)

  const monthly = reports.monthlySeries(1)[0]
  check('la serie mensual también va neta', monthly.expense === reports.totalFor('expense', startOfMonth(day), endOfMonth(day)))

  const parent = transactions.getTransaction(premium.id)!
  equal('el gasto sabe cuánto le han devuelto', parent.refundedTotal, 900)
  equal('lista sus tres reembolsos', transactions.listRefundsFor(premium.id).length, 3)

  // Candidatos a los que enganchar un reembolso suelto: los gastos de ese mismo
  // día, sean de la categoría que sean, mientras quede algo por devolver.
  const candidates = transactions.refundCandidates(day)
  check('ofrece los gastos del día', candidates.some((item) => item.id === premium.id))
  check('y solo los de ese día', candidates.every((item) => item.date === day))
  const otroDia = transactions.refundCandidates(addDays(day, -3))
  check('otro día no ofrece el gasto de hoy', otroDia.every((item) => item.id !== premium.id))
  check(
    'salvo el que ya está enlazado, que no puede desaparecer del desplegable',
    transactions.refundCandidates(addDays(day, -3), undefined, premium.id).some((item) => item.id === premium.id)
  )
  // La categoría del reembolso la manda el gasto, no lo que llegue del formulario.
  const heredado = transactions.saveTransaction({
    type: 'refund', date: day, accountId: bank.id, categoryId: food.id,
    amount: 100, refundForId: premium.id
  })
  equal('el reembolso hereda la categoría del gasto', heredado.categoryId, subs.id)
  transactions.deleteTransaction(heredado.id)
  // Una devolución más lo deja saldado: 3 × 3 € + 2,99 € = 11,99 €.
  transactions.saveTransaction({
    type: 'refund', date: day, accountId: bank.id, categoryId: subs.id,
    amount: 299, refundForId: premium.id
  })
  check(
    'un gasto ya devuelto del todo deja de ofrecerse',
    transactions.refundCandidates(day).every((item) => item.id !== premium.id)
  )
  transactions.deleteTransactions(
    transactions.listRefundsFor(premium.id).filter((item) => item.amount === 299).map((item) => item.id)
  )

  let refundRejected = false
  try {
    transactions.saveTransaction({ type: 'refund', date: day, accountId: bank.id, amount: 500 })
  } catch {
    refundRejected = true
  }
  check('un reembolso sin gasto ni categoría se rechaza', refundRejected)

  // Si se borra el gasto, las devoluciones siguen existiendo y siguen restando
  // de su categoría: el dinero volvió de verdad a la cuenta.
  transactions.deleteTransaction(premium.id)
  const orphanRefunds = transactions
    .listTransactions({ types: ['refund'], from: day, to: day })
    .filter((row) => row.categoryId === subs.id)
  equal('las devoluciones sobreviven al borrado del gasto', orphanRefunds.length, 3)
  equal('y se quedan sin gasto al que apuntar', orphanRefunds[0].refundForId, null)
  equal(
    'la categoría queda en negativo porque ya solo hay devoluciones',
    reports.categoryTotals(monthStart, day, 'expense').find((row) => row.categoryId === subs.id)!.total,
    -900
  )

  // Se deshace para no arrastrar el descuadre al resto de comprobaciones.
  transactions.deleteTransactions(orphanRefunds.map((row) => row.id))

  section('Programadas')
  const recurring = scheduled.saveScheduled({
    type: 'expense',
    name: 'Alquiler',
    accountId: bank.id,
    categoryId: food.id,
    amount: 70000,
    freq: 'monthly',
    interval: 1,
    nextDate: addMonths(day, -2),
    autoPost: true
  })
  const created = scheduled.postDue(day)
  check('genera las repeticiones vencidas', created >= 2, `generó ${created}`)
  const refreshed = scheduled.getScheduled(recurring.id)!
  check('deja la próxima fecha en el futuro', refreshed.nextDate > day, refreshed.nextDate)
  // El repaso se repite cada media hora mientras la aplicación esté viva, así
  // que no puede duplicar nada al volver a pasar el mismo día.
  equal('repetir el repaso el mismo día no genera nada', scheduled.postDue(day), 0)

  // «Registrar ahora» adelanta el pago, no adelanta el calendario: el dinero
  // sale hoy, pero la cuota que se da por cumplida es la del día que tocaba y la
  // siguiente sigue cayendo donde siempre. Fechándolo en su día, el movimiento
  // se quedaba en el futuro de la lista con el saldo ya descontado.
  const adelantada = scheduled.saveScheduled({
    type: 'expense',
    accountId: bank.id,
    categoryId: food.id,
    amount: 3399,
    freq: 'monthly',
    interval: 1,
    nextDate: addMonths(day, 1),
    autoPost: true
  })
  scheduled.postNow(adelantada.id)
  const adelantado = transactions
    .listTransactions({ limit: 200 })
    .find((row) => row.scheduledId === adelantada.id)!
  equal('registrar ahora fecha el movimiento hoy', adelantado.date, day)
  equal(
    'y consume la repetición que tocaba, sin mover el día del mes',
    scheduled.getScheduled(adelantada.id)!.nextDate,
    addMonths(day, 2)
  )
  transactions.deleteTransactions([adelantado.id])
  scheduled.deleteScheduled(adelantada.id)

  // Finalizar no es pausar: la cuota se cierra con fecha y no vuelve sola.
  scheduled.finishScheduled(recurring.id, day)
  const finalizada = scheduled.getScheduled(recurring.id)!
  check('finalizar apaga la programación', finalizada.active === false)
  equal('y le pone fecha de fin', finalizada.endDate, day)
  equal(
    'una finalizada ya no se proyecta',
    scheduled.projectUpcoming(day, addMonths(day, 6)).filter((p) => p.scheduledId === recurring.id).length,
    0
  )
  equal('ni genera movimientos nuevos', scheduled.postDue(addMonths(day, 3)), 0)
  check('registra la última ejecución', refreshed.lastPosted != null)

  section('Planes que se agotan')
  // Dos cuotas y se acabó: la fecha de fin cae justo en la segunda.
  const deuda = categories.listCategories().find((category) => category.name === 'Deuda')
  const plazos = scheduled.saveScheduled({
    type: 'expense', name: null, note: 'Kindle', accountId: bank.id,
    categoryId: deuda ? deuda.id : food.id,
    amount: 1999, freq: 'monthly', interval: 1,
    nextDate: addMonths(day, -1), endDate: day, autoPost: true
  })
  scheduled.postDue(day)
  const saldada = scheduled.getScheduled(plazos.id)!
  check('registra las cuotas del plan', saldada.lastPosted != null)
  check('al agotarse el plan se apaga sola', saldada.active === false)
  check('y queda sellada como terminada', saldada.settledAt != null, String(saldada.settledAt))

  const resumen = scheduled.debtSummary(plazos.id)
  equal('el resumen cuenta las cuotas pagadas', resumen.count, 2)
  equal('y suma lo que ha costado', resumen.total, 3998)
  equal('sabe desde cuándo se pagaba', resumen.firstDate, addMonths(day, -1))

  // Pausar no es terminar: apaga, pero no sella.
  const pausable = scheduled.saveScheduled({
    type: 'expense', name: null, note: 'Gimnasio', accountId: bank.id, categoryId: food.id,
    amount: 3000, freq: 'monthly', interval: 1, nextDate: addMonths(day, 1), autoPost: true
  })
  scheduled.setScheduledActive(pausable.id, false)
  const pausada = scheduled.getScheduled(pausable.id)!
  check('pausar apaga la programación', pausada.active === false)
  equal('pero no la da por terminada', pausada.settledAt, null)

  // Reanudar una cerrada le quita el sello: vuelve a estar viva.
  scheduled.setScheduledActive(plazos.id, true)
  equal('reanudar borra el sello', scheduled.getScheduled(plazos.id)!.settledAt, null)
  scheduled.setScheduledActive(plazos.id, false)
  scheduled.finishScheduled(plazos.id, day)
  check('finalizar a mano sí sella', scheduled.getScheduled(plazos.id)!.settledAt === day)

  for (const id of [plazos.id, pausable.id]) scheduled.deleteScheduled(id)

  section('Devoluciones programadas')
  // El alquiler entero se cobra cada mes y la parte del otro entra detrás:
  // dos programadas distintas que tienen que acabar enlazadas solas.
  const alquiler = scheduled.saveScheduled({
    type: 'expense', name: 'Alquiler entero', accountId: bank.id, categoryId: subs.id,
    amount: 75300, freq: 'monthly', interval: 1, nextDate: addDays(day, -1), autoPost: true
  })
  const suParte = scheduled.saveScheduled({
    type: 'refund', name: 'Su parte', accountId: bank.id, categoryId: subs.id,
    amount: 37700, freq: 'monthly', interval: 1, nextDate: addDays(day, -1), autoPost: true,
    refundForScheduledId: alquiler.id
  })
  equal('la devolución recuerda de qué programada cuelga', scheduled.getScheduled(suParte.id)!.refundForScheduledId, alquiler.id)

  scheduled.postDue(day)
  const registrados = transactions.listTransactions({ from: addDays(day, -1), to: addDays(day, -1) })
  const gastoPuesto = registrados.find((item) => item.scheduledId === alquiler.id)!
  const devolucionPuesta = registrados.find((item) => item.scheduledId === suParte.id)!
  check('el movimiento sabe qué programada lo creó', gastoPuesto != null && devolucionPuesta != null)
  equal('la devolución se engancha sola al gasto de ese mes', devolucionPuesta.refundForId, gastoPuesto.id)
  equal(
    'y el gasto ya sabe lo que le han devuelto',
    transactions.getTransaction(gastoPuesto.id)!.refundedTotal,
    37700
  )

  // Sin enlace, la devolución programada sigue entrando suelta.
  const suelta = scheduled.saveScheduled({
    type: 'refund', name: 'Devolución suelta', accountId: bank.id, categoryId: subs.id,
    amount: 500, freq: 'monthly', interval: 1, nextDate: addDays(day, -1), autoPost: true
  })
  scheduled.postDue(day)
  const sueltaPuesta = transactions
    .listTransactions({ from: addDays(day, -1), to: addDays(day, -1) })
    .find((item) => item.scheduledId === suelta.id)!
  equal('una devolución programada sin enlazar entra suelta', sueltaPuesta.refundForId, null)

  for (const id of [alquiler.id, suParte.id, suelta.id]) scheduled.deleteScheduled(id)
  transactions.deleteTransactions(
    transactions
      .listTransactions({ from: addDays(day, -1), to: addDays(day, -1) })
      .filter((item) => item.categoryId === subs.id)
      .map((item) => item.id)
  )

  section('Avisos del día antes')
  const manana = addDays(day, 1)
  const luz = scheduled.saveScheduled({
    type: 'expense', name: 'Luz', accountId: bank.id, categoryId: food.id,
    amount: 6500, freq: 'monthly', interval: 1, nextDate: manana, autoPost: true
  })
  const callada = scheduled.saveScheduled({
    type: 'expense', name: 'Gimnasio callado', accountId: bank.id, categoryId: food.id,
    amount: 3000, freq: 'monthly', interval: 1, nextDate: manana, autoPost: true, remind: false
  })
  const pasado = scheduled.saveScheduled({
    type: 'expense', name: 'Seguro', accountId: bank.id, categoryId: food.id,
    amount: 12000, freq: 'monthly', interval: 1, nextDate: addDays(day, 2), autoPost: true
  })
  const avisables = scheduled.pendingReminders(manana)
  check('avisa de lo que vence mañana', avisables.some((row) => row.id === luz.id))
  check('no avisa de la que está callada', !avisables.some((row) => row.id === callada.id))
  check('ni de la que vence pasado mañana', !avisables.some((row) => row.id === pasado.id))
  check('las programaciones avisan salvo que se diga lo contrario', scheduled.getScheduled(luz.id)!.remind === true)
  check('y la callada lo recuerda', scheduled.getScheduled(callada.id)!.remind === false)

  scheduled.markReminded(luz.id, manana)
  check(
    'una vez avisada no vuelve a salir',
    !scheduled.pendingReminders(manana).some((row) => row.id === luz.id)
  )
  equal('la fecha avisada queda apuntada', scheduled.getScheduled(luz.id)!.remindedFor, manana)

  // Al mes siguiente vuelve a tocar: la marca es de una ocurrencia, no de la
  // programación entera.
  scheduled.saveScheduled({ ...luz, nextDate: addMonths(manana, 1) })
  check(
    'el mes siguiente vuelve a avisar',
    scheduled.pendingReminders(addMonths(manana, 1)).some((row) => row.id === luz.id)
  )

  scheduled.setScheduledActive(luz.id, false)
  check(
    'una pausada no avisa',
    !scheduled.pendingReminders(addMonths(manana, 1)).some((row) => row.id === luz.id)
  )
  for (const id of [luz.id, callada.id, pasado.id]) scheduled.deleteScheduled(id)

  section('Programadas proyectadas en la lista')
  const mensual = scheduled.saveScheduled({
    type: 'expense', name: 'Gimnasio', accountId: bank.id, categoryId: food.id,
    amount: 3990, freq: 'monthly', interval: 1, nextDate: addDays(day, 5), autoPost: false
  })
  const seisMeses = scheduled.projectUpcoming(day, addMonths(day, 6)).filter((p) => p.scheduledId === mensual.id)
  equal('proyecta una repetición por mes', seisMeses.length, 6)
  equal('la primera cae en su próxima fecha', seisMeses[seisMeses.length - 1].date, addDays(day, 5))
  check('solo la primera se puede registrar de un clic', seisMeses.filter((p) => p.isNext).length === 1)
  check('no escribe nada en la base', transactions.listTransactions({ from: addDays(day, 5), to: addDays(day, 5) }).length === 0)

  scheduled.saveScheduled({
    id: mensual.id, type: 'expense', name: 'Gimnasio', accountId: bank.id, categoryId: food.id,
    amount: 3990, freq: 'monthly', interval: 1, nextDate: addDays(day, 5),
    endDate: addMonths(day, 2), autoPost: false
  })
  equal(
    'respeta la fecha de fin',
    scheduled.projectUpcoming(day, addMonths(day, 6)).filter((p) => p.scheduledId === mensual.id).length,
    2
  )

  scheduled.setScheduledActive(mensual.id, false)
  equal(
    'una programada en pausa no se proyecta',
    scheduled.projectUpcoming(day, addMonths(day, 6)).filter((p) => p.scheduledId === mensual.id).length,
    0
  )
  scheduled.deleteScheduled(mensual.id)

  section('Exportación e importación CSV')
  const exportPath = join(dir, 'export.csv')
  const exported = csv.exportCsv(exportPath)
  const content = readFileSync(exportPath, 'utf8')
  check('exporta todos los movimientos', exported > 0, `exportó ${exported}`)
  check('escribe el BOM que Excel necesita', content.charCodeAt(0) === 0xfeff)
  check('separa por punto y coma', content.split('\n')[0].includes(';'))
  check('conserva las tildes', content.includes('Categoría'))

  const importPath = join(dir, 'import.csv')
  writeFileSync(
    importPath,
    ['Fecha;Tipo;Cuenta;Categoría;Importe;Beneficiario;Etiquetas',
     '18/08/2026;Gasto;Cartera;Alimentación;-12,30;Panadería;pan',
     '2026-08-17;Ingreso;Banco;Nómina;1500,00;Empresa;',
     'fecha-mala;Gasto;Cartera;Alimentación;10,00;;'].join('\r\n'),
    'utf8'
  )
  const result = csv.importCsv(importPath)
  equal('importa las filas válidas', result.imported, 2)
  equal('descarta las filas ilegibles', result.skipped, 1)
  check('explica por qué descarta', result.errors[0].includes('fecha'), result.errors[0])
  // La importación ya no rellena beneficiario ni etiquetas: la aplicación solo
  // maneja notas, y guardar campos que nadie enseña sería guardar datos ciegos.
  // La fila del archivo traía «Empresa» como beneficiario y «pan» como etiqueta.
  const importedRow = transactions.listTransactions({ minAmount: 150000, maxAmount: 150000 })[0]
  check(
    'no rellena campos que la aplicación ya no enseña',
    importedRow != null && !importedRow.payee && importedRow.tags.length === 0
  )
  check('reutiliza las cuentas existentes por nombre', result.createdAccounts.length === 0)

  section('Cuentas que no admiten números rojos')
  const hucha = accounts.saveAccount({
    name: 'Hucha', type: 'savings', currency: 'EUR', initialBalance: 10000,
    icon: 'piggy', color: '#AF52DE', excludeFromTotal: false
  })
  check('el ahorro nace con el candado puesto', hucha.allowNegative === false)
  check(
    'la tarjeta nace sin candado',
    accounts.saveAccount({
      name: 'Tarjeta', type: 'card', currency: 'EUR', initialBalance: 0,
      icon: 'card', color: '#FF9500', excludeFromTotal: false
    }).allowNegative === true
  )

  transactions.saveTransaction({ type: 'expense', date: day, accountId: hucha.id, amount: 4000 })
  equal('deja gastar lo que hay', accounts.listAccountsWithBalance().find((a) => a.id === hucha.id)!.balance, 6000)

  let overdraft = false
  try {
    transactions.saveTransaction({ type: 'expense', date: day, accountId: hucha.id, amount: 9000 })
  } catch (error) {
    overdraft = String((error as Error).message).includes('números rojos')
  }
  check('rechaza sacar más de lo que hay', overdraft)
  equal('y no deja rastro del intento', accounts.listAccountsWithBalance().find((a) => a.id === hucha.id)!.balance, 6000)

  // Un gasto con fecha antigua puede hundir el saldo a mitad del recorrido
  // aunque el saldo de hoy siga siendo positivo: por eso se mira el mínimo.
  let backdated = false
  try {
    transactions.saveTransaction({ type: 'income', date: day, accountId: hucha.id, amount: 50000 })
    transactions.saveTransaction({ type: 'expense', date: addMonths(day, -1), accountId: hucha.id, amount: 20000 })
  } catch {
    backdated = true
  }
  check('rechaza el gasto retroactivo que la hundiría en su día', backdated)

  let transferOut = false
  try {
    transactions.saveTransaction({
      type: 'transfer', date: day, accountId: hucha.id, toAccountId: bank.id, amount: 999999
    })
  } catch {
    transferOut = true
  }
  check('también vigila los traspasos que salen', transferOut)

  let lowering = false
  try {
    accounts.saveAccount({
      id: hucha.id, name: 'Hucha', type: 'savings', currency: 'EUR', initialBalance: 0,
      icon: 'piggy', color: '#AF52DE', excludeFromTotal: false
    })
  } catch {
    lowering = true
  }
  check('impide bajar el saldo de partida por debajo de lo posible', lowering)

  const permissive = accounts.saveAccount({
    id: hucha.id, name: 'Hucha', type: 'savings', currency: 'EUR', initialBalance: 10000,
    icon: 'piggy', color: '#AF52DE', excludeFromTotal: false, allowNegative: true
  })
  check('se puede levantar el candado a mano', permissive.allowNegative === true)
  transactions.saveTransaction({ type: 'expense', date: day, accountId: hucha.id, amount: 900000 })
  check(
    'y entonces sí admite el descubierto',
    accounts.listAccountsWithBalance().find((a) => a.id === hucha.id)!.balance < 0
  )

  accounts.deleteAccount(hucha.id)

  const span = reports.transactionsSpan()!
  check('el histórico sabe cuándo empieza y cuándo acaba', span != null)
  check(
    'y va de la primera fecha a la última',
    span.from <= span.to &&
      transactions.listTransactions({ limit: 500 }).every((row) => row.date >= span.from && row.date <= span.to)
  )

  section('Hitos alcanzados')
  // Llegar a la meta se celebra una sola vez. El repaso de fondo pasa cada media
  // hora, así que sin marca la enhorabuena se repetiría mientras el dinero
  // siguiera en la hucha, que es justo lo que se quiere que pase.
  // En una cuenta propia y vacía: el saldo de una hucha se reparte entre los
  // hitos que apuntan a ella, y aquí interesa medir uno solo.
  const alcancia = accounts.saveAccount({
    name: 'Alcancía',
    type: 'savings',
    currency: 'EUR',
    initialBalance: 0,
    icon: 'piggy',
    color: '#34C759',
    excludeFromTotal: false
  })
  const meta = goals.saveGoal({
    name: 'Un teclado',
    accountId: alcancia.id,
    targetAmount: 1000,
    icon: 'piggy',
    color: '#34C759'
  })
  const alcanzado = (): boolean => goals.pendingGoals().some((row) => row.id === meta.id)
  check('un hito sin saldo todavía no se celebra', !alcanzado())

  transactions.saveTransaction({
    type: 'income',
    date: day,
    accountId: alcancia.id,
    amount: 1000
  })
  check('el hito alcanzado se celebra', alcanzado())
  const celebrado = goals.pendingGoals().find((row) => row.id === meta.id)!
  equal('con su título', celebrado.title, 'Un teclado')
  equal('y lo juntado es la meta', celebrado.total, 1000)
  goals.markGoalReached(meta.id)
  check('y no se repite después', !alcanzado())

  // El que se da por conseguido a mano no necesita fuegos artificiales: ya se ha
  // celebrado en ese mismo gesto.
  const aMano = goals.saveGoal({
    name: 'Un ratón',
    accountId: alcancia.id,
    targetAmount: 500,
    icon: 'piggy',
    color: '#34C759'
  })
  goals.setGoalAchieved(aMano.id, true)
  check(
    'sellarlo a mano no dispara la enhorabuena',
    !goals.pendingGoals().some((row) => row.id === aMano.id)
  )
  goals.deleteGoal(aMano.id)
  goals.deleteGoal(meta.id)
  accounts.deleteAccount(alcancia.id)

  section('Cuenta principal')
  equal('al principio no hay cuenta principal', settings.getSettings().defaultAccountId, null)
  settings.updateSettings({ defaultAccountId: bank.id })
  equal('se guarda la cuenta elegida', settings.getSettings().defaultAccountId, bank.id)
  settings.updateSettings({ defaultAccountId: cash.id })
  equal('elegir otra sustituye a la anterior', settings.getSettings().defaultAccountId, cash.id)

  // Y sale la primera en todas partes, que el orden de las cuentas se decide en
  // un solo sitio: la pestaña Cuentas, los desplegables y los filtros beben de
  // esta lista. Es la que se mira a diario, así que verla la segunda cansa.
  equal(
    'la principal encabeza la lista',
    accounts.listAccounts()[0].id,
    cash.id
  )
  settings.updateSettings({ defaultAccountId: bank.id })
  equal(
    'y cambia de sitio al cambiar de principal',
    accounts.listAccounts()[0].id,
    bank.id
  )
  equal(
    'el saldo llega en el mismo orden',
    accounts.listAccountsWithBalance()[0].id,
    bank.id
  )
  settings.updateSettings({ defaultAccountId: cash.id })

  accounts.saveAccount({
    id: cash.id, name: cash.name, type: cash.type, currency: cash.currency,
    initialBalance: cash.initialBalance, icon: cash.icon, color: cash.color,
    excludeFromTotal: false, archived: true
  })
  equal('archivarla la deja de principal', settings.getSettings().defaultAccountId, null)

  // Se desarchiva para no alterar el resto de comprobaciones.
  accounts.saveAccount({
    id: cash.id, name: cash.name, type: cash.type, currency: cash.currency,
    initialBalance: cash.initialBalance, icon: cash.icon, color: cash.color,
    excludeFromTotal: false, archived: false
  })

  section('Borrado en cascada')
  const before = transactions.countTransactions({})
  const bankBefore = accounts.listAccountsWithBalance().find((account) => account.id === bank.id)!.balance
  const doomed = transactions.saveTransaction({ type: 'expense', date: day, accountId: dollars.id, amount: 500 })
  check('el movimiento se guarda', transactions.getTransaction(doomed.id) != null)

  settings.updateSettings({ defaultAccountId: dollars.id })
  accounts.deleteAccount(dollars.id)
  equal('borrarla la deja de principal', settings.getSettings().defaultAccountId, null)
  equal('borrar la cuenta se lleva sus propios movimientos', transactions.countTransactions({}), before)
  equal(
    'el saldo de la cuenta superviviente no cambia al borrar la otra',
    accounts.listAccountsWithBalance().find((account) => account.id === bank.id)!.balance,
    bankBefore
  )
  check(
    'el traspaso hacia la cuenta borrada se degrada a gasto',
    transactions.listTransactions({ accountIds: [bank.id] }).some(
      (row) => row.type === 'expense' && row.amount === 10000
    )
  )

  const orphan = categories.listCategories().find((category) => category.name === 'Alimentación')!
  const victim = transactions.listTransactions({ categoryIds: [orphan.id], limit: 1 })[0]
  check('había movimientos en esa categoría', victim != null)
  categories.deleteCategory(orphan.id)
  check(
    'borrar la categoría deja los movimientos sin categoría',
    transactions.getTransaction(victim.id)?.categoryId === null
  )

  // Y desde ahí se pueden encontrar: «Sin categoría» no sale en la lista de
  // categorías porque no es una, así que sin este filtro solo aparecían de uno en
  // uno al pasar la lista entera.
  const huerfanos = transactions.listTransactions({ uncategorized: true })
  check(
    'el filtro «sin categoría» los encuentra',
    huerfanos.length > 0 && huerfanos.every((row) => row.categoryId == null),
    `devolvió ${huerfanos.length}`
  )

  // El buscador también entiende cifras: buscar «9,17» saca lo que costó eso, que
  // muchas veces es lo único que se recuerda de un gasto.
  const conImporte = transactions.saveTransaction({
    type: 'expense',
    date: day,
    accountId: transactions.listTransactions({ limit: 1 })[0].accountId,
    amount: 917,
    note: 'Sin nada que buscar por texto'
  })
  const porImporte = transactions.listTransactions({ search: '9,17' })
  check(
    'busca por el importe escrito con coma',
    porImporte.some((row) => row.id === conImporte.id),
    `devolvió ${porImporte.length}`
  )
  check(
    'y con punto, que es el mismo importe',
    transactions.listTransactions({ search: '9.17' }).some((row) => row.id === conImporte.id)
  )
  check(
    'un importe que no existe no devuelve nada',
    transactions.listTransactions({ search: '9,18' }).every((row) => row.id !== conImporte.id)
  )
  // Y sigue buscando texto, que es lo que hacía antes.
  check(
    'el texto sigue encontrándose',
    transactions.listTransactions({ search: 'nada que buscar' }).some((row) => row.id === conImporte.id)
  )
  transactions.deleteTransactions([conImporte.id])
  check(
    'y no cuela los traspasos, que nunca la llevan',
    huerfanos.every((row) => row.type !== 'transfer')
  )
  // Pedir una categoría y además los huérfanos trae las dos cosas, no la
  // intersección, que sería siempre vacía.
  const conCategoria = transactions.listTransactions({ limit: 500 }).find((row) => row.categoryId != null)!
  const mezcla = transactions.listTransactions({
    categoryIds: [conCategoria.categoryId!],
    uncategorized: true
  })
  check(
    'junto a una categoría, suma en vez de restar',
    mezcla.length > huerfanos.length &&
      mezcla.some((row) => row.categoryId === conCategoria.categoryId) &&
      mezcla.some((row) => row.categoryId == null)
  )
} finally {
  closeDatabase()
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n${passed} comprobaciones correctas, ${failed} fallos`)
process.exit(failed === 0 ? 0 : 1)

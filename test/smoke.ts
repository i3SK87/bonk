/**
 * Prueba de humo de la capa de datos. Se ejecuta con Node 24 (que ya trae
 * node:sqlite) sobre una carpeta temporal, así que no toca los datos reales.
 *
 *   npm run test
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, closeDatabase, getDb } from '../src/main/db'
import * as accounts from '../src/main/repos/accounts'
import * as categories from '../src/main/repos/categories'
import * as transactions from '../src/main/repos/transactions'
import * as goals from '../src/main/repos/goals'
import * as scheduled from '../src/main/repos/scheduled'
import * as reports from '../src/main/repos/reports'
import * as settings from '../src/main/repos/settings'
import * as tags from '../src/main/repos/tags'
import * as csv from '../src/main/repos/csv'
import type { DebtProgress } from '../src/shared/types'
import { LENDERS, findLender } from '../src/shared/lenders'
import { parseAmount, formatMoney, convert, toMinor } from '../src/shared/money'
import { keepNumericChars } from '../src/shared/numbers'
import { evaluate } from '../src/shared/calc'
import { addMonths, addDays, nextOccurrence, startOfMonth, endOfMonth, today } from '../src/shared/dates'
import { rangoDe, comparacionDe, NOMBRES_DE_RANGO, type RangoId } from '../src/shared/rangos'

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
  /*
   * Los periodos de las pastillas, que estaban escritos dos veces.
   *
   * Movimientos e Informes tenían cada uno su propia versión y no decían lo
   * mismo: «Este año» llegaba a fin de mes en una pantalla y a fin de año en la
   * otra, y de ahí salió que la media diaria del mismo periodo diera 45,84 €
   * contra 59,21 €. Ahora sale de `rangoDe`, y estas comprobaciones son las que
   * impiden que vuelvan a separarse.
   *
   * Se les pasa el día a mano: probar periodos contra el reloj daría resultados
   * distintos según el mes en que se ejecuten.
   */
  section('Periodos de las pastillas')
  const enAgosto = '2026-08-24'
  equal('este mes empieza el 1', rangoDe('month', enAgosto)!.from, '2026-08-01')
  equal('y acaba el último día del mes', rangoDe('month', enAgosto)!.to, '2026-08-31')
  equal('el mes pasado va entero', rangoDe('prev', enAgosto)!.from, '2026-07-01')
  equal('de punta a punta', rangoDe('prev', enAgosto)!.to, '2026-07-31')
  equal('tres meses son este y los dos de antes', rangoDe('quarter', enAgosto)!.from, '2026-06-01')
  equal('hasta el fin del actual', rangoDe('quarter', enAgosto)!.to, '2026-08-31')

  // La que se separaba: hasta el fin del mes en curso, nunca del año.
  equal('este año empieza en enero', rangoDe('year', enAgosto)!.from, '2026-01-01')
  equal(
    'y acaba al final del mes en curso, no del año',
    rangoDe('year', enAgosto)!.to,
    '2026-08-31'
  )

  equal('el año pasado va entero', rangoDe('prevYear', enAgosto)!.from, '2025-01-01')
  equal('hasta diciembre', rangoDe('prevYear', enAgosto)!.to, '2025-12-31')

  // «Todo» y «Personalizado» no tienen fechas propias a propósito: cada pantalla
  // decide qué hacer con ellos, y devolver `null` obliga a decidirlo.
  equal('«Todo» no trae fechas', rangoDe('all', enAgosto), null)
  equal('«Personalizado» tampoco', rangoDe('custom', enAgosto), null)

  // En diciembre, «este año» sí llega a fin de año: es el mismo día del mes.
  equal('en diciembre, este año llega a fin de año', rangoDe('year', '2026-12-05')!.to, '2026-12-31')
  // Y en enero, el mes pasado es diciembre del año anterior.
  equal('en enero, el mes pasado es del año anterior', rangoDe('prev', '2026-01-10')!.from, '2025-12-01')
  equal('tres meses en enero cruzan el año', rangoDe('quarter', '2026-01-10')!.from, '2025-11-01')

  const PERIODOS: RangoId[] = ['month', 'prev', 'quarter', 'year', 'prevYear', 'all', 'custom']
  check('todos los periodos tienen nombre', PERIODOS.every((id) => NOMBRES_DE_RANGO[id].length > 0))

  /*
   * Con qué se compara cada periodo.
   *
   * Lo que se prueba de verdad aquí es el recorte: un mes en curso no se compara
   * contra el mes pasado entero. A 24 de agosto, comparar veinticuatro días
   * contra treinta y uno diría que gastas menos, y lo diría todos los meses
   * hasta el día 28.
   */
  /*
   * Con qué se compara cada periodo: con el anterior, entero.
   *
   * Valor contra valor y no fecha contra fecha. Hubo una versión que recortaba
   * el mes anterior al día de hoy, para que un mes a medias no pareciera siempre
   * más barato; cuadraba en aritmética y no cuadraba al leerla, porque el mismo
   * importe en dos meses salía con una flecha del setenta y cinco por ciento.
   */
  section('Con qué se compara un periodo')
  const compMes = comparacionDe('month', rangoDe('month', enAgosto)!)!
  equal('el mes en curso se compara con el mes pasado', compMes.from, '2026-07-01')
  equal('entero, aunque agosto vaya por el día 24', compMes.to, '2026-07-31')

  // El día del mes en que se mire da igual: la base es siempre el mes entero.
  const aPrimeros = comparacionDe('month', rangoDe('month', '2026-08-02')!)!
  equal('a primeros de mes, la misma base', aPrimeros.from, '2026-07-01')
  equal('y el mismo final', aPrimeros.to, '2026-07-31')

  const compAnterior = comparacionDe('prev', rangoDe('prev', enAgosto)!)!
  equal('el mes pasado se compara con el de antes', compAnterior.from, '2026-06-01')
  equal('también entero, aunque junio tenga un día menos', compAnterior.to, '2026-06-30')

  const compTrim = comparacionDe('quarter', rangoDe('quarter', enAgosto)!)!
  equal('tres meses se comparan con los tres de antes', compTrim.from, '2026-03-01')
  equal('hasta el final del tercero', compTrim.to, '2026-05-31')

  /*
   * «Este año» es el caso que no sale de restar días.
   *
   * De enero a agosto son ocho meses; restando ocho meses saldría de mayo a
   * diciembre del año pasado, que no significa nada. Lo que se quiere son esos
   * mismos meses del año anterior.
   */
  const compAnio = comparacionDe('year', rangoDe('year', enAgosto)!)!
  equal('este año se compara con el año pasado', compAnio.from, '2025-01-01')
  equal('por los mismos meses', compAnio.to, '2025-08-31')

  // A mano: la misma cantidad de días, pegada justo por detrás.
  const compMano = comparacionDe('custom', { from: '2026-08-10', to: '2026-08-19' })!
  equal('un rango a mano se compara con los días de justo antes', compMano.from, '2026-07-31')
  equal('y acaba la víspera del suyo', compMano.to, '2026-08-09')

  equal('«Todo» no tiene con qué compararse', comparacionDe('all', { from: '2026-01-01', to: enAgosto }), null)

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

  /*
   * Los totales del periodo se cuentan en la base de datos, no sumando la lista.
   *
   * La lista viene con tope para no traerse años enteros de golpe, y las cifras
   * de arriba se sacaban de ella: con más movimientos que el tope contaban solo
   * un trozo y lo llamaban «del periodo». En una base de casi cuatrocientos
   * apuntes al año, el balance salía en rojo estando en verde.
   */
  section('Los totales del periodo cuentan todo, no lo que quepa')
  const antes = transactions.totalsForFilter({})
  // Veinte gastos de diez euros, y una lista que solo deja ver cinco.
  for (let i = 0; i < 20; i++) {
    transactions.saveTransaction({
      type: 'expense',
      date: day,
      accountId: bank.id,
      categoryId: food.id,
      amount: 1000,
      note: `Tope ${i}`
    })
  }
  const conTope = transactions.listTransactions({ limit: 5 })
  const sumados = transactions.totalsForFilter({ limit: 5 })
  equal('la lista respeta el tope', conTope.length, 5)
  equal(
    'pero los totales cuentan los veinte',
    sumados.expense - antes.expense,
    20000
  )
  equal('y el recuento también', sumados.count - antes.count, 20)
  check(
    'sumar la lista con tope daría bastante menos',
    conTope.reduce((s, r) => s + Math.abs(r.amountInBase), 0) < sumados.expense - antes.expense
  )
  // El filtro se aplica igual que en la lista, tope aparte.
  const soloTope = transactions.totalsForFilter({ search: 'Tope' })
  equal('el filtro se respeta en los totales', soloTope.expense, 20000)
  equal('con sus fechas extremas', soloTope.firstDate, day)
  equal('y la última igual', soloTope.lastDate, day)
  // Un rango sin nada no puede reventar ni inventarse fechas.
  const vacio = transactions.totalsForFilter({ from: '1999-01-01', to: '1999-12-31' })
  equal('un periodo vacío suma cero', vacio.expense + vacio.income, 0)
  equal('y no trae fechas', vacio.firstDate, null)
  for (const fila of transactions.listTransactions({ search: 'Tope', limit: 100 })) {
    transactions.deleteTransaction(fila.id)
  }

  /*
   * El nombre lo exige quien guarda, no solo quien teclea.
   *
   * Los formularios ya lo pedían, así que por la interfaz no se colaba; pero una
   * fila sin nombre es de las que la lista no sabe enseñar, y de esas ya hemos
   * tenido una que se llevó por delante la pantalla entera.
   */
  section('Nada sin nombre')
  for (const [titulo, intento] of [
    ['una cuenta en blanco', () => accounts.saveAccount({ name: '   ', type: 'cash', currency: 'EUR', initialBalance: 0, icon: 'wallet', color: '#0A84FF', excludeFromTotal: false })],
    ['una categoría en blanco', () => categories.saveCategory({ name: '', kind: 'expense', icon: 'tag', color: '#8E8E93' })]
  ] as Array<[string, () => unknown]>) {
    let rechazado = false
    try {
      intento()
    } catch {
      rechazado = true
    }
    check(`se rechaza ${titulo}`, rechazado)
  }
  const conEspacios = accounts.saveAccount({
    name: '  Con espacios  ', type: 'cash', currency: 'EUR', initialBalance: 0,
    icon: 'wallet', color: '#0A84FF', excludeFromTotal: false
  })
  equal('y el nombre se guarda recortado', conEspacios.name, 'Con espacios')
  accounts.deleteAccount(conEspacios.id)

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
  const debt = categories.saveCategory({
    name: 'Deuda', kind: 'expense', icon: 'debt', color: '#FF3B30'
  })
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

  section('Planes de ahorro')
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

  // Un plan recién creado no tiene nada: el dinero de la hucha es ahorro libre
  // hasta que se reparte a mano. Antes lo suelto se repartía solo por orden de
  // fecha, que era el dinero cambiando de sitio sin que nadie lo moviera.
  equal('un plan nuevo no se lleva nada solo', hitos.find((i) => i.id === viaje.id)!.saved, 0)
  equal('ni el de fecha más cercana', hitos.find((i) => i.id === pc.id)!.saved, 0)

  goals.setGoalReserves([{ id: viaje.id, amount: 30000 }])
  const repartidos = goals.goalProgress(day)
  const viajeP = repartidos.find((item) => item.id === viaje.id)!
  const pcP = repartidos.find((item) => item.id === pc.id)!
  equal('lo reservado es lo que tiene', viajeP.saved, 30000)
  equal('y el otro sigue a cero', pcP.saved, 0)
  equal('lo repartido nunca pasa del saldo', viajeP.saved + pcP.saved, 30000)
  equal('calcula lo que falta', viajeP.missing, 20000)
  check('el porcentaje va sobre su objetivo', Math.round(viajeP.percent) === 60)
  check('dice cuánto apartar al mes', viajeP.perMonth != null && viajeP.perMonth > 0)

  // Al darlo por cumplido cuenta por su meta entera y suelta la hucha.
  goals.setGoalAchieved(viaje.id, true, day)
  goals.setGoalReserves([{ id: pc.id, amount: 30000 }])
  const trasCumplir = goals.goalProgress(day)
  equal('un plan cumplido conserva su objetivo', trasCumplir.find((i) => i.id === viaje.id)!.saved, 50000)
  equal('y libera el saldo para el siguiente', trasCumplir.find((i) => i.id === pc.id)!.saved, 30000)
  equal('los cumplidos se van al final', trasCumplir[trasCumplir.length - 1].id, viaje.id)
  goals.setGoalReserves([{ id: pc.id, amount: 0 }])

  goals.setGoalAchieved(viaje.id, false, day)
  let goalRejected = false
  try {
    goals.saveGoal({ name: 'Sin cantidad', accountId: bote.id, targetAmount: 0 })
  } catch {
    goalRejected = true
  }
  check('rechaza un plan sin cantidad', goalRejected)

  goals.deleteGoal(pc.id)
  goals.deleteGoal(viaje.id)
  equal('borrar un plan no deja rastro', goals.listGoals().length, 0)

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
  const created = scheduled.postDue(day).created
  check('genera las repeticiones vencidas', created >= 2, `generó ${created}`)
  const refreshed = scheduled.getScheduled(recurring.id)!
  check('deja la próxima fecha en el futuro', refreshed.nextDate > day, refreshed.nextDate)
  // El repaso se repite cada media hora mientras la aplicación esté viva, así
  // que no puede duplicar nada al volver a pasar el mismo día.
  equal('repetir el repaso el mismo día no genera nada', scheduled.postDue(day).created, 0)

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
  equal('ni genera movimientos nuevos', scheduled.postDue(addMonths(day, 3)).created, 0)
  check('registra la última ejecución', refreshed.lastPosted != null)

  /*
   * Revivir una finalizada, que es lo que promete su lista.
   *
   * Aquí había dos fallos encadenados: guardar sin fecha de fin no le quitaba el
   * sello —se quedaba en Finalizadas sin generar nada, justo lo contrario de lo
   * que decía el aviso— y la lista enseñaba esa fecha que ya no estaba, con lo
   * que la pantalla entera se caía.
   */
  const base = {
    id: recurring.id,
    type: finalizada.type,
    name: finalizada.name,
    accountId: finalizada.accountId,
    categoryId: finalizada.categoryId,
    amount: finalizada.amount,
    freq: finalizada.freq,
    interval: finalizada.interval,
    nextDate: addMonths(day, 1),
    autoPost: true,
    active: false
  }
  // Editarla sin tocarle el fin la deja como estaba: el plan sigue agotado.
  scheduled.saveScheduled({ ...base, nextDate: addMonths(day, 1), endDate: day })
  equal('editar una terminada sin tocar el fin la deja terminada', scheduled.getScheduled(recurring.id)!.settledAt, day)

  const revivida = scheduled.saveScheduled({ ...base, endDate: null })
  equal('quitarle la fecha de fin le quita el sello', revivida.settledAt, null)
  check('y la vuelve a encender', revivida.active === true)
  equal('sin fecha de fin que enseñar', revivida.endDate, null)
  check(
    'y vuelve a la lista de vigentes',
    scheduled.listScheduled().filter((row) => row.id === recurring.id && row.settledAt == null).length === 1
  )
  check(
    'una vigente sí se proyecta otra vez',
    scheduled.projectUpcoming(day, addMonths(day, 6)).filter((p) => p.scheduledId === recurring.id).length > 0
  )
  scheduled.finishScheduled(recurring.id, day)

  /*
   * Y el botón de Reanudar, que es el mismo camino sin pasar por la ficha.
   *
   * La comprobación que importa es la última: una finalizada tiene la fecha de
   * fin en el pasado, así que encenderla sin quitársela la dejaba viva hasta el
   * primer repaso, que volvía a sellarla por agotada. Un botón que se deshace
   * solo a los cinco minutos no es un botón.
   */
  /*
   * Reanudar con fecha nueva.
   *
   * Sin ella, una deuda se queda sin plan que medir: pasa de «3 de 4 cuotas» a
   * «3 pagadas, sin total conocido». Se puede seguir dejando vacía —una
   * suscripción no tiene final—, pero ahora se pregunta.
   */
  const conFinal = addMonths(day, 6)
  scheduled.resumeScheduled(recurring.id, conFinal)
  equal('reanudar acepta una fecha de fin nueva', scheduled.getScheduled(recurring.id)!.endDate, conFinal)
  equal('y le quita el sello igual', scheduled.getScheduled(recurring.id)!.settledAt, null)
  check(
    'con final, vuelve a proyectarse hasta ahí',
    scheduled.projectUpcoming(day, addMonths(day, 12)).filter((p) => p.scheduledId === recurring.id).length > 0
  )

  // Una fecha anterior a la próxima cuota dejaría el plan agotado al nacer: el
  // primer repaso lo volvería a sellar y el botón parecería no hacer nada.
  scheduled.finishScheduled(recurring.id, day)
  let rechazo = ''
  try {
    scheduled.resumeScheduled(recurring.id, addMonths(day, -6))
  } catch (error) {
    rechazo = (error as Error).message
  }
  check('rechaza una fecha anterior a la próxima cuota', rechazo.includes('anterior a la próxima cuota'), rechazo)
  check('y no la reanuda a medias', scheduled.getScheduled(recurring.id)!.settledAt === day)

  scheduled.resumeScheduled(recurring.id)
  const reanudada = scheduled.getScheduled(recurring.id)!
  check('reanudar la enciende', reanudada.active === true)
  equal('le quita el sello', reanudada.settledAt, null)
  equal('y la fecha de fin, que la tenía pasada', reanudada.endDate, null)
  scheduled.postDue(addMonths(day, 1))
  equal(
    'sigue viva tras el repaso, sin volver a sellarse sola',
    scheduled.getScheduled(recurring.id)!.settledAt,
    null
  )
  scheduled.finishScheduled(recurring.id, day)

  /*
   * Corregir la categoría de un recibo la corrige en su programación.
   *
   * Duraba hasta el mes siguiente: el recibo volvía a entrar con la equivocada
   * porque la que manda es la de la ficha de Programados, y eso no lo dice
   * ninguna pantalla.
   */
  section('La categoría corregida viaja a la programación')
  const otra = categories.saveCategory({
    name: 'Categoría corregida', kind: 'expense', icon: 'tag', color: '#FF9F0A'
  })
  const conRecibo = scheduled.saveScheduled({
    type: 'expense', accountId: bank.id, categoryId: food.id, note: 'Recibo mal clasificado',
    amount: 1900, freq: 'monthly', interval: 1, nextDate: day, autoPost: true
  })
  scheduled.postDue(day)
  const recibo = transactions
    .listTransactions({ search: 'Recibo mal clasificado', limit: 5 })
    .find((row) => row.scheduledId === conRecibo.id)!
  equal('el recibo nace con la categoría de su programación', recibo.categoryId, food.id)

  transactions.saveTransaction({
    id: recibo.id,
    type: recibo.type,
    date: recibo.date,
    accountId: recibo.accountId,
    categoryId: otra.id,
    amount: recibo.amount,
    note: recibo.note
  })
  equal('corregirla en el movimiento la corrige', transactions.getTransaction(recibo.id)!.categoryId, otra.id)
  equal(
    'y también en la programación, para el mes que viene',
    scheduled.getScheduled(conRecibo.id)!.categoryId,
    otra.id
  )

  // Cambiar cualquier otra cosa no toca la programación: el importe de un mes
  // concreto es suyo y no dice nada de los que vienen.
  transactions.saveTransaction({
    id: recibo.id,
    type: recibo.type,
    date: recibo.date,
    accountId: recibo.accountId,
    categoryId: otra.id,
    amount: 2500,
    note: 'Recibo mal clasificado'
  })
  equal('cambiar el importe no toca la cuota de la programación', scheduled.getScheduled(conRecibo.id)!.amount, 1900)

  // Y un movimiento sinPrograma no tiene programación que corregir.
  const sinPrograma = transactions.saveTransaction({
    type: 'expense', date: day, accountId: bank.id, categoryId: food.id, amount: 300, note: 'Suelto'
  })
  transactions.saveTransaction({ ...sinPrograma, categoryId: otra.id })
  equal('un movimiento sin programación no arrastra nada', transactions.getTransaction(sinPrograma.id)!.categoryId, otra.id)

  transactions.deleteTransaction(recibo.id)
  transactions.deleteTransaction(sinPrograma.id)
  scheduled.deleteScheduled(conRecibo.id)
  categories.deleteCategory(otra.id)

  section('Una deuda desde su primer gasto')
  // Lo que hace el formulario de un movimiento cuando se marca «se repite»:
  // guarda el gasto y monta la programación con los mismos datos, con la
  // próxima una vuelta más allá. Sin esa programación, la deuda no existe para
  // la pestaña de Deudas por mucho que el gasto esté apuntado.
  const categoriaDeuda = categories.listCategories().find((item) => item.name === 'Deuda')!
  const primerPago = transactions.saveTransaction({
    type: 'expense',
    date: day,
    accountId: bank.id,
    categoryId: categoriaDeuda.id,
    amount: 5000,
    note: 'Sofá cama'
  })
  equal('el primer pago se apunta', transactions.getTransaction(primerPago.id)!.amount, 5000)
  check(
    'pero por sí solo no es una deuda',
    !scheduled.debtProgress(day).some((row) => row.title === 'Sofá cama')
  )

  const suRepeticion = scheduled.saveScheduled({
    type: 'expense',
    accountId: bank.id,
    categoryId: categoriaDeuda.id,
    amount: 5000,
    note: 'Sofá cama',
    freq: 'monthly',
    interval: 1,
    nextDate: nextOccurrence(day, 'monthly', 1),
    endDate: addMonths(day, 5),
    autoPost: true,
    isDebt: true
  })
  const laDeuda = scheduled.debtProgress(day).find((row) => row.title === 'Sofá cama')!
  check('con su repetición, ya sale en Deudas', laDeuda != null)
  equal('y cuenta el pago de hoy', laDeuda.paidCount, 1)
  equal('con las cinco que quedan', laDeuda.leftCount, 5)
  equal(
    'la próxima no es hoy, que hoy ya se ha pagado',
    scheduled.getScheduled(suRepeticion.id)!.nextDate,
    nextOccurrence(day, 'monthly', 1)
  )
  scheduled.deleteScheduled(suRepeticion.id)
  transactions.deleteTransactions([primerPago.id])

  section('Planes que se agotan')
  // Dos cuotas y se acabó: la fecha de fin cae justo en la segunda.
  const deuda = categories.listCategories().find((category) => category.name === 'Deuda')
  const plazos = scheduled.saveScheduled({
    type: 'expense', name: null, note: 'Kindle', accountId: bank.id,
    categoryId: deuda ? deuda.id : food.id,
    amount: 1999, freq: 'monthly', interval: 1,
    nextDate: addMonths(day, -1), endDate: day, autoPost: true, isDebt: true
  })
  // Es del plan y no de su categoría: así el portátil puede ir en Tecnología.
  check('la deuda sale por su propia marca, no por la categoría', plazos.isDebt)
  check(
    'y su categoría no sabe nada de deudas',
    scheduled.debtProgress(day).some((row) => row.scheduledId === plazos.id)
  )
  scheduled.postDue(day)
  const saldada = scheduled.getScheduled(plazos.id)!
  check('registra las cuotas del plan', saldada.lastPosted != null)
  check('al agotarse el plan se apaga sola', saldada.active === false)
  check('y queda sellada como terminada', saldada.settledAt != null, String(saldada.settledAt))

  const resumen = scheduled.debtSummary(plazos.id)
  // Tres y no dos: además de las dos cuotas que ha generado el plan, cuenta el
  // pago de «Kindle» de más arriba, anterior a la programación. Es lo que se
  // busca: una deuda casi siempre viene de antes de apuntarla aquí, y esos pagos
  // son tan suyos como los que genera la aplicación.
  equal('el resumen cuenta también lo pagado antes de programarla', resumen.count, 3)
  equal('y suma lo que ha costado', resumen.total, 6998)
  // La devolución de «Kindle» no cuenta: devolver no es pagar.
  check(
    'una devolución de la misma nota no cuenta como pago',
    resumen.total === 6998,
    `sumó ${resumen.total}`
  )
  equal('sabe desde cuándo se pagaba', resumen.firstDate, addMonths(day, -1))

  // La pantalla de Deudas: lo que se ve de una deuda a plazos.
  const verDeuda = (): DebtProgress =>
    scheduled.debtProgress(day).find((row) => row.scheduledId === plazos.id)!
  const cerrada = verDeuda()
  equal('la deuda saldada no espera más cuotas', cerrada.leftCount, 0)
  equal('y su coste mensual pasa a cero', cerrada.monthlyCost, 0)

  // Lo que la aplicación no vio: cuotas pagadas antes del primer apunte, que se
  // dicen contándolas, no en euros.
  scheduled.adjustDebt(plazos.id, { paidCount: cerrada.paidCount + 2 })
  const conHistoria = verDeuda()
  equal('las cuotas de antes cuentan como pagadas', conHistoria.paidCount, cerrada.paidCount + 2)
  equal(
    'y suman su dinero, a cuota entera',
    conHistoria.paid,
    cerrada.paid + 2 * conHistoria.installment
  )
  scheduled.adjustDebt(plazos.id, { paidCount: 0 })
  equal('a cero, vuelven a contarse las que se ven', verDeuda().paidCount, cerrada.paidCount)

  // El total lo manda quien lo sabe: hay deudas con intereses o con entrada.
  scheduled.adjustDebt(plazos.id, { paidCount: 5, total: 30000 })
  const conTotal = verDeuda()
  equal('el total puesto a mano manda', conTotal.total, 30000)
  equal('y lo que falta sale de él', conTotal.left, 30000 - conTotal.paid)
  check(
    'el porcentaje va sobre ese total',
    Math.round(conTotal.percent!) === Math.round((conTotal.paid / 30000) * 100)
  )

  // Pagar de más no deja un pendiente negativo.
  scheduled.adjustDebt(plazos.id, { paidCount: 40, total: 30000 })
  equal('pagar de más no deja pendiente negativo', verDeuda().left, 0)
  scheduled.adjustDebt(plazos.id, {})

  // La última cuota, que casi nunca es entera: es lo que hace cuadrar el total
  // sin tener que escribirlo.
  const corta = scheduled.saveScheduled({
    type: 'expense',
    name: null,
    note: 'Sofá',
    accountId: bank.id,
    categoryId: deuda ? deuda.id : food.id,
    amount: 10000,
    freq: 'monthly',
    interval: 1,
    isDebt: true,
    nextDate: day,
    endDate: addMonths(day, 2),
    autoPost: false
  })
  const verCorta = (): DebtProgress =>
    scheduled.debtProgress(day).find((row) => row.scheduledId === corta.id)!
  equal('quedan las tres cuotas', verCorta().leftCount, 3)
  equal('y suman tres enteras', verCorta().left, 30000)
  scheduled.adjustDebt(corta.id, { lastAmount: 5000 })
  equal('con la última corta, lo que falta es menos', verCorta().left, 25000)
  equal('y el total cuadra sin escribirlo', verCorta().total, 25000)
  equal('la última cuota se recuerda', verCorta().lastInstallment, 5000)
  scheduled.adjustDebt(corta.id, { lastAmount: 0 })
  equal('a cero, vuelve a ser una cuota como las demás', verCorta().left, 30000)
  check('y deja de haber última corta', verCorta().lastInstallment === null)
  // Desde cuándo se paga: lo que se deduce es la fecha del apunte más antiguo, y
  // eso no llega a las cuotas que nadie apuntó.
  equal('sin decir nada, la fecha sale de los movimientos', verCorta().firstDate, null)
  scheduled.adjustDebt(corta.id, { startDate: '2024-03-15' })
  equal('la fecha puesta a mano manda', verCorta().firstDate, '2024-03-15')
  equal('y se recuerda como puesta a mano', verCorta().fixedStart, '2024-03-15')
  scheduled.adjustDebt(corta.id, { startDate: '' })
  check('vacía, vuelve a deducirse', verCorta().fixedStart === null)

  // Quién cobra: viaja con la programación y se ve en la deuda.
  scheduled.saveScheduled({
    id: corta.id,
    type: 'expense',
    accountId: bank.id,
    categoryId: deuda ? deuda.id : food.id,
    amount: 10000,
    freq: 'monthly',
    interval: 1,
    isDebt: true,
    nextDate: day,
    endDate: addMonths(day, 2),
    autoPost: false,
    lender: 'sequra'
  })
  equal('quién cobra la deuda se guarda', verCorta().lender, 'sequra')
  equal('y se sabe de quién se habla', findLender(verCorta().lender)!.name, 'SeQura')
  check(
    'los logotipos van dentro del programa, sin pedir nada a Internet',
    LENDERS.every((item) => item.logo.startsWith('data:'))
  )

  // Las cuotas puestas a mano se suman a las que se ven, no las tapan: dicho
  // «llevo dos», la que entra hoy tiene que hacer tres. Guardando el total en vez
  // de la resta, la deuda se quedaba clavada donde la dejaste.
  scheduled.adjustDebt(corta.id, { paidCount: 2 })
  equal('las cuotas de antes se cuentan', verCorta().paidCount, 2)
  scheduled.postNow(corta.id)
  equal('y la cuota que entra hoy suma una más', verCorta().paidCount, 3)
  equal('con su dinero detrás', verCorta().paid, 30000)
  const generada = transactions.listTransactions({ limit: 500 }).filter((t) => t.scheduledId === corta.id)
  transactions.deleteTransactions(generada.map((t) => t.id))
  scheduled.adjustDebt(corta.id, {})

  scheduled.deleteScheduled(corta.id)

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

  /*
   * El sello de la enhorabuena.
   *
   * Una deuda saldada se celebra una sola vez: el repaso pasa cada media hora y
   * sin marca daría la enhorabuena en cada vuelta, para siempre.
   */
  section('La enhorabuena, una sola vez')
  const deudaSaldada = scheduled.saveScheduled({
    type: 'expense', accountId: bank.id, categoryId: food.id, note: 'Saldada',
    amount: 4000, freq: 'monthly', interval: 1, nextDate: day, endDate: day,
    autoPost: true, isDebt: true, lender: 'amazon'
  })
  scheduled.finishScheduled(deudaSaldada.id, day)
  check(
    'una deuda recién deudaSaldada espera su enhorabuena',
    scheduled.pendingSettlements().some((row) => row.id === deudaSaldada.id)
  )
  scheduled.markSettlementNotified(deudaSaldada.id)
  check(
    'y contada una vez, no vuelve a la cola',
    !scheduled.pendingSettlements().some((row) => row.id === deudaSaldada.id)
  )
  // Lo que se acaba sin ser deuda no se celebra: que termine una suscripción no
  // es una buena noticia, es que toca renovarla.
  const suscripcion = scheduled.saveScheduled({
    type: 'expense', accountId: bank.id, categoryId: food.id, note: 'Suscripción que acaba',
    amount: 999, freq: 'monthly', interval: 1, nextDate: day, endDate: day, autoPost: true
  })
  scheduled.finishScheduled(suscripcion.id, day)
  check(
    'lo que no es deuda no da enhorabuena',
    !scheduled.pendingSettlements().some((row) => row.id === suscripcion.id)
  )
  scheduled.deleteScheduled(deudaSaldada.id)
  scheduled.deleteScheduled(suscripcion.id)

  /*
   * El aviso de saldo bajo, con su pestillo.
   *
   * Sin pestillo, una cuenta por debajo del suelo avisaría cada media hora
   * hasta que la recargaras. Se arma al avisar y se desarma solo cuando el
   * saldo remonta, que es lo que permite que el siguiente bajón vuelva a avisar.
   */
  section('Saldo bajo')
  const vigilada = accounts.saveAccount({
    name: 'Vigilada', type: 'bank', currency: 'EUR', initialBalance: 10000,
    icon: 'bank', color: '#0A84FF', excludeFromTotal: false, lowBalanceThreshold: 5000
  })
  equal('el suelo se guarda', accounts.getAccount(vigilada.id)!.lowBalanceThreshold, 5000)
  check('y nace sin el aviso puesto', accounts.isLowBalanceWarned(vigilada.id) === false)

  const bajon = transactions.saveTransaction({
    type: 'expense', date: day, accountId: vigilada.id, categoryId: food.id, amount: 7000
  })
  const conPocoSaldo = accounts.listAccountsWithBalance().find((a) => a.id === vigilada.id)!
  check('el saldo cae por debajo del suelo', conPocoSaldo.balance < 5000, `${conPocoSaldo.balance}`)

  accounts.setLowBalanceWarned(vigilada.id, true)
  check('avisado una vez, queda armado', accounts.isLowBalanceWarned(vigilada.id))
  accounts.setLowBalanceWarned(vigilada.id, false)
  check('y se puede desarmar al remontar', accounts.isLowBalanceWarned(vigilada.id) === false)

  // Suelo en cero es no vigilar: sin esto, toda cuenta a cero avisaría siempre.
  const libre = accounts.saveAccount({
    name: 'Sin vigilar', type: 'cash', currency: 'EUR', initialBalance: 0,
    icon: 'wallet', color: '#8E8E93', excludeFromTotal: false
  })
  equal('sin suelo puesto, no se vigila', accounts.getAccount(libre.id)!.lowBalanceThreshold, 0)
  transactions.deleteTransaction(bajon.id)
  accounts.deleteAccount(vigilada.id)
  accounts.deleteAccount(libre.id)

  /* Lo que viene, para el resumen: por fecha y sin las pausadas. */
  section('Los próximos vencimientos')
  const vencePronto = scheduled.saveScheduled({
    type: 'expense', accountId: bank.id, categoryId: food.id, note: 'Pronto',
    amount: 1000, freq: 'monthly', interval: 1, nextDate: addDays(day, 1), autoPost: true
  })
  const venceTarde = scheduled.saveScheduled({
    type: 'expense', accountId: bank.id, categoryId: food.id, note: 'Tarde',
    amount: 1000, freq: 'monthly', interval: 1, nextDate: addDays(day, 20), autoPost: true
  })
  const dormida = scheduled.saveScheduled({
    type: 'expense', accountId: bank.id, categoryId: food.id, note: 'Dormida',
    amount: 1000, freq: 'monthly', interval: 1, nextDate: addDays(day, 2), autoPost: true, active: false
  })
  const proximos = scheduled.upcoming(10)
  const posPronto = proximos.findIndex((row) => row.id === vencePronto.id)
  const posTarde = proximos.findIndex((row) => row.id === venceTarde.id)
  check('los ordena por fecha', posPronto >= 0 && posTarde >= 0 && posPronto < posTarde, `${posPronto} vs ${posTarde}`)
  check('y deja fuera las pausadas', !proximos.some((row) => row.id === dormida.id))
  equal('respeta el tope que se le pida', scheduled.upcoming(1).length, 1)
  for (const id of [vencePronto.id, venceTarde.id, dormida.id]) scheduled.deleteScheduled(id)

  /*
   * Una programada que no puede entrar no puede llevarse por delante a las demás.
   *
   * El repaso metía todas dentro de una sola transacción, así que la primera que
   * reventaba deshacía también las que ya habían entrado bien. Un traspaso que
   * dejaría la hucha en números rojos —y la hucha no los admite— bastaba para
   * que ese día no se registrara nada: ni el alquiler, ni la nómina, ni las
   * cuotas. Y sin más rastro que un aviso.
   *
   * Cada una va ahora en la suya: la que falla se queda sin entrar y se cuenta
   * aparte, y las demás siguen su camino.
   */
  section('Una programada rota no arrastra a las otras')
  const huchaCerrada = accounts.saveAccount({
    name: 'Hucha cerrada', type: 'savings', currency: 'EUR', initialBalance: 1000,
    icon: 'piggy', color: '#AF52DE', excludeFromTotal: false
  })
  check('la hucha no admite números rojos', huchaCerrada.allowNegative === false)

  const imposible = scheduled.saveScheduled({
    type: 'expense', accountId: huchaCerrada.id, categoryId: food.id, note: 'No cabe',
    amount: 999999, freq: 'monthly', interval: 1, nextDate: day, autoPost: true
  })
  const buena = scheduled.saveScheduled({
    type: 'expense', accountId: bank.id, categoryId: food.id, note: 'Sí cabe',
    amount: 1500, freq: 'monthly', interval: 1, nextDate: day, autoPost: true
  })

  const resultado = scheduled.postDue(day)
  const entradas = transactions.listTransactions({ search: 'Sí cabe', limit: 10 })
  check('la buena entra igualmente', entradas.length === 1, `${entradas.length} movimientos`)
  equal('y se cuenta como registrada', resultado.created, 1)
  equal('la que no cabe se cuenta aparte', resultado.failed.length, 1)
  check(
    'diciendo cuál y por qué',
    resultado.failed[0]?.id === imposible.id && /números rojos/.test(resultado.failed[0]?.reason ?? ''),
    JSON.stringify(resultado.failed[0])
  )
  equal(
    'la rota no deja movimiento',
    transactions.listTransactions({ search: 'No cabe', limit: 10 }).length,
    0
  )
  equal(
    'ni mueve su próxima fecha',
    scheduled.getScheduled(imposible.id)!.nextDate,
    day
  )
  check(
    'y la buena sí avanza la suya',
    scheduled.getScheduled(buena.id)!.nextDate > day,
    scheduled.getScheduled(buena.id)!.nextDate
  )
  // Repetir el repaso no duplica la que ya entró ni deja de intentar la rota.
  const segundoRepaso = scheduled.postDue(day)
  equal('al repetir, la buena ya no vuelve a entrar', segundoRepaso.created, 0)
  equal('y la rota se sigue contando', segundoRepaso.failed.length, 1)
  equal(
    'sin duplicar la que entró',
    transactions.listTransactions({ search: 'Sí cabe', limit: 10 }).length,
    1
  )

  for (const fila of transactions.listTransactions({ search: 'Sí cabe', limit: 10 })) {
    transactions.deleteTransaction(fila.id)
  }
  scheduled.deleteScheduled(imposible.id)
  scheduled.deleteScheduled(buena.id)
  accounts.deleteAccount(huchaCerrada.id)

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

  /*
   * «Concepto» es como llaman a esta columna los extractos de los bancos de
   * aquí, y no estaba en la lista: la cabecera entraba sin reconocer y los
   * movimientos se importaban con el título en blanco, sin decir nada. Un
   * extracto del banco perdía justo lo único que explica cada apunte.
   */
  const conceptoPath = join(dir, 'concepto.csv')
  writeFileSync(
    conceptoPath,
    ['Fecha;Tipo;Cuenta;Categoría;Importe;Concepto',
     '2026-08-16;Gasto;Cartera;Alimentación;-8,40;Compra del súper'].join('\r\n'),
    'utf8'
  )
  equal('importa la fila con «Concepto»', csv.importCsv(conceptoPath).imported, 1)
  const porConcepto = transactions.listTransactions({ search: 'Compra del súper' })
  equal('y el concepto llega al título', porConcepto.length, 1)
  equal('con su texto entero', porConcepto[0]?.note, 'Compra del súper')

  /*
   * Reimportar el mismo archivo no duplica nada.
   *
   * Bajar el extracto del mes y volver a pasarlo dejaba el mes entero por
   * duplicado, sin decir una palabra. Ahora se comparan huellas —día, cuenta,
   * tipo, importe y título— contra lo que ya hay.
   *
   * Y se cuentan, no se marcan: dos cafés iguales el mismo día son dos cafés.
   * Ese es el caso que separa una detección útil de una que borra datos buenos.
   */
  section('Importar dos veces no duplica')
  const dosVecesPath = join(dir, 'dos-veces.csv')
  writeFileSync(
    dosVecesPath,
    ['Fecha;Tipo;Cuenta;Categoría;Importe;Concepto',
     '2026-08-10;Gasto;Cartera;Alimentación;-5,00;Extracto uno',
     '2026-08-10;Gasto;Cartera;Alimentación;-7,00;Extracto dos'].join('\r\n'),
    'utf8'
  )
  const primera = csv.importCsv(dosVecesPath)
  equal('la primera vez entran las dos', primera.imported, 2)
  equal('y ninguna es duplicada', primera.duplicates, 0)

  const segunda = csv.importCsv(dosVecesPath)
  equal('la segunda no entra ninguna', segunda.imported, 0)
  equal('y las dos se marcan como ya apuntadas', segunda.duplicates, 2)
  equal(
    'en la base sigue habiendo una de cada',
    transactions.listTransactions({ search: 'Extracto uno' }).length,
    1
  )

  // Repetidos de verdad: dos cafés iguales el mismo día son dos cafés.
  const cafesPath = join(dir, 'cafes.csv')
  writeFileSync(
    cafesPath,
    ['Fecha;Tipo;Cuenta;Categoría;Importe;Concepto',
     '2026-08-11;Gasto;Cartera;Alimentación;-1,50;Café',
     '2026-08-11;Gasto;Cartera;Alimentación;-1,50;Café'].join('\r\n'),
    'utf8'
  )
  equal('dos filas idénticas nuevas entran las dos', csv.importCsv(cafesPath).imported, 2)
  equal(
    'y quedan las dos apuntadas',
    transactions.listTransactions({ search: 'Café' }).filter((t) => t.date === '2026-08-11').length,
    2
  )
  const otroCafe = csv.importCsv(cafesPath)
  equal('reimportarlas no añade ninguna', otroCafe.imported, 0)
  equal('y las cuenta como las dos que ya estaban', otroCafe.duplicates, 2)

  // Un archivo con tres contra dos ya apuntadas mete solo la que falta.
  const tresCafesPath = join(dir, 'tres-cafes.csv')
  writeFileSync(
    tresCafesPath,
    ['Fecha;Tipo;Cuenta;Categoría;Importe;Concepto',
     '2026-08-11;Gasto;Cartera;Alimentación;-1,50;Café',
     '2026-08-11;Gasto;Cartera;Alimentación;-1,50;Café',
     '2026-08-11;Gasto;Cartera;Alimentación;-1,50;Café'].join('\r\n'),
    'utf8'
  )
  const tercero = csv.importCsv(tresCafesPath)
  equal('de tres iguales con dos ya apuntadas, entra una', tercero.imported, 1)
  equal('y las otras dos se saltan', tercero.duplicates, 2)

  // Y si de verdad lo quieres repetido, se puede pedir.
  const forzado = csv.importCsv(dosVecesPath, { allowDuplicates: true })
  equal('pidiéndolo, entra igualmente', forzado.imported, 2)
  equal('y entonces no cuenta duplicados', forzado.duplicates, 0)

  // Cambiar el importe lo convierte en otro movimiento, no en un duplicado.
  const distintoPath = join(dir, 'distinto.csv')
  writeFileSync(
    distintoPath,
    ['Fecha;Tipo;Cuenta;Categoría;Importe;Concepto',
     '2026-08-10;Gasto;Cartera;Alimentación;-5,01;Extracto uno'].join('\r\n'),
    'utf8'
  )
  const distinto = csv.importCsv(distintoPath)
  equal('un céntimo de diferencia ya no es el mismo apunte', distinto.imported, 1)
  equal('y no se marca como duplicado', distinto.duplicates, 0)

  /*
   * La vista previa: lo que se enseña antes de importar nada.
   *
   * Detrás de un diálogo de Windows en la aplicación, así que aquí es donde se
   * puede comprobar. Adivina el separador porque cada banco usa el suyo.
   */
  const previa = csv.previewCsv(conceptoPath)
  equal('adivina el punto y coma', previa.delimiter, ';')
  equal('lee las cabeceras', previa.headers.length, 6)
  equal('y cuenta las filas sin la cabecera', previa.total, 1)
  const comaPath = join(dir, 'comas.csv')
  writeFileSync(comaPath, ['fecha,tipo,cuenta,importe', '2026-08-14,Gasto,Cartera,-1,00'].join('\r\n'), 'utf8')
  equal('y adivina la coma cuando toca', csv.previewCsv(comaPath).delimiter, ',')
  let vacioAviso = ''
  try {
    const vacioPath = join(dir, 'vacio.csv')
    writeFileSync(vacioPath, '', 'utf8')
    csv.previewCsv(vacioPath)
  } catch (error) {
    vacioAviso = (error as Error).message
  }
  check('y avisa si el archivo está vacío', vacioAviso.includes('vacío'), vacioAviso)

  // Lo mismo con «Título», que es como lo llama esta aplicación.
  const tituloPath = join(dir, 'titulo.csv')
  writeFileSync(
    tituloPath,
    ['Fecha;Tipo;Cuenta;Categoría;Importe;Título',
     '2026-08-15;Gasto;Cartera;Alimentación;-3,20;Café de la mañana'].join('\r\n'),
    'utf8'
  )
  csv.importCsv(tituloPath)
  equal(
    'y «Título» también',
    transactions.listTransactions({ search: 'Café de la mañana' })[0]?.note,
    'Café de la mañana'
  )

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

  section('Dinero apartado para un hito')
  // El reparto automático sirve mientras no tengas criterio propio. En cuanto lo
  // tienes, manda lo que hayas apartado: la prueba de fuego es que el hito de
  // fecha más cercana —el que cobra primero— no pueda llevarse lo del otro.
  const alcancia2 = accounts.saveAccount({
    name: 'Alcancía doble',
    type: 'savings',
    currency: 'EUR',
    initialBalance: 0,
    icon: 'piggy',
    color: '#34C759',
    excludeFromTotal: false
  })
  const pronto = goals.saveGoal({
    name: 'Lo de pronto',
    accountId: alcancia2.id,
    targetAmount: 1000,
    targetDate: addDays(day, 30),
    icon: 'piggy',
    color: '#34C759'
  })
  const tarde = goals.saveGoal({
    name: 'Lo de más tarde',
    accountId: alcancia2.id,
    targetAmount: 1000,
    targetDate: addDays(day, 300),
    icon: 'piggy',
    color: '#34C759'
  })

  // Mil euros que entran en la hucha sin repartir: no son de ningún plan.
  const suelto = transactions.saveTransaction({
    type: 'transfer',
    date: day,
    accountId: bank.id,
    toAccountId: alcancia2.id,
    amount: 1000
  })
  const reparto = (id: number): number => goals.goalProgress().find((g) => g.id === id)!.saved
  equal('el dinero suelto no se lo lleva nadie', reparto(pronto.id), 0)
  equal('ni siquiera el de fecha más cercana', reparto(tarde.id), 0)

  // Los mismos mil, repartidos a mano para el lejano.
  goals.setGoalReserves([{ id: tarde.id, amount: 1000 }])
  equal('lo reservado es suyo', reparto(tarde.id), 1000)
  equal('aunque el otro venza antes', reparto(pronto.id), 0)

  // Lo que entra después sigue sin dueño hasta que se reparta.
  const extra = transactions.saveTransaction({
    type: 'transfer',
    date: day,
    accountId: bank.id,
    toAccountId: alcancia2.id,
    amount: 500
  })
  equal('lo nuevo no se reparte solo', reparto(pronto.id), 0)
  equal('sin tocar lo ya reservado', reparto(tarde.id), 1000)

  // Reservar más de lo que el plan necesita no le da de más: se queda en su meta
  // y el resto sigue siendo ahorro libre.
  goals.setGoalReserves([{ id: tarde.id, amount: 1500 }])
  equal('un plan no recibe más de su meta', reparto(tarde.id), 1000)
  equal('y el sobrante no se le cuela a otro', reparto(pronto.id), 0)

  // Un gasto normal no lleva hito por mucho que se lo pidan.
  const gastoConHito = transactions.saveTransaction({
    type: 'expense',
    date: day,
    accountId: bank.id,
    amount: 100,
    goalId: tarde.id
  })
  equal('un gasto no puede apartarse para un hito', transactions.getTransaction(gastoConHito.id)!.goalId, null)
  // Y lo mismo, pero repartiendo a mano desde Ahorro: la reserva vive en el hito,
  // así que se puede recolocar sin tocar ningún movimiento.
  goals.setGoalReserves([
    { id: pronto.id, amount: 500 },
    { id: tarde.id, amount: 1000 }
  ])
  equal('repartir a mano manda sobre la fecha', reparto(tarde.id), 1000)

  // Reservar no crea dinero ni infla el plan: por encima de la meta se recorta al
  // guardar, no solo al enseñarlo.
  goals.setGoalReserves([{ id: tarde.id, amount: tarde.targetAmount + 50000 }])
  equal(
    'la reserva no pasa de la meta',
    goals.listGoals().find((item) => item.id === tarde.id)!.reserved,
    tarde.targetAmount
  )
  goals.setGoalReserves([{ id: tarde.id, amount: 1000 }])
  equal('y al cercano le queda lo suyo', reparto(pronto.id), 500)

  // Borrar el traspaso que sostenía una reserva se la lleva con él.
  const conDueno = transactions.saveTransaction({
    type: 'transfer',
    date: day,
    accountId: bank.id,
    toAccountId: alcancia2.id,
    amount: 300,
    goalId: tarde.id
  })
  equal('apartar al traspasar suma a la reserva', goals.getGoal(tarde.id)!.reserved, 1300)
  transactions.deleteTransactions([conDueno.id])
  equal('y borrarlo la deshace', goals.getGoal(tarde.id)!.reserved, 1000)

  // Cambiar el hito de un traspaso mueve la reserva entera, no la duplica.
  const cambiante = transactions.saveTransaction({
    type: 'transfer',
    date: day,
    accountId: bank.id,
    toAccountId: alcancia2.id,
    amount: 300,
    goalId: tarde.id
  })
  transactions.saveTransaction({
    id: cambiante.id,
    type: 'transfer',
    date: day,
    accountId: bank.id,
    toAccountId: alcancia2.id,
    amount: 300,
    goalId: pronto.id
  })
  equal('cambiar de hito se lleva la reserva', goals.getGoal(tarde.id)!.reserved, 1000)
  equal('y la deja en el nuevo', goals.getGoal(pronto.id)!.reserved, 800)
  transactions.deleteTransactions([cambiante.id])

  transactions.deleteTransactions([gastoConHito.id, extra.id, suelto.id])
  goals.deleteGoal(pronto.id)
  goals.deleteGoal(tarde.id)
  accounts.deleteAccount(alcancia2.id)

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
  check('un plan sin saldo todavía no se celebra', !alcanzado())

  transactions.saveTransaction({
    type: 'income',
    date: day,
    accountId: alcancia.id,
    amount: 1000
  })
  // El dinero dentro de la hucha no basta: hasta que no se le reparte, no es suyo.
  check('el dinero suelto no dispara nada', !alcanzado())
  goals.setGoalReserves([{ id: meta.id, amount: 1000 }])
  check('el plan alcanzado se celebra', alcanzado())
  const celebrado = goals.pendingGoals().find((row) => row.id === meta.id)!
  equal('con su título', celebrado.title, 'Un teclado')
  equal('y lo juntado es la meta', celebrado.total, 1000)
  goals.markGoalReached(meta.id)
  check('y no se repite mientras el dinero siga ahí', !alcanzado())

  // Sacar el dinero deshace el hito, y volver a juntarlo vuelve a costar lo
  // mismo: la marca dice «ya celebrado mientras siga ahí», no «para siempre».
  const fuga = transactions.saveTransaction({
    type: 'expense',
    date: day,
    accountId: alcancia.id,
    amount: 400
  })
  check('sacar el dinero desarma la enhorabuena', !alcanzado())
  equal(
    'y la marca queda quitada de verdad',
    (getDb().prepare('SELECT reached_notified AS n FROM goals WHERE id = ?').get(meta.id) as { n: number }).n,
    0
  )
  transactions.saveTransaction({
    type: 'income',
    date: day,
    accountId: alcancia.id,
    amount: 400
  })
  // El dinero vuelve, pero la reserva no resucita sola: al sacarlo se recortó, y
  // repartirlo otra vez es una decisión que toma quien lo reparte.
  check('reponer el dinero no lo devuelve al plan', !alcanzado())
  goals.setGoalReserves([{ id: meta.id, amount: 1000 }])
  check('volver a repartirlo vuelve a celebrarse', alcanzado())
  goals.markGoalReached(meta.id)
  transactions.deleteTransactions([fuga.id])

  // Y borrar los movimientos que lo sostenían hace lo mismo que sacar el dinero:
  // deja de estar ahí, se mire por donde se mire.
  transactions.deleteTransactions(
    transactions.listTransactions({ limit: 500, accountIds: [alcancia.id] }).map((row) => row.id)
  )
  check('borrar los movimientos desarma la enhorabuena', !alcanzado())
  transactions.saveTransaction({
    type: 'income',
    date: day,
    accountId: alcancia.id,
    amount: 1000
  })
  goals.setGoalReserves([{ id: meta.id, amount: 1000 }])
  check('y al reponerlos y repartirlos vuelve a saltar', alcanzado())
  goals.markGoalReached(meta.id)

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

  section('Cuenta principal por tipo')
  // La marca vive en la cuenta y hay una por tipo: la del banco es la que viene
  // marcada al registrar un movimiento y la de ahorro la que abre Planes Ahorro.
  check('al principio ninguna es principal', accounts.listAccounts().every((a) => !a.isPrimary))
  accounts.setPrimaryAccount(bank.id, true)
  equal('la del banco queda marcada', accounts.primaryAccount('bank')!.id, bank.id)
  accounts.setPrimaryAccount(cash.id, true)
  equal(
    'marcar otra de otro tipo no le quita la suya',
    accounts.primaryAccount('bank')!.id,
    bank.id
  )
  equal('y cada tipo tiene la suya', accounts.primaryAccount('cash')!.id, cash.id)

  // Dos del mismo tipo no pueden serlo a la vez.
  const otroBanco = accounts.saveAccount({
    name: 'Segundo banco', type: 'bank', currency: 'EUR', initialBalance: 0,
    icon: 'bank', color: '#0A84FF', excludeFromTotal: false
  })
  accounts.setPrimaryAccount(otroBanco.id, true)
  equal('poner una quita la que hubiera de su tipo', accounts.primaryAccount('bank')!.id, otroBanco.id)
  accounts.deleteAccount(otroBanco.id)
  accounts.setPrimaryAccount(bank.id, true)

  // Y salen las primeras en todas partes: el orden se decide en un solo sitio y
  // lo heredan la pestaña Cuentas, los desplegables y los filtros. El banco va
  // antes que el efectivo, que es de donde se apunta el día a día.
  equal('las principales encabezan la lista', accounts.listAccounts()[0].id, bank.id)
  equal('la preferida es la del banco', accounts.preferredAccount()!.id, bank.id)
  equal('el saldo llega en el mismo orden', accounts.listAccountsWithBalance()[0].id, bank.id)

  accounts.saveAccount({
    id: cash.id, name: cash.name, type: cash.type, currency: cash.currency,
    initialBalance: cash.initialBalance, icon: cash.icon, color: cash.color,
    excludeFromTotal: false, archived: true
  })
  check('archivarla la deja de principal', !accounts.getAccount(cash.id)!.isPrimary)

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

  accounts.setPrimaryAccount(dollars.id, true)
  accounts.deleteAccount(dollars.id)
  check('borrarla se lleva su marca', accounts.primaryAccount('bank')?.id !== dollars.id)
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

  /*
   * Y va estrechando mientras se escribe, igual que con los nombres.
   *
   * Buscaba por igualdad, así que hasta no escribir «9,17» entero no salía nada
   * y el buscador parecía roto a media palabra.
   */
  check(
    'con la primera cifra ya aparece',
    transactions.listTransactions({ search: '9' }).some((row) => row.id === conImporte.id)
  )
  check(
    'y con la coma puesta también',
    transactions.listTransactions({ search: '9,1' }).some((row) => row.id === conImporte.id)
  )
  check(
    'los decimales cuentan como parte del importe',
    transactions.listTransactions({ search: ',17' }).some((row) => row.id === conImporte.id)
  )
  /*
   * La coma no se salta: buscar «91» son noventa y un euros, no los 9,17 €.
   * Sin esto, comparar contra el número guardado en céntimos —917— haría que
   * cualquier trozo de cifra trajera importes que no se le parecen.
   */
  check(
    'la coma separa: «91» no trae los 9,17 €',
    transactions.listTransactions({ search: '91' }).every((row) => row.id !== conImporte.id)
  )
  // Un importe de más de mil se busca sin el punto de los millares, que nadie
  // lo escribe al teclear una cifra de memoria.
  const conMillares = transactions.saveTransaction({
    type: 'expense',
    date: day,
    accountId: transactions.listTransactions({ limit: 1 })[0].accountId,
    amount: 123400,
    note: 'Tampoco hay texto aquí'
  })
  check(
    'un importe con millares se busca sin el punto',
    transactions.listTransactions({ search: '1234' }).some((row) => row.id === conMillares.id)
  )
  transactions.deleteTransactions([conMillares.id])
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

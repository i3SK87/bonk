/**
 * Datos de ejemplo para las capturas del manual: una persona inventada con
 * unos meses de vida en BONK. Se escriben en una carpeta temporal con la capa
 * de datos de verdad; nunca tocan `%APPDATA%\BONK`.
 */
import * as accounts from '../../../src/main/repos/accounts'
import * as categories from '../../../src/main/repos/categories'
import * as transactions from '../../../src/main/repos/transactions'
import * as goals from '../../../src/main/repos/goals'
import * as scheduled from '../../../src/main/repos/scheduled'
import * as tags from '../../../src/main/repos/tags'
import * as settings from '../../../src/main/repos/settings'
import { today, startOfMonth, addMonths, addDays } from '../../../src/shared/dates'

let semilla = 20260913
/** Un azar que sale siempre igual, para que las capturas no cambien de una vez a otra. */
function azar(): number {
  semilla = (semilla * 1103515245 + 12345) % 2147483648
  return semilla / 2147483648
}
const entre = (min: number, max: number): number => Math.round(min + azar() * (max - min))

export function sembrar(opciones: { resumenVisto: boolean }): void {
  const cats = new Map(categories.listCategories().map((c) => [c.name, c]))
  const cat = (nombre: string): number => cats.get(nombre)!.id

  // — Cuentas: las dos que trae BONK, retocadas, y dos más —
  const iniciales = accounts.listAccounts()
  const efectivo = accounts.saveAccount({ ...iniciales.find((a) => a.type === 'cash')!, initialBalance: 45000 })
  const banco = accounts.saveAccount({
    ...iniciales.find((a) => a.type === 'bank')!,
    name: 'Banco Ejemplo',
    initialBalance: 185000,
    lowBalanceThreshold: 30000
  })
  accounts.setPrimaryAccount(banco.id, true)
  const hucha = accounts.saveAccount({
    name: 'Hucha', type: 'savings', currency: 'EUR', initialBalance: 240000, icon: 'piggy', color: '#AF52DE',
    excludeFromTotal: false, allowNegative: false, archived: false, note: null, lowBalanceThreshold: 0
  } as never)
  const tarjeta = accounts.saveAccount({
    name: 'Tarjeta', type: 'card', currency: 'EUR', initialBalance: 0, icon: 'card', color: '#FF9500',
    excludeFromTotal: false, allowNegative: true, archived: false, note: null, lowBalanceThreshold: 0
  } as never)

  const [viaje] = tags.ensureTags(['viaje'])
  const [casa] = tags.ensureTags(['casa'])

  // — Un año de gasto corriente —
  const tiendas = ['Mercadona', 'Carrefour', 'Lidl', 'Dia', 'Frutería Paqui']
  const bares = ['Bar Manolo', 'La Tagliatella', 'Cien Montaditos', 'Pizzería Nápoles']
  for (let m = -11; m <= 0; m++) {
    const inicio = startOfMonth(addMonths(today(), m))
    const hasta = m === 0 ? Number(today().slice(8, 10)) - 1 : 27
    const dia = (d: number): string => addDays(inicio, Math.min(d, hasta))

    transactions.saveTransaction({ type: 'expense', date: dia(4), accountId: banco.id, categoryId: cat('Suministros'), amount: entre(5200, 7400), note: 'Iberdrola', tagIds: [casa], apartarEn: false })
    transactions.saveTransaction({ type: 'expense', date: dia(7), accountId: banco.id, categoryId: cat('Telefonía e internet'), amount: 4500, note: 'Movistar', apartarEn: false })
    for (let i = 0; i < 6; i++) {
      transactions.saveTransaction({ type: 'expense', date: dia(entre(0, 26)), accountId: tarjeta.id, categoryId: cat('Alimentación'), amount: entre(1800, 7900), note: tiendas[entre(0, tiendas.length - 1)], apartarEn: false })
    }
    for (let i = 0; i < 3; i++) {
      transactions.saveTransaction({ type: 'expense', date: dia(entre(0, 26)), accountId: efectivo.id, categoryId: cat('Restaurantes'), amount: entre(1200, 4200), note: bares[entre(0, bares.length - 1)], apartarEn: false })
    }
    transactions.saveTransaction({ type: 'expense', date: dia(entre(3, 24)), accountId: tarjeta.id, categoryId: cat('Combustible'), amount: entre(4500, 6800), note: 'Repsol', apartarEn: false })
    transactions.saveTransaction({ type: 'expense', date: dia(entre(5, 25)), accountId: tarjeta.id, categoryId: cat('Ocio'), amount: entre(1500, 3800), note: m % 2 ? 'Cinesa' : 'Entradas concierto', apartarEn: false })
    if (m !== -1) transactions.saveTransaction({ type: 'expense', date: dia(entre(8, 22)), accountId: tarjeta.id, categoryId: cat('Salud'), amount: entre(900, 2400), note: 'Farmacia', apartarEn: false })
    // La tarjeta se paga desde el banco a principios de mes.
    transactions.saveTransaction({ type: 'transfer', date: dia(1), accountId: banco.id, toAccountId: tarjeta.id, amount: entre(40000, 48000), apartarEn: false })
    // Y una visita al cajero, que el efectivo no sale de la nada.
    transactions.saveTransaction({ type: 'transfer', date: dia(2), accountId: banco.id, toAccountId: efectivo.id, amount: 10000, apartarEn: false })
  }

  // Un viaje, para que las etiquetas digan algo.
  const salida = addDays(today(), -52)
  transactions.saveTransaction({ type: 'expense', date: salida, accountId: tarjeta.id, categoryId: cat('Viajes'), amount: 8900, note: 'Renfe', tagIds: [viaje], apartarEn: false })
  transactions.saveTransaction({ type: 'expense', date: addDays(salida, 1), accountId: tarjeta.id, categoryId: cat('Viajes'), amount: 21400, note: 'Hotel en Cádiz', tagIds: [viaje], apartarEn: false })

  // Un gasto compartido y lo que te devuelven.
  const cena = transactions.saveTransaction({ type: 'expense', date: addDays(today(), -6), accountId: banco.id, categoryId: cat('Restaurantes'), amount: 9600, note: 'Cena de cumpleaños', apartarEn: false })
  transactions.saveTransaction({ type: 'refund', date: addDays(today(), -5), accountId: banco.id, categoryId: cat('Restaurantes'), amount: 3200, note: 'Bizum de Laura', refundForId: cena.id, apartarEn: false })
  transactions.saveTransaction({ type: 'refund', date: addDays(today(), -4), accountId: banco.id, categoryId: cat('Restaurantes'), amount: 3200, note: 'Bizum de Marcos', refundForId: cena.id, apartarEn: false })

  // — Planes de ahorro —
  const japon = goals.saveGoal({ name: 'Viaje a Japón', accountId: hucha.id, targetAmount: 250000, targetDate: addMonths(today(), 8), icon: 'travel', color: '#FF375F', note: null, achievedAt: null } as never)
  const portatil = goals.saveGoal({ name: 'Portátil nuevo', accountId: hucha.id, targetAmount: 120000, targetDate: addMonths(today(), 3), icon: 'portatil', color: '#0A84FF', note: null, achievedAt: null } as never)
  const colchon = goals.saveGoal({ name: 'Colchón de imprevistos', accountId: hucha.id, targetAmount: 300000, targetDate: null, icon: 'shield', color: '#30D158', note: null, achievedAt: null } as never)
  const bici = goals.saveGoal({ name: 'Bicicleta', accountId: hucha.id, targetAmount: 45000, targetDate: addDays(today(), -20), icon: 'bici', color: '#FF9F0A', note: null, achievedAt: null } as never)
  goals.setGoalReserves([
    { id: japon.id, amount: 95000 },
    { id: portatil.id, amount: 70000 },
    { id: colchon.id, amount: 45000 },
    { id: bici.id, amount: 45000 }
  ])
  goals.setGoalAchieved(bici.id, true)

  // — Ahorro automático: el 10 % de cada nómina, a la hucha, como ahorro libre —
  const nomina = cats.get('Nómina')!
  categories.saveCategory({ ...nomina, savePercent: 10, saveAmount: null, saveAccountId: hucha.id, saveGoalId: null } as never)

  // — Programados: se dan de alta con la primera vuelta en el pasado y se
  // ponen al día solos, como al abrir BONK después de unos meses —
  const haceUnAno = startOfMonth(addMonths(today(), -11))
  // Las deudas, más recientes: así se ven a medio pagar.
  const inicioDeudas = startOfMonth(addMonths(today(), -3))
  scheduled.saveScheduled({ name: 'Nómina', type: 'income', accountId: banco.id, categoryId: nomina.id, amount: 185000, freq: 'monthly', interval: 1, nextDate: addDays(haceUnAno, 27), autoPost: true, note: 'Nómina' } as never)
  scheduled.saveScheduled({ name: 'Alquiler', type: 'expense', accountId: banco.id, categoryId: cat('Vivienda'), amount: 75000, freq: 'monthly', interval: 1, nextDate: addDays(haceUnAno, 0), autoPost: true, tagIds: [casa], note: 'Alquiler' } as never)
  scheduled.saveScheduled({ name: 'Netflix', type: 'expense', accountId: tarjeta.id, categoryId: cat('Suscripciones'), amount: 1399, freq: 'monthly', interval: 1, nextDate: addDays(haceUnAno, 14), autoPost: true, note: 'Netflix' } as never)
  scheduled.saveScheduled({ name: 'Spotify', type: 'expense', accountId: tarjeta.id, categoryId: cat('Suscripciones'), amount: 1099, freq: 'monthly', interval: 1, nextDate: addDays(haceUnAno, 17), autoPost: true, note: 'Spotify' } as never)
  scheduled.saveScheduled({ name: 'Gimnasio', type: 'expense', accountId: banco.id, categoryId: cat('Deporte'), amount: 3990, freq: 'monthly', interval: 1, nextDate: addDays(haceUnAno, 2), autoPost: true, note: 'Gimnasio' } as never)
  scheduled.saveScheduled({ name: 'Seguro del coche', type: 'expense', accountId: banco.id, categoryId: cat('Seguros'), amount: 42000, freq: 'yearly', interval: 1, nextDate: addDays(today(), 19), autoPost: true, remind: true, note: 'Seguro del coche' } as never)
  scheduled.saveScheduled({ name: 'Móvil a plazos', type: 'expense', accountId: tarjeta.id, categoryId: cat('Telefonía e internet'), amount: 3325, freq: 'monthly', interval: 1, nextDate: addDays(inicioDeudas, 9), endDate: addMonths(addDays(inicioDeudas, 9), 11), autoPost: true, isDebt: true, lender: 'aplazame', note: 'Móvil a plazos' } as never)
  scheduled.saveScheduled({ name: 'Sofá', type: 'expense', accountId: banco.id, categoryId: cat('Vivienda'), amount: 6250, freq: 'monthly', interval: 1, nextDate: addDays(inicioDeudas, 20), endDate: addMonths(addDays(inicioDeudas, 20), 5), autoPost: true, isDebt: true, lender: 'sequra', note: 'Sofá' } as never)
  scheduled.postDue()

  // — Ajustes: tema claro y Grafito, que es lo que mejor sale en papel —
  settings.updateSettings({
    theme: 'light',
    palette: 'grafito',
    lastMonthlySummary: opciones.resumenVisto ? startOfMonth(addMonths(today(), -1)).slice(0, 7) : '',
    lastBackupAt: new Date().toISOString(),
    widgetAccountIds: []
  })
}

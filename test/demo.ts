/**
 * Rellena una carpeta de datos con un año de movimientos verosímiles.
 * Solo sirve para ver la aplicación con contenido; nunca toca los datos reales.
 *
 *   node out/test/demo.mjs <carpeta>
 */
import { openDatabase, closeDatabase } from '../src/main/db'
import * as accounts from '../src/main/repos/accounts'
import * as categories from '../src/main/repos/categories'
import * as transactions from '../src/main/repos/transactions'
import * as budgets from '../src/main/repos/budgets'
import * as scheduled from '../src/main/repos/scheduled'
import * as tags from '../src/main/repos/tags'
import * as settings from '../src/main/repos/settings'
import { today, startOfMonth, addMonths, addDays } from '../src/shared/dates'

const target = process.argv[2]
if (!target) {
  console.error('Falta la carpeta de destino')
  process.exit(1)
}

openDatabase(target)

const cash = accounts.saveAccount({
  name: 'Efectivo', type: 'cash', currency: 'EUR', initialBalance: 12000,
  icon: 'wallet', color: '#34C759', excludeFromTotal: false
})
const bank = accounts.saveAccount({
  name: 'Cuenta nómina', type: 'bank', currency: 'EUR', initialBalance: 240000,
  icon: 'bank', color: '#0A84FF', excludeFromTotal: false
})
const savings = accounts.saveAccount({
  name: 'Ahorro', type: 'savings', currency: 'EUR', initialBalance: 850000,
  icon: 'piggy', color: '#AF52DE', excludeFromTotal: false
})
const card = accounts.saveAccount({
  name: 'Tarjeta de crédito', type: 'card', currency: 'EUR', initialBalance: -32000,
  icon: 'card', color: '#FF9500', excludeFromTotal: false
})

const byName = new Map(categories.listCategories().map((category) => [category.name, category]))
const pick = (name: string): number => byName.get(name)!.id

const viaje = tags.ensureTags(['viaje'])[0]
const casa = tags.ensureTags(['casa'])[0]

// Patrón de gasto de un mes corriente: recibos fijos y compras sueltas.
const monthlyFixed: Array<[string, string, number, number]> = [
  ['Vivienda', 'Alquiler', 78000, 1],
  ['Suministros', 'Iberdrola', 6800, 5],
  ['Suministros', 'Canal de Isabel II', 2400, 8],
  ['Telefonía e internet', 'Movistar', 4990, 12],
  ['Suscripciones', 'Netflix', 1399, 15],
  ['Suscripciones', 'Spotify', 1099, 18],
  ['Seguros', 'Mapfre', 4200, 20]
]

const groceries = ['Mercadona', 'Carrefour', 'Lidl', 'Alcampo', 'Dia']
const restaurants = ['Bar Manolo', 'La Tagliatella', 'Cien Montaditos', 'Tacos El Paso']

let seed = 20260818
const random = (): number => {
  // Generador determinista para que la demo salga siempre igual.
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const between = (min: number, max: number): number => Math.round(min + random() * (max - min))

for (let monthOffset = -11; monthOffset <= 0; monthOffset++) {
  const monthStart = startOfMonth(addMonths(today(), monthOffset))

  transactions.saveTransaction({
    type: 'income', date: addDays(monthStart, 24), accountId: bank.id,
    categoryId: pick('Nómina'), amount: between(195000, 215000), payee: 'Nómina mensual'
  })

  for (const [category, payee, amount, day] of monthlyFixed) {
    transactions.saveTransaction({
      type: 'expense', date: addDays(monthStart, day - 1), accountId: bank.id,
      categoryId: pick(category), amount: amount + between(-300, 300), payee,
      tagIds: category === 'Vivienda' || category === 'Suministros' ? [casa] : []
    })
  }

  for (let i = 0; i < between(6, 10); i++) {
    transactions.saveTransaction({
      type: 'expense', date: addDays(monthStart, between(0, 27)), accountId: card.id,
      categoryId: pick('Alimentación'), amount: between(2200, 8900),
      payee: groceries[between(0, groceries.length - 1)]
    })
  }

  for (let i = 0; i < between(2, 6); i++) {
    transactions.saveTransaction({
      type: 'expense', date: addDays(monthStart, between(0, 27)), accountId: cash.id,
      categoryId: pick('Restaurantes'), amount: between(1200, 4800),
      payee: restaurants[between(0, restaurants.length - 1)]
    })
  }

  transactions.saveTransaction({
    type: 'expense', date: addDays(monthStart, between(2, 25)), accountId: card.id,
    categoryId: pick('Combustible'), amount: between(4500, 7500), payee: 'Repsol'
  })

  if (random() > 0.5) {
    transactions.saveTransaction({
      type: 'expense', date: addDays(monthStart, between(5, 25)), accountId: card.id,
      categoryId: pick('Ocio'), amount: between(1500, 6000), payee: 'Cinesa'
    })
  }

  if (random() > 0.65) {
    transactions.saveTransaction({
      type: 'expense', date: addDays(monthStart, between(5, 25)), accountId: card.id,
      categoryId: pick('Ropa'), amount: between(2500, 12000), payee: 'Zara'
    })
  }

  // Traspaso mensual al ahorro y pago de la tarjeta.
  transactions.saveTransaction({
    type: 'transfer', date: addDays(monthStart, 25), accountId: bank.id,
    toAccountId: savings.id, amount: between(25000, 45000)
  })
  transactions.saveTransaction({
    type: 'transfer', date: addDays(monthStart, 1), accountId: bank.id,
    toAccountId: card.id, amount: between(30000, 52000)
  })
}

// Un viaje puntual, para que las etiquetas tengan sentido.
const tripStart = addDays(today(), -70)
transactions.saveTransaction({
  type: 'expense', date: tripStart, accountId: card.id, categoryId: pick('Viajes'),
  amount: 34500, payee: 'Renfe', tagIds: [viaje]
})
transactions.saveTransaction({
  type: 'expense', date: addDays(tripStart, 1), accountId: card.id, categoryId: pick('Viajes'),
  amount: 21000, payee: 'Hotel Riu', tagIds: [viaje]
})
transactions.saveTransaction({
  type: 'expense', date: addDays(tripStart, 2), accountId: cash.id, categoryId: pick('Restaurantes'),
  amount: 6800, payee: 'Mesón del puerto', tagIds: [viaje]
})

// Suscripción compartida entre cuatro: el cobro entero y las tres devoluciones.
const premium = transactions.saveTransaction({
  type: 'expense', date: addDays(startOfMonth(today()), 9), accountId: bank.id,
  categoryId: pick('Suscripciones'), amount: 1199, payee: 'YouTube Premium'
})
;['Ana', 'Bruno', 'Carla'].forEach((friend, index) => {
  transactions.saveTransaction({
    type: 'refund', date: addDays(startOfMonth(today()), 10 + index), accountId: bank.id,
    categoryId: pick('Suscripciones'), amount: 300, payee: friend,
    refundForId: premium.id, note: 'Su parte de YouTube Premium'
  })
})

budgets.saveBudget({
  name: 'Compra y comida fuera', amount: 45000, period: 'monthly',
  startDate: startOfMonth(today()), rollover: false, includeAll: false,
  categoryIds: [pick('Alimentación'), pick('Restaurantes')]
})
budgets.saveBudget({
  name: 'Ocio y caprichos', amount: 15000, period: 'monthly',
  startDate: startOfMonth(today()), rollover: true, includeAll: false,
  categoryIds: [pick('Ocio'), pick('Ropa'), pick('Suscripciones')]
})
budgets.saveBudget({
  name: 'Gasto total del mes', amount: 180000, period: 'monthly',
  startDate: startOfMonth(today()), rollover: false, includeAll: true, categoryIds: []
})

scheduled.saveScheduled({
  name: 'Alquiler', type: 'expense', accountId: bank.id, categoryId: pick('Vivienda'),
  amount: 78000, freq: 'monthly', interval: 1,
  nextDate: addDays(startOfMonth(addMonths(today(), 1)), 0), autoPost: true, payee: 'Casero'
})
scheduled.saveScheduled({
  name: 'Nómina', type: 'income', accountId: bank.id, categoryId: pick('Nómina'),
  amount: 205000, freq: 'monthly', interval: 1,
  nextDate: addDays(startOfMonth(addMonths(today(), 1)), 24), autoPost: true
})
scheduled.saveScheduled({
  name: 'Gimnasio', type: 'expense', accountId: card.id, categoryId: pick('Deporte'),
  amount: 3990, freq: 'monthly', interval: 1,
  nextDate: addDays(today(), 3), autoPost: true, payee: 'Basic Fit'
})

// La principal no es la primera de la lista, para que se note que se respeta.
settings.updateSettings({ defaultAccountId: bank.id })

console.log(`Demo lista en ${target}: ${transactions.countTransactions({})} movimientos`)
closeDatabase()

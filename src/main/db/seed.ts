import type { DatabaseSync } from 'node:sqlite'

const EXPENSE_CATEGORIES: Array<[string, string, string]> = [
  ['Alimentación', 'cart', '#34C759'],
  ['Restaurantes', 'restaurant', '#FF9500'],
  ['Transporte', 'bus', '#5AC8FA'],
  ['Combustible', 'fuel', '#FF6B35'],
  ['Vivienda', 'home', '#AF52DE'],
  ['Suministros', 'bolt', '#FFCC00'],
  ['Telefonía e internet', 'phone', '#00C7BE'],
  ['Salud', 'health', '#FF3B30'],
  ['Ocio', 'fun', '#FF2D55'],
  ['Suscripciones', 'tv', '#BF5AF2'],
  ['Ropa', 'clothes', '#64D2FF'],
  ['Belleza', 'beauty', '#FF6482'],
  ['Deporte', 'sport', '#30D158'],
  ['Educación', 'education', '#0A84FF'],
  ['Viajes', 'travel', '#FF9F0A'],
  ['Regalos', 'gift', '#FF375F'],
  ['Mascotas', 'pet', '#A2845E'],
  ['Impuestos', 'tax', '#8E8E93'],
  ['Seguros', 'shield', '#5E5CE6'],
  ['Otros gastos', 'tag', '#98989D']
]

const INCOME_CATEGORIES: Array<[string, string, string]> = [
  ['Nómina', 'salary', '#34C759'],
  ['Trabajo autónomo', 'tools', '#30D158'],
  ['Inversiones', 'chart', '#0A84FF'],
  ['Alquileres', 'home', '#AF52DE'],
  ['Ventas', 'coins', '#FF9500'],
  ['Reembolsos', 'refund', '#5AC8FA'],
  ['Regalos recibidos', 'gift', '#FF375F'],
  ['Otros ingresos', 'tag', '#98989D']
]

/**
 * Categorías que no se desglosan por notas: la nota de un recibo del alquiler o
 * de la compra semanal no distingue nada. Las demás arrancan con el desglose
 * puesto, y cualquiera puede cambiarlo desde la ficha de la categoría.
 */
const FLAT_CATEGORIES = new Set([
  'Alimentación',
  'Restaurantes',
  'Transporte',
  'Combustible',
  'Vivienda',
  'Nómina'
])

export function seedDefaults(db: DatabaseSync): void {
  const now = new Date().toISOString()

  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
  const defaults: Record<string, string> = {
    baseCurrency: 'EUR',
    defaultAccountId: '',
    showScheduledInList: '0',
    theme: 'system',
    palette: 'grafito',
    startOfWeek: 'monday',
    lockEnabled: '0',
    lockPin: '',
    lockDelaySeconds: '0',
    lastBackupAt: ''
  }
  for (const [key, value] of Object.entries(defaults)) insertSetting.run(key, value)

  const insertCategory = db.prepare(
    'INSERT INTO categories (name, kind, icon, color, sort_order, breakdown_by_note) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const breakdown = (name: string): number => (FLAT_CATEGORIES.has(name) ? 0 : 1)
  EXPENSE_CATEGORIES.forEach(([name, icon, color], i) =>
    insertCategory.run(name, 'expense', icon, color, i, breakdown(name))
  )
  INCOME_CATEGORIES.forEach(([name, icon, color], i) =>
    insertCategory.run(name, 'income', icon, color, i, breakdown(name))
  )

  const insertAccount = db.prepare(
    `INSERT INTO accounts (name, type, currency, initial_balance, icon, color, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  insertAccount.run('Efectivo', 'cash', 'EUR', 0, 'wallet', '#34C759', 0, now)
  insertAccount.run('Cuenta bancaria', 'bank', 'EUR', 0, 'bank', '#0A84FF', 1, now)

  db.prepare('INSERT INTO rates (code, rate, updated_at) VALUES (?, ?, ?)').run('EUR', 1, now)
}

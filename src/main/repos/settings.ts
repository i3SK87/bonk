import { getDb, bind, nowISO } from '../db'
import type { Settings, Rate, ThemeMode, Palette } from '@shared/types'

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as unknown as Array<{
    key: string
    value: string
  }>
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const defaultAccount = Number(map.get('defaultAccountId') || 0)
  return {
    baseCurrency: map.get('baseCurrency') || 'EUR',
    defaultAccountId: defaultAccount > 0 ? defaultAccount : null,
    showScheduledInList: map.get('showScheduledInList') === '1',
    theme: (map.get('theme') as ThemeMode) || 'system',
    palette: (map.get('palette') as Palette) || 'grafito',
    startOfWeek: map.get('startOfWeek') === 'sunday' ? 'sunday' : 'monday',
    startWithWindows: map.get('startWithWindows') === '1',
    closeToTray: map.get('closeToTray') === '1',
    remindersEnabled: map.get('remindersEnabled') === '1',
    lockEnabled: map.get('lockEnabled') === '1',
    lockPin: map.get('lockPin') || null,
    lockDelaySeconds: Number(map.get('lockDelaySeconds') || 0),
    lastBackupAt: map.get('lastBackupAt') || null
  }
}

export function setSetting(key: string, value: string | number | boolean | null): void {
  const stored = typeof value === 'boolean' ? (value ? '1' : '0') : value === null ? '' : String(value)
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, stored)
}

export function updateSettings(patch: Partial<Settings>): Settings {
  for (const [key, value] of Object.entries(patch)) {
    setSetting(key, value as string | number | boolean | null)
  }
  return getSettings()
}

export function listRates(): Rate[] {
  const rows = getDb().prepare('SELECT code, rate, updated_at FROM rates ORDER BY code').all() as unknown as Array<{
    code: string
    rate: number
    updated_at: string
  }>
  return rows.map((r) => ({ code: r.code, rate: r.rate, updatedAt: r.updated_at }))
}

/** Mapa divisa → unidades por 1 unidad de la divisa base, listo para `convert`. */
export function rateMap(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const rate of listRates()) map[rate.code] = rate.rate
  map[getSettings().baseCurrency] = 1
  return map
}

export function setRate(code: string, rate: number): void {
  getDb()
    .prepare(
      `INSERT INTO rates (code, rate, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at`
    )
    .run(code.toUpperCase(), bind(rate) as number, nowISO())
}

export function deleteRate(code: string): void {
  getDb().prepare('DELETE FROM rates WHERE code = ?').run(code.toUpperCase())
}

/**
 * Descarga tipos de cambio del Banco Central Europeo a través de Frankfurter.
 * Es la única llamada a internet de la aplicación y siempre la dispara el usuario.
 */
export async function refreshRates(): Promise<{ updated: number; date: string }> {
  const base = getSettings().baseCurrency
  const codes = listRates()
    .map((r) => r.code)
    .filter((code) => code !== base)
  if (codes.length === 0) return { updated: 0, date: '' }

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${codes.join(',')}`
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`El servicio de tipos respondió ${response.status}`)

  const data = (await response.json()) as { rates?: Record<string, number>; date?: string }
  if (!data.rates) throw new Error('La respuesta del servicio de tipos no traía cotizaciones')

  let updated = 0
  for (const [code, rate] of Object.entries(data.rates)) {
    if (typeof rate === 'number' && rate > 0) {
      setRate(code, rate)
      updated++
    }
  }
  setRate(base, 1)
  return { updated, date: data.date ?? '' }
}

import { getDb, bind, nowISO } from '../db'
import type { Settings, Rate, ThemeMode, Palette } from '@shared/types'

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as unknown as Array<{
    key: string
    value: string
  }>
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    baseCurrency: map.get('baseCurrency') || 'EUR',
    theme: (map.get('theme') as ThemeMode) || 'system',
    palette: (map.get('palette') as Palette) || 'grafito',
    startOfWeek: map.get('startOfWeek') === 'sunday' ? 'sunday' : 'monday',
    startWithWindows: map.get('startWithWindows') === '1',
    closeToTray: map.get('closeToTray') === '1',
    remindersEnabled: map.get('remindersEnabled') === '1',
    lastMonthlySummary: map.get('lastMonthlySummary') || null,
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

function listRates(): Rate[] {
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

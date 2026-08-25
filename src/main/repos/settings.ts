import { getDb, bind, nowISO } from '../db'
import type { Settings, Rate, ThemeMode, Palette, WidgetAnchor } from '@shared/types'

/** Un número guardado como texto, con su valor de partida si no hay nada o no vale. */
function numero(valor: string | undefined, porDefecto: number): number {
  const leido = Number(valor)
  return valor != null && valor !== '' && Number.isFinite(leido) ? leido : porDefecto
}

/**
 * Una lista de ids guardada como texto.
 *
 * Se guarda separada por comas y no como JSON porque la tabla de ajustes es de
 * texto plano y una lista de números no necesita más: partir por comas no puede
 * fallar de formas raras, y un valor corrupto se queda en una lista vacía en vez
 * de reventar al leer los ajustes enteros.
 */
function ids(valor: string | undefined): number[] {
  if (!valor) return []
  return valor
    .split(',')
    .map((trozo) => Number(trozo))
    .filter((id) => Number.isInteger(id) && id > 0)
}

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
    balanceEn: (map.get('balanceEn') as Settings['balanceEn']) || 'porcentaje',
    widgetVisible: map.get('widgetVisible') !== '0',
    widgetAnchor: (map.get('widgetAnchor') as WidgetAnchor) || 'bottomRight',
    widgetX: numero(map.get('widgetX'), 0),
    widgetY: numero(map.get('widgetY'), 0),
    // Ni transparente del todo ni opaco: se ve el escritorio detrás y las cifras
    // siguen leyéndose sin acercarse.
    widgetOpacity: numero(map.get('widgetOpacity'), 0.92),
    widgetOnTop: map.get('widgetOnTop') === '1',
    widgetAccountIds: ids(map.get('widgetAccountIds')),
    lastMonthlySummary: map.get('lastMonthlySummary') || null,
    lastBackupAt: map.get('lastBackupAt') || null
  }
}

export function setSetting(key: string, value: unknown): void {
  const stored =
    typeof value === 'boolean'
      ? value
        ? '1'
        : '0'
      : // Una lista se guarda por sus comas; `String([1,2])` ya da «1,2», pero
        // decirlo aquí evita que un día alguien meta un objeto y se guarde un
        // «[object Object]» sin que nadie se entere.
        Array.isArray(value)
        ? value.join(',')
        : value == null
          ? ''
          : String(value)
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, stored)
}

export function updateSettings(patch: Partial<Settings>): Settings {
  for (const [key, value] of Object.entries(patch)) {
    setSetting(key, value)
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

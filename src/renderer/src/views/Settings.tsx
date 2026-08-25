import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon } from '../components/Icon'
import { Field, Checkbox, Confirm, Segmented } from '../components/ui'
import { ImportModal, type OrigenCsv } from '../components/ImportCsv'
import type { Palette, ThemeMode } from '@shared/types'

/**
 * Las muestras del selector. Cada una enseña los tres tonos que definen la
 * paleta —fondo, tarjeta y acento— para poder elegir sin probarlas todas.
 * Los valores son los mismos que la hoja de estilos, en su versión oscura.
 */
const PALETAS: Array<{ id: Palette; label: string; hint: string; bg: string; card: string; accent: string }> = [
  { id: 'grafito', label: 'Grafito', hint: 'Grises neutros y azul', bg: '#14161a', card: '#1d2027', accent: '#6fb0ff' },
  { id: 'indigo', label: 'Índigo', hint: 'Azul violáceo, más frío', bg: '#151420', card: '#1f1d33', accent: '#a5a0ff' },
  { id: 'marea', label: 'Marea', hint: 'Verde azulado, sobrio', bg: '#0f1918', card: '#182625', accent: '#5fd8c4' },
  { id: 'sepia', label: 'Sepia', hint: 'Cálido, tono papel', bg: '#1a1714', card: '#241f1b', accent: '#e0ac5c' },
  { id: 'ciruela', label: 'Ciruela', hint: 'Vino y rosa', bg: '#1a1218', card: '#241a21', accent: '#f090c4' },
  { id: 'heat', label: 'Heat', hint: 'Los Ángeles de noche', bg: '#0e1418', card: '#162026', accent: '#5fb0d4' },
  { id: 'arasaka', label: 'Arasaka', hint: 'Negro corporativo y rojo', bg: '#0b0c0e', card: '#15171b', accent: '#ff3b47' }
]

const api = window.bonk

export function SettingsView(): ReactNode {
  const { settings, updateSettings, run, toast, refresh, fail } = useStore()
  const [info, setInfo] = useState<{ dataDir: string; dbPath: string; version: string; electron: string; node: string } | null>(null)
  const [importing, setImporting] = useState<OrigenCsv | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    api.db.info().then(setInfo).catch(fail('los datos de la aplicación'))
  }, [settings.baseCurrency])


  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>General</h2>
        </div>
        <div className="card-body col" style={{ gap: 16 }}>
          <div className="grid cols-2">

            <Field label="Primer día de la semana">
              <Segmented
                value={settings.startOfWeek}
                onChange={(value) => updateSettings({ startOfWeek: value })}
                options={[
                  { value: 'monday', label: 'Lunes' },
                  { value: 'sunday', label: 'Domingo' }
                ]}
              />
            </Field>
          </div>

          <div className="divider" />

          <Checkbox
            checked={settings.startWithWindows}
            onChange={(value) => updateSettings({ startWithWindows: value })}
            label="Arrancar con Windows, en la bandeja"
            hint="Arranca sin ventana, como icono junto al reloj. Así las programadas vencidas se registran solas."
          />

          <Checkbox
            checked={settings.closeToTray}
            onChange={(value) => updateSettings({ closeToTray: value })}
            label="Al cerrar la ventana, seguir en la bandeja"
            hint="El aspa esconde la ventana. Para salir del todo, «Salir» en la bandeja o en Archivo."
          />

          <div className="divider" />

          <Checkbox
            checked={settings.remindersEnabled}
            onChange={(value) => updateSettings({ remindersEnabled: value })}
            label="Avisarme el día antes de cada movimiento programado"
            hint="Notificación de Windows con el importe y la cuenta. Hace falta que BONK esté abierta o en la bandeja."
          />


          <div className="row">
            <div className="small muted" style={{ maxWidth: 460 }}>
              Si no ves los avisos, mira el permiso en Windows ▸ Sistema ▸ Notificaciones y el asistente de
              concentración.
            </div>
            <div className="spacer" />
            <button
              className="btn small"
              onClick={async () => {
                const sent = await run(() => api.notifications.test())
                if (sent === false) toast('Este Windows no admite notificaciones', 'error')
              }}
            >
              <Icon name="alert" size={15} />
              Probar el aviso
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Apariencia</h2>
          <span className="small muted">
            El verde y el rojo del dinero no cambian con la paleta: son significado.
          </span>
        </div>
        <div className="card-body col" style={{ gap: 16 }}>
          <Field label="Claro u oscuro">
            <Segmented
              value={settings.theme}
              onChange={(value: ThemeMode) => updateSettings({ theme: value })}
              options={[
                { value: 'light', label: 'Claro' },
                { value: 'dark', label: 'Oscuro' },
                { value: 'system', label: 'Según Windows' }
              ]}
            />
          </Field>

          <Field label="Paleta" hint="Cada una, en claro y en oscuro.">
            <div className="palette-grid">
              {PALETAS.map((item) => (
                <button
                  key={item.id}
                  className={`palette-card${settings.palette === item.id ? ' active' : ''}`}
                  onClick={() => updateSettings({ palette: item.id })}
                  aria-pressed={settings.palette === item.id}
                >
                  <span className="palette-swatch" style={{ background: item.bg }}>
                    <span style={{ background: item.card }} />
                    <span style={{ background: item.accent }} />
                  </span>
                  <span className="palette-name">
                    {item.label}
                    {settings.palette === item.id && <Icon name="check" size={13} strokeWidth={2.4} />}
                  </span>
                  <span className="small subtle">{item.hint}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Datos</h2>
        </div>
        <div className="card-body col" style={{ gap: 14 }}>
          <div className="row wrap">
            <button
              className="btn"
              onClick={async () => {
                const picked = await run(() => api.csv.pick())
                if (picked) setImporting(picked)
              }}
            >
              <Icon name="upload" size={15} />
              Importar CSV
            </button>

            <button
              className="btn"
              onClick={async () => {
                const result = await run(() => api.csv.exportTransactions({}))
                if (result) toast(`${result.count} movimientos exportados`, 'success')
              }}
            >
              <Icon name="download" size={15} />
              Exportar todo a CSV
            </button>

            <button
              className="btn"
              onClick={async () => {
                const path = await run(() => api.db.backup())
                if (path) toast('Copia de seguridad creada', 'success')
              }}
            >
              <Icon name="archive" size={15} />
              Copia de seguridad
            </button>

            <button className="btn" onClick={() => api.db.openFolder()}>
              <Icon name="folder" size={15} />
              Abrir carpeta de datos
            </button>
          </div>

          <p className="small muted">
            Todo se guarda en tu equipo, en un único archivo SQLite. Al cerrar la aplicación se hace una copia
            automática al día y se conservan las diez últimas.
            {settings.lastBackupAt && ` Última copia: ${settings.lastBackupAt.slice(0, 10)}.`}
          </p>

          <div className="divider" />

          <div className="row">
            <div>
              <strong className="small">Vaciar movimientos</strong>
              <div className="small muted">
                Borra todos los movimientos y conserva cuentas, categorías y planes de ahorro.
              </div>
            </div>
            <div className="spacer" />
            <button className="btn danger small" onClick={() => setConfirmClear(true)}>
              Vaciar
            </button>
          </div>
        </div>
      </div>

      {info && (
        <div className="card">
          <div className="card-header">
            <h2>Acerca de</h2>
          </div>
          <div className="card-body small muted col" style={{ gap: 4 }}>
            <div>BONK, versión {info.version}</div>
            <div>Electron {info.electron} · Node {info.node}</div>
          </div>
        </div>
      )}

      {importing && (
        <ImportModal
          source={importing}
          onClose={() => setImporting(null)}
          onDone={async () => {
            setImporting(null)
            await refresh()
          }}
        />
      )}

      {confirmClear && (
        <Confirm
          title="Vaciar todos los movimientos"
          message="Se eliminarán todos los movimientos registrados. Esta acción no se puede deshacer, aunque conservas las copias de seguridad de la carpeta de datos."
          confirmLabel="Vaciar"
          destructive
          onCancel={() => setConfirmClear(false)}
          onConfirm={async () => {
            const count = await run(() => api.db.clearTransactions())
            if (count != null) toast(`${count} movimientos eliminados`, 'success')
            setConfirmClear(false)
          }}
        />
      )}
    </>
  )
}

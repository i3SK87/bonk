import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon } from '../components/Icon'
import { Modal, Field, Checkbox, Confirm, Segmented, AmountInput } from '../components/ui'
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
  { id: 'ciruela', label: 'Ciruela', hint: 'Vino y rosa', bg: '#1a1218', card: '#241a21', accent: '#f090c4' }
]

const api = window.bonk

export function SettingsView(): ReactNode {
  const { settings, updateSettings, run, toast, refresh, fail } = useStore()
  const [info, setInfo] = useState<{ dataDir: string; dbPath: string; version: string; electron: string; node: string } | null>(null)
  const [importing, setImporting] = useState<{ path: string; preview: { headers: string[]; rows: string[][]; total: number } } | null>(null)
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
            hint="Se abre al iniciar sesión pero sin ventana: se queda como icono junto al reloj, y desde ahí la abres cuando la necesitas. Así las programadas vencidas se registran solas aunque no entres."
          />

          <Checkbox
            checked={settings.closeToTray}
            onChange={(value) => updateSettings({ closeToTray: value })}
            label="Al cerrar la ventana, seguir en la bandeja"
            hint="El aspa esconde la ventana en vez de cerrar BONK. Para salir del todo, «Salir» en el menú del icono de la bandeja o en Archivo."
          />

          <div className="divider" />

          <Checkbox
            checked={settings.remindersEnabled}
            onChange={(value) => updateSettings({ remindersEnabled: value })}
            label="Avisarme el día antes de cada movimiento programado"
            hint="Notificación de Windows con el importe y la cuenta. Como las programaciones tienen fecha pero no hora, el aviso llega en cuanto BONK ve que algo vence mañana: hace falta que esté abierta o en la bandeja. Cada programación se puede callar por separado desde su ficha."
          />

          <div className="divider" />

          <Field
            label="Avisarme si la cuenta principal baja de"
            hint="Notificación de Windows y un aviso en Movimientos, mientras dure. Se vuelve a armar solo cuando el saldo remonta. En cero no avisa nunca."
          >
            <div style={{ maxWidth: 220 }}>
              <AmountInput
                value={settings.lowBalanceThreshold}
                currency={settings.baseCurrency}
                onChange={(value) => updateSettings({ lowBalanceThreshold: value })}
              />
            </div>
          </Field>

          <div className="row">
            <div className="small muted" style={{ maxWidth: 460 }}>
              Si no ves los avisos, revisa que BONK tenga permiso en Configuración de Windows ▸ Sistema ▸
              Notificaciones, y que no esté puesto el asistente de concentración.
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

          <Field label="Paleta" hint="Cada una tiene su versión clara y su versión oscura.">
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
                Borra todos los movimientos y conserva cuentas, categorías e hitos de ahorro.
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

function ImportModal({
  source,
  onClose,
  onDone
}: {
  source: { path: string; preview: { headers: string[]; rows: string[][]; total: number } }
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const { toast } = useStore()
  const [createMissing, setCreateMissing] = useState(true)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    createdAccounts: string[]
    createdCategories: string[]
    errors: string[]
  } | null>(null)

  async function start(): Promise<void> {
    setImporting(true)
    try {
      setResult(await api.csv.importFile(source.path, { createMissing }))
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      title="Importar movimientos"
      wide
      onClose={result ? onDone : onClose}
      footer={
        result ? (
          <button className="btn primary" onClick={onDone}>
            Listo
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" onClick={start} disabled={importing}>
              {importing ? 'Importando…' : `Importar ${source.preview.total} filas`}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="col">
          <p>
            <strong>{result.imported}</strong> movimientos importados
            {result.skipped > 0 && `, ${result.skipped} descartados`}.
          </p>
          {result.createdAccounts.length > 0 && (
            <p className="small muted">Cuentas creadas: {result.createdAccounts.join(', ')}</p>
          )}
          {result.createdCategories.length > 0 && (
            <p className="small muted">Categorías creadas: {result.createdCategories.join(', ')}</p>
          )}
          {result.errors.length > 0 && (
            <div>
              <div className="small" style={{ marginBottom: 4 }}>
                Filas con problemas:
              </div>
              <div className="small muted col" style={{ gap: 2, maxHeight: 160, overflowY: 'auto' }}>
                {result.errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="small muted">
            Se han detectado <strong>{source.preview.total}</strong> filas. Reconocemos columnas llamadas Fecha,
            Tipo, Cuenta, Categoría, Importe, Notas y Lugar, tanto en español como en inglés, y también las
            cabeceras que usa la aplicación de Apple.
          </p>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <table className="table">
              <thead>
                <tr>
                  {source.preview.headers.map((header, index) => (
                    <th key={`${header}-${index}`}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {source.preview.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Checkbox
            checked={createMissing}
            onChange={setCreateMissing}
            label="Crear cuentas y categorías que no existan"
            hint="Si lo desactivas, las filas con cuentas desconocidas se descartan."
          />
        </>
      )}
    </Modal>
  )
}

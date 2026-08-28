import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon } from '../components/Icon'
import { Field, Checkbox, Confirm, Segmented, Avatar } from '../components/ui'
import { ImportModal, type OrigenCsv } from '../components/ImportCsv'
import { useActualizacion } from '../lib/actualizacion'
import { today, formatDate } from '@shared/dates'
import type { EstadoActualizacion, Palette, ThemeMode, WidgetAnchor } from '@shared/types'

/** «hoy a las 14:32», o con la fecha escrita si fue otro día. */
function cuando(iso: string): string {
  const fecha = new Date(iso)
  const hora = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  // A mano y no con `toISOString`, que da el día en UTC y de madrugada dice ayer.
  const dia = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
  return dia === today() ? `hoy a las ${hora}` : `el ${formatDate(dia)} a las ${hora}`
}

/**
 * En qué anda el actualizador, en una frase.
 *
 * Aquí sí se cuenta el fallo, con todas sus letras: el aviso de la barra lateral
 * calla cuando algo va mal —quedarse sin internet no es noticia— y este es el
 * sitio al que se viene a preguntar por qué no aparece nada.
 */
function contarActualizacion(estado: EstadoActualizacion): string {
  switch (estado.fase) {
    case 'buscando':
      return 'Mirando si hay una versión nueva…'
    case 'descargando':
      return `Descargando la versión ${estado.version}: ${estado.porcentaje} %.`
    case 'lista':
      return `La versión ${estado.version} ya está descargada. Se instala al reiniciar.`
    case 'error':
      return estado.mensaje ?? 'No se pudo comprobar si hay versiones nuevas.'
    default:
      return estado.comprobadaEn
        ? `Estás en la última versión. Comprobado ${cuando(estado.comprobadaEn)}.`
        : 'Todavía no se ha mirado desde que se abrió la aplicación.'
  }
}

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
  { id: 'arasaka', label: 'Arasaka', hint: 'Negro corporativo y rojo', bg: '#0b0c0e', card: '#15171b', accent: '#ff3b47' },
  { id: 'ghost', label: 'Ghost', hint: 'Violeta de noche y neón aqua', bg: '#12101a', card: '#1c1a26', accent: '#6ae7e6' },
  { id: '2049', label: '2049', hint: 'Azul profundo y violeta', bg: '#070919', card: '#0f1730', accent: '#e07ac0' }
]


/**
 * Las nueve esquinas, en el orden en que se dibujan: tres filas de tres.
 *
 * La rejilla es el mando: se pulsa la esquina donde se quiere y ya está. Un
 * desplegable con «arriba a la izquierda» y ocho más obliga a leer nueve
 * frases para elegir un sitio que se señala con el dedo.
 */
const ANCLAS: WidgetAnchor[][] = [
  ['topLeft', 'top', 'topRight'],
  ['left', 'center', 'right'],
  ['bottomLeft', 'bottom', 'bottomRight']
]

const NOMBRE_DE_ANCLA: Record<WidgetAnchor, string> = {
  topLeft: 'Arriba a la izquierda',
  top: 'Arriba en el centro',
  topRight: 'Arriba a la derecha',
  left: 'A la izquierda',
  center: 'En el centro',
  right: 'A la derecha',
  bottomLeft: 'Abajo a la izquierda',
  bottom: 'Abajo en el centro',
  bottomRight: 'Abajo a la derecha'
}

const api = window.bonk

export function SettingsView(): ReactNode {
  const { settings, accounts, updateSettings, run, toast, refresh, fail } = useStore()
  const [info, setInfo] = useState<{ dataDir: string; dbPath: string; version: string; electron: string; node: string } | null>(null)
  const [importing, setImporting] = useState<OrigenCsv | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const actualizacion = useActualizacion()

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
          <h2>Widget del escritorio</h2>
          <span className="small muted">El patrimonio a la vista sin abrir la aplicación.</span>
        </div>
        <div className="card-body col" style={{ gap: 14 }}>
          <Checkbox
            checked={settings.widgetVisible}
            onChange={(value) => updateSettings({ widgetVisible: value })}
            label="Enseñarlo en el escritorio"
            hint="Se arrastra para colocarlo y con doble clic abre BONK."
          />

          {settings.widgetVisible && (
            <>
              <Field label="Dónde" hint="La esquina de la pantalla donde se planta.">
                <div className="anclas">
                  {ANCLAS.map((fila, y) =>
                    fila.map((ancla, x) => (
                      <button
                        key={`${y}-${x}`}
                        type="button"
                        className={`ancla${settings.widgetAnchor === ancla ? ' active' : ''}`}
                        onClick={() => updateSettings({ widgetAnchor: ancla })}
                        title={NOMBRE_DE_ANCLA[ancla]}
                        aria-label={NOMBRE_DE_ANCLA[ancla]}
                      />
                    ))
                  )}
                </div>
              </Field>

              {/*
                Opacidad y no transparencia.
                
                El mando enseñaba el porcentaje de transparencia mientras el
                tirador iba por la opacidad, así que la cifra y el relleno decían
                cosas contrarias: al 92 % de opacidad, el tirador casi a tope y el
                rótulo diciendo «8 %». Ahora la cifra es la del tirador: a la
                izquierda menos, a la derecha más, y del todo a la derecha es
                opaco. No baja del veinte porque por debajo no se ve ni se puede
                agarrar.
              */}
              <Field
                label={`Opacidad · ${Math.round(settings.widgetOpacity * 100)}%`}
                hint="A la izquierda se ve más el escritorio; a la derecha, más la tarjeta."
              >
                <input
                  type="range"
                  className="deslizador"
                  min={20}
                  max={100}
                  step={5}
                  value={Math.round(settings.widgetOpacity * 100)}
                  onChange={(event) =>
                    updateSettings({ widgetOpacity: Number(event.target.value) / 100 })
                  }
                />
              </Field>

              <Checkbox
                checked={settings.widgetGris}
                onChange={(value) => updateSettings({ widgetGris: value })}
                label="En escala de grises"
                hint="Apaga el color de las cuentas y de las cifras: menos ruido sobre un escritorio con dibujo."
              />

              <Checkbox
                checked={settings.widgetOnTop}
                onChange={(value) => updateSettings({ widgetOnTop: value })}
                label="Por delante de las ventanas"
                hint="Apagado se queda en el orden normal: se ve mientras el escritorio esté a la vista."
              />

              <Field
                label="Qué cuentas enseña"
                hint="Sin marcar ninguna salen todas. El patrimonio de arriba las cuenta todas igual."
              >
                <div className="chip-row">
                  {accounts.map((account) => {
                    const puesta =
                      settings.widgetAccountIds.length === 0 ||
                      settings.widgetAccountIds.includes(account.id)
                    return (
                      <button
                        key={account.id}
                        type="button"
                        className={`btn small${puesta ? ' primary' : ''}`}
                        onClick={() => {
                          /*
                           * La lista vacía es «todas», así que la primera vez que
                           * se quita una hay que escribir las demás: si no,
                           * quitar una de dos dejaría la lista vacía y volverían
                           * a salir las dos.
                           */
                          const actuales =
                            settings.widgetAccountIds.length === 0
                              ? accounts.map((item) => item.id)
                              : settings.widgetAccountIds
                          const siguiente = actuales.includes(account.id)
                            ? actuales.filter((id) => id !== account.id)
                            : [...actuales, account.id]
                          updateSettings({
                            // Todas marcadas vuelve a ser «todas», que es lo que
                            // deja el widget al día si mañana creas una cuenta.
                            widgetAccountIds: siguiente.length === accounts.length ? [] : siguiente
                          })
                        }}
                      >
                        <Avatar icon={account.icon} color={account.color} size="small" />
                        {account.name}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </>
          )}
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
          <div className="card-body col" style={{ gap: 14 }}>
            <div className="small muted col" style={{ gap: 4 }}>
              <div>BONK, versión {info.version}</div>
              <div>Electron {info.electron} · Node {info.node}</div>
            </div>

            <div className="divider" />

            <Checkbox
              checked={settings.buscarActualizaciones}
              onChange={(value) => updateSettings({ buscarActualizaciones: value })}
              label="Buscar versiones nuevas"
              hint="Al abrir y una vez al día. Es lo único que hace BONK por internet; apagado no se conecta a nada."
            />

            <div className="row">
              <div className="small muted" style={{ maxWidth: 460 }}>
                {contarActualizacion(actualizacion)}
              </div>
              <div className="spacer" />
              {actualizacion.fase === 'lista' ? (
                <button className="btn primary small" onClick={() => setReiniciando(true)}>
                  Reiniciar e instalar
                </button>
              ) : (
                <button
                  className="btn small"
                  disabled={actualizacion.fase === 'buscando' || actualizacion.fase === 'descargando'}
                  onClick={() => run(() => api.updates.buscar())}
                >
                  Buscar ahora
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {reiniciando && (
        <Confirm
          title="Reiniciar para actualizar"
          message={`BONK se cerrará y volverá a abrirse en la versión ${actualizacion.version}. Tus datos no se tocan.`}
          confirmLabel="Reiniciar"
          onCancel={() => setReiniciando(false)}
          onConfirm={async () => {
            const hecho = await run(() => api.updates.instalar())
            if (!hecho) setReiniciando(false)
          }}
        />
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

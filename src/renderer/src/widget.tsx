/**
 * El widget del escritorio.
 *
 * Un árbol de React aparte del de la aplicación: comparte la hoja de estilos y
 * el puente, y nada más. Meterlo dentro del otro habría obligado a que el
 * almacén, las nueve pantallas y sus formularios viajaran a una ventana que solo
 * enseña cifras.
 *
 * Se pinta con los mismos tokens, así que la paleta y el tema los hereda sin
 * saber nada de ellos: el atributo en la raíz y a pintar.
 *
 * No se arrastra. Se colocó así un tiempo y no aportaba nada frente a decir la
 * esquina en Ajustes, y a cambio la tarjeta tenía que quedarse con el ratón para
 * poder moverse. Lo único que se le pulsa es el doble clic, que abre BONK.
 */
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Avatar } from './components/ui'
import { esOscuro } from './lib/tema'
import { formatMoney } from '@shared/money'
import type { AccountWithBalance, Settings } from '@shared/types'
import './styles.css'

const api = window.bonk

function Widget(): React.ReactNode {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const caja = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    try {
      const [ajustes, cuentas] = await Promise.all([api.settings.get(), api.accounts.withBalance()])
      setSettings(ajustes)
      setAccounts(cuentas)
    } catch {
      // Sin datos no se pinta nada: mejor un hueco vacío en el escritorio que
      // un recuadro con un error que nadie va a leer ahí.
    }
  }, [])

  useEffect(() => {
    cargar()
    const off = api.events.on('data:changed', cargar)
    const offAjustes = api.events.on('settings:changed', (detail) => {
      setSettings(detail as Settings)
    })
    return () => {
      off()
      offAjustes()
    }
  }, [cargar])

  // El tema y la paleta, en la raíz: de ahí cuelgan todas las variables de color.
  useEffect(() => {
    if (!settings) return
    const raiz = document.documentElement
    raiz.setAttribute('data-theme', esOscuro(settings.theme) ? 'dark' : 'light')
    raiz.setAttribute('data-palette', settings.palette)
    // Con el acrílico de Windows detrás, la tarjeta no dibuja ni margen ni sombra.
    if (settings.widgetAcrilico) raiz.setAttribute('data-acrilico', '')
    else raiz.removeAttribute('data-acrilico')
  }, [settings])

  /*
   * La ventana se estira a lo que mida la tarjeta.
   *
   * Con una altura fija, marcar tres cuentas más dejaba la última cortada y
   * desmarcarlas todas dejaba medio recuadro vacío. Se mide lo pintado y se le
   * dice al proceso principal, que es el único que puede tocar la ventana.
   */
  useEffect(() => {
    const nodo = caja.current
    if (!nodo) return
    /*
     * La tarjeta con sus márgenes, y no el documento.
     *
     * `scrollHeight` parecía lo suyo y es una trampa: nunca baja del alto de la
     * ventana, así que la medida arrastraba lo que ya medía la ventana y esta
     * solo podía crecer. Quitando una cuenta se quedaba con el hueco de la que
     * ya no estaba.
     */
    const medir = (): void => {
      const rect = nodo.getBoundingClientRect()
      const estilo = getComputedStyle(nodo)
      const alto =
        rect.height + parseFloat(estilo.marginTop || '0') + parseFloat(estilo.marginBottom || '0')
      api.widget.resize(Math.ceil(alto)).catch(() => undefined)
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [settings, accounts])

  if (!settings) return null

  /*
   * Las cuentas elegidas, y todas si no se ha elegido ninguna.
   *
   * Una lista vacía es «no he tocado esto», no «ninguna»: un widget vacío no
   * dice nada y el que lo estrena no ha marcado nada todavía.
   */
  const elegidas = settings.widgetAccountIds
  const visibles = accounts.filter((cuenta) => elegidas.length === 0 || elegidas.includes(cuenta.id))

  /*
   * Con una sola cuenta se enseña su saldo, no el patrimonio.
   *
   * El patrimonio de una sola cuenta es un titular que no viene a cuento:
   * eligiendo la hucha, lo que se quiere ver es lo que hay en la hucha, y salía
   * el total de todo con el nombre de la hucha al lado. El patrimonio es una
   * suma, así que solo sale cuando hay algo que sumar.
   */
  const unica = visibles.length === 1 ? visibles[0] : null

  const patrimonio = accounts
    .filter((cuenta) => !cuenta.excludeFromTotal)
    .reduce((suma, cuenta) => suma + cuenta.balanceInBase, 0)

  const cifra = unica ? unica.balance : patrimonio
  const divisa = unica ? unica.currency : settings.baseCurrency
  const tono = cifra > 0 ? 'positive' : cifra < 0 ? 'negative' : 'neutral'

  /*
   * Lo que se aclara es el fondo, no el contenido.
   *
   * Va en línea y no en la hoja porque es un número que se mueve con un mando;
   * el resto de la tarjeta se sigue vistiendo desde la hoja como todo lo demás.
   */
  const alfa = Math.round(Math.min(1, Math.max(0.2, settings.widgetOpacity)) * 100)

  return (
    <div
      ref={caja}
      className={`widget${settings.widgetGris ? ' gris' : ''}`}
      style={{ background: `color-mix(in srgb, var(--bg-elevated) ${alfa}%, transparent)` }}
      onDoubleClick={() => api.widget.open()}
      title="Doble clic para abrir BONK"
    >
      {unica ? (
        <div className="widget-unica">
          {/* La cifra manda y va primero; de quién es se dice después, al otro
              lado de la raya. Es el reparto de la cabecera de Movimientos: el
              dinero a la izquierda y la cuenta a la derecha. */}
          <span className={`widget-total amount ${tono}`}>{formatMoney(cifra, divisa)}</span>
          <span className="divider vertical" />
          <span className="widget-suya">
            <Avatar icon={unica.icon} color={unica.color} size="small" />
            <span className="nombre truncate">{unica.name}</span>
          </span>
        </div>
      ) : (
        <>
          <div className="widget-rotulo">Patrimonio</div>
          <div className={`widget-total amount ${tono}`}>{formatMoney(cifra, divisa)}</div>

          {visibles.length > 0 && (
            <div className="widget-cuentas">
              {visibles.map((cuenta) => (
                <div key={cuenta.id} className="widget-cuenta">
                  <Avatar icon={cuenta.icon} color={cuenta.color} size="small" />
                  <span className="truncate">{cuenta.name}</span>
                  <span
                    className={`amount ${
                      cuenta.balance > 0 ? 'positive' : cuenta.balance < 0 ? 'negative' : 'neutral'
                    }`}
                  >
                    {formatMoney(cuenta.balance, cuenta.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Widget />
  </StrictMode>
)

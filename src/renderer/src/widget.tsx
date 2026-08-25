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
    // Con el acrílico de Windows detrás, la tarjeta no dibuja fondo ni sombra.
    if (settings.widgetBlur) raiz.setAttribute('data-esmerilado', '')
    else raiz.removeAttribute('data-esmerilado')
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
     * ya no estaba, y un arrastre le sumaba unos píxeles cada vez.
     *
     * La tarjeta sí se mide sola, pero `getBoundingClientRect` no cuenta sus
     * márgenes —los diez píxeles de aire que necesita la sombra—, así que se le
     * suman a mano.
     */
    const medir = (): void => {
      const caja = nodo.getBoundingClientRect()
      const estilo = getComputedStyle(nodo)
      const alto =
        caja.height + parseFloat(estilo.marginTop || '0') + parseFloat(estilo.marginBottom || '0')
      api.widget.resize(Math.ceil(alto)).catch(() => undefined)
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [settings, accounts])

  /*
   * Arrastrar la tarjeta mueve la ventana.
   *
   * A mano y no con `-webkit-app-region: drag`, que se come todos los eventos de
   * la zona que arrastra: con él no habría ni doble clic para abrir la
   * aplicación ni menú del botón derecho. Se captura el puntero para que el
   * arrastre siga aunque el ratón se salga de la ventana, que al mover algo de
   * doscientos píxeles pasa todo el rato.
   */
  const arrastre = useRef<{ x: number; y: number } | null>(null)

  const empezarArrastre = async (evento: React.PointerEvent<HTMLDivElement>): Promise<void> => {
    if (evento.button !== 0) return
    /*
     * El elemento se guarda antes de esperar.
     *
     * React reutiliza el objeto del evento en cuanto el manejador devuelve, y
     * `currentTarget` se queda a nulo: tras el `await` reventaba al pedir la
     * captura del puntero. Sin captura, el arrastre se paraba en cuanto el ratón
     * salía de la ventana, que moviendo algo de doscientos píxeles es siempre.
     */
    const tarjeta = evento.currentTarget
    const puntero = evento.pointerId
    const pantalla = { x: evento.screenX, y: evento.screenY }

    const marco = await api.widget.bounds()
    if (!marco) return
    // Dónde se agarró la tarjeta, para que no dé un salto al primer movimiento.
    arrastre.current = { x: pantalla.x - marco.x, y: pantalla.y - marco.y }
    try {
      tarjeta.setPointerCapture(puntero)
    } catch {
      // El puntero ya se ha soltado: el arrastre fue tan corto que terminó antes
      // de que llegara la respuesta. No hay nada que capturar ni nada que hacer.
    }
  }

  const seguirArrastre = (evento: React.PointerEvent<HTMLDivElement>): void => {
    const agarre = arrastre.current
    if (!agarre) return
    api.widget.move(evento.screenX - agarre.x, evento.screenY - agarre.y).catch(() => undefined)
  }

  const soltarArrastre = (evento: React.PointerEvent<HTMLDivElement>): void => {
    if (!arrastre.current) return
    arrastre.current = null
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId)
    }
  }

  if (!settings) return null

  const divisa = settings.baseCurrency
  /*
   * Las cuentas elegidas, y todas si no se ha elegido ninguna.
   *
   * Una lista vacía es «no he tocado esto», no «ninguna»: un widget vacío no
   * dice nada y el que lo estrena no ha marcado nada todavía.
   */
  const elegidas = settings.widgetAccountIds
  const visibles = accounts.filter(
    (cuenta) => elegidas.length === 0 || elegidas.includes(cuenta.id)
  )
  /*
   * El patrimonio, con el mismo criterio que la aplicación.
   *
   * Cuenta todas las que no estén apartadas del total, no solo las que se
   * enseñan: elegir qué cuentas se ven no puede cambiar cuánto tienes.
   */
  const patrimonio = accounts
    .filter((cuenta) => !cuenta.excludeFromTotal)
    .reduce((suma, cuenta) => suma + cuenta.balanceInBase, 0)

  /*
   * Con una sola cuenta, la cifra no se dice dos veces.
   *
   * El patrimonio y su saldo son el mismo número, y repetirlo con una raya en
   * medio hace pensar que son dos cosas distintas. Se pone su nombre al lado del
   * rótulo y se queda una sola cifra.
   *
   * Solo cuando de verdad coinciden: enseñando una cuenta de tres, el total no es
   * su saldo y las dos cifras cuentan cosas distintas.
   */
  const unica =
    visibles.length === 1 && visibles[0].balanceInBase === patrimonio ? visibles[0] : null

  return (
    <div
      ref={caja}
      className="widget"
      onPointerDown={empezarArrastre}
      onPointerMove={seguirArrastre}
      onPointerUp={soltarArrastre}
      onPointerCancel={soltarArrastre}
      onDoubleClick={() => api.widget.open()}
      title="Arrastra para moverlo · doble clic para abrir BONK"
    >
      <div className="widget-rotulo">
        {unica ? (
          <>
            <Avatar icon={unica.icon} color={unica.color} size="small" />
            <span className="nombre truncate">{unica.name}</span>
          </>
        ) : (
          'Patrimonio'
        )}
      </div>
      <div
        className={`widget-total amount ${
          patrimonio > 0 ? 'positive' : patrimonio < 0 ? 'negative' : ''
        }`}
      >
        {formatMoney(patrimonio, divisa)}
      </div>

      {!unica && visibles.length > 0 && (
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
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Widget />
  </StrictMode>
)

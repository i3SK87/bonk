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
import { useContador } from './lib/contador'
import { formatMoney } from '@shared/money'
import type { AccountWithBalance, Settings } from '@shared/types'
import './styles.css'

const api = window.bonk

function Widget(): React.ReactNode {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  /*
   * Cuántas veces han cambiado los datos, que es lo que dispara el conteo de la
   * cifra. Aquí no hay almacén del que sacarlo: el widget se entera de que ha
   * pasado algo por el aviso del proceso principal, así que se cuenta a mano.
   * La primera carga no lo sube, y por eso al abrirlo la cifra sale puesta en
   * vez de contando desde cero.
   */
  const [revision, setRevision] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  /** La última medida que se le mandó a la ventana, y el encogimiento en cola. */
  const enviado = useRef({ alto: 0, ancho: 0 })
  const pendiente = useRef<number | null>(null)
  /**
   * La primera medida después de cambiar lo que se enseña no espera a nadie.
   *
   * El respiro de abajo es para el conteo de la cifra, que cambia de ancho
   * varias veces por segundo. Pero al cambiar de cuentas no hay conteo: la
   * tarjeta pasa de una forma a otra de golpe, y aplazar el encogimiento dejaba
   * la ventana grande un cuarto de segundo con la tarjeta pequeña dentro. Como
   * va anclada a una esquina, la tarjeta se veía descolocada y luego pegaba un
   * salto hasta su sitio. Eso es lo que hacía el widget al cambiar de cuenta.
   */
  const inmediato = useRef(true)

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
    const off = api.events.on('data:changed', () => {
      setRevision((valor) => valor + 1)
      cargar()
    })
    /*
     * Un ajuste también puede cambiar la cifra, y sin que se haya movido nada:
     * marcar otra cuenta cambia de patrimonio a saldo, y la divisa base
     * reconvierte todos los saldos. Así que se recarga entero —los ajustes y
     * las cuentas, que el aviso no las trae—, pero sin subir la revisión: eso
     * es lo que dispara el conteo, y aquí la cifra tiene que ponerse de golpe.
     * Contar del saldo de una cuenta al de otra no dice nada; solo parece que
     * ha entrado dinero.
     */
    const offAjustes = api.events.on('settings:changed', () => {
      cargar()
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
  }, [settings])

  /*
   * La ventana se estira a lo que mida la tarjeta, de alto y de ancho.
   *
   * Con una altura fija, marcar tres cuentas más dejaba la última cortada y
   * desmarcarlas todas dejaba medio recuadro vacío. Y con un ancho fijo pasaba
   * lo propio de lado: una cuenta con cuatro cifras dejaba media tarjeta en
   * blanco y un patrimonio largo se quedaba sin sitio. Se mide lo pintado y se
   * le dice al proceso principal, que es el único que puede tocar la ventana.
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
      const alto = Math.ceil(
        rect.height + parseFloat(estilo.marginTop || '0') + parseFloat(estilo.marginBottom || '0')
      )
      const ancho = Math.ceil(
        rect.width + parseFloat(estilo.marginLeft || '0') + parseFloat(estilo.marginRight || '0')
      )

      const mandar = (): void => {
        pendiente.current = null
        enviado.current = { alto, ancho }
        api.widget.resize(alto, ancho).catch(() => undefined)
      }

      if (pendiente.current != null) {
        clearTimeout(pendiente.current)
        pendiente.current = null
      }
      /*
       * Crece al momento y encoge con un respiro.
       *
       * Desde que la cifra cuenta hasta su nuevo valor, su ancho cambia varias
       * veces por segundo mientras dura el conteo —al cruzar el millar aparece
       * un punto de más—, y cada cambio llegaba aquí. Recolocar la ventana en
       * cada cuadro no es solo trabajo de más: el widget va anclado a una
       * esquina, así que al ensanchar se mueve el otro canto y se veía temblar
       * el borde mientras el número corría.
       *
       * Crecer no se puede aplazar, que la cifra se quedaría cortada media
       * pantalla. Encoger sí: nadie nota un cuarto de segundo de aire de más, y
       * con eso todo el conteo cabe en un solo respiro. Al terminar se manda la
       * medida buena y ya está.
       */
      if (inmediato.current) {
        inmediato.current = false
        if (alto !== enviado.current.alto || ancho !== enviado.current.ancho) mandar()
      } else if (alto > enviado.current.alto || ancho > enviado.current.ancho) mandar()
      else if (alto !== enviado.current.alto || ancho !== enviado.current.ancho) {
        pendiente.current = window.setTimeout(mandar, 260)
      }
    }
    // Lo que ha cambiado son los ajustes o las cuentas, no la cifra corriendo:
    // esta medida va tal cual, sin el respiro.
    inmediato.current = true
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(nodo)
    return () => {
      observador.disconnect()
      if (pendiente.current != null) clearTimeout(pendiente.current)
    }
  }, [settings, accounts])

  /*
   * Las cuentas elegidas, y todas si no se ha elegido ninguna.
   *
   * Una lista vacía es «no he tocado esto», no «ninguna»: un widget vacío no
   * dice nada y el que lo estrena no ha marcado nada todavía.
   *
   * Todo esto se calcula antes del corte de abajo, y no después como estaba,
   * porque de la cifra cuelga un hook —el conteo— y un hook no puede vivir
   * detrás de un `return`: en el primer pintado, sin ajustes todavía, no se
   * llegaría a él, y React cuenta los de cada vuelta. Sin ajustes las listas
   * están vacías y la cifra es cero, que es justo lo que hay que enseñar
   * mientras no haya nada.
   */
  const elegidas = settings?.widgetAccountIds ?? []
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
  /*
   * La cifra sube o baja contando, igual que en la aplicación: aquí es donde
   * más se agradece, que el widget está en el escritorio para mirarlo de reojo
   * y lo que se ve por el rabillo del ojo es el movimiento, no el número.
   *
   * La primera carga no sube la revisión, así que al abrirlo la cifra sale
   * puesta y no contando desde cero.
   */
  const contada = useContador(cifra, revision)

  if (!settings) return null

  const divisa = unica ? unica.currency : settings.baseCurrency
  // El tono lo pone la cifra de verdad y no la del conteo: pasar de verde a
  // rojo y volver mientras baja diría cosas que no son.
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
          <span className={`widget-total amount ${tono}`}>{formatMoney(contada, divisa)}</span>
          <span className="divider vertical" />
          <span className="widget-suya">
            <Avatar icon={unica.icon} color={unica.color} size="small" />
            <span className="nombre truncate">{unica.name}</span>
          </span>
        </div>
      ) : (
        <>
          <div className="widget-rotulo">Patrimonio</div>
          <div className={`widget-total amount ${tono}`}>{formatMoney(contada, divisa)}</div>

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

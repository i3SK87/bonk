/**
 * El widget del escritorio: el patrimonio de un vistazo sin abrir nada.
 *
 * Es una segunda ventana, sin marco y transparente, que vive mientras viva la
 * aplicación. No es un widget de Windows de verdad —para pegarlo a la capa del
 * escritorio haría falta reparentarlo al `WorkerW` con llamadas nativas, y esta
 * aplicación no tiene ni quiere dependencias nativas—, así que «detrás» es una
 * ventana normal en el orden de siempre: se ve mientras el escritorio esté a la
 * vista y Win+D la esconde con todo lo demás.
 *
 * De colocarlo se encarga este módulo entero. La ventana solo pinta: no sabe en
 * qué pantalla está ni cuánto mide el área útil, y no debe saberlo.
 */
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getSettings } from './repos/settings'
import type { WidgetAnchor } from '@shared/types'

/*
 * Lo que mide, en píxeles de escritorio. La ventana se ajusta a su contenido,
 * a lo alto y a lo ancho.
 *
 * A lo ancho iba fija en 260 y era una talla prestada: con una sola cuenta y
 * una cifra corta sobraba media tarjeta, y un patrimonio de siete dígitos con
 * el nombre de la cuenta al lado se quedaba sin sitio. Los topes están para que
 * ni desaparezca ni se convierta en una barra de lado a lado.
 */
const ANCHO_MINIMO = 170
const ANCHO_MAXIMO = 460
const ALTO_MINIMO = 96
/** Aire entre el widget y el canto de la pantalla, para que no quede pegado. */
const MARGEN = 18

let widget: BrowserWindow | null = null

export function widgetWindow(): BrowserWindow | null {
  return widget && !widget.isDestroyed() ? widget : null
}

/**
 * Dónde cae el widget según su ancla, contra el área útil de la pantalla.
 *
 * El área útil y no la pantalla entera: así no se mete debajo de la barra de
 * tareas, que es donde acaba todo lo que se coloca contra los bordes de verdad.
 */
function sitioDe(anchor: WidgetAnchor, ancho: number, alto: number): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  const izquierda = workArea.x + MARGEN
  const derecha = workArea.x + workArea.width - ancho - MARGEN
  const centroX = Math.round(workArea.x + (workArea.width - ancho) / 2)
  const arriba = workArea.y + MARGEN
  const abajo = workArea.y + workArea.height - alto - MARGEN
  const centroY = Math.round(workArea.y + (workArea.height - alto) / 2)

  switch (anchor) {
    case 'topLeft':
      return { x: izquierda, y: arriba }
    case 'top':
      return { x: centroX, y: arriba }
    case 'topRight':
      return { x: derecha, y: arriba }
    case 'left':
      return { x: izquierda, y: centroY }
    case 'center':
      return { x: centroX, y: centroY }
    case 'right':
      return { x: derecha, y: centroY }
    case 'bottomLeft':
      return { x: izquierda, y: abajo }
    case 'bottom':
      return { x: centroX, y: abajo }
    default:
      return { x: derecha, y: abajo }
  }
}

/**
 * Lo devuelve a la pantalla si su esquina ya no existe.
 *
 * Con dos pantallas, desenchufar la segunda deja el widget en unas coordenadas
 * que ya no están: la ventana viva, ocupando memoria y sin verse por ninguna
 * parte. Como las esquinas se recalculan en cada colocación, basta con no dejar
 * que el resultado se salga.
 */
function dentroDeLaPantalla(x: number, y: number, ancho: number): { x: number; y: number } {
  const cerca = screen.getDisplayNearestPoint({ x, y }).workArea
  const visible = 60
  return {
    x: Math.min(Math.max(x, cerca.x - ancho + visible), cerca.x + cerca.width - visible),
    y: Math.min(Math.max(y, cerca.y), cerca.y + cerca.height - visible)
  }
}

/*
 * Todo se mide y se coloca por el contenido, nunca por el marco.
 *
 * Aunque la ventana no tenga marco, Windows le guarda unos píxeles alrededor y
 * `getBounds` los cuenta: leer de ahí un alto y volver a escribirlo con
 * `setBounds` le sumaba ocho a la ventana en cada vuelta, así que cada arrastre
 * la estiraba un poco más. `getContentBounds` y `setContentBounds` hablan de lo
 * mismo que mide la página, y así lo que se lee y lo que se escribe cuadran.
 */

/** Coloca, estira y pone la transparencia y la capa según los ajustes. */
export function colocarWidget(alto?: number, ancho?: number): void {
  const win = widgetWindow()
  if (!win) return
  const settings = getSettings()
  const puesto = win.getContentBounds()
  const altura = Math.max(ALTO_MINIMO, Math.round(alto ?? puesto.height))
  /*
   * El ancho se recorta a los topes aquí y no en la página.
   *
   * La página mide lo que ocupa su contenido sin saber en qué pantalla está;
   * decidir si eso cabe es de este lado, que es el que conoce el área útil.
   */
  const anchura = Math.min(
    ANCHO_MAXIMO,
    Math.max(ANCHO_MINIMO, Math.round(ancho ?? puesto.width))
  )

  const esquina = sitioDe(settings.widgetAnchor, anchura, altura)
  const sitio = dentroDeLaPantalla(esquina.x, esquina.y, anchura)

  win.setContentBounds({ ...sitio, width: anchura, height: altura })
  /*
   * La ventana, siempre opaca.
   *
   * Lo que se aclara es el fondo de la tarjeta, que lo pinta la página. Con
   * `setOpacity` se desvanecía la ventana entera y con ella las cifras y los
   * iconos: el icono blanco de una cuenta se perdía contra el escritorio mucho
   * antes que el cristal.
   */
  win.setOpacity(1)
  /*
   * `screen-saver` y no `normal`: por encima de las ventanas normales hay más
   * capas —barras de tareas de terceros, superposiciones— y en la de siempre el
   * widget acababa tapado por cosas que el usuario no considera ventanas.
   */
  win.setAlwaysOnTop(settings.widgetOnTop, 'screen-saver')
}

export function createWidget(isDev: boolean): void {
  if (widgetWindow()) return

  /*
   * Transparente: la ventana desaparece y solo se ve la tarjeta redondeada que
   * pinta la página, con su sombra.
   *
   * Se probó dos veces el acrílico de Windows —`backgroundMaterial`, que es lo
   * único que desenfoca de verdad el escritorio— y las dos se descartó: lo
   * rellena el sistema en la ventana entera, así que la tarjeta deja de ser una
   * tarjeta y pasa a ser el rectángulo de la ventana, sin margen ni sombra. Que
   * quede escrito para no volver a intentarlo una tercera.
   */
  widget = new BrowserWindow({
    width: ANCHO_MINIMO,
    height: ALTO_MINIMO,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    // Ni en la barra de tareas ni en Alt+Tab: no es una ventana a la que se
    // vuelva, es algo que está ahí puesto.
    skipTaskbar: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    // Sin sombra: la dibuja Windows por fuera del contenido y en una ventana
    // transparente sale un recuadro gris alrededor de nada.
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  widget.setMenu(null)

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    widget.loadURL(`${process.env.ELECTRON_RENDERER_URL}/widget.html`)
  } else {
    widget.loadFile(join(__dirname, '../renderer/widget.html'))
  }

  /*
   * Se enseña cuando ya está pintado y colocado.
   *
   * Enseñándola antes se ve un recuadro negro en mitad de la pantalla mientras
   * carga, y luego un salto hasta su esquina.
   */
  widget.once('ready-to-show', () => {
    colocarWidget()
    widget?.showInactive()
  })

  widget.on('closed', () => {
    widget = null
  })
}

export function destroyWidget(): void {
  widgetWindow()?.destroy()
  widget = null
}

/** Lo enciende o lo apaga según lo que digan los ajustes ahora mismo. */
export function sincronizarWidget(isDev: boolean): void {
  if (!getSettings().widgetVisible) {
    destroyWidget()
    return
  }
  if (widgetWindow()) colocarWidget()
  else createWidget(isDev)
}

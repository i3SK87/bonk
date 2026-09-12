/**
 * El menú del clic derecho.
 *
 * Sale donde está el puntero y lleva las dos o tres cosas que se hacen a diario
 * sobre una fila. La ficha completa sigue estando a un clic izquierdo: esto es
 * el atajo, no su sustituto.
 *
 * Va por un portal a la raíz por lo mismo que el calendario: el velo de los
 * formularios lleva desenfoque, y un desenfoque hace que lo de dentro se
 * posicione contra él en vez de contra la ventana. Colgando de la fila, además,
 * una fila con `overflow` lo recortaría.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface OpcionMenu {
  etiqueta: string
  /**
   * Sin icono se le guarda el hueco, para que las etiquetas queden alineadas
   * con la que lleva la marca de `marcada`.
   */
  icono?: string
  /** La que está puesta, con la marca delante: para menús que eligen entre varias. */
  marcada?: boolean
  /** Una aclaración pequeña al otro lado, como «el mes pasado». */
  pista?: string
  onElegir: () => void
  /** En rojo y separada del resto: borrar no se pulsa sin querer. */
  peligrosa?: boolean
}

/** Cuánto se le deja al menú respirar contra el borde de la ventana. */
const MARGEN = 8

/**
 * El clic que cierra el menú no cuenta para nada más.
 *
 * Cerrar va por `pointerdown`, pero el `click` que viene detrás es otro evento
 * y llegaba entero a lo que hubiera debajo: cerrar el menú sobre una fila abría
 * su ficha de paso. Aquí se le pone un cepo de un solo uso al siguiente clic,
 * como hacen los menús de Windows: el primero cierra y el segundo ya actúa.
 *
 * El cepo no puede colgar del efecto del menú: al cerrarse se desmonta y su
 * limpieza lo quitaría antes de que el clic llegue. Vive aquí fuera y se retira
 * solo, o en cuanto empieza otra pulsación — si aquella no acabó en clic (se
 * soltó fuera de la ventana), el cepo se habría quedado esperando al inocente.
 */
let retirarCepo: (() => void) | null = null

function tragarSiguienteClic(): void {
  retirarCepo?.()
  const tragar = (evento: MouseEvent): void => {
    evento.preventDefault()
    evento.stopPropagation()
    retirarCepo?.()
  }
  const otraPulsacion = (): void => retirarCepo?.()
  window.addEventListener('click', tragar, true)
  window.addEventListener('pointerdown', otraPulsacion, true)
  retirarCepo = () => {
    window.removeEventListener('click', tragar, true)
    window.removeEventListener('pointerdown', otraPulsacion, true)
    retirarCepo = null
  }
}

export function MenuContextual({
  x,
  y,
  opciones,
  onCerrar
}: {
  x: number
  y: number
  opciones: OpcionMenu[]
  onCerrar: () => void
}): ReactNode {
  const caja = useRef<HTMLDivElement>(null)
  const [sitio, setSitio] = useState({ x, y })

  /*
   * Colocado tras medirlo y antes de que se vea.
   *
   * Pulsando abajo del todo, un menú anclado al puntero se sale por debajo y
   * media lista queda fuera de la ventana. Se mide una vez puesto y, si no cabe,
   * se sube o se echa a la izquierda. En `useLayoutEffect` para que el ajuste
   * ocurra antes de pintar: con el efecto normal se vería saltar.
   */
  useLayoutEffect(() => {
    const nodo = caja.current
    if (!nodo) return
    const { width, height } = nodo.getBoundingClientRect()
    setSitio({
      x: Math.max(MARGEN, Math.min(x, window.innerWidth - width - MARGEN)),
      y: Math.max(MARGEN, Math.min(y, window.innerHeight - height - MARGEN))
    })
  }, [x, y])

  // El primero enfocado —o el marcado, si lo hay—: así Escape y las flechas
  // funcionan sin tocar el ratón, y se arranca desde lo que ya está puesto.
  useEffect(() => {
    const marcada = caja.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
    ;(marcada ?? caja.current?.querySelector('button'))?.focus()
  }, [])

  /*
   * Se cierra con casi todo: pulsar fuera, Escape, otro clic derecho, girar la
   * rueda o cambiar el tamaño de la ventana. Un menú anclado a un punto que se
   * queda puesto mientras lo de debajo se mueve señala a cualquier otra cosa.
   *
   * En captura, que si no un botón de debajo se lleva el clic antes de que este
   * se entere de que tiene que irse; y el clic de cerrar se traga, que si no
   * abriría además la ficha de la fila sobre la que se cierra.
   */
  useEffect(() => {
    const fuera = (evento: Event): void => {
      if (caja.current?.contains(evento.target as Node)) return
      // Solo el botón principal: el derecho no llega a producir `click`, y
      // ponerle el cepo dejaría el cebo esperando al siguiente clic de verdad.
      if (evento.type === 'pointerdown' && (evento as PointerEvent).button === 0) {
        tragarSiguienteClic()
      }
      onCerrar()
    }
    // La rueda cierra, salvo dentro del propio menú: una lista larga se
    // desplaza con ella, y cerrarla al intentarlo la haría imposible de recorrer.
    const rueda = (evento: WheelEvent): void => {
      if (caja.current?.contains(evento.target as Node)) return
      onCerrar()
    }
    const tecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        evento.stopPropagation()
        onCerrar()
      }
    }
    window.addEventListener('pointerdown', fuera, true)
    window.addEventListener('contextmenu', fuera, true)
    window.addEventListener('keydown', tecla, true)
    window.addEventListener('resize', onCerrar)
    window.addEventListener('wheel', rueda, true)
    return () => {
      window.removeEventListener('pointerdown', fuera, true)
      window.removeEventListener('contextmenu', fuera, true)
      window.removeEventListener('keydown', tecla, true)
      window.removeEventListener('resize', onCerrar)
      window.removeEventListener('wheel', rueda, true)
    }
  }, [onCerrar])

  /** Arriba y abajo recorren la lista; es un menú, se espera que respondan. */
  const conFlechas = (evento: React.KeyboardEvent<HTMLDivElement>): void => {
    if (evento.key !== 'ArrowDown' && evento.key !== 'ArrowUp') return
    evento.preventDefault()
    const botones = [...(caja.current?.querySelectorAll('button') ?? [])]
    const donde = botones.indexOf(document.activeElement as HTMLButtonElement)
    const paso = evento.key === 'ArrowDown' ? 1 : -1
    botones[(donde + paso + botones.length) % botones.length]?.focus()
  }

  return createPortal(
    <div
      ref={caja}
      className="menu-contextual"
      role="menu"
      style={{ left: sitio.x, top: sitio.y }}
      onKeyDown={conFlechas}
    >
      {opciones.map((opcion) => (
        <button
          key={opcion.etiqueta}
          type="button"
          role={opcion.marcada == null ? 'menuitem' : 'menuitemradio'}
          aria-checked={opcion.marcada}
          className={`menu-contextual-opcion${opcion.peligrosa ? ' peligrosa' : ''}${
            opcion.marcada ? ' marcada' : ''
          }`}
          onClick={() => {
            onCerrar()
            opcion.onElegir()
          }}
        >
          {opcion.marcada ? (
            <Icon name="check" size={15} />
          ) : opcion.icono ? (
            <Icon name={opcion.icono} size={15} />
          ) : (
            <span className="menu-contextual-hueco" />
          )}
          {opcion.etiqueta}
          {opcion.pista && <span className="menu-contextual-pista">{opcion.pista}</span>}
        </button>
      ))}
    </div>,
    document.body
  )
}

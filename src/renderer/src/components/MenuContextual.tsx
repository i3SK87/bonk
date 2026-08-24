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
  icono: string
  onElegir: () => void
  /** En rojo y separada del resto: borrar no se pulsa sin querer. */
  peligrosa?: boolean
}

/** Cuánto se le deja al menú respirar contra el borde de la ventana. */
const MARGEN = 8

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

  // El primero enfocado: así Escape y las flechas funcionan sin tocar el ratón.
  useEffect(() => {
    caja.current?.querySelector('button')?.focus()
  }, [])

  /*
   * Se cierra con casi todo: pulsar fuera, Escape, otro clic derecho, girar la
   * rueda o cambiar el tamaño de la ventana. Un menú anclado a un punto que se
   * queda puesto mientras lo de debajo se mueve señala a cualquier otra cosa.
   *
   * En captura, que si no un botón de debajo se lleva el clic antes de que este
   * se entere de que tiene que irse.
   */
  useEffect(() => {
    const fuera = (evento: Event): void => {
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
    window.addEventListener('wheel', onCerrar, true)
    return () => {
      window.removeEventListener('pointerdown', fuera, true)
      window.removeEventListener('contextmenu', fuera, true)
      window.removeEventListener('keydown', tecla, true)
      window.removeEventListener('resize', onCerrar)
      window.removeEventListener('wheel', onCerrar, true)
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
          role="menuitem"
          className={`menu-contextual-opcion${opcion.peligrosa ? ' peligrosa' : ''}`}
          onClick={() => {
            onCerrar()
            opcion.onElegir()
          }}
        >
          <Icon name={opcion.icono} size={15} />
          {opcion.etiqueta}
        </button>
      ))}
    </div>,
    document.body
  )
}

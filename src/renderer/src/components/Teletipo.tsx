/**
 * Una tira de cifras que desfila en bucle, como el teletipo de la bolsa.
 *
 * Nació para recuperar altura: los totales del periodo ocupaban tres tarjetas y
 * una franja entera de la pantalla para decir tres números, y lo que se quiere
 * mirar ahí es la lista de movimientos. En una línea caben igual y sobra sitio.
 *
 * El truco del bucle sin costura es repetir el contenido y mover la cinta
 * exactamente lo que mide una copia: al llegar ahí, la segunda copia está justo
 * donde arrancó la primera y el salto no se ve.
 *
 * Van cuatro copias y no dos porque con dos, en una ventana ancha, el final de
 * la vuelta enseña la última copia y detrás un hueco vacío hasta el borde. Con
 * cuatro siempre hay cinta de sobra por la derecha. Las tres de más se esconden
 * de los lectores de pantalla, que si no leerían las cifras cuatro veces.
 *
 * La cinta la mueve JavaScript y no una animación de CSS. Con CSS bastaba para
 * dar vueltas, pero no para arrastrarla: una animación no se reanuda desde
 * donde tú la has dejado, y volvía de un salto a la posición que le tocaba por
 * reloj. Llevando la posición a mano, arrastrar es sumarle píxeles.
 */
import { useEffect, useRef, type ReactNode, type Ref } from 'react'

export interface Dato {
  /** Nombre corto de la cifra. */
  label: string
  value: string
  /** Verde, rojo o del color del texto. */
  tone?: 'positive' | 'negative' | 'neutral'
}

interface Props {
  datos: Dato[]
  /**
   * Segundos que tarda en pasar cada cifra. La vuelta entera se calcula desde
   * ahí para que la velocidad no dependa de cuántas haya: con una duración
   * fija, dos cifras irían a paso de tortuga y ocho, disparadas.
   */
  segundosPorDato?: number
}

/** Cuatro copias, y la cinta recorre una: eso es una vuelta. */
const COPIAS = 4

/**
 * Deja la posición dentro de una copia, venga por donde venga.
 *
 * El resto de JavaScript conserva el signo —`-5 % 100` es `-5`—, así que
 * arrastrando hacia atrás la cinta se iría a números negativos y se saldría por
 * la izquierda. Sumar y volver a coger el resto la devuelve al otro extremo,
 * que es lo que hace que el bucle no tenga principio ni final.
 */
function dentroDeUnaCopia(posicion: number, ancho: number): number {
  if (ancho <= 0) return 0
  return ((posicion % ancho) + ancho) % ancho
}

function Tramo({
  datos,
  oculto,
  ref
}: {
  datos: Dato[]
  oculto?: boolean
  ref?: Ref<HTMLDivElement>
}): ReactNode {
  return (
    <div className="teletipo-tramo" ref={ref} aria-hidden={oculto || undefined}>
      {datos.map((dato, indice) => (
        <div className="teletipo-dato" key={`${dato.label}-${indice}`}>
          <span className="teletipo-label">{dato.label}</span>
          <span className={`teletipo-valor amount ${dato.tone ?? 'neutral'}`}>{dato.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Teletipo({ datos, segundosPorDato = 6 }: Props): ReactNode {
  const cinta = useRef<HTMLDivElement>(null)
  const primerTramo = useRef<HTMLDivElement>(null)

  /* Lo que mueve la cinta vive en refs y no en estado: cambia en cada fotograma
     y volver a dibujar React sesenta veces por segundo para mover un `transform`
     no tiene ningún sentido. */
  const posicion = useRef(0)
  const anchoCopia = useRef(0)
  const encima = useRef(false)
  const arrastre = useRef<{ raton: number; cinta: number } | null>(null)

  const cuantas = datos.length

  useEffect(() => {
    const tramo = primerTramo.current
    if (!tramo) return

    const medir = (): void => {
      // Con decimales, no `offsetWidth`, que redondea a entero. Media décima de
      // error por vuelta no se ve, pero es error que se paga en cada bucle y no
      // cuesta nada evitarlo.
      anchoCopia.current = tramo.getBoundingClientRect().width
    }
    medir()
    // Las cifras cambian de ancho cuando cambian los importes, y la ventana al
    // redimensionarse; sin volver a medir, la vuelta se descuadra y se ve el corte.
    const observador = new ResizeObserver(medir)
    observador.observe(tramo)

    // A quien tenga pedido menos movimiento no le desfila sola. Arrastrarla sigue
    // funcionando: eso lo pide él, no se lo impone la pantalla.
    const quieta = window.matchMedia('(prefers-reduced-motion: reduce)')

    const pintar = (): void => {
      if (cinta.current) cinta.current.style.transform = `translateX(${-posicion.current}px)`
    }

    let ultimo = performance.now()
    let fotograma = requestAnimationFrame(function paso(ahora: number): void {
      /*
       * Con tope. Mientras la ventana está minimizada o detrás de otra, el
       * navegador deja de dar fotogramas; al volver, el salto desde el último
       * sería de minutos y la cinta pegaría un tirón enorme antes de seguir a su
       * ritmo. Con el tope, volver del segundo plano es un fotograma más.
       */
      const segundos = Math.min((ahora - ultimo) / 1000, 0.05)
      ultimo = ahora

      const parada = encima.current || arrastre.current != null || quieta.matches
      if (!parada && anchoCopia.current > 0) {
        // Píxeles por segundo, sacados del ancho de verdad: así la velocidad de
        // lectura es la misma con cifras cortas que con cifras largas.
        const velocidad = anchoCopia.current / (cuantas * segundosPorDato)
        posicion.current = dentroDeUnaCopia(
          posicion.current + velocidad * segundos,
          anchoCopia.current
        )
        pintar()
      }
      fotograma = requestAnimationFrame(paso)
    })

    return () => {
      cancelAnimationFrame(fotograma)
      observador.disconnect()
    }
  }, [cuantas, segundosPorDato])

  if (cuantas === 0) return null

  return (
    <div
      className="teletipo"
      title="Arrástrala para buscar un dato; se para al pasar el ratón por encima"
      onPointerEnter={() => {
        encima.current = true
      }}
      onPointerLeave={() => {
        encima.current = false
      }}
      onPointerDown={(evento) => {
        // Capturado, el arrastre sigue aunque el ratón se salga de la tira: sin
        // esto, se te queda a medias en cuanto subes un poco la mano.
        evento.currentTarget.setPointerCapture(evento.pointerId)
        arrastre.current = { raton: evento.clientX, cinta: posicion.current }
      }}
      onPointerMove={(evento) => {
        const desde = arrastre.current
        if (!desde || !cinta.current) return
        // Al revés que el ratón: llevando la mano a la derecha, la cinta va a la
        // derecha, que es hacia atrás en el recorrido.
        posicion.current = dentroDeUnaCopia(
          desde.cinta - (evento.clientX - desde.raton),
          anchoCopia.current
        )
        cinta.current.style.transform = `translateX(${-posicion.current}px)`
      }}
      onPointerUp={(evento) => {
        // Puede llegar un soltar sin haber capturado nada —un cancelar previo ya
        // lo soltó—, y liberar lo que no se tiene lanza excepción.
        if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
          evento.currentTarget.releasePointerCapture(evento.pointerId)
        }
        arrastre.current = null
      }}
      onPointerCancel={() => {
        arrastre.current = null
      }}
    >
      <div className="teletipo-cinta" ref={cinta}>
        {Array.from({ length: COPIAS }, (_, copia) => (
          <Tramo
            key={copia}
            datos={datos}
            oculto={copia > 0}
            ref={copia === 0 ? primerTramo : undefined}
          />
        ))}
      </div>
    </div>
  )
}

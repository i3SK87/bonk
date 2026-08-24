/**
 * Una tira de cifras que desfila en bucle, como el teletipo de la bolsa.
 *
 * Nació para recuperar altura: los totales del periodo ocupaban tres tarjetas y
 * una franja entera de la pantalla para decir tres números, y lo que se quiere
 * mirar ahí es la lista de movimientos. En una línea caben igual y sobra sitio.
 *
 * El truco del bucle sin costura es repetir el contenido y mover la cinta
 * exactamente lo que mide una copia: al terminar, la segunda copia está justo
 * donde arrancó la primera y el salto no se ve.
 *
 * Van cuatro copias y no dos porque con dos, en una ventana ancha, el final de
 * la vuelta enseña la última copia y detrás un hueco vacío hasta el borde. Con
 * cuatro siempre hay cinta de sobra por la derecha. Las tres de más se esconden
 * de los lectores de pantalla, que si no leerían las cifras cuatro veces.
 */
import type { ReactNode } from 'react'

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
   * Segundos que tarda la cinta en dar una vuelta. Se calcula desde el número
   * de datos para que la velocidad no dependa de cuántos haya: con una duración
   * fija, dos cifras irían a paso de tortuga y ocho, disparadas.
   */
  segundosPorDato?: number
}

function Tramo({ datos, oculto }: { datos: Dato[]; oculto?: boolean }): ReactNode {
  return (
    <div className="teletipo-tramo" aria-hidden={oculto || undefined}>
      {datos.map((dato, indice) => (
        <div className="teletipo-dato" key={`${dato.label}-${indice}`}>
          <span className="teletipo-label">{dato.label}</span>
          <span className={`teletipo-valor amount ${dato.tone ?? 'neutral'}`}>{dato.value}</span>
        </div>
      ))}
    </div>
  )
}

/** Cuatro copias, y la cinta se mueve un cuarto: eso es justo una copia. */
const COPIAS = 4

export function Teletipo({ datos, segundosPorDato = 6 }: Props): ReactNode {
  if (datos.length === 0) return null

  return (
    <div className="teletipo" title="Pasa el ratón por encima para pararlo">
      <div
        className="teletipo-cinta"
        style={{ animationDuration: `${datos.length * segundosPorDato}s` }}
      >
        {Array.from({ length: COPIAS }, (_, copia) => (
          <Tramo key={copia} datos={datos} oculto={copia > 0} />
        ))}
      </div>
    </div>
  )
}

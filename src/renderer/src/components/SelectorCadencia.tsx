/**
 * Cada cuánto se repite algo, elegido por su nombre.
 *
 * Antes era «Cada [2] [meses]»: un número y una unidad que había que combinar
 * en la cabeza para saber qué acababas de poner. Casi todo lo que se programa
 * tiene nombre propio —mensual, trimestral, anual— y decirlo así se lee de un
 * golpe.
 *
 * Lo que no tiene nombre se sigue pudiendo montar, pero detrás de «Otra…», sin
 * el número y la unidad a la vista de todos: son la salida de emergencia de un
 * caso raro, no la forma normal de contestar a esto.
 *
 * Se abre en «Otra…» solo cuando lo guardado no cabe en ninguna de las de
 * nombre. Es lo que salva a una programada vieja de «cada 10 días»: abrir su
 * ficha no puede convertirla a otra cosa por el camino.
 */
import { useState, type ReactNode } from 'react'
import { NumberInput } from './ui'
import { CADENCIAS, FRECUENCIAS, UNA_VEZ, cadenciaDe } from '../lib/frecuencias'
import type { Frequency } from '@shared/types'

/** El valor del desplegable cuando se está montando a mano. */
const A_MANO = 'otra'

export function SelectorCadencia({
  freq,
  interval,
  onChange,
  unaVez = false
}: {
  freq: Frequency
  interval: number
  onChange: (freq: Frequency, interval: number) => void
  /**
   * Ofrecer «Una vez» entre las demás. Lo pide la ficha de una programada, donde
   * algo que pasa un solo día es una respuesta; no la de un movimiento cíclico,
   * donde sería la contraria de lo que se acaba de marcar.
   */
  unaVez?: boolean
}): ReactNode {
  const [aMano, setAMano] = useState(() => cadenciaDe(freq, interval) == null)
  const cadencia = cadenciaDe(freq, interval)
  // La que ya está puesta sale siempre, se ofrezca o no: abrir una ficha no
  // puede cambiarle la cadencia a lo que hay guardado solo por enseñarlo.
  const opciones = unaVez || freq === 'once' ? [UNA_VEZ, ...CADENCIAS] : CADENCIAS

  return (
    <div className="col" style={{ gap: 8 }}>
      <select
        className="select"
        value={aMano || cadencia == null ? A_MANO : cadencia.nombre}
        onChange={(event) => {
          if (event.target.value === A_MANO) {
            // Lo que hubiera puesto se queda: «Otra…» abre el mando de a mano
            // por donde estaba, no lo vacía.
            setAMano(true)
            return
          }
          const elegida = opciones.find((item) => item.nombre === event.target.value)
          if (!elegida) return
          setAMano(false)
          onChange(elegida.freq, elegida.interval)
        }}
      >
        {opciones.map((item) => (
          <option key={item.nombre} value={item.nombre}>
            {item.nombre}
          </option>
        ))}
        <option value={A_MANO}>Otra…</option>
      </select>

      {/* «Una vez» no lleva número: no hay nada que contar. */}
      {(aMano || cadencia == null) && freq !== 'once' && (
        <div className="row tight">
          <span className="muted small">Cada</span>
          <NumberInput
            value={interval}
            onChange={(valor) => onChange(freq, valor)}
            min={1}
            max={99}
            style={{ width: 74 }}
          />
          <select
            className="select"
            style={{ flex: 1 }}
            value={freq}
            onChange={(event) => onChange(event.target.value as Frequency, interval)}
          >
            {FRECUENCIAS.map((item) => (
              <option key={item.value} value={item.value}>
                {interval === 1 ? item.singular : item.plural}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

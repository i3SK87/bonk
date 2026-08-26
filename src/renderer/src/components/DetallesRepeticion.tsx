/**
 * Lo que hay que concretar tras marcar «Se repite» o «Deuda a plazos».
 *
 * Estas preguntas vivían dentro del formulario, apareciendo a mitad de la ficha
 * en cuanto se marcaba la opción. Dos problemas: con la ventana sin maximizar
 * quedaban por debajo del borde y había que bajar a buscarlas, y aunque
 * estuvieran a la vista era fácil pasarlas por alto —se marcaba la opción, se
 * seguía rellenando lo de siempre y se guardaba con «cada mes, sin fin» sin
 * haberlo decidido—.
 *
 * Ahora salen en un cuadro encima, con solo lo que hace falta para esa
 * elección. No se puede seguir sin contestar, no hay nada que buscar, y en la
 * ficha queda un resumen de una línea para cambiarlo luego sin desmarcar nada.
 *
 * Cancelar deshace la elección que lo abrió: el cuadro *es* la elección. Sale
 * con lo que hubiera puesto antes, así que reabrirlo para cambiar un detalle no
 * obliga a repetirlo todo.
 */
import { useState, type ReactNode } from 'react'
import { Modal, Field } from './ui'
import { DateInput } from './DateInput'
import { SelectorCadencia } from './SelectorCadencia'
import { describeFrequency } from '../lib/frecuencias'
import { LENDERS } from '@shared/lenders'
import { formatDate } from '@shared/dates'
import type { Frequency } from '@shared/types'

/** Lo que se decide aquí; el formulario guarda todo esto tal cual. */
export interface Repeticion {
  freq: Frequency
  interval: number
  endDate: string
  lender: string
}

/** Qué se pregunta. Cada pantalla pide solo lo suyo. */
export type CampoRepeticion = 'repeticion' | 'fin' | 'prestamista'

export function DetallesRepeticion({
  titulo,
  campos,
  valores,
  onGuardar,
  onCancelar
}: {
  titulo: string
  campos: CampoRepeticion[]
  valores: Repeticion
  onGuardar: (nuevos: Repeticion) => void
  onCancelar: () => void
}): ReactNode {
  // Se trabaja sobre una copia: cancelar tiene que dejarlo todo como estaba.
  const [borrador, setBorrador] = useState<Repeticion>(valores)
  const pone = (parte: Partial<Repeticion>): void => setBorrador({ ...borrador, ...parte })

  const esDeuda = campos.includes('prestamista')

  return (
    <Modal
      sobre
      title={titulo}
      onClose={onCancelar}
      footer={
        <>
          <button className="btn" onClick={onCancelar}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => onGuardar(borrador)}>
            Hecho
          </button>
        </>
      }
    >
      {campos.includes('repeticion') && (
        <Field label="Cada cuánto">
          <SelectorCadencia
            freq={borrador.freq}
            interval={borrador.interval}
            onChange={(freq, interval) => pone({ freq, interval })}
          />
        </Field>
      )}

      {campos.includes('fin') && (
        <Field
          label="Termina el"
          hint={esDeuda ? 'La fecha de la última cuota.' : 'Déjalo vacío si no tiene fin.'}
        >
          <DateInput value={borrador.endDate} onChange={(endDate) => pone({ endDate })} clearable />
        </Field>
      )}

      {/* Quién cobra se ve luego como etiqueta en Deudas, que es donde se busca:
          «el PC» son dos años de cuotas, y lo que se recuerda es que las cobra
          Aplázame. Opcional, que no todas las deudas son de una financiera. */}
      {campos.includes('prestamista') && (
        <Field label="Quién la cobra">
          <select
            className="select"
            value={borrador.lender}
            onChange={(event) => pone({ lender: event.target.value })}
          >
            <option value="">Sin especificar</option>
            {LENDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Modal>
  )
}

/**
 * Lo elegido, en una línea, con la puerta para volver a entrar.
 *
 * Sin esto el cuadro sería un sitio de paso: se contesta una vez y ya no hay
 * forma de corregirlo sin desmarcar la opción y volverla a marcar. Y de camino
 * deja a la vista lo que se decidió, que era la otra mitad del problema.
 */
export function ResumenRepeticion({
  campos,
  valores,
  onCambiar
}: {
  campos: CampoRepeticion[]
  valores: Repeticion
  onCambiar: () => void
}): ReactNode {
  const trozos: string[] = []
  if (campos.includes('repeticion')) trozos.push(describeFrequency(valores.freq, valores.interval))
  if (campos.includes('fin')) {
    trozos.push(valores.endDate ? `hasta el ${formatDate(valores.endDate)}` : 'sin fecha de fin')
  }
  if (campos.includes('prestamista')) {
    const quien = LENDERS.find((item) => item.id === valores.lender)
    trozos.push(quien ? `la cobra ${quien.name}` : 'sin especificar quién la cobra')
  }

  return (
    <div className="resumen-eleccion">
      <span className="truncate">{trozos.join(' · ')}</span>
      <button type="button" className="btn small ghost" onClick={onCambiar}>
        Cambiar
      </button>
    </div>
  )
}

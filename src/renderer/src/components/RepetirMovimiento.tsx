/**
 * Programar un movimiento ya apuntado: convertirlo en el primero de una serie.
 *
 * El caso es el del recibo que llevas meses apuntando a mano y un día caes en
 * que siempre es el mismo: en vez de crear la programación desde cero —copiando
 * cuenta, categoría, importe y concepto— se le dice cada cuánto y ya está.
 *
 * El movimiento no se toca: ya ocurrió. Lo que nace es el plan de lo que viene
 * detrás, con su primera vuelta en la fecha que se ponga aquí.
 */
import { useState, type ReactNode } from 'react'
import { Modal, Field, Checkbox } from './ui'
import { SelectorCadencia } from './SelectorCadencia'
import { DateInput } from './DateInput'
import { useStore } from '../lib/store'
import { describeFrequency } from '../lib/frecuencias'
import { formatDate, nextOccurrence, today } from '@shared/dates'
import { formatMoney } from '@shared/money'
import type { Frequency, TransactionView } from '@shared/types'

const api = window.bonk

/**
 * La primera vuelta que todavía no ha pasado, contando desde el día del
 * movimiento. Es la misma cuenta que echa la capa de datos; se repite aquí para
 * poder proponerla en el campo antes de guardar nada.
 */
function primeraVuelta(desde: string, freq: Frequency, interval: number): string {
  const hoy = today()
  let fecha = nextOccurrence(desde, freq, interval)
  let guarda = 0
  while (fecha <= hoy && guarda < 4000) {
    fecha = nextOccurrence(fecha, freq, interval)
    guarda++
  }
  return fecha
}

export function RepetirMovimiento({
  row,
  onClose
}: {
  row: TransactionView
  onClose: () => void
}): ReactNode {
  const { run } = useStore()
  const [freq, setFreq] = useState<Frequency>('monthly')
  const [interval, setInterval] = useState(1)
  const [nextDate, setNextDate] = useState(() => primeraVuelta(row.date, 'monthly', 1))
  /*
   * Mientras no se toque la fecha, la propone la cadencia.
   *
   * Cambiar de mensual a semestral tiene que mover la fecha propuesta; pero en
   * cuanto se pone una a mano —el día que se cobra la paga extra— esa manda, y
   * cambiar la cadencia después no puede borrarla.
   */
  const [fechaAMano, setFechaAMano] = useState(false)
  const [conFinal, setConFinal] = useState(false)
  const [endDate, setEndDate] = useState('')

  const ponCadencia = (nuevaFreq: Frequency, nuevoIntervalo: number): void => {
    setFreq(nuevaFreq)
    setInterval(nuevoIntervalo)
    if (!fechaAMano) setNextDate(primeraVuelta(row.date, nuevaFreq, nuevoIntervalo))
  }

  const hoy = today()
  const finalPuesto = conFinal && endDate ? endDate : null
  const yaPasada = nextDate <= hoy
  const sinVueltas = finalPuesto != null && nextDate > finalPuesto
  const problema = yaPasada
    ? 'La primera vez tiene que caer después de hoy: lo de antes ya está apuntado.'
    : sinVueltas
      ? 'Con ese final no queda ninguna vuelta por delante.'
      : null

  const guardar = async (): Promise<void> => {
    const hecho = await run(
      () =>
        api.transactions.repeat({
          transactionId: row.id,
          freq,
          interval,
          nextDate,
          endDate: finalPuesto
        }),
      'Programado'
    )
    if (hecho) onClose()
  }

  return (
    <Modal
      title="Programar"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={guardar} disabled={problema != null}>
            Programar
          </button>
        </>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        «{row.note || row.payee || row.categoryName || 'Este movimiento'}» del{' '}
        {formatDate(row.date)}, {formatMoney(row.amount, row.accountCurrency)} en{' '}
        {row.accountName}. El movimiento se queda como está; lo que se crea es lo que
        viene detrás.
      </p>

      <div className="grid cols-2">
        <Field label="Se repite">
          <SelectorCadencia freq={freq} interval={interval} onChange={ponCadencia} />
        </Field>

        <Field
          label="La primera vez"
          hint={fechaAMano ? undefined : 'Propuesta según la cadencia.'}
        >
          <DateInput
            value={nextDate}
            onChange={(valor) => {
              setNextDate(valor)
              setFechaAMano(true)
            }}
          />
        </Field>
      </div>

      <div className="casillas">
        <Checkbox
          checked={conFinal}
          onChange={setConFinal}
          label="Tiene fecha de fin"
          hint="Para algo que se acaba: un curso a plazos, un alquiler con contrato."
        />
      </div>

      {conFinal && (
        <Field label="Termina el">
          <DateInput value={endDate} onChange={setEndDate} clearable />
        </Field>
      )}

      <div className="card card-body" style={{ marginTop: 4 }}>
        {problema ? (
          <div className="small" style={{ color: 'var(--warning)' }}>
            {problema}
          </div>
        ) : (
          <div className="small muted">
            {describeFrequency(freq, interval)}, empezando el{' '}
            <strong style={{ color: 'var(--fg)' }}>{formatDate(nextDate)}</strong>. Se
            registrará solo; si prefieres confirmarlo cada vez, quítale el registro
            automático en su ficha de Programados.
          </div>
        )}
      </div>
    </Modal>
  )
}

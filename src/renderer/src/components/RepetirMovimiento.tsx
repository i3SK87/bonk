/**
 * Convertir un movimiento ya apuntado en uno que se repite.
 *
 * El caso es el del recibo que llevas meses apuntando a mano y un día caes en
 * que siempre es el mismo: en vez de crear la programación desde cero —copiando
 * cuenta, categoría, importe y concepto— se le dice cada cuánto y ya está.
 *
 * El movimiento no se toca: ya ocurrió. Lo que nace es el plan de lo que viene
 * detrás, con su primera vuelta en la primera fecha que caiga después de hoy.
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
 * La primera vuelta que todavía no ha pasado. Es la misma cuenta que echa la
 * capa de datos; se repite aquí para poder enseñarla antes de guardar nada.
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
  const [conFinal, setConFinal] = useState(false)
  const [endDate, setEndDate] = useState('')

  const proxima = primeraVuelta(row.date, freq, interval)
  const finalPuesto = conFinal && endDate ? endDate : null
  const sinVueltas = finalPuesto != null && proxima > finalPuesto

  const guardar = async (): Promise<void> => {
    const hecho = await run(
      () =>
        api.transactions.repeat({
          transactionId: row.id,
          freq,
          interval,
          endDate: finalPuesto
        }),
      'Ahora se repite'
    )
    if (hecho) onClose()
  }

  return (
    <Modal
      title="Hacer que se repita"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={guardar} disabled={sinVueltas}>
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

      <Field label="Se repite">
        <SelectorCadencia
          freq={freq}
          interval={interval}
          onChange={(nuevaFreq, nuevoIntervalo) => {
            setFreq(nuevaFreq)
            setInterval(nuevoIntervalo)
          }}
        />
      </Field>

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

      {/*
       * Qué va a pasar, antes de que pase.
       *
       * La cuenta no es evidente: de un recibo de hace ocho meses marcado como
       * mensual, la próxima vuelta es el mes que viene y no ocho meses atrás.
       * Verla escrita es lo que evita programar algo sin querer.
       */}
      <div className="card card-body" style={{ marginTop: 4 }}>
        {sinVueltas ? (
          <div className="small" style={{ color: 'var(--warning)' }}>
            Con ese final no queda ninguna vuelta por delante: la siguiente sería el{' '}
            {formatDate(proxima)}.
          </div>
        ) : (
          <div className="small muted">
            {describeFrequency(freq, interval)}, empezando el{' '}
            <strong style={{ color: 'var(--fg)' }}>{formatDate(proxima)}</strong>. Se
            registrará solo; si prefieres confirmarlo cada vez, quítale el registro
            automático en su ficha de Programados.
          </div>
        )}
      </div>
    </Modal>
  )
}

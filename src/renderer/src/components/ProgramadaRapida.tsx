/**
 * Los dos retoques que se le hacen a una programación sin abrir su ficha.
 *
 * Son los que se hacen de verdad: la suscripción que ha subido de precio y la
 * cuota que este mes se cobra otro día. Para eso había que abrir el formulario
 * entero —tipo, cuenta, categoría, repetición, las tres casillas— y buscar el
 * campo. Aquí hay uno o dos, y lo demás de la programación se manda tal cual
 * venía.
 */
import { useState, type ReactNode } from 'react'
import { Modal, AmountInput, Field } from './ui'
import { DateInput } from './DateInput'
import { useStore } from '../lib/store'
import { tituloProgramada } from '@shared/text'
import { describeFrequency } from '../lib/frecuencias'
import type { ScheduledView } from '@shared/types'

const api = window.bonk

/** De qué programación se está hablando, para no dudar sobre cuál se pulsó. */
function Contexto({ row }: { row: ScheduledView }): ReactNode {
  return (
    <p className="small muted" style={{ margin: 0 }}>
      {tituloProgramada(row)} · {describeFrequency(row.freq, row.interval)} · {row.accountName}
    </p>
  )
}

export function ImporteProgramado({
  row,
  onClose
}: {
  row: ScheduledView
  onClose: () => void
}): ReactNode {
  const { run, accounts } = useStore()
  const [amount, setAmount] = useState(row.amount)

  /*
   * El traspaso entre divisas lleva dos cifras: lo que sale y lo que llega.
   *
   * Enseñar solo una dejaría la otra a su aire y el traspaso diría que salen
   * cien euros y llegan los dólares de antes.
   *
   * La divisa del destino se busca en las cuentas: la programada guarda a qué
   * cuenta va, no en qué moneda está.
   */
  const divisaDestino = accounts.find((item) => item.id === row.toAccountId)?.currency
  const dosCifras = row.amountTo != null && divisaDestino != null && divisaDestino !== row.accountCurrency

  const [amountTo, setAmountTo] = useState(row.amountTo ?? 0)

  const guardar = async (): Promise<void> => {
    await run(
      () => api.scheduled.save({ ...row, amount, amountTo: dosCifras ? amountTo : null }),
      'Importe actualizado'
    )
    onClose()
  }

  return (
    <Modal
      title="Editar importe"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={guardar} disabled={amount <= 0}>
            Guardar
          </button>
        </>
      }
    >
      <Contexto row={row} />

      <Field label={dosCifras ? 'Sale' : 'Importe'} required>
        <AmountInput value={amount} currency={row.accountCurrency} onChange={setAmount} autoFocus />
      </Field>

      {dosCifras && (
        <Field label="Llega" required>
          <AmountInput
            value={amountTo}
            currency={divisaDestino as string}
            onChange={setAmountTo}
          />
        </Field>
      )}

      {/* Lo ya registrado no se toca: esto cambia lo que se cobrará de aquí en
          adelante, no lo que ya salió de la cuenta. */}
      <p className="small subtle" style={{ margin: 0 }}>
        Cambia lo que se cobrará a partir de la próxima vez. Lo ya registrado se queda como está.
      </p>
    </Modal>
  )
}

export function FechasProgramadas({
  row,
  onClose
}: {
  row: ScheduledView
  onClose: () => void
}): ReactNode {
  const { run } = useStore()
  const [nextDate, setNextDate] = useState(row.nextDate)
  const [endDate, setEndDate] = useState(row.endDate ?? '')

  const guardar = async (): Promise<void> => {
    await run(
      () => api.scheduled.save({ ...row, nextDate, endDate: endDate || null }),
      'Fechas actualizadas'
    )
    onClose()
  }

  /*
   * Un fin anterior a la próxima no deja sitio a nada.
   *
   * La programación nacería agotada: el primer repaso la sellaría por haberse
   * acabado sin haber generado ni una. Se avisa antes en vez de dejar guardar
   * algo que se deshace solo.
   */
  const alReves = endDate !== '' && endDate < nextDate

  return (
    <Modal
      title="Editar fechas"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={guardar} disabled={alReves}>
            Guardar
          </button>
        </>
      }
    >
      <Contexto row={row} />

      <Field label="Próxima fecha" required hint="Cuándo se cobra la siguiente.">
        <DateInput value={nextDate} onChange={setNextDate} />
      </Field>

      <Field label="Termina el" hint="Déjalo vacío si no tiene fin.">
        <DateInput value={endDate} onChange={setEndDate} clearable />
      </Field>

      {alReves && (
        <div className="field-error">
          La fecha de fin cae antes que la próxima: así no queda ninguna por delante.
        </div>
      )}
    </Modal>
  )
}

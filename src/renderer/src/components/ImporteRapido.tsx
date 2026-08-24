/**
 * Corregir el importe de un movimiento sin abrir su ficha.
 *
 * Es lo que más se toca de un apunte ya hecho —el céntimo mal tecleado, el
 * recibo que vino por otra cantidad— y para eso había que abrir el formulario
 * entero, con su fecha, su cuenta, su categoría, sus etiquetas y su mapa. Aquí
 * hay un campo y un botón.
 *
 * Lo demás del movimiento se manda tal cual venía. Las etiquetas no se tocan a
 * propósito: la capa de datos solo las reescribe cuando se le pasan, así que no
 * pasárselas es lo que las deja en paz.
 */
import { useState, type ReactNode } from 'react'
import { Modal, AmountInput, Field } from './ui'
import { useStore } from '../lib/store'
import { formatDate } from '@shared/dates'
import type { TransactionView } from '@shared/types'

const api = window.bonk

export function ImporteRapido({
  row,
  onClose
}: {
  row: TransactionView
  onClose: () => void
}): ReactNode {
  const { run } = useStore()
  const [amount, setAmount] = useState(row.amount)
  /*
   * El traspaso entre divisas lleva dos cifras: lo que sale y lo que llega.
   *
   * Enseñar solo una dejaría la otra a su aire y el traspaso diría que salieron
   * cien euros y llegaron los dólares de antes.
   */
  const dosCifras = row.amountTo != null && row.toAccountCurrency != null
  const [amountTo, setAmountTo] = useState(row.amountTo ?? 0)

  const guardar = async (): Promise<void> => {
    await run(
      () =>
        api.transactions.save({
          id: row.id,
          type: row.type,
          date: row.date,
          time: row.time,
          accountId: row.accountId,
          toAccountId: row.toAccountId,
          categoryId: row.categoryId,
          amount,
          amountTo: dosCifras ? amountTo : row.amountTo,
          payee: row.payee,
          note: row.note,
          place: row.place,
          lat: row.lat,
          lon: row.lon,
          refundForId: row.refundForId,
          goalId: row.goalId
        }),
      'Importe actualizado'
    )
    onClose()
  }

  const nombre = row.type === 'transfer'
    ? `${row.accountName} → ${row.toAccountName ?? '—'}`
    : (row.categoryName ?? 'Sin categoría')

  return (
    <Modal
      title="Editar importe"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={guardar} disabled={amount <= 0}>
            Guardar
          </button>
        </>
      }
    >
      {/* De qué movimiento se está hablando: el menú se abrió sobre una fila y
          para cuando el cuadro está delante ya no se ve cuál era. */}
      <p className="small muted" style={{ margin: '0 0 14px' }}>
        {nombre} · {formatDate(row.date)}
        {row.note ? ` · ${row.note}` : ''}
      </p>

      <div className={dosCifras ? 'grid cols-2' : undefined}>
        <Field label={dosCifras ? 'Sale' : 'Importe'} required>
          <AmountInput
            value={amount}
            currency={row.accountCurrency}
            onChange={setAmount}
            autoFocus
            invalid={amount <= 0}
          />
        </Field>

        {dosCifras && (
          <Field label="Llega">
            <AmountInput
              value={amountTo}
              currency={row.toAccountCurrency!}
              onChange={setAmountTo}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}

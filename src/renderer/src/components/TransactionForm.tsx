import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Modal, Field, AmountInput, Avatar, Segmented, Confirm, NumberInput } from './ui'
import { Icon } from './Icon'
import { DateInput } from './DateInput'
import { useStore } from '../lib/store'
import { CategoryModal } from './CategoryForm'
import { today, formatDate, nextOccurrence } from '@shared/dates'
import { formatMoney } from '@shared/money'
import { FRECUENCIAS } from '../lib/frecuencias'
import { LENDERS } from '@shared/lenders'
import type { Attachment, Frequency, GoalProgress, TransactionView, TxType } from '@shared/types'

const api = window.bonk

interface Props {
  existing?: TransactionView | null
  defaultAccountId?: number
  /** Gasto del que se está registrando una devolución. */
  refundFor?: TransactionView | null
  onClose: () => void
  /** Solo cuando se ha guardado; al cancelar no se llama. */
  onSaved?: () => void
}

export function TransactionForm({
  existing,
  defaultAccountId,
  refundFor,
  onClose,
  onSaved
}: Props): ReactNode {
  const { accounts, categories, run, toast, settings, fail } = useStore()

  const [type, setType] = useState<TxType>(existing?.type ?? (refundFor ? 'refund' : 'expense'))
  const [amount, setAmount] = useState(existing?.amount ?? 0)
  /*
   * La cuenta no se supone.
   *
   * Antes caía en la principal cuando no se sabía cuál, y mirando la hucha el
   * gasto acababa en el banco sin decir nada. Ahora: la del movimiento que se
   * edita, la del gasto que se devuelve, o la que se esté mirando en la lista.
   * Si no hay ninguna de esas, se queda vacía y hay que elegirla.
   */
  const [accountId, setAccountId] = useState<number | null>(
    existing?.accountId ?? refundFor?.accountId ?? defaultAccountId ?? null
  )
  const [toAccountId, setToAccountId] = useState<number | null>(existing?.toAccountId ?? null)
  const [goalId, setGoalId] = useState<number | null>(existing?.goalId ?? null)
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(
    existing?.categoryId ?? refundFor?.categoryId ?? null
  )
  const [refundForId, setRefundForId] = useState<number | null>(existing?.refundForId ?? refundFor?.id ?? null)
  const [candidates, setCandidates] = useState<TransactionView[]>([])
  const [date, setDate] = useState(existing?.date ?? today())
  // La hora no se pide, pero la que traiga el movimiento se conserva.
  const time = existing?.time ?? ''
  const [note, setNote] = useState(existing?.note ?? '')

  /*
   * Dejar montada la repetición desde aquí.
   *
   * Una cuota o una suscripción no son un gasto suelto: son el primero de una
   * serie. Sin esto había que apuntar el gasto y luego, aparte, crear la
   * programación a mano con los mismos datos —y hasta entonces una deuda no
   * aparecía en su pestaña, porque Deudas mira las programaciones, no los
   * movimientos—.
   *
   * Solo al crear: sobre un movimiento que ya existe, marcarlo volvería a
   * montar una programación que probablemente ya está montada.
   */
  const [comportamiento, setComportamiento] = useState<'suelto' | 'repite' | 'deuda'>('suelto')
  const repite = comportamiento !== 'suelto'
  const esDeuda = comportamiento === 'deuda'
  const [freq, setFreq] = useState<Frequency>('monthly')
  const [interval, setInterval] = useState(1)
  const [endDate, setEndDate] = useState('')
  const [lender, setLender] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  /** Facturas elegidas que aún no se han copiado: esperan a que el movimiento exista. */
  const [pending, setPending] = useState<Array<{ path: string; name: string }>>([])
  const [previews, setPreviews] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refunds, setRefunds] = useState<TransactionView[]>([])
  const [refunding, setRefunding] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)

  // Gastos del día a los que puede engancharse un reembolso suelto. Los que
  // llegan por el botón «Registrar reembolso» ya vienen enlazados y no eligen.
  useEffect(() => {
    if (type !== 'refund' || refundFor) {
      setCandidates([])
      return
    }
    let cancelled = false
    api.transactions
      .refundCandidates(date, existing?.id, existing?.refundForId ?? undefined)
      .then((rows) => {
        if (cancelled) return
        setCandidates(rows)
        // Al cambiar de fecha, el gasto elegido puede dejar de estar en la lista.
        setRefundForId((current) => (current && rows.some((row) => row.id === current) ? current : null))
      })
      .catch(fail('los gastos a los que enlazar'))
    return () => {
      cancelled = true
    }
  }, [type, refundFor, date, existing?.id, existing?.refundForId, fail])

  /** El gasto elegido manda: la categoría del reembolso es la suya. */
  function choose(id: number | null): void {
    setRefundForId(id)
    setCategoryId(candidates.find((item) => item.id === id)?.categoryId ?? null)
  }

  const account = accounts.find((item) => item.id === accountId)
  const currency = account?.currency ?? settings.baseCurrency
  // Las facturas solo salen donde tienen sentido: lo decide la categoría.
  const keepsInvoices = categories.some(
    (category) => category.id === categoryId && category.keepsInvoices
  )

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.kind === (type === 'income' ? 'income' : 'expense')),
    [categories, type]
  )

  // Si la cuenta elegida ya no está en la lista —porque se archivó, o porque los
  // datos aún no habían llegado al montar— se vuelve a dejar en blanco.
  useEffect(() => {
    if (accountId != null && accounts.length > 0 && !accounts.some((item) => item.id === accountId)) {
      setAccountId(existing?.accountId ?? defaultAccountId ?? null)
    }
  }, [accounts, accountId, existing, defaultAccountId])

  // Un ingreso no se debe a nadie: pasando a ingreso con «Deuda a plazos»
  // elegida, la respuesta se queda en repetirse, que es lo que sigue valiendo.
  useEffect(() => {
    if (type !== 'expense') setComportamiento((actual) => (actual === 'deuda' ? 'repite' : actual))
  }, [type])

  // Al cambiar de gasto a ingreso la categoría anterior deja de tener sentido.
  useEffect(() => {
    if (type === 'transfer') {
      setCategoryId(null)
    } else if (categoryId && !visibleCategories.some((category) => category.id === categoryId)) {
      setCategoryId(null)
    }
  }, [type, categoryId, visibleCategories])

  useEffect(() => {
    if (type === 'transfer' && toAccountId === accountId) setToAccountId(null)
  }, [type, accountId, toAccountId])

  /**
   * A dónde va el dinero, cuando es una hucha con planes por llenar.
   *
   * Solo entonces tiene sentido preguntar para qué es: meter dinero en la cuenta
   * corriente no es ahorrar, y una hucha sin planes no tiene a quién dárselo.
   */
  const destino = accounts.find((item) => item.id === toAccountId)
  const planes = goals.filter(
    (goal) => !goal.achievedAt && goal.accountId === toAccountId && goal.missing > 0
  )
  const hucha = type === 'transfer' && destino?.type === 'savings' && planes.length > 0

  useEffect(() => {
    api.goals.progress().then(setGoals).catch(() => undefined)
  }, [])

  // Cambiar de destino deja huérfano el plan elegido: era de la otra hucha.
  useEffect(() => {
    setGoalId((current) => (current && planes.some((goal) => goal.id === current) ? current : null))
    // Con la lista de planes basta: cambia cuando cambia el destino.
  }, [toAccountId, goals])


  useEffect(() => {
    if (!existing) return
    api.attachments.list(existing.id).then(setAttachments).catch(fail('las facturas'))
  }, [existing])

  // Un gasto puede tener varias devoluciones: la suscripción compartida entre
  // cuatro son tres reembolsos sobre el mismo cobro.
  useEffect(() => {
    if (!existing || existing.type !== 'expense') return
    api.transactions.refundsFor(existing.id).then(setRefunds).catch(fail('los reembolsos'))
  }, [existing, refunding])

  // Solo depende de la lista de adjuntos: si dependiera también de las
  // miniaturas ya cargadas, se volvería a ejecutar entero con cada imagen.
  useEffect(() => {
    for (const attachment of attachments) {
      if (!attachment.mime?.startsWith('image/')) continue
      api.attachments
        .data(attachment.id)
        .then((data) => {
          if (!data) return
          setPreviews((current) => (current[attachment.id] ? current : { ...current, [attachment.id]: data }))
        })
        // Una miniatura que no carga no merece interrumpir: el archivo sigue ahí.
        .catch(() => undefined)
    }
  }, [attachments])

  /**
   * Elegir la factura no depende de que el movimiento exista: se apunta el
   * archivo y se copia al guardar. Así se sube en el mismo gesto en que se
   * registra la compra, sin el paso intermedio de guardar y volver a entrar.
   */
  async function pickInvoices(): Promise<void> {
    const picked = await run(() => api.attachments.pick())
    if (picked && picked.length) setPending((current) => [...current, ...picked])
  }

  async function save(keepOpen = false): Promise<void> {
    setError(null)
    if (!accountId) return setError('Elige una cuenta')
    if (amount <= 0) return setError('Escribe un importe mayor que cero')
    if (type === 'transfer' && !toAccountId) return setError('Elige la cuenta de destino')
    if (type === 'refund' && !refundForId) return setError('Elige el gasto que te devuelven')

    setSaving(true)
    const saved = await run(
      () =>
        api.transactions.save({
          id: existing?.id,
          type,
          date,
          time: time || null,
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          goalId: hucha ? goalId : null,
          categoryId: type === 'transfer' ? null : categoryId,
          amount,
          note: note || null,
          refundForId
        }),
      existing ? 'Movimiento actualizado' : 'Movimiento guardado'
    )
    setSaving(false)

    if (!saved) return

    /*
     * Y su programación, si se ha pedido.
     *
     * La próxima cae una vuelta después de este movimiento, que ya está pagado.
     * Se registra sola, como las demás; si no se quiere, se apaga desde su ficha.
     */
    if (repite && !existing) {
      await run(
        () =>
          api.scheduled.save({
            type,
            accountId,
            // Un traspaso programado necesita su destino, y si entra en una
            // hucha, el plan al que va: lo mismo que el movimiento que acaba de
            // guardarse, para que la copia mensual sea de verdad una copia.
            toAccountId: type === 'transfer' ? toAccountId : null,
            goalId: type === 'transfer' && hucha ? goalId : null,
            categoryId: type === 'transfer' ? null : categoryId,
            amount,
            note: note || null,
            freq,
            interval,
            nextDate: nextOccurrence(date, freq, interval),
            endDate: endDate || null,
            autoPost: true,
            remind: true,
            isDebt: esDeuda && type === 'expense',
            lender: esDeuda && type === 'expense' ? lender || null : null
          }),
        'Repetición programada'
      )
    }

    if (pending.length > 0) {
      const added = await run(() => api.attachments.attach(saved.id, pending.map((item) => item.path)))
      // Si alguna factura falla, el movimiento ya está guardado y el aviso lo
      // explica: no se deshace nada por un archivo que no se pudo copiar.
      if (added) {
        setAttachments((current) => [...current, ...added])
        setPending([])
      }
    }

    if (keepOpen) {
      // "Guardar y otro": se conserva el contexto y se limpia lo que es de ese
      // movimiento y no del siguiente.
      setAmount(0)
      setNote('')
      setAttachments([])
      setPreviews({})
      setPending([])
      toast('Listo para el siguiente', 'info')
      return
    }
    onSaved?.()
    onClose()
  }

  async function remove(): Promise<void> {
    if (!existing) return
    await run(() => api.transactions.remove(existing.id), 'Movimiento eliminado')
    onClose()
  }

  const typeTone =
    type === 'expense'
      ? 'var(--negative)'
      : type === 'transfer'
        ? 'var(--accent)'
        : 'var(--positive)'

  return (
    <>
      <Modal
        title={refundFor ? 'Registrar reembolso' : existing ? 'Editar movimiento' : 'Nuevo movimiento'}
        onClose={onClose}
        footer={
          <>
            {existing && (
              <button className="btn ghost danger spacer" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={16} />
                Eliminar
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            {!existing && (
              <button className="btn" onClick={() => save(true)} disabled={saving}>
                Guardar y otro
              </button>
            )}
            <button className="btn primary" onClick={() => save(false)} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {refundFor ? (
          <div className="refund-banner">
            <Icon name="refund" size={18} />
            <div style={{ minWidth: 0 }}>
              <strong>Devolución de un gasto</strong>
              <div className="small muted truncate">
                {refundFor.categoryName ?? 'Sin categoría'}
                {refundFor.note ? ` · ${refundFor.note}` : ''} · {formatDate(refundFor.date)} ·{' '}
                {formatMoney(refundFor.amount, refundFor.accountCurrency)}
              </div>
              {refundFor.refundedTotal > 0 && (
                <div className="small muted">
                  Ya reembolsado {formatMoney(refundFor.refundedTotal, refundFor.accountCurrency)}; quedan{' '}
                  {formatMoney(refundFor.amount - refundFor.refundedTotal, refundFor.accountCurrency)}.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'center' }}>
            {/*
             * En un gasto que ya existe, el cuarto botón no dice qué es esto: abre
             * la devolución de esto. «Reembolso» arriba y «Registrar reembolso»
             * abajo eran dos puertas a lo mismo en la misma ficha, y la de abajo
             * sobra ahora.
             *
             * Solo en los gastos: una devolución cuelga de un gasto, así que en un
             * ingreso o en un traspaso no hay nada que devolver, y ahí el cuarto
             * botón sigue siendo el tipo de siempre.
             */}
            <Segmented
              value={type}
              onChange={(elegido) => {
                if (elegido === 'refund' && existing?.type === 'expense') {
                  setRefunding(true)
                  return
                }
                setType(elegido)
              }}
              options={[
                { value: 'expense', label: 'Gasto', tone: 'expense' },
                { value: 'income', label: 'Ingreso', tone: 'income' },
                { value: 'transfer', label: 'Traspaso', tone: 'transfer' },
                existing?.type === 'expense'
                  ? { value: 'refund', label: 'Registrar reembolso', tone: 'refund' }
                  : { value: 'refund', label: 'Reembolso', tone: 'refund' }
              ]}
            />
          </div>
        )}

        {/* Debajo, la otra mitad de la misma pregunta: qué es esto y si vuelve.
            Se repite lo que sea: el alquiler, la nómina, el traspaso mensual a la
            hucha y la parte del alquiler que devuelve el otro. «Deuda a plazos»
            solo en los gastos, que no se debe dinero cobrándolo. Devolviendo un
            gasto concreto tampoco: esa devolución es de ese gasto y de ninguno
            más. */}
        {!existing && !refundFor && (
          <Field>
            <Segmented
              value={comportamiento}
              onChange={setComportamiento}
              options={
                type === 'expense'
                  ? [
                      { value: 'suelto', label: 'No se repite' },
                      { value: 'repite', label: 'Se repite' },
                      { value: 'deuda', label: 'Deuda a plazos' }
                    ]
                  : [
                      { value: 'suelto', label: 'No se repite' },
                      { value: 'repite', label: 'Se repite' }
                    ]
              }
            />
          </Field>
        )}

        {/* Lo primero que se piensa de un movimiento es qué fue, no cuánto: el
            título encabeza y se lleva el foco. De una línea, que es un título y no
            un cuaderno. */}
        <Field label="Título">
          <input
            className="input"
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              type === 'refund' ? 'Quién te devuelve, de qué…' : 'Comercio, detalle, lo que quieras recordar…'
            }
          />
        </Field>

        <div style={{ borderLeft: `3px solid ${typeTone}`, paddingLeft: 12 }}>
          <Field label="Importe" required>
            <AmountInput
              value={amount}
              currency={currency}
              onChange={setAmount}
              invalid={amount <= 0 && error != null}
            />
          </Field>
        </div>

        <div className="grid cols-2">
          <Field label={type === 'transfer' ? 'Desde' : 'Cuenta'} required>
            <select
              className="select"
              value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Elige una cuenta…</option>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {formatMoney(item.balance, item.currency)}
                </option>
              ))}
            </select>
          </Field>

          {type === 'transfer' ? (
            <Field label="Hacia" required>
              <select
                className="select"
                value={toAccountId ?? ''}
                onChange={(e) => setToAccountId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Elige una cuenta…</option>
                {accounts
                  .filter((item) => item.id !== accountId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatMoney(item.balance, item.currency)}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <Field label="Fecha">
              <DateInput value={date} onChange={setDate} />
            </Field>
          )}
        </div>

        {/* Meter dinero en la hucha y decidir para qué es suelen ser el mismo
            gesto. Sin elegir plan se queda como ahorro libre, que es lo que pasa
            si no se dice nada: el reparto no se hace solo. */}
        {hucha && (
          <Field label="¿A qué plan?">
            <select
              className="select"
              value={goalId ?? ''}
              onChange={(e) => setGoalId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Ahorro libre · sin asignar</option>
              {planes.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name} · le faltan {formatMoney(goal.missing, settings.baseCurrency)}
                </option>
              ))}
            </select>
          </Field>
        )}

        {type === 'transfer' && (
          <Field label="Fecha">
            <DateInput value={date} onChange={setDate} />
          </Field>
        )}

        {/* El reembolso no elige categoría: se queda con la del gasto que devuelve. */}
        {type !== 'transfer' && type !== 'refund' && (
          <Field label="Categoría">
            <div className="icon-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))', maxHeight: 190 }}>
              {visibleCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={category.id === categoryId ? 'active' : undefined}
                  style={{ aspectRatio: 'auto', padding: '8px 4px', flexDirection: 'column', gap: 4, display: 'flex', alignItems: 'center' }}
                  onClick={() => setCategoryId(category.id === categoryId ? null : category.id)}
                  title={category.name}
                >
                  <Avatar icon={category.icon} color={category.color} size="small" />
                  <span style={{ fontSize: 10.5, lineHeight: 1.15, textAlign: 'center' }} className="truncate">
                    {category.name}
                  </span>
                </button>
              ))}

              {/* La categoría que falta se crea aquí mismo: salir a Categorías
                  obligaba a tirar el movimiento a medio escribir. */}
              <button
                type="button"
                className="cat-new"
                style={{ aspectRatio: 'auto', padding: '8px 4px', flexDirection: 'column', gap: 4, display: 'flex', alignItems: 'center' }}
                onClick={() => setCreatingCategory(true)}
                title="Crear una categoría"
              >
                <span className="cat-new-mark">
                  <Icon name="plus" size={16} strokeWidth={2.4} />
                </span>
                <span style={{ fontSize: 10.5, lineHeight: 1.15, textAlign: 'center' }} className="truncate">
                  Nueva
                </span>
              </button>
            </div>
          </Field>
        )}

        {/* Lo único que hay que elegir: de ahí sale la categoría y de ahí se
            descuenta la devolución. Solo los gastos del día que marque la fecha. */}
        {type === 'refund' && !refundFor && (
          <Field
            label="Gasto que te devuelven"
            required
            hint={
              candidates.length === 0
                ? `Ningún gasto del ${formatDate(date)} tiene nada pendiente. Cambia la fecha o hazlo desde el gasto.`
                : 'Se descuenta de ese gasto y hereda su categoría.'
            }
          >
            <select
              className="select"
              value={refundForId ?? ''}
              disabled={candidates.length === 0}
              onChange={(e) => choose(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Elige el gasto…</option>
              {candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {/* Sin nota queda la categoría: una lista de importes sueltos
                      no dice de qué gasto se trata. */}
                  {item.note || item.categoryName || 'Sin categoría'} ·{' '}
                  {formatMoney(item.amount, item.accountCurrency)}
                  {item.date !== date ? ` · ${formatDate(item.date)}` : ''}
                  {item.refundedTotal > 0
                    ? ` · quedan ${formatMoney(item.amount - item.refundedTotal, item.accountCurrency)}`
                    : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        {!existing && !refundFor && (
          <>
            {repite && (
              <div className="grid cols-2" style={{ marginTop: 10 }}>
                <Field label="Repetición">
                  <div className="row tight">
                    <NumberInput
                      value={interval}
                      onChange={setInterval}
                      min={1}
                      max={99}
                      style={{ width: 74 }}
                    />
                    <select
                      className="select"
                      value={freq}
                      onChange={(event) => setFreq(event.target.value as Frequency)}
                    >
                      {FRECUENCIAS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {interval === 1 ? item.singular : item.plural}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>

                <Field
                  label="Termina el"
                  hint={esDeuda ? 'La fecha de la última cuota.' : 'Déjalo vacío si no tiene fin.'}
                >
                  <DateInput value={endDate} onChange={setEndDate} clearable />
                </Field>
              </div>
            )}

            {/* Quién cobra solo se pregunta en una deuda: en la compra del súper
                no hay financiera que valga. */}
            {esDeuda && (
              <Field label="Quién la cobra">
                <select
                  className="select"
                  value={lender}
                  onChange={(event) => setLender(event.target.value)}
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
          </>
        )}


        {/* Solo lo devuelto: el botón de registrar una devolución vive arriba, en
            el cuarto botón de la botonera. Sin nada devuelto no hay nada que ver. */}
        {existing?.type === 'expense' && refunds.length > 0 && (
          <Field label="Reembolsos">
            {refunds.length > 0 && (
              <div className="col" style={{ gap: 6, marginBottom: 8 }}>
                {refunds.map((refund) => (
                  <div key={refund.id} className="refund-row">
                    <Icon name="refund" size={15} />
                    <span className="truncate" style={{ flex: 1 }}>
                      {refund.note || 'Devolución'}
                      <span className="muted small"> · {formatDate(refund.date)}</span>
                    </span>
                    <span className="amount positive">
                      {formatMoney(refund.amount, refund.accountCurrency)}
                    </span>
                  </div>
                ))}
                <div className="row small">
                  <span className="muted">
                    Devuelto {formatMoney(existing.refundedTotal, existing.accountCurrency)} de{' '}
                    {formatMoney(existing.amount, existing.accountCurrency)}
                  </span>
                  <span className="spacer" />
                  <strong>
                    Te cuesta {formatMoney(existing.amount - existing.refundedTotal, existing.accountCurrency)}
                  </strong>
                </div>
              </div>
            )}
          </Field>
        )}

        {keepsInvoices && (
          <Field label="Facturas">
            {(attachments.length > 0 || pending.length > 0) && (
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="pill" style={{ paddingRight: 4 }}>
                    {previews[attachment.id] ? (
                      <img
                        src={previews[attachment.id]}
                        alt={attachment.originalName}
                        style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => api.attachments.open(attachment.id)}
                      />
                    ) : (
                      <Icon name="paperclip" size={13} />
                    )}
                    <span className="truncate" style={{ maxWidth: 130 }}>
                      {attachment.originalName}
                    </span>
                    <button
                      onClick={async () => {
                        await run(() => api.attachments.remove(attachment.id))
                        setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                      }}
                      aria-label="Quitar factura"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}

                {/* Las elegidas y aún sin copiar van atenuadas: se guardan con el movimiento. */}
                {pending.map((item) => (
                  <div key={item.path} className="pill pending" style={{ paddingRight: 4 }}>
                    <Icon name="paperclip" size={13} />
                    <span className="truncate" style={{ maxWidth: 130 }}>
                      {item.name}
                    </span>
                    <button
                      onClick={() => setPending((current) => current.filter((p) => p.path !== item.path))}
                      aria-label="Quitar factura"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn small" onClick={pickInvoices}>
              <Icon name="paperclip" size={14} />
              Subir factura
            </button>
          </Field>
        )}

        {error && <div className="field-error">{error}</div>}
      </Modal>

      {creatingCategory && (
        <CategoryModal
          category={null}
          defaultKind={type === 'income' ? 'income' : 'expense'}
          onClose={() => setCreatingCategory(false)}
          onSave={async (input) => {
            const saved = await run(() => api.categories.save(input), 'Categoría creada')
            // Se crea desde aquí porque hace falta ahora: queda elegida.
            if (saved) setCategoryId(saved.id)
            return saved
          }}
        />
      )}

      {/* Guardada la devolución, se cierra también la ficha del gasto: registrarla
          era lo que se venía a hacer, y quedarse mirando el formulario de debajo
          se lee como si no hubiera pasado nada. Cancelando, en cambio, se vuelve
          al gasto, que es de donde se salió. */}
      {refunding && existing && (
        <TransactionForm
          refundFor={existing}
          onClose={() => setRefunding(false)}
          onSaved={onClose}
        />
      )}

      {confirmDelete && (
        <Confirm
          title="Eliminar movimiento"
          message="El movimiento y sus adjuntos se borrarán definitivamente."
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </>
  )
}

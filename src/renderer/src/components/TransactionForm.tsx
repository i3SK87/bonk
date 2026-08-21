import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Modal, Field, AmountInput, Avatar, Segmented, Confirm, Checkbox, NumberInput } from './ui'
import { Icon } from './Icon'
import { DateInput } from './DateInput'
import { useStore, usePreferredAccountId } from '../lib/store'
import { CategoryModal } from './CategoryForm'
import { today, formatDate, nextOccurrence } from '@shared/dates'
import { formatMoney } from '@shared/money'
import { FRECUENCIAS } from '../lib/frecuencias'
import type { Attachment, Frequency, GoalProgress, TransactionView, TxType } from '@shared/types'

const api = window.bonk

interface Props {
  existing?: TransactionView | null
  defaultAccountId?: number
  /** Gasto del que se está registrando una devolución. */
  refundFor?: TransactionView | null
  onClose: () => void
}

export function TransactionForm({ existing, defaultAccountId, refundFor, onClose }: Props): ReactNode {
  const { accounts, categories, run, toast, settings, fail } = useStore()
  const preferredAccountId = usePreferredAccountId()

  const [type, setType] = useState<TxType>(existing?.type ?? (refundFor ? 'refund' : 'expense'))
  const [amount, setAmount] = useState(existing?.amount ?? 0)
  const [accountId, setAccountId] = useState(
    existing?.accountId ?? refundFor?.accountId ?? defaultAccountId ?? preferredAccountId
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
  const [repite, setRepite] = useState(false)
  const [freq, setFreq] = useState<Frequency>('monthly')
  const [interval, setInterval] = useState(1)
  const [endDate, setEndDate] = useState('')
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

  // Una deuda a plazos sin programación no sale en Deudas, y una suscripción
  // apuntada a mano se olvida al mes siguiente: en las dos, la repetición se
  // ofrece con el interruptor ya puesto.
  const categoria = categories.find((item) => item.id === categoryId)
  const esDeuda = categoria?.isDebt === true
  const seRepiteSola = esDeuda || categoria?.recurring === true

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

  // Si la cuenta elegida ya no está en la lista —porque los datos aún no habían
  // llegado al montar, o porque se archivó— se vuelve a la principal.
  useEffect(() => {
    if (accounts.length > 0 && !accounts.some((item) => item.id === accountId)) {
      setAccountId(existing?.accountId ?? defaultAccountId ?? preferredAccountId)
    }
  }, [accounts, accountId, existing, defaultAccountId, preferredAccountId])

  // Al cambiar de gasto a ingreso la categoría anterior deja de tener sentido.
  useEffect(() => {
    if (type === 'transfer') {
      setCategoryId(null)
    } else if (categoryId && !visibleCategories.some((category) => category.id === categoryId)) {
      setCategoryId(null)
    }
  }, [type, categoryId, visibleCategories])

  // Al elegir una categoría de deuda se propone repetir; al salir de ella, se
  // recoge la propuesta si no se ha tocado nada.
  useEffect(() => {
    if (!existing) setRepite(seRepiteSola)
  }, [seRepiteSola, existing])

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
    if (repite && !existing && type !== 'transfer') {
      await run(
        () =>
          api.scheduled.save({
            type,
            accountId,
            categoryId,
            amount,
            note: note || null,
            freq,
            interval,
            nextDate: nextOccurrence(date, freq, interval),
            endDate: endDate || null,
            autoPost: true,
            remind: true
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
            <Segmented
              value={type}
              onChange={setType}
              options={[
                { value: 'expense', label: 'Gasto', tone: 'expense' },
                { value: 'income', label: 'Ingreso', tone: 'income' },
                { value: 'transfer', label: 'Traspaso', tone: 'transfer' },
                { value: 'refund', label: 'Reembolso', tone: 'refund' }
              ]}
            />
          </div>
        )}

        {type === 'refund' && !refundFor && (
          <p className="field-hint">
            Un reembolso entra en tu cuenta pero descuenta del gasto al que lo enlaces, en vez de contar como
            ingreso. Elige abajo el gasto que te devuelven.
          </p>
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
          <Field label="Importe">
            <AmountInput
              value={amount}
              currency={currency}
              onChange={setAmount}
              invalid={amount <= 0 && error != null}
            />
          </Field>
        </div>

        <div className="grid cols-2">
          <Field label={type === 'transfer' ? 'Desde' : 'Cuenta'}>
            <select className="select" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {formatMoney(item.balance, item.currency)}
                </option>
              ))}
            </select>
          </Field>

          {type === 'transfer' ? (
            <Field label="Hacia">
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
            hint={
              candidates.length === 0
                ? `Ningún gasto del ${formatDate(date)} tiene algo pendiente de devolver. Cambia la fecha, o apunta el reembolso desde la ficha del gasto.`
                : 'La devolución se descuenta de ese gasto y hereda su categoría.'
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

        {!existing && type !== 'transfer' && (
          <>
            <Checkbox
              checked={repite}
              onChange={setRepite}
              label="Se repite cada cierto tiempo"
              hint={
                esDeuda
                  ? 'Una deuda vive de su repetición: sin ella no sale en Deudas ni se sabe cuánto queda.'
                  : 'Suscripciones, recibos, cuotas: la próxima vez se registra sola.'
              }
            />
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
          </>
        )}


        {existing?.type === 'expense' && (
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
            <button className="btn small" onClick={() => setRefunding(true)}>
              <Icon name="refund" size={14} />
              Registrar reembolso
            </button>
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

      {refunding && existing && (
        <TransactionForm refundFor={existing} onClose={() => setRefunding(false)} />
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

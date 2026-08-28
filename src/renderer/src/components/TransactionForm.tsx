import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Modal, Field, AmountInput, Avatar, Segmented, Confirm } from './ui'
import { Icon } from './Icon'
import { DateInput } from './DateInput'
import { useStore } from '../lib/store'
import { CategoryModal } from './CategoryForm'
import { today, formatDate, nextOccurrence } from '@shared/dates'
import { formatMoney } from '@shared/money'
import {
  DetallesRepeticion,
  ResumenRepeticion,
  type CampoRepeticion
} from './DetallesRepeticion'
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

/**
 * Lo que falta por rellenar, y de qué campo es.
 *
 * Solo sale uno cada vez: la comprobación para en el primero que falla, que es
 * el orden en que se leen los campos.
 */
interface Aviso {
  campo: 'cuenta' | 'importe' | 'destino' | 'reembolso'
  texto: string
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
  /*
   * El cuadro con los detalles de la elección, y a qué se vuelve si se cancela.
   *
   * Marcar «Cíclico» sin decir cada cuánto no es una respuesta a medias: es
   * una respuesta que la ficha se inventaría por ti. Así que la elección abre
   * el cuadro, y cancelarlo deshace la elección.
   */
  const [detalles, setDetalles] = useState<'repite' | 'deuda' | null>(null)
  const [comportamientoAnterior, setComportamientoAnterior] = useState<
    'suelto' | 'repite' | 'deuda'
  >('suelto')
  const camposDe = (cual: 'repite' | 'deuda'): CampoRepeticion[] =>
    cual === 'deuda' ? ['repeticion', 'fin', 'prestamista'] : ['repeticion', 'fin']
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
  /*
   * Los avisos de lo que falta van con el nombre de su campo puesto.
   *
   * Antes era un texto a secas y salía al pie del cuadro, a media pantalla del
   * campo que lo provocaba: con la lista de categorías de por medio, «escribe
   * un importe mayor que cero» aparecía tan lejos del importe que había que
   * buscar a qué se refería. Sabiendo de quién es cada aviso, cada uno sale
   * debajo del suyo.
   */
  const [error, setError] = useState<Aviso | null>(null)
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
   *
   * En un traspaso, la cuenta que recibe es el destino. En un ingreso es la
   * cuenta del movimiento: la paga extra que entra derecha en la hucha es
   * ahorro igual que si hubiera pasado por el banco, y antes había que apuntar
   * el ingreso y luego repartirlo a mano desde Ahorro.
   */
  const cuentaQueRecibe = type === 'transfer' ? toAccountId : type === 'income' ? accountId : null
  const destino = accounts.find((item) => item.id === cuentaQueRecibe)
  const planes = goals.filter(
    (goal) => !goal.achievedAt && goal.accountId === cuentaQueRecibe && goal.missing > 0
  )
  const hucha = destino?.type === 'savings' && planes.length > 0

  useEffect(() => {
    api.goals.progress().then(setGoals).catch(() => undefined)
  }, [])

  // Cambiar de cuenta deja huérfano el plan elegido: era de la otra hucha.
  useEffect(() => {
    setGoalId((current) => (current && planes.some((goal) => goal.id === current) ? current : null))
    // Con la lista de planes basta: cambia cuando cambia la cuenta que recibe.
  }, [cuentaQueRecibe, goals])


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

  /**
   * Lo que se hace después de guardar, salga movimiento o programada.
   *
   * «Guardar y seguir» conserva el contexto —la cuenta, el tipo, la fecha— y
   * limpia lo que era de ese apunte y no del siguiente.
   */
  function terminar(keepOpen: boolean): void {
    if (keepOpen) {
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

  async function save(keepOpen = false): Promise<void> {
    setError(null)
    if (!accountId) return setError({ campo: 'cuenta', texto: 'Elige una cuenta' })
    if (amount <= 0) return setError({ campo: 'importe', texto: 'Escribe un importe mayor que cero' })
    if (type === 'transfer' && !toAccountId)
      return setError({ campo: 'destino', texto: 'Elige la cuenta de destino' })
    if (type === 'refund' && !refundForId)
      return setError({ campo: 'reembolso', texto: 'Elige el gasto que te devuelven' })

    /*
     * Con la fecha por delante no sale un movimiento, sale una programada.
     *
     * El saldo suma todos los movimientos sin mirar la fecha, así que apuntar
     * hoy el recibo del día 5 dejaba el dinero descontado cinco días antes de
     * salir de la cuenta. Lo que todavía no ha pasado es algo que va a pasar, y
     * eso ya tiene su sitio: se registra solo el día que le toca.
     *
     * Dos cosas no pueden hacer el viaje, y por eso se quedan como movimiento:
     * las facturas cuelgan de un movimiento y se irían con él, y un reembolso
     * apunta a un gasto concreto que una programada no sabe señalar. En ambos
     * casos el aviso lo dice, que si no parecería que la regla falla a ratos.
     */
    const futuro = date > today()
    const conFacturas = pending.length > 0 || attachments.length > 0
    if (futuro && type !== 'refund' && !conFacturas) {
      setSaving(true)
      const programada = await run(
        () =>
          api.transactions.program({
            id: existing?.id,
            type,
            date,
            accountId,
            toAccountId: type === 'transfer' ? toAccountId : null,
            goalId: hucha ? goalId : null,
            categoryId: type === 'transfer' ? null : categoryId,
            amount,
            note: note || null,
            // Marcado como cíclico, la programada nace con su cadencia y empieza
            // ese día; suelto, es de una vez y se acaba ahí.
            cadencia: repite ? { freq, interval, endDate: endDate || null } : null,
            isDebt: esDeuda && type === 'expense',
            lender: esDeuda && type === 'expense' ? lender || null : null
          }),
        `Programado para el ${formatDate(date)}`
      )
      setSaving(false)
      if (!programada) return
      terminar(keepOpen)
      return
    }

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
      futuro
        ? conFacturas
          ? 'Lleva facturas, así que se queda como movimiento'
          : 'Un reembolso no se puede programar: se queda como movimiento'
        : existing
          ? 'Movimiento actualizado'
          : 'Movimiento guardado'
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
            // Un traspaso programado necesita su destino, y si el dinero entra
            // en una hucha, el plan al que va: lo mismo que el movimiento que
            // acaba de guardarse, para que la copia mensual sea de verdad una
            // copia.
            toAccountId: type === 'transfer' ? toAccountId : null,
            goalId: hucha ? goalId : null,
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

    terminar(keepOpen)
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
            {/* Guarda igual que el de al lado, así que va del mismo color:
                perfilado y no relleno, que el relleno es de la acción con la que
                se cierra la ficha. Se llamó «Guardar y otro», que no lo dice
                nadie, y «Seguir añadiendo» se callaba lo importante —que esto
                guarda—; quien duda de si ha guardado no pulsa. */}
            {!existing && (
              <button
                className="btn acento"
                onClick={() => save(true)}
                disabled={saving}
                title="Guarda este movimiento y deja la ficha abierta para el siguiente"
              >
                Guardar y seguir
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
            Cíclico puede serlo cualquier cosa: el alquiler, la nómina, el traspaso
            mensual a la hucha y la parte del alquiler que devuelve el otro. «Deuda a plazos»
            solo en los gastos, que no se debe dinero cobrándolo. Devolviendo un
            gasto concreto tampoco: esa devolución es de ese gasto y de ninguno
            más. */}
        {!existing && !refundFor && (
          <Field>
            <Segmented
              value={comportamiento}
              onChange={(elegido) => {
                if (elegido === 'suelto') {
                  setComportamiento('suelto')
                  return
                }
                // Volviendo a pulsar la que ya está puesta se reabre el cuadro:
                // es la otra forma de llegar a él, además del «Cambiar».
                setComportamientoAnterior(comportamiento)
                setComportamiento(elegido)
                setDetalles(elegido)
              }}
              options={
                type === 'expense'
                  ? [
                      { value: 'suelto', label: 'Único' },
                      { value: 'repite', label: 'Cíclico' },
                      { value: 'deuda', label: 'Deuda a plazos' }
                    ]
                  : [
                      { value: 'suelto', label: 'Único' },
                      { value: 'repite', label: 'Cíclico' }
                    ]
              }
            />
            {repite && (
              <ResumenRepeticion
                campos={camposDe(comportamiento === 'deuda' ? 'deuda' : 'repite')}
                valores={{ freq, interval, endDate, lender }}
                onCambiar={() => {
                  setComportamientoAnterior(comportamiento)
                  setDetalles(comportamiento === 'deuda' ? 'deuda' : 'repite')
                }}
              />
            )}
          </Field>
        )}

        {/*
          * En una devolución, primero de qué gasto.
          *
          * De ahí salen la categoría y de dónde se descuenta, así que es la
          * pregunta de la que dependen las demás: elegirlo al final, después de
          * haber puesto título e importe, es hacerlo al revés. Solo los gastos
          * del día que marque la fecha.
          */}
        {type === 'refund' && !refundFor && (
          <Field
            label="Gasto que te devuelven"
            required
            error={error?.campo === 'reembolso' ? error.texto : undefined}
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

        {/* El importe encabeza: es el único dato que este cuadro no puede
            inventar —sin él no se guarda— y el que se viene a teclear. El título
            va detrás porque se puede dejar vacío. */}
        <div style={{ borderLeft: `3px solid ${typeTone}`, paddingLeft: 12 }}>
          <Field
            label="Importe"
            required
            error={error?.campo === 'importe' ? error.texto : undefined}
          >
            <AmountInput
              value={amount}
              currency={currency}
              onChange={setAmount}
              autoFocus
              /* Se recuadra en rojo solo cuando el aviso es suyo. Mirando si el
                 importe estaba a cero y había *algún* error, se recuadraba
                 también al faltar la cuenta: el importe todavía sin escribir no
                 es un importe mal escrito. */
              invalid={error?.campo === 'importe'}
            />
          </Field>
        </div>

        {/* De una línea, que es un título y no un cuaderno. El foco ya no
            empieza aquí: lo tiene el importe, que es el que va primero. */}
        <Field label="Título">
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              type === 'refund' ? 'Quién te devuelve, de qué…' : 'Comercio, detalle, lo que quieras recordar…'
            }
          />
        </Field>

        <div className="grid cols-2">
          <Field
            label={type === 'transfer' ? 'Desde' : 'Cuenta'}
            required
            error={error?.campo === 'cuenta' ? error.texto : undefined}
          >
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
            <Field
              label="Hacia"
              required
              error={error?.campo === 'destino' ? error.texto : undefined}
            >
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
      </Modal>

      {detalles && (
        <DetallesRepeticion
          titulo={detalles === 'deuda' ? 'Deuda a plazos' : 'Ciclo de repetición'}
          campos={camposDe(detalles)}
          valores={{ freq, interval, endDate, lender }}
          onCancelar={() => {
            setComportamiento(comportamientoAnterior)
            setDetalles(null)
          }}
          onGuardar={(nuevos) => {
            setFreq(nuevos.freq)
            setInterval(nuevos.interval)
            setEndDate(nuevos.endDate)
            setLender(nuevos.lender)
            setDetalles(null)
          }}
        />
      )}

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

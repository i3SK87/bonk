import { useEffect, useState, type ReactNode } from 'react'
import { useStore, usePreferredAccountId } from '../lib/store'
import { nestByParent } from '../lib/nesting'
import { Icon } from '../components/Icon'
import {
  Modal,
  Field,
  Checkbox,
  AmountInput,
  NumberInput,
  Confirm,
  EmptyState,
  Avatar,
  Segmented,
  Loading,
  AccionCabecera,
} from '../components/ui'
import { formatMoney } from '@shared/money'
import { LENDERS } from '@shared/lenders'
import { FRECUENCIAS, describeFrequency } from '../lib/frecuencias'
import { DateInput } from '../components/DateInput'
import { formatDate, relativeDays, today } from '@shared/dates'
import type { Frequency, GoalProgress, ScheduledView, TxType } from '@shared/types'

const api = window.bonk

/**
 * Cómo se llama una programación en la lista. Las nuevas solo tienen nota; las
 * de antes podían tener además un nombre, y ese manda mientras exista.
 */
function titleOf(row: Pick<ScheduledView, 'name' | 'note' | 'categoryName'>): string {
  return row.name || row.note || row.categoryName || 'Movimiento programado'
}

/**
 * Cómo se lee un gasto programado en el desplegable de reembolsos. La categoría
 * dice de qué es y la nota dice cuál: dos recibos de la misma categoría e
 * importe parecido no se distinguen de ninguna otra forma.
 */
function refundOptionLabel(row: ScheduledView): string {
  const category = row.categoryName ?? 'Sin categoría'
  // El nombre solo lo llevan las programaciones de antes del campo nota.
  const note = row.note || row.name
  return [
    category,
    note && note !== category ? note : null,
    formatMoney(row.amount, row.accountCurrency),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function SchedulesView(): ReactNode {
  const { categories, revision, run, toast, fail } = useStore()
  const [rows, setRows] = useState<ScheduledView[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ScheduledView | null>(null)
  const [creating, setCreating] = useState(false)
  const [finishing, setFinishing] = useState<ScheduledView | null>(null)
  const [hoveredFamily, setHoveredFamily] = useState<number | null>(null)

  /**
   * Una cuota de deuda no se pausa, se termina: si la saldas antes de tiempo
   * esas cuotas ya no van a existir. Lo marca la categoría, no el nombre, para
   * que renombrarla no rompa nada.
   */
  const isDebt = (row: ScheduledView): boolean =>
    categories.some((category) => category.id === row.categoryId && category.isDebt)

  useEffect(() => {
    setLoading(true)
    api.scheduled
      .list()
      .then(setRows)
      .catch(fail('las programadas'))
      .finally(() => setLoading(false))
  }, [revision])

  /**
   * Finalizada es la que lleva sello: el plan se agotó o se cerró a mano. Una
   * pausada también está apagada, pero se queda en la lista principal en gris,
   * esperando a que la reanuden.
   */
  const isFinished = (row: ScheduledView): boolean => row.settledAt != null
  const vigentes = rows.filter((row) => !isFinished(row))
  const finalizadas = rows.filter(isFinished)

  const overdue = rows.filter((row) => row.active && row.nextDate <= today())

  /**
   * Un gasto programado y la devolución que cuelga de él son la misma historia:
   * el alquiler entero y la parte que pone el otro. Cada uno apunta a su familia
   * —el id del gasto— para poder encenderlos juntos al pasar por encima, igual
   * que en Movimientos.
   */
  const families = new Map<number, number>()
  const conDevolucion = new Set(
    rows.map((row) => row.refundForScheduledId).filter((id): id is number => id != null),
  )
  for (const row of rows) {
    if (row.refundForScheduledId) families.set(row.id, row.refundForScheduledId)
    else if (conDevolucion.has(row.id)) families.set(row.id, row.id)
  }

  return (
    <>
      {overdue.length > 0 && (
        <div className="card card-body row" style={{ borderColor: 'var(--warning)' }}>
          <Icon name="alert" size={18} />
          <div className="small">
            Hay {overdue.length}{' '}
            {overdue.length === 1 ? 'programación vencida' : 'programaciones vencidas'} sin generar.
            Las que tienen registro automático se crean al abrir la aplicación.
          </div>
        </div>
      )}

      <div className="card flush">
        <AccionCabecera>
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            Nueva programación
          </button>
        </AccionCabecera>

        {loading ? (
          <Loading />
        ) : vigentes.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nada programado"
            message="Programa el alquiler, la nómina o las suscripciones y se registrarán solas."
            action={
              <button className="btn primary" onClick={() => setCreating(true)}>
                Crear la primera
              </button>
            }
          />
        ) : (
          nestByParent(
            vigentes,
            (row) => row.id,
            (row) => row.refundForScheduledId,
          ).map(({ row, nested, last }) => {
            const family = families.get(row.id)
            const active = family !== undefined && family === hoveredFamily
            return (
              <div
                key={row.id}
                className={[
                  'list-row',
                  row.active ? '' : 'paused',
                  // La anidada ya se ve colgando: la marca del canto sobraría.
                  family !== undefined && !nested ? 'linked' : '',
                  active ? 'linked-active' : '',
                  nested ? 'nested' : '',
                  nested && !last ? 'nested-continues' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => family !== undefined && setHoveredFamily(family)}
                onMouseLeave={() => family !== undefined && setHoveredFamily(null)}
              >
                <Avatar
                  icon={row.type === 'transfer' ? 'transfer' : (row.categoryIcon ?? 'repeat')}
                  color={row.type === 'transfer' ? '#0A84FF' : (row.categoryColor ?? '#8E8E93')}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row tight">
                    <span style={{ fontWeight: 570 }} className="truncate">
                      {titleOf(row)}
                    </span>
                    {/* La categoría manda en los informes, así que se ve sin abrir la ficha.
                        Estorba cuando el nombre ya es la propia categoría, y en un
                        reembolso, que cuelga del gasto que la lleva justo encima. */}
                    {row.type !== 'refund' && row.categoryName && row.categoryName !== titleOf(row) && (
                      <span className="pill">{row.categoryName}</span>
                    )}
                    {!row.active && (
                      <span className="pill">{isDebt(row) ? 'Finalizada' : 'En pausa'}</span>
                    )}
                  </div>
                  <div className="small muted truncate">
                    {row.type === 'refund' && (
                      <span className="pill" style={{ marginRight: 6 }}>
                        Reembolso
                      </span>
                    )}
                    {/* Un reembolso cuelga de su gasto, que dice la cuenta justo
                        encima: repetirla ahí es llenar la línea de lo mismo. */}
                    {describeFrequency(row.freq, row.interval)}
                    {row.type === 'refund' ? '' : ` · ${row.accountName}`}
                    {row.type === 'transfer' && row.toAccountName ? ` → ${row.toAccountName}` : ''}
                    {row.endDate ? ` · Hasta el ${formatDate(row.endDate)}` : ''}
                    {!row.autoPost && ' · Registro manual'}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className={`amount ${row.type === 'expense' ? 'negative' : 'positive'}`}>
                    {formatMoney(
                      row.type === 'expense' ? -row.amount : row.amount,
                      row.accountCurrency,
                      { sign: row.type !== 'transfer' },
                    )}
                  </div>
                  <div className="small muted">
                    {row.active
                      ? `Próximo ${relativeDays(row.nextDate)}`
                      : formatDate(row.nextDate)}
                  </div>
                </div>

                <button
                  className="btn small"
                  title="Registrar ahora sin esperar a la fecha"
                  onClick={async () => {
                    await run(() => api.scheduled.postNow(row.id))
                    toast('Movimiento registrado', 'success')
                  }}
                >
                  <Icon name="check" size={15} />
                </button>
                {isDebt(row) && row.active ? (
                  <button
                    className="btn ghost icon"
                    title="Finalizar: la deuda queda saldada y no se generan más cuotas"
                    onClick={() => setFinishing(row)}
                  >
                    <Icon name="finish" size={16} />
                  </button>
                ) : (
                  <button
                    className="btn ghost icon"
                    title={row.active ? 'Pausar' : 'Reanudar'}
                    onClick={() => run(() => api.scheduled.setActive(row.id, !row.active))}
                  >
                    <Icon name={row.active ? 'pause' : 'play'} size={16} />
                  </button>
                )}
                <button
                  className="btn ghost icon"
                  onClick={() => setEditing(row)}
                  aria-label="Editar"
                >
                  <Icon name="edit" size={16} />
                </button>
              </div>
            )
          })
        )}
      </div>

      {finalizadas.length > 0 && (
        <div className="card flush">
          <div className="card-header">
            <h2>Finalizadas</h2>
            <span className="small muted">
              Ya no generan nada. Para revivir una, quítale la fecha de fin desde su ficha.
            </span>
          </div>
          {finalizadas.map((row) => (
            <div key={row.id} className="list-row finished">
              <Avatar icon={row.categoryIcon ?? 'repeat'} color={row.categoryColor ?? '#8E8E93'} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row tight">
                  <span style={{ fontWeight: 570 }} className="truncate">
                    {titleOf(row)}
                  </span>
                  {row.categoryName && row.categoryName !== titleOf(row) && (
                    <span className="pill">{row.categoryName}</span>
                  )}
                </div>
                <div className="small muted truncate">
                  {row.type === 'refund' && (
                    <span className="pill" style={{ marginRight: 6 }}>
                      Reembolso
                    </span>
                  )}
                  {describeFrequency(row.freq, row.interval)} · {row.accountName} · Terminó el{' '}
                  {formatDate(row.endDate!)}
                </div>
              </div>
              <div className="amount">
                {formatMoney(
                  row.type === 'expense' ? -row.amount : row.amount,
                  row.accountCurrency,
                )}
              </div>
              <button
                className="btn ghost icon"
                onClick={() => setEditing(row)}
                aria-label="Editar"
              >
                <Icon name="edit" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {finishing && (
        <Confirm
          title="Finalizar la cuota"
          message={
            `«${titleOf(finishing)}» dejará de generar ` +
            'movimientos y se le pondrá fecha de fin hoy. Los pagos ya registrados se quedan como están.'
          }
          confirmLabel="Finalizar"
          onCancel={() => setFinishing(null)}
          onConfirm={async () => {
            await run(() => api.scheduled.finish(finishing.id), 'Cuota finalizada')
            setFinishing(null)
          }}
        />
      )}

      {(creating || editing) && (
        <ScheduleModal
          schedule={editing}
          siblings={rows}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={(input) =>
            run(
              () => api.scheduled.save(input),
              editing ? 'Programación actualizada' : 'Programación creada',
            )
          }
          onDelete={
            editing
              ? () => run(() => api.scheduled.remove(editing.id), 'Programación eliminada')
              : undefined
          }
        />
      )}
    </>
  )
}

/**
 * La ficha de una programación.
 *
 * Se exporta porque Deudas la abre también: una deuda nueva no es más que una
 * programación con una categoría de deuda, y montar allí un segundo formulario
 * con los mismos campos sería tener dos sitios donde arreglar el mismo fallo.
 */
export interface ScheduleModalProps {
  schedule: ScheduledView | null
  /** El resto de programadas, para poder colgar una devolución de su gasto. */
  siblings: ScheduledView[]
  /** Con qué categoría se abre una nueva, cuando quien la abre ya lo sabe. */
  defaultCategoryId?: number | null
  /**
   * Solo gasto: se abre desde Deudas, y una deuda no puede ser un ingreso ni un
   * traspaso. Con un solo tipo posible, el selector no pinta nada.
   */
  soloGasto?: boolean
  /** Cómo se titula. Desde Deudas esto no es «una programación», es una deuda. */
  titulo?: string
  onClose: () => void
  onSave: (input: unknown) => Promise<unknown>
  onDelete?: () => Promise<unknown>
}

export function ScheduleModal({
  schedule,
  siblings,
  defaultCategoryId,
  soloGasto,
  titulo,
  onClose,
  onSave,
  onDelete,
}: ScheduleModalProps): ReactNode {
  const { accounts, categories, settings } = useStore()
  const preferredAccountId = usePreferredAccountId()
  const [type, setType] = useState<TxType>(schedule?.type ?? 'expense')
  const [amount, setAmount] = useState(schedule?.amount ?? 0)
  const [accountId, setAccountId] = useState(schedule?.accountId ?? preferredAccountId)
  const [toAccountId, setToAccountId] = useState<number | null>(schedule?.toAccountId ?? null)
  const [goalId, setGoalId] = useState<number | null>(schedule?.goalId ?? null)
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(
    schedule?.categoryId ?? defaultCategoryId ?? null,
  )
  const [lender, setLender] = useState(schedule?.lender ?? '')
  const [freq, setFreq] = useState<Frequency>(schedule?.freq ?? 'monthly')
  const [interval, setInterval] = useState(schedule?.interval ?? 1)
  const [nextDate, setNextDate] = useState(schedule?.nextDate ?? today())
  const [endDate, setEndDate] = useState(schedule?.endDate ?? '')
  const [autoPost, setAutoPost] = useState(schedule?.autoPost ?? true)
  const [remind, setRemind] = useState(schedule?.remind ?? true)
  // Las programaciones de antes tenían nombre además de nota. Al abrir una de
  // esas, su nombre pasa a la nota: es lo que la lista enseñaba, y así no se
  // pierde al guardar sin el campo que ya no existe.
  const [note, setNote] = useState(schedule?.note || schedule?.name || '')
  const [refundForScheduledId, setRefundForScheduledId] = useState<number | null>(
    schedule?.refundForScheduledId ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  /**
   * Apartar lo mismo cada mes para el mismo plan es una decisión que se toma una
   * vez: aquí se dice, y cada vez que la programada entra el dinero va a su sitio.
   */
  const destino = accounts.find((item) => item.id === toAccountId)
  const planes = goals.filter(
    (goal) => !goal.achievedAt && goal.accountId === toAccountId && goal.missing > 0,
  )
  const hucha = type === 'transfer' && destino?.type === 'savings' && planes.length > 0

  useEffect(() => {
    api.goals
      .progress()
      .then(setGoals)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    setGoalId((current) => (current && planes.some((goal) => goal.id === current) ? current : null))
    // Basta con la lista: cambia cuando cambia el destino.
  }, [toAccountId, goals])

  const account = accounts.find((item) => item.id === accountId)
  const currency = account?.currency ?? settings.baseCurrency
  // Quién cobra solo tiene sentido en una deuda: en la compra del súper no hay
  // financiera que valga, y el campo sobraría en el noventa por ciento del uso.
  const esDeuda = categories.some((item) => item.id === categoryId && item.isDebt)
  const visibleCategories = categories.filter(
    (category) => category.kind === (type === 'income' ? 'income' : 'expense'),
  )

  async function save(): Promise<void> {
    if (amount <= 0) return setError('El importe tiene que ser mayor que cero')
    if (type === 'transfer' && !toAccountId) return setError('Elige la cuenta de destino')

    const saved = await onSave({
      id: schedule?.id,
      name: null,
      type,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      amount,
      note: note.trim() || null,
      freq,
      interval,
      nextDate,
      endDate: endDate || null,
      autoPost,
      remind,
      active: schedule?.active ?? true,
      refundForScheduledId: type === 'refund' ? refundForScheduledId : null,
      goalId: hucha ? goalId : null,
      lender: esDeuda ? lender || null : null,
    })
    if (saved) onClose()
  }

  return (
    <>
      <Modal
        title={titulo ?? (schedule ? 'Editar programación' : 'Nueva programación')}
        onClose={onClose}
        footer={
          <>
            {schedule && (
              <button className="btn ghost danger spacer" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={16} />
                Eliminar
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" onClick={save}>
              Guardar
            </button>
          </>
        }
      >
        {/* Desde Deudas no hay nada que elegir: una deuda es un gasto. */}
        {!soloGasto && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <Segmented
              value={type}
              onChange={setType}
              options={[
                { value: 'expense', label: 'Gasto', tone: 'expense' },
                { value: 'income', label: 'Ingreso', tone: 'income' },
                { value: 'transfer', label: 'Traspaso', tone: 'transfer' },
                { value: 'refund', label: 'Reembolso', tone: 'refund' },
              ]}
            />
          </div>
        )}

        {type === 'refund' && (
          <Field
            label="Devolución de esta programada"
            hint="Se engancha sola al movimiento de esa programación."
          >
            <select
              className="select"
              value={refundForScheduledId ?? ''}
              onChange={(e) =>
                setRefundForScheduledId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Sin enlazar a un gasto programado</option>
              {siblings
                .filter((item) => item.type === 'expense')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {refundOptionLabel(item)}
                  </option>
                ))}
            </select>
          </Field>
        )}

        {/* Como en un movimiento: el título primero y con el foco puesto. */}
        <Field
          label="Título"
          hint="Se lee en la lista, y lo hereda cada movimiento."
        >
          <input
            className="input"
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Netflix, alquiler, la cuota del PC…"
          />
        </Field>
        <Field label="Importe" error={error}>
          <AmountInput value={amount} currency={currency} onChange={setAmount} />
        </Field>

        <div className="grid cols-2">
          <Field label={type === 'transfer' ? 'Desde' : 'Cuenta'}>
            <select
              className="select"
              value={accountId}
              onChange={(e) => setAccountId(Number(e.target.value))}
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
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
                      {item.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <Field label="Categoría">
              <select
                className="select"
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sin categoría</option>
                {visibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* Quién cobra se ve luego como etiqueta en Deudas, que es donde se busca:
            «el PC» son dos años de cuotas, y lo que se recuerda es que las cobra
            Aplázame. Opcional, que no todas las deudas son de una financiera. */}
        {esDeuda && (
          <Field label="Quién la cobra" hint="Opcional.">
            <select className="select" value={lender} onChange={(e) => setLender(e.target.value)}>
              <option value="">Sin especificar</option>
              {LENDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Como en un traspaso suelto: sin elegir plan, el dinero entra como ahorro
            libre; con uno elegido, cada vez que la programada pase sube su reserva. */}
        {hucha && (
          <Field label="¿A qué plan?">
            <select
              className="select"
              value={goalId ?? ''}
              onChange={(e) => setGoalId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Ahorro libre · Sin asignar</option>
              {planes.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name} · Le faltan {formatMoney(goal.missing, settings.baseCurrency)}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Repetición">
          <div className="row tight">
            <span className="muted small">Cada</span>
            <NumberInput
              value={interval}
              onChange={setInterval}
              min={1}
              max={99}
              style={{ width: 74 }}
            />
            <select
              className="select"
              style={{ flex: 1 }}
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

        <div className="grid cols-2">
          <Field label="Próxima fecha">
            <DateInput value={nextDate} onChange={setNextDate} />
          </Field>
          <Field label="Termina el" hint="Déjalo vacío si no tiene fin.">
            <DateInput value={endDate} onChange={setEndDate} clearable />
          </Field>
        </div>

        <Checkbox
          checked={autoPost}
          onChange={setAutoPost}
          label="Registrar automáticamente"
          hint="Desactivado, solo avisa y la registras tú."
        />

        <Checkbox
          checked={remind}
          onChange={setRemind}
          label="Avisarme el día antes"
          hint="Requiere los avisos encendidos en Ajustes."
        />
      </Modal>

      {confirmDelete && (
        <Confirm
          title="Eliminar programación"
          message="Los movimientos ya generados se conservan; solo deja de repetirse en el futuro."
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await onDelete?.()
            setConfirmDelete(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

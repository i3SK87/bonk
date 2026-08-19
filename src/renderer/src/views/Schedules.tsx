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
  Loading
} from '../components/ui'
import { formatMoney } from '@shared/money'
import { formatDate, relativeDays, today } from '@shared/dates'
import type { Frequency, ScheduledView, TxType } from '@shared/types'

const api = window.bonk

const FREQUENCIES: Array<{ value: Frequency; singular: string; plural: string }> = [
  { value: 'daily', singular: 'día', plural: 'días' },
  { value: 'weekly', singular: 'semana', plural: 'semanas' },
  { value: 'monthly', singular: 'mes', plural: 'meses' },
  { value: 'yearly', singular: 'año', plural: 'años' }
]

/**
 * Cómo se llama una programación en la lista. Las nuevas solo tienen nota; las
 * de antes podían tener además un nombre, y ese manda mientras exista.
 */
function titleOf(row: Pick<ScheduledView, 'name' | 'note' | 'categoryName'>): string {
  return row.name || row.note || row.categoryName || 'Movimiento programado'
}

function describeFrequency(freq: Frequency, interval: number): string {
  const entry = FREQUENCIES.find((item) => item.value === freq)
  if (!entry) return ''
  if (interval === 1) {
    return freq === 'daily'
      ? 'Cada día'
      : freq === 'weekly'
        ? 'Cada semana'
        : freq === 'monthly'
          ? 'Cada mes'
          : 'Cada año'
  }
  return `Cada ${interval} ${entry.plural}`
}

export function SchedulesView(): ReactNode {
  const { categories, revision, run, toast, fail } = useStore()
  const [rows, setRows] = useState<ScheduledView[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ScheduledView | null>(null)
  const [creating, setCreating] = useState(false)
  const [finishing, setFinishing] = useState<ScheduledView | null>(null)

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
   * Finalizada es la que ya no puede volver por su cuenta: apagada y con fecha
   * de fin cumplida, sea porque se saldó la deuda o porque se agotó su plazo.
   * Una pausada, en cambio, sigue en la lista principal esperando a reanudarse.
   */
  const isFinished = (row: ScheduledView): boolean =>
    !row.active && row.endDate != null && row.endDate <= today()
  const vigentes = rows.filter((row) => !isFinished(row))
  const finalizadas = rows.filter(isFinished)

  const overdue = rows.filter((row) => row.active && row.nextDate <= today())

  return (
    <>
      {overdue.length > 0 && (
        <div className="card card-body row" style={{ borderColor: 'var(--warning)' }}>
          <Icon name="alert" size={18} />
          <div className="small">
            Hay {overdue.length} {overdue.length === 1 ? 'programación vencida' : 'programaciones vencidas'} sin
            generar. Las que tienen registro automático se crean al abrir la aplicación.
          </div>
        </div>
      )}

      <div className="card flush">
        <div className="card-header">
          <h2>Programados</h2>
          <span className="small muted">Recibos, nóminas y cuotas que se repiten.</span>
          <div className="spacer" />
          <button className="btn primary small" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Nueva programación
          </button>
        </div>

        {loading ? (
          <Loading />
        ) : vigentes.length === 0 ? (
          <EmptyState
            icon="repeat"
            title="Nada programado"
            message="Programa el alquiler, la nómina o las suscripciones y se registrarán solas."
            action={
              <button className="btn primary" onClick={() => setCreating(true)}>
                Crear la primera
              </button>
            }
          />
        ) : (
          nestByParent(vigentes, (row) => row.id, (row) => row.refundForScheduledId).map(({ row, nested, last }) => (
            <div
              key={row.id}
              className={`list-row${nested ? ' nested' : ''}${nested && !last ? ' nested-continues' : ''}`}
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
                      Solo estorba cuando el nombre ya es la propia categoría. */}
                  {row.categoryName && row.categoryName !== titleOf(row) && (
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
                  {describeFrequency(row.freq, row.interval)} · {row.accountName}
                  {row.type === 'transfer' && row.toAccountName ? ` → ${row.toAccountName}` : ''}
                  {row.endDate ? ` · hasta ${formatDate(row.endDate)}` : ''}
                  {!row.autoPost && ' · registro manual'}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  className={`amount ${
                    row.type === 'expense' ? 'negative' : row.type === 'transfer' ? 'neutral' : 'positive'
                  }`}
                >
                  {formatMoney(
                    row.type === 'expense' ? -row.amount : row.amount,
                    row.accountCurrency,
                    { sign: row.type !== 'transfer' }
                  )}
                </div>
                <div className="small muted">
                  {row.active ? `Próximo ${relativeDays(row.nextDate)}` : formatDate(row.nextDate)}
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
                  <Icon name="archive" size={16} />
                </button>
              ) : (
                <button
                  className="btn ghost icon"
                  title={row.active ? 'Pausar' : 'Reanudar'}
                  onClick={() => run(() => api.scheduled.setActive(row.id, !row.active))}
                >
                  <Icon name={row.active ? 'minus' : 'repeat'} size={16} />
                </button>
              )}
              <button className="btn ghost icon" onClick={() => setEditing(row)} aria-label="Editar">
                <Icon name="edit" size={16} />
              </button>
            </div>
          ))
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
                  {describeFrequency(row.freq, row.interval)} · {row.accountName} · terminó el{' '}
                  {formatDate(row.endDate!)}
                </div>
              </div>
              <div className="amount">
                {formatMoney(row.type === 'expense' ? -row.amount : row.amount, row.accountCurrency)}
              </div>
              <button className="btn ghost icon" onClick={() => setEditing(row)} aria-label="Editar">
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
            run(() => api.scheduled.save(input), editing ? 'Programación actualizada' : 'Programación creada')
          }
          onDelete={
            editing ? () => run(() => api.scheduled.remove(editing.id), 'Programación eliminada') : undefined
          }
        />
      )}
    </>
  )
}

interface ScheduleModalProps {
  schedule: ScheduledView | null
  /** El resto de programadas, para poder colgar una devolución de su gasto. */
  siblings: ScheduledView[]
  onClose: () => void
  onSave: (input: unknown) => Promise<unknown>
  onDelete?: () => Promise<unknown>
}

function ScheduleModal({ schedule, siblings, onClose, onSave, onDelete }: ScheduleModalProps): ReactNode {
  const { accounts, categories, settings } = useStore()
  const preferredAccountId = usePreferredAccountId()
  const [type, setType] = useState<TxType>(schedule?.type ?? 'expense')
  const [amount, setAmount] = useState(schedule?.amount ?? 0)
  const [accountId, setAccountId] = useState(schedule?.accountId ?? preferredAccountId)
  const [toAccountId, setToAccountId] = useState<number | null>(schedule?.toAccountId ?? null)
  const [categoryId, setCategoryId] = useState<number | null>(schedule?.categoryId ?? null)
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
    schedule?.refundForScheduledId ?? null
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const account = accounts.find((item) => item.id === accountId)
  const currency = account?.currency ?? settings.baseCurrency
  const visibleCategories = categories.filter(
    (category) => category.kind === (type === 'income' ? 'income' : 'expense')
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
      refundForScheduledId: type === 'refund' ? refundForScheduledId : null
    })
    if (saved) onClose()
  }

  return (
    <>
      <Modal
        title={schedule ? 'Editar programación' : 'Nueva programación'}
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

        {type === 'refund' && (
          <Field
            label="Devolución de esta programada"
            hint="Al registrarse, la devolución se engancha sola al movimiento que haya dejado esa programación. Sin enlazar, entra como devolución suelta de su categoría."
          >
            <select
              className="select"
              value={refundForScheduledId ?? ''}
              onChange={(e) => setRefundForScheduledId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sin enlazar a un gasto programado</option>
              {siblings
                .filter((item) => item.type === 'expense')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.categoryName || 'Sin categoría'} ·{' '}
                    {formatMoney(item.amount, item.accountCurrency)}
                  </option>
                ))}
            </select>
          </Field>
        )}

        <Field label="Importe" error={error}>
          <AmountInput value={amount} currency={currency} onChange={setAmount} />
        </Field>

        <div className="grid cols-2">
          <Field label={type === 'transfer' ? 'Desde' : 'Cuenta'}>
            <select className="select" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
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

        <Field label="Repetición">
          <div className="row tight">
            <span className="muted small">Cada</span>
            <NumberInput value={interval} onChange={setInterval} min={1} max={99} style={{ width: 74 }} />
            <select
              className="select"
              style={{ flex: 1 }}
              value={freq}
              onChange={(event) => setFreq(event.target.value as Frequency)}
            >
              {FREQUENCIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {interval === 1 ? item.singular : item.plural}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <div className="grid cols-2">
          <Field label="Próxima fecha">
            <input
              className="input"
              type="date"
              value={nextDate}
              onChange={(event) => setNextDate(event.target.value)}
            />
          </Field>
          <Field label="Termina el" hint="Déjalo vacío si no tiene fin.">
            <input
              className="input"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>


        <Field label="Notas" hint="Es lo que se lee en la lista y lo que llevará cada movimiento que genere.">
          <textarea
            className="textarea"
            value={note}
            placeholder="Alquiler, Netflix, nómina…"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Checkbox
          checked={autoPost}
          onChange={setAutoPost}
          label="Registrar automáticamente"
          hint="Si lo desactivas, la programación solo sirve de recordatorio y la registras tú a mano."
        />

        <Checkbox
          checked={remind}
          onChange={setRemind}
          label="Avisarme el día antes"
          hint="Solo si los avisos están encendidos en Ajustes. Desmárcalo para callar esta sin callar las demás."
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

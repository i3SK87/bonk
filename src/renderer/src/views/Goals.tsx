import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon, PALETTE } from '../components/Icon'
import {
  Modal,
  Field,
  AmountInput,
  Confirm,
  EmptyState,
  ProgressBar,
  Avatar,
  IconPicker,
  ColorPicker,
  Loading
} from '../components/ui'
import { formatMoney } from '@shared/money'
import { formatDate, today } from '@shared/dates'
import type { GoalProgress } from '@shared/types'

const api = window.bonk

const GOAL_ICONS = [
  'piggy',
  'target',
  'home',
  'travel',
  'card',
  'invest',
  'gift',
  'education',
  'health',
  'fun',
  'clothes',
  'tools'
]

/** Cómo se lee cada estado en la ficha del plan. */
const STATUS: Record<GoalProgress['status'], { label: string; tone: string }> = {
  achieved: { label: 'Cumplido', tone: 'var(--fg-muted)' },
  complete: { label: 'Ya lo tienes', tone: 'var(--positive)' },
  onTrack: { label: 'Al ritmo que llevas, llegas', tone: 'var(--positive)' },
  behind: { label: 'A este ritmo no llegas', tone: 'var(--warning)' },
  late: { label: 'Se pasó la fecha', tone: 'var(--negative)' },
  open: { label: 'Sin fecha', tone: 'var(--fg-muted)' }
}

export function GoalsView(): ReactNode {
  const { settings, accounts, revision, run, fail } = useStore()
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<GoalProgress | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.goals
      .progress()
      .then(setGoals)
      .catch(fail('los planes de ahorro'))
      .finally(() => setLoading(false))
  }, [revision])

  const open = goals.filter((goal) => !goal.achievedAt)
  const done = goals.filter((goal) => goal.achievedAt)
  // Las huchas son las cuentas de ahorro; si no hay ninguna, vale cualquiera.
  const pots = accounts.filter((account) => account.type === 'savings')
  const potIds = new Set((pots.length ? pots : accounts).map((account) => account.id))
  const potTotal = accounts
    .filter((account) => potIds.has(account.id))
    .reduce((sum, account) => sum + account.balance, 0)
  const committed = open.reduce((sum, goal) => sum + goal.saved, 0)
  /**
   * De quién es ese dinero apartado.
   *
   * Con un solo plan tirando de la hucha se dice su nombre, que es lo que se
   * quiere saber. Con varios se cuentan: la lista entera de nombres no cabe en
   * una línea y, puestos a resumir, el número dice más.
   */
  // Lo que ya está reservado a mano, que es lo que limita cuánto se puede subir
  // otro plan. No vale mirar lo repartido: ahí entra también lo que se asigna solo
  // por fecha, y eso sí se le puede quitar.
  const reservado = open.reduce((sum, goal) => sum + goal.reserved, 0)
  const porRepartir = Math.max(0, potTotal - reservado)
  const financiados = open.filter((goal) => goal.saved > 0)
  const paraQuien =
    financiados.length === 1
      ? financiados[0].name
      : financiados.length === 0
        ? 'tus planes'
        : `${financiados.length} planes`

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Planes de ahorro</h2>
          <span className="small muted">
            Lo que hay en la hucha se reparte entre los planes por orden de fecha.
          </span>
          <div className="spacer" />
          <button className="btn primary small" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Nuevo plan
          </button>
        </div>

        {/* La hucha se enseña haya planes o no: sin ninguno, lo que hay es ahorro
            libre, y esa cifra vale por sí sola. */}
        {!loading && (
          <div className="card-body networth-strip" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="networth" style={{ borderRight: 'none' }}>
              <div className="label">En la hucha</div>
              <div className={`value amount ${potTotal > 0 ? 'positive' : 'neutral'}`}>
                {formatMoney(potTotal, settings.baseCurrency)}
              </div>
            </div>
            <div className="col" style={{ gap: 2 }}>
              {committed > 0 && (
                <span className="small muted">
                  Presupuesto para {paraQuien}: {formatMoney(committed, settings.baseCurrency)}
                </span>
              )}
              <span className="small subtle">
                Ahorro libre: {formatMoney(Math.max(0, potTotal - committed), settings.baseCurrency)}
              </span>
            </div>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : open.length === 0 && done.length === 0 ? (
          <EmptyState
            icon="target"
            title="Sin planes"
            message="Ponle nombre y fecha a lo que quieres juntar —1.000 € para marzo— y verás cuánto llevas y cuánto tendrías que apartar cada mes."
            action={
              <button className="btn primary" onClick={() => setCreating(true)}>
                Crear el primero
              </button>
            }
          />
        ) : (
          <>
            <div className="card-body col" style={{ gap: 20 }}>
              {open.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  currency={settings.baseCurrency}
                  techo={goal.reserved + porRepartir}
                  onEdit={() => setEditing(goal)}
                  onAchieve={() => run(() => api.goals.setAchieved(goal.id, true), 'Plan cumplido')}
                  onReserve={(amount) =>
                    run(() => api.goals.reserve([{ id: goal.id, amount }]))
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>

      {done.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Cumplidos</h2>
            <span className="small muted">Ya no reparten saldo: ese dinero está comprometido.</span>
          </div>
          <div>
            {done.map((goal) => (
              <div key={goal.id} className="list-row">
                <Avatar icon={goal.icon} color={goal.color} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 570 }}>{goal.name}</div>
                  <div className="small muted truncate">
                    Cumplido el {formatDate(goal.achievedAt!)} · {goal.accountName}
                  </div>
                </div>
                <div className="amount">{formatMoney(goal.targetAmount, settings.baseCurrency)}</div>
                <button
                  className="btn small"
                  title="Volver a ponerlo en marcha"
                  onClick={() => run(() => api.goals.setAchieved(goal.id, false), 'Plan reabierto')}
                >
                  <Icon name="refresh" size={15} />
                </button>
                <button className="btn ghost icon" onClick={() => setEditing(goal)} aria-label="Editar">
                  <Icon name="edit" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(creating || editing) && (
        <GoalModal
          goal={editing}
          defaultAccountId={(pots[0] ?? accounts[0])?.id ?? 0}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={(input) => run(() => api.goals.save(input), editing ? 'Plan actualizado' : 'Plan creado')}
          onDelete={editing ? () => run(() => api.goals.remove(editing.id), 'Plan eliminado') : undefined}
        />
      )}
    </>
  )
}

function GoalCard({
  goal,
  currency,
  techo,
  onEdit,
  onAchieve,
  onReserve
}: {
  goal: GoalProgress
  currency: string
  /** Lo máximo que se le puede reservar: lo suyo más lo que quede libre. */
  techo: number
  onEdit: () => void
  onAchieve: () => void
  onReserve?: (amount: number) => void
}): ReactNode {
  const [reserva, setReserva] = useState(goal.reserved)

  // Al recargar los datos manda lo guardado, no lo que quedó en el mando.
  useEffect(() => setReserva(goal.reserved), [goal.reserved])

  const status = STATUS[goal.status]
  const color =
    goal.status === 'complete'
      ? 'var(--positive)'
      : goal.status === 'late'
        ? 'var(--negative)'
        : goal.status === 'behind'
          ? 'var(--warning)'
          : goal.color

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <Avatar icon={goal.icon} color={goal.color} />
        <div style={{ minWidth: 0 }}>
          <div className="row tight">
            <strong>{goal.name}</strong>
            <span className="pill" style={{ color: status.tone }}>
              {status.label}
            </span>
          </div>
          <div className="small muted truncate">
            {goal.targetDate ? `Para el ${formatDate(goal.targetDate)}` : 'Sin fecha límite'}
            {goal.daysLeft != null &&
              (goal.daysLeft >= 0
                ? ` · quedan ${goal.daysLeft} ${goal.daysLeft === 1 ? 'día' : 'días'}`
                : ` · hace ${Math.abs(goal.daysLeft)} días`)}
            {goal.note ? ` · ${goal.note}` : ''}
          </div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: 'right' }}>
          <div className="amount" style={{ fontSize: 16 }}>
            {formatMoney(goal.saved, currency)}{' '}
            <span className="muted" style={{ fontWeight: 500 }}>
              de {formatMoney(goal.targetAmount, currency)}
            </span>
          </div>
          <div className="small muted">
            {goal.missing > 0 ? `Faltan ${formatMoney(goal.missing, currency)}` : 'Completo'}
          </div>
        </div>
        {goal.missing === 0 && (
          <button className="btn small" onClick={onAchieve} title="Darlo por cumplido y archivarlo">
            <Icon name="check" size={15} />
          </button>
        )}
        <button className="btn ghost icon" onClick={onEdit} aria-label="Editar plan">
          <Icon name="edit" size={16} />
        </button>
      </div>

      <ProgressBar percent={goal.percent} color={color} />

      {/* Lo que se le reserva de la hucha. El tope no es su meta sino lo que hay
          libre más lo que ya tiene, así que arrastrando no se puede repartir de
          más ni quitarle a otro plan sin querer. Se guarda al soltar. */}
      {onReserve && (
        <div className="reserva">
          <input
            type="range"
            min={0}
            max={Math.max(techo, 1)}
            step={100}
            value={Math.min(reserva, Math.max(techo, 1))}
            style={{ accentColor: color }}
            onChange={(event) => setReserva(Number(event.target.value))}
            onMouseUp={() => onReserve(reserva)}
            onKeyUp={() => onReserve(reserva)}
            aria-label={`Reservado para ${goal.name}`}
          />
          <span className="small muted nowrap">Reservado {formatMoney(reserva, currency)}</span>
        </div>
      )}

      <div className="small subtle" style={{ marginTop: 5 }}>
        {goal.missing === 0
          ? 'Ya tienes juntado lo que querías.'
          : goal.perMonth != null
            ? `Tendrías que apartar ${formatMoney(goal.perMonth, currency)} al mes. ` +
              (goal.recentPace > 0
                ? `En los últimos tres meses has ido juntando ${formatMoney(goal.recentPace, currency)} al mes.`
                : 'En los últimos tres meses no ha entrado nada en esta cuenta.')
            : goal.daysLeft != null && goal.daysLeft < 0
              ? 'La fecha ya pasó; cámbiala o dalo por cerrado.'
              : 'Sin fecha no hay ritmo que calcular: ponle una y te digo cuánto al mes.'}
      </div>
    </div>
  )
}

interface GoalModalProps {
  goal: GoalProgress | null
  defaultAccountId: number
  onClose: () => void
  onSave: (input: unknown) => Promise<unknown>
  onDelete?: () => Promise<unknown>
}

function GoalModal({ goal, defaultAccountId, onClose, onSave, onDelete }: GoalModalProps): ReactNode {
  const { accounts, settings } = useStore()
  const [name, setName] = useState(goal?.name ?? '')
  const [accountId, setAccountId] = useState(goal?.accountId ?? defaultAccountId)
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount ?? 0)
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [icon, setIcon] = useState(goal?.icon ?? 'piggy')
  const [color, setColor] = useState(goal?.color ?? PALETTE[0])
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const account = accounts.find((item) => item.id === accountId)
  const currency = account?.currency ?? settings.baseCurrency

  async function save(): Promise<void> {
    if (!name.trim()) return setError('Ponle un nombre')
    if (targetAmount <= 0) return setError('La cantidad tiene que ser mayor que cero')
    if (targetDate && targetDate < today() && !goal) {
      return setError('Esa fecha ya ha pasado')
    }

    const saved = await onSave({
      id: goal?.id,
      name: name.trim(),
      accountId,
      targetAmount,
      targetDate: targetDate || null,
      icon,
      color,
      // El plan ya se explica con su título: una nota aparte era un campo más
      // que rellenar para decir lo mismo. La columna se queda por si alguien
      // tenía algo escrito, y lo escrito se sigue enseñando en la lista.
      note: goal?.note ?? null,
      achievedAt: goal?.achievedAt ?? null
    })
    if (saved) onClose()
  }

  return (
    <>
      <Modal
        title={goal ? 'Editar plan' : 'Nuevo plan de ahorro'}
        onClose={onClose}
        footer={
          <>
            {goal && (
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
        <Field label="Título" error={error}>
          <input
            className="input"
            value={name}
            placeholder="Un PC, el viaje a Japón, el colchón de imprevistos…"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Cuánto">
          <AmountInput value={targetAmount} currency={currency} onChange={setTargetAmount} autoFocus />
        </Field>

        <div className="grid cols-2">
          <Field label="Para cuándo" hint="Opcional: sin fecha no se calcula ritmo.">
            <input
              className="input"
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </Field>

          <Field label="Dónde se junta">
            <select
              className="select"
              value={accountId}
              onChange={(event) => setAccountId(Number(event.target.value))}
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Icono">
          <IconPicker value={icon} options={GOAL_ICONS} onChange={setIcon} />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </Modal>

      {confirmDelete && (
        <Confirm
          title="Eliminar plan"
          message="El plan desaparece. El dinero de la hucha no se toca."
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

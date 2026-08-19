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

/** Cómo se lee cada estado en la ficha del hito. */
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
      .catch(fail('los hitos de ahorro'))
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

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Hitos de ahorro</h2>
          <span className="small muted">
            Lo que hay en la hucha se reparte entre los hitos por orden de fecha.
          </span>
          <div className="spacer" />
          <button className="btn primary small" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Nuevo hito
          </button>
        </div>

        {loading ? (
          <Loading />
        ) : open.length === 0 && done.length === 0 ? (
          <EmptyState
            icon="target"
            title="Sin hitos"
            message="Ponle nombre y fecha a lo que quieres juntar —1.000 € para marzo— y verás cuánto llevas y cuánto tendrías que apartar cada mes."
            action={
              <button className="btn primary" onClick={() => setCreating(true)}>
                Crear el primero
              </button>
            }
          />
        ) : (
          <>
            <div className="card-body networth-strip" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="networth" style={{ borderRight: 'none' }}>
                <div className="label">En la hucha</div>
                <div className={`value amount ${potTotal > 0 ? 'positive' : 'neutral'}`}>
                  {formatMoney(potTotal, settings.baseCurrency)}
                </div>
              </div>
              <div className="col" style={{ gap: 2 }}>
                <span className="small muted">
                  Comprometido en hitos: {formatMoney(committed, settings.baseCurrency)}
                </span>
                <span className="small subtle">
                  Libre: {formatMoney(Math.max(0, potTotal - committed), settings.baseCurrency)}
                </span>
              </div>
            </div>

            <div className="card-body col" style={{ gap: 20 }}>
              {open.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  currency={settings.baseCurrency}
                  onEdit={() => setEditing(goal)}
                  onAchieve={() => run(() => api.goals.setAchieved(goal.id, true), 'Hito cumplido')}
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
                  onClick={() => run(() => api.goals.setAchieved(goal.id, false), 'Hito reabierto')}
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
          onSave={(input) => run(() => api.goals.save(input), editing ? 'Hito actualizado' : 'Hito creado')}
          onDelete={editing ? () => run(() => api.goals.remove(editing.id), 'Hito eliminado') : undefined}
        />
      )}
    </>
  )
}

function GoalCard({
  goal,
  currency,
  onEdit,
  onAchieve
}: {
  goal: GoalProgress
  currency: string
  onEdit: () => void
  onAchieve: () => void
}): ReactNode {
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
        <button className="btn ghost icon" onClick={onEdit} aria-label="Editar hito">
          <Icon name="edit" size={16} />
        </button>
      </div>

      <ProgressBar percent={goal.percent} color={color} />

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
  const [note, setNote] = useState(goal?.note ?? '')
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
      note: note.trim() || null,
      achievedAt: goal?.achievedAt ?? null
    })
    if (saved) onClose()
  }

  return (
    <>
      <Modal
        title={goal ? 'Editar hito' : 'Nuevo hito de ahorro'}
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
        <Field label="Qué quieres juntar" error={error}>
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

        <Field label="Nota" hint="Opcional.">
          <input
            className="input"
            value={note}
            placeholder="El modelo, el enlace, con quién…"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Field label="Icono">
          <IconPicker value={icon} options={GOAL_ICONS} onChange={setIcon} />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </Modal>

      {confirmDelete && (
        <Confirm
          title="Eliminar hito"
          message="El hito desaparece. El dinero de la hucha no se toca."
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

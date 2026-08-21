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
  const { settings, accounts, revision, run, refresh, fail } = useStore()
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<GoalProgress | null>(null)
  const [creating, setCreating] = useState(false)
  const [sharing, setSharing] = useState(false)

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
  /**
   * De quién es ese dinero apartado.
   *
   * Con un solo hito tirando de la hucha se dice su nombre, que es lo que se
   * quiere saber. Con varios se cuentan: la lista entera de nombres no cabe en
   * una línea y, puestos a resumir, el número dice más.
   */
  const financiados = open.filter((goal) => goal.saved > 0)
  const paraQuien =
    financiados.length === 1
      ? financiados[0].name
      : financiados.length === 0
        ? 'tus hitos'
        : `${financiados.length} hitos`

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
                  Presupuesto para {paraQuien}: {formatMoney(committed, settings.baseCurrency)}
                </span>
                <span className="small subtle">
                  Ahorro libre: {formatMoney(Math.max(0, potTotal - committed), settings.baseCurrency)}
                </span>
              </div>
              <div className="spacer" />
              {open.length > 0 && (
                <button className="btn small" onClick={() => setSharing((value) => !value)}>
                  <Icon name="target" size={15} />
                  {sharing ? 'Cerrar el reparto' : 'Repartir la hucha'}
                </button>
              )}
            </div>

            {sharing && open.length > 0 && (
              <ReparteHucha
                key={revision}
                goals={open}
                pot={potTotal}
                currency={settings.baseCurrency}
                onSaved={() => { setSharing(false); refresh() }}
              />
            )}

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

/**
 * El reparto de la hucha, a mano.
 *
 * Campos de importe y no un deslizador: con dinero pesa la precisión —quieres
 * 250,00 €, no «un 24 % más o menos»— y en cuanto hay varios hitos los
 * deslizadores tienen que robarse cantidad entre ellos, que es el gesto que nadie
 * entiende a la primera. La barra de abajo es el resultado, no el mando.
 */
function ReparteHucha({
  goals,
  pot,
  currency,
  onSaved
}: {
  goals: GoalProgress[]
  pot: number
  currency: string
  onSaved: () => void
}): ReactNode {
  const [values, setValues] = useState<Record<number, number>>(() =>
    Object.fromEntries(goals.map((goal) => [goal.id, Math.min(goal.reserved, goal.targetAmount)]))
  )
  const { run } = useStore()

  const total = goals.reduce((sum, goal) => sum + (values[goal.id] ?? 0), 0)
  const free = pot - total
  const sobra = free < 0

  const set = (id: number, amount: number): void =>
    setValues((current) => ({ ...current, [id]: Math.max(0, amount) }))

  /** Lo que cabe para un hito: ni más de lo que le falta ni más de lo que hay. */
  const cabe = (goal: GoalProgress): number =>
    Math.min(goal.targetAmount, (values[goal.id] ?? 0) + Math.max(0, free))

  return (
    <div className="card-body col" style={{ gap: 14, borderBottom: '1px solid var(--border)' }}>
      {goals.map((goal) => (
        <div key={goal.id} className="row" style={{ gap: 12 }}>
          <Avatar icon={goal.icon} color={goal.color} size="small" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 570 }} className="truncate">
              {goal.name}
            </div>
            <div className="small subtle">
              Su meta son {formatMoney(goal.targetAmount, currency)}
            </div>
          </div>
          <div style={{ width: 170 }}>
            <AmountInput
              value={values[goal.id] ?? 0}
              currency={currency}
              onChange={(amount) => set(goal.id, amount)}
              compact
            />
          </div>
          <button
            className="btn small ghost"
            disabled={cabe(goal) === (values[goal.id] ?? 0)}
            onClick={() => set(goal.id, cabe(goal))}
            title="Darle todo lo que quepa"
          >
            Al tope
          </button>
        </div>
      ))}

      {/* La barra dice de un vistazo cómo queda la hucha. */}
      <div className="reparto-barra">
        {goals.map((goal) => {
          const parte = pot > 0 ? ((values[goal.id] ?? 0) / pot) * 100 : 0
          return parte > 0 ? (
            <span
              key={goal.id}
              style={{ width: `${Math.min(100, parte)}%`, background: goal.color }}
              title={goal.name}
            />
          ) : null
        })}
      </div>

      <div className="row" style={{ gap: 10 }}>
        <span className={`small ${sobra ? 'negative' : 'muted'}`}>
          {sobra
            ? `Te pasas ${formatMoney(-free, currency)} de lo que hay en la hucha`
            : `Ahorro libre: ${formatMoney(free, currency)}`}
        </span>
        <div className="spacer" />
        <button
          className="btn small"
          onClick={() =>
            setValues(
              Object.fromEntries(
                goals.map((goal) => [goal.id, Math.min(goal.targetAmount, Math.floor(pot / goals.length))])
              )
            )
          }
        >
          A partes iguales
        </button>
        <button
          className="btn small"
          onClick={() => setValues(Object.fromEntries(goals.map((goal) => [goal.id, 0])))}
        >
          Vaciar
        </button>
        <button
          className="btn primary small"
          disabled={sobra}
          onClick={async () => {
            const saved = await run(
              () => api.goals.reserve(goals.map((goal) => ({ id: goal.id, amount: values[goal.id] ?? 0 }))),
              'Hucha repartida'
            )
            if (saved !== undefined) onSaved()
          }}
        >
          Guardar el reparto
        </button>
      </div>
    </div>
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
      // El hito ya se explica con su título: una nota aparte era un campo más
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

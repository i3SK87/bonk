import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon, PALETTE } from '../components/Icon'
import {
  Modal,
  Field,
  AmountInput,
  Confirm,
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

/**
 * De veinticinco en veinticinco euros. Al céntimo el mando resbalaba y no había
 * forma de saber dónde se paraba; a saltos se nota lo que se mueve.
 */
const PASO = 2500

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
  // La hucha principal es la marcada de su tipo; si no hay ninguna, la primera.
  const [potId, setPotId] = useState<number | null>(
    accounts.find((account) => account.type === 'savings' && account.isPrimary)?.id ?? null
  )

  useEffect(() => {
    setLoading(true)
    api.goals
      .progress()
      .then(setGoals)
      .catch(fail('los planes de ahorro'))
      .finally(() => setLoading(false))
  }, [revision])

  // Las huchas son las cuentas de ahorro; si no hay ninguna, vale cualquiera.
  const pots = accounts.filter((account) => account.type === 'savings')
  const huchas = pots.length ? pots : accounts

  /*
   * Se mira una hucha cada vez, y no todas sumadas.
   *
   * Un plan cuelga de una cuenta concreta, así que sumarlas repartía dinero que
   * está en otra parte: con dos huchas, un plan de la primera podía reservar lo
   * que hay en la segunda. Cada hucha tiene su ahorro libre y sus planes.
   */
  const hucha = huchas.find((account) => account.id === potId) ?? huchas[0] ?? null
  const potTotal = hucha?.balance ?? 0
  const suyos = goals.filter((goal) => goal.accountId === hucha?.id)
  const open = suyos.filter((goal) => !goal.achievedAt)
  const done = suyos.filter((goal) => goal.achievedAt)
  // Lo reservado a mano es lo único que sale de la hucha; el resto es ahorro
  // libre, y es lo que limita cuánto puede subir otro plan.
  //
  // Se cuenta hasta su meta y no más: un plan de 225 € con 1.000 € reservados
  // -porque se le bajó la meta después- solo retiene 225. Contando la reserva a
  // secas, los otros 775 desaparecían de la pantalla: ni en el plan ni libres.
  const reservado = open.reduce((sum, goal) => sum + Math.min(goal.reserved, goal.targetAmount), 0)
  const porRepartir = Math.max(0, potTotal - reservado)
  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Planes de ahorro</h2>
          <span className="small muted">
            Lo que no repartas entre tus planes se queda como ahorro libre.
          </span>
          <div className="spacer" />
          <button className="btn primary small" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Nuevo plan
          </button>
        </div>

        {/* Las huchas disponibles, como las cuentas en Movimientos. Con una sola
            también se enseña: dice cuánto hay ahí sin tener que ir a Cuentas. */}
        {huchas.length > 0 && (
          <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="label" style={{ marginBottom: 8 }}>
              Cuentas
            </div>
            <div className="account-chips">
              {huchas.map((account) => (
                <button
                  key={account.id}
                  className={`account-chip${account.id === hucha?.id ? ' active' : ''}`}
                  onClick={() => setPotId(account.id)}
                  title={`Ver los planes de ${account.name}`}
                >
                  <Avatar icon={account.icon} color={account.color} size="small" />
                  <span className="chip-text">
                    <span className="chip-name truncate">{account.name}</span>
                    <span className="chip-balance amount">
                      {formatMoney(account.balance, account.currency)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="card-body col" style={{ gap: 20 }}>
              {/* El ahorro libre es un plan más: el dinero que no está en ninguno.
                  Sin mando y sin barra —sube y baja solo, y contra nada se mide—:
                  lo que importa aquí es cuánto hay, así que la cifra manda. */}
              <div className="row" style={{ gap: 14 }}>
                {/* La cara de la hucha que se esta mirando: es su dinero. */}
                <Avatar icon={hucha?.icon ?? 'piggy'} color={hucha?.color ?? 'var(--fg-subtle)'} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 570 }}>Ahorro libre</div>
                  <div className="small muted">
                    {reservado > 0
                      ? `Lo que no está en ningún plan, de ${formatMoney(potTotal, settings.baseCurrency)} en la hucha`
                      : 'Todo lo que hay en la hucha, sin repartir'}
                  </div>
                </div>
                <div className="spacer" />
                <div
                  className={`value amount ${porRepartir > 0 ? 'positive' : 'neutral'}`}
                  style={{ fontSize: 30 }}
                >
                  {formatMoney(porRepartir, settings.baseCurrency)}
                </div>
              </div>

              {open.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  currency={settings.baseCurrency}
                  techo={Math.min(goal.targetAmount, goal.reserved + porRepartir)}
                  onEdit={() => setEditing(goal)}
                  onAchieve={() => run(() => api.goals.setAchieved(goal.id, true), 'Plan cumplido')}
                  onReserve={(amount) =>
                    run(() => api.goals.reserve([{ id: goal.id, amount }]))
                  }
                />
              ))}

              {/* Sin planes no se enseña un cartel de vacío: la hucha de arriba ya
                  dice lo que hay, y aquí basta con invitar a repartirlo. El botón de
                  crear ya está arriba: dos botones para lo mismo, a un palmo, se leen
                  como si hicieran cosas distintas. */}
              {open.length === 0 && done.length === 0 && (
                <span className="small muted">
                  Crea un plan para reservarle parte de este dinero: le pones nombre,
                  cantidad y fecha, y verás cuánto tendrías que apartar cada mes.
                </span>
              )}
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
          defaultAccountId={hucha?.id ?? 0}
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

  /*
   * Mientras se arrastra manda el mando y no lo guardado.
   *
   * Es la única forma de saber cuánto estás poniendo: la cifra de la ficha ya
   * lo dice, así que se hace que siga al dedo en vez de añadir otro número al
   * lado del mando.
   */
  const ajustable = onReserve != null
  const puesto = ajustable ? Math.min(reserva, goal.targetAmount) : goal.saved

  /*
   * La cifra también se escribe.
   *
   * Arrastrar va bien para tantear, pero cuando ya sabes que son 400 € es
   * absurdo buscarlos a pulso: se pulsa el número y se teclea. Es el mismo
   * número que mueve el mando, así que no hay dos sitios donde mirar.
   */
  const [escribiendo, setEscribiendo] = useState(false)
  // Lo tecleado, en una referencia: al perder el foco, el estado que se leería
  // aquí todavía es el de antes de la última tecla.
  const tecleado = useRef(goal.reserved)
  const falta = Math.max(0, goal.targetAmount - puesto)

  // Hasta dónde llega la hucha, en tanto por ciento del plan. Lo que venga
  // después del tope no es que esté vacío: es que no hay con qué llenarlo.
  const parte = (valor: number): string =>
    `${Math.max(0, Math.min(100, (valor / goal.targetAmount) * 100))}%`

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
          {escribiendo ? (
            <div
              style={{ width: 132, marginLeft: 'auto' }}
              onBlur={() => {
                setEscribiendo(false)
                onReserve?.(Math.min(tecleado.current, techo))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                if (event.key === 'Escape') {
                  tecleado.current = goal.reserved
                  setReserva(goal.reserved)
                  setEscribiendo(false)
                }
              }}
            >
              <AmountInput
                value={reserva}
                currency={currency}
                compact
                autoFocus
                onChange={(valor) => {
                  // Más de lo que hay en la hucha no se puede apartar, se teclee
                  // o se arrastre.
                  const cabe = Math.min(valor, techo)
                  tecleado.current = cabe
                  setReserva(cabe)
                }}
              />
            </div>
          ) : (
            <div className="amount" style={{ fontSize: 16 }}>
              {ajustable ? (
                <button
                  className="cifra-editable"
                  onClick={() => {
                    tecleado.current = puesto
                    setEscribiendo(true)
                  }}
                  title="Escribir la cantidad"
                >
                  {formatMoney(puesto, currency)}
                </button>
              ) : (
                formatMoney(puesto, currency)
              )}{' '}
              <span className="muted" style={{ fontWeight: 500 }}>
                de {formatMoney(goal.targetAmount, currency)}
              </span>
            </div>
          )}
          <div className="small muted">
            {falta > 0 ? `Faltan ${formatMoney(falta, currency)}` : 'Completo'}
          </div>
        </div>
        {falta === 0 && (
          <button className="btn small" onClick={onAchieve} title="Darlo por cumplido y archivarlo">
            <Icon name="check" size={15} />
          </button>
        )}
        <button className="btn ghost icon" onClick={onEdit} aria-label="Editar plan">
          <Icon name="edit" size={16} />
        </button>
      </div>

      {/* Un solo mando: lo que se le reserva de la hucha es a la vez lo que lleva
          ahorrado, así que la barra de progreso y el deslizador son lo mismo.

          El carril es el plan entero, de cero a la meta. Antes era lo que cabía
          reservar en ese momento, y un plan de 1600 € con 1000 € libres enseñaba
          el mando a tope diciendo «1000 de 1600»: parecía terminado sin estarlo.
          Ahora llegar al final significa llegar, y el dedo se para solo donde se
          acaba la hucha. Se guarda al soltar. */}
      {onReserve ? (
        <div className="reserva">
          <input
            type="range"
            min={0}
            max={goal.targetAmount}
            step={PASO}
            value={puesto}
            style={
              {
                '--tono': color,
                '--relleno': parte(puesto),
                '--alcance': parte(techo)
              } as CSSProperties
            }
            onChange={(event) => setReserva(Math.min(Number(event.target.value), techo))}
            onMouseUp={() => onReserve(Math.min(reserva, techo))}
            onKeyUp={() => onReserve(Math.min(reserva, techo))}
            aria-label={`Ahorrado para ${goal.name}`}
          />
        </div>
      ) : (
        <ProgressBar percent={goal.percent} color={color} />
      )}

      {/* Cuando el mando se para antes de la meta, el motivo se dice: si no,
          parece que el deslizador está roto. */}
      {ajustable && techo < goal.targetAmount && (
        <div className="small subtle" style={{ marginTop: 5 }}>
          Con lo que hay en la hucha puedes llegar a {formatMoney(techo, currency)}.
        </div>
      )}

      <div className="small subtle" style={{ marginTop: 5 }}>
        {falta === 0
          ? 'Ya tienes ahorrado lo que querías.'
          : goal.perMonth != null
            ? `Tendrías que apartar ${formatMoney(goal.perMonth, currency)} al mes. ` +
              (goal.recentPace > 0
                ? `En los últimos tres meses has ido ahorrando ${formatMoney(goal.recentPace, currency)} al mes.`
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
  /*
   * Dónde se ahorra no se pregunta: es la hucha que hay elegida detrás.
   *
   * La pestaña mira una hucha cada vez y solo enseña sus planes, así que el que
   * se crea es suyo y el que se edita ya lo era. Preguntarlo era ofrecer una
   * respuesta que solo podía ser una.
   */
  const accountId = goal?.accountId ?? defaultAccountId
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
          {/* El foco entra por el nombre: es lo primero que se piensa de un plan, y
              la cantidad se decide después. */}
          <input
            className="input"
            autoFocus
            value={name}
            placeholder="Un PC, el viaje a Japón, el colchón de imprevistos…"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Cuánto">
          <AmountInput value={targetAmount} currency={currency} onChange={setTargetAmount} />
        </Field>

        <Field label="Para cuándo" hint="Opcional: sin fecha no se calcula ritmo.">
          <input
            className="input"
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
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

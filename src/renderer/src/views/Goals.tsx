import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon, PALETTE, ALL_ICONS } from '../components/Icon'
import { DateInput } from '../components/DateInput'
import { MenuContextual } from '../components/MenuContextual'
import {
  Modal,
  Field,
  AmountInput,
  Confirm,
  ProgressBar,
  Avatar,
  IconPicker,
  ColorPicker,
  Loading,
  AccionCabecera,
  Segmented
} from '../components/ui'
import { formatMoney, currencySymbol } from '@shared/money'
import { formatDate, today } from '@shared/dates'
import { keepNumericChars } from '@shared/numbers'
import { vecesAlAño, describeFrequency } from '../lib/frecuencias'
import type { Category, Frequency, Goal, GoalProgress, ScheduledView } from '@shared/types'

/** Un plan con la fecha de cumplido puesta. */
type Cumplido = GoalProgress & { achievedAt: string }

const api = window.bonk

/**
 * De veinticinco en veinticinco euros. Al céntimo el mando resbalaba y no había
 * forma de saber dónde se paraba; a saltos se nota lo que se mueve.
 */
const PASO = 2500

// El estado ya no se rotula: lo dicen las cifras, la barra y la línea del pie.
// Una etiqueta que repite en palabras lo que se ve al lado es ruido.

export function GoalsView(): ReactNode {
  const { settings, accounts, revision, run, fail } = useStore()
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<GoalProgress | null>(null)
  const [creating, setCreating] = useState(false)
  /* El clic derecho de las dos listas, y el plan que se va a borrar. */
  const [menu, setMenu] = useState<{ goal: GoalProgress; x: number; y: number } | null>(null)
  /** La categoría cuya regla de ahorro se está poniendo o cambiando. */
  const [reglando, setReglando] = useState<Category | null>(null)
  const [borrando, setBorrando] = useState<GoalProgress | null>(null)
  /** El plan al que se le está escribiendo cuánto lleva ahorrado. */
  const [ahorrando, setAhorrando] = useState<GoalProgress | null>(null)
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
  // El predicado lleva la fecha al tipo: así el «Cumplido el» de abajo la
  // enseña sin un `!` que prometa lo que la lista ya garantiza.
  const done = suyos.filter((goal): goal is Cumplido => goal.achievedAt != null)
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
        <AccionCabecera>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Nuevo plan
          </button>
        </AccionCabecera>

        {/* La misma tira que preside Movimientos: la cifra que se busca al entrar
            y, al lado, las cuentas donde vive. Aquí esa cifra es el ahorro libre
            —lo que no está en ningún plan—, que antes iba abajo disfrazado de plan
            y no lo es: no tiene meta, ni fecha, ni mando que mover. */}
        {huchas.length > 0 && (
          <div className="card-body networth-strip" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="networth">
              <div className="label">Ahorro libre</div>
              <div className={`value amount ${porRepartir > 0 ? 'positive' : 'neutral'}`}>
                {formatMoney(porRepartir, settings.baseCurrency)}
              </div>
            </div>

            <div className="accounts-block">
              <div className="label">Cuentas</div>
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
          </div>
        )}

        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="card-body col" style={{ gap: 20 }}>

              {open.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  currency={settings.baseCurrency}
                  techo={Math.min(goal.targetAmount, goal.reserved + porRepartir)}
                  onAchieve={() => run(() => api.goals.setAchieved(goal.id, true), 'Plan cumplido')}
                  onReserve={(amount) =>
                    run(() => api.goals.reserve([{ id: goal.id, amount }]))
                  }
                  marcada={menu?.goal.id === goal.id}
                  onMenu={(x, y) => setMenu({ goal, x, y })}
                  onAbrir={() => setEditing(goal)}
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

      {/* De dónde sale el ahorro, debajo de los planes: primero a qué se
          destina y luego de dónde viene. */}
      <AhorroAutomatico onEditar={setReglando} />

      {done.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Cumplidos</h2>
            <span className="small muted">Ya no reparten saldo: ese dinero está comprometido.</span>
          </div>
          <div>
            {done.map((goal) => (
              <div
                key={goal.id}
                className={`list-row finished clickable${menu?.goal.id === goal.id ? ' marcada' : ''}`}
                role="button"
                onClick={() => setEditing(goal)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ goal, x: event.clientX, y: event.clientY })
                }}
              >
                <Avatar icon={goal.icon} color={goal.color} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 570 }}>{goal.name}</div>
                  <div className="small muted truncate">
                    Cumplido el {formatDate(goal.achievedAt)} · {goal.accountName}
                  </div>
                </div>
                <div className="amount">{formatMoney(goal.targetAmount, settings.baseCurrency)}</div>
                {/* Reabrir no es editar: se queda de botón, y frena el clic para
                    no abrir además la ficha por detrás. */}
                <button
                  className="btn ghost icon"
                  title="Volver a ponerlo en marcha"
                  onClick={(event) => {
                    event.stopPropagation()
                    run(() => api.goals.setAchieved(goal.id, false), 'Plan reabierto')
                  }}
                >
                  <Icon name="refresh" size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* El clic derecho, en las dos listas.

          Aquí vive escribir cuánto llevas ahorrado, y por eso la cifra de la
          ficha ya no lleva su lápiz: un botón permanente para algo que se hace
          de tarde en tarde ocupaba sitio en todas las fichas a la vez. Cambiar
          el plan —su nombre, su meta, su fecha— es pulsar la ficha, y por eso
          no está también aquí.

          En los cumplidos no se ofrece: su dinero ya está comprometido y el
          reparto de la hucha no cuenta con ellos, así que retocarles la cifra
          sería mover algo que ya nadie mira. Borrar se podía desde dentro de la
          ficha, pero eran tres pasos —abrir, bajar al pie y confirmar— para
          deshacer algo que se apuntó mal. El mensaje es el mismo que el del
          pie, que la acción es la misma. */}
      {reglando && <ReglaModal categoria={reglando} onClose={() => setReglando(null)} />}

      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          opciones={[
            ...(menu.goal.achievedAt
              ? []
              : [
                  {
                    etiqueta: 'Editar ahorro',
                    icono: 'edit',
                    onElegir: () => setAhorrando(menu.goal)
                  }
                ]),
            {
              etiqueta: 'Eliminar',
              icono: 'trash',
              peligrosa: true,
              onElegir: () => setBorrando(menu.goal)
            }
          ]}
          onCerrar={() => setMenu(null)}
        />
      )}

      {/* El techo se vuelve a echar aquí y no se guarda con el menú: entre
          abrirlo y contestar puede haber entrado una cuota o haberse movido
          otro plan, y lo que cabe apartar sería el de hace un rato. */}
      {ahorrando && (
        <AhorroModal
          goal={ahorrando}
          currency={settings.baseCurrency}
          techo={Math.min(ahorrando.targetAmount, ahorrando.reserved + porRepartir)}
          onClose={() => setAhorrando(null)}
          onGuardar={(amount) =>
            run(() => api.goals.reserve([{ id: ahorrando.id, amount }]), 'Ahorro actualizado')
          }
        />
      )}

      {borrando && (
        <Confirm
          title="Eliminar plan"
          message={`«${borrando.name}» desaparece. El dinero de la hucha no se toca.`}
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            await run(() => api.goals.remove(borrando.id), 'Plan eliminado')
            setBorrando(null)
          }}
        />
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
  onAchieve,
  onReserve,
  marcada,
  onMenu,
  onAbrir
}: {
  goal: GoalProgress
  currency: string
  /** Lo máximo que se le puede reservar: lo suyo más lo que quede libre. */
  techo: number
  onAchieve: () => void
  onReserve?: (amount: number) => void
  /** Su menú está abierto: se queda encendida para saber sobre cuál se pulsó. */
  marcada?: boolean
  onMenu?: (x: number, y: number) => void
  /** Abrir la ficha. La ficha se abre pulsando la tarjeta, ver abajo. */
  onAbrir?: () => void
}): ReactNode {
  const [reserva, setReserva] = useState(goal.reserved)

  /*
   * Mientras se arrastra manda el mando y no lo guardado.
   *
   * Es la única forma de saber cuánto estás poniendo: la cifra de la ficha ya
   * lo dice, así que se hace que siga al dedo en vez de añadir otro número al
   * lado del mando.
   */
  const puesto = onReserve != null ? Math.min(reserva, goal.targetAmount) : goal.saved

  const falta = Math.max(0, goal.targetAmount - puesto)

  /*
   * Hasta dónde puede llegar el mando: la meta, o la hucha si no da para tanto.
   *
   * Los dos extremos tienen que poder tocarse justos, y casi nunca caen en un
   * salto redondo: una meta de 249,99 € no es múltiplo de 25 €.
   */
  const tope = Math.min(techo, goal.targetAmount)

  /*
   * El salto de veinticinco en veinticinco, puesto a mano.
   *
   * Con el `step` del navegador el mando no llegaba al final. Chromium redondea
   * al salto más cercano y, si el resultado se pasa del máximo, le resta un
   * salto entero: en un plan de 249,99 € el mando se plantaba en 225 € y ahí se
   * quedaba por mucho que hubiera en la hucha. Redondeando aquí, por el medio se
   * sigue notando el salto y los extremos se alcanzan exactos.
   */
  const aSaltos = (valor: number): number => {
    if (valor >= tope) return tope
    if (valor <= 0) return 0
    return Math.min(Math.round(valor / PASO) * PASO, tope)
  }

  // Hasta dónde llega la hucha, en tanto por ciento del plan. Lo que venga
  // después del tope no es que esté vacío: es que no hay con qué llenarlo.
  const parte = (valor: number): string =>
    `${Math.max(0, Math.min(100, (valor / Math.max(1, goal.targetAmount)) * 100))}%`

  // Al recargar los datos manda lo guardado, no lo que quedó en el mando.
  useEffect(() => {
    setReserva(goal.reserved)
  }, [goal.reserved])

  const color =
    goal.status === 'complete'
      ? 'var(--positive)'
      : goal.status === 'late'
        ? 'var(--negative)'
        : goal.status === 'behind'
          ? 'var(--warning)'
          : goal.color

  /*
   * La tarjeta entera abre la ficha, como en Deudas y como en las cumplidas de
   * abajo. Aquí, a diferencia de allí, sí hay mandos dentro —el deslizador, la
   * cifra que se teclea, el botón de darlo por cumplido—, así que un clic que
   * caiga en uno de ellos no cuenta: se está usando el mando, no abriendo nada.
   *
   * Sin `role="button"`: una caja que anuncia ser un botón y lleva dentro un
   * deslizador y otros dos botones miente sobre lo que es. Al teclado se llega
   * por los mandos de dentro y por el clic derecho, que es de donde salió esto.
   */
  const abrir = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!onAbrir) return
    if ((event.target as HTMLElement).closest('button, input, a, select, textarea')) return
    onAbrir()
  }

  return (
    <div
      className={`plan-ahorro${onAbrir ? ' clicable' : ''}${marcada ? ' marcada' : ''}`}
      onClick={abrir}
      onContextMenu={(event) => {
        if (!onMenu) return
        event.preventDefault()
        onMenu(event.clientX, event.clientY)
      }}
    >
      <div className="row" style={{ marginBottom: 8 }}>
        <Avatar icon={goal.icon} color={goal.color} />
        <div style={{ minWidth: 0 }}>
          <div className="row tight">
            <strong>{goal.name}</strong>
          </div>
          <div className="small muted truncate">
            {goal.targetDate ? `Para el ${formatDate(goal.targetDate)}` : 'Sin fecha límite'}
            {goal.daysLeft != null &&
              (goal.daysLeft >= 0
                ? ` · Quedan ${goal.daysLeft} ${goal.daysLeft === 1 ? 'día' : 'días'}`
                : ` · Hace ${Math.abs(goal.daysLeft)} días`)}
            {goal.note ? ` · ${goal.note}` : ''}
          </div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: 'right' }}>
          {/* La cifra es cifra y nada más. Fue un botón con un lápiz que abría
              un campo aquí mismo; ahora la cantidad se escribe desde «Editar
              ahorro», en el clic derecho, y la ficha se queda para leerse. */}
          <div className="amount" style={{ fontSize: 16 }}>
            {formatMoney(puesto, currency)}{' '}
            <span className="muted" style={{ fontWeight: 500 }}>
              de {formatMoney(goal.targetAmount, currency)}
            </span>
          </div>
          <div className="small muted">
            {falta > 0 ? `Faltan ${formatMoney(falta, currency)}` : 'Completo'}
          </div>
        </div>
        {falta === 0 && (
          <button className="btn small" onClick={onAchieve} title="Darlo por cumplido y archivarlo">
            <Icon name="paquete" size={15} />
          </button>
        )}
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
            /* Al céntimo, que el salto lo pone `aSaltos`. Ver ahí por qué. */
            step="any"
            value={puesto}
            style={
              {
                '--tono': color,
                '--relleno': parte(puesto),
                '--alcance': parte(techo)
              } as CSSProperties
            }
            onChange={(event) => setReserva(aSaltos(Number(event.target.value)))}
            onKeyDown={(event) => {
              /*
               * Las flechas las mueve la ficha, no el navegador.
               *
               * Con el carril al céntimo, lo que mueve una flecha por su cuenta
               * es la centésima parte del plan —dos euros y medio en uno de
               * 250 €—, y `aSaltos` lo redondeaba de vuelta al sitio del que
               * había salido: el mando no se movía. Aquí la flecha vale un
               * salto entero, que es lo que se espera al verlo saltar.
               */
              const salto =
                event.key === 'ArrowRight' || event.key === 'ArrowUp'
                  ? PASO
                  : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                    ? -PASO
                    : event.key === 'PageUp'
                      ? PASO * 4
                      : event.key === 'PageDown'
                        ? -PASO * 4
                        : null
              const destino =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tope
                    : salto == null
                      ? null
                      : puesto + salto
              if (destino == null) return
              event.preventDefault()
              setReserva(aSaltos(destino))
            }}
            onMouseUp={() => onReserve(Math.min(reserva, techo))}
            onKeyUp={() => onReserve(Math.min(reserva, techo))}
            aria-label={`Ahorrado para ${goal.name}`}
          />
        </div>
      ) : (
        <ProgressBar percent={goal.percent} color={color} />
      )}


      <div className="small subtle" style={{ marginTop: 5 }}>
        {falta === 0
          ? 'Ya tienes ahorrado lo que querías.'
          : goal.perMonth != null
            ? `Tendrías que apartar ${formatMoney(goal.perMonth, currency)} al mes.`
            : goal.daysLeft != null && goal.daysLeft < 0
              ? 'La fecha ya pasó; cámbiala o dalo por cerrado.'
              : 'Sin fecha no hay ritmo que calcular: ponle una y te digo cuánto al mes.'}
      </div>
    </div>
  )
}

/**
 * Cuánto llevas ahorrado de un plan, escrito.
 *
 * El deslizador de la ficha va bien para tantear —se ve moverse la barra y lo
 * que falta—, pero cuando ya sabes que son 400 € buscarlos a pulso es absurdo.
 * Estuvo en la propia cifra, detrás de un lápiz: el campo salía donde estaba el
 * número y se guardaba al salir de él. Se cambió a un cuadro porque el lápiz
 * tenía que estar puesto en todas las fichas para el rato suelto en que se usa,
 * y porque escribiendo ahí no había forma de arrepentirse: cualquier clic fuera
 * ya lo había guardado.
 *
 * Aquí sí: se cancela y no ha pasado nada. Y el tope se respeta mientras se
 * escribe, que apartar lo que no hay en la hucha no es una cifra, es un error.
 */
function AhorroModal({
  goal,
  currency,
  techo,
  onClose,
  onGuardar
}: {
  goal: GoalProgress
  currency: string
  /** Lo máximo que se le puede apartar: lo suyo más lo que quede libre. */
  techo: number
  onClose: () => void
  onGuardar: (amount: number) => Promise<unknown>
}): ReactNode {
  // Lo que ya tiene, sin pasar de la meta: un plan al que se le bajó la meta
  // después puede llevar reservado de más, y eso no es lo que hay que enseñar.
  const [importe, setImporte] = useState(Math.min(goal.reserved, goal.targetAmount))

  /*
   * La hucha está a cero y este plan no tiene nada apartado: no hay ninguna
   * cifra que escribir aquí más que la que ya está.
   *
   * El campo se apaga en vez de dejarte teclear para nada. Se llegaba a poner
   * 500 € con la cuenta vacía, se guardaba, y la ficha volvía a enseñar 0,00 €
   * sin que nadie hubiera dicho por qué. El tope ya recorta mientras escribes,
   * pero un tope de cero es un campo que solo sabe decir que no: mejor que lo
   * diga de una vez y con sus palabras.
   *
   * Solo puede pasar con la reserva a cero: mientras haya algo apartado, ese
   * algo se puede bajar, y entonces el campo sí sirve.
   */
  const sinHueco = techo === 0

  const guardar = async (): Promise<void> => {
    const hecho = await onGuardar(Math.min(importe, techo))
    if (hecho !== null) onClose()
  }

  return (
    <Modal
      title="Editar ahorro"
      estrecho
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={guardar} disabled={sinHueco}>
            Guardar
          </button>
        </>
      }
    >
      {/* De qué plan se está hablando: el cuadro sale bajo el puntero y con
          cuatro planes en pantalla no se sabría sobre cuál se pulsó. */}
      <p className="small muted" style={{ margin: 0 }}>
        «{goal.name}» · meta de {formatMoney(goal.targetAmount, currency)}
      </p>

      {/* Enter guarda, que es un campo y un botón: obligar a bajar el ratón
          hasta «Guardar» para una cifra de cuatro teclas sobra. */}
      <div onKeyDown={(event) => event.key === 'Enter' && !sinHueco && guardar()}>
        <Field
          label="Cuánto llevas ahorrado"
          hint={
            sinHueco
              ? 'No queda nada libre en la hucha: mete dinero en la cuenta, o baja lo apartado en otro plan.'
              : techo >= goal.targetAmount
                ? 'La hucha da para llegar a la meta.'
                : `Como mucho ${formatMoney(techo, currency)}: es lo que queda libre en la hucha.`
          }
        >
          <AmountInput
            value={importe}
            currency={currency}
            max={techo}
            disabled={sinHueco}
            autoFocus={!sinHueco}
            onChange={setImporte}
          />
        </Field>
      </div>
    </Modal>
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
        <Field label="Título" required error={error}>
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

        <Field label="Cuánto" required>
          <AmountInput value={targetAmount} currency={currency} onChange={setTargetAmount} />
        </Field>

        <Field label="Para cuándo" hint="Sin fecha no se calcula el ritmo.">
          <DateInput value={targetDate} onChange={setTargetDate} clearable />
        </Field>

        <Field label="Icono">
          <IconPicker value={icon} options={ALL_ICONS} onChange={setIcon} />
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

/**
 * El ahorro automático: de qué ingresos sale y cuánto.
 *
 * Vive aquí y no en la ficha de cada categoría porque la pregunta que se hace
 * uno no es «¿qué hace la categoría Nómina?» sino «¿cuánto estoy apartando?», y
 * esa no se puede contestar mirando una ficha cada vez. Juntas, además, dicen lo
 * que suman al mes.
 *
 * La regla sigue guardada en la categoría —es lo que hace que se aplique sola,
 * venga el ingreso de una programada o escrito a mano—: lo que vive aquí es el
 * sitio donde se mira y se cambia, no el dato.
 */
function AhorroAutomatico({
  onEditar
}: {
  onEditar: (categoria: Category | null) => void
}): ReactNode {
  const { categories, accounts, settings, revision } = useStore()
  const [programadas, setProgramadas] = useState<ScheduledView[]>([])

  useEffect(() => {
    api.scheduled
      .list()
      .then(setProgramadas)
      .catch(() => undefined)
  }, [revision])

  const deIngreso = categories.filter((item) => item.kind === 'income' && !item.archived)
  const conRegla = deIngreso.filter((item) => item.saveAccountId != null)
  const sinRegla = deIngreso.filter((item) => item.saveAccountId == null)

  /*
   * Lo que apartaría cada regla, contado al año y con su ritmo de verdad.
   *
   * Al año y no al mes, que es lo que pedía esto a gritos: una paga semestral no
   * aparta «129 € cada mes» —esos meses no entra nada—, aparta lo suyo dos veces
   * al año. Prorratear inventa una cifra que no ocurre ningún mes y que además
   * no se puede comprobar mirando la cuenta.
   *
   * Y solo cuenta lo programado, a propósito: es lo único que se sabe que va a
   * entrar. Un ingreso escrito a mano también apartará lo suyo, pero nadie puede
   * prometer cuándo, y una previsión que se inventa la mitad no vale para
   * decidir un porcentaje.
   */
  const ritmoPorCategoria = new Map<
    number,
    { alAño: number; vecesAlAño: number; cadencias: Set<string>; freq: Frequency; interval: number }
  >()
  for (const fila of programadas) {
    if (fila.type !== 'income' || !fila.active || fila.settledAt || fila.categoryId == null) continue
    const veces = vecesAlAño(fila.freq, fila.interval)
    if (veces === 0) continue
    const previo = ritmoPorCategoria.get(fila.categoryId)
    const suyo = { alAño: fila.amount * veces, vecesAlAño: veces }
    if (!previo) {
      ritmoPorCategoria.set(fila.categoryId, {
        ...suyo,
        cadencias: new Set([`${fila.freq}:${fila.interval}`]),
        freq: fila.freq,
        interval: fila.interval
      })
    } else {
      previo.alAño += suyo.alAño
      previo.vecesAlAño += suyo.vecesAlAño
      previo.cadencias.add(`${fila.freq}:${fila.interval}`)
    }
  }

  /** Lo que aparta esa categoría en un año, y cuánto cada vez que entra. */
  const loQueAparta = (
    categoria: Category
  ): { alAño: number; porVez: number; veces: number; cadencia: string | null } | null => {
    const ritmo = ritmoPorCategoria.get(categoria.id)
    if (!ritmo) return null
    const alAño =
      categoria.saveAmount != null
        ? Math.round(categoria.saveAmount * ritmo.vecesAlAño)
        : Math.round((ritmo.alAño * (categoria.savePercent ?? 0)) / 100)
    return {
      alAño,
      porVez: Math.round(alAño / ritmo.vecesAlAño),
      veces: ritmo.vecesAlAño,
      // Con dos cadencias distintas mezcladas no hay un «cada cuánto» que decir.
      cadencia: ritmo.cadencias.size === 1 ? describeFrequency(ritmo.freq, ritmo.interval) : null
    }
  }

  const total = conRegla.reduce((suma, categoria) => suma + (loQueAparta(categoria)?.alAño ?? 0), 0)

  return (
    <div className="card">
      <div className="card-header">
        <h2>Ahorro automático</h2>
        <span className="small muted">
          De cada ingreso, a la hucha, sin tener que acordarse.
        </span>
        {total > 0 && (
          <span className="small nowrap">
            Apartas{' '}
            <strong className="amount positive">
              {formatMoney(total, settings.baseCurrency)}
            </strong>{' '}
            al año
          </span>
        )}
      </div>

      <div className="card-body col" style={{ gap: 2 }}>
        {conRegla.map((categoria) => {
          const hucha = accounts.find((item) => item.id === categoria.saveAccountId)
          return (
            <button
              key={categoria.id}
              className="list-row clickable"
              onClick={() => onEditar(categoria)}
            >
              <Avatar icon={categoria.icon} color={categoria.color} size="small" />
              <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 570 }} className="truncate">
                  {categoria.name}
                </div>
                <div className="small muted truncate">
                  {categoria.saveAmount != null
                    ? formatMoney(categoria.saveAmount, settings.baseCurrency)
                    : `${categoria.savePercent} %`}{' '}
                  · a {hucha?.name ?? 'una hucha que ya no está'}
                </div>
              </div>
              {(() => {
                const previsto = loQueAparta(categoria)
                if (!previsto || previsto.alAño <= 0) return null
                return (
                  <div style={{ textAlign: 'right' }}>
                    <div className="small muted nowrap">
                      {formatMoney(previsto.alAño, settings.baseCurrency)} al año
                    </div>
                    {/* Y lo que se aparta cada vez que entra, que es lo que se
                        verá de verdad en la cuenta. Sin repetirlo cuando es
                        mensual y las dos cifras dirían casi lo mismo. */}
                    {previsto.cadencia && previsto.veces < 12 && (
                      <div className="small subtle nowrap">
                        {formatMoney(previsto.porVez, settings.baseCurrency)} cada vez ·{' '}
                        {previsto.cadencia.toLowerCase()}
                      </div>
                    )}
                  </div>
                )
              })()}
            </button>
          )
        })}

        {conRegla.length === 0 && (
          <p className="small muted" style={{ margin: '4px 6px 10px' }}>
            Ninguna categoría aparta nada todavía. Elige una de abajo y di cuánto
            quieres guardar de lo que entre por ahí: se traspasará solo a la hucha.
          </p>
        )}

        {/* Y para poner una nueva, un botón y no la lista entera de categorías
            sin regla: aquello llenaba el bloque de cosas que no haces con lo que
            sí haces, y lo que se viene a mirar aquí es lo segundo. */}
        {sinRegla.length > 0 && (
          <div className="row" style={{ marginTop: conRegla.length > 0 ? 10 : 0 }}>
            <button className="btn small" onClick={() => onEditar(sinRegla[0])}>
              <Icon name="plus" size={14} />
              Apartar de otro ingreso
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * La ficha de una regla de ahorro.
 *
 * Dos formas de decir cuánto —un tanto por ciento de lo que entre, o una cifra
 * fija— porque son la misma decisión dicha de distinta manera: hay quien piensa
 * «el 10 %» y quien piensa «cien euros de cada nómina».
 */
function ReglaModal({
  categoria: inicial,
  onClose
}: {
  categoria: Category
  onClose: () => void
}): ReactNode {
  const { accounts, categories, settings, run } = useStore()
  /*
   * De qué ingreso se aparta.
   *
   * Poniendo una regla nueva se elige aquí dentro, que es donde se está
   * mirando; cambiándola, la categoría ya está decidida y el desplegable no
   * pinta nada —sería una forma rara de mover una regla de sitio—.
   */
  const nueva = inicial.saveAccountId == null
  const [categoria, setCategoria] = useState<Category>(inicial)
  const sinRegla = categories.filter(
    (item) => item.kind === 'income' && !item.archived && item.saveAccountId == null
  )
  const [goals, setGoals] = useState<Goal[]>([])
  const [modo, setModo] = useState<'porciento' | 'cifra'>(
    categoria.saveAmount != null ? 'cifra' : 'porciento'
  )
  const [porciento, setPorciento] = useState(
    categoria.savePercent != null ? String(categoria.savePercent) : '10'
  )
  const [cifra, setCifra] = useState(categoria.saveAmount ?? 0)
  const [hucha, setHucha] = useState<number | null>(categoria.saveAccountId ?? null)
  const [plan, setPlan] = useState<number | null>(categoria.saveGoalId ?? null)

  useEffect(() => {
    api.goals.list().then(setGoals).catch(() => undefined)
  }, [])

  const huchas = accounts.filter((item) => item.type === 'savings')
  const planes = goals.filter((goal) => !goal.achievedAt && goal.accountId === hucha)
  const moneda = huchas.find((item) => item.id === hucha)?.currency ?? settings.baseCurrency
  const completa = hucha != null && (modo === 'cifra' ? cifra > 0 : Number(porciento) > 0)

  // Cambiar de hucha deja huérfano el plan elegido, que era de la otra.
  useEffect(() => {
    setPlan((actual) => (actual && planes.some((goal) => goal.id === actual) ? actual : null))
  }, [hucha, goals])

  // Con una sola hucha, elegirla no es una decisión: viene puesta.
  useEffect(() => {
    if (hucha == null && huchas.length === 1) setHucha(huchas[0].id)
  }, [huchas, hucha])

  async function guardar(quitando = false): Promise<void> {
    const guardado = await run(
      () =>
        api.categories.save({
          ...categoria,
          savePercent: quitando ? null : modo === 'porciento' ? Number(porciento) : null,
          saveAmount: quitando ? null : modo === 'cifra' ? cifra : null,
          saveAccountId: quitando ? null : hucha,
          saveGoalId: quitando ? null : plan
        }),
      quitando ? 'Regla quitada' : 'Regla guardada'
    )
    // Guardar recarga el almacén entero, así que el bloque de detrás ya sale
    // con la regla puesta: aquí solo queda cerrar.
    if (guardado) onClose()
  }

  return (
    <Modal
      title={nueva ? 'Apartar de un ingreso' : `Apartar de ${categoria.name}`}
      onClose={onClose}
      footer={
        <>
          {categoria.saveAccountId != null && (
            <button className="btn ghost danger" onClick={() => guardar(true)}>
              Quitar la regla
            </button>
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!completa} onClick={() => guardar()}>
            Guardar
          </button>
        </>
      }
    >
      {huchas.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          Para apartar hace falta una cuenta de ahorro. Crea una en Cuentas y vuelve.
        </p>
      ) : (
        <>
          {nueva && sinRegla.length > 1 && (
            <Field label="De qué ingreso">
              <select
                className="select"
                value={categoria.id}
                onChange={(event) =>
                  setCategoria(
                    sinRegla.find((item) => item.id === Number(event.target.value)) ?? categoria
                  )
                }
              >
                {sinRegla.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Cuánto" hint="De cada ingreso de esta categoría.">
            <div className="row tight wrap">
              <Segmented
                value={modo}
                onChange={setModo}
                options={[
                  { value: 'porciento', label: '%' },
                  { value: 'cifra', label: currencySymbol(moneda) }
                ]}
              />
              {modo === 'porciento' ? (
                <div className="row tight" style={{ gap: 6 }}>
                  <input
                    className="input"
                    style={{ width: 74, textAlign: 'right' }}
                    inputMode="numeric"
                    placeholder="0"
                    value={porciento}
                    onChange={(event) =>
                      setPorciento(
                        keepNumericChars(event.target.value, { decimals: false }).slice(0, 3)
                      )
                    }
                  />
                  <span className="small muted">% de lo que entre</span>
                </div>
              ) : (
                <div style={{ width: 140 }}>
                  <AmountInput value={cifra} currency={moneda} onChange={setCifra} compact />
                </div>
              )}
            </div>
          </Field>

          <Field label="A qué hucha">
            <select
              className="select"
              value={hucha ?? ''}
              onChange={(event) => setHucha(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Elige una…</option>
              {huchas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {formatMoney(item.balance, item.currency)}
                </option>
              ))}
            </select>
          </Field>

          {/* El plan es opcional: sin él, lo apartado entra como ahorro libre de
              esa hucha, que es lo que pasa si no se dice nada. */}
          {hucha != null && planes.length > 0 && (
            <Field label="Y a qué plan" hint="Sin elegir ninguno se queda como ahorro libre.">
              <select
                className="select"
                value={plan ?? ''}
                onChange={(event) => setPlan(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Ahorro libre · sin asignar</option>
                {planes.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}
    </Modal>
  )
}

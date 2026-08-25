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
import { tituloProgramada } from '@shared/text'
import { FRECUENCIAS, describeFrequency } from '../lib/frecuencias'
import { DetallesRepeticion, ResumenRepeticion } from '../components/DetallesRepeticion'
import { MenuContextual, type OpcionMenu } from '../components/MenuContextual'
import { ImporteProgramado, FechasProgramadas } from '../components/ProgramadaRapida'
import { DateInput } from '../components/DateInput'
import { formatDate, relativeDays, today } from '@shared/dates'
import type { Frequency, GoalProgress, ScheduledView, TxType } from '@shared/types'

const api = window.bonk

/**
 * Cómo se llama una programación en la lista. Las nuevas solo tienen nota; las
 * de antes podían tener además un nombre, y ese manda mientras exista.
 */
const titleOf = (row: Pick<ScheduledView, 'name' | 'note' | 'categoryName'>): string =>
  tituloProgramada(row)

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

/** Una programación con el sello puesto: la fecha de terminada está, seguro. */
type Finalizada = ScheduledView & { settledAt: string }

/**
 * Reanudar preguntando hasta cuándo.
 *
 * Antes solo confirmaba y la dejaba sin fecha de fin, y eso descuadraba las
 * deudas: sin final no hay plan que medir, así que el Kindle pasaba de «3/4
 * cuotas» a «3 pagadas, sin total conocido». Se avisaba en el texto, pero
 * avisar de que vas a perder un dato no es lo mismo que dejarte conservarlo.
 *
 * Vacía sigue valiendo, que es lo que quiere una suscripción: se reanuda y
 * sigue hasta que la pares.
 */
function ResumeModal({
  schedule,
  onClose,
  onResume
}: {
  schedule: ScheduledView
  onClose: () => void
  onResume: (endDate: string | null) => Promise<void>
}): ReactNode {
  const [endDate, setEndDate] = useState('')

  return (
    <Modal
      title="Reanudar"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => onResume(endDate || null)}>
            Reanudar
          </button>
        </>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        «{titleOf(schedule)}» volverá a generar movimientos desde el{' '}
        {formatDate(schedule.nextDate)}. Lo ya registrado no se toca.
      </p>

      <Field
        label="Termina el"
        hint={
          schedule.isDebt
            ? 'Sin fecha no se pueden contar las cuotas que quedan.'
            : 'Déjala vacía si no tiene final.'
        }
      >
        <DateInput value={endDate} onChange={setEndDate} clearable />
      </Field>
    </Modal>
  )
}

export function SchedulesView(): ReactNode {
  const { revision, run, toast, fail } = useStore()
  const [rows, setRows] = useState<ScheduledView[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ScheduledView | null>(null)
  const [creating, setCreating] = useState(false)
  const [finishing, setFinishing] = useState<ScheduledView | null>(null)
  const [resuming, setResuming] = useState<ScheduledView | null>(null)
  const [hoveredFamily, setHoveredFamily] = useState<number | null>(null)
  /*
   * El clic derecho, con lo que de verdad se le hace a una programación.
   *
   * La fila entera ya abre la ficha, y para cambiar el precio de una suscripción
   * había que recorrerla entera buscando el campo. Aquí están los dos retoques
   * que se hacen a menudo, colgarle una devolución, y borrarla.
   */
  const [menu, setMenu] = useState<{ row: ScheduledView; x: number; y: number } | null>(null)
  const [cambiandoImporte, setCambiandoImporte] = useState<ScheduledView | null>(null)
  const [cambiandoFechas, setCambiandoFechas] = useState<ScheduledView | null>(null)
  const [devolviendo, setDevolviendo] = useState<ScheduledView | null>(null)
  const [borrando, setBorrando] = useState<ScheduledView | null>(null)

  const opcionesDe = (row: ScheduledView): OpcionMenu[] => {
    const lista: OpcionMenu[] = [
      { etiqueta: 'Editar importe', icono: 'edit', onElegir: () => setCambiandoImporte(row) },
      { etiqueta: 'Editar fechas', icono: 'calendar', onElegir: () => setCambiandoFechas(row) }
    ]
    /*
     * Solo un gasto puede tener quien le devuelva.
     *
     * Y no una devolución: la devolución de una devolución no es nada. Sobre una
     * terminada tampoco, que lo que se le colgara no llegaría a pasar nunca.
     */
    if (row.type === 'expense' && row.settledAt == null) {
      lista.push({
        etiqueta: 'Registrar reembolso',
        icono: 'refund',
        onElegir: () => setDevolviendo(row)
      })
    }
    lista.push({
      etiqueta: 'Eliminar',
      icono: 'trash',
      peligrosa: true,
      onElegir: () => setBorrando(row)
    })
    return lista
  }

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
   *
   * El sello viaja en el tipo para poder enseñar su fecha sin prometerle a
   * TypeScript que existe: aquí había un `endDate!` —otro campo, además del que
   * decide esta lista— y una finalizada sin fecha de fin tiraba la pantalla
   * entera.
   */
  const isFinished = (row: ScheduledView): row is Finalizada => row.settledAt != null
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
                  'clickable',
                  'con-menu',
                  row.active ? '' : 'paused',
                  // La anidada ya se ve colgando: la marca del canto sobraría.
                  family !== undefined && !nested ? 'linked' : '',
                  active ? 'linked-active' : '',
                  nested ? 'nested' : '',
                  nested && !last ? 'nested-continues' : '',
                  menu?.row.id === row.id ? 'marcada' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="button"
                onClick={() => setEditing(row)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ row, x: event.clientX, y: event.clientY })
                }}
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
                      <span className="pill">{row.isDebt ? 'Finalizada' : 'En pausa'}</span>
                    )}
                  </div>
                  <div className="small muted truncate">
                    {row.type === 'refund' && (
                      <span className="pill reembolso" style={{ marginRight: 6 }}>
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
                    {/* La espera y el día, juntos: «en 3 días» dice si corre
                        prisa y la fecha dice cuál es, que es lo que se apunta
                        uno. Cada una sola obliga a echar la cuenta de la otra. */}
                    {row.active
                      ? `Próximo ${relativeDays(row.nextDate)} (${formatDate(row.nextDate)})`
                      : formatDate(row.nextDate)}
                  </div>
                </div>

                {/* Los mandos de la fila hacen lo suyo y ahí se quedan: sin frenar
                    el clic, cada uno abriría además la ficha por detrás. */}
                <button
                  className="btn small"
                  title="Registrar ahora sin esperar a la fecha"
                  onClick={async (event) => {
                    event.stopPropagation()
                    await run(() => api.scheduled.postNow(row.id))
                    toast('Movimiento registrado', 'success')
                  }}
                >
                  <Icon name="check" size={15} />
                </button>
                {row.isDebt && row.active ? (
                  <button
                    className="btn ghost icon"
                    title="Finalizar: la deuda queda saldada y no se generan más cuotas"
                    onClick={(event) => {
                      event.stopPropagation()
                      setFinishing(row)
                    }}
                  >
                    <Icon name="finish" size={16} />
                  </button>
                ) : (
                  <button
                    className="btn ghost icon"
                    title={row.active ? 'Pausar' : 'Reanudar'}
                    onClick={(event) => {
                      event.stopPropagation()
                      run(() => api.scheduled.setActive(row.id, !row.active))
                    }}
                  >
                    <Icon name={row.active ? 'pause' : 'play'} size={16} />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {finalizadas.length > 0 && (
        <div className="card flush">
          <div className="card-header">
            <h2>Finalizadas</h2>
            <span className="small muted">Ya no generan nada.</span>
          </div>
          {finalizadas.map((row) => (
            <div
              key={row.id}
              className="list-row finished clickable"
              role="button"
              onClick={() => setEditing(row)}
            >
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
                    <span className="pill reembolso" style={{ marginRight: 6 }}>
                      Reembolso
                    </span>
                  )}
                  {describeFrequency(row.freq, row.interval)} · {row.accountName} · Terminó el{' '}
                  {formatDate(row.settledAt)}
                </div>
              </div>
              <div className="amount">
                {formatMoney(
                  row.type === 'expense' ? -row.amount : row.amount,
                  row.accountCurrency,
                )}
              </div>

              {/* Como los mandos de arriba: hace lo suyo y para el clic, que si
                  no abriría además la ficha por detrás. */}
              <button
                className="btn ghost icon"
                title="Reanudar: vuelve a generar movimientos"
                onClick={(event) => {
                  event.stopPropagation()
                  setResuming(row)
                }}
              >
                <Icon name="play" size={16} />
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

      {resuming && (
        <ResumeModal
          schedule={resuming}
          onClose={() => setResuming(null)}
          onResume={async (endDate) => {
            const hecho = await run(
              () => api.scheduled.resume(resuming.id, endDate),
              'Programación reanudada'
            )
            if (hecho !== null) setResuming(null)
          }}
        />
      )}

      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          opciones={opcionesDe(menu.row)}
          onCerrar={() => setMenu(null)}
        />
      )}

      {cambiandoImporte && (
        <ImporteProgramado row={cambiandoImporte} onClose={() => setCambiandoImporte(null)} />
      )}

      {cambiandoFechas && (
        <FechasProgramadas row={cambiandoFechas} onClose={() => setCambiandoFechas(null)} />
      )}

      {/* La devolución nace enlazada a su gasto y con su mismo ritmo: la ficha
          sale rellena y solo queda poner cuánto devuelven. */}
      {devolviendo && (
        <ScheduleModal
          schedule={null}
          siblings={rows}
          devolucionDe={devolviendo}
          titulo="Reembolso programado"
          onClose={() => setDevolviendo(null)}
          onSave={(input) => run(() => api.scheduled.save(input), 'Reembolso programado')}
        />
      )}

      {borrando && (
        <Confirm
          title="Eliminar programación"
          message="Los movimientos ya generados se conservan; solo deja de repetirse en el futuro."
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            await run(() => api.scheduled.remove(borrando.id), 'Programación eliminada')
            setBorrando(null)
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
interface ScheduleModalProps {
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
  /** Nace ya marcada como deuda: es como la crea la pestaña Deudas. */
  deudaPorDefecto?: boolean
  /**
   * Nace como la devolución de esta otra programada.
   *
   * Hereda su cuenta, su categoría y su ritmo: la parte del alquiler que devuelve
   * el otro llega a la misma cuenta y el mismo mes que sale el recibo. Se puede
   * cambiar todo, pero de partida es lo que va a ser casi siempre.
   */
  devolucionDe?: ScheduledView | null
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
  deudaPorDefecto,
  devolucionDe,
  titulo,
  onClose,
  onSave,
  onDelete,
}: ScheduleModalProps): ReactNode {
  const { accounts, categories, settings } = useStore()
  const preferredAccountId = usePreferredAccountId()
  const [type, setType] = useState<TxType>(schedule?.type ?? (devolucionDe ? 'refund' : 'expense'))
  const [amount, setAmount] = useState(schedule?.amount ?? 0)
  const [accountId, setAccountId] = useState(
    schedule?.accountId ?? devolucionDe?.accountId ?? preferredAccountId
  )
  const [toAccountId, setToAccountId] = useState<number | null>(schedule?.toAccountId ?? null)
  const [goalId, setGoalId] = useState<number | null>(schedule?.goalId ?? null)
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(
    schedule?.categoryId ?? devolucionDe?.categoryId ?? defaultCategoryId ?? null,
  )
  const [lender, setLender] = useState(schedule?.lender ?? '')
  const [freq, setFreq] = useState<Frequency>(schedule?.freq ?? devolucionDe?.freq ?? 'monthly')
  const [interval, setInterval] = useState(schedule?.interval ?? devolucionDe?.interval ?? 1)
  const [nextDate, setNextDate] = useState(schedule?.nextDate ?? devolucionDe?.nextDate ?? today())
  const [endDate, setEndDate] = useState(schedule?.endDate ?? '')
  const [autoPost, setAutoPost] = useState(schedule?.autoPost ?? true)
  const [remind, setRemind] = useState(schedule?.remind ?? true)
  // Las programaciones de antes tenían nombre además de nota. Al abrir una de
  // esas, su nombre pasa a la nota: es lo que la lista enseñaba, y así no se
  // pierde al guardar sin el campo que ya no existe.
  const [note, setNote] = useState(schedule?.note || schedule?.name || '')
  const [refundForScheduledId, setRefundForScheduledId] = useState<number | null>(
    schedule?.refundForScheduledId ?? devolucionDe?.id ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /*
   * Que este plan sea una deuda a plazos.
   *
   * Estuvo en la categoría, y obligaba a meter en una sola todo lo que se paga
   * a plazos para que saliera en su pestaña. Aquí el portátil puede ir en
   * Tecnología y contar igual, y quien llame «chopped» a sus deudas no tiene
   * que renombrar nada.
   */
  const [esDeuda, setEsDeuda] = useState(schedule?.isDebt ?? deudaPorDefecto ?? false)
  /*
   * Quién la cobra se pregunta en un cuadro aparte, al marcarla como deuda.
   *
   * Dentro de la ficha el desplegable salía a media pantalla de distancia de la
   * casilla que lo hacía aparecer, así que marcar la casilla no parecía tener
   * ningún efecto y el dato se quedaba sin poner. Aquí sale delante y no hay
   * forma de no verlo.
   */
  const [pidiendoPrestamista, setPidiendoPrestamista] = useState<'marcando' | 'cambiando' | null>(
    null,
  )

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
      isDebt: esDeuda,
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
        <Field label="Título">
          <input
            className="input"
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Netflix, alquiler, la cuota del PC…"
          />
        </Field>
        <Field label="Importe" required error={error}>
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

        {/* Las tres casillas, a la par: son respuestas de sí o no, cortas, y en
            columna estiraban el formulario media pantalla para nada. */}
        <div className="casillas">
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

          {/* Un traspaso no se debe a nadie, y un reembolso es dinero que vuelve.
              Y creando una deuda desde su pestaña la casilla sobra: preguntarle a
              quien acaba de pulsar «Nueva deuda» si esto es una deuda es hacerle
              repetir lo que ya dijo. Editando sí sale, que ahí se puede cambiar
              de idea. */}
          {type !== 'transfer' && type !== 'refund' && !(deudaPorDefecto && !schedule) && (
            <div className="col" style={{ gap: 6 }}>
              <Checkbox
                checked={esDeuda}
                onChange={(marcada) => {
                  setEsDeuda(marcada)
                  // Solo al marcarla: desmarcándola no hay nada que concretar.
                  if (marcada) setPidiendoPrestamista('marcando')
                }}
                label="Es una deuda a plazos"
                hint="Sale en la pestaña Deudas, con lo pagado y lo que falta."
              />
              {esDeuda && (
                <ResumenRepeticion
                  campos={['prestamista']}
                  valores={{ freq, interval, endDate, lender }}
                  onCambiar={() => setPidiendoPrestamista('cambiando')}
                />
              )}
            </div>
          )}
        </div>
      </Modal>

      {pidiendoPrestamista && (
        <DetallesRepeticion
          titulo="Deuda a plazos"
          campos={['prestamista']}
          valores={{ freq, interval, endDate, lender }}
          onCancelar={() => {
            // Cancelar deshace lo que abrió el cuadro: si venía de marcar la
            // casilla, la casilla se desmarca; si venía del «Cambiar», no.
            if (pidiendoPrestamista === 'marcando') setEsDeuda(false)
            setPidiendoPrestamista(null)
          }}
          onGuardar={(nuevos) => {
            setLender(nuevos.lender)
            setPidiendoPrestamista(null)
          }}
        />
      )}

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

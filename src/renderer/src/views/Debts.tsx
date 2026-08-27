import { useEffect, useState, type ReactNode } from 'react'
import { ScheduleModal } from './Schedules'
import { useStore } from '../lib/store'
import {
  Avatar,
  EmptyState,
  Loading,
  ProgressBar,
  Modal,
  Field,
  AmountInput,
  NumberInput
} from '../components/ui'
import { AccionCabecera, Confirm } from '../components/ui'
import { MenuContextual, type OpcionMenu } from '../components/MenuContextual'
import { formatMoney } from '@shared/money'
import { findLender } from '@shared/lenders'
import { formatDate } from '@shared/dates'
import { mayuscula } from '@shared/text'
import type { DebtProgress } from '@shared/types'

/**
 * Cómo van tus deudas a plazos.
 *
 * Es una pantalla para mirar, no para tocar: las cuotas se registran solas desde
 * Programados y desde ahí se editan. Aquí se responde a lo único que se pregunta
 * de una deuda —cuánto llevo, cuánto queda, cuándo se acaba— sin tener que
 * sumar recibos a mano.
 */

const api = window.bonk

/**
 * «faltan 8 meses», «faltan 12 días»: en la unidad en que se piensa la espera.
 *
 * Dos unidades y no tres. Las esperas largas se contaban en años —«faltan 2
 * años»— y un año es demasiado grueso para lo que se pregunta aquí: entre 18 y
 * 30 meses hay un año entero de diferencia y los dos salían como «2 años». En
 * meses siempre se sabe cuántas cuotas quedan, que es lo que se está mirando.
 * Los días, solo por debajo del mes, donde contar en meses sería redondear el
 * final a cero.
 */
function espera(days: number): string {
  if (days <= 0) return 'ya vencida'
  if (days < 30) return `falta${days === 1 ? '' : 'n'} ${days} ${days === 1 ? 'día' : 'días'}`
  const meses = Math.round(days / 30)
  return `falta${meses === 1 ? '' : 'n'} ${meses} ${meses === 1 ? 'mes' : 'meses'}`
}

export function DebtsView(): ReactNode {
  const { settings, revision, fail, run, refresh } = useStore()
  const [debts, setDebts] = useState<DebtProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [adjusting, setAdjusting] = useState<DebtProgress | null>(null)
  const [creando, setCreando] = useState(false)
  /*
   * Pagar desde aquí, que es donde se mira la deuda.
   *
   * Adelantar una cuota o cancelar la deuda entera son cosas que se deciden
   * viendo cuánto queda, y hasta ahora había que irse a Programados a buscar el
   * plan. Van por clic derecho: la tarjeta entera ya se pulsa para ajustarla.
   */
  const [menu, setMenu] = useState<{ debt: DebtProgress; x: number; y: number } | null>(null)
  const [saldando, setSaldando] = useState<DebtProgress | null>(null)
  const [borrando, setBorrando] = useState<DebtProgress | null>(null)


  useEffect(() => {
    setLoading(true)
    api.scheduled
      .debts()
      .then(setDebts)
      .catch(fail('tus deudas'))
      .finally(() => setLoading(false))
  }, [revision])

  /*
   * Lo que ofrece el clic derecho.
   *
   * «Pagar todo ahora» solo cuando se sabe cuánto queda: sin fecha de fin ni
   * total puesto a mano no hay cifra que cobrar, y un botón que a veces no puede
   * hacer nada es peor que un botón que no está.
   */
  const opcionesDe = (debt: DebtProgress): OpcionMenu[] => {
    const lista: OpcionMenu[] = [
      {
        etiqueta: 'Pagar cuota actual',
        icono: 'check',
        onElegir: async () => {
          const hecho = await run(
            () => api.scheduled.postNow(debt.scheduledId),
            `Cuota de ${debt.title} apuntada`
          )
          if (hecho !== undefined) await refresh()
        }
      }
    ]
    if (debt.left != null && debt.left > 0) {
      lista.push({
        etiqueta: 'Pagar todo ahora',
        icono: 'invest',
        onElegir: () => setSaldando(debt)
      })
    }
    lista.push({
      etiqueta: 'Eliminar',
      icono: 'trash',
      peligrosa: true,
      onElegir: () => setBorrando(debt)
    })
    return lista
  }

  const abiertas = debts.filter((debt) => !debt.settled)
  const pagadas = debts.filter((debt) => debt.settled)

  // Lo que queda por pagar de todo lo que debes, que es la cifra que se busca al
  // entrar. Las que no tienen fecha de fin no suman: no se sabe cuánto queda.
  const pendiente = abiertas.reduce((sum, debt) => sum + (debt.left ?? 0), 0)
  const alMes = abiertas.reduce((sum, debt) => sum + debt.monthlyCost, 0)
  // Lo llevado pagado va al lado de lo que falta y en verde: es la mitad buena
  // de la misma cuenta, y de las tres cifras es la única que sube.
  const pagado = abiertas.reduce((sum, debt) => sum + debt.paid, 0)
  const sinFecha = abiertas.filter((debt) => debt.left == null).length

  return (
    <>
      {/* Una deuda es una programación marcada como tal, así que el botón abre
          esa misma ficha con la casilla ya puesta. Su categoría la eliges tú: el
          portátil en Tecnología y el curso en Formación, si así los piensas. */}
      <AccionCabecera>
        <button className="btn primary" onClick={() => setCreando(true)}>
          Nueva deuda
        </button>
      </AccionCabecera>

      <div className="card flush">
        {!loading && abiertas.length > 0 && (
          <div className="card-body networth-strip" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="networth">
              <div className="label">Te queda por pagar</div>
              <div className={`value amount ${pendiente > 0 ? 'negative' : 'neutral'}`}>
                {formatMoney(pendiente, settings.baseCurrency)}
              </div>
            </div>
            {/* Al mismo tamaño que lo que queda: es la cifra que aprieta cada mes,
                y la que se compara con lo que entra. */}
            <div className="networth">
              <div className="label">Pagas al mes</div>
              <div className={`value amount ${alMes > 0 ? 'negative' : 'neutral'}`}>
                {formatMoney(alMes, settings.baseCurrency)}
              </div>
            </div>
            <div className="networth">
              <div className="label">Llevas pagado</div>
              <div className={`value amount ${pagado > 0 ? 'positive' : 'neutral'}`}>
                {formatMoney(pagado, settings.baseCurrency)}
              </div>
            </div>
            {sinFecha > 0 && (
              <span className="small subtle" style={{ alignSelf: 'center' }}>
                {sinFecha === 1
                  ? 'Una no tiene fecha de fin, así que no cuenta en el total.'
                  : `${sinFecha} no tienen fecha de fin, así que no cuentan en el total.`}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <Loading />
        ) : abiertas.length === 0 ? (
          <EmptyState
            icon="debt"
            title="No debes nada"
            message="Las deudas salen de las programaciones cuya categoría está marcada como deuda a plazos, y con fecha de fin para saber cuándo se acaban."
          />
        ) : (
          <div className="card-body col" style={{ gap: 2 }}>
            {abiertas.map((debt) => (
              <DebtCard
                key={debt.scheduledId}
                debt={debt}
                currency={settings.baseCurrency}
                onAdjust={() => setAdjusting(debt)}
                marcada={menu?.debt.scheduledId === debt.scheduledId}
                onMenu={(x, y) => setMenu({ debt, x, y })}
              />
            ))}
          </div>
        )}
      </div>

      {pagadas.length > 0 && (
        <div className="card flush">
          <div className="card-header">
            <h2>Pagadas</h2>
            <span className="small muted">Ya no sale nada de tu cuenta por ellas.</span>
          </div>
          <div>
            {pagadas.map((debt) => (
              <div
                key={debt.scheduledId}
                className="list-row clickable"
                role="button"
                onClick={() => setAdjusting(debt)}
              >
                <Avatar
                  icon={debt.categoryIcon ?? 'debt'}
                  color={debt.categoryColor ?? '#8E8E93'}
                  size="small"
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 570 }} className="truncate">
                    {debt.title}
                  </div>
                  <div className="small muted">
                    {debt.paidCount} {debt.paidCount === 1 ? 'cuota' : 'cuotas'}
                    {debt.settledAt ? ` · Saldada el ${formatDate(debt.settledAt)}` : ''}
                  </div>
                </div>
                <div className="amount muted">{formatMoney(debt.paid, debt.currency)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        Dos opciones y las dos escriben en los mismos tres sitios: la cuota se
        apunta en Movimientos, la programada avanza su fecha —o se sella, si era
        la última— y esta pantalla vuelve a echar la cuenta. No hay tres
        operaciones, hay una que se ve desde tres pantallas.
      */}
      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          opciones={opcionesDe(menu.debt)}
          onCerrar={() => setMenu(null)}
        />
      )}

      {/* Saldar sí pregunta: es un pago grande, de una vez, y deja la deuda
          cerrada. Adelantar una cuota no, que es lo que iba a pasar de todos
          modos unos días después. */}
      {saldando && (
        <Confirm
          title="Pagar toda la deuda"
          confirmLabel={`Pagar ${formatMoney(saldando.left ?? 0, settings.baseCurrency)}`}
          message={
            <>
              Se apunta un pago de{' '}
              <strong>{formatMoney(saldando.left ?? 0, settings.baseCurrency)}</strong> en{' '}
              {saldando.accountName}, con fecha de hoy, y «{saldando.title}» pasa a pagadas.
              {saldando.leftCount != null && saldando.leftCount > 1 && (
                <>
                  {' '}Las {saldando.leftCount} cuotas que quedaban dejan de generarse.
                </>
              )}
            </>
          }
          onCancel={() => setSaldando(null)}
          onConfirm={async () => {
            const hecho = await run(
              () => api.scheduled.settleDebt(saldando.scheduledId),
              `${saldando.title} pagada del todo`
            )
            setSaldando(null)
            if (hecho) await refresh()
          }}
        />
      )}

      {/* Eliminar no es saldar. Saldar cierra la deuda y la manda a pagadas,
          que es donde queda constancia de que se pagó; eliminar la borra del
          mapa, con su programación, y no deja rastro en ninguna de las dos
          listas. Es para la deuda que nunca debió apuntarse, no para la que se
          terminó de pagar. Los movimientos ya registrados no se tocan: ese
          dinero salió de la cuenta de verdad. */}
      {borrando && (
        <Confirm
          title="Eliminar deuda"
          confirmLabel="Eliminar"
          destructive
          message={
            <>
              Se borran «{borrando.title}» y su movimiento programado, así que dejan de
              generarse cuotas. No aparecerá entre las pagadas.
              {borrando.paidCount > 0 &&
                ' Los pagos ya apuntados se conservan como movimientos normales.'}
            </>
          }
          onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            await run(() => api.scheduled.remove(borrando.scheduledId), 'Deuda eliminada')
            setBorrando(null)
          }}
        />
      )}

      {adjusting && (
        <AdjustModal debt={adjusting} onClose={() => setAdjusting(null)} />
      )}

      {creando && (
        <ScheduleModal
          schedule={null}
          siblings={[]}
          soloGasto
          deudaPorDefecto
          titulo="Nueva deuda"
          onClose={() => setCreando(false)}
          onSave={(input) => run(() => api.scheduled.save(input), 'Deuda creada')}
        />
      )}
    </>
  )
}

function DebtCard({
  debt,
  currency,
  onAdjust,
  marcada,
  onMenu
}: {
  debt: DebtProgress
  currency: string
  onAdjust: () => void
  /** Su menú está abierto: se queda encendida para saber sobre cuál se pulsó. */
  marcada?: boolean
  onMenu?: (x: number, y: number) => void
}): ReactNode {
  const quienCobra = findLender(debt.lender)

  // La tarjeta entera abre el ajuste: dentro no hay ningún mando con el que
  // pelearse, que la barra de cuotas es dibujo.
  return (
    <div
      className={`tarjeta-clicable${marcada ? ' marcada' : ''}`}
      role="button"
      onClick={onAdjust}
      onContextMenu={(event) => {
        if (!onMenu) return
        event.preventDefault()
        onMenu(event.clientX, event.clientY)
      }}
    >
      {/* Sin icono delante: en una pantalla que solo tiene deudas, un distintivo
          de deuda repetido en cada ficha no distingue nada. */}
      <div className="row">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row tight">
            <span style={{ fontWeight: 570 }} className="truncate">
              {debt.title}
            </span>
            {quienCobra && (
              <span className="pill">
                <img src={quienCobra.logo} alt="" />
                {quienCobra.name}
              </span>
            )}
          </div>
          <div className="small muted truncate">
            {/* Dos piezas y ya: cuánto es una cuota y cuándo se acaba. La cuenta de
                la que sale no cambia nada de lo que se viene a mirar aquí. */}
            {formatMoney(debt.installment, currency)}/{debt.cadence}
            {debt.endDate ? ` · Hasta el ${formatDate(debt.endDate)}` : ' · Sin fecha de fin'}
          </div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: 'right' }}>
          <div className="amount" style={{ fontSize: 16 }}>
            {formatMoney(debt.paid, currency)}
            {debt.total != null && ` de ${formatMoney(debt.total, currency)}`}
          </div>
          <div className="small muted">
            {debt.left != null ? `Faltan ${formatMoney(debt.left, currency)}` : 'Sin total conocido'}
          </div>
        </div>
      </div>

      {/* Sin fecha de fin no hay barra: no se puede medir contra un total que no
          existe. Lo pagado se sigue diciendo, que es lo que se sabe. */}
      {debt.leftCount != null ? (
        <BarraCuotas pagadas={debt.paidCount} restantes={debt.leftCount} />
      ) : (
        debt.percent != null && (
          <div style={{ marginTop: 10 }}>
            <ProgressBar percent={debt.percent} color={'var(--positive)'} />
          </div>
        )
      )}

      <div className="small subtle" style={{ marginTop: 5 }}>
        {/* «2 cuotas pagadas · quedan 24 cuotas» son dos formas de contar lo mismo
            y ocupan media línea: 2/26 lo dice de un vistazo, como cualquier
            contador. Cuando no se sabe cuántas quedan, no hay quebrado que valga. */}
        {debt.leftCount != null
          ? `${debt.paidCount}/${debt.paidCount + debt.leftCount} cuotas`
          : debt.paidCount === 0
            ? 'Todavía no ha entrado ninguna cuota'
            : `${debt.paidCount} ${debt.paidCount === 1 ? 'cuota pagada' : 'cuotas pagadas'}`}
        {debt.daysLeft != null && debt.leftCount !== 0 ? ` · ${mayuscula(espera(debt.daysLeft))}` : ''}
      </div>
    </div>
  )
}

/**
 * Lo que de una deuda no se puede deducir de los movimientos.
 *
 * Lo pagado se cuenta de lo que hay apuntado, y eso solo alcanza hasta donde
 * llegan tus registros: una deuda que se paga desde hace años y un CSV que
 * empieza en abril dan un porcentaje ridículo. Se pregunta en cuotas porque es
 * como se sabe —«llevo treinta y seis»—, y no en euros, que hay que echarlos.
 *
 * La última cuota es aparte porque casi nunca es entera, y es justo lo que hacía
 * que los totales no cuadraran. La cuota de cada mes no está aquí: vive en la
 * programación, que es de donde salen los recibos, y se cambia ahí.
 */
function AdjustModal({ debt, onClose }: { debt: DebtProgress; onClose: () => void }): ReactNode {
  const { run } = useStore()
  const [paidCount, setPaidCount] = useState(debt.paidCount)
  const [lastAmount, setLastAmount] = useState(debt.lastInstallment ?? 0)
  const [total, setTotal] = useState(debt.fixedTotal ?? 0)


  return (
    <Modal
      title={`Ajustar ${debt.title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              // Ajustar no devuelve nada, y `run` solo avisa de que ha ido mal
              // volviendo null: comparar con undefined dejaba el diálogo abierto
              // siempre. Refrescar tampoco hace falta, que `run` ya lo hace.
              const ajustada = await run(
                () =>
                  api.scheduled.adjustDebt(debt.scheduledId, { paidCount, lastAmount, total }),
                'Deuda ajustada'
              )
              if (ajustada !== null) onClose()
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      {/*
        Cada cajón del ancho de lo que va a llevar dentro, no del hueco que tiene.
        Las tres cifras de aquí son cortas —dos dígitos las cuotas, tres o cuatro
        los importes— y a todo lo ancho quedaban tres cajas enormes con un número
        pequeño perdido en el canto.
        Van holgados por encima de lo que se espera: el tope del campo de cuotas
        es 99, pero en los importes cabe un dígito más del que nadie va a
        escribir, que acotar de menos sería recortar el número de otro.
        Los tres en fila. Son tres cifras cortas que se leen juntas —cuántas
        llevas, cuánto la última, cuánto en total— y una debajo de otra ocupaban
        tres renglones para no decir más de lo que dicen en uno.
        Las ayudas van escuetas porque a un tercio de ancho una frase larga se
        parte en tres líneas y descuadra la fila.
      */}
      <div className="grid cols-3">
        <Field label="Cuotas pagadas" hint="Las que ya has pagado.">
          {/* Noventa y nueve cuotas son más de ocho años pagando: de sobra. */}
          <NumberInput value={paidCount} onChange={setPaidCount} min={0} max={99} />
        </Field>

        {/* Compactos, como el aviso de saldo de Cuentas: aquí no hay una cifra
            que presida el formulario. Son dos correcciones que casi siempre se
            dejan en cero, y a veintiséis píxeles se llevaban toda la atención. */}
        <Field
          label="Última cuota"
          hint={`Si no es de ${formatMoney(debt.installment, debt.currency)}.`}
        >
          <AmountInput value={lastAmount} currency={debt.currency} onChange={setLastAmount} compact />
        </Field>

        <Field label="Total de la deuda" hint="Solo con intereses o entrada.">
          <AmountInput value={total} currency={debt.currency} onChange={setTotal} compact />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * La barra de una deuda, cuota a cuota.
 *
 * Una barra continua dice un porcentaje, y de una deuda no se piensa en
 * porcentajes: se piensa en cuántas van y cuántas quedan. Partida en tramos,
 * cada uno es una cuota y se cuentan de un vistazo.
 *
 * En verde, que es lo pagado: lo que sube es lo bueno. Con muchas cuotas los
 * tramos se estrechan hasta que dejan de leerse, así que a partir de sesenta se
 * vuelve a una barra de una pieza.
 */
function BarraCuotas({ pagadas, restantes }: { pagadas: number; restantes: number }): ReactNode {
  const total = pagadas + restantes
  if (total === 0) return null

  if (total > 60) {
    return (
      <div style={{ marginTop: 10 }}>
        <ProgressBar percent={(pagadas / total) * 100} color="var(--positive)" />
      </div>
    )
  }

  return (
    <div
      className="cuotas"
      role="img"
      aria-label={`${pagadas} de ${total} cuotas pagadas`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < pagadas ? 'cuota pagada' : 'cuota'} />
      ))}
    </div>
  )
}

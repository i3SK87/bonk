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
import { Icon } from '../components/Icon'
import { AccionCabecera } from '../components/ui'
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

/** «faltan 8 meses», «faltan 12 días»: en la unidad en que se piensa la espera. */
function espera(days: number): string {
  if (days <= 0) return 'ya vencida'
  if (days < 45) return `faltan ${days} ${days === 1 ? 'día' : 'días'}`
  const meses = Math.round(days / 30)
  if (meses < 18) return `faltan ${meses} meses`
  const años = Math.round((meses / 12) * 10) / 10
  return `falta${años === 1 ? '' : 'n'} ${String(años).replace('.', ',')} años`
}

export function DebtsView(): ReactNode {
  const { settings, categories, revision, fail, run } = useStore()
  const [debts, setDebts] = useState<DebtProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [adjusting, setAdjusting] = useState<DebtProgress | null>(null)
  const [creando, setCreando] = useState(false)

  // Una deuda es una programación con categoría de deuda, así que el botón abre
  // esa misma ficha con la categoría ya elegida. Sin ninguna categoría marcada
  // como deuda no hay nada que crear, y el cartel de vacío ya lo explica.
  const categoriaDeuda = categories.find((item) => item.isDebt && !item.archived)


  useEffect(() => {
    setLoading(true)
    api.scheduled
      .debts()
      .then(setDebts)
      .catch(fail('tus deudas'))
      .finally(() => setLoading(false))
  }, [revision])

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
      {categoriaDeuda && (
        <AccionCabecera>
          <button className="btn primary" onClick={() => setCreando(true)}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            Nueva deuda
          </button>
        </AccionCabecera>
      )}

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
          <div className="card-body col" style={{ gap: 20 }}>
            {abiertas.map((debt) => (
              <DebtCard
                key={debt.scheduledId}
                debt={debt}
                currency={settings.baseCurrency}
                onAdjust={() => setAdjusting(debt)}
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
              <div key={debt.scheduledId} className="list-row">
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

      {adjusting && (
        <AdjustModal debt={adjusting} onClose={() => setAdjusting(null)} />
      )}

      {creando && categoriaDeuda && (
        <ScheduleModal
          schedule={null}
          siblings={[]}
          defaultCategoryId={categoriaDeuda.id}
          soloGasto
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
  onAdjust
}: {
  debt: DebtProgress
  currency: string
  onAdjust: () => void
}): ReactNode {
  const quienCobra = findLender(debt.lender)

  return (
    <div>
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
        <button className="btn ghost icon" onClick={onAdjust} aria-label="Ajustar la deuda">
          <Icon name="edit" size={16} />
        </button>
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
      <Field
        label="Cuotas pagadas"
        hint={`BONK ve ${debt.countBySoftware} en tus movimientos. Si llevabas pagando desde antes, pon aquí cuántas van en total.`}
      >
        <NumberInput value={paidCount} onChange={setPaidCount} min={0} max={999} style={{ width: 110 }} />
      </Field>

      <Field
        label="Última cuota"
        hint={`La última casi nunca es entera. Déjala en cero si es como las demás, ${formatMoney(debt.installment, debt.currency)}.`}
      >
        <AmountInput value={lastAmount} currency={debt.currency} onChange={setLastAmount} />
      </Field>


      <Field
        label="Total de la deuda"
        hint="Lo que cuesta entera. En cero se calcula con las cuotas que quedan y la última; ponlo solo si lleva intereses o una entrada."
      >
        <AmountInput value={total} currency={debt.currency} onChange={setTotal} />
      </Field>
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

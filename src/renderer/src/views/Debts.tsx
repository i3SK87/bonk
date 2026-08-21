import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Avatar, EmptyState, Loading, ProgressBar, Modal, Field, AmountInput } from '../components/ui'
import { Icon } from '../components/Icon'
import { formatMoney } from '@shared/money'
import { formatDate } from '@shared/dates'
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
  const { settings, revision, fail } = useStore()
  const [debts, setDebts] = useState<DebtProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [adjusting, setAdjusting] = useState<DebtProgress | null>(null)

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
  const sinFecha = abiertas.filter((debt) => debt.left == null).length

  return (
    <>
      <div className="card flush">
        <div className="card-header">
          <h2>Deudas</h2>
          <span className="small muted">
            Las cuotas se registran solas desde Programados; aquí solo se miran.
          </span>
        </div>

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
            <div className="col" style={{ gap: 2, justifyContent: 'center' }}>
              <span className="small muted">
                {abiertas.length === 1 ? '1 deuda abierta' : `${abiertas.length} deudas abiertas`}
              </span>
              {sinFecha > 0 && (
                <span className="small subtle">
                  {sinFecha === 1
                    ? 'Una no tiene fecha de fin, así que no cuenta en el total.'
                    : `${sinFecha} no tienen fecha de fin, así que no cuentan en el total.`}
                </span>
              )}
            </div>
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
                    {debt.settledAt ? ` · saldada el ${formatDate(debt.settledAt)}` : ''}
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
  const color = debt.categoryColor ?? '#FF453A'

  return (
    <div>
      <div className="row">
        <Avatar icon={debt.categoryIcon ?? 'debt'} color={color} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row tight">
            <span style={{ fontWeight: 570 }} className="truncate">
              {debt.title}
            </span>
            {debt.categoryName && debt.categoryName !== debt.title && (
              <span className="pill">{debt.categoryName}</span>
            )}
          </div>
          <div className="small muted truncate">
            {formatMoney(debt.installment, currency)} cada vez · {debt.accountName}
            {debt.endDate ? ` · hasta ${formatDate(debt.endDate)}` : ' · sin fecha de fin'}
          </div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: 'right' }}>
          <div className="amount" style={{ fontSize: 16 }}>
            {formatMoney(debt.paid, currency)}{' '}
            {debt.total != null && (
              <span className="muted" style={{ fontWeight: 500 }}>
                de {formatMoney(debt.total, currency)}
              </span>
            )}
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
      {debt.percent != null && (
        <div style={{ marginTop: 10 }}>
          <ProgressBar percent={debt.percent} color={color} />
        </div>
      )}

      <div className="small subtle" style={{ marginTop: 5 }}>
        {debt.paidCount === 0
          ? 'Todavía no ha entrado ninguna cuota.'
          : `${debt.paidCount} ${debt.paidCount === 1 ? 'cuota pagada' : 'cuotas pagadas'}`}
        {debt.leftCount != null && debt.leftCount > 0
          ? ` · quedan ${debt.leftCount} ${debt.leftCount === 1 ? 'cuota' : 'cuotas'}`
          : ''}
        {debt.daysLeft != null ? ` · ${espera(debt.daysLeft)}` : ''}
        {debt.firstDate ? ` · desde ${formatDate(debt.firstDate)}` : ''}
      </div>
    </div>
  )
}

/**
 * Lo que la aplicación no puede saber de una deuda.
 *
 * La cuota vive en la programación y se corrige aquí porque es aquí donde se
 * mira la deuda. Lo pagado, en cambio, se deduce de los movimientos, y eso solo
 * alcanza hasta donde llegan tus registros: falta lo que ya llevabas pagado antes
 * y, si lo sabes, el total de verdad —que casi nunca es la cuota por las veces,
 * porque la última suele ser más corta—.
 */
function AdjustModal({ debt, onClose }: { debt: DebtProgress; onClose: () => void }): ReactNode {
  const { run, refresh } = useStore()
  const [installment, setInstallment] = useState(debt.installment)
  const [paidBefore, setPaidBefore] = useState(debt.paid - debt.paidBySoftware)
  const [total, setTotal] = useState(debt.total ?? 0)

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
              const saved = await run(
                () =>
                  api.scheduled.adjustDebt(
                    debt.scheduledId,
                    paidBefore,
                    total > 0 ? total : null,
                    installment
                  ),
                'Deuda ajustada'
              )
              if (saved !== undefined) {
                refresh()
                onClose()
              }
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <Field
        label="Cuota"
        hint="Lo que se paga cada vez. Cambiarla cambia también los recibos que están por venir, que es lo que toca si te la han subido."
      >
        <AmountInput value={installment} currency={debt.currency} onChange={setInstallment} />
      </Field>

      <Field
        label="Ya pagado antes de tus registros"
        hint={`De esta deuda, BONK ve ${formatMoney(debt.paidBySoftware, debt.currency)} en tus movimientos. Si llevabas pagando desde antes, pon aquí lo que iba pagado hasta entonces.`}
      >
        <AmountInput value={paidBefore} currency={debt.currency} onChange={setPaidBefore} />
      </Field>

      <Field
        label="Total de la deuda"
        hint="Lo que cuesta entera. Déjalo en cero y se calcula con las cuotas que quedan, que es lo mismo salvo que la última sea más corta."
      >
        <AmountInput value={total} currency={debt.currency} onChange={setTotal} />
      </Field>
    </Modal>
  )
}

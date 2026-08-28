import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from './lib/store'
import { useContador } from './lib/contador'
import { Icon } from './components/Icon'
import { Toasts, Loading, Confirm } from './components/ui'
import { TransactionForm } from './components/TransactionForm'
import { Contencion } from './components/Contencion'
import {
  Celebration,
  GoalCelebration,
  MonthlySummary,
  type LineaResumen,
  type ResumenMes
} from './components/Celebration'
import { CalculadoraModal } from './components/Calculator'
import { TransactionsView } from './views/Transactions'
import { AccountsView } from './views/Accounts'
import { CategoriesView } from './views/Categories'
import { GoalsView } from './views/Goals'
import { SchedulesView } from './views/Schedules'
import { DebtsView } from './views/Debts'
import { ReportsView } from './views/Reports'
import { SettingsView } from './views/Settings'
import { formatMoney, formatMoneyBreve, cabeEntero } from '@shared/money'
import { today, startOfMonth, endOfMonth, addMonths } from '@shared/dates'
import { useActualizacion, hayNovedad } from './lib/actualizacion'
import type { CategoryTotal, Settlement, GoalReached } from '@shared/types'
import markUrl from '../../../resources/icon.ico'

type ViewId =
  | 'transactions'
  | 'accounts'
  | 'categories'
  | 'goals'
  | 'schedules'
  | 'debts'
  | 'reports'
  | 'settings'

// De lo que se mira a diario a lo que se toca de vez en cuando: los movimientos
// y lo que viene, luego lo que se debe y lo que se guarda —una deuda tiene fecha
// y un plan espera—, y al final lo que solo se configura.
const NAV: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: 'transactions', label: 'Movimientos', icon: 'list' },
  { id: 'schedules', label: 'Programados', icon: 'calendar' },
  // El que tuvo siempre, ahora fijo: salía de la categoría marcada como deuda,
  // y esa marca ya no existe.
  { id: 'debts', label: 'Deudas', icon: 'invest' },
  { id: 'goals', label: 'Planes Ahorro', icon: 'piggy' },
  { id: 'accounts', label: 'Cuentas', icon: 'wallet' },
  { id: 'categories', label: 'Categorías', icon: 'tag' },
  { id: 'reports', label: 'Informes', icon: 'chart' }
]

/*
 * Ajustes va aparte del resto de la lista.
 *
 * Entre Informes y Ajustes se cuela la calculadora, que no es una pestaña sino
 * un cuadro: si estuviera en `NAV` habría que inventarle una vista que no
 * existe. Así cada uno se pinta por lo que es y quedan en el orden que se pide.
 */
const AJUSTES: { id: ViewId; label: string; icon: string } = {
  id: 'settings',
  label: 'Ajustes',
  icon: 'settings'
}

const TITLES: Record<ViewId, string> = {
  transactions: 'Movimientos',
  accounts: 'Cuentas',
  categories: 'Categorías',
  goals: 'Planes Ahorro',
  debts: 'Deudas',
  schedules: 'Movimientos programados',
  reports: 'Informes',
  settings: 'Ajustes'
}

const api = window.bonk

export function App(): ReactNode {
  const { ready, accounts, settings, revision, toast, refresh, run, updateSettings, focusedAccountId } =
    useStore()
  const [view, setView] = useState<ViewId>('transactions')
  const [composing, setComposing] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [reached, setReached] = useState<GoalReached[]>([])
  /** El resumen del mes que se acaba de cerrar, cuando toca enseñarlo. */
  const [resumen, setResumen] = useState<ResumenMes | null>(null)

  // Ctrl+N desde el menú nativo y desde el teclado dentro de la ventana.
  useEffect(() => {
    const offNew = window.bonk.events.on('menu:new-transaction', () => setComposing(true))
    const offBackup = window.bonk.events.on('menu:backup-done', () =>
      toast('Copia de seguridad creada', 'success')
    )
    // Las programadas que vencen se registran solas aunque la ventana lleve
    // días abierta; sin este aviso, la lista se quedaba en lo de ayer.
    const offChanged = window.bonk.events.on('data:changed', () => {
      refresh()
    })
    // Una programada que no puede entrar se quedaría intentándolo en silencio.
    const offFailed = window.bonk.events.on('scheduled:failed', (detail) =>
      toast(
        typeof detail === 'string' ? detail : 'Una programación vencida no se pudo registrar',
        'error'
      )
    )
    // Una deuda saldada se celebra; si caen varias a la vez, van en cola.
    const offSettled = window.bonk.events.on('debt:settled', (detail) => {
      if (Array.isArray(detail) && detail.length > 0) {
        setSettlements((current) => [...current, ...(detail as Settlement[])])
        refresh()
      }
    })
    // Y un plan de ahorro que llega a su meta, igual.
    const offReached = window.bonk.events.on('goal:reached', (detail) => {
      if (Array.isArray(detail) && detail.length > 0) {
        setReached((current) => [...current, ...(detail as GoalReached[])])
        refresh()
      }
    })
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setComposing(true)
      }
    }
    /*
     * Aquí no se tabula.
     *
     * BONK se lleva con el ratón, y el tabulador iba dejando el recuadro del
     * foco en botones e iconos que no se estaban usando. En captura, para
     * llegar antes que cualquier campo o diálogo.
     */
    const sinTabulador = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') event.preventDefault()
    }
    window.addEventListener('keydown', sinTabulador, true)
    window.addEventListener('keydown', onKey)
    return () => {
      offNew()
      offBackup()
      offChanged()
      offFailed()
      offSettled()
      offReached()
      window.removeEventListener('keydown', sinTabulador, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [toast, refresh])

  /*
   * El resumen del mes pasado, una vez al mes.
   *
   * No se mira si hoy es día 1: se mira si el resumen de ese mes ya se ha visto.
   * Así sale igual aunque el día 1 no llegaras a abrir la aplicación, y no sale
   * dos veces por abrirla dos veces. El sello va en los ajustes y no en memoria,
   * que si no volvería en cada arranque.
   *
   * Un mes sin un solo movimiento se da por visto sin enseñar nada: en una
   * instalación recién estrenada no hay nada que resumir, y saltaría un cuadro
   * hablando de ceros.
   */
  useEffect(() => {
    if (!ready) return

    const mes = startOfMonth(addMonths(today(), -1))
    if (settings.lastMonthlySummary === mes.slice(0, 7)) return

    const fin = endOfMonth(mes)
    const anterior = startOfMonth(addMonths(mes, -1))

    let cancelado = false
    Promise.all([
      window.bonk.transactions.totals({ from: mes, to: fin }),
      window.bonk.reports.categories(mes, fin, 'expense'),
      window.bonk.reports.categories(mes, fin, 'income'),
      window.bonk.transactions.totals({ from: anterior, to: endOfMonth(anterior) }),
      // Lo que queda por pagar es de hoy, no del mes contado: una deuda no se
      // cierra a final de mes, se cierra cuando se acaba.
      window.bonk.scheduled.debts()
    ])
      .then(([sumas, gastos, ingresos, sumasAntes, deudas]) => {
        if (cancelado) return
        if (sumas.count === 0) {
          updateSettings({ lastMonthlySummary: mes.slice(0, 7) })
          return
        }
        // Cinco de cada, de mayor a menor: más no se leen de un vistazo.
        const cinco = (lista: CategoryTotal[]): LineaResumen[] =>
          [...lista]
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)
            .map((item) => ({
              name: item.name,
              total: item.total,
              icon: item.icon,
              color: item.color
            }))

        setResumen({
          mes,
          ingresos: sumas.income,
          gastos: sumas.expense,
          balance: sumas.net,
          currency: settings.baseCurrency,
          deudaRestante: deudas.reduce((suma, deuda) => suma + Math.max(0, deuda.left ?? 0), 0),
          gastosAntes: sumasAntes.expense,
          ingresosAntes: sumasAntes.income,
          porGasto: cinco(gastos),
          porIngreso: cinco(ingresos)
        })
      })
      .catch(() => {
        // Un resumen que no se puede montar no merece un aviso de error: se
        // vuelve a intentar al abrir la próxima vez.
      })
    return () => {
      cancelado = true
    }
  }, [ready, settings.lastMonthlySummary, settings.baseCurrency, updateSettings])

  const netWorth = accounts
    .filter((account) => !account.excludeFromTotal)
    .reduce((sum, account) => sum + account.balanceInBase, 0)
  /*
   * Aquí el conteo hace algo más que enseñar la dirección: esta cifra vive en
   * un rincón y se mira de refilón, así que verla moverse es lo que avisa de
   * que el gasto que acabas de apuntar ha llegado hasta el total.
   */
  const contado = useContador(netWorth, revision)
  /** Si el patrimonio cabe entero donde va, o hay que abreviarlo. */
  const entero = cabeEntero(netWorth, settings.baseCurrency)
  const actualizacion = useActualizacion()
  /*
   * En cuanto acaba de bajarse, se pregunta por el reinicio sin esperar a que
   * se vuelva a pulsar: el aviso ya se pulsó una vez y esto es el final de esa
   * misma acción, no una nueva. Si se dice que no, el aviso se queda puesto
   * como «Reiniciar para actualizar» y ahí sigue para cuando venga bien.
   */
  const yaPreguntado = useRef(false)
  useEffect(() => {
    if (actualizacion.fase !== 'lista' || yaPreguntado.current) return
    yaPreguntado.current = true
    setReiniciando(true)
  }, [actualizacion.fase])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="mark" src={markUrl} alt="" width={28} height={28} />
          BONK
        </div>

        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item${view === item.id ? ' active' : ''}`}
            onClick={() => setView(item.id)}
            // Plegada a iconos, es lo único que dice cuál es cuál.
            title={item.label}
          >
            <Icon name={item.icon} size={17} />
            {item.label}
          </button>
        ))}

        {/* No lleva estado activo: abre un cuadro y la pestaña de debajo sigue
            siendo la que estaba. Encenderla diría que has cambiado de pantalla. */}
        <button
          className="nav-item"
          onClick={() => setCalculando(true)}
          // Como las demás: plegada a iconos, el título es lo único que dice
          // cuál es cuál.
          title="Calculadora"
        >
          <Icon name="calculator" size={17} />
          Calculadora
        </button>

        <button
          className={`nav-item${view === AJUSTES.id ? ' active' : ''}`}
          onClick={() => setView(AJUSTES.id)}
          title={AJUSTES.label}
        >
          <Icon name={AJUSTES.icon} size={17} />
          {AJUSTES.label}
        </button>

        {/*
          * Debajo de Ajustes, que es donde está el detalle.
          *
          * Aquí y no en un aviso flotante porque no es urgente: nadie tiene que
          * dejar lo que está haciendo para actualizar. Pero tampoco escondido
          * dentro de Ajustes, que es justo donde no se entra. En la barra
          * lateral está siempre a la vista sin taparle nada a nadie.
          */}
        {hayNovedad(actualizacion) && (
          <button
            className={`aviso-version${actualizacion.fase === 'lista' ? ' lista' : ''}`}
            disabled={actualizacion.fase === 'descargando'}
            onClick={() => {
              if (actualizacion.fase === 'disponible') void run(() => api.updates.descargar())
              else if (actualizacion.fase === 'lista') setReiniciando(true)
            }}
            title={
              actualizacion.fase === 'disponible'
                ? `Está la versión ${actualizacion.version}. Pulsa para traértela.`
                : actualizacion.fase === 'descargando'
                  ? `Descargando la versión ${actualizacion.version}: ${actualizacion.porcentaje} %`
                  : `La versión ${actualizacion.version} ya está descargada. Se instala al reiniciar.`
            }
          >
            <Icon name={actualizacion.fase === 'lista' ? 'refresh' : 'download'} size={14} />
            <span className="truncate">
              {actualizacion.fase === 'disponible'
                ? 'Actualización disponible'
                : actualizacion.fase === 'descargando'
                  ? `Descargando… ${actualizacion.porcentaje} %`
                  : 'Reiniciar para actualizar'}
            </span>
            {/* Lo que lleva bajado, en el propio fondo del aviso: una barra
                aparte para un número que nadie mira sería otro trasto más. */}
            {actualizacion.fase === 'descargando' && (
              <span className="llenado" style={{ width: `${actualizacion.porcentaje}%` }} />
            )}
          </button>
        )}

        {/* Donde la cifra ya está en pantalla, aquí sobra: en Movimientos preside
            la lista —y allí puede estar en modo previsión, así que repetirla en su
            versión real dejaba dos cifras distintas a la vez—, y en Cuentas cierra
            la tarjeta. */}
        {view !== 'transactions' && view !== 'accounts' && (
          <div className="sidebar-footer">
            <div className="sidebar-networth">
              Patrimonio total
              {/* Abreviada cuando la cifra entera no cabe en la barra, y con el
                  valor exacto a un palmo del ratón. Lo decide el patrimonio de
                  verdad y no el del conteo: si lo decidiera la cifra que corre,
                  cruzar los cien mil la cambiaría de forma a media cuenta. */}
              <strong
                className={netWorth > 0 ? 'positive' : netWorth < 0 ? 'negative' : ''}
                title={entero ? undefined : formatMoney(netWorth, settings.baseCurrency)}
              >
                {entero
                  ? formatMoney(contado, settings.baseCurrency)
                  : formatMoneyBreve(contado, settings.baseCurrency)}
              </strong>
            </div>
          </div>
        )}
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{TITLES[view]}</h1>
          {/* Aquí aterrizan las acciones de cada pantalla. Cada una sigue siendo
              dueña de su botón y de su formulario; lo único que se comparte es el
              sitio, que es esta esquina.

              Va antes del botón de abajo y no después, que la acción principal
              es la última de la fila: en Movimientos, importar un extracto se
              lee como el paso previo a apuntar algo, no como lo que se viene a
              hacer. */}
          <div id="acciones-cabecera" className="row tight" />

          {/* Solo donde se listan: en Ahorro o en Categorías no pinta nada.
              Ctrl+N sigue funcionando desde cualquier pestaña. */}
          {view === 'transactions' && (
            <button className="btn primary" onClick={() => setComposing(true)}>
              Nuevo movimiento
            </button>
          )}
        </header>

        {!ready ? (
          <Loading />
        ) : (
          <div className="content">
            {/* Cada pestaña, dentro de su propio cortafuegos. La clave es la
                pestaña: al cambiar de una rota a otra, la contención se
                reinicia sola y la nueva entra limpia. */}
            <Contencion key={view}>
              {view === 'transactions' && <TransactionsView onNavigate={(next) => setView(next as ViewId)} />}
              {view === 'accounts' && <AccountsView />}
              {view === 'categories' && <CategoriesView />}
              {view === 'goals' && <GoalsView />}
              {view === 'debts' && <DebtsView />}
              {view === 'schedules' && <SchedulesView />}
              {view === 'reports' && <ReportsView />}
              {view === 'settings' && <SettingsView />}
            </Contencion>
          </div>
        )}
      </main>

      {ready && resumen && (
        <MonthlySummary
          resumen={resumen}
          onClose={() => {
            // El sello se pone al cerrarlo y no al enseñarlo: si la aplicación
            // se va abajo con el resumen abierto, el mes que viene vuelve.
            updateSettings({ lastMonthlySummary: resumen.mes.slice(0, 7) })
            setResumen(null)
          }}
        />
      )}

      {calculando && (
        <CalculadoraModal
          currency={settings.baseCurrency}
          onClose={() => setCalculando(false)}
        />
      )}

      {/* Se pregunta antes porque esto cierra la aplicación en el acto, y el
          aviso vive a un dedo de Ajustes: un clic de más no debería llevarse por
          delante el movimiento que estabas escribiendo. */}
      {reiniciando && (
        <Confirm
          title="Reiniciar para actualizar"
          message={`BONK se cerrará y volverá a abrirse en la versión ${actualizacion.version}. Tus datos no se tocan.`}
          confirmLabel="Reiniciar"
          onCancel={() => setReiniciando(false)}
          onConfirm={async () => {
            const hecho = await run(() => api.updates.instalar())
            // Si devuelve false es que la descarga ya no está lista: se cierra
            // el cuadro y el aviso de la barra dirá lo que haya.
            if (!hecho) setReiniciando(false)
          }}
        />
      )}

      {ready && composing && (
        <TransactionForm
          defaultAccountId={focusedAccountId ?? undefined}
          onClose={() => setComposing(false)}
        />
      )}

      {/* La deuda manda si caen las dos a la vez: cerrar un plazo es más raro
          que llegar a una meta, y las dos van en cola de todas formas. */}
      {ready && settlements.length > 0 ? (
        <Celebration
          settlement={settlements[0]}
          onClose={() => setSettlements((current) => current.slice(1))}
        />
      ) : (
        ready &&
        reached.length > 0 && (
          <GoalCelebration
            goal={reached[0]}
            onClose={() => setReached((current) => current.slice(1))}
          />
        )
      )}
      <Toasts />
    </div>
  )
}

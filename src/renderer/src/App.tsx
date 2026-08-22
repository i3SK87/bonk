import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from './lib/store'
import { Icon } from './components/Icon'
import { Toasts, Loading } from './components/ui'
import { TransactionForm } from './components/TransactionForm'
import { Celebration, GoalCelebration } from './components/Celebration'
import { TransactionsView } from './views/Transactions'
import { AccountsView } from './views/Accounts'
import { CategoriesView } from './views/Categories'
import { GoalsView } from './views/Goals'
import { SchedulesView } from './views/Schedules'
import { DebtsView } from './views/Debts'
import { ReportsView } from './views/Reports'
import { SettingsView } from './views/Settings'
import { formatMoney } from '@shared/money'
import type { Settlement, GoalReached } from '@shared/types'
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
  { id: 'debts', label: 'Deudas', icon: 'debt' }, // lo pisa el de la categoría de deuda
  { id: 'goals', label: 'Planes Ahorro', icon: 'target' },
  { id: 'accounts', label: 'Cuentas', icon: 'wallet' },
  { id: 'categories', label: 'Categorías', icon: 'tag' },
  { id: 'reports', label: 'Informes', icon: 'chart' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' }
]

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

export function App(): ReactNode {
  const { ready, accounts, categories, settings, toast, refresh, focusedAccountId } = useStore()
  const [view, setView] = useState<ViewId>('transactions')
  const [composing, setComposing] = useState(false)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [reached, setReached] = useState<GoalReached[]>([])

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

  const netWorth = accounts
    .filter((account) => !account.excludeFromTotal)
    .reduce((sum, account) => sum + account.balanceInBase, 0)

  const iconoDeuda = categories.find((category) => category.isDebt)?.icon ?? 'debt'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="mark" src={markUrl} alt="" width={28} height={28} />
          BONK
        </div>

        {NAV.map((item) => (
          /* La pestaña de Deudas lleva el icono de tu categoría de deuda: es el que
             tiene delante en cada ficha, y verlo distinto en la barra las hacía
             parecer dos sitios diferentes. */
          <button
            key={item.id}
            className={`nav-item${view === item.id ? ' active' : ''}`}
            onClick={() => setView(item.id)}
            // Plegada a iconos, es lo único que dice cuál es cuál.
            title={item.label}
          >
            <Icon name={item.id === 'debts' ? iconoDeuda : item.icon} size={17} />
            {item.label}
          </button>
        ))}

        {/* Donde la cifra ya está en pantalla, aquí sobra: en Movimientos preside
            la lista —y allí puede estar en modo previsión, así que repetirla en su
            versión real dejaba dos cifras distintas a la vez—, y en Cuentas cierra
            la tarjeta. */}
        {view !== 'transactions' && view !== 'accounts' && (
          <div className="sidebar-footer">
            <div className="sidebar-networth">
              Patrimonio total
              <strong className={netWorth > 0 ? 'positive' : netWorth < 0 ? 'negative' : ''}>
                {formatMoney(netWorth, settings.baseCurrency)}
              </strong>
            </div>
          </div>
        )}
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{TITLES[view]}</h1>
          {/* Solo donde se listan: en Ahorro o en Categorías no pinta nada.
              Ctrl+N sigue funcionando desde cualquier pestaña. */}
          {view === 'transactions' && (
            <button className="btn primary" onClick={() => setComposing(true)}>
              <Icon name="plus" size={16} strokeWidth={2.2} />
              Nuevo movimiento
            </button>
          )}

          {/* Y aquí aterrizan las de las demás pantallas. Cada una sigue siendo
              dueña de su botón y de su formulario; lo único que se comparte es el
              sitio, que es esta esquina. */}
          <div id="acciones-cabecera" className="row tight" />
        </header>

        {!ready ? (
          <Loading />
        ) : (
          <div className="content">
            {view === 'transactions' && <TransactionsView onNavigate={(next) => setView(next as ViewId)} />}
            {view === 'accounts' && <AccountsView />}
            {view === 'categories' && <CategoriesView />}
            {view === 'goals' && <GoalsView />}
            {view === 'debts' && <DebtsView />}
            {view === 'schedules' && <SchedulesView />}
            {view === 'reports' && <ReportsView />}
            {view === 'settings' && <SettingsView />}
          </div>
        )}
      </main>

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

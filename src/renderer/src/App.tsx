import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from './lib/store'
import { Icon } from './components/Icon'
import { Toasts, Loading } from './components/ui'
import { TransactionForm } from './components/TransactionForm'
import { Celebration } from './components/Celebration'
import { TransactionsView } from './views/Transactions'
import { AccountsView } from './views/Accounts'
import { CategoriesView } from './views/Categories'
import { GoalsView } from './views/Goals'
import { SchedulesView } from './views/Schedules'
import { ReportsView } from './views/Reports'
import { SettingsView } from './views/Settings'
import { formatMoney } from '@shared/money'
import type { Settlement } from '@shared/types'
import markUrl from '../../../resources/icon.ico'

type ViewId =
  | 'transactions'
  | 'accounts'
  | 'categories'
  | 'goals'
  | 'schedules'
  | 'reports'
  | 'settings'

const NAV: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: 'transactions', label: 'Movimientos', icon: 'list' },
  { id: 'accounts', label: 'Cuentas', icon: 'wallet' },
  { id: 'categories', label: 'Categorías', icon: 'tag' },
  { id: 'goals', label: 'Ahorro', icon: 'target' },
  { id: 'schedules', label: 'Programados', icon: 'repeat' },
  { id: 'reports', label: 'Informes', icon: 'chart' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' }
]

const TITLES: Record<ViewId, string> = {
  transactions: 'Movimientos',
  accounts: 'Cuentas',
  categories: 'Categorías',
  goals: 'Ahorro',
  schedules: 'Movimientos programados',
  reports: 'Informes',
  settings: 'Ajustes'
}

export function App(): ReactNode {
  const { ready, accounts, settings, toast, refresh } = useStore()
  const [view, setView] = useState<ViewId>('transactions')
  const [composing, setComposing] = useState(false)
  const [settlements, setSettlements] = useState<Settlement[]>([])

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
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setComposing(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offNew()
      offBackup()
      offChanged()
      offFailed()
      offSettled()
      window.removeEventListener('keydown', onKey)
    }
  }, [toast, refresh])

  const netWorth = accounts
    .filter((account) => !account.excludeFromTotal)
    .reduce((sum, account) => sum + account.balanceInBase, 0)

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
          >
            <Icon name={item.icon} size={17} />
            {item.label}
          </button>
        ))}

        {/* En Movimientos el patrimonio ya preside la lista, y allí puede estar
            en modo previsión: repetirlo aquí en su versión real dejaba dos
            cifras distintas a la vez en la misma pantalla. */}
        {view !== 'transactions' && (
          <div className="sidebar-footer">
            <div className="sidebar-networth">
              Patrimonio
              <strong>{formatMoney(netWorth, settings.baseCurrency)}</strong>
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
        </header>

        {!ready ? (
          <Loading />
        ) : (
          <div className="content">
            {view === 'transactions' && <TransactionsView onNavigate={(next) => setView(next as ViewId)} />}
            {view === 'accounts' && <AccountsView />}
            {view === 'categories' && <CategoriesView />}
            {view === 'goals' && <GoalsView />}
            {view === 'schedules' && <SchedulesView />}
            {view === 'reports' && <ReportsView />}
            {view === 'settings' && <SettingsView />}
          </div>
        )}
      </main>

      {ready && composing && <TransactionForm onClose={() => setComposing(false)} />}

      {ready && settlements.length > 0 && (
        <Celebration
          settlement={settlements[0]}
          onClose={() => setSettlements((current) => current.slice(1))}
        />
      )}
      <Toasts />
    </div>
  )
}

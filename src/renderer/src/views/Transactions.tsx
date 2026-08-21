import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { nestByParent } from '../lib/nesting'
import { Icon } from '../components/Icon'
import { Avatar, EmptyState, Loading, Confirm } from '../components/ui'
import { TransactionForm } from '../components/TransactionForm'
import { CalculatorButton } from '../components/Calculator'
import { formatMoney, parseAmount } from '@shared/money'
import { byName } from '@shared/text'
import { today, startOfMonth, endOfMonth, addMonths, startOfYear, formatDate, formatDayHeading } from '@shared/dates'
import type { ProjectedTransaction, TransactionFilter, TransactionView, TxType } from '@shared/types'

const api = window.bonk

type RangeId = 'month' | 'prev' | 'quarter' | 'year' | 'all' | 'custom'

const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: 'month', label: 'Este mes' },
  { id: 'prev', label: 'Mes pasado' },
  { id: 'quarter', label: 'Últimos 3 meses' },
  { id: 'year', label: 'Este año' },
  { id: 'all', label: 'Todo' }
]

function rangeFor(id: RangeId): { from?: string; to?: string } {
  const now = today()
  switch (id) {
    case 'month':
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'prev': {
      const previous = addMonths(now, -1)
      return { from: startOfMonth(previous), to: endOfMonth(previous) }
    }
    case 'quarter':
      return { from: startOfMonth(addMonths(now, -2)), to: endOfMonth(now) }
    case 'year':
      return { from: startOfYear(now), to: endOfMonth(now) }
    default:
      return {}
  }
}

/**
 * Coloca cada devolución justo debajo del gasto al que apunta. Solo dentro del
 * mismo día: mover una fila a otra fecha descuadraría el total de la jornada,
 * así que cuando el gasto es de otro día el enlace se marca en el canto y nada más.
 */
function nestRefunds(list: TransactionView[]): Array<{ row: TransactionView; nested: boolean; last: boolean }> {
  return nestByParent(
    list,
    (row) => row.id,
    (row) => (row.type === 'refund' ? row.refundForId : null)
  )
}

/**
 * La misma búsqueda que hace la consulta, pero sobre lo que aún no existe.
 * Mira donde mira aquella: quién cobra, la nota, la categoría y la cuenta.
 */
function matchesSearch(row: ProjectedTransaction, needle: string): boolean {
  const text = needle.trim().toLowerCase()
  if (!text) return true
  const found = [
    row.name,
    row.payee,
    row.note,
    row.categoryName,
    row.accountName,
    row.toAccountName
  ].some((field) => field?.toLowerCase().includes(text))
  if (found) return true
  // Y por el importe, igual que la consulta.
  const typed = parseAmount(text, row.accountCurrency, { grouping: false })
  return typed != null && Math.abs(typed) === row.amount
}

/** Lo mismo con las previsiones: la devolución programada cuelga de su gasto. */
function nestProjected(
  list: ProjectedTransaction[]
): Array<{ row: ProjectedTransaction; nested: boolean; last: boolean }> {
  return nestByParent(
    list,
    (row) => row.scheduledId,
    (row) => (row.type === 'refund' ? row.refundForScheduledId : null)
  )
}

export function TransactionsView({ onNavigate }: { onNavigate?: (view: string) => void }): ReactNode {
  const { accounts, categories, settings, revision, run, toast, updateSettings, fail } = useStore()

  const [range, setRange] = useState<RangeId>('month')
  const [customFrom, setCustomFrom] = useState(startOfMonth(today()))
  const [customTo, setCustomTo] = useState(endOfMonth(today()))
  const [search, setSearch] = useState('')
  /** Lo que se teclea se muestra al momento; la consulta espera a que pares. */
  const [settledSearch, setSettledSearch] = useState('')
  const [types, setTypes] = useState<TxType[]>([])
  /**
   * La cuenta principal viene elegida: es la que se mira al abrir, y con ella
   * la cifra grande dice lo que hay ahí y no el total repartido entre huchas.
   * Se quita pulsándola, y entonces vuelve el patrimonio de todas.
   */
  const [accountIds, setAccountIds] = useState<number[]>(
    settings.defaultAccountId ? [settings.defaultAccountId] : []
  )
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  /** «Sin categoría» no es una categoría: es la falta de ella, y se filtra aparte. */
  const [uncategorized, setUncategorized] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const [rows, setRows] = useState<TransactionView[]>([])
  const [projected, setProjected] = useState<ProjectedTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(200)
  const [loading, setLoading] = useState(true)
  const [selection, setSelection] = useState<number[]>([])
  const [editing, setEditing] = useState<TransactionView | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setSettledSearch(search), 250)
    return () => window.clearTimeout(id)
  }, [search])

  const filter = useMemo<TransactionFilter>(() => {
    const dates = range === 'custom' ? { from: customFrom, to: customTo } : rangeFor(range)
    return {
      ...dates,
      search: settledSearch.trim() || undefined,
      types: types.length ? types : undefined,
      accountIds: accountIds.length ? accountIds : undefined,
      categoryIds: categoryIds.length ? categoryIds : undefined,
      uncategorized: uncategorized || undefined,
      limit
    }
  }, [range, customFrom, customTo, settledSearch, types, accountIds, categoryIds, uncategorized, limit])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.transactions.list(filter), api.transactions.count(filter)])
      .then(([list, count]) => {
        if (cancelled) return
        setRows(list)
        setTotal(count)
      })
      .catch(fail('los movimientos'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filter, revision])

  /**
   * Las programadas solo se proyectan hacia delante y cuando no hay filtros que
   * no sepamos aplicarles: filtrar por etiqueta en algo que aún no existe daría
   * una lista incoherente. La búsqueda sí se les aplica aquí mismo, que si se
   * está mirando lo que viene, se busca también en ello.
   */
  const canProject =
    settings.showScheduledInList &&
    categoryIds.length === 0 &&
    !uncategorized &&
    (!filter.to || filter.to >= today())

  useEffect(() => {
    if (!canProject) {
      setProjected([])
      return
    }
    let cancelled = false
    const from = filter.from && filter.from > today() ? filter.from : today()
    // Con un rango abierto ("Todo") se mira solo un trimestre hacia delante:
    // un año de repeticiones enterraría los movimientos de verdad.
    const to = filter.to ?? addMonths(today(), 3)
    api.scheduled
      .project(from, to)
      .then((list) => {
        if (cancelled) return
        setProjected(
          list.filter(
            (item) =>
              (types.length === 0 || types.includes(item.type)) &&
              // La cuenta se filtra aquí y no en la consulta: un traspaso también
              // cuenta para la cuenta que lo recibe.
              (accountIds.length === 0 ||
                accountIds.includes(item.accountId) ||
                (item.toAccountId != null && accountIds.includes(item.toAccountId))) &&
              matchesSearch(item, settledSearch)
          )
        )
      })
      .catch(fail('las programadas previstas'))
    return () => {
      cancelled = true
    }
  }, [canProject, filter.from, filter.to, types, accountIds, settledSearch, revision])

  // Agrupación por día, con el saldo del día para leer de un vistazo cómo fue la
  // jornada. Las proyecciones se cuelgan del mismo día pero no suman en el total.
  const groups = useMemo(() => {
    const map = new Map<string, { real: TransactionView[]; upcoming: ProjectedTransaction[] }>()
    const bucket = (date: string): { real: TransactionView[]; upcoming: ProjectedTransaction[] } => {
      const found = map.get(date) ?? { real: [], upcoming: [] }
      map.set(date, found)
      return found
    }

    for (const row of rows) bucket(row.date).real.push(row)
    for (const item of projected) bucket(item.date).upcoming.push(item)

    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [rows, projected])

  /**
   * Los totales suman también lo que está por venir mientras las programadas se
   * estén viendo: es una previsión, y al apagarlas las cifras vuelven a contar
   * solo lo que ha pasado de verdad.
   */
  const totals = useMemo(() => {
    let income = 0
    let expense = 0

    const add = (type: TxType, amountInBase: number): void => {
      if (type === 'income') income += amountInBase
      else if (type === 'expense') expense += Math.abs(amountInBase)
      // Lo reembolsado deja de ser gasto, no pasa a ser ingreso.
      else if (type === 'refund') expense -= amountInBase
    }

    for (const row of rows) add(row.type, row.amountInBase)
    for (const item of projected) add(item.type, item.amountInBase)

    return { income, expense, net: income - expense }
  }, [rows, projected])

  /** Saldo que quedaría en cada cuenta si se cumple todo lo programado del rango. */
  const projectedDeltas = useMemo(() => {
    const deltas = new Map<number, number>()
    for (const item of projected) {
      const salida = item.type === 'income' || item.type === 'refund' ? item.amount : -item.amount
      deltas.set(item.accountId, (deltas.get(item.accountId) ?? 0) + salida)
      if (item.type === 'transfer' && item.toAccountId) {
        const entrada = item.amountTo ?? item.amount
        deltas.set(item.toAccountId, (deltas.get(item.toAccountId) ?? 0) + entrada)
      }
    }
    return deltas
  }, [projected])

  /**
   * Un gasto y las devoluciones que le apuntan forman una familia, identificada
   * por el id del gasto. Se marca en la lista para que se vea de un vistazo que
   * ese +25,50 € va contra ese −33,99 € y no es un ingreso suelto.
   */
  const families = useMemo(() => {
    const byRow = new Map<number, number>()
    const parents = new Map<number, TransactionView>()
    for (const row of rows) {
      if (row.type === 'refund' && row.refundForId) byRow.set(row.id, row.refundForId)
      else if (row.type === 'expense' && row.refundedTotal > 0) {
        byRow.set(row.id, row.id)
        parents.set(row.id, row)
      }
    }
    return { byRow, parents }
  }, [rows])

  const [hoveredFamily, setHoveredFamily] = useState<number | null>(null)

  /**
   * Las pastillas del filtro de categorías: una por nombre, no una por categoría.
   *
   * Un mismo nombre puede existir dos veces, una de gasto y otra de ingreso
   * —«Ajuste de saldo» es el caso típico—, y en el panel salían dos pastillas
   * idénticas sin nada que las distinguiera. Se juntan en una que selecciona las
   * dos categorías, y de cuál se trata lo decide el filtro de Tipo, que está justo
   * encima.
   *
   * Y en orden alfabético: aquí no hay nada que separe los ingresos de los gastos,
   * así que el orden por tipo que trae la lista se leería como desorden.
   */
  const categoryChips = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; ids: number[] }>()
    for (const category of categories) {
      const key = category.name.toLocaleLowerCase('es')
      const group = groups.get(key)
      if (group) group.ids.push(category.id)
      else groups.set(key, { key, name: category.name, ids: [category.id] })
    }
    return [...groups.values()].sort((a, b) => byName.compare(a.name, b.name))
  }, [categories])

  // La búsqueda no cuenta: tiene su propia aspa dentro del campo y se quita desde
  // ahí, así que «Limpiar» no debe llevársela por delante. Y se cuentan pastillas,
  // no identificadores: una que valga por dos categorías del mismo nombre es un
  // filtro, no dos.
  const activeCategories = categoryChips.filter((chip) =>
    chip.ids.some((id) => categoryIds.includes(id))
  ).length
  const activeFilters = types.length + accountIds.length + activeCategories + (uncategorized ? 1 : 0)

  /** Deja la lista sin filtros. Lo escrito en el buscador se queda. */
  function clearFilters(): void {
    setTypes([])
    setAccountIds([])
    setCategoryIds([])
    setUncategorized(false)
  }

  function toggle<T>(list: T[], value: T, setter: (next: T[]) => void): void {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  function toggleSelection(id: number, modified: boolean): void {
    if (modified) {
      setSelection((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      )
    } else {
      const row = rows.find((item) => item.id === id)
      if (row) setEditing(row)
    }
  }

  const showingProjected = projected.length > 0
  const nothingToShow = rows.length === 0 && projected.length === 0

  /**
   * La cifra grande sigue a las cuentas que estén elegidas.
   *
   * Sumadas todas, el patrimonio dice la verdad pero engaña: con mil euros
   * apartados en la hucha el total no se mueve, y la cuenta del día a día puede
   * estar en números rojos sin que la cifra lo cuente. Pulsando una cuenta se ve
   * lo suyo; pulsando las dos, las dos.
   *
   * Elegida a mano entra aunque esté apartada del total: si la pides, la quieres.
   */
  const shownAccounts = accountIds.length
    ? accounts.filter((account) => accountIds.includes(account.id))
    : accounts.filter((account) => !account.excludeFromTotal)
  const netWorth =
    shownAccounts.reduce((sum, account) => sum + account.balanceInBase, 0) +
    (showingProjected ? projected.reduce((sum, item) => sum + item.amountInBase, 0) : 0)
  const netWorthLabel = accountIds.length
    ? shownAccounts.length === 1
      ? `Saldo · ${shownAccounts[0].name}`
      : `Saldo · ${shownAccounts.length} cuentas`
    : showingProjected
      ? 'Patrimonio previsto'
      : 'Patrimonio'

  /** La cuenta del día a día cuando se está quedando sin fondo. */
  const runningLow = (() => {
    const limit = settings.lowBalanceThreshold
    if (limit <= 0 || settings.defaultAccountId == null) return null
    const account = accounts.find((item) => item.id === settings.defaultAccountId)
    return account && account.balance < limit ? account : null
  })()

  return (
    <>
      <div className="card">
        <div className="card-body networth-strip">
          <div className="networth">
            <div className="label">{netWorthLabel}</div>
            <div className={`value amount ${netWorth > 0 ? 'positive' : netWorth < 0 ? 'negative' : 'neutral'}`}>
              {formatMoney(netWorth, settings.baseCurrency)}
            </div>
          </div>

          <div className="accounts-block">
            <div className="label">Cuentas</div>
            <div className="account-chips">
              {accounts.map((account) => {
                const active = accountIds.includes(account.id)
                const balance = account.balance + (projectedDeltas.get(account.id) ?? 0)
                return (
                  <button
                    key={account.id}
                    className={`account-chip${active ? ' active' : ''}`}
                    // Pulsar una cuenta filtra la lista por ella; volver a pulsar lo deshace.
                    onClick={() => toggle(accountIds, account.id, setAccountIds)}
                    title={active ? `Quitar el filtro de ${account.name}` : `Ver solo ${account.name}`}
                  >
                    <Avatar icon={account.icon} color={account.color} size="small" />
                    <span className="chip-text">
                      <span className="chip-name truncate">{account.name}</span>
                      <span
                        className={`chip-balance amount ${balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'neutral'}`}
                      >
                        {formatMoney(balance, account.currency)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <button className="link small nowrap" onClick={() => onNavigate?.('accounts')}>
            Gestionar cuentas
          </button>
        </div>

        {/* El aviso, donde se mira el dinero. La notificación de Windows llega una
            vez; esto se queda a la vista mientras dure la cuesta abajo. */}
        {runningLow && (
          <div className={`low-balance${runningLow.balance <= 0 ? ' overdrawn' : ''}`}>
            <Icon name="alert" size={16} />
            <span>
              <b>{runningLow.name}</b>{' '}
              {runningLow.balance <= 0 ? 'se ha quedado sin fondos' : 'se está quedando sin fondos'}
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap' }}>
          <div className="row tight">
            {RANGES.map((option) => (
              <button
                key={option.id}
                className={`btn small${range === option.id ? ' primary' : ' ghost'}`}
                onClick={() => setRange(option.id)}
              >
                {option.label}
              </button>
            ))}
            <button
              className={`btn small${range === 'custom' ? ' primary' : ' ghost'}`}
              onClick={() => setRange('custom')}
            >
              Personalizado
            </button>
          </div>

          <div className="spacer" />

          <div className="row tight">
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                style={{ paddingLeft: 30, paddingRight: search ? 30 : 12, width: 210 }}
                placeholder="Buscar…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === 'Escape' && setSearch('')}
              />
              {search && (
                <button
                  className="input-clear"
                  onClick={() => setSearch('')}
                  title="Borrar la búsqueda"
                  aria-label="Borrar la búsqueda"
                >
                  <Icon name="close" size={14} strokeWidth={2.2} />
                </button>
              )}
              <span
                style={{
                  position: 'absolute',
                  left: 9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  color: 'var(--fg-subtle)',
                  pointerEvents: 'none'
                }}
              >
                <Icon name="search" size={16} />
              </span>
            </div>
            <button
              className={`btn small${showFilters || activeFilters ? ' primary' : ''}`}
              onClick={() => setShowFilters((value) => !value)}
            >
              <Icon name="filter" size={15} />
              Filtros{activeFilters ? ` (${activeFilters})` : ''}
            </button>

            {/* Fuera del panel: limpiar no debería obligar a abrirlo y cerrarlo. */}
            {activeFilters > 0 && (
              <button className="btn small ghost" onClick={clearFilters} title="Quitar todos los filtros">
                <Icon name="close" size={14} strokeWidth={2.2} />
                Limpiar
              </button>
            )}

            {/* Después de los filtros: no filtra nada, añade a la lista lo que
                todavía no ha pasado. */}
            <button
              className={`btn small${settings.showScheduledInList ? ' primary' : ''}`}
              onClick={() => updateSettings({ showScheduledInList: !settings.showScheduledInList })}
              title={
                settings.showScheduledInList
                  ? 'Ocultar lo que está por venir y volver a las cifras reales'
                  : 'Ver las programadas que quedan por llegar y su efecto en los totales'
              }
            >
              {/* Calendario y no las flechas del ciclo: lo que añade a la lista
                  es lo que está por venir, y no todo lo que viene se repite. */}
              <Icon name="calendar" size={15} />
              Programados
            </button>

            {/* La última de la fila y separada: no filtra la lista, es una
                herramienta aparte que se abre desde aquí. */}
            <div className="divider vertical" />
            <CalculatorButton currency={settings.baseCurrency} />
          </div>
        </div>

        {range === 'custom' && (
          <div className="card-body row" style={{ paddingBottom: 0 }}>
            <input
              className="input"
              type="date"
              style={{ width: 170 }}
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
            <span className="muted">hasta</span>
            <input
              className="input"
              type="date"
              style={{ width: 170 }}
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </div>
        )}

        {showFilters && (
          <div className="card-body col" style={{ gap: 14, borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>
                Tipo
              </div>
              <div className="chip-row">
                {(
                  [
                    ['expense', 'Gastos'],
                    ['income', 'Ingresos'],
                    ['transfer', 'Traspasos'],
                    ['refund', 'Reembolsos']
                  ] as Array<[TxType, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`btn small${types.includes(value) ? ' primary' : ''}`}
                    onClick={() => toggle(types, value, setTypes)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>
                Cuentas
              </div>
              <div className="chip-row">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    className={`btn small${accountIds.includes(account.id) ? ' primary' : ''}`}
                    onClick={() => toggle(accountIds, account.id, setAccountIds)}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>
                Categorías
              </div>
              <div className="chip-row">
                {categoryChips.map((chip) => {
                  const active = chip.ids.some((id) => categoryIds.includes(id))
                  return (
                    <button
                      key={chip.key}
                      className={`btn small${active ? ' primary' : ''}`}
                      onClick={() =>
                        setCategoryIds(
                          active
                            ? categoryIds.filter((id) => !chip.ids.includes(id))
                            : [...categoryIds, ...chip.ids]
                        )
                      }
                    >
                      {chip.name}
                    </button>
                  )
                })}
                {/* El que no está en la lista de Categorías porque no es una: los
                    movimientos que se quedaron sin ella —los que llegaron de una
                    importación, los de una categoría borrada— solo se veían de uno
                    en uno al pasar la lista. Los traspasos no cuentan: esos no
                    llevan categoría por definición. */}
                <button
                  className={`btn small${uncategorized ? ' primary' : ''}`}
                  onClick={() => setUncategorized((value) => !value)}
                  title="Los movimientos que se quedaron sin categoría"
                >
                  Sin categoría
                </button>
              </div>
            </div>


          </div>
        )}
      </div>

      <div className="grid cols-3">
        <div className="card stat">
          <div className="label">Ingresos {showingProjected ? `previstos` : `del periodo`}</div>
          <div className="value amount positive">{formatMoney(totals.income, settings.baseCurrency)}</div>
        </div>
        <div className="card stat">
          <div className="label">Gastos {showingProjected ? `previstos` : `del periodo`}</div>
          <div className="value amount negative">{formatMoney(totals.expense, settings.baseCurrency)}</div>
        </div>
        <div className="card stat">
          <div className="label">Balance {showingProjected ? `previsto` : ``}</div>
          <div className={`value amount ${totals.net >= 0 ? 'positive' : 'negative'}`}>
            {formatMoney(totals.net, settings.baseCurrency, { sign: true })}
          </div>
        </div>
      </div>

      {selection.length > 0 && (
        <div className="card card-body row" style={{ position: 'sticky', top: 66, zIndex: 15 }}>
          <strong>{selection.length} seleccionados</strong>
          <div className="spacer" />
          <select
            className="select"
            style={{ width: 200 }}
            value=""
            onChange={async (event) => {
              const value = event.target.value ? Number(event.target.value) : null
              await run(() => api.transactions.setCategory(selection, value), 'Categoría actualizada')
              setSelection([])
            }}
          >
            <option value="">Cambiar categoría…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button className="btn danger small" onClick={() => setConfirmBulk(true)}>
            <Icon name="trash" size={15} />
            Eliminar
          </button>
          <button className="btn ghost small" onClick={() => setSelection([])}>
            Cancelar
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-body tight">
          {/* Vacía es vacía del todo: si no hay movimientos registrados pero sí
              programadas por llegar, hay algo que enseñar. Mirando solo los
              reales, buscar «padre» con las previsiones encendidas daba «No hay
              movimientos» mientras el total de arriba ya contaba sus 200 €. */}
          {loading && nothingToShow ? (
            <Loading />
          ) : nothingToShow ? (
            <EmptyState
              icon="list"
              title="No hay movimientos"
              message="Prueba a ampliar el periodo o a quitar filtros. Con Ctrl+N creas uno nuevo."
            />
          ) : (
            // Al refiltrar se atenúa lo que ya había en vez de vaciar la lista.
            <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s ease' }}>
            {groups.map(([date, items]) => {
              // El total del día también cuenta lo previsto mientras se enseñe.
              const dayTotal =
                items.real.reduce((sum, item) => sum + item.amountInBase, 0) +
                items.upcoming.reduce((sum, item) => sum + item.amountInBase, 0)
              const onlyUpcoming = items.real.length === 0
              return (
                <div key={date}>
                  <div className="day-heading">
                    <span>{formatDayHeading(date)}</span>
                    <span
                      className={`day-total ${dayTotal >= 0 ? 'positive' : 'negative'} amount`}
                      style={onlyUpcoming ? { opacity: 0.5 } : undefined}
                    >
                      {formatMoney(dayTotal, settings.baseCurrency, { sign: true })}
                    </span>
                  </div>
                  {nestRefunds(items.real).map(({ row, nested, last }) => {
                    const family = families.byRow.get(row.id)
                    return (
                      <TransactionRow
                        key={row.id}
                        row={row}
                        selected={selection.includes(row.id)}
                        onActivate={(modified) => toggleSelection(row.id, modified)}
                        family={family}
                        linkedTo={
                          family !== undefined && family !== row.id
                            ? families.parents.get(family)
                            : undefined
                        }
                        active={family !== undefined && family === hoveredFamily}
                        onFamily={setHoveredFamily}
                        nested={nested}
                        lastChild={last}
                      />
                    )
                  })}
                  {nestProjected(items.upcoming).map(({ row: item, nested, last }) => (
                    <ProjectedRow
                      key={`${item.scheduledId}-${item.date}`}
                      row={item}
                      nested={nested}
                      lastChild={last}
                      onRegister={
                        item.isNext
                          ? async () => {
                              await run(() => api.scheduled.postNow(item.scheduledId))
                              toast('Movimiento registrado', 'success')
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              )
            })}
            </div>
          )}
        </div>

        {!loading && total > rows.length && (
          <div className="card-body center" style={{ borderTop: '1px solid var(--border)' }}>
            <button className="btn" onClick={() => setLimit((value) => value + 200)}>
              Cargar más ({rows.length} de {total})
            </button>
          </div>
        )}
      </div>

      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}

      {confirmBulk && (
        <Confirm
          title="Eliminar movimientos"
          message={`Se eliminarán ${selection.length} movimientos de forma definitiva.`}
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setConfirmBulk(false)}
          onConfirm={async () => {
            await run(() => api.transactions.removeMany(selection), 'Movimientos eliminados')
            setSelection([])
            setConfirmBulk(false)
          }}
        />
      )}
    </>
  )
}

/**
 * Repetición futura de una programada. Va apagada porque todavía no ha pasado:
 * se ve venir, pero no cuenta en ningún total hasta que se registre.
 */
function ProjectedRow({
  row,
  onRegister,
  nested,
  lastChild
}: {
  row: ProjectedTransaction
  onRegister?: () => void
  nested?: boolean
  lastChild?: boolean
}): ReactNode {
  const isTransfer = row.type === 'transfer'
  const title = isTransfer
    ? `${row.accountName} → ${row.toAccountName ?? '—'}`
    : (row.categoryName ?? row.name ?? 'Sin categoría')
  const detail = row.name || row.note

  return (
    <div
      className={`tx-row projected${nested ? ' nested' : ''}${nested && !lastChild ? ' nested-continues' : ''}`}
      title={`Programado para el ${formatDate(row.date)}`}
    >
      <Avatar
        icon={isTransfer ? 'transfer' : (row.categoryIcon ?? 'repeat')}
        color={isTransfer ? '#0A84FF' : (row.categoryColor ?? '#8E8E93')}
      />
      <div className="tx-main">
        <div className="tx-title">{title}</div>
        <div className="tx-sub">
          <span className="pill">
            <Icon name="repeat" size={11} />
            Programado
          </span>
          {detail && <span className="truncate">{detail}</span>}
          {!isTransfer && <span>· {row.accountName}</span>}
        </div>
      </div>

      {onRegister && (
        <button
          className="btn small ghost"
          title="Registrarlo ahora sin esperar a la fecha"
          onClick={(event) => {
            event.stopPropagation()
            onRegister()
          }}
        >
          <Icon name="check" size={15} />
        </button>
      )}

      <div className="tx-amount">
        {/* El traspaso va en verde como lo que entra: el dinero sigue siendo tuyo,
            solo ha cambiado de cuenta. En gris parecía apagado, casi un error. */}
        <span className={`amount ${row.type === 'expense' ? 'negative' : 'positive'}`}>
          {isTransfer
            ? formatMoney(row.amount, row.accountCurrency)
            : formatMoney(row.type === 'expense' ? -row.amount : row.amount, row.accountCurrency, {
                sign: true
              })}
        </span>
      </div>
    </div>
  )
}

export function TransactionRow({
  row,
  selected,
  onActivate,
  family,
  linkedTo,
  active,
  onFamily,
  nested,
  lastChild
}: {
  row: TransactionView
  selected?: boolean
  /** `modified` indica si venía con Ctrl o Mayús, que es lo que alterna la selección. */
  onActivate?: (modified: boolean) => void
  /** Id del gasto que encabeza la familia gasto + devoluciones, si la hay. */
  family?: number
  /** El otro movimiento del enlace, para poder nombrarlo en el título emergente. */
  linkedTo?: TransactionView
  /** La familia está señalada ahora mismo (el ratón está sobre alguno de sus miembros). */
  active?: boolean
  onFamily?: (family: number | null) => void
  /** La devolución cuelga del gasto que tiene justo encima. */
  nested?: boolean
  /** Última devolución de ese gasto: cierra la línea del árbol. */
  lastChild?: boolean
}): ReactNode {
  const isTransfer = row.type === 'transfer'

  // Manda la categoría: es lo que se busca al repasar la lista. El beneficiario
  // y la cuenta bajan al subtexto, y la nota, si la hay, se queda con ese sitio.
  const title = isTransfer
    ? `${row.accountName} → ${row.toAccountName ?? '—'}`
    : (row.categoryName ?? 'Sin categoría')
  const detail = isTransfer ? null : row.note

  const linkTitle = linkedTo
    ? `Reembolso de: ${linkedTo.categoryName ?? 'Sin categoría'}${
        linkedTo.note ? ` · ${linkedTo.note}` : ''
      } · ${formatDate(linkedTo.date)} · ${formatMoney(linkedTo.amount, linkedTo.accountCurrency)}`
    : family === row.id
      ? `Devuelto ${formatMoney(row.refundedTotal, row.accountCurrency)} de ${formatMoney(row.amount, row.accountCurrency)}`
      : undefined

  return (
    <div
      className={[
        'tx-row',
        selected ? 'selected' : '',
        // Anidada ya se ve colgando: la marca del canto sobraría.
        family !== undefined && !nested ? 'linked' : '',
        active ? 'linked-active' : '',
        nested ? 'nested' : '',
        nested && !lastChild ? 'nested-continues' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      title={linkTitle}
      onMouseEnter={() => family !== undefined && onFamily?.(family)}
      onMouseLeave={() => family !== undefined && onFamily?.(null)}
      onClick={(event) => onActivate?.(event.ctrlKey || event.metaKey || event.shiftKey)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onActivate?.(event.ctrlKey || event.metaKey || event.shiftKey)
      }}
      onFocus={() => family !== undefined && onFamily?.(family)}
      onBlur={() => family !== undefined && onFamily?.(null)}
    >
      <Avatar
        icon={isTransfer ? 'transfer' : (row.categoryIcon ?? 'tag')}
        color={isTransfer ? '#0A84FF' : (row.categoryColor ?? '#8E8E93')}
      />
      <div className="tx-main">
        <div className="tx-title">{title}</div>
        <div className="tx-sub">
          {row.type === 'refund' && <span className="pill">Reembolso</span>}
          {detail && <span className="tx-note">{detail}</span>}
          {detail && <span>·</span>}
          {/* En un traspaso el título ya nombra las dos cuentas. */}
          {!isTransfer && <span>{row.accountName}</span>}
          {row.attachmentCount > 0 && <Icon name="paperclip" size={12} />}
        </div>
      </div>
      <div className="tx-amount">
        <span className={`amount ${row.type === 'expense' ? 'negative' : 'positive'}`}>
          {isTransfer
            ? formatMoney(row.amount, row.accountCurrency)
            : formatMoney(row.type === 'expense' ? -row.amount : row.amount, row.accountCurrency, { sign: true })}
        </span>
        {row.amountTo && row.toAccountCurrency && (
          <small>→ {formatMoney(row.amountTo, row.toAccountCurrency)}</small>
        )}
        {/* En un gasto con devoluciones, lo que de verdad ha costado. */}
        {row.refundedTotal > 0 && row.type === 'expense' && (
          <small>te cuesta {formatMoney(row.amount - row.refundedTotal, row.accountCurrency)}</small>
        )}
      </div>
    </div>
  )
}

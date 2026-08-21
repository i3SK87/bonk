import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon } from '../components/Icon'
import { Segmented, Loading, EmptyState, Avatar } from '../components/ui'
import { MonthlyBars, NetLine } from '../components/charts'
import { formatMoney } from '@shared/money'
import {
  today,
  startOfMonth,
  endOfMonth,
  addMonths,
  startOfYear,
  endOfYear,
  formatDate
} from '@shared/dates'
import type { CategoryKind, CategoryTotal, MonthlyPoint } from '@shared/types'

const api = window.bonk

type PeriodId = 'month' | 'prev' | 'quarter' | 'year' | 'prevYear' | 'all'

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: 'month', label: 'Este mes' },
  { id: 'prev', label: 'Mes pasado' },
  { id: 'quarter', label: '3 meses' },
  { id: 'year', label: 'Este año' },
  { id: 'prevYear', label: 'Año pasado' },
  { id: 'all', label: 'Todo' }
]

/** «Todo» no cabe aquí: su rango no se calcula, se pregunta a los datos. */
function rangeFor(id: Exclude<PeriodId, 'all'>): { from: string; to: string } {
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
      return { from: startOfYear(now), to: endOfYear(now) }
    case 'prevYear': {
      const lastYear = `${Number(now.slice(0, 4)) - 1}-06-15`
      return { from: startOfYear(lastYear), to: endOfYear(lastYear) }
    }
  }
}

/**
 * Una categoría se puede abrir cuando tiene desglose y al menos dos entradas,
 * o una sola que no sea el cajón «Sin nota»: abrir una fila para enseñar la
 * misma cifra otra vez no aporta nada.
 */
function hasBreakdown(row: CategoryTotal): boolean {
  if (row.categoryId === null || row.notes.length === 0) return false
  return row.notes.length > 1 || row.notes[0].note !== 'Sin nota'
}

export function ReportsView(): ReactNode {
  const { settings, revision, run, toast, fail } = useStore()
  const [period, setPeriod] = useState<PeriodId>('month')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [categories, setCategories] = useState<CategoryTotal[]>([])
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [span, setSpan] = useState<{ from: string; to: string } | null>(null)

  useEffect(() => {
    api.reports.span().then(setSpan).catch(fail('el histórico'))
  }, [revision])

  const toggle = (categoryId: number): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(categoryId)) next.add(categoryId)
      return next
    })
  }

  // El rango de «Todo» va del primer movimiento al último. Mientras no ha
  // llegado se enseña el día de hoy, que es un rango vacío y no una fecha rara.
  const range = useMemo(
    () => (period === 'all' ? (span ?? { from: today(), to: today() }) : rangeFor(period)),
    [period, span]
  )
  const currency = settings.baseCurrency

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.reports.categories(range.from, range.to, kind),
      api.reports.monthly(12),
    ])
      .then(([nextCategories, nextMonthly]) => {
        setCategories(nextCategories)
        setMonthly(nextMonthly)
      })
      .catch(fail('los informes'))
      .finally(() => setLoading(false))
  }, [range, kind, revision])

  const total = categories.reduce((sum, item) => sum + item.total, 0)
  // La barra de cada fila se mide contra la categoría más grande, no contra el
  // total: si se midiera contra el total, todas saldrían diminutas.
  const widest = Math.max(1, ...categories.map((item) => item.total))
  const movements = categories.reduce((sum, item) => sum + item.count, 0)
  const dailyAverage = (() => {
    const days = Math.max(
      1,
      Math.round(
        (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000
      ) + 1
    )
    return Math.round(total / days)
  })()

  return (
    <>
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap' }}>
          <div className="row tight">
            {PERIODS.map((item) => (
              <button
                key={item.id}
                className={`btn small${period === item.id ? ' primary' : ' ghost'}`}
                onClick={() => setPeriod(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <span className="small muted">
            {formatDate(range.from)} – {formatDate(range.to)}
          </span>
          <button
            className="btn small"
            onClick={async () => {
              const result = await run(() =>
                api.csv.exportTransactions({ from: range.from, to: range.to })
              )
              if (result) toast(`${result.count} movimientos exportados`, 'success')
            }}
          >
            <Icon name="download" size={15} />
            Exportar
          </button>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid cols-3">
            <div className="card stat">
              <div className="label">{kind === 'expense' ? 'Gasto total' : 'Ingreso total'}</div>
              <div className={`value amount ${kind === 'expense' ? 'negative' : 'positive'}`}>
                {formatMoney(total, currency)}
              </div>
            </div>
            <div className="card stat">
              <div className="label">Movimientos</div>
              <div className="value">{movements}</div>
            </div>
            <div className="card stat">
              <div className="label">Media diaria</div>
              <div className="value">{formatMoney(dailyAverage, currency)}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Reparto por categorías</h2>
              <div className="spacer" />
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'expense', label: 'Gastos', tone: 'expense' },
                  { value: 'income', label: 'Ingresos', tone: 'income' }
                ]}
              />
            </div>
            <div className="card-body">
              {categories.length === 0 ? (
                <EmptyState
                  icon="chart"
                  title="Sin datos en este periodo"
                  message="Cambia el periodo o registra algún movimiento."
                />
              ) : (
                <table className="table breakdown">
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th className="num">Movimientos</th>
                      <th className="num">Porcentaje</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((row) => {
                      const key = row.categoryId ?? 'none'
                      const openable = hasBreakdown(row)
                      const open = expanded.has(row.categoryId ?? -1)
                      // Dentro de una categoría, la nota mayor marca el ancho:
                      // medirlas contra el total del periodo las dejaría planas.
                      const biggestNote = Math.max(1, ...row.notes.map((note) => note.total))
                      return (
                        <Fragment key={key}>
                          <tr
                            className={openable ? 'expandable' : undefined}
                            {...(openable
                              ? {
                                  role: 'button',
                                  tabIndex: 0,
                                  'aria-expanded': open,
                                  onClick: () => toggle(row.categoryId!),
                                  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return
                                    event.preventDefault()
                                    toggle(row.categoryId!)
                                  }
                                }
                              : {})}
                          >
                            <td>
                              <div className={`row tight${openable ? '' : ' breakdown-flat'}`}>
                                {openable && (
                                  <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
                                )}
                                <Avatar icon={row.icon} color={row.color} size="small" />
                                {row.name}
                              </div>
                              <div className="cat-bar">
                                <div
                                  style={{
                                    width: `${Math.max(0, row.total / widest) * 100}%`,
                                    background: row.color
                                  }}
                                />
                              </div>
                            </td>
                            <td className="num muted">{row.count}</td>
                            <td className="num muted">{row.percent.toFixed(1)}%</td>
                            <td className="num amount">{formatMoney(row.total, currency)}</td>
                          </tr>

                          {open &&
                            row.notes.map((note) => (
                              <tr className="subrow" key={`${key}-${note.note}`}>
                                <td>
                                  <span className="note-name">{note.note}</span>
                                  <div className="cat-bar">
                                    <div
                                      style={{
                                        width: `${Math.max(0, note.total / biggestNote) * 100}%`,
                                        // Más apagado que el de la categoría: es
                                        // una rama suya, no otra categoría.
                                        background: `color-mix(in srgb, ${row.color} 70%, transparent)`
                                      }}
                                    />
                                  </div>
                                </td>
                                <td className="num muted">{note.count}</td>
                                <td className="num muted">{note.percent.toFixed(1)}%</td>
                                <td className="num amount">{formatMoney(note.total, currency)}</td>
                              </tr>
                            ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="grid cols-2">
            <div className="card">
              <div className="card-header">
                <h2>Ingresos y gastos por mes</h2>
              </div>
              <div className="card-body">
                <MonthlyBars points={monthly} currency={currency} />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Balance mensual</h2>
                <span className="small muted">Lo que queda cada mes tras restar los gastos.</span>
              </div>
              <div className="card-body">
                <NetLine points={monthly} currency={currency} />
              </div>
            </div>
          </div>


        </>
      )}
    </>
  )
}

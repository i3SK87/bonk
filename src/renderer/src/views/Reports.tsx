import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon } from '../components/Icon'
import { Segmented, Loading, EmptyState, Avatar } from '../components/ui'
import { MonthlyBars, NetLine } from '../components/charts'
import { formatMoney } from '@shared/money'
import { today, startOfMonth, endOfMonth, daysBetween, formatDate } from '@shared/dates'
import { DateInput } from '../components/DateInput'
import { NOMBRES_DE_RANGO, rangoDe, comparacionDe, type RangoId } from '@shared/rangos'
import type { CategoryKind, CategoryTotal, MonthlyPoint } from '@shared/types'

const api = window.bonk

/*
 * Los mismos periodos que en Movimientos, y calculados por la misma función.
 *
 * Aquí «Este año» llegaba a fin de año mientras allí llegaba a fin de mes, y de
 * esa diferencia salía que la media diaria del mismo periodo dijera 45,84 € en
 * una pantalla y 59,21 € en la otra.
 *
 * Los mismos y ninguno más: «Año pasado» tuvo su botón hasta que «Personalizado»
 * llegó a esta pantalla, y con dos fechas se pide igual. Siete pastillas para lo
 * que hacen seis es una fila más larga de leer a cambio de nada.
 */
const PERIODS: RangoId[] = ['month', 'prev', 'quarter', 'year', 'all', 'custom']

/**
 * Una categoría se puede abrir cuando tiene desglose y al menos dos entradas,
 * o una sola que no sea el cajón «Sin nota»: abrir una fila para enseñar la
 * misma cifra otra vez no aporta nada.
 */
function hasBreakdown(row: CategoryTotal): boolean {
  if (row.categoryId === null || row.notes.length === 0) return false
  return row.notes.length > 1 || row.notes[0].note !== 'Sin nota'
}

/**
 * Cómo se llama el periodo con el que se compara cada pastilla.
 *
 * Dos formas porque la frase cambia de preposición: «que el mes pasado» y «que a
 * estas alturas del mes pasado». Pegando un «de» delante del primero salía «de
 * el mes pasado», y con los que van en plural haría falta «de los». Se escriben
 * las dos y no se contraen a mano.
 */
const CONTRA: Partial<Record<RangoId, { suelto: string; deEse: string }>> = {
  month: { suelto: 'el mes pasado', deEse: 'del mes pasado' },
  prev: { suelto: 'el mes anterior', deEse: 'del mes anterior' },
  quarter: { suelto: 'los tres meses de antes', deEse: 'de los tres meses de antes' },
  year: { suelto: 'el año pasado', deEse: 'del año pasado' },
  custom: { suelto: 'los mismos días de antes', deEse: 'de los mismos días de antes' }
}

/**
 * Si esa diferencia es buena o mala.
 *
 * No lo decide el signo sino lo que significa: gastar más es rojo y gastar menos
 * es verde, pero en los ingresos es justo al revés. Sin esa vuelta, un mes en el
 * que has cobrado menos saldría en verde por ser un número más pequeño.
 */
function tonoDe(delta: number, kind: CategoryKind): string {
  if (delta === 0) return 'muted'
  return delta > 0 === (kind === 'expense') ? 'negative' : 'positive'
}

/**
 * Cuánto ha cambiado una categoría, en pequeño y debajo de su importe.
 *
 * Tuvo una columna para ella sola con los euros y el porcentaje, y era demasiado:
 * ensanchaba la tabla y competía con las cifras que se venían a mirar. Aquí es
 * una anotación al pie del número, que es lo que es. Los euros de la diferencia
 * se quedan arriba, en la tarjeta del total, donde hay sitio y donde importan.
 *
 * Sin nada antes no hay resta que hacer, y decir «nuevo» informa más que un
 * «+100 %» contra cero.
 */
function Cambio({
  ahora,
  antes,
  kind
}: {
  ahora: number
  antes: number
  kind: CategoryKind
}): ReactNode {
  if (antes === 0) return <span className="cambio muted">nuevo</span>

  const delta = ahora - antes
  const porcentaje = Math.round((delta / antes) * 100)
  // Por debajo del uno por ciento no ha cambiado nada que merezca decirse.
  if (porcentaje === 0) return <span className="cambio muted">igual</span>

  return (
    <span className={`cambio ${tonoDe(delta, kind)}`}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(porcentaje)}%
    </span>
  )
}

export function ReportsView(): ReactNode {
  const { settings, revision, run, toast, fail } = useStore()
  const [period, setPeriod] = useState<RangoId>('month')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [categories, setCategories] = useState<CategoryTotal[]>([])
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [span, setSpan] = useState<{ from: string; to: string } | null>(null)
  /** El mismo reparto, del periodo de antes: es contra lo que se compara. */
  const [antes, setAntes] = useState<CategoryTotal[]>([])
  // Arrancan en el mes en curso: es de donde vienes al pulsar «Personalizado».
  const [customFrom, setCustomFrom] = useState(() => startOfMonth(today()))
  const [customTo, setCustomTo] = useState(() => endOfMonth(today()))

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

  /*
   * Los dos que no salen de la fecha de hoy.
   *
   * «Todo» va del primer movimiento al último, así que se le pregunta a los
   * datos; mientras la respuesta no ha llegado se enseña el día de hoy, que es
   * un rango vacío y no una fecha rara. «Personalizado» lo escribes tú.
   */
  const range = useMemo(() => {
    if (period === 'custom') return { from: customFrom, to: customTo }
    if (period === 'all') return span ?? { from: today(), to: today() }
    return rangoDe(period) ?? { from: today(), to: today() }
  }, [period, span, customFrom, customTo])
  // Con qué se compara y hasta dónde. «Todo» no tiene un antes.
  const comparacion = useMemo(() => comparacionDe(period, range), [period, range])
  const contra = CONTRA[period] ?? { suelto: 'antes', deEse: 'de antes' }
  const currency = settings.baseCurrency

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.reports.categories(range.from, range.to, kind),
      api.reports.monthly(12),
      // El de antes se pide igual: es la misma consulta con otras fechas.
      comparacion
        ? api.reports.categories(comparacion.from, comparacion.to, kind)
        : Promise.resolve([] as CategoryTotal[]),
    ])
      .then(([nextCategories, nextMonthly, nextAntes]) => {
        setCategories(nextCategories)
        setMonthly(nextMonthly)
        setAntes(nextAntes)
      })
      .catch(fail('los informes'))
      .finally(() => setLoading(false))
  }, [range, kind, comparacion, revision])

  const total = categories.reduce((sum, item) => sum + item.total, 0)
  const totalAntes = antes.reduce((sum, item) => sum + item.total, 0)

  /** Cada categoría de este periodo con lo que llevaba en el anterior al lado. */
  const filas = useMemo(() => {
    const previos = new Map(antes.map((item) => [item.categoryId, item.total]))
    return categories.map((item) => ({ row: item, antes: previos.get(item.categoryId) ?? 0 }))
  }, [categories, antes])

  /*
   * En lo que antes gastabas y ahora no.
   *
   * Estuvieron dentro de la tabla, con un cero y su comparación, y sobraban:
   * añadían filas a una lista que va de lo que has gastado este periodo. Pero la
   * información es buena —dejar de gastar en algo es la bajada más grande que
   * hay—, así que van debajo en un renglón, que es el sitio de una nota al pie.
   */
  const desaparecidas = useMemo(() => {
    if (!comparacion) return []
    const ahora = new Set(categories.map((item) => item.categoryId))
    return antes.filter((item) => !ahora.has(item.categoryId)).sort((a, b) => b.total - a.total)
  }, [categories, antes, comparacion])
  // La barra de cada fila se mide contra la categoría más grande, no contra el
  // total: si se midiera contra el total, todas saldrían diminutas.
  const widest = Math.max(1, ...categories.map((item) => item.total))
  const movements = categories.reduce((sum, item) => sum + item.count, 0)
  /*
   * Entre los días que han pasado, no entre los que mide el rango.
   *
   * Dividiendo por el rango entero, «Este mes» a día 3 decía que gastas la
   * décima parte de lo que gastas, y «Este año» en agosto repartía entre los
   * doce meses cuatro que aún no han llegado. Además decía una cosa distinta de
   * la que dice Movimientos del mismo periodo, que es peor que las dos.
   *
   * Las fechas se leen con `parseISO` y no con `new Date`, que interpreta
   * «YYYY-MM-DD» como UTC y en España cambia el día.
   */
  const dailyAverage = (() => {
    const hoy = today()
    const fin = range.to > hoy ? hoy : range.to
    const days = Math.max(1, daysBetween(range.from, fin) + 1)
    return Math.round(total / days)
  })()

  return (
    <>
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap' }}>
          <div className="row tight">
            {PERIODS.map((id) => (
              <button
                key={id}
                className={`btn small${period === id ? ' primary' : ' ghost'}`}
                onClick={() => setPeriod(id)}
              >
                {NOMBRES_DE_RANGO[id]}
              </button>
            ))}
          </div>
          <div className="spacer" />

          {/*
            Las fechas y el botón, en el mismo grupo.
            Sueltos, al estrecharse la ventana bajaba solo el botón y las fechas
            se quedaban arriba pegadas al canto derecho, con un hueco enorme por
            medio: parecían de otra fila. Juntos bajan a la vez y siguen leyéndose
            como lo que son, el periodo y qué hacer con él.
          */}
          <div className="row tight">
            {/*
              Sangrado como el de un control, que es lo que tiene al lado.
              Un texto pelado empieza en el canto de su caja y todo lo demás de
              esta barra —pastillas y campos de fecha— empieza pasado su relleno:
              al bajar de línea, el rótulo quedaba once píxeles a la izquierda de
              todo lo que tenía encima y debajo.
            */}
            <span className="small muted" style={{ paddingLeft: 11 }}>
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

          {/*
            Las fechas van dentro de la cabecera y no en una tira aparte debajo.
            La cabecera lleva raya cuando algo la sigue, y esa raya partía en dos
            lo que es un solo mando: eliges el periodo y, si es a mano, lo
            escribes. Ocupando toda la línea bajan solas, y el hueco que las
            separa es el mismo que separa cualquier par de cosas aquí.
          */}
          {period === 'custom' && (
            <div className="row" style={{ flexBasis: '100%', marginTop: 4 }}>
              <div style={{ flex: '1 1 170px', minWidth: 130, maxWidth: 190 }}>
                <DateInput value={customFrom} onChange={setCustomFrom} />
              </div>
              <span className="muted">hasta</span>
              <div style={{ flex: '1 1 170px', minWidth: 130, maxWidth: 190 }}>
                <DateInput value={customTo} onChange={setCustomTo} />
              </div>
            </div>
          )}
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
              {comparacion && (
                <div className="delta">
                  <span className={tonoDe(total - totalAntes, kind)}>
                    {formatMoney(total - totalAntes, currency, { sign: true })}
                  </span>
                  <span>
                    que {comparacion.enCurso ? `a estas alturas ${contra.deEse}` : contra.suelto}
                  </span>
                </div>
              )}
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
                    {filas.map(({ row, antes: gastoAntes }) => {
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
                            <td className="num amount">
                              {formatMoney(row.total, currency)}
                              {comparacion && (
                                <Cambio ahora={row.total} antes={gastoAntes} kind={kind} />
                              )}
                            </td>
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

              {/* Al pie y en pequeño: es una nota sobre la tabla, no una fila
                  más de ella. Solo las tres mayores, que la lista entera de lo
                  que no has gastado no la lee nadie. */}
              {desaparecidas.length > 0 && (
                <p className="small muted" style={{ margin: '12px 0 0' }}>
                  {comparacion?.enCurso ? 'Todavía sin gasto' : 'Sin gasto'} en{' '}
                  {desaparecidas.slice(0, 3).map((item, indice) => (
                    <Fragment key={item.categoryId ?? `x${indice}`}>
                      {indice > 0 && ', '}
                      {item.name} ({formatMoney(item.total, currency)})
                    </Fragment>
                  ))}
                  {desaparecidas.length > 3 && ` y ${desaparecidas.length - 3} más`}.
                </p>
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

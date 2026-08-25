import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon } from '../components/Icon'
import { Segmented, Loading, EmptyState, Avatar } from '../components/ui'
import { MenuContextual, type OpcionMenu } from '../components/MenuContextual'
import { CategoriaRapida } from '../components/CategoriaRapida'
import { MonthlyBars, NetLine } from '../components/charts'
import { formatMoney, currencySymbol } from '@shared/money'
import { today, startOfMonth, endOfMonth, daysBetween, formatDate } from '@shared/dates'
import { DateInput } from '../components/DateInput'
import { Teletipo, type Dato } from '../components/Teletipo'
import { NOMBRES_DE_RANGO, rangoDe, comparacionDe, type RangoId } from '@shared/rangos'
import type { Category, CategoryKind, CategoryTotal, MonthlyPoint } from '@shared/types'

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

/** Cómo se llama el periodo con el que se compara cada pastilla. */
const CONTRA: Partial<Record<RangoId, string>> = {
  month: 'el mes pasado',
  prev: 'el mes anterior',
  quarter: 'los tres meses de antes',
  year: 'el año pasado',
  custom: 'los mismos días de antes'
}

/**
 * Si esa diferencia es buena o mala.
 *
 * No lo decide el signo sino lo que significa: gastar más es rojo y gastar menos
 * es verde, pero en los ingresos es justo al revés. Sin esa vuelta, un mes en el
 * que has cobrado menos saldría en verde por ser un número más pequeño.
 */
/**
 * «Frente a el mes pasado» no lo dice nadie: en castellano a + el es al.
 *
 * Solo se contrae cuando el nombre del periodo empieza por el artículo. «Los
 * tres meses de antes» y «los mismos días de antes» van en plural y se quedan
 * como están.
 */
function frenteA(contra: string): string {
  return contra.startsWith('el ') ? `Frente al ${contra.slice(3)}` : `Frente a ${contra}`
}

function tonoDe(delta: number, kind: CategoryKind): string {
  if (delta === 0) return 'muted'
  return delta > 0 === (kind === 'expense') ? 'negative' : 'positive'
}

/**
 * Cuánto ha cambiado una cifra, a la derecha de ella y en pequeño.
 *
 * La misma insignia para las tarjetas de arriba y para las filas de la tabla:
 * un triángulo, una cifra y su color. Sin coletilla debajo, porque contra qué se
 * compara ya lo dice una vez la cabecera y repetirlo en cada línea es llenar la
 * pantalla de la misma frase.
 *
 * Los dos casos que no son un porcentaje se dicen con un signo y no con una
 * palabra: «=» cuando no ha cambiado y «-» cuando no hay con qué comparar. Una
 * palabra al lado de una cifra pesa más que la cifra.
 */
function Cambio({
  ahora,
  antes,
  kind,
  pista,
  unidad = 'porcentaje',
  formatea
}: {
  ahora: number
  antes: number
  kind: CategoryKind
  /** Las dos cifras crudas, para el rótulo de al pasar por encima. */
  pista: string
  /**
   * En qué se mide la diferencia.
   *
   * El porcentaje dice si algo se ha disparado, y los euros dicen cuánto es eso
   * en dinero: un 40 % más en Restaurantes y un 40 % más en Alquiler no cuestan
   * lo mismo, y mirando solo el porcentaje las categorías pequeñas parecen el
   * problema. Ninguna de las dos sobra, así que se elige.
   */
  unidad?: 'porcentaje' | 'valor'
  /**
   * Cómo se escribe la diferencia cuando no va en porcentaje.
   *
   * Lo pone quien llama porque no todas las cifras son dinero: la diferencia de
   * «Gasto total» son euros y la de «Movimientos» son movimientos, y un «▲ 3 €»
   * donde han entrado tres apuntes más sería mentira.
   */
  formatea?: (valor: number) => string
}): ReactNode {
  const delta = ahora - antes

  // Clavado, en cualquiera de las dos unidades.
  if (delta === 0) {
    return (
      <span className="cambio signo muted" title={pista}>
        =
      </span>
    )
  }

  if (unidad === 'valor') {
    /*
     * En valor absoluto no hay división, así que tampoco hay caso imposible: una
     * categoría que antes no existía ha subido justo lo que vale ahora, y eso
     * es una diferencia perfectamente decible.
     */
    return (
      <span className={`cambio ${tonoDe(delta, kind)}`} title={pista}>
        {delta > 0 ? '▲' : '▼'} {(formatea ?? String)(Math.abs(delta))}
      </span>
    )
  }

  /*
   * Sin nada antes no hay porcentaje: dividir entre cero no da un número, y un
   * «+100 %» diría que se ha doblado cuando no había nada que doblar.
   */
  if (antes === 0) {
    return (
      <span className="cambio signo muted" title={pista}>
        -
      </span>
    )
  }

  const porcentaje = Math.round((delta / antes) * 100)
  // Por debajo del uno por ciento no ha cambiado nada que merezca decirse.
  if (porcentaje === 0) {
    return (
      <span className="cambio signo muted" title={pista}>
        =
      </span>
    )
  }

  return (
    <span className={`cambio ${tonoDe(delta, kind)}`} title={pista}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(porcentaje)}%
    </span>
  )
}

export function ReportsView(): ReactNode {
  // El catálogo de categorías, con su ficha completa. Se llama así y no
  // `categories` porque ese nombre ya lo lleva aquí el desglose del periodo,
  // que son totales y no fichas.
  const { settings, categories: catalogo, revision, run, toast, fail, updateSettings } = useStore()
  const [period, setPeriod] = useState<RangoId>('month')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [categories, setCategories] = useState<CategoryTotal[]>([])
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([])
  /*
   * Solo se enseña el cargando la primera vez.
   *
   * Cualquier recarga posterior —cambiar de periodo, mover una categoría—
   * llegaba vaciando la pantalla y volviéndola a montar, y en el camino la
   * cabecera entera daba un salto. Los datos de antes siguen siendo válidos
   * mientras llegan los nuevos: se quedan puestos y se cambian de golpe.
   */
  const [cargado, setCargado] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  /*
   * Editar una categoría sin salir del informe.
   *
   * El informe es donde se ve que una categoría está mal puesta —el color que no
   * distingue, el nombre que no dice nada, la que habría que archivar—, y hasta
   * ahora había que irse a Categorías, buscarla y volver. Va por clic derecho y
   * no por un lápiz en la fila: la fila ya se pulsa para desplegar el desglose,
   * y un botón encima competiría con eso en todas las filas para lo que se usa
   * de vez en cuando.
   */
  const [menu, setMenu] = useState<{ categoria: Category; x: number; y: number } | null>(null)
  const [moviendo, setMoviendo] = useState<{ categoria: Category; ids: number[] } | null>(null)
  /*
   * En qué se miden las diferencias: la columna Balance y la cinta de arriba.
   *
   * Las dos comparan contra el mismo periodo, así que no pueden medirlo cada una
   * a su manera. El porcentaje enseña qué se ha disparado y el valor enseña
   * cuánto es eso —de dinero en las cifras de dinero, de movimientos en el
   * recuento—, y ninguna de las dos sobra.
   *
   * No se guarda en los ajustes: es cómo se está mirando esto ahora mismo, y se
   * cambia varias veces en la misma sesión. Un ajuste que se toca cada dos
   * minutos no es un ajuste.
   */
  const balanceEn = settings.balanceEn
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
  const contra = CONTRA[period] ?? 'antes'
  const currency = settings.baseCurrency

  useEffect(() => {
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
      .finally(() => setCargado(true))
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
  /*
   * Los movimientos que se van a mudar de categoría.
   *
   * Se piden al abrir el cuadro y no al aceptarlo, para poder decir cuántos son
   * antes de que se decida nada: mover cuarenta movimientos de golpe no puede
   * ser una sorpresa. Y los mismos ids que se cuentan son los que luego se
   * mueven, así que la cifra que se enseña no puede desmentirse después.
   *
   * Solo los del periodo que se está mirando, que es lo que la fila cuenta. Una
   * categoría arrastra años de movimientos, y mover en silencio los de enero
   * porque estabas mirando agosto es tocar datos que no tenías delante.
   *
   * Se piden a la lista y no se sacan del desglose porque el desglose son
   * totales, no movimientos: no lleva ni un id. De paso entran los reembolsos,
   * que el desglose no cuenta pero que llevan la categoría del gasto que
   * devuelven: dejarlos atrás partiría el gasto y su devolución en dos
   * categorías distintas.
   */
  const abrirMudanza = async (categoria: Category): Promise<void> => {
    const filas = await run(() =>
      api.transactions.list({
        from: range.from,
        to: range.to,
        categoryIds: [categoria.id],
        limit: 100000
      })
    )
    if (!filas) return
    if (filas.length === 0) {
      toast(`${categoria.name} no tiene movimientos en este periodo`, 'error')
      return
    }
    setMoviendo({ categoria, ids: filas.map((item) => item.id) })
  }

  const mover = async (hasta: number | null): Promise<void> => {
    if (!moviendo || hasta === moviendo.categoria.id) return
    const nombre = hasta == null ? 'Sin categoría' : catalogo.find((item) => item.id === hasta)?.name
    const cuantos = moviendo.ids.length
    await run(
      () => api.transactions.setCategory(moviendo.ids, hasta),
      `${cuantos} ${cuantos === 1 ? 'movimiento pasa' : 'movimientos pasan'} a ${nombre}`
    )
  }

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
  const movimientosAntes = antes.reduce((sum, item) => sum + item.count, 0)

  /*
   * La media del periodo anterior se reparte entre sus días, todos.
   *
   * El de ahora se reparte entre los transcurridos, porque los que faltan no han
   * pasado; el de antes ya está cerrado, así que sus días son los suyos. Comparar
   * dos ritmos así es lo único que tiene sentido: son euros por día, y da igual
   * que un mes tenga treinta y el otro treinta y uno.
   */
  const mediaAntes = (() => {
    if (!comparacion) return 0
    const dias = Math.max(1, daysBetween(comparacion.from, comparacion.to) + 1)
    return Math.round(totalAntes / dias)
  })()

  const dailyAverage = (() => {
    const hoy = today()
    const fin = range.to > hoy ? hoy : range.to
    const days = Math.max(1, daysBetween(range.from, fin) + 1)
    return Math.round(total / days)
  })()

  /*
   * Lo que desfila por la cinta.
   *
   * Las tres primeras son las que llevaban las tarjetas. Las otras dos salen de
   * lo que ya está calculado —no se le pregunta nada nuevo a los datos— y están
   * porque tres cifras dando vueltas se ven raras: un teletipo necesita algo
   * que contar.
   *
   * No va en un `useMemo`: el bucle de la cinta no depende de esta lista sino
   * de cuántas cifras tiene, así que volver a construirla en cada dibujo no
   * reinicia nada. Memorizarla obligaría a listar media pantalla de
   * dependencias para no ganar nada.
   */
  const euros = (valor: number): string => formatMoney(valor, currency)
  const insignia = (
    ahora: number,
    valorAntes: number,
    formatea: (valor: number) => string
  ): ReactNode =>
    comparacion ? (
      <Cambio
        ahora={ahora}
        antes={valorAntes}
        kind={kind}
        unidad={balanceEn}
        formatea={formatea}
        pista={`${formatea(ahora)} ahora · ${formatea(valorAntes)} ${contra}`}
      />
    ) : undefined

  // Lo que cuesta un movimiento de media, que no es lo mismo que lo que cuesta
  // un día: un día con ocho compras y otro con una valen igual aquí.
  const porMovimiento = movements > 0 ? Math.round(total / movements) : 0
  const porMovimientoAntes = movimientosAntes > 0 ? Math.round(totalAntes / movimientosAntes) : 0

  const cifras: Dato[] = [
    {
      label: kind === 'expense' ? 'Gasto total' : 'Ingreso total',
      value: euros(total),
      tone: kind === 'expense' ? 'negative' : 'positive',
      cambio: insignia(total, totalAntes, euros)
    },
    {
      label: 'Movimientos',
      value: String(movements),
      cambio: insignia(movements, movimientosAntes, String)
    },
    {
      label: 'Media diaria',
      value: euros(dailyAverage),
      cambio: insignia(dailyAverage, mediaAntes, euros)
    },
    {
      label: 'Por movimiento',
      value: euros(porMovimiento),
      cambio: insignia(porMovimiento, porMovimientoAntes, euros)
    }
  ]

  /*
   * La diferencia en euros, que es la que se le quitó a la insignia.
   *
   * En la tabla estorbaba: una cifra en euros dentro de una columna de
   * porcentajes canta, y allí lo que se comparan son categorías entre sí. Aquí
   * hay sitio de sobra y es el número que de verdad se busca —«¿cuánto más he
   * gastado este mes?»—, que un porcentaje solo no responde.
   */
  if (comparacion) {
    const diferencia = total - totalAntes
    const tono = tonoDe(diferencia, kind)
    cifras.push({
      label: frenteA(contra),
      value: formatMoney(diferencia, currency, { sign: true }),
      tone: tono === 'muted' ? 'neutral' : (tono as 'positive' | 'negative')
    })
  }

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
              El periodo no se repite aquí: los campos de fecha que hay al lado
              ya lo dicen, y con las mismas cifras. Era un rótulo que solo
              confirmaba lo que ya se estaba leyendo.
            */}
            <button
              className="btn small"
              onClick={async () => {
                const result = await run(() =>
                  api.informe.exportPdf({ from: range.from, to: range.to })
                )
                if (result) toast(`${result.count} movimientos exportados`, 'success')
              }}
            >
              <Icon name="download" size={15} />
              Descargar PDF
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

      {!cargado ? (
        <Loading />
      ) : (
        <>
          <Teletipo datos={cifras} />

          <div className="card">
            <div className="card-header">
              <h2>Reparto por categorías</h2>
              {/*
                Contra qué se comparan las flechas, escrito y a la vista.
                Estaba solo en el rótulo que sale al pasar por encima, y eso vale
                para salir de dudas pero no para no tenerlas: mirando la tabla no
                había forma de saber que un mes en curso se mide contra el mismo
                trozo del anterior. Una categoría con lo mismo en los dos meses
                enteros puede llevar flecha, y sin esta línea parece un error.
              */}
              {/* En qué se lee la diferencia, aquí y en la cinta de arriba: las
                  dos comparan contra lo mismo, así que no pueden medirla cada una
                  a su manera. Contra qué se compara lo dice el rótulo de la
                  columna al pasar por encima; escrito además aquí al lado era la
                  misma frase dos veces en la misma tarjeta. */}
              {comparacion && (
                <Segmented
                  value={balanceEn}
                  onChange={(value) => updateSettings({ balanceEn: value })}
                  options={[
                    { value: 'porcentaje', label: '%' },
                    { value: 'valor', label: currencySymbol(currency) }
                  ]}
                />
              )}
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
                      {/* Solo si hay con qué comparar: «Todo» no tiene un antes
                          y una columna entera vacía no la quiere nadie. */}
                      {comparacion && (
                        <th className="balance" title={`Comparado con ${contra}`}>
                          Balance
                        </th>
                      )}
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
                            className={`${openable ? 'expandable' : ''}${
                              menu?.categoria.id === row.categoryId ? ' marcada' : ''
                            }`.trim() || undefined}
                            onContextMenu={(event) => {
                              // «Sin categoría» no es una categoría: es el cajón
                              // de los que no tienen ninguna, y no hay ficha que
                              // abrir.
                              const categoria = catalogo.find((item) => item.id === row.categoryId)
                              if (!categoria) return
                              event.preventDefault()
                              setMenu({ categoria, x: event.clientX, y: event.clientY })
                            }}
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
                            {comparacion && (
                              <td className="balance">
                                <Cambio
                                  ahora={row.total}
                                  antes={gastoAntes}
                                  kind={kind}
                                  unidad={balanceEn}
                                  formatea={euros}
                                  pista={`${formatMoney(row.total, currency)} ahora · ${formatMoney(gastoAntes, currency)} entre el ${formatDate(comparacion.from)} y el ${formatDate(comparacion.to)}`}
                                />
                              </td>
                            )}
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
                                {/* El desglose por concepto no se compara: no
                                    hay un «antes» suyo que consultar. */}
                                {comparacion && <td />}
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
                  Sin gasto en{' '}
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

      {/* Una sola opción, la misma que en Movimientos: el informe es donde se
          ve que algo está mal clasificado —una fila que no debería pesar tanto,
          o que no debería existir— y hasta ahora había que irse a la lista,
          buscar sus movimientos y cambiarlos de uno en uno. */}
      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          opciones={
            [
              {
                etiqueta: 'Cambiar categoría',
                icono: 'tag',
                onElegir: () => abrirMudanza(menu.categoria)
              }
            ] satisfies OpcionMenu[]
          }
          onCerrar={() => setMenu(null)}
        />
      )}

      {moviendo && (
        <CategoriaRapida
          kind={moviendo.categoria.kind}
          puesta={moviendo.categoria.id}
          contexto={`${moviendo.ids.length} ${
            moviendo.ids.length === 1 ? 'movimiento' : 'movimientos'
          } de ${moviendo.categoria.name}, del ${formatDate(range.from)} al ${formatDate(range.to)}.`}
          onClose={() => setMoviendo(null)}
          onElegir={mover}
        />
      )}
    </>
  )
}

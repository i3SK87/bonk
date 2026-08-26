import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { nestByParent } from '../lib/nesting'
import { Icon } from '../components/Icon'
import { CalendarioDeTramo } from '../components/DateInput'
import { Avatar, EmptyState, Loading, Confirm } from '../components/ui'
import { TransactionForm } from '../components/TransactionForm'
import { MenuContextual, type OpcionMenu } from '../components/MenuContextual'
import { ImporteRapido } from '../components/ImporteRapido'
import { CategoriaRapida } from '../components/CategoriaRapida'
import { ImportModal, type OrigenCsv } from '../components/ImportCsv'
import { Teletipo, type Dato } from '../components/Teletipo'
import { AccionCabecera } from '../components/ui'
import { formatMoney, parseAmount } from '@shared/money'
import { byName } from '@shared/text'
import { NOMBRES_DE_RANGO, rangoDe, type RangoId } from '@shared/rangos'
import { today, addMonths, formatDate, formatDayHeading, daysBetween } from '@shared/dates'
import type {
  FilterTotals,
  ProjectedTransaction,
  TransactionFilter,
  TransactionView,
  TxType
} from '@shared/types'

const api = window.bonk

/** Los que se enseñan aquí. «Todo» se queda sin fechas: sin tope por ningún lado. */
const RANGES: RangoId[] = ['month', 'prev', 'quarter', 'year', 'all', 'custom']

/**
 * Coloca cada devolución justo debajo del gasto al que apunta. Solo dentro del
 * mismo día: el total de la jornada suma lo que pasó ese día, así que cuando el
 * gasto es de otro el enlace se marca en el canto y nada más.
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
  const {
    accounts,
    categories,
    settings,
    revision,
    run,
    toast,
    filtros,
    ponFiltros,
    refresh,
    fail,
    setFocusedAccountId
  } = useStore()

  /*
   * Los filtros no son de esta pantalla, son de la sesión.
   *
   * Estaban aquí dentro y esta pantalla se desmonta al cambiar de pestaña: dabas
   * una vuelta por Informes y al volver la lista había olvidado el periodo, las
   * cuentas y lo que estabas buscando. Ahora viven en el almacén, que dura lo
   * que dura la ventana y muere con ella.
   */
  const { range, customFrom, customTo, search, types, categoryIds, uncategorized } = filtros
  const setRange = (value: RangoId): void => ponFiltros({ range: value })
  const setSearch = (value: string): void => ponFiltros({ search: value })
  const setTypes = (value: TxType[]): void => ponFiltros({ types: value })
  const setCategoryIds = (value: number[]): void => ponFiltros({ categoryIds: value })
  const setUncategorized = (value: boolean): void => ponFiltros({ uncategorized: value })

  /** El calendario del tramo está abierto. Lo abre «Personalizado» y nada más. */
  const [eligiendoTramo, setEligiendoTramo] = useState(false)

  /** Lo que se teclea se muestra al momento; la consulta espera a que pares. */
  const [settledSearch, setSettledSearch] = useState(filtros.search)

  /**
   * La cuenta principal viene elegida: es la que se mira al abrir, y con ella
   * la cifra grande dice lo que hay ahí y no el total repartido entre huchas.
   * Se quita pulsándola, y entonces vuelve el patrimonio de todas.
   *
   * Solo la primera vez: `null` es que nadie ha tocado el filtro todavía. Una
   * lista vacía es «ninguna cuenta», y eso sí se respeta —si no, volver de otra
   * pestaña te devolvería la principal que acababas de quitar—.
   */
  const accountIds = filtros.accountIds ?? (accounts[0] ? [accounts[0].id] : [])
  const setAccountIds = (value: number[]): void => ponFiltros({ accountIds: value })
  useEffect(() => {
    if (filtros.accountIds == null && accounts[0]) ponFiltros({ accountIds: [accounts[0].id] })
  }, [filtros.accountIds, accounts, ponFiltros])

  /*
   * Con una sola cuenta a la vista, un movimiento nuevo nace en ella.
   *
   * El formulario lo abre la cabecera de la ventana, que no sabe nada de este
   * filtro: mirando la hucha, el gasto se guardaba en la cuenta principal y solo
   * te enterabas después. Con varias elegidas no se supone nada.
   */
  useEffect(() => {
    setFocusedAccountId(accountIds.length === 1 ? accountIds[0] : null)
    return () => setFocusedAccountId(null)
  }, [accountIds, setFocusedAccountId])
  const [showFilters, setShowFilters] = useState(false)

  const [rows, setRows] = useState<TransactionView[]>([])
  const [projected, setProjected] = useState<ProjectedTransaction[]>([])
  const [total, setTotal] = useState(0)
  /** Los totales del periodo entero, contados en la base de datos. */
  const [sumas, setSumas] = useState<FilterTotals | null>(null)
  const [limit, setLimit] = useState(200)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<TransactionView | null>(null)
  /** El menú del clic derecho: qué fila y en qué punto de la ventana. */
  const [menu, setMenu] = useState<{ row: TransactionView; x: number; y: number } | null>(null)
  const [cambiandoImporte, setCambiandoImporte] = useState<TransactionView | null>(null)
  const [cambiandoCategoria, setCambiandoCategoria] = useState<TransactionView | null>(null)
  const [devolviendo, setDevolviendo] = useState<TransactionView | null>(null)
  const [borrando, setBorrando] = useState<TransactionView | null>(null)
  const [importando, setImportando] = useState<OrigenCsv | null>(null)
  /*
   * Recolocar un movimiento arrastrándolo.
   *
   * Dentro de su día es solo orden: la lista ordena por fecha y luego por cuándo
   * se apuntó, que no tiene nada que ver con el orden en que pasaron las cosas
   * —apuntas la cena y luego te acuerdas del taxi de antes, y el taxi queda
   * encima—.
   *
   * Soltándolo en otro día se le cambia la fecha, que es lo que uno espera al
   * mover una fila de un día a otro. Se apunta de qué día sale para saber cuál
   * de las dos cosas es cada suelta, y el aviso de después lo dice con todas las
   * letras: mudar un dato sin contarlo sí sería de mala educación.
   */
  const [arrastrado, setArrastrado] = useState<{ id: number; date: string } | null>(null)
  const [destino, setDestino] = useState<number | null>(null)
  /** El día sobre cuya cabecera se está soltando, para marcarla. */
  const [diaDestino, setDiaDestino] = useState<string | null>(null)

  /*
   * Se recoloca a puntero y no con el arrastre del navegador.
   *
   * Con `draggable` venían de balde la copia pegada al cursor y el soltar
   * encima de quien toca, pero durante ese arrastre el puntero lo pinta Windows
   * y la hoja de estilos no lo toca: iba alternando entre el candado de «aquí no
   * se suelta» y la flecha del recuadro de puntos, dos dibujos para un gesto que
   * es uno solo. A puntero el cursor lo manda el CSS y no cambia en todo el
   * viaje; lo que se pierde —la copia flotante— lo cubren la fila atenuada y la
   * raya de dónde va a caer.
   */
  const gesto = useRef<{ id: number; date: string; x: number; y: number; vivo: boolean } | null>(
    null
  )
  /** Lo agrupado que hay en pantalla, para saber en qué día se ha soltado. */
  const gruposRef = useRef<
    Array<[string, { real: TransactionView[]; upcoming: ProjectedTransaction[] }]>
  >([])
  /** Se acaba de arrastrar: el clic que viene detrás no cuenta. */
  const recienSoltado = useRef(false)

  /**
   * Los movimientos de un día repartidos en bloques.
   *
   * Un gasto y sus devoluciones son una sola cosa en la lista —cuelgan de él— y
   * moverlo tiene que llevárselas consigo, o se quedarían colgando de quien no es.
   */
  function bloquesDe(reales: TransactionView[]): TransactionView[][] {
    const bloques: TransactionView[][] = []
    for (const { row, nested } of nestRefunds(reales)) {
      if (nested && bloques.length > 0) bloques[bloques.length - 1].push(row)
      else bloques.push([row])
    }
    return bloques
  }

  function finDelArrastre(): void {
    document.body.classList.remove('recolocando')
    gesto.current = null
    setArrastrado(null)
    setDestino(null)
    setDiaDestino(null)
  }

  /**
   * Deja el día en el orden en que ha quedado tras soltar.
   *
   * `sobreId` es la fila sobre la que se ha soltado; sin ella, se ha soltado en
   * la cabecera del día y el movimiento se pone el primero.
   */
  async function soltarEn(
    movido: { id: number; date: string },
    dia: string,
    reales: TransactionView[],
    sobreId?: number
  ): Promise<void> {
    if (movido.id === sobreId) return

    const bloques = bloquesDe(reales)
    const hasta =
      sobreId == null ? 0 : bloques.findIndex((bloque) => bloque.some((fila) => fila.id === sobreId))
    if (hasta < 0) return

    /*
     * Viene de otro día: primero se muda y luego se ordena, de una vez.
     *
     * El que llega no está en `reales` —esa lista es la del día de destino—, así
     * que se cuela a mano donde se ha soltado. Sus devoluciones no viajan con él:
     * se quedan en la fecha en que volvió el dinero, y la lista ya sabe enseñar
     * un gasto y su devolución en días distintos.
     */
    if (movido.date !== dia) {
      const orden = bloques.map((bloque) => bloque.map((fila) => fila.id))
      orden.splice(hasta, 0, [movido.id])
      await run(
        () => api.transactions.moveToDay(movido.id, dia, orden.flat()),
        `Fecha cambiada al ${formatDate(dia)}`
      )
      return
    }

    const desde = bloques.findIndex((bloque) => bloque[0].id === movido.id)
    if (desde < 0 || desde === hasta) return

    const orden = [...bloques]
    const [suyo] = orden.splice(desde, 1)
    orden.splice(hasta, 0, suyo)
    await run(
      () => api.transactions.reorder(orden.flat().map((fila) => fila.id)),
      'Orden del día actualizado'
    )
  }

  /** Lo que hay justo debajo del puntero: una fila, la cabecera de un día o nada. */
  function bajoElPuntero(x: number, y: number): { fila?: HTMLElement; dia?: string } {
    const debajo = document.elementFromPoint(x, y) as HTMLElement | null
    const fila = debajo?.closest<HTMLElement>('.tx-row[data-tx-id]') ?? undefined
    if (fila) return { fila, dia: fila.dataset.txDate }
    const cabecera = debajo?.closest<HTMLElement>('.day-heading[data-dia]')
    return { dia: cabecera?.dataset.dia }
  }

  /** Pinta la raya donde caería lo que se arrastra si se soltara aquí. */
  function apuntarA(x: number, y: number): void {
    const suyo = gesto.current
    if (!suyo) return
    const { fila, dia } = bajoElPuntero(x, y)
    // Encima de sí misma no se marca nada: soltar ahí no hace nada.
    if (fila && Number(fila.dataset.txId) !== suyo.id) {
      setDestino(Number(fila.dataset.txId))
      setDiaDestino(null)
      return
    }
    setDestino(null)
    setDiaDestino(fila ? null : (dia ?? null))
  }

  /*
   * Al rozar el canto, la lista se desplaza sola.
   *
   * Sin esto no hay manera de llevar un movimiento a un día que no quepa en
   * pantalla. Va colgado del mover el puntero y no de un temporizador, así que
   * al soltar no queda nada corriendo por detrás.
   */
  function acercarElCanto(y: number): void {
    const caja = document.querySelector<HTMLElement>('.main')
    if (!caja) return
    const marco = caja.getBoundingClientRect()
    const margen = 56
    if (y < marco.top + margen) caja.scrollTop -= Math.ceil((marco.top + margen - y) / 3)
    else if (y > marco.bottom - margen)
      caja.scrollTop += Math.ceil((y - (marco.bottom - margen)) / 3)
  }

  function alMoverPuntero(event: PointerEvent): void {
    const suyo = gesto.current
    if (!suyo) return
    // Hasta cuatro píxeles esto sigue siendo un clic y no un arrastre.
    if (!suyo.vivo) {
      if (Math.abs(event.clientX - suyo.x) + Math.abs(event.clientY - suyo.y) < 4) return
      suyo.vivo = true
      document.body.classList.add('recolocando')
      setArrastrado({ id: suyo.id, date: suyo.date })
    }
    acercarElCanto(event.clientY)
    apuntarA(event.clientX, event.clientY)
  }

  function alLevantarPuntero(event: PointerEvent): void {
    const suyo = gesto.current
    quitarEscuchas()
    if (!suyo?.vivo) {
      finDelArrastre()
      return
    }
    recienSoltado.current = true
    const { fila, dia } = bajoElPuntero(event.clientX, event.clientY)
    const movido = { id: suyo.id, date: suyo.date }
    finDelArrastre()
    if (!dia) return
    const reales = gruposRef.current.find(([fecha]) => fecha === dia)?.[1].real ?? []
    void soltarEn(movido, dia, reales, fila ? Number(fila.dataset.txId) : undefined)
  }

  function alCancelarPuntero(): void {
    quitarEscuchas()
    finDelArrastre()
  }

  function alTeclearArrastrando(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    alCancelarPuntero()
  }

  function ponerEscuchas(): void {
    window.addEventListener('pointermove', alMoverPuntero)
    window.addEventListener('pointerup', alLevantarPuntero)
    window.addEventListener('pointercancel', alCancelarPuntero)
    window.addEventListener('keydown', alTeclearArrastrando)
  }

  function quitarEscuchas(): void {
    window.removeEventListener('pointermove', alMoverPuntero)
    window.removeEventListener('pointerup', alLevantarPuntero)
    window.removeEventListener('pointercancel', alCancelarPuntero)
    window.removeEventListener('keydown', alTeclearArrastrando)
  }

  /*
   * Las escuchas viven en la ventana, no en React: si la pantalla se va con el
   * ratón apretado —cambiando de sección a media recolocación— hay que
   * descolgarlas a mano o se quedan disparando contra una vista que ya no está.
   */
  const alDesmontar = useRef<() => void>(() => undefined)
  alDesmontar.current = quitarEscuchas
  useEffect(
    () => () => {
      alDesmontar.current()
      document.body.classList.remove('recolocando')
    },
    []
  )

  function empezarGesto(event: React.PointerEvent<HTMLDivElement>): void {
    recienSoltado.current = false
    // Solo el botón izquierdo. El dedo no: en un portátil táctil arrastrar la
    // lista es desplazarla, y robárselo dejaría la pantalla sin poder moverse.
    if (event.button !== 0 || event.pointerType === 'touch') return
    const desde = event.target as HTMLElement
    // Los botones y los campos de la fila hacen lo suyo.
    if (desde.closest('button, a, input, select, textarea, label')) return
    const fila = desde.closest<HTMLElement>('.tx-row[data-arrastrable="si"]')
    if (!fila) return
    gesto.current = {
      id: Number(fila.dataset.txId),
      date: fila.dataset.txDate ?? '',
      x: event.clientX,
      y: event.clientY,
      vivo: false
    }
    ponerEscuchas()
  }

  /*
   * Detrás de un arrastre no hay clic.
   *
   * El ratón se levanta encima de una fila y el navegador remata el gesto con un
   * clic de propina, que aquí abriría su ficha. Se para en la bajada, antes de
   * que llegue a la fila.
   */
  function pararElClicDeDespues(event: React.MouseEvent<HTMLDivElement>): void {
    if (!recienSoltado.current) return
    recienSoltado.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  useEffect(() => {
    const id = window.setTimeout(() => setSettledSearch(search), 250)
    return () => window.clearTimeout(id)
  }, [search])

  const filter = useMemo<TransactionFilter>(() => {
    const dates = range === 'custom' ? { from: customFrom, to: customTo } : (rangoDe(range) ?? {})
    return {
      ...dates,
      search: settledSearch.trim() || undefined,
      types: types.length ? types : undefined,
      // Una lista vacía de cuentas significa «todas» para la consulta, así que
      // cuando no hay ninguna elegida se le pide un imposible: así devuelve nada
      // sin tener que enseñarle a la capa de datos un caso que solo existe aquí.
      accountIds: accountIds.length ? accountIds : [-1],
      categoryIds: categoryIds.length ? categoryIds : undefined,
      uncategorized: uncategorized || undefined,
      limit
    }
  }, [range, customFrom, customTo, settledSearch, types, accountIds, categoryIds, uncategorized, limit])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // Los totales aparte de la lista: la lista viene con tope y sumarla daba
    // cifras de menos en cuanto el periodo pasaba de doscientos movimientos.
    Promise.all([api.transactions.list(filter), api.transactions.totals(filter)])
      .then(([list, sumas]) => {
        if (cancelled) return
        setRows(list)
        setSumas(sumas)
        setTotal(sumas.count)
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
    filtros.programados &&
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

  gruposRef.current = groups

  /**
   * Los totales suman también lo que está por venir mientras las programadas se
   * estén viendo: es una previsión, y al apagarlas las cifras vuelven a contar
   * solo lo que ha pasado de verdad.
   */
  /*
   * Lo real lo suma la base de datos y lo previsto se le añade aquí.
   *
   * Antes se sumaba la lista entera en la ventana, y la lista viene con tope
   * para no traerse años de golpe: con más movimientos que ese tope, las cifras
   * contaban solo un trozo y lo llamaban «del periodo». En un año con
   * trescientas noventa y tres, el balance salía en rojo estando en verde.
   *
   * Lo previsto sí se suma aquí porque no existe en ninguna tabla: son las
   * repeticiones que aún no han entrado, y se calculan al vuelo.
   */
  const totals = useMemo(() => {
    let income = sumas?.income ?? 0
    let expense = sumas?.expense ?? 0
    for (const item of projected) {
      if (item.type === 'income') income += item.amountInBase
      else if (item.type === 'expense') expense += Math.abs(item.amountInBase)
      // Lo reembolsado deja de ser gasto, no pasa a ser ingreso.
      else if (item.type === 'refund') expense -= item.amountInBase
    }
    return { income, expense, net: income - expense }
  }, [sumas, projected])

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
    ponFiltros({ types: [], accountIds: [], categoryIds: [], uncategorized: false })
  }

  function toggle<T>(list: T[], value: T, setter: (next: T[]) => void): void {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  /**
   * Lo que un movimiento le hace al día que se está mirando.
   *
   * Sin cuenta elegida es su efecto sobre el patrimonio, y ahí un traspaso vale
   * cero: el dinero sigue siendo tuyo. Pero mirando una cuenta concreta, ese
   * mismo traspaso sale de ella y tiene que restar; si es el destino, suma lo que
   * recibe. Entre dos cuentas elegidas vuelve a ser cero, que es la verdad.
   */
  function effectOn(item: { type: TxType; amount: number; amountTo: number | null; amountInBase: number; accountId: number; toAccountId: number | null }): number {
    if (accountIds.length === 0 || item.type !== 'transfer') return item.amountInBase
    const sale = accountIds.includes(item.accountId)
    const entra = item.toAccountId != null && accountIds.includes(item.toAccountId)
    if (sale && entra) return 0
    if (sale) return -item.amount
    if (entra) return item.amountTo ?? item.amount
    return 0
  }

  const showingProjected = projected.length > 0
  const nothingToShow = rows.length === 0 && projected.length === 0
  /*
   * Sin ninguna cuenta elegida no se enseña nada.
   *
   * Antes, quitar la última cuenta significaba «todas», y de la pastilla
   * apagada a una lista con todo el dinero junto no hay ningún aviso: parecía
   * que el filtro se había roto. Ahora ninguna elegida es ninguna, que es lo
   * que dicen las pastillas, y la lista lo dice con todas las letras.
   */
  const sinCuenta = accountIds.length === 0

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

  /*
   * Lo que desfila por el teletipo.
   *
   * Las tres primeras son las que estaban en las tarjetas. Las otras dos salen
   * de la misma lista que ya se tiene delante —no se pregunta nada nuevo— y
   * están porque tres cifras sueltas dando vueltas se veían raras: un teletipo
   * necesita algo que contar.
   */
  const cifras = useMemo<Dato[]>(() => {
    const sufijo = showingProjected ? 'previstos' : 'del periodo'
    const lista: Dato[] = [
      {
        label: `Ingresos ${sufijo}`,
        value: formatMoney(totals.income, settings.baseCurrency),
        tone: 'positive'
      },
      {
        label: `Gastos ${sufijo}`,
        value: formatMoney(totals.expense, settings.baseCurrency),
        tone: 'negative'
      },
      {
        label: showingProjected ? 'Balance previsto' : 'Balance',
        value: formatMoney(totals.net, settings.baseCurrency, { sign: true }),
        tone: totals.net >= 0 ? 'positive' : 'negative'
      },
      {
        // Los que hay, no los que se han traído: la lista carga de doscientos
        // en doscientos y aquí decía siempre «200».
        label: 'Movimientos',
        value: String((sumas?.count ?? 0) + projected.length),
        tone: 'neutral'
      }
    ]

    /*
     * El ritmo de gasto, que es lo que deja comparar un mes con otro de
     * distinta longitud.
     *
     * Se reparte entre los días que han pasado de verdad, no entre los que mide
     * el rango: a día 3 de mes, dividir entre 31 dice que gastas una tercera
     * parte de lo que gastas. Cuando se está mirando lo que viene sí cuenta el
     * rango entero, porque entonces el gasto de esos días futuros también está
     * sumado arriba.
     */
    // Sin rango elegido —«Todo»— los extremos los da la propia consulta, que ha
    // mirado todo: sacarlos de la lista cargada acortaba el periodo al trozo
    // que cupiera y disparaba la media.
    const ultimaPrevista = projected.length ? projected[projected.length - 1].date : null
    const inicio = filter.from ?? sumas?.firstDate ?? null
    const finRango = filter.to ?? (showingProjected ? ultimaPrevista : null) ?? sumas?.lastDate ?? null
    const fin = !finRango ? null : showingProjected ? finRango : finRango > today() ? today() : finRango
    if (inicio && fin && totals.expense > 0) {
      const dias = Math.max(1, daysBetween(inicio, fin) + 1)
      lista.push({
        label: 'Gasto medio al día',
        value: formatMoney(Math.round(totals.expense / dias), settings.baseCurrency),
        tone: 'negative'
      })
    }

    return lista
  }, [totals, sumas, projected, showingProjected, settings.baseCurrency, filter.from, filter.to])

  /** Las cuentas que se están quedando cortas, cada una con su propio suelo. */
  const runningLow = accounts.filter(
    (account) => account.lowBalanceThreshold > 0 && account.balance < account.lowBalanceThreshold
  )
  const enAviso = new Set(runningLow.map((account) => account.id))

  /*
   * La cifra grande se tiñe si alguna de las cuentas que suma está avisando.
   *
   * Alguna y no todas. Con «todas» el ámbar no salía casi nunca: basta una hucha
   * a cero y sin suelo puesto para que el patrimonio siguiera en verde con el
   * aviso justo debajo, que es precisamente lo que había que arreglar.
   *
   * Se pierde algo de precisión —con tres cuentas y una corta, el total no está
   * corto— y a cambio se gana lo que se buscaba: que una cifra en verde no tape
   * un aviso. El ámbar dice «mira aquí», no «esto está mal», y el rótulo de
   * debajo dice cuál es la cuenta.
   *
   * Solo entran las que la cifra suma: una cuenta apartada del total que ande
   * corta no tiñe un patrimonio en el que no está.
   */
  const patrimonioEnAviso = shownAccounts.some((account) => enAviso.has(account.id))
  const tonoPatrimonio =
    netWorth < 0
      ? 'negative'
      : patrimonioEnAviso
        ? 'warning'
        : netWorth > 0
          ? 'positive'
          : 'neutral'

  /*
   * Lo que ofrece el menú de una fila.
   *
   * Las tres cosas que se hacen a diario sobre un apunte ya registrado. La ficha
   * completa sigue a un clic izquierdo: esto es el atajo, no su sustituto.
   *
   * Devolver solo sale en los gastos: un reembolso se registra contra el gasto
   * que devuelve el dinero, y ni un ingreso ni un traspaso ni otra devolución
   * tienen nada que devolver.
   */
  const opcionesDe = (row: TransactionView): OpcionMenu[] => {
    const lista: OpcionMenu[] = [
      { etiqueta: 'Editar importe', icono: 'edit', onElegir: () => setCambiandoImporte(row) }
    ]
    /*
     * Ni un traspaso ni un reembolso llevan categoría propia.
     *
     * El traspaso mueve dinero de un bolsillo a otro y no es ni gasto ni
     * ingreso, así que no hay nada que clasificar. La devolución sí cuenta,
     * pero su categoría es la del gasto del que cuelga —se devuelve *eso*—, y
     * cambiársela por su cuenta las separaría: el gasto seguiría en Suscripciones
     * y lo que te devuelven contaría en otro sitio, descuadrando las dos.
     */
    if (row.type !== 'transfer' && row.type !== 'refund') {
      lista.push({
        etiqueta: 'Cambiar categoría',
        icono: 'tag',
        onElegir: () => setCambiandoCategoria(row)
      })
    }
    /*
     * Una cuota de una deuda a plazos no se reembolsa.
     *
     * Devolver un gasto es que alguien te pone de vuelta ese dinero; una cuota
     * es dinero que sale y no vuelve, y apuntarle un reembolso descuadraría lo
     * que la pestaña Deudas da por pagado. Si una cuota se cobró mal, se corrige
     * o se borra, que para eso están las otras dos opciones.
     */
    if (row.type === 'expense' && !row.isDebt) {
      lista.push({
        etiqueta: 'Registrar reembolso',
        icono: 'refund',
        onElegir: () => setDevolviendo(row)
      })
    }
    lista.push({
      etiqueta: 'Eliminar',
      icono: 'trash',
      peligrosa: true,
      onElegir: () => setBorrando(row)
    })
    return lista
  }

  return (
    <>
      {/* Junto a «Nuevo movimiento», que es de donde salen las filas de la lista:
          unas se escriben y otras se traen. Sin relleno y un punto más pequeño
          porque no es la acción principal de la pantalla, es la de al lado. */}
      <AccionCabecera>
        <button
          className="btn small mini contorno"
          onClick={async () => {
            const picked = await run(() => api.csv.pick())
            if (picked) setImportando(picked)
          }}
          title="Traer movimientos de un extracto o de otra aplicación"
        >
          <Icon name="upload" size={14} />
          Importar CSV
        </button>
      </AccionCabecera>

      <div className="card">
        <div className="card-body networth-strip">
          <div className="networth">
            <div className="label">{netWorthLabel}</div>
            <div className={`value amount ${tonoPatrimonio}`}>
              {formatMoney(netWorth, settings.baseCurrency)}
            </div>
          </div>

          <div className="accounts-block">
            <div className="label">Cuentas</div>
            <div className="account-chips">
              {accounts.map((account) => {
                const active = accountIds.includes(account.id)
                const balance = account.balance + (projectedDeltas.get(account.id) ?? 0)
                /*
                 * Del color del aviso mientras el aviso esté puesto.
                 *
                 * Se mira si la cuenta está avisando y no el saldo que se está
                 * enseñando, para que el rótulo de abajo y la cifra digan lo
                 * mismo también con los previstos puestos. En descubierto manda
                 * el rojo: el aviso también sube de tono ahí.
                 */
                const tono =
                  balance < 0
                    ? 'negative'
                    : enAviso.has(account.id)
                      ? 'warning'
                      : balance > 0
                        ? 'positive'
                        : 'neutral'
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
                        className={`chip-balance amount ${tono}`}
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
        {runningLow.map((account) => (
          <div
            key={account.id}
            className={`low-balance${account.balance <= 0 ? ' overdrawn' : ''}`}
          >
            <Icon name="alert" size={16} />
            <span>
              <b>{account.name}</b>{' '}
              {account.balance <= 0 ? 'se ha quedado sin fondos' : 'se está quedando sin fondos'}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap' }}>
          <div className="row tight">
            {RANGES.map((id) => (
              <button
                key={id}
                className={`btn small${range === id ? ' primary' : ' ghost'}`}
                onClick={() => {
                  setRange(id)
                  // «Personalizado» no dice nada por sí solo: lo que se pide al
                  // pulsarlo es elegir los dos días, así que el calendario sale
                  // sin tener que ir a buscarlo. Y vuelve a salir si se pulsa
                  // otra vez estando ya puesto, que es cómo se cambia el tramo.
                  if (id === 'custom') setEligiendoTramo(true)
                }}
              >
                {NOMBRES_DE_RANGO[id]}
              </button>
            ))}

            {/* El tramo elegido, escrito al lado del botón que lo pone. Es un
                rótulo y no un campo: no hay nada que tocar ahí, para cambiarlo
                se vuelve a pulsar «Personalizado». */}
            {range === 'custom' && (
              <span className="small muted" style={{ marginLeft: 4, whiteSpace: 'nowrap' }}>
                {formatDate(customFrom)} – {formatDate(customTo)}
              </span>
            )}
          </div>

          <div className="spacer" />

          <div className="row tight">
            <div
              style={{ position: 'relative', marginRight: 8, flex: '1 1 210px', minWidth: 150, maxWidth: 240 }}
            >
              <input
                className="input"
                style={{ paddingLeft: 30, paddingRight: search ? 30 : 12, width: '100%' }}
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
              className={`btn small${filtros.programados ? ' primary' : ''}`}
              onClick={() => ponFiltros({ programados: !filtros.programados })}
              title={
                filtros.programados
                  ? 'Ocultar lo que está por venir y volver a las cifras reales'
                  : 'Ver las programadas que quedan por llegar y su efecto en los totales'
              }
            >
              {/* Calendario y no las flechas del ciclo: lo que añade a la lista
                  es lo que está por venir, y no todo lo que viene se repite. */}
              <Icon name="calendar" size={15} />
              Programados
            </button>
          </div>

          {eligiendoTramo && (
            <CalendarioDeTramo
              desde={customFrom}
              onChange={(from, to) => ponFiltros({ customFrom: from, customTo: to })}
              onClose={() => setEligiendoTramo(false)}
            />
          )}
        </div>

        {showFilters && (
          <div className="card-body col" style={{ gap: 14 }}>
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
                  onClick={() => setUncategorized(!uncategorized)}
                  title="Los movimientos que se quedaron sin categoría"
                >
                  Sin categoría
                </button>
              </div>
            </div>


          </div>
        )}
      </div>

      {/* La cinta calla sin cuenta elegida: sus cifras hablarían de unos
          movimientos que la lista de debajo no está enseñando. */}
      {!sinCuenta && <Teletipo datos={cifras} />}

      <div className="card">
        <div className="card-body tight">
          {/* Vacía es vacía del todo: si no hay movimientos registrados pero sí
              programadas por llegar, hay algo que enseñar. Mirando solo los
              reales, buscar «padre» con las previsiones encendidas daba «No hay
              movimientos» mientras el total de arriba ya contaba sus 200 €. */}
          {sinCuenta ? (
            <EmptyState
              icon="wallet"
              title="Ninguna cuenta elegida"
              message="Elige una cuenta ahí arriba para ver sus movimientos. Pulsando otra vez la quitas, y puedes tener varias a la vez."
            />
          ) : loading && nothingToShow ? (
            <Loading />
          ) : nothingToShow ? (
            <EmptyState
              icon="list"
              title="No hay movimientos"
              message="Prueba a ampliar el periodo o a quitar filtros. Con Ctrl+N creas uno nuevo."
            />
          ) : (
            // Al refiltrar se atenúa lo que ya había en vez de vaciar la lista.
            <div
              style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s ease' }}
              onPointerDown={empezarGesto}
              onClickCapture={pararElClicDeDespues}
            >
            {groups.map(([date, items]) => {
              // El total del día también cuenta lo previsto mientras se enseñe.
              const dayTotal =
                items.real.reduce((sum, item) => sum + effectOn(item), 0) +
                items.upcoming.reduce((sum, item) => sum + effectOn(item), 0)
              const onlyUpcoming = items.real.length === 0
              return (
                <div key={date}>
                  {/* La cabecera también recibe: soltando ahí, el movimiento se
                      muda a ese día y se pone el primero. Es la única manera de
                      llevarlo a un día del que no se ve ninguna fila propia, y
                      ahorra apuntar a una en concreto cuando lo único que se
                      quiere es cambiar la fecha. */}
                  <div
                    className={`day-heading${diaDestino === date ? ' destino' : ''}`}
                    data-dia={date}
                  >
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
                        onActivate={() => setEditing(row)}
                        family={family}
                        linkedTo={
                          family !== undefined && family !== row.id
                            ? families.parents.get(family)
                            : undefined
                        }
                        active={family !== undefined && family === hoveredFamily}
                        onFamily={setHoveredFamily}
                        onMenu={(x, y) => setMenu({ row, x, y })}
                        marcada={menu?.row.id === row.id}
                        // Una devolución no se recoloca: va donde vaya su gasto.
                        arrastrable={!nested}
                        arrastrando={arrastrado?.id === row.id}
                        destino={destino === row.id}
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

      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          opciones={opcionesDe(menu.row)}
          onCerrar={() => setMenu(null)}
        />
      )}

      {cambiandoImporte && (
        <ImporteRapido row={cambiandoImporte} onClose={() => setCambiandoImporte(null)} />
      )}

      {cambiandoCategoria && (
        <CategoriaRapida
          kind={cambiandoCategoria.type === 'income' ? 'income' : 'expense'}
          puesta={cambiandoCategoria.categoryId}
          onClose={() => setCambiandoCategoria(null)}
          // `setCategory` reescribe la categoría y nada más, así que la fecha,
          // el importe, las etiquetas y los adjuntos ni se enteran.
          onElegir={async (categoryId) => {
            await run(
              () => api.transactions.setCategory([cambiandoCategoria.id], categoryId),
              'Categoría actualizada'
            )
          }}
        />
      )}

      {importando && (
        <ImportModal
          source={importando}
          onClose={() => setImportando(null)}
          onDone={async () => {
            setImportando(null)
            // Recarga entera: la importación puede haber creado cuentas y
            // categorías, no solo movimientos.
            await refresh()
          }}
        />
      )}

      {devolviendo && (
        <TransactionForm refundFor={devolviendo} onClose={() => setDevolviendo(null)} />
      )}

      {borrando && (
        <Confirm
          title="Eliminar movimiento"
          message="El movimiento y sus adjuntos se borrarán definitivamente."
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            await run(() => api.transactions.remove(borrando.id), 'Movimiento eliminado')
            setBorrando(null)
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
        icon={isTransfer ? 'transfer' : (row.categoryIcon ?? 'calendar')}
        color={isTransfer ? '#0A84FF' : (row.categoryColor ?? '#8E8E93')}
      />
      <div className="tx-main">
        {/*
          La marca va al lado del título y no en el subtexto.

          Abajo compartía renglón con la nota y la cuenta, y con el filtro de
          programadas puesto —cuando media lista son previsiones— había que
          leerse el subtexto entero de cada fila para saber cuál era una previsión
          y cuál no. Arriba, a la altura del título, se ve de un barrido.
        */}
        <div className="tx-title tx-title-con-marca">
          <span className="truncate">{title}</span>
          {/* El mismo calendario que el botón que las trae a la lista: la
              marca de la fila y el mando que la enciende hablan de lo mismo, y
              con dos dibujos distintos no se ve que están relacionados. */}
          <span className="pill">
            <Icon name="calendar" size={11} />
            Programado
          </span>
        </div>
        {/* Sin nota y siendo un traspaso no queda nada que poner debajo: el
            renglón vacío separaba el título del siguiente por nada. */}
        {(detail || !isTransfer) && (
          <div className="tx-sub">
            {detail && <span className="truncate">{detail}</span>}
            {!isTransfer && (
              <span>
                {detail ? '· ' : ''}
                {row.accountName}
              </span>
            )}
          </div>
        )}
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

function TransactionRow({
  row,
  onActivate,
  family,
  linkedTo,
  active,
  onFamily,
  onMenu,
  marcada,
  arrastrable,
  arrastrando,
  destino,
  nested,
  lastChild
}: {
  row: TransactionView
  /** Abre su ficha: con el clic, con Intro o con la barra espaciadora. */
  onActivate?: () => void
  /** Id del gasto que encabeza la familia gasto + devoluciones, si la hay. */
  family?: number
  /** El otro movimiento del enlace, para poder nombrarlo en el título emergente. */
  linkedTo?: TransactionView
  /** La familia está señalada ahora mismo (el ratón está sobre alguno de sus miembros). */
  active?: boolean
  onFamily?: (family: number | null) => void
  /** Clic derecho: dónde se ha pulsado, para sacar el menú ahí mismo. */
  onMenu?: (x: number, y: number) => void
  /** Su menú está abierto: se queda encendida para saber sobre cuál se pulsó. */
  marcada?: boolean
  /** Se puede recolocar dentro de su día. */
  arrastrable?: boolean
  /** Es la que se está arrastrando ahora mismo. */
  arrastrando?: boolean
  /** El puntero está encima de ella con algo agarrado: aquí caería. */
  destino?: boolean
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

  const muestraCuenta = !isTransfer && row.type !== 'refund'

  return (
    <div
      className={[
        'tx-row',
        marcada ? 'marcada' : '',
        arrastrando ? 'arrastrando' : '',
        destino ? 'destino' : '',
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
      title={linkTitle}
      /*
       * Quién es y de qué día, escrito en la propia fila.
       *
       * El gesto de recolocar vive arriba, en la lista entera, y averigua qué
       * hay debajo del puntero preguntándole al documento. Estos dos datos son
       * lo que lee: sin ellos tendría que mantener un mapa de nodos a
       * movimientos y volver a rehacerlo en cada repintado.
       */
      data-tx-id={row.id}
      data-tx-date={row.date}
      data-arrastrable={arrastrable ? 'si' : undefined}
      onMouseEnter={() => family !== undefined && onFamily?.(family)}
      onMouseLeave={() => family !== undefined && onFamily?.(null)}
      onClick={() => onActivate?.()}
      onContextMenu={(event) => {
        if (!onMenu) return
        // Fuera el menú de Chromium, que aquí no pinta nada: no hay texto que
        // copiar ni imagen que guardar, y taparía el propio.
        event.preventDefault()
        onMenu(event.clientX, event.clientY)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onActivate?.()
      }}
      onFocus={() => family !== undefined && onFamily?.(family)}
      onBlur={() => family !== undefined && onFamily?.(null)}
    >
      {/* En un traspaso el título ya nombra las dos cuentas, y un reembolso cuelga
          de su gasto, que la dice justo encima: repetirla era llenar la línea de
          la misma palabra tres veces. */}
      <Avatar
        icon={isTransfer ? 'transfer' : (row.categoryIcon ?? 'tag')}
        color={isTransfer ? '#0A84FF' : (row.categoryColor ?? '#8E8E93')}
      />
      <div className="tx-main">
        <div className="tx-title">{title}</div>
        <div className="tx-sub">
          {row.type === 'refund' && <span className="pill reembolso">Reembolso</span>}
          {detail && <span className="tx-note">{detail}</span>}
          {detail && muestraCuenta && <span>·</span>}
          {muestraCuenta && <span>{row.accountName}</span>}
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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { pushNotificationIcons } from './notificationIcons'
import { recordarTema } from './tema'
import { today, startOfMonth, endOfMonth } from '@shared/dates'
import type { AccountWithBalance, Category, Settings, TxType } from '@shared/types'
import type { RangoId } from '@shared/rangos'

const api = window.bonk

interface Toast {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
}

/**
 * Cómo se está mirando la lista de movimientos ahora mismo.
 *
 * Vive aquí y no dentro de la pantalla porque la pantalla se desmonta al cambiar
 * de pestaña: volvías de Informes y la lista había olvidado el periodo, las
 * cuentas y lo que estabas buscando. Y vive en memoria y no en los ajustes
 * porque un filtro no es una preferencia: al cerrar la aplicación se va, y la
 * próxima vez se abre limpia. El de programados estaba en los ajustes y seguía
 * puesto días después sin que nadie lo hubiera vuelto a pedir.
 */
export interface FiltrosMovimientos {
  range: RangoId
  customFrom: string
  customTo: string
  search: string
  types: TxType[]
  /**
   * `null` es «todavía nadie ha tocado esto», y entonces se elige la cuenta
   * principal. Una lista vacía es «ninguna», que es una respuesta distinta y la
   * lista la respeta enseñándose vacía.
   */
  accountIds: number[] | null
  categoryIds: number[]
  uncategorized: boolean
  /** Añadir a la lista las programadas que aún no han pasado. */
  programados: boolean
}

function filtrosIniciales(): FiltrosMovimientos {
  return {
    range: 'month',
    customFrom: startOfMonth(today()),
    customTo: endOfMonth(today()),
    search: '',
    types: [],
    accountIds: null,
    categoryIds: [],
    uncategorized: false,
    programados: false
  }
}

interface StoreValue {
  ready: boolean
  settings: Settings
  accounts: AccountWithBalance[]
  categories: Category[]
  /** Se incrementa en cada cambio de datos; las vistas lo usan para recargar. */
  revision: number
  /**
   * La cuenta que se está mirando en Movimientos, cuando hay una sola elegida.
   *
   * Vive aquí porque quien la elige —la lista— y quien la necesita —el
   * formulario de un movimiento nuevo, que lo abre la cabecera— no se conocen
   * entre sí.
   */
  focusedAccountId: number | null
  setFocusedAccountId: (id: number | null) => void
  filtros: FiltrosMovimientos
  /** Cambia lo que se le diga y deja el resto como estaba. */
  ponFiltros: (patch: Partial<FiltrosMovimientos>) => void
  refresh: () => Promise<void>
  refreshCatalogues: () => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  toast: (message: string, tone?: Toast['tone']) => void
  toasts: Toast[]
  dismissToast: (id: number) => void
  /** Envuelve una acción para que cualquier fallo acabe en un aviso y no en pantalla en blanco. */
  run: <T>(action: () => Promise<T>, successMessage?: string) => Promise<T | null>
  /**
   * Manejador de errores para las cargas de datos: `.catch(fail('los movimientos'))`.
   * Sin esto, un fallo de la base dejaba la vista vacía sin decir por qué.
   */
  fail: (what: string) => (error: unknown) => void
}

const StoreContext = createContext<StoreValue | null>(null)

const FALLBACK_SETTINGS: Settings = {
  baseCurrency: 'EUR',
  theme: 'system',
  palette: 'grafito',
  startOfWeek: 'monday',
  startWithWindows: false,
  closeToTray: false,
  remindersEnabled: false,
  balanceEn: 'porcentaje',
  widgetVisible: true,
  widgetAnchor: 'bottomRight',
  widgetX: 0,
  widgetY: 0,
  widgetOpacity: 0.92,
  widgetOnTop: false,
  widgetBlur: false,
  widgetAccountIds: [],
  lastMonthlySummary: null,
  lastBackupAt: null
}

/** Ajustes que solo cambian cómo se ve algo, no lo que dicen los datos. */
const SOLO_ASPECTO: Array<keyof Settings> = ['theme', 'palette', 'balanceEn']

export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<Settings>(FALLBACK_SETTINGS)
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [revision, setRevision] = useState(0)
  const [focusedAccountId, setFocusedAccountId] = useState<number | null>(null)
  const [filtros, setFiltros] = useState<FiltrosMovimientos>(filtrosIniciales)

  const ponFiltros = useCallback((patch: Partial<FiltrosMovimientos>) => {
    setFiltros((actual) => ({ ...actual, ...patch }))
  }, [])
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = ++toastId.current
      setToasts((current) => [...current, { id, message, tone }])
      window.setTimeout(() => dismissToast(id), tone === 'error' ? 6500 : 3500)
    },
    [dismissToast]
  )

  const refreshCatalogues = useCallback(async () => {
    const [nextAccounts, nextCategories, nextGoals] = await Promise.all([
      api.accounts.withBalance(),
      api.categories.list(),
      api.goals.list()
    ])
    setAccounts(nextAccounts)
    setCategories(nextCategories)
    // Cada aviso enseña la cara de lo que cuenta —la categoría del recibo, la
    // cuenta que se queda sin fondo, el hito conseguido— y dibujarlas solo se
    // puede aquí: el proceso principal no tiene con qué rasterizar.
    pushNotificationIcons(nextCategories, nextAccounts, nextGoals).catch(() => undefined)
  }, [])

  const refresh = useCallback(async () => {
    // La revisión sube antes de esperar: así la lista y los catálogos viajan a la
    // vez en lugar de encadenar dos idas y vueltas al proceso principal.
    setRevision((value) => value + 1)
    await refreshCatalogues()
  }, [refreshCatalogues])

  const run = useCallback(
    async <T,>(action: () => Promise<T>, successMessage?: string): Promise<T | null> => {
      try {
        const result = await action()
        await refresh()
        if (successMessage) toast(successMessage, 'success')
        return result
      } catch (error) {
        toast((error as Error).message, 'error')
        return null
      }
    },
    [refresh, toast]
  )

  const fail = useCallback(
    (what: string) =>
      (error: unknown): void => {
        toast(`No se pudo cargar ${what}: ${(error as Error).message}`, 'error')
      },
    [toast]
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      try {
        const next = await api.settings.update(patch)
        setSettings(next)
        /*
         * Solo se invalidan los datos cuando el ajuste puede cambiarlos.
         *
         * `revision` es lo que hace a cada pantalla volver a preguntar, y
         * cambiar de tema o de unidad no cambia ni un dato: Informes se
         * recargaba entero al pulsar «%» o «€», la pantalla se quedaba en blanco
         * un momento y volvía. La lista de los que no tocan nada es corta y
         * equivocarse en ella solo cuesta una recarga de más, que es justo lo
         * que se hacía siempre.
         */
        const soloAspecto = Object.keys(patch).every((clave) =>
          SOLO_ASPECTO.includes(clave as keyof Settings)
        )
        if (!soloAspecto) setRevision((value) => value + 1)
      } catch (error) {
        toast((error as Error).message, 'error')
      }
    },
    [toast]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const loaded = await api.settings.get()
        if (cancelled) return
        setSettings(loaded)
        await refreshCatalogues()
      } catch (error) {
        toast(`No se pudieron cargar los datos: ${(error as Error).message}`, 'error')
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshCatalogues, toast])

  /*
   * El tema del sistema se sigue en vivo mientras esté en modo automático.
   *
   * No se toca nada hasta que los ajustes de verdad han llegado. Antes de eso lo
   * puesto es lo que dejó `aplicarTemaGuardado` al arrancar, que ya acertó; si
   * este efecto corriera con los ajustes de fábrica pisaría ese acierto con un
   * «automático» que puede no ser lo que el usuario tiene elegido, y volvería el
   * cambiazo que se ha venido a quitar.
   */
  useEffect(() => {
    if (!ready) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches)
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [ready, settings.theme])

  // La paleta vive en el elemento raíz, junto al claro/oscuro: cada combinación
  // de los dos tiene su juego de variables en la hoja de estilos.
  useEffect(() => {
    if (!ready) return
    document.documentElement.setAttribute('data-palette', settings.palette)
  }, [ready, settings.palette])

  // Y se apunta para el próximo arranque, que es de donde sale el tema antes de
  // que haya nada que preguntar.
  useEffect(() => {
    if (!ready) return
    recordarTema(settings.theme, settings.palette)
  }, [ready, settings.theme, settings.palette])

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      settings,
      accounts,
      categories,
      revision,
      focusedAccountId,
      setFocusedAccountId,
      filtros,
      ponFiltros,
      refresh,
      refreshCatalogues,
      updateSettings,
      toast,
      toasts,
      dismissToast,
      run,
      fail
    }),
    [
      ready,
      settings,
      accounts,
      categories,
      revision,
      focusedAccountId,
      filtros,
      ponFiltros,
      refresh,
      refreshCatalogues,
      updateSettings,
      toast,
      toasts,
      dismissToast,
      run,
      fail
    ]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore se ha usado fuera de StoreProvider')
  return value
}

/**
 * Cuenta que viene marcada al abrir un formulario: la principal si sigue activa,
 * y si no la primera de la lista.
 */
/**
 * La cuenta que viene marcada al registrar algo.
 *
 * La lista llega ya ordenada con las principales de cada tipo delante y por
 * orden de tipo —el banco antes que la hucha—, así que la primera es la buena.
 */
export function usePreferredAccountId(): number {
  const { accounts } = useStore()
  return accounts[0]?.id ?? 0
}

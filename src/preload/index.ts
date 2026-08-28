import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AccountWithBalance,
  Attachment,
  Goal,
  GoalProgress,
  Category,
  CategoryKind,
  CategoryTotal,
  MonthlyPoint,
  ProjectedTransaction,
  DebtAdjust,
  DebtProgress,
  Frequency,
  ScheduledView,
  EstadoActualizacion,
  Settings,
  TransactionFilter,
  TransactionInput,
  TransactionView,
  FilterTotals
} from '@shared/types'


interface Envelope<T> {
  ok: boolean
  data?: T
  error?: string
}

/** Desempaqueta la respuesta del proceso principal y convierte el fallo en una excepción normal. */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = (await ipcRenderer.invoke(channel, ...args)) as Envelope<T>
  if (!response?.ok) throw new Error(response?.error ?? 'Error desconocido')
  return response.data as T
}

const api = {
  settings: {
    get: () => call<Settings>('settings:get'),
    update: (patch: Partial<Settings>) => call<Settings>('settings:update', patch)
  },
  accounts: {
    list: (includeArchived = false) => call<Account[]>('accounts:list', includeArchived),
    withBalance: (includeArchived = false) => call<AccountWithBalance[]>('accounts:withBalance', includeArchived),
    save: (input: unknown) => call<Account>('accounts:save', input),
    setPrimary: (id: number, primary: boolean) =>
      call<void>('accounts:setPrimary', id, primary),
    remove: (id: number) => call<void>('accounts:delete', id),
    countTransactions: (id: number) => call<number>('accounts:count', id),
    reorder: (ids: number[]) => call<void>('accounts:reorder', ids)
  },
  categories: {
    list: (includeArchived = false) => call<Category[]>('categories:list', includeArchived),
    save: (input: unknown) => call<Category>('categories:save', input),
    remove: (id: number) => call<void>('categories:delete', id),
    countTransactions: (id: number) => call<number>('categories:count', id)
  },
  transactions: {
    list: (filter: TransactionFilter = {}) => call<TransactionView[]>('tx:list', filter),
    count: (filter: TransactionFilter = {}) => call<number>('tx:count', filter),
    totals: (filter: TransactionFilter = {}) => call<FilterTotals>('tx:totals', filter),
    get: (id: number) => call<TransactionView | null>('tx:get', id),
    save: (input: TransactionInput) => call<TransactionView>('tx:save', input),
    /**
     * Lo mismo, pero para una fecha que todavía no ha llegado: en vez de un
     * movimiento sale una programada, y el movimiento de partida —si lo había—
     * se va con ella.
     */
    program: (
      input: TransactionInput & {
        cadencia?: { freq: Frequency; interval: number; endDate?: string | null } | null
        isDebt?: boolean
        lender?: string | null
      }
    ) => call<ScheduledView>('tx:program', input),
    remove: (id: number) => call<void>('tx:delete', id),
    setCategory: (ids: number[], categoryId: number | null) =>
      call<number>('tx:bulkCategory', ids, categoryId),
    /** Recoloca los movimientos de un día: los ids en el orden que han de quedar. */
    reorder: (ids: number[]) => call<number>('tx:reorder', ids),
    /** Cambia un movimiento de día y deja el día de destino en ese orden. */
    moveToDay: (id: number, date: string, orden: number[]) =>
      call<number>('tx:moveToDay', id, date, orden),
    duplicate: (id: number) => call<TransactionView>('tx:duplicate', id),
    refundsFor: (id: number) => call<TransactionView[]>('tx:refundsFor', id),
    refundCandidates: (date: string, excludeId?: number, linkedId?: number) =>
      call<TransactionView[]>('tx:refundCandidates', date, excludeId, linkedId)
  },
  goals: {
    list: () => call<Goal[]>('goals:list'),
    progress: (reference?: string) => call<GoalProgress[]>('goals:progress', reference),
    reserve: (entries: Array<{ id: number; amount: number }>) => call<number>('goals:reserve', entries),
    save: (input: unknown) => call<Goal>('goals:save', input),
    remove: (id: number) => call<void>('goals:delete', id),
    setAchieved: (id: number, achieved: boolean) => call<Goal>('goals:achieved', id, achieved)
  },
  scheduled: {
    list: () => call<ScheduledView[]>('scheduled:list'),
    save: (input: unknown) => call<ScheduledView>('scheduled:save', input),
    remove: (id: number) => call<void>('scheduled:delete', id),
    setActive: (id: number, active: boolean) => call<void>('scheduled:setActive', id, active),
    resume: (id: number, endDate: string | null = null) =>
      call<void>('scheduled:resume', id, endDate),
    postNow: (id: number) => call<void>('scheduled:postNow', id),
    /** Paga de una vez lo que falte de una deuda y la da por saldada. */
    settleDebt: (id: number) => call<{ amount: number }>('scheduled:settleDebt', id),
    postDue: () => call<number>('scheduled:postDue'),
    debts: () => call<DebtProgress[]>('scheduled:debts'),
    adjustDebt: (id: number, patch: DebtAdjust) =>
      call<void>('scheduled:adjustDebt', id, patch),
    /** Cambiarle la categoría sin tocar nada más de la programación. */
    setCategory: (id: number, categoryId: number | null) =>
      call<void>('scheduled:setCategory', id, categoryId),
    project: (from: string, to: string) => call<ProjectedTransaction[]>('scheduled:project', from, to)
  },
  reports: {
    categories: (from: string, to: string, kind: CategoryKind = 'expense') =>
      call<CategoryTotal[]>('reports:categories', from, to, kind),
    monthly: (months = 12) => call<MonthlyPoint[]>('reports:monthly', months),
    span: () => call<{ from: string; to: string } | null>('reports:span')
  },
  attachments: {
    list: (transactionId: number) => call<Attachment[]>('attachments:list', transactionId),
    pick: () => call<Array<{ path: string; name: string }>>('attachments:pick'),
    attach: (transactionId: number, paths: string[]) =>
      call<Attachment[]>('attachments:attach', transactionId, paths),
    remove: (id: number) => call<void>('attachments:delete', id),
    data: (id: number) => call<string | null>('attachments:data', id),
    open: (id: number) => call<string>('attachments:open', id)
  },
  informe: {
    /** El informe del periodo en PDF. `null` si se cancela el diálogo. */
    exportPdf: (filter: TransactionFilter = {}) =>
      call<{ path: string; count: number } | null>('report:exportPdf', filter)
  },
  widget: {
    /** Estira la ventana a lo que mida su contenido, de alto y de ancho. */
    resize: (height: number, width: number) => call<void>('widget:resize', height, width),
    /** Trae la ventana principal al frente. */
    open: () => call<void>('widget:open')
  },
  // Solo de entrada: los extractos del banco llegan en CSV. Lo que sale de
  // BONK sale en PDF, que es lo que se archiva y se lee.
  csv: {
    pick: () =>
      call<{
        path: string
        preview: { delimiter: string; headers: string[]; rows: string[][]; total: number }
      } | null>('csv:pick'),
    importFile: (
      path: string,
      options: { createMissing?: boolean; defaultAccountId?: number; allowDuplicates?: boolean } = {}
    ) =>
      call<{
        imported: number
        skipped: number
        /** Filas que ya estaban apuntadas y no se han vuelto a meter. */
        duplicates: number
        createdAccounts: string[]
        createdCategories: string[]
        errors: string[]
      }>('csv:import', path, options)
  },
  events: {
    /** Suscribe la interfaz a las órdenes del menú nativo. Devuelve la función para desuscribirse. */
    on: (
      channel:
        | 'menu:new-transaction'
        | 'menu:backup-done'
        | 'data:changed'
        | 'scheduled:failed'
        | 'debt:settled'
        | 'goal:reached'
        // Cada paso del actualizador: encontrada, descargando, lista.
        | 'updates:changed'
        // Solo le llega al widget: es como se entera de que ha cambiado la
        // paleta, el tema o qué cuentas tiene que enseñar.
        | 'settings:changed',
      callback: (detail?: unknown) => void
    ) => {
      const listener = (_event: unknown, detail?: unknown): void => callback(detail)
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    }
  },
  db: {
    info: () =>
      call<{ dataDir: string; dbPath: string; version: string; electron: string; node: string }>('db:info'),
    backup: () => call<string>('db:backup'),
    openFolder: () => call<string>('db:openFolder'),
    clearTransactions: () => call<number>('db:clearTransactions'),
    pruneAttachments: () => call<number>('db:pruneAttachments')
  },
  updates: {
    estado: () => call<EstadoActualizacion>('updates:estado'),
    buscar: () => call<EstadoActualizacion>('updates:buscar'),
    /** Arranca la descarga. Devuelve false si no había ninguna esperando. */
    descargar: () => call<boolean>('updates:descargar'),
    /** Cierra y vuelve a abrir ya actualizada. Devuelve false si no había nada listo. */
    instalar: () => call<boolean>('updates:instalar')
  },
  notifications: {
    test: () => call<boolean>('notifications:test'),
    setIcons: (icons: Record<number, string>) => call<void>('notifications:icons', icons)
  }
}

export type BonkApi = typeof api

// El renderer corre aislado: solo ve este objeto, nunca Node ni Electron directamente.
contextBridge.exposeInMainWorld('bonk', api)

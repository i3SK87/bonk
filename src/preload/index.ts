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
  ScheduledView,
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
    remove: (id: number) => call<void>('tx:delete', id),
    removeMany: (ids: number[]) => call<number>('tx:deleteMany', ids),
    setCategory: (ids: number[], categoryId: number | null) =>
      call<number>('tx:bulkCategory', ids, categoryId),
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
  csv: {
    exportTransactions: (filter: TransactionFilter = {}) =>
      call<{ path: string; count: number } | null>('csv:export', filter),
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
        | 'goal:reached',
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
  notifications: {
    test: () => call<boolean>('notifications:test'),
    setIcons: (icons: Record<number, string>) => call<void>('notifications:icons', icons)
  }
}

export type BonkApi = typeof api

// El renderer corre aislado: solo ve este objeto, nunca Node ni Electron directamente.
contextBridge.exposeInMainWorld('bonk', api)

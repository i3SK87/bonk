import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron'
import { basename } from 'node:path'
import { getDataDir, dbPath, makeBackup } from './db'
import * as settings from './repos/settings'
import * as accounts from './repos/accounts'
import * as categories from './repos/categories'
import * as transactions from './repos/transactions'
import * as goals from './repos/goals'
import * as scheduled from './repos/scheduled'
import * as reports from './repos/reports'
import * as attachments from './repos/attachments'
import * as csv from './repos/csv'
import { applyAutoLaunch } from './autostart'
import {
  sendTestNotification,
  setCategoryIcons,
  announceSettlements,
  announceGoals,
  checkLowBalance
} from './reminders'
import type { TransactionFilter, CategoryKind, Settings } from '@shared/types'

/**
 * Envuelve cada manejador para que un error del proceso principal llegue a la
 * interfaz como un mensaje legible en vez de como un "Error invoking remote method".
 */
function handle(channel: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await (fn as (...a: unknown[]) => unknown)(...args) }
    } catch (error) {
      return { ok: false, error: (error as Error).message ?? 'Error inesperado' }
    }
  })
}

export function registerIpc(
  getWindow: () => BrowserWindow | null,
  notifications: { icon: string; onClick: () => void }
): void {
  /**
   * Lo que haya que celebrar, en el mismo gesto que lo provoca.
   *
   * El repaso de fondo pasa cada media hora, pero apartar el dinero que faltaba
   * y no ver nada hasta media hora después no es celebrar nada. Y como aquí ya
   * queda marcado, el repaso tampoco lo repetiría luego.
   */
  function celebrate(): void {
    const settled = announceSettlements(notifications.icon, notifications.onClick)
    if (settled.length > 0) getWindow()?.webContents.send('debt:settled', settled)
    const reached = announceGoals(notifications.icon, notifications.onClick)
    if (reached.length > 0) getWindow()?.webContents.send('goal:reached', reached)
    // No es una celebración, pero se entera en el mismo momento y por el mismo
    // camino: acabas de mover dinero y la cuenta del día a día se ha quedado corta.
    checkLowBalance(notifications.icon, notifications.onClick)
  }

  // — Ajustes —
  handle('settings:get', () => settings.getSettings())
  handle('settings:update', (patch: Partial<Settings>) => {
    const next = settings.updateSettings(patch)
    // El arranque con Windows no vive en la base de datos sino en el registro:
    // hay que escribirlo aparte cada vez que se toca la casilla.
    if ('startWithWindows' in patch) applyAutoLaunch(next.startWithWindows)
    return next
  })

  // — Cuentas —
  handle('accounts:list', (includeArchived: boolean) => accounts.listAccounts(includeArchived))
  handle('accounts:withBalance', (includeArchived: boolean) => accounts.listAccountsWithBalance(includeArchived))
  handle('accounts:save', (input) => accounts.saveAccount(input))
  handle('accounts:setPrimary', (id: number, primary: boolean) =>
    accounts.setPrimaryAccount(id, primary)
  )
  handle('accounts:delete', (id: number) => accounts.deleteAccount(id))
  handle('accounts:count', (id: number) => accounts.countAccountTransactions(id))
  handle('accounts:reorder', (ids: number[]) => accounts.reorderAccounts(ids))

  // — Categorías —
  handle('categories:list', (includeArchived: boolean) => categories.listCategories(includeArchived))
  handle('categories:save', (input) => categories.saveCategory(input))
  handle('categories:delete', (id: number) => categories.deleteCategory(id))
  handle('categories:count', (id: number) => categories.countCategoryTransactions(id))

  // — Movimientos —
  handle('tx:list', (filter: TransactionFilter) => transactions.listTransactions(filter))
  handle('tx:count', (filter: TransactionFilter) => transactions.countTransactions(filter))
  handle('tx:get', (id: number) => transactions.getTransaction(id))
  handle('tx:save', (input) => {
    const saved = transactions.saveTransaction(input)
    // Apartar dinero en la hucha puede ser justo lo que cierra un hito.
    celebrate()
    return saved
  })
  // Borrar también cuenta: el dinero que sostenía un hito puede irse por aquí
  // igual que por un traspaso, y entonces la enhorabuena tiene que volver a
  // poder ganarse.
  handle('tx:delete', (id: number) => {
    transactions.deleteTransaction(id)
    celebrate()
  })
  handle('tx:deleteMany', (ids: number[]) => {
    const count = transactions.deleteTransactions(ids)
    celebrate()
    return count
  })
  handle('tx:bulkCategory', (ids: number[], categoryId: number | null) =>
    transactions.bulkSetCategory(ids, categoryId)
  )
  handle('tx:duplicate', (id: number) => transactions.duplicateTransaction(id))
  handle('tx:refundsFor', (id: number) => transactions.listRefundsFor(id))
  handle('tx:refundCandidates', (date: string, excludeId?: number, linkedId?: number) =>
    transactions.refundCandidates(date, excludeId, linkedId)
  )

  // — Presupuestos —
  handle('goals:list', () => goals.listGoals())
  handle('goals:progress', (reference: string | undefined) => goals.goalProgress(reference))
  handle('goals:save', (input) => {
    const saved = goals.saveGoal(input)
    // Bajar la meta de un hito puede dejarlo conseguido al momento.
    celebrate()
    return saved
  })
  handle('goals:delete', (id: number) => goals.deleteGoal(id))
  handle('goals:achieved', (id: number, achieved: boolean) => goals.setGoalAchieved(id, achieved))
  // Devuelve cuántos ha tocado y no nada: la ventana necesita algo con lo que
  // distinguir el guardado bueno del que se quedó por el camino.
  handle('goals:reserve', (entries: Array<{ id: number; amount: number }>) => {
    goals.setGoalReserves(entries)
    // Llevar el mando hasta el final es el gesto que cumple un plan, así que es
    // aquí donde toca la enhorabuena. Y al revés: bajarlo la vuelve a armar.
    celebrate()
    return entries.length
  })

  // — Programadas —
  handle('scheduled:list', () => scheduled.listScheduled())
  handle('scheduled:save', (input) => scheduled.saveScheduled(input))
  handle('scheduled:delete', (id: number) => scheduled.deleteScheduled(id))
  handle('scheduled:setActive', (id: number, active: boolean) => scheduled.setScheduledActive(id, active))
  // Finalizar a mano no espera al repaso de media hora: la enhorabuena sale en
  // el mismo gesto, y de paso el aviso de Windows.
  handle('scheduled:finish', (id: number) => {
    scheduled.finishScheduled(id)
    celebrate()
  })
  handle('scheduled:postNow', (id: number) => scheduled.postNow(id))
  handle('scheduled:postDue', () => scheduled.postDue())
  handle('scheduled:project', (from: string, to: string) => scheduled.projectUpcoming(from, to))

  // — Informes —
  handle('reports:categories', (from: string, to: string, kind: CategoryKind) =>
    reports.categoryTotals(from, to, kind)
  )
  handle('reports:monthly', (months: number) => reports.monthlySeries(months))
  handle('reports:span', () => reports.transactionsSpan())

  // — Adjuntos —
  handle('attachments:list', (transactionId: number) => attachments.listAttachments(transactionId))
  handle('attachments:delete', (id: number) => attachments.deleteAttachment(id))
  handle('attachments:data', (id: number) => attachments.readAttachmentData(id))
  handle('attachments:open', (id: number) => {
    const path = attachments.attachmentPath(id)
    if (!path) throw new Error('El archivo adjunto ya no está en el disco')
    return shell.openPath(path)
  })
  // Elegir el archivo y adjuntarlo son dos pasos separados porque un movimiento
  // nuevo todavía no tiene id: se escoge la factura mientras se rellena el
  // formulario y se copia en cuanto el movimiento existe.
  handle('attachments:pick', async () => {
    const window = getWindow()
    if (!window) throw new Error('No hay ventana activa')
    const result = await dialog.showOpenDialog(window, {
      title: 'Subir factura',
      buttonLabel: 'Subir',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Imágenes y PDF', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    })
    if (result.canceled) return []
    return result.filePaths.map((path) => ({ path, name: basename(path) }))
  })

  handle('attachments:attach', (transactionId: number, paths: string[]) =>
    paths.map((path) => attachments.addAttachment(transactionId, path))
  )

  // — CSV —
  handle('csv:export', async (filter: TransactionFilter) => {
    const window = getWindow()
    if (!window) throw new Error('No hay ventana activa')
    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog(window, {
      title: 'Exportar movimientos',
      defaultPath: `movimientos-${stamp}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return null
    const count = csv.exportCsv(result.filePath, filter)
    return { path: result.filePath, count }
  })
  handle('csv:pick', async () => {
    const window = getWindow()
    if (!window) throw new Error('No hay ventana activa')
    const result = await dialog.showOpenDialog(window, {
      title: 'Importar movimientos',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return { path: result.filePaths[0], preview: csv.previewCsv(result.filePaths[0]) }
  })
  handle('csv:import', (path: string, options) => csv.importCsv(path, options))

  // — Base de datos y mantenimiento —
  handle('db:info', () => ({
    dataDir: getDataDir(),
    dbPath: dbPath(),
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node
  }))
  handle('db:backup', () => {
    const path = makeBackup()
    settings.setSetting('lastBackupAt', new Date().toISOString())
    return path
  })
  handle('db:openFolder', () => shell.openPath(getDataDir()))

  // — Avisos —
  // Que Windows deje pasar una notificación depende de ajustes que están fuera
  // de la aplicación, así que hay un botón para verlo en vez de adivinarlo.
  handle('notifications:test', () => sendTestNotification(notifications.icon, notifications.onClick))
  // La ventana dibuja los iconos de las categorías y los deja aquí: en el
  // proceso principal no hay con qué rasterizar un SVG.
  handle('notifications:icons', (icons: Record<string, string>) => setCategoryIcons(icons))
  handle('db:clearTransactions', () => csv.clearTransactions())
  handle('db:pruneAttachments', () => attachments.pruneOrphanAttachments())
}

import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron'
import { basename } from 'node:path'
import { writeFileSync } from 'node:fs'
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
import { construirInformeHtml } from './repos/informe'
import { widgetWindow, colocarWidget } from './widget'
import { applyAutoLaunch } from './autostart'
import {
  buscarActualizacion,
  descargarActualizacion,
  estadoActualizacion,
  instalarActualizacion
} from './updates'
import {
  sendTestNotification,
  setCategoryIcons,
  announceSettlements,
  announceGoals,
  checkLowBalance
} from './reminders'
import type { TransactionFilter, CategoryKind, Settings, DebtAdjust } from '@shared/types'

/**
 * Los canales que solo preguntan.
 *
 * Se listan los que leen y no los que escriben a propósito: si un día se añade
 * uno que escribe y se olvida apuntarlo, el widget se refresca de más —que no
 * cuesta nada— en vez de quedarse contando un patrimonio viejo, que es un fallo
 * que nadie ve hasta que se fía de la cifra.
 */
const SOLO_LEEN = new Set([
  'settings:get',
  'accounts:list',
  'accounts:withBalance',
  'accounts:count',
  'categories:list',
  'categories:count',
  'tx:list',
  'tx:count',
  'tx:totals',
  'tx:get',
  'tx:refundsFor',
  'tx:refundCandidates',
  'goals:list',
  'goals:progress',
  'scheduled:list',
  'scheduled:debts',
  'scheduled:project',
  'reports:categories',
  'reports:monthly',
  'reports:span',
  'attachments:list',
  'attachments:open',
  'attachments:pick',
  'attachments:data',
  'csv:pick',
  'updates:estado',
  // Preguntar por una versión nueva no toca ni un dato: el widget no tiene de
  // qué enterarse.
  'updates:buscar',
  'db:info',
  'db:openFolder',
  'widget:resize',
  'widget:open'
])

/**
 * Los que escriben pero no mueven dinero.
 *
 * `data:changed` no quiere decir «algo ha cambiado» sino «se ha movido dinero»:
 * el widget lo usa para contar la cifra desde la que tenía hasta la nueva.
 * Guardar un ajuste no mueve nada —marcar otra cuenta en las opciones del
 * widget solo cambia qué se enseña—, así que ese aviso mentía y la cifra se
 * ponía a contar por un cambio que no era de dinero.
 *
 * Enterarse sí tiene que enterarse, y de eso ya se encarga `settings:changed`,
 * que el widget atiende recargando en silencio.
 */
const AVISAN_APARTE = new Set(['settings:update'])

/** El aviso al widget se agrupa: guardar algo dispara varias llamadas seguidas. */
let avisoPendiente: NodeJS.Timeout | null = null
function avisarAlWidget(): void {
  if (avisoPendiente) return
  avisoPendiente = setTimeout(() => {
    avisoPendiente = null
    widgetWindow()?.webContents.send('data:changed')
  }, 120)
}

/**
 * Envuelve cada manejador para que un error del proceso principal llegue a la
 * interfaz como un mensaje legible en vez de como un "Error invoking remote method".
 */
function handle(channel: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await (fn as (...a: unknown[]) => unknown)(...args)
      /*
       * El widget es otra ventana y no se entera de nada por su cuenta.
       *
       * La aplicación se refresca sola porque quien guarda es ella; el widget
       * solo sabe lo que se le cuenta, y sin esto seguía enseñando el saldo de
       * antes hasta el siguiente repaso de fondo, media hora después.
       */
      if (!SOLO_LEEN.has(channel) && !AVISAN_APARTE.has(channel)) avisarAlWidget()
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: (error as Error).message ?? 'Error inesperado' }
    }
  })
}

export function registerIpc(
  getWindow: () => BrowserWindow | null,
  notifications: { icon: string; onClick: () => void },
  /** Enciende, apaga o recoloca el widget según los ajustes de ahora mismo. */
  refrescarWidget: () => void
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
    /*
     * El widget es una ventana, no un trozo de pantalla: los ajustes que le
     * tocan hay que aplicárselos a mano. Y los demás también le llegan —la
     * paleta y el tema los pinta él—, así que se le avisa de todos.
     */
    if (Object.keys(patch).some((clave) => clave.startsWith('widget'))) refrescarWidget()
    widgetWindow()?.webContents.send('settings:changed', next)
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
  // Los totales los suma la base de datos: la lista viene con tope y sumar lo
  // cargado daba cifras de menos en cuanto el periodo pasaba de doscientos.
  handle('tx:totals', (filter: TransactionFilter) => transactions.totalsForFilter(filter))
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
  handle('tx:bulkCategory', (ids: number[], categoryId: number | null) =>
    transactions.bulkSetCategory(ids, categoryId)
  )
  handle('tx:reorder', (ids: number[]) => transactions.reorderTransactions(ids))
  handle('tx:moveToDay', (id: number, date: string, orden: number[]) =>
    transactions.moveTransactionToDay(id, date, orden)
  )
  /*
   * Lo que se apunta con fecha por delante nace programado.
   *
   * La ficha manda aquí lo mismo que mandaría a `tx:save`, y este es el único
   * sitio que lo desvía: la importación de un CSV y las propias programadas al
   * registrarse escriben por su cuenta, y ahí una fecha futura es un dato, no
   * una intención.
   */
  handle('tx:program', (input: scheduled.FromTransactionInput) => {
    const programada = scheduled.scheduleFromTransaction(input)
    // Al mudar al futuro un movimiento que ya existía, el dinero que sostenía
    // una reserva vuelve a estar libre, y eso puede deshacer un hito cumplido.
    celebrate()
    return programada
  })
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
  handle('scheduled:resume', (id: number, endDate: string | null) =>
    scheduled.resumeScheduled(id, endDate)
  )
  // Registrar a mano tampoco espera al repaso: si esa era la última cuota, la
  // deuda queda saldada en ese mismo clic y hay que decirlo ahí, no media hora
  // después. Es justo el momento en que se está mirando.
  handle('scheduled:postNow', (id: number) => {
    const posted = scheduled.postNow(id)
    celebrate()
    return posted
  })
  // Saldarla de golpe también puede ser el último pago, así que la
  // enhorabuena se mira aquí igual que al registrar una cuota a mano.
  handle('scheduled:settleDebt', (id: number) => {
    const result = scheduled.settleDebtNow(id)
    celebrate()
    return result
  })
  handle('scheduled:postDue', () => {
    const posted = scheduled.postDue().created
    celebrate()
    return posted
  })
  handle('scheduled:project', (from: string, to: string) => scheduled.projectUpcoming(from, to))
  handle('scheduled:debts', () => scheduled.debtProgress())
  handle('scheduled:adjustDebt', (id: number, patch: DebtAdjust) =>
    scheduled.adjustDebt(id, patch)
  )
  handle('scheduled:setCategory', (id: number, categoryId: number | null) =>
    scheduled.setScheduledCategory(id, categoryId)
  )

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
  // — Informe en PDF —
  /*
   * Se imprime desde una ventana oculta.
   *
   * Electron ya trae `printToPDF`, así que el informe se escribe como una
   * página web normal y el propio motor la pagina. La alternativa era una
   * librería que compone PDF a mano, y en esta máquina no hay con qué compilar
   * nada nativo —ni falta, para un documento de tablas y texto—.
   *
   * La ventana va sin preload y sin integración de Node: solo tiene que pintar
   * un HTML que hemos escrito nosotros y morirse.
   */
  handle('report:exportPdf', async (filter: TransactionFilter) => {
    const window = getWindow()
    if (!window) throw new Error('No hay ventana activa')
    const hoy = new Date().toISOString().slice(0, 10)
    const desde = filter.from ?? hoy
    const hasta = filter.to ?? hoy
    const result = await dialog.showSaveDialog(window, {
      title: 'Exportar el informe',
      defaultPath: `movimientos-${desde}_${hasta}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null

    const filas = transactions.listTransactions({ ...filter, limit: 1_000_000 })
    const sumas = transactions.totalsForFilter(filter)
    const html = construirInformeHtml(filas, {
      from: desde,
      to: hasta,
      currency: settings.getSettings().baseCurrency,
      ingresos: sumas.income,
      gastos: sumas.expense,
      balance: sumas.net,
      generado: hoy
    })

    const impresora = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    })
    try {
      // Por `data:` y no por un archivo temporal: no deja nada que limpiar, y
      // un informe de mil filas sigue cabiendo de sobra en una URL.
      await impresora.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdf = await impresora.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        // A cero: los márgenes los pone la propia hoja con `@page`, para tenerlos
        // en un solo sitio y no repartidos entre el CSS y esta llamada.
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })
      writeFileSync(result.filePath, pdf)
    } finally {
      impresora.destroy()
    }
    return { path: result.filePath, count: filas.length }
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

  // — El widget del escritorio —
  /** Lo que mide su contenido: la ventana se estira a lo que haya que enseñar. */
  handle('widget:resize', (height: number, width: number) => colocarWidget(height, width))
  handle('widget:open', () => notifications.onClick())

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
  // — Actualizaciones —
  handle('updates:estado', () => estadoActualizacion())
  handle('updates:buscar', () => buscarActualizacion())
  handle('updates:descargar', () => descargarActualizacion())
  handle('updates:instalar', () => instalarActualizacion())

  handle('db:clearTransactions', () => csv.clearTransactions())
  handle('db:pruneAttachments', () => attachments.pruneOrphanAttachments())
}

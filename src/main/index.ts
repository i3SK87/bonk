import { app, shell, BrowserWindow, Menu, Tray, nativeTheme, nativeImage, screen } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase, closeDatabase, makeBackup } from './db'
import { registerIpc } from './ipc'
import { postDue } from './repos/scheduled'
import { getSettings, setSetting } from './repos/settings'
import { applyAutoLaunch, startedHidden } from './autostart'
import { startBackgroundWork } from './reminders'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** Distingue cerrar la ventana de salir de verdad: lo primero solo la esconde. */
let quitting = false

const isDev = !app.isPackaged

const iconPath = join(__dirname, '../../resources/icon.ico')

/** Identidad de la aplicación ante Windows: barra de tareas, inicio y avisos. */
const APP_ID = 'com.bonk.desktop'

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    // El mínimo es el ancho de un teléfono: por debajo de 680 px la interfaz se
    // reordena sola —el menú baja abajo y todo se apila— y sigue siendo usable.
    minWidth: 360,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14161a' : '#f5f6f8',
    title: 'BONK',
    // Sin esto, la ventana toma el icono del ejecutable que la lanza: al
    // arrancar con el motor de Electron salía su átomo en la barra de título.
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // El renderer no toca Node: todo pasa por el puente declarado en la precarga.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Al arrancar con Windows la ventana no se enseña: la aplicación se queda en
  // la bandeja, que es de donde se la llama cuando hace falta.
  mainWindow.on('ready-to-show', () => {
    if (!startedHidden()) mainWindow?.show()
  })

  // El aspa esconde en vez de cerrar cuando así se ha pedido. La aplicación
  // sigue viva en la bandeja y se sale desde su menú o desde Archivo ▸ Salir.
  mainWindow.on('close', (event) => {
    if (quitting || !getSettings().closeToTray) return
    event.preventDefault()
    mainWindow?.hide()
  })

  // Cualquier enlace externo se abre en el navegador, nunca dentro de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Trae la ventana al frente, creándola si el arranque fue directo a la bandeja. */
function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    mainWindow?.once('ready-to-show', () => mainWindow?.show())
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * El icono de la bandeja está siempre, arranque como arranque: es la única
 * forma de volver a la ventana cuando la aplicación se ha abierto escondida.
 */
function createTray(): void {
  const image = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(image)
  tray.setToolTip('BONK')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir BONK', click: showWindow },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  // Doble clic es lo que espera cualquiera de un icono de la bandeja; el clic
  // simple también abre, que no cuesta nada.
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
}

/** Ancho por debajo del cual la interfaz se reordena en formato teléfono. */
const PHONE_WIDTH = 420
const PHONE_HEIGHT = 880

/** Tamaño de la ventana antes de encogerla, para poder devolverla a su sitio. */
let deskBounds: Electron.Rectangle | null = null

/**
 * Encoge la ventana a proporción de teléfono y la devuelve al repetir. No hay
 * una versión móvil aparte: por debajo de 680 px la misma pantalla se reordena
 * —el menú baja al pulgar y las tarjetas se apilan—, así que esto solo pone la
 * ventana a la medida en la que eso ocurre.
 */
function toggleMobileView(): void {
  if (!mainWindow) return
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false)
  if (mainWindow.isMaximized()) mainWindow.unmaximize()

  const current = mainWindow.getBounds()
  if (current.width <= 680) {
    mainWindow.setBounds(deskBounds ?? { ...current, width: 1280, height: 840 })
    deskBounds = null
    return
  }

  deskBounds = current
  const area = screen.getDisplayMatching(current).workArea
  const height = Math.min(PHONE_HEIGHT, area.height - 40)
  mainWindow.setBounds({
    width: PHONE_WIDTH,
    height,
    // Pegada al borde derecho de su pantalla, que es donde menos estorba.
    x: Math.max(area.x, area.x + area.width - PHONE_WIDTH - 24),
    y: Math.max(area.y, Math.round(area.y + (area.height - height) / 2))
  })
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nuevo movimiento',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-transaction')
        },
        { type: 'separator' },
        {
          label: 'Copia de seguridad ahora',
          click: () => {
            try {
              makeBackup()
              setSetting('lastBackupAt', new Date().toISOString())
              mainWindow?.webContents.send('menu:backup-done')
            } catch {
              // El aviso de error ya lo da la propia pantalla de ajustes.
            }
          }
        },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' }
      ]
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', role: 'undo' },
        { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', role: 'reload' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
        {
          label: 'Vista móvil',
          accelerator: 'CmdOrCtrl+M',
          click: toggleMobileView
        },
        { type: 'separator' },
        { label: 'Acercar', role: 'zoomIn' },
        { label: 'Alejar', role: 'zoomOut' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        ...(isDev ? [{ label: 'Herramientas de desarrollo', role: 'toggleDevTools' as const }] : [])
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Una sola instancia: abrir el acceso directo dos veces enfoca la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Volver a pulsar el acceso directo abre la ventana, esté minimizada o
  // escondida en la bandeja, en vez de arrancar una segunda copia.
  app.on('second-instance', showWindow)

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID)

    openDatabase(app.getPath('userData'))

    // Las recurrencias vencidas se generan al abrir, aunque la app lleve meses cerrada.
    try {
      postDue()
    } catch (error) {
      console.error('No se pudieron generar las transacciones programadas:', error)
    }

    const theme = getSettings().theme
    nativeTheme.themeSource = theme === 'system' ? 'system' : theme

    // El registro de Windows se vuelve a escribir en cada arranque: si la
    // carpeta del proyecto se mueve, la entrada del inicio se corrige sola.
    applyAutoLaunch(getSettings().startWithWindows)

    registerIpc(() => mainWindow, { icon: iconPath, onClick: showWindow })
    buildMenu()
    createTray()
    createWindow()

    // Después del `postDue` de arriba: lo que vencía ya está registrado, así
    // que lo que queda por avisar es de mañana en adelante. A partir de aquí, el
    // repaso se repite solo mientras la aplicación siga viva.
    startBackgroundWork(
      iconPath,
      showWindow,
      () => mainWindow?.webContents.send('data:changed'),
      (reason) => mainWindow?.webContents.send('scheduled:failed', reason),
      (settlements) => mainWindow?.webContents.send('debt:settled', settlements)
    )

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    // A partir de aquí el aspa ya no esconde: se está saliendo de verdad.
    quitting = true

    // Copia diaria automática: barata y evita disgustos.
    try {
      const last = getSettings().lastBackupAt
      const todayStamp = new Date().toISOString().slice(0, 10)
      if (!last || last.slice(0, 10) !== todayStamp) {
        makeBackup()
        setSetting('lastBackupAt', new Date().toISOString())
      }
    } catch {
      // Si la copia falla no impedimos el cierre de la aplicación.
    }
    closeDatabase()
  })
}

import { app, shell, BrowserWindow, Menu, Tray, nativeTheme, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase, closeDatabase, makeBackup } from './db'
import { registerIpc } from './ipc'
import { postDue } from './repos/scheduled'
import { getSettings, setSetting } from './repos/settings'
import { applyAutoLaunch, startedHidden } from './autostart'
import { startBackgroundWork } from './reminders'
import { registrar, registrarFallo } from './registro'
import { createWidget, destroyWidget, sincronizarWidget, widgetWindow } from './widget'
import { iniciarActualizaciones } from './updates'

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
    width: 1100,
    height: 930,
    minWidth: 940,
    /*
     * Más baja tampoco: el alto de trabajo es el que él le tiene puesto, y por
     * debajo de ahí las pantallas empiezan a partirse. La tira de cifras de
     * Deudas o de Planes Ahorro se lleva un tercio de la ventana, y con menos
     * alto lo que queda debajo —las fichas, que son de lo que va la pantalla—
     * se ve por una rendija de dos filas.
     *
     * El número sale de medir la ventana tal y como la tenía abierta: 930 px
     * lógicos de alto, marco incluido. Eran 620, que nadie había medido.
     * A lo alto sigue creciendo lo que quiera, y maximizar ocupa la pantalla.
     */
    minHeight: 930,
    /*
     * Más ancha no: a lo largo la ventana crece lo que quiera, pero a lo ancho
     * se queda en los 1100 con los que nace. Pasados de ahí, la lista de
     * movimientos estira sus columnas sin llenarlas y las tarjetas de los
     * informes quedan una al lado de la otra con medio metro de aire en medio.
     * Maximizar sigue valiendo: ocupa todo el alto y respeta este ancho.
     *
     * Eran 1280 y sobraba sitio. El número sale de medir la ventana con el
     * ancho que él le dejó puesta: 1.095 px lógicos. Se redondea a 1.100, que
     * son cinco de diferencia y no se ven.
     */
    maxWidth: 1100,
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

  /*
   * Cerrar la ventana principal de verdad es salir, aunque el widget siga.
   *
   * `window-all-closed` ya no vale para eso: el widget es una ventana, así que
   * mientras esté puesto no se cierran todas nunca y la aplicación se quedaba
   * viva sin nada que la trajera de vuelta salvo la bandeja. Y si se ha pedido
   * que el aspa esconda, esto no llega a pasar: ahí la ventana no se cierra.
   */
  mainWindow.on('closed', () => {
    mainWindow = null
    if (!quitting) app.quit()
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
      const { failed } = postDue()
      for (const fallo of failed) {
        registrar('arranque', `«${fallo.title}» no entró: ${fallo.reason}`)
      }
    } catch (error) {
      registrarFallo('arranque', error)
    }

    const theme = getSettings().theme
    nativeTheme.themeSource = theme === 'system' ? 'system' : theme

    // El registro de Windows se vuelve a escribir en cada arranque: si la
    // carpeta del proyecto se mueve, la entrada del inicio se corrige sola.
    applyAutoLaunch(getSettings().startWithWindows)

    registerIpc(() => mainWindow, { icon: iconPath, onClick: showWindow }, () =>
      sincronizarWidget(isDev)
    )
    buildMenu()
    createTray()
    createWindow()
    // Vive mientras viva la aplicación: sale con ella y se queda aunque la
    // ventana principal se esconda en la bandeja.
    if (getSettings().widgetVisible) createWidget(isDev)

    // Después del `postDue` de arriba: lo que vencía ya está registrado, así
    // que lo que queda por avisar es de mañana en adelante. A partir de aquí, el
    // repaso se repite solo mientras la aplicación siga viva.
    startBackgroundWork(
      iconPath,
      showWindow,
      () => {
        mainWindow?.webContents.send('data:changed')
        widgetWindow()?.webContents.send('data:changed')
      },
      (reason) => mainWindow?.webContents.send('scheduled:failed', reason),
      (settlements) => mainWindow?.webContents.send('debt:settled', settlements),
      (goals) => mainWindow?.webContents.send('goal:reached', goals)
    )

    /*
     * Lo último que se pone en marcha, y a propósito: la primera comprobación
     * no sale hasta veinte segundos después, cuando la ventana lleva rato en
     * pantalla. Solo avisa a la ventana principal —el widget no tiene dónde
     * enseñar esto— y si no está, no pasa nada: la interfaz pregunta el estado
     * al montarse.
     */
    iniciarActualizaciones((estado) =>
      mainWindow?.webContents.send('updates:changed', estado)
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
    destroyWidget()

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

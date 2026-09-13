/**
 * Las capturas del manual de BONK, con BONK de verdad y datos de mentira.
 *
 * Carga la capa de datos y los manejadores del puente de la propia aplicación
 * en un proceso de Electron aparte, sobre una carpeta temporal con los datos de
 * `demo.ts`, y pinta la ventana fuera de pantalla (offscreen): no aparece nada
 * en el escritorio, no se toca `%APPDATA%\BONK` y las notificaciones de Windows
 * están desconectadas. Una escena por proceso, que la segunda ventana fuera de
 * pantalla de un mismo proceso no llega a cargar.
 *
 *   node docs/manual/arnes/capturar.mjs   (compila antes con npm run build)
 */
import { app, BrowserWindow, Notification, ipcMain, session } from 'electron'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, closeDatabase } from '../../../src/main/db'
import { registerIpc } from '../../../src/main/ipc'
import { sembrar } from './demo'

type Paso =
  | ['pulsar', string, string?]
  | ['contextual', string, string?]
  | ['escribir', string, string]
  | ['desplazar', string, number]
  | ['esperar', number]

interface Escena {
  nombre: string
  html?: 'index.html' | 'widget.html'
  w: number
  h: number
  pasos: Paso[]
  /** Sin él, al abrir sale el resumen del mes pasado. */
  resumenVisto?: boolean
}

const ESCENAS: Escena[] = [
  { nombre: 'b01-movimientos', w: 1100, h: 860, pasos: [] },
  { nombre: 'b02-nuevo', w: 1100, h: 860, pasos: [['pulsar', '.topbar .btn.primary', 'Nuevo movimiento'], ['esperar', 300]] },
  { nombre: 'b03-menu', w: 1100, h: 760, pasos: [['contextual', '.tx-row', 'Movistar']] },
  { nombre: 'b04-filtros', w: 1100, h: 860, pasos: [['pulsar', 'button', 'Filtros']] },
  { nombre: 'b05-programados', w: 1100, h: 640, pasos: [['pulsar', '.nav-item', 'Programados']] },
  { nombre: 'b06-calendario', w: 1100, h: 860, pasos: [['pulsar', '.nav-item', 'Programados'], ['pulsar', 'button', 'Calendario']] },
  { nombre: 'b07-deudas', w: 1100, h: 600, pasos: [['pulsar', '.nav-item', 'Deudas']] },
  { nombre: 'b08-ahorro', w: 1100, h: 1000, pasos: [['pulsar', '.nav-item', 'Planes Ahorro']] },
  { nombre: 'b09-cuentas', w: 1100, h: 760, pasos: [['pulsar', '.nav-item', 'Cuentas']] },
  { nombre: 'b10-categorias', w: 1100, h: 760, pasos: [['pulsar', '.nav-item', 'Categorías']] },
  { nombre: 'b11-informes', w: 1100, h: 1000, pasos: [['pulsar', '.nav-item', 'Informes']] },
  { nombre: 'b12-informes-grafica', w: 1100, h: 1000, pasos: [['pulsar', '.nav-item', 'Informes'], ['desplazar', '.main', 900]] },
  { nombre: 'b13-ajustes', w: 1100, h: 1000, pasos: [['pulsar', '.nav-item', 'Ajustes']] },
  { nombre: 'b14-ajustes-datos', w: 1100, h: 1000, pasos: [['pulsar', '.nav-item', 'Ajustes'], ['desplazar', '.main', 5000]] },
  { nombre: 'b15-calculadora', w: 1100, h: 760, pasos: [['pulsar', '.nav-item', 'Calculadora']] },
  // Las estrellas de la celebración tardan en irse: se espera a que caigan.
  { nombre: 'b16-resumen', w: 1100, h: 860, resumenVisto: false, pasos: [['esperar', 5000]] },
  { nombre: 'b17-widget', html: 'widget.html', w: 380, h: 330, pasos: [] }
]

const RAIZ = join(__dirname, '..', '..')
const DESTINO = join(RAIZ, 'docs', 'manual', 'capturas')
const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Antes de nada: los datos, a una carpeta temporal; y Windows, sin avisos.
const datos = mkdtempSync(join(tmpdir(), 'bonk-manual-'))
app.setPath('userData', datos)
Notification.prototype.show = function (): void {}

const cual = process.argv.find((a) => a.startsWith('--escena='))?.split('=')[1] ?? 'b01'

app.whenReady().then(async () => {
  const escena = ESCENAS.find((e) => e.nombre.startsWith(cual))
  if (!escena) return app.quit()

  openDatabase(datos)
  sembrar({ resumenVisto: escena.resumenVisto !== false })

  let ventana: BrowserWindow | null = null
  registerIpc(() => ventana, { icon: '', onClick: () => undefined }, () => undefined)

  // Un preload más, el de los clics del arnés, junto al de BONK.
  session.defaultSession.registerPreloadScript({ type: 'frame', filePath: join(__dirname, 'acciones.cjs') })

  ventana = new BrowserWindow({
    width: escena.w,
    height: escena.h,
    show: false,
    frame: false,
    webPreferences: {
      offscreen: true,
      preload: join(RAIZ, 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  ventana.webContents.setFrameRate(10)
  let ultima: Electron.NativeImage | null = null
  ventana.webContents.on('paint', (_e, _sucio, imagen) => {
    if (!imagen.isEmpty()) ultima = imagen
  })

  await ventana.loadFile(join(RAIZ, 'out', 'renderer', escena.html ?? 'index.html'))
  await espera(1400)
  for (const paso of escena.pasos) {
    if (paso[0] === 'esperar') {
      await espera(paso[1])
      continue
    }
    const hecho = new Promise<boolean>((r) => ipcMain.once('arnes:hecho', (_e, ok: boolean) => r(ok)))
    ventana.webContents.send('arnes:accion', ...paso)
    if (!(await hecho)) console.log(`  ${escena.nombre}: no encontré ${paso[1]} «${paso[2] ?? ''}»`)
    await espera(700)
  }
  ventana.webContents.invalidate()
  await espera(800)
  if (ultima) writeFileSync(join(DESTINO, `${escena.nombre}.png`), (ultima as Electron.NativeImage).toPNG())
  console.log(escena.nombre, ultima ? 'ok' : 'SIN IMAGEN')
  ventana.destroy()
  closeDatabase()
  app.quit()
})

export { ESCENAS }

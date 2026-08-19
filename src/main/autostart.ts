import { app } from 'electron'
import { resolve } from 'node:path'

/** Bandera que reciben tanto el arranque de Windows como quien la escriba a mano. */
export const HIDDEN_FLAG = '--hidden'

/** La aplicación se ha lanzado para quedarse en la bandeja, sin abrir ventana. */
export function startedHidden(): boolean {
  return process.argv.includes(HIDDEN_FLAG)
}

/**
 * Da de alta o de baja el arranque con Windows, siempre con `--hidden` para que
 * aparezca en la bandeja y no como una ventana encima de lo que estabas
 * haciendo.
 *
 * Sin empaquetar, el ejecutable es el motor de Electron y no sabe solo qué
 * abrir: hay que pasarle la carpeta del proyecto, que es justo como se lanza
 * BONK en este equipo desde que el Control inteligente de aplicaciones bloquea
 * su .exe.
 */
export function applyAutoLaunch(enabled: boolean): void {
  const args = [HIDDEN_FLAG]
  // Sin comillas: las pone Electron al escribir el registro, y ponerlas aquí
  // acababa dejando la ruta entrecomillada dos veces y con la barra final
  // escapada, que es una ruta que no existe.
  if (!app.isPackaged) args.unshift(resolve(process.argv[1] ?? app.getAppPath()))

  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args })
  } catch (error) {
    console.error('No se pudo cambiar el arranque con Windows:', error)
  }
}

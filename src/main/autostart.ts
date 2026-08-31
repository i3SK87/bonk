import { app } from 'electron'

/** Bandera que reciben tanto el arranque de Windows como quien la escriba a mano. */
const HIDDEN_FLAG = '--hidden'

/** La aplicación se ha lanzado para quedarse en la bandeja, sin abrir ventana. */
export function startedHidden(): boolean {
  return process.argv.includes(HIDDEN_FLAG)
}

/**
 * Da de alta o de baja el arranque con Windows, siempre con `--hidden` para que
 * aparezca en la bandeja y no como una ventana encima de lo que estabas
 * haciendo.
 *
 * **Sin empaquetar no se toca.** La entrada del registro se reescribe en cada
 * arranque para que se corrija sola si la aplicación cambia de sitio, y sin
 * este freno bastaba un `npm run dev` para que la copia del proyecto se
 * quedara con ella: a partir de ahí, el BONK que salía en la bandeja al
 * encender el ordenador era el de `out/`, que a cualquier intento de
 * actualizarse contesta que se ejecuta desde la carpeta del proyecto. Y como
 * esa copia también reescribía la entrada al arrancar, se sostenía sola.
 *
 * Es el mismo enredo que ya se quitó de los accesos directos el 29/08/2026, en
 * el otro sitio donde la copia de desarrollo suplantaba a la instalada. Aquí no
 * hay nada que arreglar en su lugar: quien manda en el arranque de Windows es
 * la aplicación instalada, y en desarrollo eso no se toca.
 */
export function applyAutoLaunch(enabled: boolean): void {
  if (!app.isPackaged) return

  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [HIDDEN_FLAG] })
  } catch (error) {
    console.error('No se pudo cambiar el arranque con Windows:', error)
  }
}

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { registrar, registrarFallo } from './registro'
import { getSettings } from './repos/settings'
import type { EstadoActualizacion } from '@shared/types'

/**
 * Traerse la versión nueva sin salir de la aplicación.
 *
 * Hasta aquí, actualizar era acordarse de mirar la página de GitHub, bajarse
 * cien megas de instalador y ejecutarlo. Quien tiene BONK instalado no hace eso,
 * así que se quedaba en la versión con la que empezó. Esto lo mira solo y avisa;
 * la descarga la manda quien está delante, pulsando el aviso, porque cien megas
 * por su línea son suyos. Cuando acaba, pide reiniciar.
 *
 * Se apoya en el «latest.yml» que electron-builder ya venía generando en cada
 * compilación y que hasta ahora no se subía a ninguna parte: dentro va la
 * versión publicada y el sha512 del instalador. El actualizador lo lee de la
 * release, compara con la versión de esta copia y, si hay una más nueva, se
 * descarga el .exe y comprueba que su sha512 es el que decía el archivo.
 *
 * Sin firma de código, esa comprobación de sha512 es toda la garantía que hay:
 * asegura que lo descargado es exactamente lo que publicó la release, no quién
 * la publicó. Con HTTPS y un repositorio propio basta para lo que esto es; el
 * día que haya certificado, se quita el `verifyUpdateCodeSignature: false` de
 * `electron-builder.yml` y además se comprueba la firma.
 */

/** Cada cuánto se vuelve a mirar mientras la aplicación siga abierta. */
const CADA = 24 * 60 * 60 * 1000

/**
 * Cuánto se espera antes de la primera.
 *
 * Arrancar ya hace bastante: abrir la base, registrar las programadas vencidas,
 * pintar la ventana. Una petición de red más, justo ahí, solo sirve para que la
 * ventana tarde en aparecer. Veinte segundos después no los nota nadie.
 */
const PRIMERA = 20_000

let estado: EstadoActualizacion = {
  fase: 'ociosa',
  version: null,
  porcentaje: 0,
  comprobadaEn: null,
  mensaje: null
}

let avisar: (nuevo: EstadoActualizacion) => void = () => {}

export function estadoActualizacion(): EstadoActualizacion {
  return estado
}

function poner(patch: Partial<EstadoActualizacion>): void {
  estado = { ...estado, ...patch }
  avisar(estado)
}

/** Lo que se le puede enseñar a alguien que no sabe qué es un ENOTFOUND. */
function legible(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error)
  if (/ENOTFOUND|ENETUNREACH|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET/.test(texto)) {
    return 'No se pudo conectar con GitHub. Puede que no haya internet ahora mismo.'
  }
  if (/404/.test(texto)) {
    return 'La release publicada no lleva el archivo «latest.yml», que es lo que hay que comparar.'
  }
  if (/sha512|checksum/i.test(texto)) {
    return 'Lo descargado no cuadra con lo que decía la release. No se ha instalado nada.'
  }
  return texto
}

/**
 * Deja el actualizador escuchando y programa los repasos.
 *
 * `notificar` es cómo llega cada cambio a la ventana. Se manda el estado entero
 * y no lo que ha cambiado: son cinco campos y así la interfaz nunca tiene que
 * reconstruirlo a partir de una sucesión de avisos que puede haberse perdido.
 */
export function iniciarActualizaciones(notificar: (estado: EstadoActualizacion) => void): void {
  avisar = notificar

  /*
   * En desarrollo no hay nada que actualizar: se ejecuta la carpeta `out/`, no
   * una copia instalada, y el actualizador ni siquiera encuentra el
   * «app-update.yml» que solo viaja dentro de lo empaquetado. Buscaría, fallaría
   * y dejaría un error en Ajustes que no significa nada.
   */
  if (!app.isPackaged) return

  /*
   * Encontrarla no es bajarla: eso lo manda quien está delante, pulsando el
   * aviso. Lo automático es enterarse, que es lo que nadie hace por su cuenta.
   */
  autoUpdater.autoDownload = false
  /*
   * Pero una vez bajada sí se instala sola al salir, si no se llegó a pulsar
   * «Reiniciar». No es un atajo suelto: el aspa esconde en la bandeja, así que
   * salir de verdad es raro y cuando pasa conviene aprovecharlo.
   */
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => poner({ fase: 'buscando', mensaje: null }))

  autoUpdater.on('update-not-available', () =>
    poner({
      fase: 'ociosa',
      version: null,
      porcentaje: 0,
      comprobadaEn: new Date().toISOString(),
      mensaje: null
    })
  )

  autoUpdater.on('update-available', (info) => {
    registrar('actualización', `encontrada la ${info.version}, esperando a que la pidan`)
    poner({
      fase: 'disponible',
      version: info.version,
      porcentaje: 0,
      comprobadaEn: new Date().toISOString(),
      mensaje: null
    })
  })

  autoUpdater.on('download-progress', (progreso) =>
    poner({ fase: 'descargando', porcentaje: Math.min(100, Math.round(progreso.percent)) })
  )

  autoUpdater.on('update-downloaded', (info) => {
    registrar('actualización', `${info.version} lista para instalar`)
    poner({ fase: 'lista', version: info.version, porcentaje: 100, mensaje: null })
  })

  autoUpdater.on('error', (error) => {
    registrarFallo('actualización', error)
    /*
     * Un fallo después de tener la descarga hecha no borra la descarga: puede
     * ser el repaso del día siguiente quedándose sin red, y sería absurdo
     * retirar el aviso de «lista para instalar» por eso.
     */
    poner({ fase: estado.fase === 'lista' ? 'lista' : 'error', mensaje: legible(error) })
  })

  setTimeout(repasar, PRIMERA)
  setInterval(repasar, CADA)
}

/** El repaso automático, que sí obedece al ajuste. */
function repasar(): void {
  if (!getSettings().buscarActualizaciones) return
  // Con una ya encontrada tampoco hay nada que volver a preguntar: el aviso
  // está puesto y lo que falta es que alguien lo pulse.
  if (estado.fase === 'disponible' || estado.fase === 'descargando' || estado.fase === 'lista') return
  void buscarActualizacion()
}

/**
 * Mirar ahora mismo. Es lo que hace el botón de Ajustes, y por eso no mira el
 * ajuste: apagarlo quita los repasos solos, no la posibilidad de mirar a mano.
 */
export async function buscarActualizacion(): Promise<EstadoActualizacion> {
  if (!app.isPackaged) {
    poner({
      fase: 'error',
      mensaje: 'Esta copia se ejecuta desde la carpeta del proyecto, no instalada: no hay nada que actualizar.'
    })
    return estado
  }
  // El fallo llega por el evento `error`, que ya deja el estado como toca.
  await autoUpdater.checkForUpdates().catch(() => undefined)
  return estado
}

/**
 * Traérsela. Es lo que hace el aviso de la barra lateral al pulsarlo.
 *
 * El progreso y el final llegan por los eventos de arriba, así que aquí no hay
 * nada que esperar: se arranca, se contesta, y quien mire el estado la verá
 * avanzar sola.
 */
export function descargarActualizacion(): boolean {
  if (estado.fase !== 'disponible') return false
  registrar('actualización', `descargando la ${estado.version}`)
  poner({ fase: 'descargando', porcentaje: 0, mensaje: null })
  // El fallo llega por el evento `error`, igual que en la búsqueda.
  autoUpdater.downloadUpdate().catch(() => undefined)
  return true
}

/**
 * Cierra y vuelve a abrir ya actualizada.
 *
 * En silencio y volviendo a arrancar: quien ha pulsado «Reiniciar» ha dicho que
 * sí a todo, y hacerle pasar otra vez por el asistente del instalador —idioma,
 * carpeta, accesos directos— sería preguntarle lo que ya contestó al instalarla.
 *
 * El `setImmediate` es para que la llamada del canal IPC alcance a responder:
 * `quitAndInstall` cierra la aplicación en el acto y sin él la ventana se va
 * antes de que la interfaz sepa que su petición salió bien.
 */
export function instalarActualizacion(): boolean {
  if (estado.fase !== 'lista') return false
  registrar('actualización', `instalando la ${estado.version}`)
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return true
}

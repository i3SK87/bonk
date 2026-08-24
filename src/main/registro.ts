/**
 * Un cuaderno de bitácora en disco.
 *
 * Electron no escribe ninguno por su cuenta: cuando algo falla dentro de la
 * ventana, el error vive en una consola que nadie tiene abierta y se pierde al
 * cerrar. Con esto queda una línea en un fichero que se puede leer después, que
 * es la diferencia entre arreglar algo y adivinarlo.
 *
 * No se apunta nada de lo que haces con tu dinero: solo fallos y los hitos que
 * hacen falta para entenderlos.
 */
import { app } from 'electron'
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Medio mega y se archiva: un registro que crece sin freno no lo lee nadie. */
const TOPE = 512 * 1024

function fichero(): string {
  return join(app.getPath('userData'), 'bonk.log')
}

export function registrar(donde: string, mensaje: string): void {
  try {
    const ruta = fichero()
    if (existsSync(ruta) && statSync(ruta).size > TOPE) {
      renameSync(ruta, `${ruta}.anterior`)
    }
    const cuando = new Date().toISOString()
    appendFileSync(ruta, `${cuando} [${donde}] ${mensaje}\n`, 'utf8')
  } catch {
    // Si no se puede ni escribir el registro, desde luego no vamos a tumbar la
    // aplicación por ello.
  }
}

/** Un fallo, con su rastro si lo trae. */
export function registrarFallo(donde: string, error: unknown): void {
  const guapo = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
  registrar(donde, `FALLO ${guapo}`)
}

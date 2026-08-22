/**
 * El modelo de reconocimiento de voz: traerlo y guardarlo.
 *
 * Se baja desde aquí y no desde la ventana porque los ficheros gordos de
 * HuggingFace no se sirven directamente: la petición contesta con un desvío a
 * su almacén, y la política de seguridad de la ventana corta el desvío. Los
 * ficheros pequeños llegaban y los de setenta megas no, que es exactamente lo
 * que se vio en la caché: los `.json` sí, los `.onnx` no.
 *
 * Aquí no hay política que valga —esto es Node— y de paso queda guardado en
 * disco de verdad, no en una caché que el navegador puede tirar cuando le
 * apetezca. Después de la primera vez, sin conexión.
 */
import { app, net } from 'electron'
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { registrar } from './registro'

/** El repositorio, tal cual lo nombra la librería en la ventana. */
export const MODELO = 'onnx-community/whisper-base'

/**
 * Lo que hace falta para transcribir, y solo eso: el repositorio tiene el
 * modelo en ocho precisiones distintas y bajarlas todas serían ochocientos
 * megas para usar setenta y seis.
 */
const FICHEROS = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
]

/** Aproximado y de sobra para una barra de progreso. */
const TAMANO_TOTAL = 80 * 1024 * 1024

export function carpetaModelos(): string {
  return join(app.getPath('userData'), 'modelos')
}

function destinoDe(fichero: string): string {
  return join(carpetaModelos(), ...MODELO.split('/'), ...fichero.split('/'))
}

/** Si están los siete y ninguno se quedó a medias. */
export function modeloListo(): boolean {
  return FICHEROS.every((fichero) => {
    const ruta = destinoDe(fichero)
    return existsSync(ruta) && statSync(ruta).size > 0
  })
}

/**
 * Trae lo que falte. Los que ya estén no se vuelven a pedir, así que una
 * descarga cortada a la mitad se retoma donde se quedó en vez de empezar de
 * cero.
 */
export async function descargarModelo(avisar: (porcentaje: number) => void): Promise<void> {
  let hechos = 0
  for (const fichero of FICHEROS) {
    const destino = destinoDe(fichero)
    if (existsSync(destino) && statSync(destino).size > 0) {
      hechos += statSync(destino).size
      avisar(Math.min(99, Math.round((hechos / TAMANO_TOTAL) * 100)))
      continue
    }

    const url = `https://huggingface.co/${MODELO}/resolve/main/${fichero}?download=true`
    const respuesta = await net.fetch(url)
    if (!respuesta.ok || !respuesta.body) {
      throw new Error(`No se pudo traer ${fichero}: ${respuesta.status} ${respuesta.statusText}`)
    }

    mkdirSync(dirname(destino), { recursive: true })
    // A un fichero aparte y renombrando al final: si se corta la conexión a
    // medias, lo que queda en disco no parece un modelo entero y roto.
    const aMedias = `${destino}.parcial`
    const salida = createWriteStream(aMedias)
    let deEste = 0
    const cuerpo = Readable.fromWeb(respuesta.body as Parameters<typeof Readable.fromWeb>[0])
    cuerpo.on('data', (trozo: Buffer) => {
      deEste += trozo.length
      avisar(Math.min(99, Math.round(((hechos + deEste) / TAMANO_TOTAL) * 100)))
    })
    await pipeline(cuerpo, salida)

    const { renameSync } = await import('node:fs')
    renameSync(aMedias, destino)
    hechos += deEste
    registrar('voz', `bajado ${fichero} (${Math.round(deEste / 1024)} kB)`)
  }
  avisar(100)
}

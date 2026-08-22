/**
 * Oír. El trozo que convierte un rato de micrófono en una frase.
 *
 * Whisper corriendo aquí dentro, en WebAssembly: no hay nada que compilar, no
 * hay ningún ejecutable que Windows pueda bloquear —que ya nos pasó con el
 * instalador— y, sobre todo, lo que dices no sale de esta máquina.
 *
 * El modelo sí viene de fuera, y solo la primera vez: son unos 80 MB que se
 * quedan en la caché del navegador de la aplicación. A partir de ahí funciona
 * sin conexión, como el resto de BONK.
 */
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

/*
 * El runtime de ONNX viaja dentro de la aplicación en vez de bajarse de un CDN:
 * la CSP no deja pedir código a nadie, y bajar el motor cada vez que se abre la
 * ventana sería absurdo para algo que pesa lo mismo siempre.
 */
env.backends.onnx.wasm!.wasmPaths = 'bonk://app/onnx/'
// Sin cabeceras de aislamiento no hay memoria compartida, y con más de un hilo
// el runtime aborta al arrancar en vez de apañárselas.
env.backends.onnx.wasm!.numThreads = 1
env.allowLocalModels = false

/** Whisper en pequeño. El mediano entiende mejor pero pesa tres veces más. */
const MODELO = 'onnx-community/whisper-base'

/** Lo que Whisper espera: mono, dieciséis mil muestras por segundo. */
const MUESTREO = 16000

export type EstadoEscucha = 'dormido' | 'preparando' | 'grabando' | 'pensando'

let cargando: Promise<AutomaticSpeechRecognitionPipeline> | null = null

/**
 * Prepara el modelo una sola vez por sesión. La primera llamada tarda —hay que
 * bajarlo—, las siguientes son inmediatas.
 */
export function prepararEscucha(
  progreso?: (porcentaje: number) => void
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!cargando) {
    cargando = pipeline('automatic-speech-recognition', MODELO, {
      dtype: 'q8',
      progress_callback: (info: unknown) => {
        const dato = info as { status?: string; progress?: number }
        if (dato.status === 'progress' && typeof dato.progress === 'number') {
          progreso?.(Math.round(dato.progress))
        }
      }
    }).catch((error) => {
      // Un fallo no puede dejar la promesa cacheada: el siguiente intento
      // volvería a recibir el mismo error sin haberlo intentado siquiera.
      cargando = null
      throw error
    }) as Promise<AutomaticSpeechRecognitionPipeline>
  }
  return cargando
}

/** Si ya está en memoria, para no prometer una espera que no va a ocurrir. */
export function escuchaLista(): boolean {
  return cargando !== null
}

/**
 * Graba hasta que se suelta el botón y devuelve las muestras ya remuestreadas.
 *
 * Se graba a lo que dé la tarjeta y se convierte después: pedirle 16 kHz al
 * micrófono es una sugerencia que casi ningún dispositivo respeta.
 */
export class Grabadora {
  private media: MediaStream | null = null
  private trozos: Blob[] = []
  private grabador: MediaRecorder | null = null

  async empezar(): Promise<void> {
    this.media = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
    this.trozos = []
    this.grabador = new MediaRecorder(this.media)
    this.grabador.ondataavailable = (evento) => {
      if (evento.data.size > 0) this.trozos.push(evento.data)
    }
    this.grabador.start()
  }

  /** Devuelve null si no se llegó a grabar nada que valga la pena mirar. */
  async parar(): Promise<Float32Array | null> {
    const grabador = this.grabador
    if (!grabador) return null

    const audio = await new Promise<Blob>((listo) => {
      grabador.onstop = () => listo(new Blob(this.trozos, { type: grabador.mimeType }))
      grabador.stop()
    })

    this.media?.getTracks().forEach((pista) => pista.stop())
    this.media = null
    this.grabador = null

    if (audio.size < 1000) return null

    const contexto = new AudioContext({ sampleRate: MUESTREO })
    try {
      const crudo = await contexto.decodeAudioData(await audio.arrayBuffer())
      // Mono: si viene en estéreo se promedian los canales, que hablar en un
      // solo lado del micro no debería costar la mitad de la señal.
      if (crudo.numberOfChannels === 1) return crudo.getChannelData(0)
      const izquierda = crudo.getChannelData(0)
      const derecha = crudo.getChannelData(1)
      const mezcla = new Float32Array(izquierda.length)
      for (let i = 0; i < izquierda.length; i++) mezcla[i] = (izquierda[i] + derecha[i]) / 2
      return mezcla
    } finally {
      await contexto.close()
    }
  }

  /** Para soltar el micrófono si se cancela a medias. */
  abortar(): void {
    try {
      this.grabador?.stop()
    } catch {
      // Ya estaba parado; no hay nada que rescatar.
    }
    this.media?.getTracks().forEach((pista) => pista.stop())
    this.media = null
    this.grabador = null
  }
}

/** De muestras a frase, en español. */
export async function transcribir(muestras: Float32Array): Promise<string> {
  const motor = await prepararEscucha()
  const salida = await motor(muestras, { language: 'spanish', task: 'transcribe' })
  const texto = Array.isArray(salida) ? salida[0]?.text : salida?.text
  return (texto ?? '').trim()
}

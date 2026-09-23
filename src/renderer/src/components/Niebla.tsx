/**
 * La niebla del 24 de septiembre, el día del Silent Hill nuevo.
 *
 * Ese día BONK amanece con un mar de niebla que va subiendo, y que se
 * aparta a donde pasas el ratón. No hay nada que pulsar ni nada que cerrar: la
 * capa es transparente al ratón y se queda ahí todo el día.
 *
 * **Va por delante de todo, diálogos incluidos**: ese día la niebla es la
 * protagonista, no un fondo de pantalla. Lo que la hace llevadera no es
 * ponerse detrás de nada, son otras dos cosas: tiene un techo —sube hasta el
 * 70 % y ahí se queda, nunca a más— y el ratón despeja, así que si quieres
 * mirar una cifra, la miras. Eso convierte el estorbo en la gracia.
 *
 * Lo que se dibuja no son manchas sueltas sino un campo de ruido continuo
 * estirado en horizontal, que es lo que lo convierte en bancos y no en
 * nubecitas. Va en tres capas a distinta escala y distinta velocidad, y de ahí
 * sale la profundidad.
 */
import { useEffect, useRef, type ReactNode } from 'react'

/* Los valores elegidos mirándolos, sobre la maqueta. */
/** Hasta dónde llega a espesar, de 0 a 1. */
const TECHO = 0.7
/** Lo que tarda en llegar al techo desde que abres, en segundos. */
const LLENA = 20
/** Lo que tarda en volver a cerrarse un claro, en segundos. */
const VUELVE = 0.5
/** Cuánto llega a despejar el ratón. Por debajo de 1 siempre queda un velo. */
const ACLARA = 0.72
/** Cuánto se aplastan las capas. A 1 son bancos anchos. */
const FORMA = 1

/** Píxeles de pantalla por casilla de la rejilla del claro. */
const PASO = 20
/** El radio de lo que despeja el ratón, en píxeles. */
const RADIO = 190
/**
 * Fotogramas por segundo.
 *
 * Esto está en marcha un día entero, no dos segundos como los murciélagos. A
 * treinta se mueve igual de bien —la niebla va lentísima— y cuesta la mitad de
 * batería. Y con la ventana escondida no se pinta nada.
 */
const FPS = 30

const suave = (t: number): number => t * t * (3 - 2 * t)

/**
 * Ruido de valor en varias octavas, que casa consigo mismo por los cuatro
 * lados: eso es lo que permite repetirlo sin que se vean las costuras.
 */
function texturaDeNiebla(tam: number): HTMLCanvasElement {
  const buf = new Float32Array(tam * tam)
  const octavas = [2, 4, 8, 16, 32]
  const pesos = [0.48, 0.26, 0.15, 0.08, 0.03]
  for (let k = 0; k < octavas.length; k++) {
    const n = octavas[k]
    const peso = pesos[k]
    const g = new Float32Array(n * n)
    for (let i = 0; i < n * n; i++) g[i] = Math.random()
    for (let y = 0; y < tam; y++) {
      const fy = (y / tam) * n
      const y0 = Math.floor(fy)
      const ty = suave(fy - y0)
      const ya = (y0 % n) * n
      const yb = ((y0 + 1) % n) * n
      for (let x = 0; x < tam; x++) {
        const fx = (x / tam) * n
        const x0 = Math.floor(fx)
        const tx = suave(fx - x0)
        const xa = x0 % n
        const xb = (x0 + 1) % n
        const arriba = g[ya + xa] + (g[ya + xb] - g[ya + xa]) * tx
        const abajo = g[yb + xa] + (g[yb + xb] - g[yb + xa]) * tx
        buf[y * tam + x] += (arriba + (abajo - arriba) * ty) * peso
      }
    }
  }
  const lona = document.createElement('canvas')
  lona.width = tam
  lona.height = tam
  const c = lona.getContext('2d')!
  const img = c.createImageData(tam, tam)
  for (let i = 0; i < buf.length; i++) {
    // Se estira el contraste: sin esto todo se queda en un gris medio y no hay
    // ni jirones ni claros, que es de lo que vive una niebla.
    const v = Math.max(0, Math.min(1, (buf[i] - 0.34) * 2.6))
    img.data[i * 4] = 226
    img.data[i * 4 + 1] = 231
    img.data[i * 4 + 2] = 238
    img.data[i * 4 + 3] = Math.round(v * 255)
  }
  c.putImageData(img, 0, 0)
  return lona
}

/**
 * Las tres capas.
 *
 * `escalaX` mucho mayor que `escalaY` es lo que las estira en bancos. Cada una
 * lleva además una segunda pasada (`cruz…`) a otra escala y otra velocidad: es
 * lo que quita el patrón reconocible, porque lo que se repite pasa a ser el par
 * y ese ciclo dura tanto que no llega a verse.
 */
const CAPAS = [
  { escalaX: 5.0, escalaY: 0.7, vel: 34, alto: 0.34, peso: 1.7, cruzX: 3.1, cruzY: 0.43, cruzVel: -11, deriva: 2.6 },
  { escalaX: 3.2, escalaY: 0.48, vel: -19, alto: 0.62, peso: 1.5, cruzX: 4.7, cruzY: 0.29, cruzVel: 7, deriva: -1.8 },
  { escalaX: 2.0, escalaY: 0.32, vel: 9, alto: 1.0, peso: 1.1, cruzX: 2.9, cruzY: 0.21, cruzVel: -5, deriva: 1.1 }
]

export function Niebla(): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const lienzo = ref.current
    const ctx = lienzo?.getContext('2d')
    if (!lienzo || !ctx) return

    /*
     * Se pinta todo a media resolución y se sube al final: sale cuatro veces
     * más barato y encima queda mejor, porque al estirarla la interpolación
     * suaviza el ruido y la niebla pierde el grano.
     */
    const trabajo = document.createElement('canvas')
    const tctx = trabajo.getContext('2d')!
    const capa = document.createElement('canvas')
    const cctx = capa.getContext('2d')!
    const mascara = document.createElement('canvas')
    const mctx = mascara.getContext('2d')!

    const texturas = [texturaDeNiebla(256), texturaDeNiebla(256), texturaDeNiebla(256)]
    const patrones = texturas.map((t) => ctx.createPattern(t, 'repeat')!)
    const cruces = texturas.map((_, i) => ctx.createPattern(texturas[(i + 1) % 3], 'repeat')!)

    let ancho = 0
    let alto = 0
    let gw = 0
    let gh = 0
    /**
     * Lo que el ratón ha despejado, casilla a casilla.
     *
     * En números y no en un lienzo a propósito: la primera versión desvanecía
     * una máscara **multiplicándola** —quitarle un tanto por ciento cada
     * fotograma—, y eso nunca llega a cero: con ocho bits por canal, en cuanto
     * el valor baja lo suficiente el redondeo lo deja clavado y la zona limpia
     * no se cerraba jamás. Aquí baja en línea recta y vuelve a cero exacto.
     */
    let rejilla = new Float32Array(0)
    let img: ImageData | null = null

    const medir = (): void => {
      ancho = window.innerWidth
      alto = window.innerHeight
      const dpr = window.devicePixelRatio || 1
      lienzo.width = Math.round(ancho * dpr)
      lienzo.height = Math.round(alto * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      for (const c of [trabajo, capa]) {
        c.width = Math.max(1, Math.round(ancho / 2))
        c.height = Math.max(1, Math.round(alto / 2))
      }
      gw = Math.max(2, Math.ceil(ancho / PASO)) + 1
      gh = Math.max(2, Math.ceil(alto / PASO)) + 1
      rejilla = new Float32Array(gw * gh)
      mascara.width = gw
      mascara.height = gh
      img = mctx.createImageData(gw, gh)
      for (let i = 0; i < gw * gh; i++) {
        img.data[i * 4] = 255
        img.data[i * 4 + 1] = 255
        img.data[i * 4 + 2] = 255
      }
    }
    medir()
    window.addEventListener('resize', medir)

    const raton = { x: -9999, y: -9999, px: -9999, py: -9999, prisa: 0 }
    const alMover = (e: MouseEvent): void => {
      raton.x = e.clientX
      raton.y = e.clientY
    }
    window.addEventListener('mousemove', alMover)

    /**
     * Lo que el ratón despeja a su paso.
     *
     * Dos cosas le dan el tacto de dispersar en vez de borrar. Una, que cuenta
     * la **velocidad**: parado no despeja nada por mucho que estés encima. Y
     * otra, que se acumula poco a poco, un tanto por fotograma, así que un
     * manotazo deja un claro tenue y hay que insistir para abrirlo del todo.
     */
    const aclarar = (x: number, y: number, prisa: number): void => {
      const radio = RADIO / PASO
      const cx = x / PASO
      const cy = y / PASO
      const x0 = Math.max(0, Math.floor(cx - radio))
      const x1 = Math.min(gw - 1, Math.ceil(cx + radio))
      const y0 = Math.max(0, Math.floor(cy - radio))
      const y1 = Math.min(gh - 1, Math.ceil(cy + radio))
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const d = Math.hypot(gx - cx, gy - cy) / radio
          if (d >= 1) continue
          const i = gy * gw + gx
          const v = rejilla[i] + (1 - d) * prisa * 0.14
          rejilla[i] = v > ACLARA ? ACLARA : v
        }
      }
    }

    let pedido = 0
    const t0 = performance.now()
    let ultimo = t0
    let pintado = 0

    const bucle = (ahora: number): void => {
      pedido = requestAnimationFrame(bucle)
      // Con la ventana escondida no hay nada que pintar; y a treinta por segundo.
      if (document.hidden || ahora - pintado < 1000 / FPS - 1) return
      pintado = ahora

      const t = (ahora - t0) / 1000
      const dt = Math.min(0.2, (ahora - ultimo) / 1000)
      ultimo = ahora
      const w = trabajo.width
      const h = trabajo.height
      const densidad = TECHO * Math.min(1, t / LLENA)

      /* El claro: primero se cierra, luego se abre lo de este fotograma. */
      const baja = dt / VUELVE
      for (let i = 0; i < rejilla.length; i++) {
        const v = rejilla[i] - baja
        rejilla[i] = v > 0 ? v : 0
      }
      if (raton.x > -9000) {
        const recorrido =
          raton.px > -9000 ? Math.hypot(raton.x - raton.px, raton.y - raton.py) : 0
        raton.prisa = Math.max(Math.min(1, recorrido / 22), raton.prisa * 0.72)
        aclarar(raton.x, raton.y, raton.prisa)
        raton.px = raton.x
        raton.py = raton.y
      }
      if (img) {
        for (let i = 0; i < rejilla.length; i++) img.data[i * 4 + 3] = Math.round(rejilla[i] * 255)
        mctx.putImageData(img, 0, 0)
      }

      /* Las capas */
      tctx.clearRect(0, 0, w, h)
      for (let i = 0; i < CAPAS.length; i++) {
        const c = CAPAS[i]
        cctx.clearRect(0, 0, w, h)
        cctx.save()
        patrones[i].setTransform(
          new DOMMatrix()
            .translate((t * c.vel) % (256 * c.escalaX), t * c.deriva + Math.sin(t * 0.05 + c.vel) * 8)
            .scale(c.escalaX, c.escalaY / FORMA)
        )
        cctx.fillStyle = patrones[i]
        cctx.fillRect(0, 0, w, h)
        // La segunda pasada, quedándose solo con lo que hay en las dos.
        cctx.globalCompositeOperation = 'destination-in'
        cruces[i].setTransform(
          new DOMMatrix()
            .translate((t * c.cruzVel) % (256 * c.cruzX), -t * c.deriva * 0.6)
            .scale(c.cruzX, c.cruzY / FORMA)
        )
        cctx.fillStyle = cruces[i]
        cctx.fillRect(0, 0, w, h)
        // El mar: densa abajo y deshilachada arriba. De las tres sale el frente.
        const g = cctx.createLinearGradient(0, h, 0, h * (1 - c.alto))
        g.addColorStop(0, 'rgba(0,0,0,1)')
        g.addColorStop(0.55, 'rgba(0,0,0,.72)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        cctx.fillStyle = g
        cctx.fillRect(0, 0, w, h)
        cctx.restore()

        tctx.globalAlpha = Math.min(1, densidad * c.peso)
        tctx.drawImage(capa, 0, 0)
        tctx.globalAlpha = 1
      }

      /* Y el claro se le come un trozo. La rejilla sube estirada, así que el
         borde sale suave sin dibujar ningún degradado. */
      tctx.save()
      tctx.globalCompositeOperation = 'destination-out'
      tctx.imageSmoothingEnabled = true
      tctx.drawImage(mascara, 0, 0, w, h)
      tctx.restore()

      ctx.clearRect(0, 0, ancho, alto)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(trabajo, 0, 0, ancho, alto)
    }
    pedido = requestAnimationFrame(bucle)

    return () => {
      cancelAnimationFrame(pedido)
      window.removeEventListener('resize', medir)
      window.removeEventListener('mousemove', alMover)
    }
  }, [])

  return <canvas ref={ref} className="niebla" aria-hidden="true" />
}

/**
 * Lo de Halloween: el bando de murciélagos y la calabaza de la barra lateral.
 *
 * Todo lo de temporada vive en este archivo y en `@shared/halloween`, que es lo
 * que hace que se pueda quitar de un tirón si algún año deja de hacer gracia.
 *
 * Las dos reglas que se puso: que no bloquee —ni cuadro, ni botón «Vale», ni
 * nada que haya que cerrar: la capa es transparente al ratón y se desmonta
 * sola— y que no se gaste: sale una vez al día, del 25 al 31 de octubre.
 */
import { useEffect, useRef, type ReactNode } from 'react'

/** Cuántos salen. Son pequeños, así que lo que hace el efecto es el bando. */
const CUANTOS = 85

interface Murcielago {
  x: number
  y: number
  vx: number
  vy: number
  /** Media envergadura al empezar, en píxeles. */
  w0: number
  /** Cuánto crece: es lo que los trae hacia ti en vez de solo moverlos. */
  crece: number
  giro: number
  /** Batidas por segundo, en radianes. Muy rápido: un murciélago no planea. */
  aleteo: number
  fase: number
  retraso: number
  vida: number
}

/**
 * El bando que se te viene encima al abrir.
 *
 * Es el motor del confeti —un lienzo, una lista de piezas y un bucle— con otra
 * física: las piezas del confeti salen disparadas y caen, y estos vienen hacia
 * la pantalla, así que en vez de girar y caer **crecen**. De ahí que el tamaño
 * vaya con el cuadrado del tiempo y no haya gravedad por ninguna parte.
 */
export function Murcielagos({ onFin }: { onFin: () => void }): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)
  // En una referencia y no en el estado: lo lee el bucle, no lo pinta React.
  const fin = useRef(onFin)
  fin.current = onFin

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const ancho = rect.width
    const alto = rect.height

    /**
     * Un murciélago, centrado en el origen. `w` es media envergadura y `f` el
     * aleteo, de -1 a 1.
     *
     * Las alas van en punta y con el filo de abajo picado: redondeadas parecían
     * una polilla.
     */
    const dibujar = (w: number, f: number): void => {
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.quadraticCurveTo(-w * 0.42, -w * 0.5 + f * w * 0.55, -w, -w * 0.46 + f * w * 0.95)
      ctx.lineTo(-w * 0.8, w * 0.04 + f * w * 0.52)
      ctx.lineTo(-w * 0.66, -w * 0.1 + f * w * 0.44)
      ctx.lineTo(-w * 0.48, w * 0.16 + f * w * 0.32)
      ctx.lineTo(-w * 0.34, f * w * 0.22)
      ctx.quadraticCurveTo(-w * 0.2, w * 0.24, 0, w * 0.1)
      ctx.quadraticCurveTo(w * 0.2, w * 0.24, w * 0.34, f * w * 0.22)
      ctx.lineTo(w * 0.48, w * 0.16 + f * w * 0.32)
      ctx.lineTo(w * 0.66, -w * 0.1 + f * w * 0.44)
      ctx.lineTo(w * 0.8, w * 0.04 + f * w * 0.52)
      ctx.lineTo(w, -w * 0.46 + f * w * 0.95)
      ctx.quadraticCurveTo(w * 0.42, -w * 0.5 + f * w * 0.55, 0, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // El cuerpo y las orejas
      ctx.beginPath()
      ctx.ellipse(0, w * 0.03, w * 0.17, w * 0.26, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-w * 0.13, -w * 0.16)
      ctx.lineTo(-w * 0.22, -w * 0.46)
      ctx.lineTo(-w * 0.02, -w * 0.22)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(w * 0.13, -w * 0.16)
      ctx.lineTo(w * 0.22, -w * 0.46)
      ctx.lineTo(w * 0.02, -w * 0.22)
      ctx.closePath()
      ctx.fill()

      // La cara solo de cerca: de lejos serían cuatro motas de ruido.
      if (w > 13) {
        ctx.save()
        ctx.fillStyle = '#ff2f28'
        ctx.beginPath()
        ctx.arc(-w * 0.07, -w * 0.04, w * 0.045, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(w * 0.07, -w * 0.04, w * 0.045, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#efe9dc'
        ctx.beginPath()
        ctx.moveTo(-w * 0.09, w * 0.1)
        ctx.lineTo(-w * 0.03, w * 0.1)
        ctx.lineTo(-w * 0.06, w * 0.23)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(w * 0.03, w * 0.1)
        ctx.lineTo(w * 0.09, w * 0.1)
        ctx.lineTo(w * 0.06, w * 0.23)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }

    const cx = ancho / 2
    const cy = alto * 0.45
    const bando: Murcielago[] = []
    for (let i = 0; i < CUANTOS; i++) {
      const angulo = Math.random() * Math.PI * 2
      bando.push({
        x: cx + Math.cos(angulo) * 30,
        y: cy + Math.sin(angulo) * 20,
        vx: Math.cos(angulo) * (70 + Math.random() * 230),
        vy: Math.sin(angulo) * (50 + Math.random() * 165) - 26,
        w0: 2.2 + Math.random() * 1.8,
        crece: 4 + Math.random() * 5,
        giro: (Math.random() - 0.5) * 0.8,
        aleteo: 26 + Math.random() * 16,
        fase: Math.random() * Math.PI * 2,
        retraso: Math.random() * 0.7,
        vida: 2.2 + Math.random() * 1
      })
    }

    let pedido = 0
    let t0 = 0
    const bucle = (ahora: number): void => {
      if (!t0) t0 = ahora
      const t = (ahora - t0) / 1000
      ctx.clearRect(0, 0, ancho, alto)
      let vivos = 0
      for (const m of bando) {
        const e = t - m.retraso
        if (e < 0) {
          vivos++
          continue
        }
        if (e > m.vida) continue
        vivos++
        const w = m.w0 + m.crece * e * e // se acerca acelerando
        const x = m.x + m.vx * e + Math.sin(e * 3 + m.fase) * 14
        const y = m.y + m.vy * e + Math.sin(e * 2.2 + m.fase) * 10
        const salida = Math.min(1, (m.vida - e) / 0.5)
        ctx.save()
        ctx.globalAlpha = Math.min(1, e * 4) * salida
        ctx.translate(x, y)
        ctx.rotate(Math.sin(e * 1.6 + m.fase) * m.giro)
        /*
         * Negros, pero con un filo claro alrededor: a pelo sobre el fondo
         * oscuro de BONK un murciélago negro desaparece y se le quedan los ojos
         * flotando solos. El filo lo recorta sin aclararlo, y en el modo claro
         * no molesta porque apenas se ve.
         */
        ctx.fillStyle = '#08080b'
        ctx.strokeStyle = 'rgba(233,228,216,.26)'
        ctx.lineWidth = Math.max(0.6, w * 0.05)
        dibujar(w, Math.sin(e * m.aleteo + m.fase))
        ctx.restore()
      }
      if (vivos > 0) pedido = requestAnimationFrame(bucle)
      else fin.current()
    }
    pedido = requestAnimationFrame(bucle)

    return () => cancelAnimationFrame(pedido)
  }, [])

  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}

/**
 * La calabaza que sustituye a la marca de la barra lateral esa semana.
 *
 * Va dibujada y no como archivo suelto porque el icono de verdad —el de la
 * ventana, la barra de tareas y los accesos directos— se hornea en el ejecutable
 * al compilar y no entiende de fechas. Este se pone y se quita solo.
 */
export function MarcaCalabaza(): ReactNode {
  return (
    <svg className="mark" viewBox="0 0 256 256" width={28} height={28} aria-hidden="true">
      <defs>
        <linearGradient id="calabaza" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f08a12" />
          <stop offset="1" stopColor="#ffb13d" />
        </linearGradient>
      </defs>
      {/* El rabo, que es lo que la hace calabaza antes que la cara */}
      <path d="M128 52 C 122 34, 116 26, 100 20" fill="none" stroke="#2f7d36" strokeWidth={13} strokeLinecap="round" />
      <path d="M128 58 C 118 44, 130 36, 140 40" fill="none" stroke="#3c9c45" strokeWidth={16} strokeLinecap="round" />
      {/* Tres bultos: los dos de los lados por detrás, y el del medio encima */}
      <ellipse cx="72" cy="154" rx="52" ry="76" fill="#d9700c" />
      <ellipse cx="184" cy="154" rx="52" ry="76" fill="#d9700c" />
      <ellipse cx="128" cy="152" rx="76" ry="82" fill="url(#calabaza)" />
      {/* Los ojos en punta y cargados hacia dentro: el ángulo es lo que la hace maligna */}
      <path d="M58 118 L110 98 L110 142 Z" fill="#2a1206" />
      <path d="M198 118 L146 98 L146 142 Z" fill="#2a1206" />
      <path d="M128 136 L145 168 L111 168 Z" fill="#2a1206" />
      <path d="M72 186 L92 200 L110 186 L128 200 L146 186 L164 200 L184 186 L176 214 L80 214 Z" fill="#2a1206" />
    </svg>
  )
}

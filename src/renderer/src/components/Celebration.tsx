import { useEffect, useRef, type ReactNode } from 'react'
import { formatMoney } from '@shared/money'
import { today as todayISO } from '@shared/dates'
import type { Settlement, GoalReached } from '@shared/types'

/**
 * La enhorabuena por una deuda saldada.
 *
 * Es el único sitio de la aplicación donde se celebra algo, y no se celebra
 * cualquier cosa: que se acabe una suscripción no es una buena noticia. Solo
 * las categorías marcadas como deuda a plazos llegan hasta aquí.
 */

/** Los mismos colores que llevan las categorías en las listas. */
const COLORS = ['#64d2ff', '#40d873', '#ffb340', '#ff6961', '#f090c4', '#5fd8c4', '#a78bfa']

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  spin: number
  color: string
  life: number
  max: number
}

/** «agosto de 2025». */
function monthOf(date: string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`)
  )
}

/** Meses redondeados entre la primera cuota y la última. */
function span(from: string | null, to: string | null): string {
  if (!from || !to) return '—'
  const start = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  if (months < 2) return 'de una vez'
  if (months < 12) return `${months} meses`
  const years = Math.round((months / 12) * 10) / 10
  return years === 1 ? 'un año' : `${years} años`.replace('.', ',')
}

function Confetti(): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const pieces: Piece[] = []
    const originX = rect.width / 2
    const originY = rect.height / 2 - 130

    for (let i = 0; i < 110; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.5
      const speed = 260 + Math.random() * 420
      pieces.push({
        x: originX + (Math.random() - 0.5) * 300,
        y: originY + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * speed * (0.55 + Math.random() * 0.9),
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 11,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 0,
        max: 1.7 + Math.random() * 1.1
      })
    }

    // Con el movimiento reducido, el papelillo cae de golpe y se queda quieto.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const piece of pieces) {
        ctx.save()
        ctx.translate(piece.x + piece.vx * 0.35, piece.y + Math.abs(piece.vy) * 0.25 + 120)
        ctx.rotate(piece.rot)
        ctx.fillStyle = piece.color
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h)
        ctx.restore()
      }
      return
    }

    let frame = 0
    let last = performance.now()

    const tick = (now: number): void => {
      const dt = Math.min(0.032, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, rect.width, rect.height)

      let alive = 0
      for (const piece of pieces) {
        piece.life += dt
        if (piece.life > piece.max) continue
        alive++
        piece.vy += 900 * dt
        piece.vx *= 1 - 1.1 * dt
        piece.x += piece.vx * dt
        piece.y += piece.vy * dt
        piece.rot += piece.spin * dt

        const fading = Math.max(0, piece.life - piece.max * 0.55) / (piece.max * 0.45)
        ctx.save()
        ctx.globalAlpha = Math.max(0, 1 - fading)
        ctx.translate(piece.x, piece.y)
        ctx.rotate(piece.rot)
        ctx.fillStyle = piece.color
        // Un papelillo que gira se ve más estrecho: se estrecha el ancho.
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w * Math.abs(Math.cos(piece.rot * 1.4)) + 1.5, piece.h)
        ctx.restore()
      }

      if (alive > 0) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}

/** El sello, el papelillo y el botón: lo que comparten las dos buenas noticias. */
function Party({
  title,
  lede,
  stats,
  onClose
}: {
  title: string
  lede: string
  stats: Array<{ value: string; label: string }>
  onClose: () => void
}): ReactNode {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <Confetti />
      <div className="celebration" onClick={(event) => event.stopPropagation()}>
        <div className="celebration-seal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12.5l5.2 5.2L20 6.9" />
          </svg>
        </div>

        <h2>{title}</h2>
        <p className="celebration-lede">{lede}</p>

        <div className="celebration-stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <b>{stat.value}</b>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <button className="btn primary" onClick={onClose} autoFocus>
          Bien
        </button>
      </div>
    </div>
  )
}

/** La deuda que se acaba de saldar. */
export function Celebration({
  settlement,
  onClose
}: {
  settlement: Settlement
  onClose: () => void
}): ReactNode {
  const duration = span(settlement.firstDate, settlement.lastDate)
  return (
    <Party
      title={`¡${settlement.title} pagado!`}
      lede={`${duration} y ya no debes nada. Esta cuota deja de salir de tu cuenta.`}
      stats={[
        { value: String(settlement.count), label: settlement.count === 1 ? 'cuota' : 'cuotas' },
        { value: formatMoney(settlement.total, settlement.currency), label: 'pagado' },
        { value: duration, label: `desde ${monthOf(settlement.firstDate)}` }
      ]}
      onClose={onClose}
    />
  )
}

/**
 * El plan de ahorro que acaba de llegar a su meta.
 *
 * Se celebra por lo mismo que una deuda saldada: es el final de algo que ha
 * costado meses. Cambia la cuenta que se echa —lo ahorrado y desde cuándo, en vez
 * de las cuotas pagadas— y, si había fecha, si se ha llegado antes de tiempo,
 * que es la mitad de la gracia.
 */
export function GoalCelebration({
  goal,
  onClose
}: {
  goal: GoalReached
  onClose: () => void
}): ReactNode {
  const duration = span(goal.since, todayISO())
  const days =
    goal.targetDate == null
      ? null
      : Math.round(
          (Date.parse(`${goal.targetDate}T12:00:00`) - Date.parse(`${todayISO()}T12:00:00`)) / 86400000
        )

  return (
    <Party
      title={`¡${goal.title} conseguido!`}
      lede={
        days != null && days > 0
          ? `Ya está ahorrado, y con ${days} ${days === 1 ? 'día' : 'días'} de adelanto. El dinero te espera en ${goal.accountName}.`
          : `Ya está ahorrado. El dinero te espera en ${goal.accountName}.`
      }
      stats={[
        { value: formatMoney(goal.total, goal.currency), label: 'ahorrado' },
        { value: duration, label: `desde ${monthOf(goal.since)}` },
        {
          value: days == null ? '—' : days > 0 ? `${days} d` : days === 0 ? 'hoy' : `+${Math.abs(days)} d`,
          label: days == null ? 'sin fecha' : days >= 0 ? 'de adelanto' : 'de retraso'
        }
      ]}
      onClose={onClose}
    />
  )
}

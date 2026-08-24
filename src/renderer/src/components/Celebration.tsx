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

/**
 * El sello, el papelillo y el botón: la maqueta de lo que se enseña en grande.
 *
 * El papelillo es opcional porque no todo lo que sale así es una fiesta. Un
 * resumen del mes es neutro, y bastantes meses será malo: sacar «has gastado
 * trescientos euros más» con confeti chirría. Misma caja, distinto adorno.
 */
function Party({
  title,
  lede,
  stats,
  onClose,
  papelillo = true,
  sello,
  boton = 'Bien',
  tono
}: {
  title: string
  lede: string
  stats: Array<{ value: string; label: string }>
  onClose: () => void
  papelillo?: boolean
  sello?: ReactNode
  boton?: string
  tono?: 'buena' | 'neutra'
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
      {papelillo && <Confetti />}
      <div className="celebration" onClick={(event) => event.stopPropagation()}>
        <div className={`celebration-seal${tono === 'neutra' ? ' neutra' : ''}`}>
          {sello ?? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12.5l5.2 5.2L20 6.9" />
            </svg>
          )}
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
          {boton}
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

/** Lo que hace falta para contar cómo fue un mes. */
export interface ResumenMes {
  /** El primer día del mes contado, como «2026-07-01». */
  mes: string
  income: number
  expense: number
  net: number
  currency: string
  movimientos: number
  /** La categoría que más se llevó, si hubo alguna. */
  mayor: { name: string; total: number } | null
  /** Lo gastado el mes de antes, para decir si has subido o bajado. */
  gastoAntes: number
}

/** «julio», y con el año si no es el de ahora. */
function nombreDelMes(iso: string): string {
  const nombre = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(
    new Date(`${iso}T12:00:00`)
  )
  const conMayuscula = nombre.charAt(0).toUpperCase() + nombre.slice(1)
  const anio = iso.slice(0, 4)
  return anio === todayISO().slice(0, 4) ? conMayuscula : `${conMayuscula} de ${anio}`
}

/**
 * Cómo fue el mes que acaba de cerrarse.
 *
 * Sale una vez al mes y sin papelillo. La enhorabuena de una deuda es un premio
 * —has terminado de pagar algo— y esto es un parte: unos meses saldrán bien y
 * otros no, y darle formato de fiesta a «has gastado trescientos euros más» no
 * cuadra. El sello se pone verde solo cuando de verdad hay algo que celebrar:
 * que hayas cerrado el mes en positivo.
 *
 * Lo que se dice arriba también sigue al dato. Sin adornar un mal mes ni
 * regañar por él: el número ya lo dice.
 */
export function MonthlySummary({
  resumen,
  onClose
}: {
  resumen: ResumenMes
  onClose: () => void
}): ReactNode {
  const enPositivo = resumen.net >= 0
  const diferencia = resumen.expense - resumen.gastoAntes
  const hayConQueComparar = resumen.gastoAntes > 0

  const comparado = !hayConQueComparar
    ? 'Es el primer mes con movimientos que se puede contar.'
    : diferencia === 0
      ? 'Exactamente lo mismo que el mes anterior.'
      : `${formatMoney(Math.abs(diferencia), resumen.currency)} ${diferencia > 0 ? 'más' : 'menos'} que el mes anterior.`

  const balance = enPositivo
    ? `Cerraste en positivo por ${formatMoney(resumen.net, resumen.currency)}.`
    : `Se fueron ${formatMoney(Math.abs(resumen.net), resumen.currency)} más de los que entraron.`

  return (
    <Party
      title={`${nombreDelMes(resumen.mes)}, en resumen`}
      lede={`${balance} ${comparado}`}
      papelillo={false}
      tono={enPositivo ? 'buena' : 'neutra'}
      boton="Entendido"
      sello={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
      }
      stats={[
        { value: formatMoney(resumen.income, resumen.currency), label: 'entró' },
        { value: formatMoney(resumen.expense, resumen.currency), label: 'salió' },
        resumen.mayor
          ? { value: formatMoney(resumen.mayor.total, resumen.currency), label: `en ${resumen.mayor.name}` }
          : { value: String(resumen.movimientos), label: 'movimientos' }
      ]}
      onClose={onClose}
    />
  )
}

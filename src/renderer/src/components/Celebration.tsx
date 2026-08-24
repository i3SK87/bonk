import { useEffect, useRef, type ReactNode } from 'react'
import { Avatar } from './ui'
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
/**
 * Estrellas para el resumen del mes, en vez de papelillo.
 *
 * El papelillo estalla hacia arriba y cae: es una fiesta. Estas suben despacio y
 * se apagan, que acompaña sin celebrar nada en concreto —el mes puede haber ido
 * bien o mal y el cuadro sale igual—. Giran mientras suben y parpadean un poco,
 * lo justo para que no parezcan puntos quietos.
 */
function Estrellas(): ReactNode {
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

    /** Una estrella de cinco puntas, dibujada desde su centro. */
    const punta = (x: number, y: number, radio: number, giro: number): void => {
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        // Alternando radio grande y pequeño salen las cinco puntas.
        const r = i % 2 === 0 ? radio : radio * 0.42
        const angulo = giro + (i * Math.PI) / 5 - Math.PI / 2
        const px = x + Math.cos(angulo) * r
        const py = y + Math.sin(angulo) * r
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
    }

    const cuantas = 46
    const piezas = Array.from({ length: cuantas }, () => ({
      x: Math.random() * rect.width,
      // Empiezan repartidas por debajo del borde, para que entren escalonadas.
      y: rect.height + Math.random() * rect.height * 0.9,
      vy: -(34 + Math.random() * 58),
      vx: (Math.random() - 0.5) * 24,
      radio: 3 + Math.random() * 6,
      giro: Math.random() * Math.PI,
      vueltas: (Math.random() - 0.5) * 1.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      // Cada una parpadea a su ritmo: todas a la vez parecería un fallo.
      fase: Math.random() * Math.PI * 2,
      ritmo: 1.6 + Math.random() * 2.2
    }))

    // Con el movimiento reducido se quedan puestas, sin subir ni parpadear.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const e of piezas) {
        ctx.globalAlpha = 0.5
        ctx.fillStyle = e.color
        punta(e.x, e.y - rect.height * 0.55, e.radio, e.giro)
      }
      return
    }

    let frame = 0
    let last = performance.now()
    let vivido = 0

    const tick = (now: number): void => {
      const dt = Math.min(0.032, (now - last) / 1000)
      last = now
      vivido += dt
      ctx.clearRect(0, 0, rect.width, rect.height)

      // Se apagan a la vez al final, que si no se quedarían dando vueltas.
      const apagado = Math.max(0, 1 - Math.max(0, vivido - 3.4) / 1.4)
      if (apagado <= 0) return

      for (const e of piezas) {
        e.y += e.vy * dt
        e.x += e.vx * dt
        e.giro += e.vueltas * dt
        // La que se sale por arriba vuelve por abajo mientras dure la entrada.
        if (e.y < -20) e.y = rect.height + 20

        const brillo = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(vivido * e.ritmo + e.fase))
        ctx.globalAlpha = brillo * apagado
        ctx.fillStyle = e.color
        punta(e.x, e.y, e.radio, e.giro)
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}

/**
 * El sello, el adorno y el botón: la maqueta de lo que se enseña en grande.
 *
 * El papelillo es opcional porque no todo lo que sale así es una fiesta. Un
 * resumen del mes es neutro, y bastantes meses será malo: sacar «has gastado
 * trescientos euros más» con confeti chirría. Misma caja, distinto adorno.
 */
function Party({
  title,
  lede,
  stats,
  children,
  onClose,
  adorno = 'papelillo',
  sello,
  boton = 'Bien',
  tono,
  ancha
}: {
  title: string
  lede: string
  /** Las tres cifras en fila; o nada, si lo que se cuenta va en `children`. */
  stats?: Array<{ value: string; label: string }>
  children?: ReactNode
  onClose: () => void
  adorno?: 'papelillo' | 'estrellas' | null
  sello?: ReactNode
  boton?: string
  tono?: 'buena' | 'neutra'
  /** A lo ancho, para lo que no cabe en la caja estrecha de una enhorabuena. */
  ancha?: boolean
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
      {adorno === 'papelillo' && <Confetti />}
      {adorno === 'estrellas' && <Estrellas />}
      <div
        className={`celebration${ancha ? ' ancha' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
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

        {stats && stats.length > 0 && (
          <div className="celebration-stats">
            {stats.map((stat) => (
              <div key={stat.label}>
                <b>{stat.value}</b>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        )}

        {children}

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


/** Una categoría dentro del resumen del mes. */
export interface LineaResumen {
  name: string
  total: number
  icon: string
  color: string
}

/** Cómo fue un mes, con todo lo que hace falta para contarlo. */
export interface ResumenMes {
  /** El primer día del mes contado, como «2026-07-01». */
  mes: string
  ingresos: number
  gastos: number
  balance: number
  currency: string
  /** Lo que queda por pagar de las deudas a plazos, a día de hoy. */
  deudaRestante: number
  /** Lo mismo el mes de antes, para decir si has subido o bajado. */
  gastosAntes: number
  ingresosAntes: number
  /** Hasta cinco de cada, de mayor a menor. */
  porGasto: LineaResumen[]
  porIngreso: LineaResumen[]
}

/** «Julio», y con el año si no es el de ahora. */
function nombreDelMes(iso: string): string {
  const nombre = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(
    new Date(`${iso}T12:00:00`)
  )
  const conMayuscula = nombre.charAt(0).toUpperCase() + nombre.slice(1)
  const anio = iso.slice(0, 4)
  return anio === todayISO().slice(0, 4) ? conMayuscula : `${conMayuscula} de ${anio}`
}

/**
 * Una columna del resumen: gastos o ingresos, con sus cinco mayores.
 *
 * La barra mide contra la mayor de su propia columna y no contra el total: si se
 * midiera contra el total, cinco categorías repartidas saldrían todas planas y
 * no se vería cuál pesa.
 */
function Columna({
  titulo,
  total,
  antes,
  lineas,
  currency,
  kind
}: {
  titulo: string
  total: number
  antes: number
  lineas: LineaResumen[]
  currency: string
  kind: 'expense' | 'income'
}): ReactNode {
  const mayor = Math.max(1, ...lineas.map((l) => l.total))
  const delta = total - antes
  // Gastar más es malo; ingresar más es bueno. El color sigue al significado.
  const tono = delta === 0 ? 'muted' : delta > 0 === (kind === 'expense') ? 'negative' : 'positive'

  return (
    <div className="resumen-columna">
      <div className="resumen-columna-cabecera">
        <span className="label">{titulo}</span>
        <strong className={`amount ${kind === 'expense' ? 'negative' : 'positive'}`}>
          {formatMoney(total, currency)}
        </strong>
        {antes > 0 && delta !== 0 && (
          <span
            className={`cambio ${tono}`}
            title={`${formatMoney(total, currency)} este mes · ${formatMoney(antes, currency)} el anterior`}
          >
            {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round((delta / antes) * 100))}%
          </span>
        )}
      </div>

      {lineas.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          Nada este mes.
        </p>
      ) : (
        <ul className="resumen-lista">
          {lineas.map((linea) => (
            <li key={linea.name}>
              <Avatar icon={linea.icon} color={linea.color} size="small" />
              <span className="resumen-nombre">{linea.name}</span>
              <span className="amount">{formatMoney(linea.total, currency)}</span>
              <div className="resumen-barra">
                <div style={{ width: `${(linea.total / mayor) * 100}%`, background: linea.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Cómo fue el mes que acaba de cerrarse.
 *
 * Sale una vez al mes, y a lo ancho: lo que se cuenta son dos listas de cinco
 * categorías, y eso no cabe en la caja estrecha de una enhorabuena.
 *
 * Lleva estrellas en vez de papelillo. El papelillo es de la deuda saldada, que
 * es un premio; esto es un parte, y unos meses saldrán bien y otros no. Las
 * estrellas hacen la entrada bonita sin celebrar nada en concreto.
 */
export function MonthlySummary({
  resumen,
  onClose
}: {
  resumen: ResumenMes
  onClose: () => void
}): ReactNode {
  const enPositivo = resumen.balance >= 0

  return (
    <Party
      ancha
      title={`${nombreDelMes(resumen.mes)}, en resumen`}
      lede={
        enPositivo
          ? `Balance positivo de ${formatMoney(resumen.balance, resumen.currency)}.`
          : `Balance negativo de ${formatMoney(Math.abs(resumen.balance), resumen.currency)}.`
      }
      adorno="estrellas"
      tono={enPositivo ? 'buena' : 'neutra'}
      boton="Entendido"
      sello={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
      }
      onClose={onClose}
    >
      <div className="resumen-columnas">
        <Columna
          titulo="Gastos"
          total={resumen.gastos}
          antes={resumen.gastosAntes}
          lineas={resumen.porGasto}
          currency={resumen.currency}
          kind="expense"
        />
        <Columna
          titulo="Ingresos"
          total={resumen.ingresos}
          antes={resumen.ingresosAntes}
          lineas={resumen.porIngreso}
          currency={resumen.currency}
          kind="income"
        />
      </div>

      {resumen.deudaRestante > 0 && (
        <p className="resumen-deuda">
          Deuda restante: <strong>{formatMoney(resumen.deudaRestante, resumen.currency)}</strong>
        </p>
      )}
    </Party>
  )
}

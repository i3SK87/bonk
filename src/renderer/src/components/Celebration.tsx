import { useEffect, useRef, type ReactNode } from 'react'
import { Avatar, BarraCuotas } from './ui'
import { formatMoney } from '@shared/money'
import { today as todayISO, addMonths } from '@shared/dates'
import { findLender } from '@shared/lenders'
import { porcentajeDePresupuesto, AVISO_CERCA } from '@shared/presupuestos'
import type { Settlement, GoalReached, PresupuestoPasado, DebtProgress } from '@shared/types'

/**
 * La enhorabuena por una deuda saldada.
 *
 * Es el único sitio de la aplicación donde se celebra algo, y no se celebra
 * cualquier cosa: que se acabe una suscripción no es una buena noticia. Solo
 * las categorías marcadas como deuda a plazos llegan hasta aquí.
 */

/** Los mismos colores que llevan las categorías en las listas. */
const COLORS = ['#64d2ff', '#40d873', '#ffb340', '#ff6961', '#f090c4', '#5fd8c4', '#a78bfa']

/** Las estrellas van todas de un amarillo: de muchos colores parecían papelillo. */
const AMARILLO = '#ffce3d'

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

/**
 * El estallido de la celebración: papelillo o estrellas, la misma física.
 *
 * Sale disparado hacia arriba desde detrás del título, la gravedad lo devuelve y
 * se va apagando por el camino. Las estrellas tuvieron lo suyo —subían despacio
 * desde abajo y parpadeaban— y no era lo mismo: lo que se quiere ver es que
 * broten, no que floten.
 *
 * Solo cambian dos cosas entre una forma y otra: qué se dibuja y de qué color.
 * El resto —velocidades, gravedad, giro, apagado— es idéntico, así que vive una
 * sola vez y no en dos animaciones que se van separando con cada retoque.
 */
function Estallido({ forma = 'papelillo' }: { forma?: 'papelillo' | 'estrella' }): ReactNode {
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

    /*
     * Una estrella de cinco puntas, centrada en el origen del lienzo.
     *
     * Se dibuja sin girarla: el giro ya lo trae puesto el propio lienzo cuando
     * se la coloca, igual que con el papelillo.
     */
    const estrella = (radio: number): void => {
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        // Alternando radio grande y pequeño salen las cinco puntas.
        const r = i % 2 === 0 ? radio : radio * 0.42
        const angulo = (i * Math.PI) / 5 - Math.PI / 2
        const px = Math.cos(angulo) * r
        const py = Math.sin(angulo) * r
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
    }

    /** Cada pieza, ya girada y colocada por quien la llama. */
    const pintar = (piece: Piece): void => {
      ctx.fillStyle = piece.color
      if (forma === 'estrella') {
        estrella(piece.w * 0.8)
        return
      }
      // Un papelillo que gira se ve más estrecho: se estrecha el ancho.
      ctx.fillRect(
        -piece.w / 2,
        -piece.h / 2,
        piece.w * Math.abs(Math.cos(piece.rot * 1.4)) + 1.5,
        piece.h
      )
    }

    const pieces: Piece[] = []
    const originX = rect.width / 2
    const originY = rect.height / 2 - 130

    // Menos estrellas que papelillos: ocupan más y con ciento diez se tapan.
    const cuantas = forma === 'estrella' ? 76 : 110
    for (let i = 0; i < cuantas; i++) {
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
        color: forma === 'estrella' ? AMARILLO : COLORS[Math.floor(Math.random() * COLORS.length)],
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
        pintar(piece)
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
        pintar(piece)
        ctx.restore()
      }

      if (alive > 0) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [forma])

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
  boton = 'Continuar',
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
  /**
   * De qué color va el sello.
   *
   * `buena` es el verde del dinero, `neutra` lo apaga —el resumen de un mes no
   * siempre trae buenas noticias— y `aviso` lo pone en rojo. El rojo se reserva
   * para lo que has cruzado tú: pasarse de un presupuesto es una raya que te
   * pusiste y te has saltado, y ahí el sello sí puede decirlo.
   */
  tono?: 'buena' | 'neutra' | 'aviso'
  /** A lo ancho, para lo que no cabe en la caja estrecha de una enhorabuena. */
  ancha?: boolean
}): ReactNode {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter') onClose()
      // El único botón es el de cerrar, que ya tiene el foco: tabular solo
      // podría llevárselo a la lista de detrás del velo.
      if (event.key === 'Tab') event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      {adorno === 'papelillo' && <Estallido />}
      {adorno === 'estrellas' && <Estallido forma="estrella" />}
      <div
        className={`celebration${ancha ? ' ancha' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`celebration-seal${tono && tono !== 'buena' ? ` ${tono}` : ''}`}>
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


/**
 * Te acabas de pasar de un presupuesto.
 *
 * No pregunta nada ni deja nada a medias: el movimiento ya está guardado y esto
 * es el parte. Un «¿seguro que quieres pasarte?» antes de guardar convertiría
 * cada compra grande en un trámite, y además llegaría tarde —el presupuesto lo
 * cruzan tres cafés tanto como una compra de doscientos euros—.
 *
 * Sale una vez por categoría y mes, la misma marca que gobierna el aviso de
 * Windows: pasarse dos veces del mismo presupuesto en el mismo mes no es una
 * noticia nueva.
 */
export function PresupuestoPasadoAviso({
  presupuesto,
  onClose
}: {
  presupuesto: PresupuestoPasado
  onClose: () => void
}): ReactNode {
  const exceso = presupuesto.spent - presupuesto.limit
  const veces = presupuesto.limit > 0 ? presupuesto.spent / presupuesto.limit : 0

  return (
    <Party
      title={`Te has pasado en ${presupuesto.name}`}
      lede={
        veces >= 2
          ? `Llevas más del doble de lo que te pusiste para este mes.`
          : `Lo que te pusiste para este mes ya está gastado, y quedan días por delante.`
      }
      adorno={null}
      tono="aviso"
      boton="Vale"
      sello={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3.5L21 19.5H3z" />
          <path d="M12 10v4M12 17.2v.1" />
        </svg>
      }
      stats={[
        { value: formatMoney(presupuesto.spent, presupuesto.currency), label: 'gastado' },
        { value: formatMoney(presupuesto.limit, presupuesto.currency), label: 'de presupuesto' },
        { value: formatMoney(exceso, presupuesto.currency), label: 'de más' }
      ]}
      onClose={onClose}
    />
  )
}

/** Una categoría de gasto que ha subido frente al mes de antes. */
export interface LineaSubida {
  name: string
  icon: string
  color: string
  total: number
  /** Lo que se gastó en ella el mes anterior; cero si no hubo nada. */
  antes: number
}

/** Un presupuesto dentro del resumen del mes: lo que te pusiste y lo que gastaste. */
export interface LineaPresupuesto {
  name: string
  icon: string
  color: string
  spent: number
  limit: number
}

/** Cómo fue un mes, con todo lo que hace falta para contarlo. */
export interface ResumenMes {
  /** El primer día del mes contado, como «2026-07-01». */
  mes: string
  ingresos: number
  gastos: number
  /** Todo lo que entró en las cuentas de ahorro. */
  ahorrado: number
  balance: number
  currency: string
  /** Lo mismo el mes de antes, para decir cuánto has subido o bajado. */
  gastosAntes: number
  ingresosAntes: number
  ahorradoAntes: number
  /** Las categorías de gasto que más han subido frente al mes de antes, hasta cuatro. */
  subidas: LineaSubida[]
  /** Los presupuestos que tenías puestos, y cómo salió el mes con ellos. */
  presupuestos: LineaPresupuesto[]
  /** Las deudas a plazos que quedan por pagar, a día de hoy. */
  deudas: DebtProgress[]
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

/** «agosto», para decir contra qué se compara. Sin año: es el mes de justo antes. */
function mesAnterior(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(
    new Date(`${addMonths(iso, -1)}T12:00:00`)
  )
}

/** «5 oct», para la próxima cuota. */
function diaCorto(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
    .format(new Date(`${iso}T12:00:00`))
    .replace('.', '')
}

/** «marzo de 2027», para cuándo se acaba una deuda. */
function mesYAnio(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
    new Date(`${iso}T12:00:00`)
  )
}

/**
 * Una de las cifras grandes de arriba, y cuánto se ha movido en euros frente al
 * mes de antes. En euros y no en tanto por ciento: lo que se quiere saber es
 * cuánto dinero, no cuánto de proporción.
 */
function Total({
  titulo,
  total,
  antes,
  mes,
  currency,
  subirEsBueno,
  tono
}: {
  titulo: string
  total: number
  antes: number
  mes: string
  currency: string
  /** Gastar más es malo; ingresar o ahorrar más es bueno. El color sigue al significado. */
  subirEsBueno: boolean
  /** El color de la cifra. */
  tono: 'negative' | 'positive' | 'accent'
}): ReactNode {
  const delta = total - antes
  const cambio = delta > 0 === subirEsBueno ? 'positive' : 'negative'

  return (
    <div className="resumen-total">
      <span className="resumen-rotulo">{titulo}</span>
      <strong className={`amount ${tono}`}>{formatMoney(total, currency)}</strong>
      {antes > 0 &&
        (delta === 0 ? (
          <span className="cambio muted">Igual que en {mesAnterior(mes)}</span>
        ) : (
          <span className={`cambio ${cambio}`}>
            {delta > 0 ? '▲' : '▼'} {formatMoney(Math.abs(delta), currency)}{' '}
            <span className="muted">
              {delta > 0 ? 'más' : 'menos'} que en {mesAnterior(mes)}
            </span>
          </span>
        ))}
    </div>
  )
}

/**
 * Cómo fue el mes que acaba de cerrarse.
 *
 * Sale una vez al mes, y a lo ancho: lo que se cuenta son varias listas, y eso
 * no cabe en la caja estrecha de una enhorabuena.
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
  const { currency } = resumen
  // La barra de las subidas mide contra la mayor cifra de las dos que se
  // comparan, la de este mes o la del anterior, para que la raya de antes quepa.
  const escala = Math.max(1, ...resumen.subidas.flatMap((linea) => [linea.total, linea.antes]))
  const restante = resumen.deudas.reduce((suma, deuda) => suma + Math.max(0, deuda.left ?? 0), 0)
  const alMes = resumen.deudas.reduce((suma, deuda) => suma + deuda.monthlyCost, 0)

  return (
    <Party
      ancha
      title={`${nombreDelMes(resumen.mes)}, en resumen`}
      lede={
        enPositivo
          ? `Balance positivo de ${formatMoney(resumen.balance, currency)}.`
          : `Balance negativo de ${formatMoney(Math.abs(resumen.balance), currency)}.`
      }
      adorno="estrellas"
      tono={enPositivo ? 'buena' : 'neutra'}
      sello={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
      }
      onClose={onClose}
    >
      <div className="resumen-totales">
        <Total
          titulo="Gastos"
          total={resumen.gastos}
          antes={resumen.gastosAntes}
          mes={resumen.mes}
          currency={currency}
          subirEsBueno={false}
          tono="negative"
        />
        <Total
          titulo="Ingresos"
          total={resumen.ingresos}
          antes={resumen.ingresosAntes}
          mes={resumen.mes}
          currency={currency}
          subirEsBueno
          tono="positive"
        />
        <Total
          titulo="Ahorrado"
          total={resumen.ahorrado}
          antes={resumen.ahorradoAntes}
          mes={resumen.mes}
          currency={currency}
          subirEsBueno
          tono="accent"
        />
      </div>

      {/*
        No todas las categorías: las que más han subido, que es lo que hay que
        mirar. La barra es lo de este mes y la rayita, dónde estaba el anterior.
      */}
      {resumen.subidas.length > 0 && (
        <section className="resumen-bloque">
          <div className="resumen-bloque-cabecera">
            <span className="resumen-rotulo">Lo que más ha subido</span>
            <span className="small muted">frente a {mesAnterior(resumen.mes)}</span>
          </div>
          <ul className="resumen-lista">
            {resumen.subidas.map((linea) => (
              <li key={linea.name} className="resumen-subida">
                <Avatar icon={linea.icon} color={linea.color} size="small" />
                <span className="resumen-nombre">{linea.name}</span>
                <span className="small muted">
                  {linea.antes > 0 ? formatMoney(linea.antes, currency) : 'nada'} →
                </span>
                <span className="amount">{formatMoney(linea.total, currency)}</span>
                <span className="cambio negative">+{formatMoney(linea.total - linea.antes, currency)}</span>
                <div className="resumen-barra resumen-barra-comparada">
                  <div style={{ width: `${(linea.total / escala) * 100}%`, background: linea.color }} />
                  {linea.antes > 0 && (
                    <span className="resumen-antes" style={{ left: `${(linea.antes / escala) * 100}%` }} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        Cómo fue el mes con lo que te habías puesto, en dos columnas para que
        ocupe poco. Un presupuesto no es una categoría más del reparto, es la
        raya que tú pusiste, y la gracia de verlo aquí es el mes ya cerrado —ni
        ritmo ni proyección, lo que pasó—. Sin presupuestos puestos, ni sale.
      */}
      {resumen.presupuestos.length > 0 && (
        <section className="resumen-bloque">
          <div className="resumen-bloque-cabecera">
            <span className="resumen-rotulo">Presupuestos</span>
          </div>
          <div className="resumen-presupuestos">
            {resumen.presupuestos.map((presupuesto) => {
              const delta = presupuesto.spent - presupuesto.limit
              const pasado = delta > 0
              const porcentaje = porcentajeDePresupuesto(presupuesto.spent, presupuesto.limit)
              const lleno = Math.min(100, porcentaje)
              // La misma raya que en Informes: en rojo lo que pasó del 80 %, y
              // solo eso. Aquí no late: el mes ya está cerrado y no hay nada
              // que corregir, es un parte de cómo fue.
              const exceso = lleno > AVISO_CERCA ? lleno - AVISO_CERCA : 0
              return (
                <div key={presupuesto.name} className="resumen-presupuesto">
                  <Avatar icon={presupuesto.icon} color={presupuesto.color} size="small" />
                  <div className="resumen-texto">
                    <span className="resumen-nombre">{presupuesto.name}</span>
                    <span className="small muted">
                      {formatMoney(presupuesto.spent, currency)} de{' '}
                      {formatMoney(presupuesto.limit, currency)}
                    </span>
                  </div>
                  {delta !== 0 && (
                    <span className={`cambio ${pasado ? 'negative' : 'positive'}`}>
                      {pasado ? '▲' : '▼'} {formatMoney(Math.abs(delta), currency)}
                    </span>
                  )}
                  {/* La misma barra que en Informes: el color se planta en la
                      raya, lo de más allá es rojo, y la raya negra dice dónde
                      estaba el límite. Sin latido, que el mes ya pasó. */}
                  <div className="resumen-barra">
                    <div
                      className={exceso > 0 ? 'a-escuadra' : undefined}
                      style={{ width: `${Math.min(lleno, AVISO_CERCA)}%`, background: presupuesto.color }}
                    />
                    {exceso > 0 && (
                      <div
                        className="progress-exceso"
                        style={{ left: `${AVISO_CERCA}%`, width: `${exceso}%` }}
                      />
                    )}
                    <div className="progress-marca" style={{ left: `${AVISO_CERCA}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/*
        Las deudas vivas, cada una con lo que hace falta para saber cómo va: quién
        la cobra, la cuota, cuándo toca la próxima, cuándo se acaba y lo que
        falta. La barra es la de Deudas, cuota a cuota.
      */}
      {resumen.deudas.length > 0 && (
        <section className="resumen-bloque">
          <div className="resumen-bloque-cabecera">
            <span className="resumen-rotulo">Deudas</span>
            <span className="small muted">
              <strong className="amount negative">{formatMoney(restante, currency)}</strong> por
              pagar · {formatMoney(alMes, currency)}/mes
            </span>
          </div>
          <ul className="resumen-lista">
            {resumen.deudas.map((deuda) => {
              const quienCobra = findLender(deuda.lender)
              return (
                <li key={deuda.scheduledId} className="resumen-deuda">
                  <Avatar
                    icon={deuda.categoryIcon ?? 'debt'}
                    color={deuda.categoryColor ?? '#8E8E93'}
                    size="small"
                  />
                  <div className="resumen-texto">
                    <span className="row tight">
                      <span className="resumen-nombre">{deuda.title}</span>
                      {quienCobra && (
                        <span className="pill">
                          <img src={quienCobra.logo} alt="" />
                          {quienCobra.name}
                        </span>
                      )}
                    </span>
                    <span className="small muted">
                      {formatMoney(deuda.installment, currency)}/{deuda.cadence} · próxima el{' '}
                      {diaCorto(deuda.nextDate)}
                      {deuda.endDate ? ` · acaba en ${mesYAnio(deuda.endDate)}` : ''}
                    </span>
                  </div>
                  <div className="resumen-falta">
                    <span className="amount">Faltan {formatMoney(deuda.left ?? 0, currency)}</span>
                    {deuda.leftCount != null && (
                      <span className="small muted">
                        {deuda.leftCount === 1 ? 'Queda 1 cuota' : `Quedan ${deuda.leftCount} cuotas`}
                      </span>
                    )}
                  </div>
                  {deuda.leftCount != null && (
                    <div className="resumen-cuotas">
                      <BarraCuotas pagadas={deuda.paidCount} restantes={deuda.leftCount} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </Party>
  )
}

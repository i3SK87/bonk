import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { formatMoney, toMajor } from '@shared/money'
import { formatShortMonth, formatMonth } from '@shared/dates'
import type { MonthlyPoint } from '@shared/types'

/** Mide el ancho real del contenedor para dibujar el SVG a tamaño natural, sin deformar el texto. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)

  // El ancho vive también en una referencia para poder comparar sin que el
  // observador dependa del estado: si no, se destruía y recreaba en cada píxel.
  const last = useRef(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const apply = (next: number): void => {
      if (next && Math.abs(next - last.current) > 1) {
        last.current = next
        setWidth(next)
      }
    }

    const observer = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? 0))
    observer.observe(element)
    apply(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

/** Redondea el tope del eje a 1, 2 o 5 por potencia de diez para que las guías caigan en cifras limpias. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10
  return step * magnitude
}

/** Barra con las esquinas superiores redondeadas y la base recta, apoyada en la línea cero. */
function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.min(radius, width / 2, Math.max(0, height))
  if (height <= 0) return ''
  return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`
}

interface Tooltip {
  x: number
  y: number
  content: ReactNode
}

function TooltipBox({ tooltip, width }: { tooltip: Tooltip; width: number }): ReactNode {
  // Se voltea al lado contrario cuando el punto está cerca del borde derecho.
  const flip = tooltip.x > width - 150
  return (
    <div
      style={{
        position: 'absolute',
        left: flip ? undefined : tooltip.x + 12,
        right: flip ? width - tooltip.x + 12 : undefined,
        top: Math.max(4, tooltip.y - 10),
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-md)',
        padding: '8px 10px',
        fontSize: 12,
        pointerEvents: 'none',
        zIndex: 5,
        minWidth: 130
      }}
    >
      {tooltip.content}
    </div>
  )
}

/* ============================================================
   Ingresos y gastos mes a mes
   ============================================================ */

export function MonthlyBars({
  points,
  currency,
  height = 240
}: {
  points: MonthlyPoint[]
  currency: string
  height?: number
}): ReactNode {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)

  // Sin datos, un eje repitiendo ceros no dice nada: mejor explicarlo con palabras.
  const hasData = points.some((point) => point.income > 0 || point.expense > 0)

  const padding = { top: 14, right: 12, bottom: 26, left: 56 }
  const plotWidth = Math.max(60, width - padding.left - padding.right)
  const plotHeight = height - padding.top - padding.bottom

  const max = niceMax(Math.max(1, ...points.map((point) => Math.max(point.income, point.expense))))
  const scale = (value: number): number => (value / max) * plotHeight

  const band = plotWidth / Math.max(1, points.length)
  // Tope de 24 px por barra: el resto de la banda se queda en aire.
  const barWidth = Math.min(24, Math.max(5, band / 2 - 4))
  const gap = 2

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max)
  const hovered = hover != null ? points[hover] : null

  if (!hasData) {
    return (
      <div ref={ref} style={{ height, display: 'grid', placeItems: 'center' }}>
        <p className="small muted center">
          Aquí verás la comparación de ingresos y gastos cuando registres movimientos.
        </p>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} role="img" aria-label="Ingresos y gastos por mes">
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - scale(tick)
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={padding.left + plotWidth}
                y1={y}
                y2={y}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10.5}
                fill="var(--fg-subtle)"
              >
                {new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(
                  toMajor(tick, currency)
                )}
              </text>
            </g>
          )
        })}

        {points.map((point, index) => {
          const centre = padding.left + band * index + band / 2
          const incomeHeight = scale(point.income)
          const expenseHeight = scale(point.expense)
          const baseline = padding.top + plotHeight
          const active = hover === index

          return (
            <g key={point.month}>
              {/* Zona de escucha más ancha que las barras, para que el ratón no tenga que afinar. */}
              <rect
                x={padding.left + band * index}
                y={padding.top}
                width={band}
                height={plotHeight}
                fill={active ? 'var(--bg-sunken)' : 'transparent'}
                opacity={active ? 0.6 : 1}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              />
              <path
                d={barPath(centre - barWidth - gap / 2, baseline - incomeHeight, barWidth, incomeHeight)}
                fill="var(--series-income)"
                pointerEvents="none"
              />
              <path
                d={barPath(centre + gap / 2, baseline - expenseHeight, barWidth, expenseHeight)}
                fill="var(--series-expense)"
                pointerEvents="none"
              />
              <text
                x={centre}
                y={baseline + 16}
                textAnchor="middle"
                fontSize={10.5}
                fill={active ? 'var(--fg)' : 'var(--fg-subtle)'}
                pointerEvents="none"
              >
                {formatShortMonth(point.month)}
              </text>
            </g>
          )
        })}

        <line
          x1={padding.left}
          x2={padding.left + plotWidth}
          y1={padding.top + plotHeight}
          y2={padding.top + plotHeight}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
      </svg>

      {hovered && hover != null && (
        <TooltipBox
          width={width}
          tooltip={{
            x: padding.left + band * hover + band / 2,
            y: 20,
            content: (
              <>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{formatMonth(hovered.month)}</div>
                <div className="row tight">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--series-income)' }} />
                  <span className="muted">Ingresos</span>
                  <span className="spacer" />
                  <span className="amount">{formatMoney(hovered.income, currency)}</span>
                </div>
                <div className="row tight">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--series-expense)' }} />
                  <span className="muted">Gastos</span>
                  <span className="spacer" />
                  <span className="amount">{formatMoney(hovered.expense, currency)}</span>
                </div>
                <div className="row tight" style={{ marginTop: 3, paddingTop: 3, borderTop: '1px solid var(--border)' }}>
                  <span className="muted">Balance</span>
                  <span className="spacer" />
                  <span className={`amount ${hovered.net >= 0 ? 'positive' : 'negative'}`}>
                    {formatMoney(hovered.net, currency, { sign: true })}
                  </span>
                </div>
              </>
            )
          }}
        />
      )}

      <ChartLegend
        items={[
          { label: 'Ingresos', color: 'var(--series-income)' },
          { label: 'Gastos', color: 'var(--series-expense)' }
        ]}
      />
    </div>
  )
}

export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }): ReactNode {
  return (
    <div className="row tight" style={{ justifyContent: 'center', marginTop: 6 }}>
      {items.map((item) => (
        <span key={item.label} className="row tight small muted" style={{ marginRight: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: item.color, display: 'inline-block' }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

/* ============================================================
   Evolución del balance mensual
   ============================================================ */

export function NetLine({
  points,
  currency,
  height = 180
}: {
  points: MonthlyPoint[]
  currency: string
  height?: number
}): ReactNode {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)

  const padding = { top: 16, right: 14, bottom: 24, left: 56 }
  const plotWidth = Math.max(60, width - padding.left - padding.right)
  const plotHeight = height - padding.top - padding.bottom

  const values = points.map((point) => point.net)
  const max = niceMax(Math.max(1, ...values.map(Math.abs)))
  const zeroY = padding.top + plotHeight / 2
  const scale = (value: number): number => zeroY - (value / max) * (plotHeight / 2)

  if (!points.some((point) => point.net !== 0)) {
    return (
      <div ref={ref} style={{ height, display: 'grid', placeItems: 'center' }}>
        <p className="small muted center">Sin movimientos todavía, no hay balance que dibujar.</p>
      </div>
    )
  }

  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${padding.left + step * index},${scale(point.net)}`)
    .join(' ')

  const hovered = hover != null ? points[hover] : null

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} role="img" aria-label="Balance mensual">
        <line
          x1={padding.left}
          x2={padding.left + plotWidth}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
        {[max, -max].map((tick) => (
          <text
            key={tick}
            x={padding.left - 8}
            y={scale(tick) + 4}
            textAnchor="end"
            fontSize={10.5}
            fill="var(--fg-subtle)"
          >
            {new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(
              toMajor(tick, currency)
            )}
          </text>
        ))}

        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((point, index) => {
          const cx = padding.left + step * index
          const cy = scale(point.net)
          const active = hover === index
          return (
            <g key={point.month}>
              <circle cx={cx} cy={cy} r={active ? 5 : 4} fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth={2} />
              <rect
                x={cx - step / 2}
                y={padding.top}
                width={Math.max(step, 18)}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              />
              {index % 2 === 0 && (
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="var(--fg-subtle)"
                  pointerEvents="none"
                >
                  {formatShortMonth(point.month)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hovered && hover != null && (
        <TooltipBox
          width={width}
          tooltip={{
            x: padding.left + step * hover,
            y: 10,
            content: (
              <>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{formatMonth(hovered.month)}</div>
                <div className={`amount ${hovered.net >= 0 ? 'positive' : 'negative'}`}>
                  {formatMoney(hovered.net, currency, { sign: true })}
                </div>
              </>
            )
          }}
        />
      )}
    </div>
  )
}

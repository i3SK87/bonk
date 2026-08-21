import type { JSX } from 'react'

/**
 * Iconos propios en SVG. Van inline y no como fuente ni librería externa
 * porque la política de seguridad de la ventana bloquea cualquier recurso remoto.
 * Todos comparten lienzo de 24×24 y trazo de 1.8 para que combinen entre sí.
 */
const PATHS: Record<string, JSX.Element> = {
  // — Navegación —
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="8.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="2" />
      <rect x="3" y="15" width="7.5" height="6" rx="2" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="2" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.8" cy="6" r="1.2" />
      <circle cx="3.8" cy="12" r="1.2" />
      <circle cx="3.8" cy="18" r="1.2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.5a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.3 1.1z" />
    </>
  ),

  // — Cuentas —
  wallet: (
    <>
      <path d="M3 8a3 3 0 0 1 3-3h11a2 2 0 0 1 2 2v2" />
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <circle cx="16.5" cy="13.5" r="1.3" />
    </>
  ),
  bank: (
    <>
      <path d="M3 10h18L12 4 3 10z" />
      <path d="M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3 20h18" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  piggy: (
    <>
      <path d="M15.5 6.5A6.5 6.5 0 0 1 21 12.8V17h-2.5l-.8 2.5h-3l-.4-1.6h-2.6l-.4 1.6h-3L7.5 17H6a3 3 0 0 1-3-3v-2a2 2 0 0 1 2-2h1.2a6.5 6.5 0 0 1 5.3-3.5z" />
      <circle cx="16" cy="11.5" r="0.9" />
    </>
  ),
  invest: (
    <>
      <path d="M3 17l5.5-6 4 3.5L21 6" />
      <path d="M15.5 6H21v5.5" />
    </>
  ),
  debt: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2c0 2-2.5 1.8-2.5 3.5" />
      <circle cx="12" cy="16.5" r="0.9" />
    </>
  ),

  // — Categorías —
  cart: (
    <>
      <path d="M3 4h2.2l2.3 11h9.6l2.4-8H6.2" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </>
  ),
  restaurant: (
    <>
      <path d="M6 3v8a2.5 2.5 0 0 0 5 0V3M8.5 11v10" />
      <path d="M17.5 3c-1.7 1-2.5 3-2.5 5.5 0 1.6.7 2.5 2 2.8V21" />
    </>
  ),
  bus: (
    <>
      <rect x="4" y="4" width="16" height="12.5" rx="3" />
      <path d="M4 11h16M7 20v-2M17 20v-2" />
      <circle cx="8" cy="14" r="1" />
      <circle cx="16" cy="14" r="1" />
    </>
  ),
  fuel: (
    <>
      <rect x="4" y="4" width="10" height="16" rx="2.5" />
      <path d="M4 11h10M14 8h2.5a2 2 0 0 1 2 2v6a1.6 1.6 0 0 0 3.2 0v-6l-2.2-2.5" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5L12 4l8 6.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  bolt: (
    <>
      <path d="M13.5 3L5 13.5h5.5L10 21l8.5-10.5H13z" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M10.5 5.5h3" />
      <circle cx="12" cy="18" r="1" />
    </>
  ),
  health: (
    <>
      <path d="M12 20.5S3.5 15.5 3.5 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.5 2.5c0 6-8.5 11-8.5 11z" />
    </>
  ),
  fun: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
      <circle cx="9.2" cy="9.8" r="0.9" />
      <circle cx="14.8" cy="9.8" r="0.9" />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="4.5" width="19" height="13" rx="3" />
      <path d="M8 21h8M12 17.5V21" />
    </>
  ),
  clothes: (
    <>
      <path d="M8.5 3L4 6l2 3 2-1v11h8V8l2 1 2-3-4.5-3a3.5 3.5 0 0 1-7 0z" />
    </>
  ),
  beauty: (
    <>
      <path d="M9 3h6l-1 5H10z" />
      <rect x="8.5" y="8" width="7" height="13" rx="2.5" />
      <path d="M8.5 13h7" />
    </>
  ),
  sport: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5c-2.5 2.2-3.8 5.1-3.8 8.5s1.3 6.3 3.8 8.5M12 3.5c2.5 2.2 3.8 5.1 3.8 8.5s-1.3 6.3-3.8 8.5M3.5 12h17" />
    </>
  ),
  education: (
    <>
      <path d="M12 4L2.5 9 12 14l9.5-5z" />
      <path d="M6.5 11.2V16c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.8M21.5 9v5.5" />
    </>
  ),
  travel: (
    <>
      <path d="M2.5 15.5l19-6.5-1-2.5-6 1.5-5.5-4.5-2 .8 3 5-4 1-2.5-2-1.5.7z" />
      <path d="M6 20h13" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1.5" />
      <path d="M4.5 12v7a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7M12 8v13" />
      <path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5zM12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5z" />
    </>
  ),
  pet: (
    <>
      <ellipse cx="12" cy="15.5" rx="4.5" ry="4" />
      <ellipse cx="5.8" cy="10" rx="2" ry="2.6" />
      <ellipse cx="18.2" cy="10" rx="2" ry="2.6" />
      <ellipse cx="9.2" cy="5.8" rx="1.9" ry="2.4" />
      <ellipse cx="14.8" cy="5.8" rx="1.9" ry="2.4" />
    </>
  ),
  tax: (
    <>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-3.5-2-3.5 2-3.5-2L5 21V4a1 1 0 0 1 1-1z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v6c0 4.5-3 7.8-7.5 9.5C7.5 19.8 4.5 16.5 4.5 12V6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 11.5V4.5a1 1 0 0 1 1-1h7l9 9-8 8z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  salary: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M6 10v4M18 10v4" />
    </>
  ),
  tools: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0 5.2 5.2l-8 8a2.6 2.6 0 0 1-3.7-3.7z" />
      <path d="M6.5 4.5l3 3-2 2-3-3z" />
    </>
  ),
  calculator: (
    <>
      <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" />
      <rect x="7.5" y="5.5" width="9" height="3.5" rx="1" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 17.5h.01M12 17.5h.01M16 17.5h.01" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 5.5A2.5 2.5 0 0 0 13 3H6a2.5 2.5 0 0 0-2.5 2.5v7A2.5 2.5 0 0 0 6 15" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
      <path d="M4.5 6.5v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5" />
      <path d="M4.5 11.5v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5" />
    </>
  ),
  refund: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 3.5V9h5.5" />
    </>
  ),

  // — Acciones —
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  // Las dos barras y el triángulo de cualquier reproductor: pausar y reanudar
  // una programación es exactamente eso, y no hace falta explicarlo.
  //
  // Van macizos y no de línea, como los de un radiocasete: dos palotes gordos se
  // reconocen de lejos, mientras que dos rayas finas se confunden con cualquier
  // otra cosa a 16 px. Por eso llevan su relleno puesto en vez de esperar a que
  // se lo den desde fuera.
  pause: (
    <>
      <rect x="7" y="4.6" width="3.9" height="14.8" rx="1.1" fill="currentColor" stroke="none" />
      <rect x="13.1" y="4.6" width="3.9" height="14.8" rx="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M7.6 4.9v14.2l11.2-7.1z" fill="currentColor" stroke="none" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M14.5 5.5l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  chevronLeft: <path d="M14.5 6l-6 6 6 6" />,
  arrowUp: <path d="M12 20V4M5.5 10.5L12 4l6.5 6.5" />,
  arrowDown: <path d="M12 4v16M5.5 13.5L12 20l6.5-6.5" />,
  transfer: (
    <>
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 9V7.5A3.5 3.5 0 0 1 7.5 4H18l-3-3M20 15v1.5a3.5 3.5 0 0 1-3.5 3.5H6l3 3" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10.5l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 8.5l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  paperclip: (
    <path d="M20 11.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.4 3.4 0 0 1 4.8 4.8l-8.8 8.8a1.8 1.8 0 0 1-2.5-2.5l8-8" />
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M3.5 17l5-5 4 4 3-2.5 5 4.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5L21.5 20H2.5z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.2" r="0.9" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.9" />
    </>
  ),
  folder: <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20.5 3v5h-5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="11" rx="3" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1.5" />
      <path d="M5 8.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 12.5h4" />
    </>
  ),
  // La bandera a cuadros de la meta. Saldar una deuda antes de tiempo es cruzar
  // la línea, no archivar un papel; los cuadros van rellenos porque a 16 px un
  // damero de líneas se convierte en una mancha.
  finish: (
    <>
      <path d="M5.4 3.5v17" />
      <rect x="5.4" y="4.6" width="14" height="9" rx="1" />
      <rect x="5.4" y="4.6" width="4.66" height="4.5" fill="currentColor" stroke="none" />
      <rect x="14.74" y="4.6" width="4.66" height="4.5" fill="currentColor" stroke="none" />
      <rect x="10.07" y="9.1" width="4.66" height="4.5" fill="currentColor" stroke="none" />
    </>
  )
}

export type IconName = keyof typeof PATHS

interface IconProps {
  name: string
  size?: number
  className?: string
  strokeWidth?: number
  filled?: boolean
}

export function Icon({ name, size = 18, className, strokeWidth = 1.8, filled }: IconProps): JSX.Element {
  const path = PATHS[name] ?? PATHS.tag
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  )
}

/** Iconos ofrecidos en los selectores de categoría y cuenta. */
export const CATEGORY_ICONS: string[] = [
  'cart', 'restaurant', 'bus', 'fuel', 'home', 'bolt', 'phone', 'health', 'fun', 'tv',
  'clothes', 'beauty', 'sport', 'education', 'travel', 'gift', 'pet', 'tax', 'shield',
  'salary', 'tools', 'chart', 'coins', 'refund', 'invest', 'piggy', 'card', 'bank',
  'wallet', 'target', 'calendar', 'tag'
]

export const ACCOUNT_ICONS: string[] = [
  'wallet', 'bank', 'card', 'piggy', 'invest', 'debt', 'coins', 'home', 'travel', 'target'
]

/** Paleta de la app: tonos separados en tono y con contraste suficiente en ambos temas. */
export const PALETTE: string[] = [
  '#0A84FF', '#5AC8FA', '#00C7BE', '#34C759', '#30D158', '#FFCC00',
  '#FF9500', '#FF6B35', '#FF3B30', '#FF375F', '#FF2D55', '#FF6482',
  '#AF52DE', '#BF5AF2', '#5E5CE6', '#64D2FF', '#A2845E', '#8E8E93'
]

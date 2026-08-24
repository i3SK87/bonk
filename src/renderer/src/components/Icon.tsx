import type { JSX } from 'react'

/**
 * Iconos propios en SVG. Van inline y no como fuente ni librería externa
 * porque la política de seguridad de la ventana bloquea cualquier recurso remoto.
 * Todos comparten lienzo de 24×24 y trazo de 1.8 para que combinen entre sí.
 */
/*
 * Los iconos de las categorías vienen de Lucide.
 *
 * Dibujarlos a mano salía caro y corto: una lista de treinta y dos donde
 * siempre faltaba justo el que hacía falta. La clave sigue siendo la de
 * siempre —«cart», «restaurant»— para que ninguna categoría pierda su dibujo
 * al actualizar; lo que cambia es de dónde sale el trazo.
 *
 * Se importan uno a uno, y no la biblioteca entera, para que el empaquetado se
 * lleve solo estos y no los seis mil que trae.
 */
import {
  Baby,
  Bath,
  Bed,
  Bike,
  Book,
  Briefcase,
  Building2,
  Bus,
  Cake,
  Calendar,
  Camera,
  Car,
  ChartColumn,
  Cigarette,
  Cloud,
  Coffee,
  Coins,
  Cpu,
  CreditCard,
  Croissant,
  Dog,
  Drama,
  Droplet,
  Dumbbell,
  Film,
  Flame,
  Flower,
  Fuel,
  Gamepad2,
  Gift,
  Glasses,
  GraduationCap,
  Hammer,
  HandCoins,
  Headphones,
  Heart,
  HeartPulse,
  Hospital,
  House,
  Key,
  Landmark,
  Laptop,
  Leaf,
  Lightbulb,
  Luggage,
  Map,
  Monitor,
  Mountain,
  Newspaper,
  Package,
  Paintbrush,
  Palette,
  PartyPopper,
  PawPrint,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Popcorn,
  Printer,
  Receipt,
  Recycle,
  Rocket,
  Salad,
  Scale,
  School,
  Scissors,
  Shield,
  Ship,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Snowflake,
  Sofa,
  Sparkles,
  Sprout,
  Stethoscope,
  Store,
  Tag,
  Target,
  Ticket,
  ToyBrick,
  Train,
  TreePine,
  TrendingUp,
  Trophy,
  Truck,
  Tv,
  Umbrella,
  Undo2,
  University,
  Utensils,
  Wallet,
  Wifi,
  Wine,
  Wrench,
  Zap,
  type LucideIcon
} from 'lucide-react'

const LUCIDE: Record<string, LucideIcon> = {
  cart: ShoppingCart,
  restaurant: Utensils,
  bus: Bus,
  fuel: Fuel,
  home: House,
  bolt: Zap,
  phone: Smartphone,
  health: HeartPulse,
  fun: PartyPopper,
  tv: Tv,
  clothes: Shirt,
  beauty: Sparkles,
  sport: Dumbbell,
  education: GraduationCap,
  travel: Plane,
  gift: Gift,
  pet: PawPrint,
  tax: Landmark,
  shield: Shield,
  salary: Wallet,
  tools: Wrench,
  chart: ChartColumn,
  coins: Coins,
  refund: Undo2,
  invest: TrendingUp,
  piggy: PiggyBank,
  card: CreditCard,
  bank: Building2,
  wallet: Wallet,
  target: Target,
  calendar: Calendar,
  tag: Tag,
  bebe: Baby,
  bici: Bike,
  libro: Book,
  tarta: Cake,
  coche: Car,
  tabaco: Cigarette,
  nube: Cloud,
  cafe: Coffee,
  ordenador: Cpu,
  bolleria: Croissant,
  teatro: Drama,
  perro: Dog,
  cine: Film,
  flor: Flower,
  videojuegos: Gamepad2,
  gafas: Glasses,
  obras: Hammer,
  musica: Headphones,
  corazon: Heart,
  hospital: Hospital,
  portatil: Laptop,
  planta: Leaf,
  idea: Lightbulb,
  maleta: Luggage,
  prensa: Newspaper,
  paquete: Package,
  arte: Palette,
  farmacia: Pill,
  pizza: Pizza,
  palomitas: Popcorn,
  recibo: Receipt,
  reciclaje: Recycle,
  cohete: Rocket,
  peluqueria: Scissors,
  compras: ShoppingBag,
  barco: Ship,
  sofa: Sofa,
  huerto: Sprout,
  medico: Stethoscope,
  tienda: Store,
  tren: Train,
  bosque: TreePine,
  mudanza: Truck,
  seguro: Umbrella,
  universidad: University,
  vino: Wine,
  internet: Wifi,
  cama: Bed,
  bano: Bath,
  trabajo: Briefcase,
  foto: Camera,
  agua: Droplet,
  gas: Flame,
  llave: Key,
  mapa: Map,
  monitor: Monitor,
  montana: Mountain,
  pintura: Paintbrush,
  impresora: Printer,
  ensalada: Salad,
  justicia: Scale,
  colegio: School,
  frio: Snowflake,
  entradas: Ticket,
  juguetes: ToyBrick,
  trofeo: Trophy,
  propina: HandCoins,
}

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
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.5a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.3 1.1z" />
    </>
  ),

  // — Cuentas —
  debt: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2c0 2-2.5 1.8-2.5 3.5" />
      <circle cx="12" cy="16.5" r="0.9" />
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
  // Dobles: saltar de año en el calendario, al lado de los de un solo mes.
  chevronsRight: <path d="M6.5 6l6 6-6 6M13.5 6l6 6-6 6" />,
  chevronsLeft: <path d="M17.5 6l-6 6 6 6M10.5 6l-6 6 6 6" />,
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

interface IconProps {
  name: string
  size?: number
  className?: string
  strokeWidth?: number
  filled?: boolean
}

export function Icon({ name, size = 18, className, strokeWidth = 1.8, filled }: IconProps): JSX.Element {
  const DeLucide = LUCIDE[name]
  if (DeLucide) {
    return (
      <DeLucide
        size={size}
        strokeWidth={strokeWidth}
        className={className}
        aria-hidden="true"
        focusable="false"
      />
    )
  }

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
  'cart', 'restaurant', 'bus', 'fuel', 'home', 'bolt', 'phone', 'health',
  'fun', 'tv', 'clothes', 'beauty', 'sport', 'education', 'travel', 'gift',
  'pet', 'tax', 'shield', 'salary', 'tools', 'chart', 'coins', 'refund',
  'invest', 'piggy', 'card', 'bank', 'wallet', 'target', 'calendar', 'tag',
  'bebe', 'bici', 'libro', 'tarta', 'coche', 'tabaco', 'nube', 'cafe',
  'ordenador', 'bolleria', 'teatro', 'perro', 'cine', 'flor', 'videojuegos', 'gafas',
  'obras', 'musica', 'corazon', 'hospital', 'portatil', 'planta', 'idea', 'maleta',
  'prensa', 'paquete', 'arte', 'farmacia', 'pizza', 'palomitas', 'recibo', 'reciclaje',
  'cohete', 'peluqueria', 'compras', 'barco', 'sofa', 'huerto', 'medico', 'tienda',
  'tren', 'bosque', 'mudanza', 'seguro', 'universidad', 'vino', 'internet', 'cama',
  'bano', 'trabajo', 'foto', 'agua', 'gas', 'llave', 'mapa', 'monitor',
  'montana', 'pintura', 'impresora', 'ensalada', 'justicia', 'colegio', 'frio', 'entradas',
  'juguetes', 'trofeo', 'propina'
]

export const ACCOUNT_ICONS: string[] = [
  'wallet', 'bank', 'card', 'piggy', 'invest', 'debt', 'coins', 'home', 'travel', 'target'
]

/** Paleta de la app: tonos separados en tono y con contraste suficiente en ambos temas. */
export const PALETTE: string[] = [
  '#0A84FF', '#5AC8FA', '#00C7BE', '#34C759', '#30D158', '#FFCC00',
  '#FF9500', '#FF6B35', '#FF3B30', '#FF375F', '#FF2D55', '#FF6482',
  '#AF52DE', '#BF5AF2', '#5E5CE6', '#64D2FF', '#A2845E', '#8E8E93',
  // Los neutros: faltaban, y son los que mejor le sientan a lo que no quiere
  // llamar la atención. El dibujo se pone oscuro solo cuando el fondo es claro.
  '#FFFFFF', '#C7C7CC', '#48484A', '#1C1C1E'
]

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon, PALETTE } from './Icon'
import { formatMoney, parseAmount, currencySymbol, toMajor } from '@shared/money'
import { keepNumericChars } from '@shared/numbers'
import { useStore } from '../lib/store'

/* ---------- Modal ---------- */

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Modal({ title, onClose, children, footer, wide }: ModalProps): ReactNode {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const origin = useRef({ x: 0, y: 0 })

  const dialog = useRef<HTMLDivElement>(null)

  const focusableInside = (): HTMLElement[] => {
    const node = dialog.current
    if (!node) return []
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    return [...node.querySelectorAll<HTMLElement>(selector)].filter((el) => el.offsetParent !== null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Escape y nada más: el tabulador está apagado en toda la aplicación, así
      // que no hay foco que se escape del diálogo ni vueltas que darle.
      if (event.key !== 'Escape') return
      /*
       * Con el calendario delante, Escape es suyo.
       *
       * Se mira si está en pantalla en vez de fiarlo a que uno pare el evento
       * antes que el otro: los dos escuchan en la ventana, y cuál va primero
       * depende de cuál se montó antes, que no es algo sobre lo que apoyarse.
       * Cerrar el calendario no puede llevarse por delante la ficha entera con
       * lo que llevabas escrito.
       */
      if (document.querySelector('.calendario-velo')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Al abrir, el foco entra; al cerrar, vuelve a donde estaba.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const node = dialog.current
    if (node && !node.contains(document.activeElement)) {
      ;(focusableInside()[0] ?? node).focus()
    }
    return () => previous?.focus?.()
  }, [])

  const moved = offset.x !== 0 || offset.y !== 0

  function startDrag(event: React.PointerEvent<HTMLDivElement>): void {
    // Los botones de la cabecera siguen siendo botones, no asas de arrastre.
    if ((event.target as HTMLElement).closest('button')) return

    setDragging(true)
    origin.current = { x: event.clientX - offset.x, y: event.clientY - offset.y }

    const onMove = (move: PointerEvent): void => {
      // Se deja siempre un margen visible para que no se pueda perder fuera de la pantalla.
      const margin = 80
      setOffset({
        x: clamp(move.clientX - origin.current.x, -window.innerWidth / 2 + margin, window.innerWidth / 2 - margin),
        y: clamp(move.clientY - origin.current.y, -window.innerHeight / 2 + margin, window.innerHeight / 2 - margin)
      })
    }
    const onUp = (): void => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return createPortal(
    <div
      className={`overlay${moved ? ' moved' : ''}${dragging ? ' dragging' : ''}`}
      // Una vez apartado el diálogo, un clic fuera ya no lo cierra: se supone
      // que se ha movido para mirar el fondo con calma.
      onMouseDown={(event) => !moved && event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        className={`modal${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, animation: moved ? 'none' : undefined }}
      >
        <div
          className="modal-header draggable"
          onPointerDown={startDrag}
          onDoubleClick={() => setOffset({ x: 0, y: 0 })}
          title="Arrastra para mover el diálogo · doble clic para recentrarlo"
        >
          <h2>{title}</h2>
          {moved && (
            <button
              className="btn ghost icon"
              onClick={() => setOffset({ x: 0, y: 0 })}
              aria-label="Recentrar"
              title="Volver al centro"
            >
              <Icon name="target" size={16} />
            </button>
          )}
          <button className="btn ghost icon" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/* ---------- Confirmación ---------- */

interface ConfirmProps {
  title: string
  message: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function Confirm({
  title,
  message,
  confirmLabel = 'Aceptar',
  destructive,
  onConfirm,
  onCancel
}: ConfirmProps): ReactNode {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className={`btn ${destructive ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="small">{message}</div>
    </Modal>
  )
}

/* ---------- Avisos ---------- */

export function Toasts(): ReactNode {
  const { toasts, dismissToast } = useStore()
  if (toasts.length === 0) return null

  return createPortal(
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`} onClick={() => dismissToast(toast.id)}>
          <span className="dot" />
          <span>{toast.message}</span>
        </div>
      ))}
    </div>,
    document.body
  )
}

/* ---------- Campos ---------- */

interface FieldProps {
  /** Sin rótulo cuando el propio campo ya se explica: un selector de tres. */
  label?: string
  children: ReactNode
  error?: string | null
  hint?: string
  /** Sin esto no se puede guardar. Se marca con un asterisco junto al rótulo. */
  required?: boolean
}

export function Field({ label, children, error, hint, required }: FieldProps): ReactNode {
  return (
    <div className="field">
      {/* Los pocos campos obligatorios llevan marca; el resto no dice nada, que
          decir «opcional» en la mayoría es repetir lo mismo en cada renglón. */}
      {label && (
        <label>
          {label}
          {required && <span className="requerido">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

interface CheckboxProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}

export function Checkbox({ checked, onChange, label, hint }: CheckboxProps): ReactNode {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="checkbox-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}

/* ---------- La acción de la cabecera ---------- */

/**
 * Manda un botón a la esquina de la cabecera, junto al título de la pantalla.
 *
 * «Nuevo movimiento» siempre vivió ahí y las demás pantallas lo tenían dentro
 * de su tarjeta: la misma acción en dos sitios distintos según dónde estuvieras.
 * Con esto cada pantalla conserva su botón y su formulario —no hay que subir
 * estado a ninguna parte— y solo comparte el lugar donde se dibuja.
 */
export function AccionCabecera({ children }: { children: ReactNode }): ReactNode {
  const [hueco, setHueco] = useState<HTMLElement | null>(null)

  // Al montar: la cabecera ya está en el árbol, pero no antes del primer pintado.
  useEffect(() => {
    setHueco(document.getElementById('acciones-cabecera'))
  }, [])

  return hueco ? createPortal(children, hueco) : null
}

/* ---------- Entrada de números ---------- */

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  decimals?: number
  disabled?: boolean
  className?: string
  style?: CSSProperties
  placeholder?: string
}

/** Campo para cifras sueltas (tipos de cambio, número de repeticiones). */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  decimals = 0,
  disabled,
  className,
  style,
  placeholder
}: NumberInputProps): ReactNode {
  const [text, setText] = useState(() => String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  const commit = (raw: string): void => {
    const parsed = Number(raw.replace(',', '.'))
    if (!Number.isFinite(parsed)) return
    let next = decimals === 0 ? Math.round(parsed) : parsed
    if (min != null) next = Math.max(min, next)
    if (max != null) next = Math.min(max, next)
    onChange(next)
  }

  return (
    <input
      className={className ?? 'input'}
      style={style}
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        setFocused(false)
        commit(event.target.value)
        setText(String(value))
      }}
      onChange={(event) => {
        const cleaned = keepNumericChars(event.target.value, {
          decimals: decimals > 0,
          negative: min != null && min < 0
        })
        /*
         * El máximo también manda mientras se escribe. Recortarlo solo al salir
         * guardaba bien el número, pero por el camino el campo aceptaba un
         * «9123131231231» que no significaba nada. El mínimo no se toca: se
         * escribe de izquierda a derecha, y un 5 camino del 50 no es un error
         * todavía.
         */
        const numero = Number(cleaned.replace(',', '.'))
        const visible =
          max != null && Number.isFinite(numero) && numero > max ? String(max) : cleaned
        setText(visible)
        if (visible !== '' && visible !== '-') commit(visible)
      }}
    />
  )
}

/* ---------- Importe ---------- */

interface AmountInputProps {
  value: number
  currency: string
  onChange: (minor: number) => void
  autoFocus?: boolean
  invalid?: boolean
  /** Para los importes que no son el protagonista del formulario. */
  compact?: boolean
  /**
   * Admite el signo. Casi ningún importe lo necesita —el de un movimiento lo
   * pone su tipo—, pero el saldo de una cuenta sí: una tarjeta de crédito o un
   * préstamo están en números rojos y se escriben tal cual.
   */
  signed?: boolean
}

/**
 * Trabaja con texto mientras se escribe y solo convierte a céntimos al soltar,
 * para que se puedan teclear estados intermedios como "12," sin pelearse con el campo.
 */
export function AmountInput({
  value,
  currency,
  onChange,
  autoFocus,
  invalid,
  compact,
  signed
}: AmountInputProps): ReactNode {
  const [text, setText] = useState(() => (value ? String(value / 100).replace('.', ',') : ''))
  const [focused, setFocused] = useState(false)
  // El estado del foco también en una referencia: el efecto de abajo corre
  // después de que el campo con autoFocus se haya enfocado, y leyendo el estado
  // se encontraba el valor viejo (false) y volvía a escribir el 0,00 encima de
  // lo que el foco acababa de vaciar. De ahí que hubiera que borrarlo a mano.
  const focusedRef = useRef(false)

  useEffect(() => {
    // El cero también se escribe: dejarlo en blanco hacía parecer que el campo
    // había rechazado lo que acababas de teclear.
    if (!focusedRef.current) setText(formatMoney(value, currency, { noSymbol: true }))
  }, [value, currency, focused])

  return (
    <div style={{ position: 'relative' }}>
      <input
        className={`input amount-input${compact ? ' compact' : ''}${invalid ? ' invalid' : ''}`}
        inputMode="decimal"
        autoFocus={autoFocus}
        value={text}
        placeholder="0,00"
        onFocus={(event) => {
          focusedRef.current = true
          setFocused(true)
          // Mientras se edita se muestra el valor pelado: con el separador de
          // millares puesto, cualquier retoque a mano acabaría descuadrando.
          setText(value ? String(toMajor(value, currency)).replace('.', ',') : '')
          event.target.select()
        }}
        onBlur={() => {
          focusedRef.current = false
          setFocused(false)
          const parsed = parseAmount(text, currency, { grouping: false })
          onChange(parsed == null ? 0 : signed ? parsed : Math.abs(parsed))
        }}
        onChange={(event) => {
          // Salvo donde se pida, los importes son positivos: el signo lo pone el
          // tipo de movimiento, no quien escribe.
          const cleaned = keepNumericChars(event.target.value, { decimals: true, negative: signed })
          setText(cleaned)
          // Un solo separador y decimal: aquí no se agrupan millares, así que
          // "1,23334" y "1.23334" son el mismo importe.
          const parsed = parseAmount(cleaned, currency, { grouping: false })
          if (parsed != null) onChange(signed ? parsed : Math.abs(parsed))
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--fg-subtle)',
          fontSize: 18,
          fontWeight: 600,
          pointerEvents: 'none'
        }}
      >
        {currencySymbol(currency)}
      </span>
    </div>
  )
}

/* ---------- Avatar de categoría o cuenta ---------- */

interface AvatarProps {
  icon: string
  color: string
  size?: 'small' | 'normal' | 'large'
}

/**
 * Con qué tinta se dibuja encima.
 *
 * El icono es blanco, que va bien sobre los colores vivos de la paleta; sobre
 * blanco o gris claro desaparecía. Se mira cuánta luz tiene el fondo y, si es
 * mucha, se dibuja en oscuro. Los colores que no son un hexadecimal —alguno sale
 * de una variable del tema— se dejan como estaban.
 */
function tinta(fondo: string): string | undefined {
  const hex = /^#([0-9a-f]{6})$/i.exec(fondo)
  if (!hex) return undefined
  const n = parseInt(hex[1], 16)
  const luz = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return luz > 0.68 ? '#15171b' : undefined
}

export function Avatar({ icon, color, size = 'normal' }: AvatarProps): ReactNode {
  const className = size === 'normal' ? 'avatar' : `avatar ${size}`
  const iconSize = size === 'small' ? 15 : size === 'large' ? 23 : 19
  return (
    <div className={className} style={{ background: color, color: tinta(color) }}>
      <Icon name={icon} size={iconSize} strokeWidth={1.9} />
    </div>
  )
}

/* ---------- Selectores de icono y color ---------- */

export function IconPicker({
  value,
  options,
  onChange
}: {
  value: string
  options: string[]
  onChange: (icon: string) => void
}): ReactNode {
  return (
    <div className="icon-grid">
      {options.map((icon) => (
        <button
          key={icon}
          type="button"
          className={icon === value ? 'active' : undefined}
          onClick={() => onChange(icon)}
          title={icon}
        >
          <Icon name={icon} size={19} />
        </button>
      ))}
    </div>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }): ReactNode {
  return (
    <div className="color-row">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={`swatch${color.toLowerCase() === value.toLowerCase() ? ' active' : ''}`}
          style={{ background: color }}
          onClick={() => onChange(color)}
          aria-label={`Color ${color}`}
        />
      ))}
    </div>
  )
}

/* ---------- Estado vacío ---------- */

export function EmptyState({
  icon = 'list',
  title,
  message,
  action
}: {
  icon?: string
  title: string
  message?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={24} />
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}

export function Loading(): ReactNode {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  )
}

/* ---------- Segmentado ---------- */

interface SegmentedProps<T extends string> {
  value: T
  options: Array<{ value: T; label: string; tone?: string }>
  onChange: (value: T) => void
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>): ReactNode {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'active' : undefined}
          data-tone={option.tone}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Barra de progreso ---------- */

export function ProgressBar({
  percent,
  color,
  pacePercent
}: {
  percent: number
  color: string
  pacePercent?: number
}): ReactNode {
  return (
    <div className="progress">
      <div
        className="progress-fill"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color }}
      />
      {pacePercent != null && pacePercent > 0 && pacePercent < 100 && (
        <div className="progress-pace" style={{ left: `${pacePercent}%` }} title="Ritmo previsto para hoy" />
      )}
    </div>
  )
}

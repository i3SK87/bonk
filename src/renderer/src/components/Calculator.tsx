import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useStore } from '../lib/store'
import { currencyDecimals, currencySymbol } from '@shared/money'
import { evaluate } from '@shared/calc'

/**
 * Cuentas de servilleta sin salir de la aplicación: repartir un recibo entre
 * cuatro, sacar la mitad del alquiler. Nació para los reembolsos, que casi
 * siempre son una división.
 */

const KEYS = [
  ['C', '←', '(', ')'],
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['0', ',', '%', '+']
]

export function CalculatorButton({ currency }: { currency: string }): ReactNode {
  const { toast } = useStore()
  const [open, setOpen] = useState(false)
  const [expr, setExpr] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const result = useMemo(() => evaluate(expr), [expr])
  const decimals = currencyDecimals(currency)

  // Lo que se copia es lo que cabe en un importe: dos decimales. El valor sin
  // redondear se enseña aparte cuando difiere, que al repartir entre tres casi
  // siempre difiere.
  const rounded = result == null ? null : Math.round(result * 10 ** decimals) / 10 ** decimals
  const shown =
    rounded == null
      ? ''
      : new Intl.NumberFormat('es-ES', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        }).format(rounded)
  const exact =
    result != null && rounded != null && Math.abs(result - rounded) > 1e-9
      ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(result)
      : null

  function press(key: string): void {
    if (key === 'C') setExpr('')
    else if (key === '←') setExpr((current) => current.slice(0, -1))
    else setExpr((current) => current + key)
    inputRef.current?.focus()
  }

  async function copy(): Promise<void> {
    if (rounded == null) return
    try {
      await navigator.clipboard.writeText(shown)
      toast(`${shown} copiado`, 'success')
    } catch {
      toast('No se pudo copiar al portapapeles', 'error')
    }
  }

  const panelStyle: CSSProperties = {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 6px)',
    width: 250,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-md)',
    padding: 12,
    zIndex: 60
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`btn small${open ? ' primary' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title="Para repartir un gasto o sacar un reembolso"
      >
        <Icon name="calculator" size={15} />
        Calculadora
      </button>

      {open && (
        <div style={panelStyle}>
          <input
            ref={inputRef}
            className="input calc-expr"
            value={expr}
            placeholder="33,99/4"
            spellCheck={false}
            onChange={(event) => setExpr(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') copy()
            }}
          />

          <div className="calc-result">
            <span className="calc-value amount">
              {shown ? `${shown} ${currencySymbol(currency)}` : '—'}
            </span>
            <button
              className="btn ghost icon"
              onClick={copy}
              disabled={rounded == null}
              title="Copiar el resultado para pegarlo en el importe"
              aria-label="Copiar el resultado"
            >
              <Icon name="copy" size={15} />
            </button>
          </div>
          {exact && <div className="small subtle">Sin redondear: {exact}</div>}

          <div className="calc-keys">
            {KEYS.flat().map((key) => (
              <button
                key={key}
                type="button"
                className={`calc-key${'÷×−+%'.includes(key) ? ' op' : ''}${key === 'C' ? ' clear' : ''}`}
                onClick={() => press(key)}
              >
                {key}
              </button>
            ))}
          </div>

          <div className="small subtle" style={{ marginTop: 8 }}>
            Se puede teclear directamente. Enter copia el resultado.
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { useStore } from '../lib/store'
import { addDays, addMonths, parseISO, startOfMonth, today } from '@shared/dates'

/**
 * Campo de fecha propio.
 *
 * El de Chromium no se puede vestir: su icono es el que es y el calendario que
 * despliega es una ventana del navegador, con sus grises y su tipografía. En una
 * aplicación que cuida cada rótulo, cantaba.
 *
 * Este se escribe igual que aquel —dd/mm/aaaa, con las barras puestas solas— y
 * despliega un calendario que sí es de la casa. La semana empieza donde diga
 * Ajustes, que para eso está el ajuste.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]

const DIAS_LUNES = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DIAS_DOMINGO = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/** De 2026-08-22 a «22/08/2026», que es como se escribe una fecha aquí. */
function aTexto(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Y al revés, solo si la fecha existe: el 31 de febrero no pasa. */
function aIso(texto: string): string | null {
  const partes = texto.split('/')
  if (partes.length !== 3) return null
  const [d, m, y] = partes
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return null
  const iso = `${y}-${m}-${d}`
  const fecha = parseISO(iso)
  if (Number.isNaN(fecha.getTime())) return null
  return fecha.getDate() === Number(d) && fecha.getMonth() + 1 === Number(m) ? iso : null
}

interface DateInputProps {
  value: string
  onChange: (iso: string) => void
  /** Para las fechas que se pueden dejar en blanco: «termina el», «hasta». */
  clearable?: boolean
  autoFocus?: boolean
}

export function DateInput({ value, onChange, clearable, autoFocus }: DateInputProps): ReactNode {
  const { settings } = useStore()
  const lunesPrimero = settings.startOfWeek !== 'sunday'

  const [texto, setTexto] = useState(() => aTexto(value))
  const [abierto, setAbierto] = useState(false)
  const [mes, setMes] = useState(() => startOfMonth(value || today()))
  const caja = useRef<HTMLDivElement>(null)

  // Lo que venga de fuera manda mientras no se esté escribiendo.
  useEffect(() => {
    setTexto(aTexto(value))
    if (value) setMes(startOfMonth(value))
  }, [value])

  /*
   * Escape cierra. De cerrar al pulsar fuera se encarga el velo.
   *
   * Había aquí un vigilante de clics que cerraba en cuanto se pulsaba fuera del
   * campo, y desde que el calendario se abre en su propio cuadro colgado de la
   * raíz, «fuera del campo» es también el calendario entero: cambiar de mes lo
   * hacía desaparecer antes de que el botón llegara a su cometido.
   *
   * El vigilante sobra, porque el velo ya sabe distinguir lo suyo de lo de
   * fuera. Lo que sí hace falta es Escape a nivel de ventana: el del campo solo
   * sirve mientras el campo tenga el foco, y en cuanto pulsas un mes lo pierde.
   */
  useEffect(() => {
    if (!abierto) return
    const conEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Sin dejar que llegue al formulario que hay debajo: cerrar el calendario
      // no puede cerrar de paso la ficha entera.
      event.stopPropagation()
      setAbierto(false)
    }
    window.addEventListener('keydown', conEscape, true)
    return () => window.removeEventListener('keydown', conEscape, true)
  }, [abierto])

  /*
   * Las seis semanas del mes que se está mirando, de lunes a domingo o de
   * domingo a sábado. Siempre seis: con menos, el calendario cambiaría de alto
   * al pasar de mes y daría un salto.
   */
  const dias = useMemo(() => {
    const primero = parseISO(mes)
    const hueco = lunesPrimero ? (primero.getDay() + 6) % 7 : primero.getDay()
    const arranque = addDays(mes, -hueco)
    return Array.from({ length: 42 }, (_, i) => addDays(arranque, i))
  }, [mes, lunesPrimero])

  const escribir = (crudo: string): void => {
    // Las barras se ponen solas: se teclean ocho cifras y ya.
    const cifras = crudo.replace(/\D/g, '').slice(0, 8)
    const partes = [cifras.slice(0, 2), cifras.slice(2, 4), cifras.slice(4, 8)].filter(Boolean)
    const puesto = partes.join('/')
    setTexto(puesto)
    if (cifras.length === 8) {
      const iso = aIso(puesto)
      if (iso) onChange(iso)
    } else if (cifras.length === 0 && clearable) {
      onChange('')
    }
  }

  const elegir = (iso: string): void => {
    onChange(iso)
    setTexto(aTexto(iso))
    setAbierto(false)
  }

  const mesActual = parseISO(mes).getMonth()

  return (
    <div className="fecha" ref={caja}>
      <input
        className="input"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        autoFocus={autoFocus}
        value={texto}
        onChange={(event) => escribir(event.target.value)}
        onBlur={() => {
          // Al salir, o es una fecha o no hay nada: no se queda a medias.
          const iso = aIso(texto)
          if (iso) onChange(iso)
          else setTexto(aTexto(value))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && abierto) {
            event.stopPropagation()
            setAbierto(false)
          }
        }}
      />

      <button
        type="button"
        className="fecha-boton"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Abrir el calendario"
        title="Abrir el calendario"
      >
        <Icon name="calendar" size={16} />
      </button>

      {/*
        Al centro de la pantalla y fuera del árbol del formulario.
        Colgaba del campo, y dentro de un formulario eso lo dejaba pegado al
        borde, tapando lo de debajo y a veces cortado. Sale por un portal a la
        raíz porque el velo de los formularios lleva desenfoque, y un desenfoque
        hace que lo de dentro se posicione contra él en vez de contra la ventana.
      */}
      {abierto &&
        createPortal(
          <div
            className="calendario-velo"
            onMouseDown={(event) => {
              // Solo el velo: pulsar dentro del calendario no lo cierra.
              if (event.target === event.currentTarget) setAbierto(false)
            }}
          >
            <div className="calendario">
          {/*
            El año, en flechas dobles por fuera de las del mes.
            Doce clics para llegar a un cumpleaños del año pasado no los da
            nadie. Fuera y no dentro porque saltan más lejos: el orden en que se
            ven es el orden en que se mueven.
          */}
          <div className="calendario-mes">
            <button
              type="button"
              className="btn ghost icon"
              onClick={() => setMes(addMonths(mes, -12))}
              aria-label="Año anterior"
              title="Año anterior"
            >
              <Icon name="chevronsLeft" size={16} />
            </button>
            <button
              type="button"
              className="btn ghost icon"
              onClick={() => setMes(addMonths(mes, -1))}
              aria-label="Mes anterior"
              title="Mes anterior"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <strong>
              {MESES[mesActual]} {parseISO(mes).getFullYear()}
            </strong>
            <button
              type="button"
              className="btn ghost icon"
              onClick={() => setMes(addMonths(mes, 1))}
              aria-label="Mes siguiente"
              title="Mes siguiente"
            >
              <Icon name="chevronRight" size={16} />
            </button>
            <button
              type="button"
              className="btn ghost icon"
              onClick={() => setMes(addMonths(mes, 12))}
              aria-label="Año siguiente"
              title="Año siguiente"
            >
              <Icon name="chevronsRight" size={16} />
            </button>
          </div>

          <div className="calendario-rejilla">
            {(lunesPrimero ? DIAS_LUNES : DIAS_DOMINGO).map((dia, i) => (
              <span key={i} className="calendario-dia-semana">
                {dia}
              </span>
            ))}

            {dias.map((iso) => {
              const fecha = parseISO(iso)
              return (
                <button
                  type="button"
                  key={iso}
                  className={[
                    'calendario-dia',
                    fecha.getMonth() === mesActual ? '' : 'otro-mes',
                    iso === value ? 'elegido' : '',
                    iso === today() ? 'hoy' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => elegir(iso)}
                >
                  {fecha.getDate()}
                </button>
              )
            })}
          </div>

          <div className="calendario-pie">
            <button type="button" className="btn small" onClick={() => elegir(today())}>
              Hoy
            </button>
            {clearable && (
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  onChange('')
                  setTexto('')
                  setAbierto(false)
                }}
              >
                Sin fecha
              </button>
            )}
              <div className="spacer" />
              <button type="button" className="btn small ghost" onClick={() => setAbierto(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

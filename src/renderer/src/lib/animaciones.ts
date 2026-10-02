import { useCallback, useEffect, useRef, useState } from 'react'

/** Quien haya pedido que las cosas no se muevan, que no se le muevan. */
function sinAnimaciones(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Los gráficos que se dibujan al asomar.
 *
 * En Informes los gráficos quedan por debajo del pliegue: si arrancaran al
 * entrar en la pantalla, se habrían movido sin nadie mirando y al bajar ya
 * estarían quietos. Así que esperan escondidos —`data-entrada="espera"`— hasta
 * que asoma un tercio de ellos, y entonces la hoja de estilos los suelta con
 * `data-entrada="ya"`. Una vez soltados no vuelven a esperar: cambiar de
 * periodo los recoloca, no los vuelve a dibujar desde cero.
 */
export function useEntrada<T extends Element>(): [(el: T | null) => void, 'espera' | 'ya'] {
  const [estado, setEstado] = useState<'espera' | 'ya'>(() => (sinAnimaciones() ? 'ya' : 'espera'))
  const vigia = useRef<IntersectionObserver | null>(null)

  // Con una referencia de función, porque lo vigilado puede ir y volver: la tabla
  // del reparto desaparece cuando el periodo está vacío y vuelve con el siguiente.
  const ref = useCallback(
    (el: T | null) => {
      vigia.current?.disconnect()
      vigia.current = null
      if (!el || estado === 'ya') return
      vigia.current = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting)) {
            vigia.current?.disconnect()
            setEstado('ya')
          }
        },
        { threshold: 0.35 }
      )
      vigia.current.observe(el)
    },
    [estado]
  )

  useEffect(() => () => vigia.current?.disconnect(), [])
  return [ref, estado]
}

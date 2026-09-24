import { useEffect } from 'react'
import { abrirMenuDe, recienPedidoPorTeclado } from '../components/MenuContextual'

/**
 * BONK entero con el teclado, sin quitarle nada al ratón.
 *
 * Todo lo de aquí escucha en la ventana y se aparta en cuanto otro ya se ha
 * hecho cargo de la tecla (`defaultPrevented`): un campo, el menú del clic
 * derecho, el calendario o una fila que ya sabe qué hacer con Intro van antes.
 * Lo que queda son los atajos que valen en toda la aplicación y el paseo por
 * las filas.
 *
 * Las filas se marcan con `data-fila` en cada pantalla. Aquí no se sabe qué es
 * cada una —un movimiento, una deuda, una categoría—: basta con que sea
 * enfocable, que su clic abra la ficha y que su clic derecho abra el menú. Con
 * eso Intro, las flechas, Supr y la tecla de menú funcionan en todas igual.
 */

const FILA = '[data-fila]'

/** Lo que se puede estar escribiendo: ahí las teclas son del campo. */
const CAMPO = 'input, textarea, select, [contenteditable="true"]'

/** Cuántas filas salta RePág o AvPág. */
const SALTO = 10

/** La última fila que tuvo el foco, para volver a ella si se pierde. */
let recordada: HTMLElement | null = null
let indiceRecordado = 0

function recordar(fila: HTMLElement): void {
  recordada = fila
  indiceRecordado = Math.max(0, filas().indexOf(fila))
}

function esVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0
}

/** Las filas de la pantalla, en el orden en que se leen. */
function filas(): HTMLElement[] {
  const zona = document.querySelector('.content')
  if (!zona) return []
  return [...zona.querySelectorAll<HTMLElement>(FILA)].filter(esVisible)
}

/**
 * Un cuadro de los que piden respuesta está abierto.
 *
 * La calculadora no cuenta: flota sin tapar nada, y se usa mirando lo de
 * detrás. El menú del clic derecho tampoco está en el velo, pero manda sobre
 * las flechas igual, y el calendario de las fechas lo mismo.
 */
function hayCuadro(): boolean {
  return document.querySelector('.overlay:not(.flotante), .menu-contextual, .calendario-velo') !== null
}

function enfocar(fila: HTMLElement | undefined): void {
  if (!fila) return
  fila.focus({ preventScroll: true })
  fila.scrollIntoView({ block: 'nearest' })
}

/**
 * La fila de al lado en esa dirección, mirando dónde está pintada.
 *
 * Por posición y no por orden en la página: así la misma flecha vale en una
 * lista de movimientos, en la rejilla de Categorías y en la tira de
 * presupuestos de Informes. Hacia abajo, la más cercana de la siguiente línea
 * y, dentro de esa línea, la que más a plomo cae; a los lados, la de la misma
 * línea que tenga más pegada.
 */
function vecina(desde: HTMLElement, direccion: 'arriba' | 'abajo' | 'izquierda' | 'derecha'): HTMLElement | undefined {
  const aqui = desde.getBoundingClientRect()
  const centro = aqui.left + aqui.width / 2
  const otras = filas().filter((fila) => fila !== desde)
  const cajas = otras.map((fila) => ({ fila, caja: fila.getBoundingClientRect() }))

  if (direccion === 'abajo' || direccion === 'arriba') {
    const abajo = direccion === 'abajo'
    const candidatas = cajas.filter(({ caja }) => (abajo ? caja.top >= aqui.bottom - 2 : caja.bottom <= aqui.top + 2))
    if (candidatas.length === 0) return undefined
    const distancia = (caja: DOMRect): number => (abajo ? caja.top - aqui.bottom : aqui.top - caja.bottom)
    const cerca = Math.min(...candidatas.map(({ caja }) => distancia(caja)))
    const linea = candidatas.filter(({ caja }) => distancia(caja) <= cerca + 4)
    linea.sort(
      (a, b) =>
        Math.abs(a.caja.left + a.caja.width / 2 - centro) - Math.abs(b.caja.left + b.caja.width / 2 - centro)
    )
    return linea[0].fila
  }

  const derecha = direccion === 'derecha'
  const misma = cajas.filter(
    ({ caja }) =>
      caja.top < aqui.bottom - 2 &&
      caja.bottom > aqui.top + 2 &&
      (derecha ? caja.left >= aqui.right - 2 : caja.right <= aqui.left + 2)
  )
  misma.sort((a, b) => (derecha ? a.caja.left - b.caja.left : b.caja.right - a.caja.right))
  return misma[0]?.fila
}

/** Las flechas de la barra lateral: arriba y abajo entre sus botones. */
function moverEnBarra(activo: HTMLElement, paso: number): void {
  const botones = [...document.querySelectorAll<HTMLElement>('.sidebar .nav-item')]
  const donde = botones.indexOf(activo)
  if (donde < 0) return
  botones[Math.max(0, Math.min(botones.length - 1, donde + paso))]?.focus()
}

interface Opciones {
  /** Cuántas secciones hay en la barra: `Ctrl+1` hasta `Ctrl+<secciones>`. */
  secciones: number
  irA: (indice: number) => void
  irAAjustes: () => void
  ayuda: () => void
}

export function useTeclado({ secciones, irA, irAAjustes, ayuda }: Opciones): void {
  useEffect(() => {
    const tecla = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      const activo = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const ctrl = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey

      // — Lo que vale en toda la aplicación, se esté donde se esté —

      if (ctrl && /^[1-9]$/.test(event.key)) {
        const indice = Number(event.key) - 1
        if (indice >= secciones) return
        event.preventDefault()
        // Con una ficha a medio escribir no se cambia la pantalla de detrás:
        // al cerrarla estarías en otro sitio sin saber por qué.
        if (!hayCuadro()) irA(indice)
        return
      }
      if (ctrl && event.key === ',') {
        event.preventDefault()
        if (!hayCuadro()) irAAjustes()
        return
      }
      if (ctrl && event.key.toLowerCase() === 'f') {
        const buscador = document.querySelector<HTMLInputElement>('.content [data-buscador]')
        if (!buscador || hayCuadro()) return
        event.preventDefault()
        buscador.focus()
        buscador.select()
        return
      }
      if (event.key === 'F1') {
        event.preventDefault()
        if (!hayCuadro()) ayuda()
        return
      }

      // — Lo de las filas: solo si no se está escribiendo ni hay nada delante —

      // Del buscador, la flecha abajo baja a lo encontrado.
      if (activo?.matches('[data-buscador]') && event.key === 'ArrowDown' && !hayCuadro()) {
        const primera = filas()[0]
        if (!primera) return
        event.preventDefault()
        enfocar(primera)
        return
      }

      if (activo?.matches(CAMPO) || hayCuadro()) return
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (activo?.matches('.sidebar .nav-item') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        moverEnBarra(activo, event.key === 'ArrowDown' ? 1 : -1)
        return
      }

      const fila = activo?.matches(FILA) ? activo : null
      // Se apunta también aquí y no solo al enfocarla: si la tecla es Supr, esta
      // es la última ocasión de saber qué sitio ocupaba.
      if (fila) recordar(fila)

      if (!fila) {
        /*
         * Sin nada enfocado, la primera flecha entra en la lista.
         *
         * Por la última fila en la que se estuvo, si sigue ahí; si no —se
         * acaba de borrar—, por la que ha ocupado su sitio, que es la de
         * después. Solo desde el cuerpo de la página: con el foco en un botón,
         * las flechas no son de la lista.
         */
        const enNada = !activo || activo === document.body
        if (!enNada || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
        const todas = filas()
        if (todas.length === 0) return
        event.preventDefault()
        enfocar(recordada?.isConnected && esVisible(recordada) ? recordada : todas[Math.min(indiceRecordado, todas.length - 1)])
        return
      }

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'ArrowRight': {
          event.preventDefault()
          const direccion = ({ ArrowDown: 'abajo', ArrowUp: 'arriba', ArrowLeft: 'izquierda', ArrowRight: 'derecha' } as const)[
            event.key
          ]
          enfocar(vecina(fila, direccion))
          return
        }
        case 'Home':
        case 'End': {
          event.preventDefault()
          const todas = filas()
          enfocar(event.key === 'Home' ? todas[0] : todas[todas.length - 1])
          return
        }
        case 'PageDown':
        case 'PageUp': {
          event.preventDefault()
          const todas = filas()
          const donde = todas.indexOf(fila)
          const paso = event.key === 'PageDown' ? SALTO : -SALTO
          enfocar(todas[Math.max(0, Math.min(todas.length - 1, donde + paso))])
          return
        }
        case 'Enter':
        case ' ':
          // Los botones ya lo hacen solos; las filas que son una caja, no.
          if (fila instanceof HTMLButtonElement) return
          event.preventDefault()
          fila.click()
          return
        case 'Delete':
          event.preventDefault()
          abrirMenuDe(fila, { suprimir: true })
          return
        case 'ContextMenu':
          event.preventDefault()
          abrirMenuDe(fila)
          return
        case 'F10':
          if (!event.shiftKey) return
          event.preventDefault()
          abrirMenuDe(fila)
          return
      }
    }

    // Dónde estaba el foco la última vez que cayó en una fila.
    const alEnfocar = (event: FocusEvent): void => {
      if (event.target instanceof HTMLElement && event.target.matches(FILA)) recordar(event.target)
    }

    /*
     * El menú de Chromium que llega detrás de la tecla de menú.
     *
     * La tecla de menú y Mayús+F10 abren ya el nuestro, colocado bajo la fila;
     * pero Chromium, por su cuenta, dispara además su propio clic derecho sobre
     * lo enfocado, que volvería a abrirlo en otro sitio o cerraría el que acaba
     * de salir. Se traga el de verdad que llegue pegado a la tecla.
     */
    const clicDerecho = (event: MouseEvent): void => {
      if (!event.isTrusted || !recienPedidoPorTeclado()) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    window.addEventListener('keydown', tecla)
    window.addEventListener('focusin', alEnfocar)
    window.addEventListener('contextmenu', clicDerecho, true)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('focusin', alEnfocar)
      window.removeEventListener('contextmenu', clicDerecho, true)
    }
  }, [secciones, irA, irAAjustes, ayuda])
}

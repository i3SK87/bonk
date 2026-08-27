import { useEffect, useRef, useState } from 'react'

/**
 * La cifra que sube o baja sola hasta su nuevo valor.
 *
 * Un saldo que salta de golpe no dice si ha subido o bajado: te deja
 * comparándolo con el que tenías en la cabeza. Contando hasta él, la dirección
 * se ve —el dinero entra o sale— y de paso señala dónde ha pasado algo cuando
 * la cifra está en un rincón de la pantalla, como el patrimonio de la barra.
 *
 * Trabaja en céntimos, que es como viaja el dinero por toda la aplicación:
 * quien la use formatea el número que le devuelve igual que formateaba el otro.
 */

/**
 * Lo que tarda en llegar.
 *
 * Poco más de medio segundo. Se probó con un segundo y con la frenada de abajo
 * se hacía esperar: los últimos euros tardaban tanto en caer que parecía que la
 * aplicación se había quedado pensando.
 */
const DURACION = 620

/**
 * Rápida al principio y frenando al llegar.
 *
 * Es lo que hace que se lea. A velocidad constante las cifras pasan como un
 * cartel de aeropuerto y el ojo no engancha ninguna; frenando al final, las
 * últimas se quedan el tiempo suficiente para verlas asentarse en la de verdad.
 */
const frenada = (t: number): number => 1 - (1 - t) ** 3

/** Quien haya pedido que las cosas no se muevan, que no se le muevan. */
function sinAnimaciones(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * El valor que hay que enseñar ahora mismo, camino de `destino`.
 *
 * `disparo` es lo que decide si hay conteo o no, y por eso no basta con mirar
 * si la cifra ha cambiado: el saldo de Movimientos también cambia al pulsar
 * otra cuenta o al asomar los previstos, y ahí no ha entrado ni salido dinero
 * —es otro dato, no el mismo dato movido—, así que se pone de golpe. Pasando la
 * revisión del almacén, cuenta solo cuando lo que ha cambiado son los datos.
 *
 * Que no llegan en el mismo pintado que la revisión; ver `armadoHasta`.
 */
export function useContador(destino: number, disparo: unknown): number {
  const [valor, setValor] = useState(destino)
  // Lo que hay puesto en pantalla ahora mismo. Es de donde arranca el siguiente
  // conteo: si entran dos movimientos seguidos, el segundo sigue desde donde
  // iba el primero y no da el salto atrás al valor con el que empezó.
  const mostrado = useRef(destino)
  const ultimoDisparo = useRef(disparo)
  /*
   * Hasta cuándo vale el disparo, y por qué hay un plazo de por medio.
   *
   * El almacén sube la revisión *antes* de ir a buscar los datos, para que la
   * lista y los catálogos viajen a la vez. Así que la revisión cambia en un
   * pintado y la cifra nueva llega en el siguiente: mirando solo si las dos
   * cosas cambian a la vez, el conteo no se disparaba nunca. Se queda armado
   * esperando a la cifra.
   *
   * El plazo es para que no se quede armado *para siempre* cuando la recarga no
   * mueve el saldo —guardar una categoría, por ejemplo—: si no, el siguiente
   * cambio por otro motivo, como pulsar otra cuenta, se llevaría un conteo que
   * no le toca. Un segundo largo cubre de sobra la ida y vuelta a la base de
   * datos, que son milisegundos, y se acaba mucho antes de que dé tiempo a
   * pulsar nada.
   */
  const armadoHasta = useRef(0)

  useEffect(() => {
    if (disparo !== ultimoDisparo.current) {
      ultimoDisparo.current = disparo
      armadoHasta.current = performance.now() + 1200
    }

    const origen = mostrado.current
    if (destino === origen) return

    const poner = (cifra: number): void => {
      mostrado.current = cifra
      setValor(cifra)
    }

    const armado = performance.now() < armadoHasta.current
    armadoHasta.current = 0
    if (!armado || sinAnimaciones()) {
      poner(destino)
      return
    }

    const arranque = performance.now()
    let cuadro = requestAnimationFrame(function paso(ahora: number): void {
      const t = Math.min(1, (ahora - arranque) / DURACION)
      // El último cuadro pone el destino exacto y no lo que salga de la cuenta:
      // un céntimo de redondeo en un saldo es un céntimo que no cuadra.
      poner(t === 1 ? destino : Math.round(origen + (destino - origen) * frenada(t)))
      if (t < 1) cuadro = requestAnimationFrame(paso)
    })

    return () => cancelAnimationFrame(cuadro)
  }, [destino, disparo])

  return valor
}

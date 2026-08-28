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
  /*
   * La cifra vive en una referencia y no en un estado.
   *
   * Porque tiene que poder ponerse en el mismo pintado en que llega la nueva, y
   * un estado solo cambia en el siguiente. Cuando eso pasaba un cuadro tarde, el
   * widget enseñaba un instante el saldo de la cuenta anterior con el nombre de
   * la nueva al lado —y la ventana, que se mide sola, se ajustaba a esa tarjeta
   * a medio cambiar y luego pegaba un salto—. El estado se queda solo para
   * pedir que se vuelva a pintar mientras corre el conteo.
   */
  const mostrado = useRef(destino)
  const [, repintar] = useState(0)
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
  /** Hay un conteo corriendo: mientras dure, la cifra la pone él. */
  const contando = useRef(false)

  // El disparo se arma en el pintado en que llega. Antes se armaba en el efecto,
  // y para entonces la decisión de abajo ya se había tomado sin él.
  if (disparo !== ultimoDisparo.current) {
    ultimoDisparo.current = disparo
    armadoHasta.current = performance.now() + 1200
  }

  // Y la cifra que no va a contar se pone ya, aquí mismo, sin esperar al efecto.
  if (!contando.current && destino !== mostrado.current) {
    const armado = performance.now() < armadoHasta.current && !sinAnimaciones()
    if (!armado) mostrado.current = destino
  }

  useEffect(() => {
    const origen = mostrado.current
    // Puesta de golpe en el pintado: no hay nada que recorrer.
    if (destino === origen) return

    // El disparo se gasta al usarlo: lo que venga después ya no cuenta por él.
    armadoHasta.current = 0
    contando.current = true

    const poner = (cifra: number): void => {
      mostrado.current = cifra
      repintar((vuelta) => vuelta + 1)
    }

    const arranque = performance.now()
    let cuadro = requestAnimationFrame(function paso(ahora: number): void {
      const t = Math.min(1, (ahora - arranque) / DURACION)
      // El último cuadro pone el destino exacto y no lo que salga de la cuenta:
      // un céntimo de redondeo en un saldo es un céntimo que no cuadra.
      poner(t === 1 ? destino : Math.round(origen + (destino - origen) * frenada(t)))
      if (t < 1) cuadro = requestAnimationFrame(paso)
      else contando.current = false
    })

    return () => {
      cancelAnimationFrame(cuadro)
      contando.current = false
    }
  }, [destino, disparo])

  return mostrado.current
}

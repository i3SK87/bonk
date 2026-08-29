import type { Frequency } from '@shared/types'

/**
 * Cada cuánto se repite algo, y cómo se dice.
 *
 * Vive aquí y no dentro de una pantalla porque lo usan dos: la lista de
 * programadas y el formulario de un movimiento, desde donde también se puede
 * dejar montada la repetición.
 */

/** Una cadencia con nombre propio: lo que se elige sin tener que contar nada. */
export interface Cadencia {
  /** Lo que se lee en el desplegable y en las listas. */
  nombre: string
  freq: Frequency
  interval: number
}

/**
 * «Una vez», la que no se repite.
 *
 * Va aparte de las demás porque no se ofrece siempre: en la ficha de un
 * movimiento marcado como cíclico no pinta nada —cíclico y una vez se
 * contradicen—, y en la de una programada sí, que es donde se apunta lo que pasa
 * un día y se acaba.
 */
export const UNA_VEZ: Cadencia = { nombre: 'Una vez', freq: 'once', interval: 1 }

/**
 * Las cuatro que se eligen por su nombre.
 *
 * Casi todo lo que se programa cae en una de estas —la nómina, el alquiler, el
 * seguro del coche, la cuota del gimnasio—, y decirlas por su nombre se lee de
 * un golpe. Lo que no encaje sigue pudiéndose montar a mano, pero escondido
 * detrás de una opción más, que es donde tiene que estar lo raro.
 *
 * Fueron siete: estaban además «Bimensual», «Trimestral» y «Cuatrimestral».
 * Alargaban la lista justo por el medio, donde están las que se eligen a
 * diario, para tres casos que salen de higos a brevas. Lo guardado con una de
 * ellas no se pierde: al quedarse sin nombre se lee «Cada 3 meses» y su ficha
 * abre el mando de a mano con lo que tuviera puesto.
 */
export const CADENCIAS: Cadencia[] = [
  { nombre: 'Diaria', freq: 'daily', interval: 1 },
  { nombre: 'Semanal', freq: 'weekly', interval: 1 },
  { nombre: 'Mensual', freq: 'monthly', interval: 1 },
  /*
   * Semestral vuelve a la lista, y esta sí se queda.
   *
   * Es la de las pagas extras, que se cobran dos veces al año y no tenían
   * dónde decirse: montarlas por «Otro» —cada 6 meses— funcionaba, pero
   * detrás de esa puerta no las encuentra quien no sabe ya que están ahí.
   * Las tres que se quitaron —bimensual, trimestral, cuatrimestral— salían
   * de higos a brevas; esta la cobra todo el que tiene nómina.
   *
   * Si las dos pagas no caen a seis meses justos —junio y diciembre sí, junio
   * y navidades no siempre—, lo que toca son dos anuales, una por paga.
   */
  { nombre: 'Semestral', freq: 'monthly', interval: 6 },
  { nombre: 'Anual', freq: 'yearly', interval: 1 }
]

/** La cadencia con nombre que case con esa pareja, si es que hay alguna. */
export function cadenciaDe(freq: Frequency, interval: number): Cadencia | null {
  if (freq === 'once') return UNA_VEZ
  return CADENCIAS.find((item) => item.freq === freq && item.interval === interval) ?? null
}

/**
 * Las unidades sueltas, para el mando de a mano.
 *
 * Solo salen cuando se pide montar una cadencia que no tiene nombre: «cada 10
 * días», «cada 3 semanas», «cada 6 meses».
 */
export const FRECUENCIAS: Array<{ value: Frequency; singular: string; plural: string }> = [
  { value: 'daily', singular: 'día', plural: 'días' },
  { value: 'weekly', singular: 'semana', plural: 'semanas' },
  { value: 'monthly', singular: 'mes', plural: 'meses' },
  { value: 'yearly', singular: 'año', plural: 'años' }
]

/**
 * «Mensual», «Cada 10 días».
 *
 * Si tiene nombre se dice por su nombre, que es como se habla; si no lo tiene,
 * con el «cada», que ahí sí se está contando.
 */
/**
 * Cuántas veces al año cae algo con esta cadencia.
 *
 * Al año y no al mes: es la única medida que compara de verdad cosas que no se
 * repiten igual. Una paga semestral no entra «129 € al mes» —ese mes no entra
 * nada—, pero sí se puede decir lo que suma en un año al lado de una nómina.
 *
 * «Una vez» no cae ninguna: no se repite, así que no tiene ritmo que contar.
 */
export function vecesAlAño(freq: Frequency, interval: number): number {
  const veces =
    freq === 'daily' ? 365 : freq === 'weekly' ? 365 / 7 : freq === 'monthly' ? 12 : freq === 'yearly' ? 1 : 0
  return veces / Math.max(1, interval)
}

/**
 * Cuántas veces al mes cae algo con esta cadencia.
 *
 * Sirve para poner en el mismo renglón cosas que no se repiten igual: una cuota
 * semanal y una nómina mensual solo se pueden comparar diciendo qué suponen al
 * mes. Cuatro semanas y pico, treinta días, doce meses al año: son
 * aproximaciones, y es la cifra que se busca.
 *
 * «Una vez» no cae ninguna: no se repite, así que no tiene ritmo que promediar.
 */
export function vecesAlMes(freq: Frequency, interval: number): number {
  const veces =
    freq === 'daily' ? 30 : freq === 'weekly' ? 4.348 : freq === 'monthly' ? 1 : freq === 'yearly' ? 1 / 12 : 0
  return veces / Math.max(1, interval)
}

export function describeFrequency(freq: Frequency, interval: number): string {
  const cadencia = cadenciaDe(freq, interval)
  if (cadencia) return cadencia.nombre
  const entry = FRECUENCIAS.find((item) => item.value === freq)
  if (!entry) return ''
  return `Cada ${interval} ${interval === 1 ? entry.singular : entry.plural}`
}

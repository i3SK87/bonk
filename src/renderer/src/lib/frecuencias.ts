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
export function describeFrequency(freq: Frequency, interval: number): string {
  const cadencia = cadenciaDe(freq, interval)
  if (cadencia) return cadencia.nombre
  const entry = FRECUENCIAS.find((item) => item.value === freq)
  if (!entry) return ''
  return `Cada ${interval} ${interval === 1 ? entry.singular : entry.plural}`
}

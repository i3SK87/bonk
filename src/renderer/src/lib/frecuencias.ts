import type { Frequency } from '@shared/types'

/**
 * Cada cuánto se repite algo, y cómo se dice.
 *
 * Vive aquí y no dentro de una pantalla porque lo usan dos: la lista de
 * programadas y el formulario de un movimiento, desde donde también se puede
 * dejar montada la repetición.
 */
export const FRECUENCIAS: Array<{ value: Frequency; singular: string; plural: string }> = [
  { value: 'daily', singular: 'día', plural: 'días' },
  { value: 'weekly', singular: 'semana', plural: 'semanas' },
  { value: 'monthly', singular: 'mes', plural: 'meses' },
  { value: 'yearly', singular: 'año', plural: 'años' }
]

/**
 * «Mensual», «Cada 2 meses».
 *
 * De uno en uno se dice con el adjetivo, que es como se habla; con salto va el
 * «cada», que ahí sí se está contando.
 */
export function describeFrequency(freq: Frequency, interval: number): string {
  const entry = FRECUENCIAS.find((item) => item.value === freq)
  if (!entry) return ''
  if (interval === 1) {
    return freq === 'daily'
      ? 'Diario'
      : freq === 'weekly'
        ? 'Semanal'
        : freq === 'monthly'
          ? 'Mensual'
          : 'Anual'
  }
  return `Cada ${interval} ${entry.plural}`
}

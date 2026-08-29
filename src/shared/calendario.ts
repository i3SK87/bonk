/**
 * La rejilla de un mes: qué días hay que pintar y en qué semana cae cada uno.
 *
 * Vive aquí y no en la vista porque es aritmética de fechas pura —la clase de
 * cuenta que se equivoca por un día y no se nota hasta que llega un mes que
 * empieza en domingo—, y aquí la alcanzan las pruebas de humo.
 */

import { addDays, endOfMonth, parseISO, startOfMonth } from './dates'

export type InicioDeSemana = 'monday' | 'sunday'

/**
 * Las semanas que ocupa un mes, cada una con sus siete días en ISO.
 *
 * La rejilla empieza y acaba en semana completa, así que las primeras y las
 * últimas casillas caen en el mes de al lado. Salen cuatro, cinco o seis
 * semanas según dónde caiga el día 1: febrero de un año no bisiesto que empiece
 * justo en el arranque de la semana ocupa cuatro, y un mes de 31 días que
 * empiece el último día de la semana ocupa seis.
 */
export function semanasDelMes(iso: string, inicio: InicioDeSemana = 'monday'): string[][] {
  const primero = startOfMonth(iso)
  const ultimo = endOfMonth(iso)

  // getDay() cuenta desde el domingo. Con la semana en lunes hay que correr el
  // origen un puesto, y el resto de la división deja el hueco de cabecera.
  const origen = inicio === 'monday' ? 1 : 0
  const hueco = (parseISO(primero).getDay() - origen + 7) % 7

  const semanas: string[][] = []
  let cursor = addDays(primero, -hueco)

  while (cursor <= ultimo) {
    const semana: string[] = []
    for (let i = 0; i < 7; i++) {
      semana.push(cursor)
      cursor = addDays(cursor, 1)
    }
    semanas.push(semana)
  }

  return semanas
}

/** Si una fecha pertenece al mes que se está enseñando, o es de relleno. */
export function esDelMes(iso: string, mes: string): boolean {
  return iso.slice(0, 7) === mes.slice(0, 7)
}

/**
 * Los rótulos de las columnas, en el orden que toque. Se escriben aquí y no se
 * sacan de `Intl` para no depender de si el idioma del sistema los abrevia a
 * dos letras o a tres.
 */
export function cabecerasDeSemana(inicio: InicioDeSemana = 'monday'): string[] {
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return inicio === 'monday' ? [...dias.slice(1), dias[0]] : dias
}

/** Si un día cae en fin de semana, para poder darle otro fondo. */
export function esFinDeSemana(iso: string): boolean {
  const dia = parseISO(iso).getDay()
  return dia === 0 || dia === 6
}

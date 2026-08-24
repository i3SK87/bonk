/**
 * Los periodos que se eligen con las pastillas de arriba, en un solo sitio.
 *
 * Estaban escritos dos veces, uno en Movimientos y otro en Informes, y no decían
 * lo mismo: «Este año» llegaba a fin de mes en una pantalla y a fin de año en la
 * otra. De ahí salió que la media diaria diera dos cifras distintas del mismo
 * periodo, 45,84 € contra 59,21 €.
 *
 * Manda el de Movimientos, que es el que se mira a diario: un periodo llega
 * hasta donde llega el mes en curso y no hasta donde llegará el año. Meter meses
 * que no han pasado reparte el gasto entre días que no existen todavía.
 */
import { today, startOfMonth, endOfMonth, addMonths, startOfYear, endOfYear } from './dates'

export type RangoId = 'month' | 'prev' | 'quarter' | 'year' | 'prevYear' | 'all' | 'custom'

/** Cómo se llama cada uno. Cada pantalla enseña los suyos, con el mismo nombre. */
export const NOMBRES_DE_RANGO: Record<RangoId, string> = {
  month: 'Este mes',
  prev: 'Mes pasado',
  quarter: 'Últimos 3 meses',
  year: 'Este año',
  prevYear: 'Año pasado',
  all: 'Todo',
  custom: 'Personalizado'
}

/**
 * Las fechas de un periodo, o nada cuando no las tiene.
 *
 * «Todo» y «Personalizado» devuelven `null` a propósito: el primero no se
 * calcula —se pregunta a los datos o se deja abierto— y el segundo lo escribes
 * tú. Que sea `null` y no un rango enorme obliga a decidir qué hacer con ellos
 * en cada pantalla, que es donde se sabe.
 */
export function rangoDe(id: RangoId, hoy = today()): { from: string; to: string } | null {
  switch (id) {
    case 'month':
      return { from: startOfMonth(hoy), to: endOfMonth(hoy) }
    case 'prev': {
      const anterior = addMonths(hoy, -1)
      return { from: startOfMonth(anterior), to: endOfMonth(anterior) }
    }
    case 'quarter':
      // Este mes y los dos de antes, completos: tres meses, no noventa días.
      return { from: startOfMonth(addMonths(hoy, -2)), to: endOfMonth(hoy) }
    case 'year':
      // Hasta el fin del mes en curso, no del año: los meses que faltan no han
      // pasado, y contarlos falsea cualquier media.
      return { from: startOfYear(hoy), to: endOfMonth(hoy) }
    case 'prevYear': {
      // Un año cerrado sí va entero, que ya pasó del todo.
      const pasado = `${Number(hoy.slice(0, 4)) - 1}-06-15`
      return { from: startOfYear(pasado), to: endOfYear(pasado) }
    }
    default:
      return null
  }
}

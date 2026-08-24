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
import {
  today,
  startOfMonth,
  endOfMonth,
  addMonths,
  addYears,
  addDays,
  daysBetween,
  startOfYear,
  endOfYear
} from './dates'

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

/**
 * Con qué se compara un periodo, y hasta dónde.
 *
 * La comparación honesta de un mes en curso no es contra el mes pasado entero.
 * Hoy es 24: comparar veinticuatro días contra treinta y uno diría que gastas
 * menos, y lo diría todos los meses hasta el día 28. Es la misma mentira que
 * repartir el gasto entre días que no han pasado.
 *
 * Así que cuando el periodo sigue abierto, el anterior se recorta a los mismos
 * días: del 1 al 24 de agosto contra del 1 al 24 de julio. Cuando ya está
 * cerrado se compara entero, que es lo que uno quiere decir con «contra el mes
 * pasado» aunque junio tenga treinta días y julio treinta y uno.
 *
 * Cuál es «el anterior» lo decide la pastilla y no la aritmética: «este año» va
 * de enero a este mes, y su comparación son esos mismos meses del año pasado, no
 * los ocho meses justo anteriores. Restar días daría de mayo a diciembre, que no
 * significa nada.
 */
export interface Comparacion {
  from: string
  to: string
  /** El periodo de ahora sigue abierto, así que el de antes va recortado. */
  enCurso: boolean
}

export function comparacionDe(
  id: RangoId,
  rango: { from: string; to: string },
  hoy = today()
): Comparacion | null {
  // «Todo» abarca lo que hay: no hay un antes con el que medirlo.
  if (id === 'all') return null

  let from: string
  let to: string

  switch (id) {
    case 'month':
    case 'prev': {
      const anterior = addMonths(rango.from, -1)
      from = startOfMonth(anterior)
      to = endOfMonth(anterior)
      break
    }
    case 'quarter':
      from = startOfMonth(addMonths(rango.from, -3))
      to = endOfMonth(addMonths(rango.to, -3))
      break
    case 'year':
      // Los mismos meses del año pasado, no los de justo antes.
      from = addYears(rango.from, -1)
      to = endOfMonth(addYears(rango.to, -1))
      break
    default: {
      // A mano: la misma cantidad de días, pegada por detrás.
      const dias = daysBetween(rango.from, rango.to)
      to = addDays(rango.from, -1)
      from = addDays(to, -dias)
      break
    }
  }

  // Lo que aún no ha pasado no se compara con nada.
  const enCurso = rango.to > hoy
  if (enCurso) {
    const transcurridos = daysBetween(rango.from, hoy < rango.from ? rango.from : hoy)
    to = addDays(from, transcurridos)
  }

  return { from, to, enCurso }
}

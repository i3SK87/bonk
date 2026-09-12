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
 * Con qué se compara un periodo: con el anterior, entero.
 *
 * Valor contra valor y no fecha contra fecha. Lo que has gastado este mes se
 * mide contra lo que gastaste el mes pasado, punto: si «Padre» ingresó 350 € en
 * julio y 350 € en agosto, la comparación tiene que decir «igual» y no otra
 * cosa.
 *
 * Hubo una versión que recortaba el mes anterior al día de hoy —del 1 al 24 de
 * agosto contra del 1 al 24 de julio— para que un mes a medias no pareciera
 * siempre más barato. Cuadraba en aritmética y no cuadraba al leerla: el mismo
 * importe en dos meses salía con una flecha del 75 %, y explicar por qué no era
 * un error costaba más que el dato.
 *
 * La contrapartida es sabida: a primeros de mes casi todo sale por debajo,
 * porque el mes lleva dos días. Por eso la pantalla dice siempre contra qué
 * compara.
 *
 * Cuál es «el anterior» lo decide la pastilla y no la aritmética: «este año» va
 * de enero a este mes, y su comparación son esos mismos meses del año pasado, no
 * los ocho meses justo anteriores. Restar días daría de mayo a diciembre, que no
 * significa nada.
 */
export interface Comparacion {
  from: string
  to: string
}

export function comparacionDe(
  id: RangoId,
  rango: { from: string; to: string }
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

  return { from, to }
}

/**
 * Las pastillas de un mes, las únicas en las que se elige contra qué comparar.
 *
 * Un mes contra otro mes se entiende solo; tres meses contra otros tres
 * cualesquiera, o un tramo a mano contra otro tramo, ya es otra pantalla. En las
 * demás la comparación sigue siendo la de siempre, la de justo detrás.
 */
export function esDeUnMes(id: RangoId): boolean {
  return id === 'month' || id === 'prev'
}

/**
 * Los meses contra los que se puede comparar uno, del más cercano al más lejano.
 *
 * Hasta el del primer movimiento y no más: un mes de antes de empezar a apuntar
 * no tiene nada, y compararse con él sale todo «nuevo». El de justo antes va
 * siempre, haya datos o no, porque es la comparación de siempre y el menú no
 * puede quedarse sin ella.
 */
export function mesesAnteriores(mes: string, primerMovimiento: string | null): string[] {
  const tope = startOfMonth(primerMovimiento ?? mes)
  const meses: string[] = []
  let actual = startOfMonth(addMonths(mes, -1))
  do {
    meses.push(actual)
    actual = startOfMonth(addMonths(actual, -1))
  } while (actual >= tope)
  return meses
}

/** Un mes entero, para compararse con él. */
export function comparacionDelMes(mes: string): Comparacion {
  return { from: startOfMonth(mes), to: endOfMonth(mes) }
}

const nombreDeMesFmt = new Intl.DateTimeFormat('es-ES', { month: 'long' })

/**
 * «julio», y «julio de 2025» si no es del año del mes que se mira.
 *
 * En minúscula porque va dentro de una frase —«frente a julio»—; quien lo
 * ponga suelto, en una lista, le sube la inicial. El año se compara con el del
 * mes mirado y no con el de hoy: mirando enero, el diciembre de antes es de
 * otro año aunque hoy también lo sea.
 */
export function nombreDeMes(mes: string, mirado: string): string {
  const nombre = nombreDeMesFmt.format(new Date(`${mes.slice(0, 10)}T12:00:00`))
  return mes.slice(0, 4) === mirado.slice(0, 4) ? nombre : `${nombre} de ${mes.slice(0, 4)}`
}

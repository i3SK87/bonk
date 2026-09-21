/**
 * El reparto de Informes con su comparación al lado, fila a fila.
 */
import type { CategoryTotal } from './types'

export interface FilaComparada {
  row: CategoryTotal
  /** Lo que llevaba en el periodo con el que se compara. */
  antes: number
}

/**
 * Cada categoría del periodo con lo que llevaba en el otro al lado.
 *
 * Solo las del periodo que se está mirando. Las que únicamente tuvieron algo en
 * el otro entraban detrás, a cero, para que se viera la bajada —«en julio 61 €
 * de Regalos, en septiembre nada»—, y se han retirado a petición suya: en un
 * mes corriente son media docena de filas con cero movimientos, cero por ciento
 * y cero euros, y hay que leerlas enteras para descubrir que no dicen nada de
 * este mes. El informe es de lo que ha pasado en el periodo, no de lo que dejó
 * de pasar.
 *
 * Lo que bajó del todo sigue estando en el informe del periodo en que ocurrió,
 * que es donde se mira.
 */
export function repartoComparado(ahora: CategoryTotal[], antes: CategoryTotal[]): FilaComparada[] {
  const previos = new Map(antes.map((item) => [item.categoryId, item.total]))
  return ahora.map((row) => ({ row, antes: previos.get(row.categoryId) ?? 0 }))
}

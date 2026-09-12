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
 * Cada categoría del periodo con lo que llevaba en el otro, y detrás las que
 * solo salen en el otro.
 *
 * Las filas se sacaban solo de las categorías del periodo mirado, así que una
 * que en julio tuvo gasto y en septiembre ninguno no salía: la mayor bajada del
 * informe era justo la que no se veía. Ahora entran a cero, al final y de mayor
 * a menor por lo que llevaban, que es lo que dicen.
 *
 * Sin desglose, que el suyo es del otro periodo: abrirla enseñaría las notas de
 * julio debajo de un cero de septiembre.
 */
export function repartoComparado(ahora: CategoryTotal[], antes: CategoryTotal[]): FilaComparada[] {
  const previos = new Map(antes.map((item) => [item.categoryId, item.total]))
  const presentes = new Set(ahora.map((item) => item.categoryId))
  const filas = ahora.map((row) => ({ row, antes: previos.get(row.categoryId) ?? 0 }))

  const soloAntes = antes
    .filter((item) => !presentes.has(item.categoryId) && item.total !== 0)
    .sort((a, b) => b.total - a.total)
    .map((item) => ({
      row: { ...item, total: 0, count: 0, percent: 0, notes: [] },
      antes: item.total
    }))

  return [...filas, ...soloAntes]
}

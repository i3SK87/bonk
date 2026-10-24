/**
 * El reparto de Informes con su comparación al lado, fila a fila.
 */
import type { CategoryTotal } from './types'

export interface FilaComparada {
  row: CategoryTotal
  /** Lo que llevaba en el periodo con el que se compara. */
  antes: number
  /**
   * Lo mismo para cada nota del desglose, en el orden de `row.notes`: «luz»
   * va dentro de Suministros y la flecha de la categoría no dice si subió ella
   * o el agua.
   */
  notasAntes: number[]
}

/** Clave con la que dos notas cuentan como la misma: sin mayúsculas ni espacios de más. */
export function noteKey(note: string): string {
  return note.trim().toLowerCase().replace(/\s+/g, ' ')
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
  const previos = new Map(antes.map((item) => [item.categoryId, item]))
  return ahora.map((row) => {
    const previa = previos.get(row.categoryId)
    // Las notas se emparejan como las agrupa el informe: «Luz» y «luz » son la misma.
    const notas = new Map(previa?.notes.map((note) => [noteKey(note.note), note.total]) ?? [])
    return {
      row,
      antes: previa?.total ?? 0,
      notasAntes: row.notes.map((note) => notas.get(noteKey(note.note)) ?? 0)
    }
  })
}

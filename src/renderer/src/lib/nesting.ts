/**
 * Ordena una lista para que cada hija quede justo debajo de su madre, con el
 * dato de si es la última del grupo para poder cerrar la línea del árbol.
 *
 * Lo usan las devoluciones: en Movimientos cuelgan del gasto que reembolsan y
 * en Programadas, de la programación del gasto. Una hija cuya madre no esté en
 * la lista se queda donde estaba —moverla mentiría sobre su fecha—, así que
 * sale sin anidar.
 */
export function nestByParent<T>(
  list: T[],
  idOf: (item: T) => number,
  parentOf: (item: T) => number | null | undefined
): Array<{ row: T; nested: boolean; last: boolean }> {
  const present = new Set(list.map(idOf))
  const children = new Map<number, T[]>()
  for (const item of list) {
    const parent = parentOf(item)
    if (parent == null || parent === idOf(item) || !present.has(parent)) continue
    children.set(parent, [...(children.get(parent) ?? []), item])
  }
  if (children.size === 0) return list.map((row) => ({ row, nested: false, last: false }))

  const nested = new Set([...children.values()].flat().map(idOf))
  const out: Array<{ row: T; nested: boolean; last: boolean }> = []
  for (const item of list) {
    if (nested.has(idOf(item))) continue
    out.push({ row: item, nested: false, last: false })
    const brood = children.get(idOf(item)) ?? []
    brood.forEach((child, index) =>
      out.push({ row: child, nested: true, last: index === brood.length - 1 })
    )
  }
  return out
}

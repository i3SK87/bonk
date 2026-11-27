/**
 * El orden de un día tras soltar en él un movimiento arrastrado.
 *
 * Se trabaja por bloques —un gasto con sus devoluciones colgando— porque se
 * mueven juntos. `bloques` es el día de destino tal como está, `suyo` el bloque
 * que viaja (puede no estar en `bloques` si viene de otro día) y `sobreId` la
 * fila sobre la que se ha soltado; sin ella, se ha soltado en la cabecera y va
 * el primero. `despues` dice a qué lado de esa fila: antes o después.
 *
 * Hasta la 2.53.1 no había lado: soltar encima de una fila la ponía en su
 * sitio, que bajando quedaba debajo y subiendo encima, mientras la raya se
 * pintaba siempre arriba. Para dejar el segundo bajo el primero se apuntaba al
 * hueco de debajo, que es la cabecera de ayer, y el movimiento se mudaba de día.
 *
 * Devuelve los ids en el orden nuevo, o `null` si soltar ahí no cambia nada.
 */
export function ordenTrasSoltar(
  bloques: number[][],
  suyo: number[],
  sobreId: number | null,
  despues: boolean
): number[] | null {
  const resto = bloques.filter((bloque) => bloque[0] !== suyo[0])
  let en = 0
  if (sobreId != null) {
    const donde = resto.findIndex((bloque) => bloque.includes(sobreId))
    // Soltado sobre sí mismo o sobre lo que le cuelga.
    if (donde < 0) return null
    en = despues ? donde + 1 : donde
  }
  const orden = [...resto.slice(0, en), suyo, ...resto.slice(en)].flat()
  const antes = bloques.flat()
  if (orden.length === antes.length && orden.every((id, i) => id === antes[i])) return null
  return orden
}

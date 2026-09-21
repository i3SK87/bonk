/**
 * El presupuesto de gasto de una categoría, en limpio y sin base de datos delante.
 *
 * Vive en `shared` por lo mismo que la regla de ahorro: el proceso principal
 * decide con esto cuándo avisar, y la ventana pinta con esto la barra de cada
 * categoría. Con una copia en cada sitio acabarían discrepando justo en el
 * borde, que es el único sitio donde importa.
 */

/**
 * A partir de aquí se avisa de que queda poco.
 *
 * La misma raya sirve para las dos cosas: aquí salta el aviso de Windows, y
 * aquí empieza a pintarse en rojo la barra. Que no sean dos cifras distintas
 * es lo que hace que lo que ves y lo que te avisan digan lo mismo.
 */
export const AVISO_CERCA = 80

/**
 * Lo gastado sobre el presupuesto, en tanto por ciento. Puede pasar de cien: un mes
 * que se va al doble tiene que poder decirlo.
 *
 * Lo gastado viene neto —los reembolsos ya han restado—, así que puede ser
 * negativo si te devuelven más de lo que llevas gastado en el mes. Eso no es un
 * presupuesto al -12 %, es un presupuesto sin tocar.
 */
export function porcentajeDePresupuesto(gastado: number, presupuesto: number): number {
  if (presupuesto <= 0) return 0
  return Math.round((Math.max(0, gastado) / presupuesto) * 100)
}

/** El escalón de aviso que corresponde a ese porcentaje, o `null` si ninguno. */
export function escalonDeAviso(porcentaje: number): 80 | 100 | null {
  if (porcentaje >= 100) return 100
  if (porcentaje >= AVISO_CERCA) return AVISO_CERCA
  return null
}

/** La marca que se guarda para no repetir un aviso: de qué mes y de qué escalón. */
export function marcaDeAviso(mes: string, escalon: number): string {
  return `${mes}:${escalon}`
}

/** En qué escalón quedó el último aviso de este mes; 0 si no hubo o es de otro. */
function nivelDe(marca: string | null, mes: string): number {
  if (!marca) return 0
  const [mesMarcado, nivel] = marca.split(':')
  return mesMarcado === mes ? Number(nivel) || 0 : 0
}

/**
 * Qué hacer con un presupuesto al repasarlo: si avisar, y qué marca dejar.
 *
 * Se avisa al **subir** de escalón, nunca al quedarse: cruzas el 80 % y se
 * dice una vez, cruzas el presupuesto entero y se dice otra, y mientras sigas
 * por encima no se repite.
 *
 * Y la marca sigue al escalón de ahora, no al más alto que hubo. Eso es lo que
 * hace que el aviso se vuelva a armar solo, como el del saldo bajo: si una
 * devolución —o el movimiento que apuntaste mal y corriges— te devuelve por
 * debajo, la marca baja con él, y volver a pasarte vuelve a avisar. Porque
 * pasarse otra vez es pasarse otra vez, aunque ya hubiera ocurrido este mes.
 *
 * Por debajo del 80 % no queda marca ninguna: no hay nada que recordar.
 */
export function repasoDePresupuesto(
  marca: string | null,
  mes: string,
  porcentaje: number
): { avisar: 80 | 100 | null; marca: string | null } {
  const escalon = escalonDeAviso(porcentaje)
  const nivel = nivelDe(marca, mes)
  return {
    avisar: escalon != null && escalon > nivel ? escalon : null,
    marca: escalon == null ? null : marcaDeAviso(mes, escalon)
  }
}


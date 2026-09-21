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

/**
 * Si con la marca que hay guardada toca dar ese aviso.
 *
 * Dos reglas, y las dos son la misma idea: no repetir lo ya dicho. Un mes nuevo
 * empieza la cuenta de cero —el gasto se reinicia, el aviso también—, y dentro
 * del mismo mes solo se avisa al subir de escalón: pasado el 80 % se dice una
 * vez, y no se vuelve a decir nada hasta cruzar el presupuesto entero.
 */
export function tocaAvisar(marca: string | null, mes: string, escalon: number): boolean {
  if (!marca) return true
  const [mesMarcado, nivel] = marca.split(':')
  if (mesMarcado !== mes) return true
  return escalon > Number(nivel)
}


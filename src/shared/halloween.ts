/**
 * Los días en que BONK se disfraza: el del Silent Hill y la semana de Halloween.
 *
 * La semana de Halloween: del 25 al 31 de octubre.
 *
 * Una semana y no el mes entero porque la gracia se gasta. Y no solo el 31
 * porque entonces depende de que ese día abras la aplicación, que es
 * exactamente lo que le pasó al resumen del mes cuando se ató a un solo día.
 *
 * Va aquí, en lo compartido y sin nada de React ni de Electron, para que se
 * pueda probar sin ventana.
 */

/** El primer día, como «MM-DD». */
export const HALLOWEEN_DESDE = '10-25'
/** El último día, incluido. */
export const HALLOWEEN_HASTA = '10-31'

/**
 * Si esa fecha —en ISO, «2026-10-28»— cae dentro de la semana.
 *
 * Se compara el «MM-DD» como texto y no con fechas: dentro del mismo mes el
 * orden alfabético y el del calendario son el mismo, y así no hay husos
 * horarios ni objetos `Date` de por medio.
 */
export function esHalloween(fecha: string): boolean {
  const dia = fecha.slice(5, 10)
  return dia >= HALLOWEEN_DESDE && dia <= HALLOWEEN_HASTA
}

/**
 * El día de la niebla: el 24 de septiembre, el día en que salió el Silent Hill
 * nuevo. De ahí viene, y por eso es ese día y no otro.
 *
 * Un solo día, y ese entero: no es una broma que salga y se vaya, es el tiempo
 * que hace esa mañana. Cae un mes antes que la semana de los murciélagos, así
 * que los dos nunca coinciden.
 */
export const DIA_DE_NIEBLA = '09-24'

export function esDiaDeNiebla(fecha: string): boolean {
  return fecha.slice(5, 10) === DIA_DE_NIEBLA
}

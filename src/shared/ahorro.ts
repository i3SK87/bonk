/**
 * La regla de ahorro automático, en limpio y sin base de datos delante.
 *
 * Vive en `shared` porque hacen falta las dos: el proceso principal la aplica
 * al registrar un ingreso, y la ventana la usa para enseñar lo que se apartará
 * antes de que ocurra —el aviso del formulario, y el ahorro que cuelga de una
 * nómina programada—. Con una copia en cada sitio, la de la ventana y la que
 * escribe en la base acabarían diciendo cifras distintas.
 */
import type { CategoryKind, ReglaDeAhorro } from './types'

/**
 * La regla de ahorro de una categoría, ya comprobada, o `null`.
 *
 * Se limpia en un solo sitio para que la base no guarde a medias lo que luego
 * hay que interpretar: una regla sin hucha, o del 0 %, o colgada de una
 * categoría de gasto, es una regla que no existe. Del 1 al 100, que apartar el
 * 150 % de un ingreso no significa nada.
 */
export function reglaDeCategoria(input: {
  kind: CategoryKind
  savePercent?: number | null
  saveAmount?: number | null
  saveAccountId?: number | null
  saveGoalId?: number | null
}): ReglaDeAhorro | null {
  if (input.kind !== 'income' || !input.saveAccountId) return null

  // La cifra manda sobre el porcentaje: puestas las dos, gana la que se escribió
  // como cifra, que es la más concreta de las dos.
  const cifra = Math.round(Number(input.saveAmount ?? 0))
  if (Number.isFinite(cifra) && cifra > 0) {
    return { modo: 'cifra', valor: cifra, accountId: input.saveAccountId, goalId: input.saveGoalId ?? null }
  }

  const porciento = Math.round(Number(input.savePercent ?? 0))
  if (!Number.isFinite(porciento) || porciento <= 0) return null
  return {
    modo: 'porciento',
    valor: Math.min(100, porciento),
    accountId: input.saveAccountId,
    goalId: input.saveGoalId ?? null
  }
}

/** Lo que apartaría esa regla de un ingreso de este importe. */
export function loQueApartaria(regla: ReglaDeAhorro | null, importe: number): number {
  if (!regla || importe <= 0) return 0
  // Al céntimo y sin redondear a euros: el 10 % de 1411,22 son 141,12. Y una
  // cifra fija no puede pasar de lo que ha entrado: de un ingreso de 50 € no se
  // apartan 100, se apartan 50.
  const bruto = regla.modo === 'cifra' ? regla.valor : Math.round((importe * regla.valor) / 100)
  return Math.min(bruto, importe)
}

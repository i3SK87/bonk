/** Cómo se ordenan los nombres cuando se enseñan en una lista. */

/**
 * Ordena como se lee en español: la ñ después de la n, los acentos donde
 * corresponde y sin distinguir mayúsculas. El `numeric` es para que «Piso 2»
 * vaya antes que «Piso 10» y no al revés.
 */
export const byName = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

/**
 * La primera letra en mayúscula, dejando el resto como está.
 *
 * En los subtextos, cada trozo separado por «·» arranca como si fuera una frase:
 * «Mensual · CaixaBank · Hasta el 29/08/2026». Las piezas que se calculan
 * —«faltan 7 días»— vienen en minúscula porque también se usan sueltas, así que
 * se les levanta la inicial aquí y no en cada sitio.
 *
 * Respeta lo que ya venga en mayúscula: «iPhone» no se convierte en «IPhone».
 */
export function mayuscula(texto: string): string {
  if (!texto) return texto
  const primera = texto[0]
  return primera === primera.toUpperCase() ? texto : primera.toUpperCase() + texto.slice(1)
}

/**
 * Cómo se llama una programación cuando hay que nombrarla.
 *
 * El título que escribiste, y si no lo hay la categoría, que al menos dice de
 * qué va. El nombre solo lo llevan las de antes de que las notas pasaran a ser
 * títulos, pero manda mientras exista.
 *
 * Estaba escrita cuatro veces —la lista, los avisos, la pestaña de Deudas y el
 * repaso— y la cuarta ya se había desviado: se saltaba la categoría, así que
 * una programación sin título salía como «Programación» a secas justo cuando
 * más falta hace saber cuál es, contando por qué no ha podido registrarse.
 *
 * El comodín cambia según dónde se lea: en Deudas «Deuda» dice más que
 * «Movimiento programado».
 */
export function tituloProgramada(
  row: { name?: string | null; note?: string | null; categoryName?: string | null },
  comodin = 'Movimiento programado'
): string {
  return row.name || row.note || row.categoryName || comodin
}

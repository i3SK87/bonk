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

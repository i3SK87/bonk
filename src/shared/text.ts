/** Cómo se ordenan los nombres cuando se enseñan en una lista. */

/**
 * Ordena como se lee en español: la ñ después de la n, los acentos donde
 * corresponde y sin distinguir mayúsculas. El `numeric` es para que «Piso 2»
 * vaya antes que «Piso 10» y no al revés.
 */
export const byName = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

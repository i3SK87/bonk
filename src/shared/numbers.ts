/**
 * Filtrado de lo que se teclea en los campos numéricos.
 *
 * Se filtra carácter a carácter en lugar de usar `type="number"`, porque ese
 * acepta «e», «+» y «-» en cualquier posición y luego devuelve el campo vacío
 * sin avisar de nada.
 */
export function keepNumericChars(
  text: string,
  options: { decimals?: boolean; negative?: boolean; grouping?: boolean } = {}
): string {
  const { decimals = true, negative = false, grouping = false } = options
  let cleaned = text.replace(decimals ? /[^\d.,-]/g : /[^\d-]/g, '')

  // El signo, si se admite, solo tiene sentido al principio y una sola vez.
  const isNegative = negative && cleaned.startsWith('-')
  cleaned = cleaned.replace(/-/g, '')

  if (decimals && grouping) {
    // Donde se admiten millares no se puede tirar el segundo separador: quien
    // tecleaba "1.234,56" perdía la coma y se quedaba en un euro con veintitrés.
    // Solo se recortan los separadores seguidos, que no significan nada.
    cleaned = cleaned.replace(/([.,])[.,]+/g, '$1')
  } else if (decimals) {
    // Un único separador decimal: se conserva el primero que se escribió.
    const first = cleaned.search(/[.,]/)
    if (first !== -1) {
      cleaned = cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/[.,]/g, '')
    }
  }

  return isNegative ? `-${cleaned}` : cleaned
}

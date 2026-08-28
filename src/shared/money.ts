/**
 * Los importes viajan siempre como enteros en unidades mínimas (céntimos).
 * Nunca se opera con decimales en coma flotante para evitar que 0,1 + 0,2 deje de ser 0,3.
 */

const decimalsCache = new Map<string, number>()

/** Decimales oficiales de una divisa, deducidos de Intl para cubrir las 170+ sin mantener una tabla. */
export function currencyDecimals(code: string): number {
  const key = (code || 'EUR').toUpperCase()
  const cached = decimalsCache.get(key)
  if (cached !== undefined) return cached
  let decimals = 2
  try {
    const opts = new Intl.NumberFormat('es-ES', { style: 'currency', currency: key }).resolvedOptions()
    decimals = opts.minimumFractionDigits ?? 2
  } catch {
    decimals = 2
  }
  decimalsCache.set(key, decimals)
  return decimals
}

function minorFactor(code: string): number {
  return 10 ** currencyDecimals(code)
}

/** Convierte un importe mayor (12,34) a unidades mínimas (1234). */
export function toMinor(value: number, code: string): number {
  return Math.round(value * minorFactor(code))
}

/** Convierte unidades mínimas (1234) al importe mayor (12,34). */
export function toMajor(minor: number, code: string): number {
  return minor / minorFactor(code)
}

export function formatMoney(
  minor: number,
  code: string,
  opts: { sign?: boolean; compact?: boolean; noSymbol?: boolean } = {}
): string {
  const value = toMajor(minor, code)
  const decimals = currencyDecimals(code)
  const formatter = new Intl.NumberFormat('es-ES', {
    style: opts.noSymbol ? 'decimal' : 'currency',
    currency: code,
    minimumFractionDigits: opts.compact ? 0 : decimals,
    maximumFractionDigits: opts.compact ? 0 : decimals,
    notation: opts.compact ? 'compact' : 'standard'
  })
  const text = formatter.format(Math.abs(value))
  if (opts.sign) {
    if (value > 0) return `+${text}`
    if (value < 0) return `−${text}`
    return text
  }
  return value < 0 ? `−${text}` : text
}

/** Símbolo de la divisa aislado, para etiquetas y campos de formulario. */
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol'
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

/**
 * Interpreta lo que el usuario teclea. La coma y el punto valen por igual como
 * separador decimal —"12,50" y "12.50" son lo mismo— y también como separador
 * de millares: "1.234,56", "1,234.56", "1.234" y "1,234" se leen todos bien.
 * Con `grouping: false` no hay millares que valgan y el separador es siempre
 * el decimal, que es como se escribe a mano en el campo de importe.
 * Devuelve null si no hay ningún número reconocible.
 */
export function parseAmount(
  input: string,
  code: string,
  opts: { grouping?: boolean } = {}
): number | null {
  if (input == null) return null
  let text = String(input).trim().replace(/\s/g, '').replace(/[€$£¥]/g, '')
  if (!text) return null
  const negative = /^[-−(]/.test(text)
  text = text.replace(/[-−()]/g, '')
  const commas = text.split(',').length - 1
  const dots = text.split('.').length - 1

  if (opts.grouping === false) {
    // Sin agrupación el separador es siempre decimal, sea coma o punto. Es lo
    // que se teclea en el campo de importe, donde además solo cabe uno: quien
    // escribe "1,23334" quiere un euro y pico, no mil doscientos.
    text = text.replace(/,/g, '.')
    const first = text.indexOf('.')
    if (first > -1) text = text.slice(0, first + 1) + text.slice(first + 1).replace(/\./g, '')
  } else if (commas > 0 && dots > 0) {
    // Con los dos puestos no hay duda: el decimal es el que va más a la
    // derecha y el otro agrupa millares.
    text =
      text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(/,/g, '.')
        : text.replace(/,/g, '')
  } else if (commas + dots > 0) {
    const separator = commas > 0 ? ',' : '.'
    const at = text.lastIndexOf(separator)
    const head = text.slice(0, at)
    // Uno solo casi siempre es el decimal. Agrupa millares cuando hay varios
    // ("1.234.567") o cuando deja detrás exactamente tres cifras y delante un
    // grupo que puede serlo: "1.234" y "1,234" son mil doscientos treinta y
    // cuatro, no un euro y pico. Quedan fuera el "0,123", que millar no es, y
    // las divisas de tres decimales, donde esas tres cifras sí son decimales.
    const groups =
      commas + dots > 1 ||
      (text.length - at - 1 === 3 && currencyDecimals(code) !== 3 && /^[1-9]\d{0,2}$/.test(head))
    text = groups ? text.split(separator).join('') : `${head}.${text.slice(at + 1)}`
  }
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  const minor = toMinor(value, code)
  return negative ? -minor : minor
}

/**
 * Convierte entre divisas. Los tipos indican cuántas unidades de esa divisa
 * equivalen a una unidad de la divisa base.
 */
export function convert(
  minor: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (!minor) return 0
  const origin = from.toUpperCase()
  const target = to.toUpperCase()
  if (origin === target) return minor
  const rateFrom = origin in rates ? rates[origin] : 1
  const rateTo = target in rates ? rates[target] : 1
  if (!rateFrom || !rateTo) return minor
  const inBase = toMajor(minor, origin) / rateFrom
  return toMinor(inBase * rateTo, target)
}

/**
 * Cuántos caracteres caben donde la cifra preside sin sitio de sobra.
 *
 * Son los de la barra lateral, medidos: a 38 px, «12.345,67 €» ocupa 195 de los
 * 208 px que quedan entre los márgenes, y un carácter más se sale. Vive aquí y
 * no en el componente porque es lo que decide si una cifra se abrevia.
 */
const TOPE_BARRA = 11

/** Si la cifra entera cabe, que es lo que decide si hay que abreviarla. */
export function cabeEntero(minor: number, code: string, tope = TOPE_BARRA): boolean {
  return formatMoney(minor, code).length <= tope
}

/**
 * La cifra entera si cabe, y si no, abreviada: «123,46k €», «1,23M €».
 *
 * Un patrimonio de seis cifras no entra en la barra lateral y se salía por el
 * canto. Recortarlo con puntos suspensivos deja un número que no se puede leer,
 * y encoger la letra hace que la misma cifra cambie de tamaño según el día.
 *
 * La «k» y la «M» no son la abreviatura del castellano —lo suyo sería «mil» y
 * «M», que es lo que da Intl—, pero «123,46 mil €» ocupa casi lo mismo que la
 * cifra entera y no arregla nada. Se eligieron a sabiendas.
 *
 * Los decimales caen si con dos tampoco cabe, que es lo que pasa a partir del
 * millar de millones: antes de sacar la cifra fuera de su sitio, mejor menos
 * precisión en un número que ya es un orden de magnitud.
 */
export function formatMoneyBreve(minor: number, code: string, tope = TOPE_BARRA): string {
  const entero = formatMoney(minor, code)
  if (entero.length <= tope) return entero

  const valor = toMajor(minor, code)
  /*
   * El escalón se elige contando con el redondeo.
   *
   * Novecientos noventa y nueve mil novecientos noventa y nueve con noventa y
   * nueve, en miles y con dos decimales, se redondea a «1000,00k», que es un
   * millón escrito de la forma más rara posible. Desde el punto en que el
   * redondeo llega al millar se salta ya al escalón siguiente.
   */
  const millones = Math.abs(valor) >= 999_995
  const escala = millones ? 1_000_000 : 1_000
  const sufijo = millones ? 'M' : 'k'
  const signo = valor < 0 ? '−' : ''
  const simbolo = currencySymbol(code)

  let breve = entero
  for (const decimales of [2, 1, 0]) {
    const numero = new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    }).format(Math.abs(valor) / escala)
    // El espacio duro es el que pone Intl entre la cifra y el símbolo: con uno
    // normal, la divisa podría quedarse sola en el renglón siguiente.
    breve = `${signo}${numero}${sufijo} ${simbolo}`
    if (breve.length <= tope) return breve
  }
  return breve
}

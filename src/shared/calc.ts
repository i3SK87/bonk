/**
 * Evaluador de la mini-calculadora de Movimientos. Vive fuera del componente
 * para poder probarlo con el resto de la capa compartida.
 */

type Token = { kind: 'number'; value: number } | { kind: 'op'; value: string }

/**
 * Trocea la expresión. Acepta los signos que se escriben con el teclado y los
 * que pone el teclado numérico de aquí (× ÷ −), y la coma o el punto como
 * separador decimal, que en un teclado numérico sale punto y en España se
 * escribe coma.
 */
function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index]

    if (char === ' ') {
      index += 1
      continue
    }

    if (/[0-9.,]/.test(char)) {
      let text = ''
      while (index < input.length && /[0-9.,]/.test(input[index])) {
        text += input[index]
        index += 1
      }
      // Con coma, el punto es separador de millares: «1.234,56». Sin coma, el
      // punto es el decimal, que es como sale del teclado numérico.
      const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
      const value = Number(normalized)
      if (!Number.isFinite(value)) return null
      tokens.push({ kind: 'number', value })
      continue
    }

    const op = { '×': '*', '÷': '/', '−': '-', '–': '-' }[char] ?? char
    if (!'+-*/%()'.includes(op)) return null
    tokens.push({ kind: 'op', value: op })
    index += 1
  }

  return tokens
}

/**
 * Evalúa por descenso recursivo, no con `eval`: la política de seguridad de la
 * ventana no deja ejecutar cadenas, y aquí solo hacen falta cuatro operaciones.
 * Devuelve null si la expresión está a medias, que es lo normal mientras se
 * escribe.
 */
export function evaluate(input: string): number | null {
  const tokens = tokenize(input)
  if (!tokens || tokens.length === 0) return null
  let position = 0

  const peek = (): Token | undefined => tokens[position]
  const eat = (value: string): boolean => {
    const token = peek()
    if (token && token.kind === 'op' && token.value === value) {
      position += 1
      return true
    }
    return false
  }

  function factor(): number | null {
    if (eat('-')) {
      const inner = factor()
      return inner == null ? null : -inner
    }
    if (eat('(')) {
      const inner = expression()
      if (inner == null || !eat(')')) return null
      return postfix(inner)
    }
    const token = peek()
    if (!token || token.kind !== 'number') return null
    position += 1
    return postfix(token.value)
  }

  // El porcentaje va detrás del número y solo significa «entre cien»: así
  // `33,99*25%` es la cuarta parte, que es para lo que se usa aquí.
  function postfix(value: number): number {
    let result = value
    while (eat('%')) result /= 100
    return result
  }

  function term(): number | null {
    let left = factor()
    if (left == null) return null
    for (;;) {
      if (eat('*')) {
        const right = factor()
        if (right == null) return null
        left *= right
      } else if (eat('/')) {
        const right = factor()
        if (right == null || right === 0) return null
        left /= right
      } else {
        return left
      }
    }
  }

  function expression(): number | null {
    let left = term()
    if (left == null) return null
    for (;;) {
      if (eat('+')) {
        const right = term()
        if (right == null) return null
        left += right
      } else if (eat('-')) {
        const right = term()
        if (right == null) return null
        left -= right
      } else {
        return left
      }
    }
  }

  const result = expression()
  if (result == null || position !== tokens.length || !Number.isFinite(result)) return null
  return result
}

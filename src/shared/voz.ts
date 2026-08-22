/**
 * De lo que dices a un formulario relleno.
 *
 * Aquí no hay inteligencia artificial ni falta: lo que se puede pedir es un
 * repertorio cerrado —cuatro tipos de movimiento, tus cuentas, tus categorías,
 * un puñado de frecuencias— y eso es una gramática. Lo que sale de aquí no se
 * guarda: abre la ficha de siempre con lo entendido puesto, y lo que no se
 * entendió se queda en blanco para que lo pongas tú.
 *
 * Todo son funciones puras a propósito, para poder comprobarlas sin micrófono
 * y sin abrir la aplicación.
 */
import { addDays, addMonths, addYears } from './dates'
import type { CategoryKind, Frequency, TxType } from './types'

/** Lo que hay en la base cuando se escucha, para poder nombrarlo. */
export interface CatalogoVoz {
  cuentas: Array<{ id: number; name: string }>
  categorias: Array<{ id: number; name: string; kind: CategoryKind }>
}

/** Un formulario a medio rellenar. Todo es opcional menos el tipo. */
export interface OrdenVoz {
  tipo: TxType
  /** En unidades mínimas, como todo el dinero de la casa. */
  importe?: number
  cuentaId?: number
  cuentaDestinoId?: number
  categoriaId?: number
  titulo?: string
  repeticion?: 'suelto' | 'repite' | 'deuda'
  freq?: Frequency
  interval?: number
  /** La fecha de la última vez, cuando se ha dicho cuánto dura. */
  fechaFin?: string
  /** Lo que se oyó, tal cual, para poder enseñarlo si algo no cuadra. */
  dicho: string
  /** Lo que no se ha sabido sacar, para avisar sin tener que adivinarlo. */
  falta: string[]
}

/* ---------- Cocina ---------- */

/** Sin tildes, sin mayúsculas y sin dobles espacios: así se compara. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:!¡?¿"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Distancia de edición, recortada: solo hace falta saber si dos palabras se
 * parecen bastante, no cuánto exactamente.
 */
function distancia(a: string, b: string): number {
  if (a === b) return 0
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0]
    fila[0] = i
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j]
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      anterior = guardado
    }
  }
  return fila[b.length]
}

/**
 * El nombre de una cuenta dicho en voz alta llega estropeado: «CaixaBank» sale
 * como «caja bank», «la caixa» o «caixabanc». Se busca el que más se parezca
 * entre los que de verdad tienes, que son cuatro o cinco, y si ninguno se
 * acerca lo suficiente no se elige nada: mejor un campo en blanco que la cuenta
 * de al lado.
 */
export function parecido<T extends { id: number; name: string }>(
  aguja: string,
  pajar: T[]
): T | undefined {
  const buscado = normalizar(aguja).replace(/\s/g, '')
  if (buscado.length < 2) return undefined

  let mejor: T | undefined
  let mejorNota = Infinity
  for (const item of pajar) {
    const nombre = normalizar(item.name).replace(/\s/g, '')
    if (!nombre) continue
    // Contenerse cuenta como acierto: «caixa» dentro de «caixabank».
    const nota =
      nombre === buscado
        ? 0
        : nombre.includes(buscado) || buscado.includes(nombre)
          ? 1
          : distancia(nombre, buscado)
    // Un tercio de las letras es todo lo que se perdona: más allá, «Hucha» y
    // «Lucha» dejarían de distinguirse.
    if (nota <= Math.max(1, Math.floor(nombre.length / 3)) && nota < mejorNota) {
      mejor = item
      mejorNota = nota
    }
  }
  return mejor
}

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40,
  cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90
}

const CIENTOS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800,
  novecientos: 900
}

/**
 * Números dichos con la boca: «doscientos cincuenta», «mil doscientos», «dos».
 *
 * Whisper escribe unas veces la cifra y otras la palabra según cómo se diga, y
 * el importe es lo único de una orden que no se puede adivinar por parecido.
 * Devuelve null cuando ninguna palabra es un número.
 */
export function numeroDicho(palabras: string[]): number | null {
  let total = 0
  let parcial = 0
  let hubo = false

  for (const palabra of palabras) {
    if (palabra === 'y') continue
    if (palabra === 'mil') {
      total += (parcial || 1) * 1000
      parcial = 0
      hubo = true
      continue
    }
    if (palabra === 'millon' || palabra === 'millones') {
      total += (parcial || 1) * 1000000
      parcial = 0
      hubo = true
      continue
    }
    const cientos = CIENTOS[palabra]
    if (cientos !== undefined) {
      parcial += cientos
      hubo = true
      continue
    }
    const unidad = UNIDADES[palabra]
    if (unidad !== undefined) {
      parcial += unidad
      hubo = true
      continue
    }
    // Cualquier otra palabra corta el número: «dos cuentas» no son doscientos.
    break
  }
  return hubo ? total + parcial : null
}

/** Un número en cifra: «200», «1.200,50», «1200.50». */
function numeroEscrito(palabra: string): number | null {
  if (!/^\d[\d.,]*$/.test(palabra)) return null
  // El último separador manda como decimal solo si deja dos cifras detrás.
  const limpio = palabra.replace(/[.,](?=\d{3}\b)/g, '')
  const valor = Number(limpio.replace(',', '.'))
  return Number.isFinite(valor) ? valor : null
}

/** Si una palabra puede formar parte de una cantidad. */
function esCifra(palabra: string): boolean {
  return (
    numeroEscrito(palabra) != null ||
    UNIDADES[palabra] !== undefined ||
    CIENTOS[palabra] !== undefined ||
    palabra === 'mil' ||
    palabra === 'millon' ||
    palabra === 'millones' ||
    palabra === 'y' ||
    palabra === 'con'
  )
}

/** «200», «doscientos cincuenta», «200 con 50»: en euros, con sus decimales. */
function leerCantidad(trozo: string[]): number | null {
  const corte = trozo.indexOf('con')
  if (corte > 0) {
    const enteros = leerCantidad(trozo.slice(0, corte))
    const centimos = leerCantidad(trozo.slice(corte + 1))
    if (enteros != null && centimos != null && centimos > 0 && centimos < 100) {
      return enteros + centimos / 100
    }
    return enteros
  }
  const escrito = trozo.length === 1 ? numeroEscrito(trozo[0]) : null
  return escrito ?? numeroDicho(trozo)
}

/**
 * El importe.
 *
 * Con «euros» delante se lee lo que haya pegado a esa palabra hacia atrás, que
 * es donde vive la cantidad: «de doscientos cincuenta euros». Sin ella solo se
 * admite la cifra escrita, porque «un» es artículo mucho más a menudo que
 * número y «haz un traspaso» no son cien céntimos.
 */
export function importeDicho(palabras: string[]): number | null {
  const marca = palabras.findIndex((p) => p === 'euros' || p === 'euro' || p === '€')

  if (marca > 0) {
    let inicio = marca
    while (inicio > 0 && esCifra(palabras[inicio - 1])) inicio--
    // Un «y» o un «con» sueltos al principio no son parte de la cantidad.
    while (inicio < marca && (palabras[inicio] === 'y' || palabras[inicio] === 'con')) inicio++
    if (inicio < marca) {
      const valor = leerCantidad(palabras.slice(inicio, marca))
      if (valor != null && valor > 0) return Math.round(valor * 100)
    }
  }

  for (const palabra of palabras) {
    const valor = numeroEscrito(palabra)
    if (valor != null && valor > 0) return Math.round(valor * 100)
  }
  return null
}

/* ---------- Frecuencia y duración ---------- */

interface Repeticion {
  freq: Frequency
  interval: number
}

const PERIODOS: Array<{ palabras: string[]; freq: Frequency }> = [
  { palabras: ['dia', 'dias', 'diario', 'diaria'], freq: 'daily' },
  { palabras: ['semana', 'semanas', 'semanal'], freq: 'weekly' },
  { palabras: ['mes', 'meses', 'mensual', 'mensualmente'], freq: 'monthly' },
  { palabras: ['ano', 'anos', 'anual', 'anualmente'], freq: 'yearly' }
]

/** «mensual», «cada mes», «cada dos meses», «cada 15 días». */
export function repeticionDicha(palabras: string[]): Repeticion | null {
  for (let i = 0; i < palabras.length; i++) {
    const periodo = PERIODOS.find((p) => p.palabras.includes(palabras[i]))
    if (!periodo) continue

    // «cada dos meses»: el número vive entre «cada» y el periodo.
    let interval = 1
    for (let atras = Math.max(0, i - 3); atras < i; atras++) {
      if (palabras[atras] === 'cada') {
        const trozo = palabras.slice(atras + 1, i)
        if (trozo.length > 0) {
          const escrito = numeroEscrito(trozo[0])
          const valor = escrito ?? numeroDicho(trozo)
          if (valor != null && valor >= 1 && valor <= 99) interval = Math.round(valor)
        }
        break
      }
    }
    return { freq: periodo.freq, interval }
  }
  return null
}

/**
 * Cuánto dura: «a dos años», «a 12 meses», «durante un año».
 *
 * Se devuelve en cuotas, no en fecha, porque la fecha depende de cada cuánto se
 * paga: dos años son veinticuatro cuotas mensuales o ocho trimestrales.
 */
export function duracionDicha(palabras: string[], cada: Repeticion): number | null {
  for (let i = 0; i < palabras.length; i++) {
    if (palabras[i] !== 'a' && palabras[i] !== 'durante' && palabras[i] !== 'en') continue
    const trozo = palabras.slice(i + 1, i + 4)
    if (trozo.length === 0) continue
    const escrito = numeroEscrito(trozo[0])
    const cantidad = escrito ?? numeroDicho(trozo)
    if (cantidad == null || cantidad < 1) continue

    const periodo = trozo.find((p) => PERIODOS.some((x) => x.palabras.includes(p)))
    if (!periodo) continue
    const unidad = PERIODOS.find((x) => x.palabras.includes(periodo))!.freq

    // A meses, que es la moneda común de las frecuencias que se usan aquí.
    const mesesTotales =
      unidad === 'yearly'
        ? cantidad * 12
        : unidad === 'monthly'
          ? cantidad
          : unidad === 'weekly'
            ? (cantidad * 7) / 30.44
            : cantidad / 30.44

    const mesesPorCuota =
      cada.freq === 'yearly'
        ? 12 * cada.interval
        : cada.freq === 'monthly'
          ? cada.interval
          : cada.freq === 'weekly'
            ? (7 * cada.interval) / 30.44
            : cada.interval / 30.44

    const cuotas = Math.round(mesesTotales / mesesPorCuota)
    if (cuotas >= 1) return cuotas
  }
  return null
}

/** La fecha de la última cuota: la primera se paga hoy, así que van N−1 saltos. */
export function ultimaCuota(desde: string, cada: Repeticion, cuotas: number): string {
  const saltos = (cuotas - 1) * cada.interval
  if (cada.freq === 'daily') return addDays(desde, saltos)
  if (cada.freq === 'weekly') return addDays(desde, saltos * 7)
  if (cada.freq === 'yearly') return addYears(desde, saltos)
  return addMonths(desde, saltos)
}

/* ---------- El tipo de movimiento ---------- */

const VERBOS: Array<{ palabras: string[]; tipo: TxType }> = [
  { palabras: ['traspaso', 'traspasa', 'traspasar', 'transfiere', 'transferencia', 'mueve', 'pasa'], tipo: 'transfer' },
  { palabras: ['reembolso', 'devolucion', 'devuelven', 'devuelto', 'reembolsan'], tipo: 'refund' },
  { palabras: ['ingreso', 'ingresa', 'ingresar', 'cobro', 'cobrado', 'nomina'], tipo: 'income' },
  { palabras: ['gasto', 'gasta', 'gastar', 'gastado', 'paga', 'pagado', 'compra', 'comprado', 'deuda'], tipo: 'expense' }
]

function tipoDicho(palabras: string[]): TxType {
  for (const palabra of palabras) {
    const verbo = VERBOS.find((v) => v.palabras.includes(palabra))
    if (verbo) return verbo.tipo
  }
  // Lo que más se apunta es un gasto, y es lo que menos daño hace acertando mal:
  // el tipo se ve en la botonera de arriba antes de guardar nada.
  return 'expense'
}

/* ---------- Nombres propios ---------- */

/**
 * Lo que hay entre dos marcas: «de CaixaBank a Hucha» son dos nombres. Se corta
 * en la siguiente preposición o en el final, y se limpian las muletillas.
 */
function trozoTras(palabras: string[], marcas: string[], cortes: string[]): string | null {
  for (let i = 0; i < palabras.length; i++) {
    if (!marcas.includes(palabras[i])) continue
    const trozo: string[] = []
    for (let j = i + 1; j < palabras.length; j++) {
      if (cortes.includes(palabras[j])) break
      if (['la', 'el', 'los', 'las', 'mi', 'mis'].includes(palabras[j]) && trozo.length === 0) continue
      trozo.push(palabras[j])
      // Los nombres de cuenta son cortos; más de tres palabras ya es una frase.
      if (trozo.length === 3) break
    }
    if (trozo.length > 0) return trozo.join(' ')
  }
  return null
}

const CORTES = [
  'a', 'al', 'de', 'del', 'en', 'por', 'para', 'con', 'y', 'euros', 'euro',
  'cada', 'mensual', 'semanal', 'anual', 'diario', 'durante', 'que', 'llamado',
  'llamada', 'nombre', 'concepto'
]

/* ---------- Y todo junto ---------- */

/**
 * Entiende una orden. Nunca lanza: lo que no se saca se queda sin poner y se
 * anota en `falta`, que es lo que luego se dice en pantalla.
 */
export function entender(texto: string, catalogo: CatalogoVoz, hoy: string): OrdenVoz {
  const palabras = normalizar(texto).split(' ').filter(Boolean)
  const tipo = tipoDicho(palabras)
  const falta: string[] = []

  const orden: OrdenVoz = { tipo, dicho: texto.trim(), falta }

  const importe = importeDicho(palabras)
  if (importe != null) orden.importe = importe
  else falta.push('el importe')

  /*
   * Las cuentas. En un traspaso hay dos y el orden manda —«de aquí a allá»—;
   * en lo demás solo hay una, y tanto da decir «de» como «en» o «desde».
   */
  if (tipo === 'transfer') {
    const origen = trozoTras(palabras, ['de', 'desde', 'del'], CORTES.filter((c) => c !== 'de' && c !== 'del'))
    const destino = trozoTras(palabras, ['a', 'al', 'hacia', 'hasta'], CORTES.filter((c) => c !== 'a' && c !== 'al'))
    const cuentaOrigen = origen ? parecido(origen, catalogo.cuentas) : undefined
    const cuentaDestino = destino ? parecido(destino, catalogo.cuentas) : undefined
    if (cuentaOrigen) orden.cuentaId = cuentaOrigen.id
    else falta.push('la cuenta de origen')
    if (cuentaDestino && cuentaDestino.id !== cuentaOrigen?.id) orden.cuentaDestinoId = cuentaDestino.id
    else falta.push('la cuenta de destino')
  } else {
    const dicha = trozoTras(palabras, ['de', 'en', 'desde', 'del'], CORTES.filter((c) => c !== 'de' && c !== 'del' && c !== 'en'))
    const cuenta = dicha ? parecido(dicha, catalogo.cuentas) : undefined
    if (cuenta) orden.cuentaId = cuenta.id
  }

  // La categoría se busca por su nombre en toda la frase: son pocas y se llaman
  // como se llaman —«en restaurantes», «de alimentación»—.
  if (tipo !== 'transfer') {
    const suyas = catalogo.categorias.filter(
      (c) => c.kind === (tipo === 'income' ? 'income' : 'expense')
    )
    for (let i = 0; i < palabras.length; i++) {
      for (let largo = 2; largo >= 1; largo--) {
        const trozo = palabras.slice(i, i + largo).join(' ')
        const encontrada = parecido(trozo, suyas)
        if (encontrada && orden.categoriaId === undefined) {
          orden.categoriaId = encontrada.id
          break
        }
      }
      if (orden.categoriaId !== undefined) break
    }
  }

  // El título solo cuando se dice a las claras, que inventarlo del sobrante
  // acaba poniendo «de la cuenta» en el nombre de una deuda.
  const titulo = trozoTras(palabras, ['llamado', 'llamada', 'nombre', 'concepto'], CORTES)
  if (titulo) orden.titulo = titulo

  // Cómo vuelve. «Deuda» manda sobre la frecuencia: una deuda siempre se repite.
  const cada = repeticionDicha(palabras)
  const esDeuda = palabras.includes('deuda') || palabras.includes('plazos')
  if (esDeuda && tipo === 'expense') orden.repeticion = 'deuda'
  else if (cada) orden.repeticion = 'repite'

  if (orden.repeticion) {
    const ritmo = cada ?? { freq: 'monthly' as Frequency, interval: 1 }
    orden.freq = ritmo.freq
    orden.interval = ritmo.interval
    const cuotas = duracionDicha(palabras, ritmo)
    if (cuotas != null) orden.fechaFin = ultimaCuota(hoy, ritmo, cuotas)
    else if (orden.repeticion === 'deuda') falta.push('cuándo termina')
  }

  return orden
}

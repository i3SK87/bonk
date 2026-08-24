/**
 * El tema, puesto antes de que se pinte nada.
 *
 * La aplicación arrancaba con un fogonazo blanco: el primer fotograma salía en
 * claro y al siguiente ya estaba en oscuro. No era un fallo del tema sino de
 * cuándo se aplica. Los ajustes viven en la base de datos y llegan por el
 * puente, que es asíncrono; mientras tanto React ya ha dibujado, y sin el
 * atributo puesto la hoja de estilos usa su juego de variables por defecto, que
 * es el claro. Encima los efectos de React corren *después* de pintar, así que
 * ni siquiera el primer dibujo con los ajustes de fábrica llegaba a tiempo.
 *
 * Aquí se guarda en el navegador lo último que se sabe y se aplica de golpe al
 * cargar el módulo, antes de montar nada. No sustituye a los ajustes de verdad
 * —cuando llegan, mandan ellos—, solo evita el destello mientras vienen.
 *
 * La primera vez no hay nada guardado y se cae en lo que diga el sistema, que es
 * exactamente lo que hace el proceso principal para pintar el fondo de la
 * ventana. Así el hueco entre el fondo nativo y el primer dibujo tampoco canta.
 */

const CLAVE_TEMA = 'bonk:tema'
const CLAVE_PALETA = 'bonk:paleta'

/**
 * Apunta lo que hay puesto para el próximo arranque.
 *
 * Se guarda el ajuste tal cual y no si acabó siendo claro u oscuro: «automático»
 * tiene que seguir preguntándole al sistema en el siguiente arranque, no
 * quedarse congelado en lo que el sistema dijera hoy.
 */
export function recordarTema(theme: string, palette: string): void {
  try {
    localStorage.setItem(CLAVE_TEMA, theme)
    localStorage.setItem(CLAVE_PALETA, palette)
  } catch {
    // Sin sitio donde guardar se vive igual: solo se pierde el arranque limpio.
  }
}

/** Resuelve «automático» contra el sistema; los otros dos se creen tal cual. */
export function esOscuro(theme: string): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Deja el elemento raíz vestido antes del primer dibujo. */
export function aplicarTemaGuardado(): void {
  let theme = 'system'
  let palette = 'grafito'
  try {
    theme = localStorage.getItem(CLAVE_TEMA) ?? theme
    palette = localStorage.getItem(CLAVE_PALETA) ?? palette
  } catch {
    // Ni leerlo se puede: se arranca con lo de fábrica, como siempre se hizo.
  }
  const raiz = document.documentElement
  raiz.setAttribute('data-theme', esOscuro(theme) ? 'dark' : 'light')
  raiz.setAttribute('data-palette', palette)
}

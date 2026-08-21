/**
 * Convierte resources/icon.svg en el icono de Windows.
 *
 *   npx electron scripts/icono.cjs
 *
 * Se ejecuta dentro de Electron porque aquí no hay con qué rasterizar: ni
 * ImageMagick ni nada que compile código nativo. Pero Chromium ya viene con la
 * aplicación, así que se abre una ventana escondida con un lienzo y se le pide
 * el dibujo a cada tamaño.
 *
 * Capturar la ventana era lo obvio, pero una que no se enseña no siempre pinta
 * y la captura se quedaba esperando para siempre; por el lienzo no hace falta
 * que nada se vea, y encima conserva la transparencia de las esquinas.
 *
 * Va en CommonJS a propósito: como entrada de Electron, un .mjs se queda
 * colgado sin llegar a arrancar.
 *
 * El .ico resultante lleva PNG dentro —el formato lo admite desde Vista— en
 * lugar de mapas de bits, que es lo que permite meter los 256 px sin que el
 * archivo se dispare.
 */
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const raiz = join(__dirname, '..')
const svg = readFileSync(join(raiz, 'resources/icon.svg'), 'utf8')

// Los que Windows usa: bandeja y barra de tareas abajo, y 256 para la ficha
// grande del explorador y el instalador.
const TAMANOS = [16, 24, 32, 48, 64, 128, 256]

/** El .ico: cabecera, un índice de entradas y los PNG detrás. */
function empaquetar(entradas) {
  const cabecera = Buffer.alloc(6)
  cabecera.writeUInt16LE(0, 0)
  cabecera.writeUInt16LE(1, 2) // 1 = icono
  cabecera.writeUInt16LE(entradas.length, 4)

  const indice = Buffer.alloc(entradas.length * 16)
  let offset = 6 + indice.length

  entradas.forEach(({ lado, png }, i) => {
    const p = i * 16
    // 256 se escribe como 0: el campo es de un byte.
    indice[p] = lado >= 256 ? 0 : lado
    indice[p + 1] = lado >= 256 ? 0 : lado
    indice[p + 2] = 0 // sin paleta
    indice[p + 3] = 0
    indice.writeUInt16LE(1, p + 4) // planos
    indice.writeUInt16LE(32, p + 6) // bits por píxel
    indice.writeUInt32LE(png.length, p + 8)
    indice.writeUInt32LE(offset, p + 12)
    offset += png.length
  })

  return Buffer.concat([cabecera, indice, ...entradas.map((e) => e.png)])
}

// El SVG viaja como data: para que el lienzo no quede manchado —una imagen de
// otro origen inutiliza toDataURL— y se espera a que decodifique antes de nada.
const fuente = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64')

const guion = `
  const imagen = new Image()
  imagen.src = ${JSON.stringify(fuente)}
  const listo = imagen.decode()
  window.dibujar = async (lado) => {
    await listo
    const lienzo = document.createElement('canvas')
    lienzo.width = lado
    lienzo.height = lado
    const pincel = lienzo.getContext('2d')
    pincel.clearRect(0, 0, lado, lado)
    pincel.drawImage(imagen, 0, 0, lado, lado)
    return lienzo.toDataURL('image/png')
  }
  true
`

app.whenReady().then(async () => {
  const ventana = new BrowserWindow({ show: false, width: 300, height: 300 })
  await ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html>'))
  await ventana.webContents.executeJavaScript(guion)

  const entradas = []
  for (const lado of TAMANOS) {
    const png = await ventana.webContents.executeJavaScript(`dibujar(${lado})`)
    entradas.push({ lado, png: Buffer.from(png.slice(png.indexOf(',') + 1), 'base64') })
  }
  ventana.destroy()

  const ico = empaquetar(entradas)
  writeFileSync(join(raiz, 'resources/icon.ico'), ico)
  writeFileSync(join(raiz, 'resources/icon.png'), entradas.at(-1).png)

  // Por consola no se ve —Electron en Windows no la tiene—, así que el resumen
  // se deja en un archivo al lado del icono.
  writeFileSync(
    join(raiz, 'resources/icon.txt'),
    `icon.ico — ${Math.round(ico.length / 1024)} kB\n` +
      entradas.map((e) => `  ${e.lado}px · ${e.png.length} bytes`).join('\n') +
      '\n'
  )

  app.quit()
})

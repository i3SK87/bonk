/**
 * Deja la copia de desarrollo lista para arrancar: compila y comprueba que no
 * falta nada.
 *
 * No empaqueta, no instala y —esto es lo que cambió— **no toca los accesos
 * directos**. Durante un tiempo sí lo hacía: los apuntaba a `out/`, porque el
 * Control inteligente de aplicaciones tumbaba el ejecutable empaquetado —decide
 * por reputación, y cada compilación es un archivo nuevo sin ninguna, así que
 * una arrancaba y la siguiente no— y la copia de desarrollo era la de diario.
 *
 * Ese apaño se quedó sin motivo y con un efecto secundario feo: apagado el
 * Control inteligente, el BONK de diario vuelve a ser el instalado, que es el
 * único que se actualiza solo desde dentro. Y cada `npm run deploy` le robaba
 * los accesos directos y devolvía al usuario a una copia que, por no estar
 * empaquetada, contesta «esta copia se ejecuta desde la carpeta del proyecto,
 * no instalada» a cualquier intento de actualizarse.
 *
 * Así que ahora cada uno a lo suyo:
 *   - Los accesos directos «BONK» son los del instalador, y apuntan a
 *     `%LOCALAPPDATA%\\Programs\\BONK`. Se rehacen solos en cada actualización.
 *   - Para ver un cambio antes de publicarlo: `npm run dev`, o arrancar a mano
 *     `node_modules\\electron\\dist\\electron.exe .` desde la raíz.
 *   - Para publicar: `npm run dist`, que fabrica el instalador de verdad.
 *
 * Si alguna vez hay que reparar los accesos directos —o quitar el «Electron.lnk»
 * que se cuela en el menú Inicio y le roba el nombre a los avisos—, sigue aquí
 * `scripts/shortcut.ps1`, que además graba el AppUserModelID.
 *
 *   npm run deploy
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { productName, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

if (!existsSync(join(root, 'out', 'main', 'index.js'))) {
  console.error('No hay nada compilado en out/. Ejecuta antes: npm run build')
  process.exit(1)
}

const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!existsSync(electron)) {
  console.error(`No se encuentra el motor de Electron en ${electron}. Ejecuta: npm install`)
  process.exit(1)
}

console.log(`\n${productName} ${version} compilado en out/.`)
console.log('Para verlo: npm run dev')
console.log('Los accesos directos «BONK» son los de la copia instalada y no se tocan.')

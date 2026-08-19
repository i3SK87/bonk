/**
 * Deja BONK listo para usarse en este equipo: compila y pone al día los accesos
 * directos.
 *
 * No empaqueta ni instala nada. La aplicación se abre arrancando el motor de
 * Electron sobre esta carpeta, así que lo que se ejecuta es `out/`, no una copia
 * en otro sitio. Se probó a apuntar los accesos directos al ejecutable
 * empaquetado y duró una versión: el Control inteligente de aplicaciones decide
 * por reputación, cada compilación es un archivo nuevo sin ninguna, y una
 * arranca y la siguiente no. Empaquetar es cosa de `npm run dist`, que fabrica
 * lo que se publica para otros equipos.
 *
 *   npm run deploy
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

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

/**
 * Los accesos directos se rehacen con su AppUserModelID grabado, que es de
 * donde Windows saca el nombre y el icono de la cabecera de las notificaciones.
 */
const result = spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'scripts', 'shortcut.ps1'),
    '-Target', electron,
    '-Arguments', `"${root}"`,
    '-Icon', join(root, 'resources', 'icon.ico')
  ],
  { encoding: 'utf8' }
)

console.log(`\n${productName} ${version} listo.`)
if (result.status === 0) {
  console.log('Accesos directos al día:')
  process.stdout.write(result.stdout)
} else {
  console.warn('No se pudieron rehacer los accesos directos:', result.stderr?.trim())
}

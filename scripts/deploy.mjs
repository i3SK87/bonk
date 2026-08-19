/**
 * Instala la compilación de `release/win-unpacked` en la carpeta de programas
 * del usuario, sobrescribiendo la versión anterior.
 *
 * Va sin instalador a propósito: el Control inteligente de aplicaciones de
 * Windows 11 bloquea los instaladores sin firmar, pero no tiene nada en contra
 * de la aplicación en sí. Copiar la carpeta es exactamente lo que haría el
 * instalador, sin el trámite que Windows rechaza.
 *
 *   npm run deploy
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'release', 'win-unpacked')
const { productName, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const programs = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Programs')
  : null

if (!programs) {
  console.error('No se encuentra %LOCALAPPDATA%: esto solo vale para Windows.')
  process.exit(1)
}

if (!existsSync(join(source, `${productName}.exe`))) {
  console.error(`No hay nada compilado en ${source}. Ejecuta antes: npm run pack`)
  process.exit(1)
}

const target = join(programs, productName)

try {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  mkdirSync(programs, { recursive: true })
  cpSync(source, target, { recursive: true })
} catch (error) {
  // El caso habitual: la aplicación está abierta y Windows tiene el .exe cogido.
  if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
    console.error(`\nNo se pudo escribir en ${target}.`)
    console.error('Lo normal es que BONK esté abierto: ciérralo y vuelve a lanzar npm run deploy.')
    process.exit(1)
  }
  throw error
}

console.log(`\n${productName} ${version} instalado en ${target}`)

/**
 * Los accesos directos se rehacen en cada despliegue con su AppUserModelID
 * grabado, que es de donde Windows saca el nombre y el icono de la cabecera de
 * las notificaciones.
 *
 * Apuntan al motor de Electron con la carpeta del proyecto y no al ejecutable
 * recién instalado porque el Control inteligente de aplicaciones decide por
 * reputación, y cada compilación es un binario nuevo sin ninguna: una versión
 * arranca y la siguiente no. El motor, en cambio, siempre pasa.
 */
const result = spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'scripts', 'shortcut.ps1'),
    '-Target', join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
    '-Arguments', `"${root}"`,
    '-Icon', join(root, 'resources', 'icon.ico')
  ],
  { encoding: 'utf8' }
)
if (result.status === 0) {
  console.log('Accesos directos al día:')
  process.stdout.write(result.stdout)
} else {
  console.warn('No se pudieron rehacer los accesos directos:', result.stderr?.trim())
}

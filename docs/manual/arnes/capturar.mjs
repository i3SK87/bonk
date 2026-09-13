// Compila el arnés y rehace todas las capturas del manual, una por proceso.
//
//   node docs/manual/arnes/capturar.mjs [b01 b05 …]   (antes, npm run build)
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..', '..', '..')
const salida = join(raiz, 'out', 'manual')
mkdirSync(salida, { recursive: true })
mkdirSync(join(raiz, 'docs', 'manual', 'capturas'), { recursive: true })

await build({
  entryPoints: [join(aqui, 'principal.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: join(salida, 'principal.cjs'),
  external: ['electron', 'electron-updater', 'node:*'],
  alias: { '@shared': join(raiz, 'src', 'shared') },
  loader: { '.ico': 'file' },
  logLevel: 'warning'
})
copyFileSync(join(aqui, 'acciones.cjs'), join(salida, 'acciones.cjs'))
// Con su package.json, Electron toma el nombre y la versión de BONK: si no, en
// Ajustes ▸ Acerca de saldría la versión del propio Electron.
const { version } = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
writeFileSync(join(salida, 'package.json'), JSON.stringify({ name: 'bonk', productName: 'BONK', version, main: 'principal.cjs' }))

const electron = createRequire(import.meta.url)(join(raiz, 'node_modules', 'electron'))
const TODAS = ['b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08', 'b09', 'b10', 'b11', 'b12', 'b13', 'b14', 'b15', 'b16', 'b17']
const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : TODAS
for (const escena of pedidas) {
  const r = spawnSync(electron, [salida, `--escena=${escena}`], { encoding: 'utf8', timeout: 90_000 })
  const lineas = (r.stdout || '').split('\n').filter((l) => l.trim())
  console.log(lineas.join('\n') || `${escena}: sin respuesta ${r.stderr?.slice(0, 300) ?? ''}`)
}

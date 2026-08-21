import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Icon } from '../components/Icon'
import type { Account, Category, Goal } from '@shared/types'

/**
 * Los avisos de Windows llevan una imagen, y los iconos de la aplicación son SVG
 * que solo existen dentro de la interfaz. Aquí se dibuja cada uno como PNG —el
 * mismo cuadrado redondeado de color con el símbolo en blanco que se ve en las
 * listas— y se le pasan al proceso principal, que es quien manda el aviso.
 *
 * Van los de las categorías, los de las cuentas y los de los hitos: cada aviso
 * enseña la cara de lo que cuenta, no el icono genérico de BONK.
 *
 * Se hace en la ventana porque es la única que tiene con qué rasterizar: en el
 * proceso principal no hay lienzo ni intérprete de SVG.
 */

const api = window.bonk

/** Lo ya dibujado, para no repetir el trabajo en cada recarga de catálogos. */
const cache = new Map<string, string>()

async function draw(icon: string, color: string, size = 96): Promise<string> {
  const key = `${icon}|${color}|${size}`
  const hit = cache.get(key)
  if (hit) return hit

  // El símbolo se saca pintando el propio componente en un nodo suelto y
  // serializándolo. Da el mismo dibujo que en pantalla sin traerse el renderizador
  // de servidor de React solo para esto.
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(createElement(Icon, { name: icon, size: 24, strokeWidth: 2 })))
  // Trazo blanco fijo: `currentColor` no tiene de dónde heredar en una imagen suelta.
  const glyph = (host.innerHTML || '').replace(/currentColor/g, '#ffffff')
  root.unmount()

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="26" fill="${color}"/>` +
    `<g transform="translate(24 24) scale(2)">${glyph}</g>` +
    `</svg>`

  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')?.drawImage(image, 0, 0, size, size)

  const png = canvas.toDataURL('image/png')
  cache.set(key, png)
  return png
}

/** Firma de la lista: si no cambia, no hay nada que volver a mandar. */
let lastSignature = ''

/**
 * Manda todos los iconos que un aviso puede necesitar.
 *
 * La clave lleva de qué es cada uno —«c:» categoría, «a:» cuenta, «g:» hito—,
 * porque los números se repiten entre las tres tablas y sin la letra el aviso de
 * una cuenta acabaría con la cara de una categoría.
 */
export async function pushNotificationIcons(
  categories: Category[],
  accounts: Account[],
  goals: Goal[]
): Promise<void> {
  const fuentes: Array<[string, { id: number; icon: string; color: string }]> = [
    ...categories.map((item) => ['c', item] as [string, Category]),
    ...accounts.map((item) => ['a', item] as [string, Account]),
    ...goals.map((item) => ['g', item] as [string, Goal])
  ]
  const signature = fuentes.map(([k, item]) => `${k}${item.id}:${item.icon}:${item.color}`).join('|')
  if (signature === lastSignature || fuentes.length === 0) return
  lastSignature = signature

  const icons: Record<string, string> = {}
  for (const [prefijo, item] of fuentes) {
    try {
      icons[`${prefijo}:${item.id}`] = await draw(item.icon, item.color)
    } catch {
      // Un icono que no se deja dibujar no vale una pantalla en blanco: ese
      // aviso saldrá con el icono de la aplicación y ya está.
    }
  }
  await api.notifications.setIcons(icons)
}

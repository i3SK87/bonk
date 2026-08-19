import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Icon } from '../components/Icon'
import type { Category } from '@shared/types'

/**
 * Los avisos de Windows llevan una imagen, y los iconos de las categorías son
 * SVG que solo existen dentro de la interfaz. Aquí se dibuja cada uno como PNG
 * —el mismo cuadrado redondeado de color con el símbolo en blanco que se ve en
 * las listas— y se le pasan al proceso principal, que es quien manda el aviso.
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

export async function pushCategoryIcons(categories: Category[]): Promise<void> {
  const signature = categories.map((item) => `${item.id}:${item.icon}:${item.color}`).join('|')
  if (signature === lastSignature || categories.length === 0) return
  lastSignature = signature

  const icons: Record<number, string> = {}
  for (const category of categories) {
    try {
      icons[category.id] = await draw(category.icon, category.color)
    } catch {
      // Un icono que no se deja dibujar no vale una pantalla en blanco: ese
      // aviso saldrá con el icono de la aplicación y ya está.
    }
  }
  await api.notifications.setIcons(icons)
}

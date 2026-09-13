// El preload del arnés: hace dentro de la ventana los clics que pide cada
// escena. Corre en su propio mundo aislado, que ve el DOM; `executeJavaScript`
// no sirve con BONK, que su política de seguridad no admite `unsafe-eval`.
const { ipcRenderer } = require('electron')

function buscar(selector, texto) {
  const nodos = [...document.querySelectorAll(selector)]
  return texto ? nodos.find((n) => n.textContent.includes(texto)) : nodos[0]
}

ipcRenderer.on('arnes:accion', (_e, accion, selector, valor) => {
  let ok = false
  const nodo = accion === 'desplazar' ? document.querySelector(selector) : buscar(selector, accion === 'escribir' ? undefined : valor)
  if (nodo) {
    ok = true
    if (accion === 'pulsar') nodo.click()
    else if (accion === 'desplazar') nodo.scrollTop = valor
    else if (accion === 'escribir') {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(nodo, valor)
      nodo.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (accion === 'contextual') {
      const r = nodo.getBoundingClientRect()
      nodo.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width * 0.55, clientY: r.top + r.height / 2 })
      )
    }
  }
  ipcRenderer.send('arnes:hecho', ok)
})

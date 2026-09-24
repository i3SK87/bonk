import type { ReactNode } from 'react'
import { Modal } from './ui'

type Atajo = [teclas: string[][], que: string]

/**
 * Las secciones salen de la barra lateral y no se escriben aquí: si un día
 * cambia el orden, `Ctrl+número` y la chuleta cambian a la vez.
 */
const grupos = (secciones: string[]): Array<{ titulo: string; atajos: Atajo[] }> => [
  {
    titulo: 'En toda la aplicación',
    atajos: [
      ...secciones.map((seccion, i): Atajo => [[['Ctrl', String(i + 1)]], seccion]),
      [[['Ctrl', ',']], 'Ajustes'],
      [[['Ctrl', 'N']], 'Nuevo movimiento'],
      [[['Ctrl', 'F']], 'Buscar, en Movimientos'],
      [[['F1']], 'Esta chuleta']
    ]
  },
  {
    titulo: 'En una lista',
    atajos: [
      [[['↑'], ['↓']], 'Pasar de una fila a otra'],
      [[['←'], ['→']], 'Lo mismo, en rejillas y tiras'],
      [[['Inicio'], ['Fin']], 'La primera o la última'],
      [[['RePág'], ['AvPág']], 'Saltar de diez en diez'],
      [[['Intro']], 'Abrir la fila'],
      [[['Supr']], 'Eliminarla, preguntando antes'],
      [[['Menú'], ['Mayús', 'F10']], 'Su menú del clic derecho']
    ]
  },
  {
    titulo: 'En un formulario',
    atajos: [
      [[['Tab'], ['Mayús', 'Tab']], 'Campo siguiente o anterior'],
      [[['Ctrl', 'Intro']], 'Guardar el movimiento'],
      [[['Ctrl', 'Mayús', 'Intro']], 'Guardar y seguir con otro'],
      [[['Esc']], 'Cerrar sin guardar']
    ]
  }
]

/**
 * La chuleta del teclado, con F1.
 *
 * Todos juntos y no por pantalla: son los mismos en todas, que es lo que los
 * hace fáciles de aprender. Una sola lista corta vale más que una que cambia
 * según dónde estés.
 */
export function Atajos({ secciones, onClose }: { secciones: string[]; onClose: () => void }): ReactNode {
  return (
    <Modal title="Atajos de teclado" onClose={onClose}>
      <div className="atajos">
        {grupos(secciones).map((grupo) => (
          <section key={grupo.titulo}>
            <h3>{grupo.titulo}</h3>
            <dl>
              {grupo.atajos.map(([teclas, que]) => (
                <div key={que} className="atajo">
                  <dt>
                    {teclas.map((combinacion, i) => (
                      <span key={i} className="atajo-combinacion">
                        {i > 0 && <span className="atajo-o">o</span>}
                        {combinacion.map((tecla) => (
                          <kbd key={tecla}>{tecla}</kbd>
                        ))}
                      </span>
                    ))}
                  </dt>
                  <dd>{que}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}

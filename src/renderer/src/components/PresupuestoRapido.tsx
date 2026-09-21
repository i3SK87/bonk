/**
 * Poner, cambiar o quitar el presupuesto de una categoría sin abrir su ficha.
 *
 * El presupuesto es lo único de una categoría que se retoca a menudo —se prueba con
 * sesenta, se ve que aprieta de más, se sube a setenta y cinco—, y para eso
 * había que abrir la ficha entera, con su icono, su color y sus casillas. Aquí
 * hay un campo y un botón, y se llega por el clic derecho desde donde se está
 * mirando: la lista de categorías o el informe del mes.
 *
 * Lo demás de la categoría viaja tal cual venía, incluida la regla de ahorro:
 * es lo que hace que cambiar el presupuesto no borre nada de lo otro.
 */
import { useState, type ReactNode } from 'react'
import { Modal, AmountInput, Field } from './ui'
import { useStore } from '../lib/store'
import type { Category } from '@shared/types'

const api = window.bonk

export function PresupuestoRapido({
  category,
  onClose
}: {
  category: Category
  onClose: () => void
}): ReactNode {
  const { settings, run } = useStore()
  const [presupuesto, setPresupuesto] = useState(category.spendLimit ?? 0)
  const tenia = (category.spendLimit ?? 0) > 0

  const guardar = async (): Promise<void> => {
    await run(
      () => api.categories.save({ ...category, spendLimit: presupuesto }),
      presupuesto > 0 ? 'Presupuesto guardado' : 'Presupuesto quitado'
    )
    onClose()
  }

  return (
    <Modal
      title={tenia ? 'Cambiar el presupuesto' : 'Poner un presupuesto'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      {/* De qué categoría se está hablando: el menú se abrió sobre una fila y
          para cuando el cuadro está delante ya no se ve cuál era. */}
      <p className="small muted" style={{ margin: '0 0 14px' }}>
        {category.name}
      </p>

      <Field
        label="Presupuesto mensual"
        hint={
          tenia
            ? 'Avisa al llegar al 80 % y al pasarte. A cero, se quita el presupuesto.'
            : 'Avisa al llegar al 80 % y al pasarte. A cero, sin presupuesto.'
        }
      >
        <AmountInput
          value={presupuesto}
          currency={settings.baseCurrency}
          onChange={setPresupuesto}
          autoFocus
        />
      </Field>
    </Modal>
  )
}

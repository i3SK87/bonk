/**
 * Poner un presupuesto a una categoría que todavía no lo tiene, desde el informe.
 *
 * El clic derecho sobre una tarjeta sirve para retocar un presupuesto que ya
 * está —eso es [[PresupuestoRapido]]—, pero para estrenar el primero no había
 * por dónde: había que irse a Categorías, buscar la ficha y volver. Y es en el
 * informe del mes donde se ve el hueco, cuando miras en qué se te ha ido el
 * dinero y ves una categoría gorda sin raya ninguna.
 *
 * De ahí que el cuadro empiece por la categoría y no por el importe: aquí no se
 * sabe de cuál estamos hablando, al contrario que cuando se abre sobre una fila.
 * Solo salen las de gasto sin presupuesto —en un ingreso no hay nada de lo que
 * pasarse, y una que ya lo tiene se cambia desde su tarjeta—, y la ficha viaja
 * entera para no perder por el camino ni el icono ni lo demás.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Modal, AmountInput, Field } from './ui'
import { useStore } from '../lib/store'

const api = window.bonk

export function NuevoPresupuesto({ onClose }: { onClose: () => void }): ReactNode {
  const { settings, categories, run } = useStore()
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [presupuesto, setPresupuesto] = useState(0)

  /*
   * Las que pueden estrenar presupuesto: de gasto, vivas y sin raya puesta.
   * Las archivadas se quedan fuera porque ponerle un presupuesto a algo que ya
   * no se usa no avisa de nada.
   */
  const candidatas = useMemo(
    () =>
      categories.filter(
        (categoria) =>
          categoria.kind === 'expense' && !categoria.archived && !(categoria.spendLimit ?? 0)
      ),
    [categories]
  )

  /** «Casa › Luz» y no «Luz» a secas: en una lista suelta no se sabe de qué es. */
  const rotulo = (id: number, name: string, parentId: number | null): string => {
    const padre = parentId == null ? undefined : categories.find((item) => item.id === parentId)
    return padre ? `${padre.name} › ${name}` : name
  }

  const elegida = candidatas.find((categoria) => categoria.id === categoryId)
  const puedeGuardar = elegida != null && presupuesto > 0

  const guardar = async (): Promise<void> => {
    if (!elegida) return
    await run(
      () => api.categories.save({ ...elegida, spendLimit: presupuesto }),
      'Presupuesto guardado'
    )
    onClose()
  }

  return (
    <Modal
      title="Nuevo presupuesto"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={guardar} disabled={!puedeGuardar}>
            Guardar
          </button>
        </>
      }
    >
      <Field
        label="Categoría"
        required
        hint={
          candidatas.length === 0
            ? 'Todas tus categorías de gasto tienen ya presupuesto. Los que hay se cambian desde su tarjeta.'
            : 'Solo las de gasto que aún no tienen presupuesto.'
        }
      >
        <select
          className="select"
          value={categoryId ?? ''}
          disabled={candidatas.length === 0}
          onChange={(evento) => setCategoryId(evento.target.value ? Number(evento.target.value) : null)}
        >
          <option value="">Elige la categoría…</option>
          {candidatas.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {rotulo(categoria.id, categoria.name, categoria.parentId)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Presupuesto mensual" hint="Avisa al llegar al 80 % y al pasarte.">
        <AmountInput
          value={presupuesto}
          currency={settings.baseCurrency}
          onChange={setPresupuesto}
        />
      </Field>
    </Modal>
  )
}

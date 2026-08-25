/**
 * Cambiar la categoría de un movimiento sin abrir su ficha.
 *
 * Va con la lista delante y no con un desplegable: la categoría se reconoce por
 * su dibujo y su color antes que por su nombre, y un desplegable los esconde
 * todos hasta que lo abres. Con un buscador arriba, que treinta categorías no se
 * recorren a ojo.
 *
 * Guarda con `setCategory`, la misma operación que usa el cambio en lote. Es la
 * que toca: reescribe la categoría y nada más, así que la fecha, el importe, las
 * etiquetas y los adjuntos del movimiento ni se enteran.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Modal, Avatar } from './ui'
import { useStore } from '../lib/store'
import { byName } from '@shared/text'
import type { TransactionView } from '@shared/types'

const api = window.bonk

export function CategoriaRapida({
  row,
  onClose
}: {
  row: TransactionView
  onClose: () => void
}): ReactNode {
  const { categories, run } = useStore()
  const [busca, setBusca] = useState('')

  /*
   * Solo las del tipo del movimiento.
   *
   * Ofrecerle «Nómina» a un gasto es ofrecer un error: la categoría de ingreso
   * en un gasto descuadra los informes y no avisa de nada. Una devolución se
   * queda con las de gasto, que es de donde vuelve el dinero.
   */
  const lista = useMemo(() => {
    const tipo = row.type === 'income' ? 'income' : 'expense'
    const texto = busca.trim().toLowerCase()
    return categories
      .filter((item) => item.kind === tipo && !item.archived)
      .filter((item) => !texto || item.name.toLowerCase().includes(texto))
      .sort((a, b) => byName.compare(a.name, b.name))
  }, [categories, row.type, busca])

  const elegir = async (categoryId: number | null): Promise<void> => {
    await run(() => api.transactions.setCategory([row.id], categoryId), 'Categoría actualizada')
    onClose()
  }

  return (
    <Modal
      title="Cambiar categoría"
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
      }
    >
      <input
        className="input"
        style={{ marginBottom: 12 }}
        placeholder="Buscar…"
        value={busca}
        autoFocus
        onChange={(event) => setBusca(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && busca && setBusca("")}
      />

      <div className="categoria-rapida">
        {/* Quitarla también es una respuesta: un movimiento sin categoría es un
            movimiento pendiente de clasificar, no un error. */}
        <button
          type="button"
          className={`categoria-rapida-opcion${row.categoryId == null ? ' puesta' : ''}`}
          onClick={() => elegir(null)}
        >
          <Avatar icon="tag" color="#8E8E93" size="small" />
          <span className="truncate">Sin categoría</span>
        </button>

        {lista.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`categoria-rapida-opcion${row.categoryId === item.id ? ' puesta' : ''}`}
            onClick={() => elegir(item.id)}
          >
            <Avatar icon={item.icon} color={item.color} size="small" />
            <span className="truncate">{item.name}</span>
          </button>
        ))}

        {lista.length === 0 && (
          <p className="small muted" style={{ margin: 0, gridColumn: '1 / -1' }}>
            Ninguna categoría se llama así.
          </p>
        )}
      </div>
    </Modal>
  )
}

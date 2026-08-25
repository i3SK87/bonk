/**
 * Elegir categoría sin abrir ninguna ficha.
 *
 * Va con la lista delante y no con un desplegable: la categoría se reconoce por
 * su dibujo y su color antes que por su nombre, y un desplegable los esconde
 * todos hasta que lo abres. Con un buscador arriba, que treinta categorías no se
 * recorren a ojo.
 *
 * No sabe a qué se le está cambiando la categoría —un movimiento, o todos los de
 * una categoría en un periodo—: solo enseña las que valen y avisa de cuál se ha
 * elegido. Quien lo abre pone el rótulo y decide qué hacer con la respuesta.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Modal, Avatar } from './ui'
import { useStore } from '../lib/store'
import { byName } from '@shared/text'
import type { CategoryKind } from '@shared/types'

export function CategoriaRapida({
  kind,
  puesta,
  contexto,
  onElegir,
  onClose
}: {
  /** Solo salen las de este tipo: ofrecerle «Nómina» a un gasto es ofrecer un error. */
  kind: CategoryKind
  /** La que ya tiene, para marcarla. `null` es «Sin categoría». */
  puesta: number | null
  /** De qué se está hablando; se lee bajo el buscador. */
  contexto?: string
  onElegir: (categoryId: number | null) => void | Promise<void>
  onClose: () => void
}): ReactNode {
  const { categories } = useStore()
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    const texto = busca.trim().toLowerCase()
    return categories
      .filter((item) => item.kind === kind && !item.archived)
      .filter((item) => !texto || item.name.toLowerCase().includes(texto))
      .sort((a, b) => byName.compare(a.name, b.name))
  }, [categories, kind, busca])

  const elegir = async (categoryId: number | null): Promise<void> => {
    await onElegir(categoryId)
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
        placeholder="Buscar…"
        value={busca}
        autoFocus
        onChange={(event) => setBusca(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && busca && setBusca('')}
      />

      {/* Qué se va a mover. En un movimiento suelto sobra, pero moviendo los de
          toda una categoría es la diferencia entre tocar tres y tocar cuarenta. */}
      {contexto && (
        <p className="small muted" style={{ margin: 0 }}>
          {contexto}
        </p>
      )}

      <div className="categoria-rapida">
        {/* Quitarla también es una respuesta: un movimiento sin categoría es un
            movimiento pendiente de clasificar, no un error. */}
        <button
          type="button"
          className={`categoria-rapida-opcion${puesta == null ? ' puesta' : ''}`}
          onClick={() => elegir(null)}
        >
          <Avatar icon="tag" color="#8E8E93" size="small" />
          <span className="truncate">Sin categoría</span>
        </button>

        {lista.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`categoria-rapida-opcion${puesta === item.id ? ' puesta' : ''}`}
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

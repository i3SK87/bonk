import { useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Avatar, Segmented, AccionCabecera } from '../components/ui'
import { CategoryModal } from '../components/CategoryForm'
import type { Category, CategoryKind } from '@shared/types'

const api = window.bonk

export function CategoriesView(): ReactNode {
  const { categories, run } = useStore()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)

  const visible = categories.filter((category) => category.kind === kind)

  return (
    <>
      <div className="card">
        <div className="card-header">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'expense', label: 'Gastos', tone: 'expense' },
              { value: 'income', label: 'Ingresos', tone: 'income' }
            ]}
          />
          <AccionCabecera>
            <button className="btn primary" onClick={() => setCreating(true)}>
              Nueva categoría
            </button>
          </AccionCabecera>
        </div>

        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
          {visible.map((category) => (
            <button
              key={category.id}
              /* El fondo iba en un estilo suelto, y un estilo suelto le gana a
                 cualquier regla: se comía el resaltado al pasar por encima y la
                 fila parecía muerta aunque sí abría. Ahora lo lleva la hoja. */
              className="list-row clickable recuadrada"
              onClick={() => setEditing(category)}
            >
              <Avatar icon={category.icon} color={category.color} size="small" />
              <span className="truncate" style={{ flex: 1 }}>
                {category.name}
              </span>
            </button>
          ))}
        </div>
      </div>


      {(creating || editing) && (
        <CategoryModal
          category={editing}
          defaultKind={kind}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={(input) =>
            run(() => api.categories.save(input), editing ? 'Categoría actualizada' : 'Categoría creada')
          }
          onDelete={
            editing ? () => run(() => api.categories.remove(editing.id), 'Categoría eliminada') : undefined
          }
        />
      )}

    </>
  )
}

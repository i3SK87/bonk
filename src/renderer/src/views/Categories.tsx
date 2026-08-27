import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Avatar, Segmented, AccionCabecera, Confirm } from '../components/ui'
import { MenuContextual } from '../components/MenuContextual'
import { CategoryModal } from '../components/CategoryForm'
import type { Category, CategoryKind } from '@shared/types'

const api = window.bonk

export function CategoriesView(): ReactNode {
  const { categories, run } = useStore()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  /*
   * Borrar sin abrir la ficha.
   *
   * Se podía desde dentro, pero eran tres pasos —abrir, bajar al pie y
   * confirmar— para deshacer una categoría que se creó de más o con una falta.
   * El aviso es el mismo que el del pie, que la acción es la misma.
   */
  const [menu, setMenu] = useState<{ category: Category; x: number; y: number } | null>(null)
  const [borrando, setBorrando] = useState<Category | null>(null)
  const [enUso, setEnUso] = useState(0)

  // Cuántos movimientos se quedarían sin categoría. Igual que en la ficha: sin
  // el recuento el aviso pierde detalle, no utilidad, así que si falla se calla.
  useEffect(() => {
    if (!borrando) return
    setEnUso(0)
    api.categories.countTransactions(borrando.id).then(setEnUso).catch(() => undefined)
  }, [borrando])

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
              className={`list-row clickable recuadrada${
                menu?.category.id === category.id ? ' marcada' : ''
              }`}
              onClick={() => setEditing(category)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ category, x: event.clientX, y: event.clientY })
              }}
            >
              <Avatar icon={category.icon} color={category.color} size="small" />
              <span className="truncate" style={{ flex: 1 }}>
                {category.name}
              </span>
            </button>
          ))}
        </div>
      </div>


      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          opciones={[
            {
              etiqueta: 'Eliminar',
              icono: 'trash',
              peligrosa: true,
              onElegir: () => setBorrando(menu.category)
            }
          ]}
          onCerrar={() => setMenu(null)}
        />
      )}

      {borrando && (
        <Confirm
          title="Eliminar categoría"
          message={
            enUso > 0
              ? `${enUso} movimientos usan «${borrando.name}» y pasarán a figurar como "Sin categoría". Si prefieres conservar el histórico ordenado, archívala desde su ficha.`
              : `«${borrando.name}» se eliminará definitivamente.`
          }
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            await run(() => api.categories.remove(borrando.id), 'Categoría eliminada')
            setBorrando(null)
          }}
        />
      )}

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

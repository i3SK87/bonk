import { useEffect, useState, type ReactNode } from 'react'
import { Icon, CATEGORY_ICONS, PALETTE } from './Icon'
import { Avatar, Modal, Field, IconPicker, ColorPicker, Confirm, Segmented, Checkbox } from './ui'
import type { Category, CategoryKind } from '@shared/types'

const api = window.bonk

/**
 * La ficha de categoría vive aquí y no en su vista porque también se abre
 * desde el formulario de movimientos: crear la categoría que falta no debería
 * obligar a abandonar el gasto a medio escribir.
 */
interface CategoryModalProps {
  category: Category | null
  defaultKind: CategoryKind
  onClose: () => void
  onSave: (input: unknown) => Promise<unknown>
  onDelete?: () => Promise<unknown>
}

export function CategoryModal({ category, defaultKind, onClose, onSave, onDelete }: CategoryModalProps): ReactNode {
  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind)
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const [color, setColor] = useState(category?.color ?? PALETTE[0])
  const [archived, setArchived] = useState(category?.archived ?? false)
  const [breakdownByNote, setBreakdownByNote] = useState(category?.breakdownByNote ?? true)
  const [keepsInvoices, setKeepsInvoices] = useState(category?.keepsInvoices ?? false)
  /*
   * Si lo suyo vuelve solo. No decide nada por sí mismo: al apuntar un
   * movimiento de esta categoría, la casilla de repetirlo sale ya marcada.
   *
   * Ser una deuda a plazos estuvo aquí y se fue a la programación: era lo que
   * obligaba a meter el portátil, el Kindle y un curso en la misma categoría
   * para que salieran en su pestaña.
   */
  const [comportamiento, setComportamiento] = useState<'suelto' | 'repite'>(
    category?.recurring ? 'repite' : 'suelto'
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [linked, setLinked] = useState(0)

  useEffect(() => {
    if (!category) return
    // Igual que en cuentas: sin recuento el aviso pierde detalle, no utilidad.
    api.categories.countTransactions(category.id).then(setLinked).catch(() => undefined)
  }, [category])

  async function save(): Promise<void> {
    if (!name.trim()) return setError('La categoría necesita un nombre')
    const saved = await onSave({
      id: category?.id,
      name: name.trim(),
      kind,
      icon,
      color,
      archived,
      breakdownByNote,
      keepsInvoices,
      recurring: comportamiento === 'repite'
    })
    if (saved) onClose()
  }

  return (
    <>
      <Modal
        title={category ? 'Editar categoría' : 'Nueva categoría'}
        onClose={onClose}
        footer={
          <>
            {category && (
              <button className="btn ghost danger spacer" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={16} />
                Eliminar
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" onClick={save}>
              Guardar
            </button>
          </>
        }
      >
        {/* El icono, a ras del campo y no del rótulo. */}
        {/* El avatar, a la derecha: delante empujaba el rótulo del título 50 px
            hacia dentro y era el único que no arrancaba donde los demás. */}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Field label="Título" required error={error}>
              <input
                className="input"
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </div>
          <Avatar icon={icon} color={color} size="large" />
        </div>

        <Field label="Tipo">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'expense', label: 'Gasto', tone: 'expense' },
              { value: 'income', label: 'Ingreso', tone: 'income' }
            ]}
          />
        </Field>

        {/* Debajo del tipo, que las dos botoneras dicen qué clase de categoría es
            esto: la de arriba si entra o sale, y esta si vuelve. */}
        <Field>
          <Segmented
            value={comportamiento}
            onChange={setComportamiento}
            options={[
              { value: 'suelto', label: 'No se repite' },
              { value: 'repite', label: 'Se repite' }
            ]}
          />
        </Field>

        <Field label="Icono">
          <IconPicker value={icon} options={CATEGORY_ICONS} onChange={setIcon} />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        {/* A la par: son respuestas de sí o no, y en columna estiraban la ficha. */}
        <div className="casillas">
          <Checkbox
            checked={keepsInvoices}
            onChange={setKeepsInvoices}
            label="Adjuntar facturas"
          />

          <Checkbox
            checked={breakdownByNote}
            onChange={setBreakdownByNote}
            label="Desglose en la pestaña Informes"
          />

          {category && (
            <Checkbox
              checked={archived}
              onChange={setArchived}
              label="Archivar la categoría"
              hint="No sale al crear movimientos; el histórico se conserva."
            />
          )}
        </div>
      </Modal>

      {confirmDelete && (
        <Confirm
          title="Eliminar categoría"
          message={
            linked > 0
              ? `${linked} movimientos usan esta categoría y pasarán a figurar como "Sin categoría". Si prefieres conservar el histórico ordenado, archívala.`
              : 'La categoría se eliminará definitivamente.'
          }
          confirmLabel="Eliminar"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await onDelete?.()
            setConfirmDelete(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { Icon, ALL_ICONS, PALETTE } from './Icon'
import {
  Avatar,
  Modal,
  Field,
  IconPicker,
  ColorPicker,
  Confirm,
  Segmented,
  Checkbox
} from './ui'
import { useStore } from '../lib/store'
import { formatMoney } from '@shared/money'
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
  const { accounts, settings } = useStore()
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind)
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const [color, setColor] = useState(category?.color ?? PALETTE[0])
  const [archived, setArchived] = useState(category?.archived ?? false)
  const [breakdownByNote, setBreakdownByNote] = useState(category?.breakdownByNote ?? true)
  const [keepsInvoices, setKeepsInvoices] = useState(category?.keepsInvoices ?? false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [linked, setLinked] = useState(0)

  useEffect(() => {
    if (!category) return
    // Igual que en cuentas: sin recuento el aviso pierde detalle, no utilidad.
    api.categories.countTransactions(category.id).then(setLinked).catch(() => undefined)
  }, [category])

  async function save(): Promise<void> {
    if (!name.trim()) return setError('La categoría necesita un título')
    const saved = await onSave({
      id: category?.id,
      name: name.trim(),
      kind,
      icon,
      color,
      archived,
      breakdownByNote,
      keepsInvoices,
      // La regla de ahorro viaja intacta: se cambia en Planes Ahorro, y no
      // mandarla aquí la borraría cada vez que se toca el nombre o el icono.
      savePercent: category?.savePercent ?? null,
      saveAmount: category?.saveAmount ?? null,
      saveAccountId: category?.saveAccountId ?? null,
      saveGoalId: category?.saveGoalId ?? null
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

        <Field label="Icono">
          <IconPicker value={icon} options={ALL_ICONS} onChange={setIcon} />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        {/* Cada casilla con su renglón de ayuda, como las de las demás fichas:
            dicen qué cambia en otra pantalla —el formulario de movimientos, la
            pestaña Informes— y desde aquí no se ve. Eran las dos únicas de la
            aplicación que iban a secas, y a secas cabían a la par: quedaban de
            adorno al pie de la ficha, sin el aire de las de al lado. */}
        <div className="casillas">
          <Checkbox
            checked={keepsInvoices}
            onChange={setKeepsInvoices}
            label="Adjuntar facturas"
            hint="Sus movimientos llevan un campo para guardar el recibo."
          />

          <Checkbox
            checked={breakdownByNote}
            onChange={setBreakdownByNote}
            label="Desglose en la pestaña Informes"
            hint="La categoría se abre por la nota de cada movimiento."
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

        {/*
          La regla de ahorro se mira y se cambia en Planes Ahorro, no aquí.
          Aquí solo se dice que existe: una categoría que aparta dinero sin
          decirlo en ninguna parte es una sorpresa esperando a pasar, y basta
          una línea para que no lo sea. Ficha de categoría es «cómo llamo yo a
          esto»; lo que se hace con el dinero se decide en su pantalla.
        */}
        {kind === 'income' && category?.saveAccountId != null && (
          <p className="small muted" style={{ margin: 0 }}>
            Aparta{' '}
            {category.saveAmount != null
              ? formatMoney(category.saveAmount, settings.baseCurrency)
              : `el ${category.savePercent} %`}{' '}
            de lo que entre por aquí, y lo traspasa a{' '}
            {accounts.find((item) => item.id === category.saveAccountId)?.name ?? 'tu hucha'}.
            Se cambia en Planes Ahorro.
          </p>
        )}
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

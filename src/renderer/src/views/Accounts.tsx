import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon, ACCOUNT_ICONS } from '../components/Icon'
import { Avatar, Modal, Field, Checkbox, IconPicker, ColorPicker, AmountInput, Confirm, EmptyState, AccionCabecera } from '../components/ui'
import { formatMoney } from '@shared/money'
import type { Account, AccountType, AccountWithBalance } from '@shared/types'

const api = window.bonk

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string; icon: string }> = [
  { value: 'cash', label: 'Efectivo', icon: 'wallet' },
  { value: 'bank', label: 'Cuenta bancaria', icon: 'bank' },
  { value: 'card', label: 'Tarjeta', icon: 'card' },
  { value: 'savings', label: 'Ahorro', icon: 'piggy' },
  { value: 'investment', label: 'Inversión', icon: 'invest' },
  { value: 'debt', label: 'Deuda o préstamo', icon: 'debt' }
]

export function AccountsView(): ReactNode {
  const { accounts, settings, run, fail } = useStore()
  const [editing, setEditing] = useState<AccountWithBalance | null>(null)
  const [creating, setCreating] = useState(false)
  const [archived, setArchived] = useState<AccountWithBalance[]>([])
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!showArchived) return
    api.accounts
      .withBalance(true)
      .then((list) => setArchived(list.filter((account) => account.archived)))
      .catch(fail('las cuentas archivadas'))
  }, [showArchived, accounts])

  const total = accounts
    .filter((account) => !account.excludeFromTotal)
    .reduce((sum, account) => sum + account.balanceInBase, 0)
  const excluded = accounts.filter((account) => account.excludeFromTotal)

  // Solo los tipos que tengas: una lista con seis epígrafes y dos cuentas no
  // ordena nada, solo hace scroll.
  const porTipo = ACCOUNT_TYPES.map((tipo) => ({
    tipo,
    cuentas: accounts.filter((account) => account.type === tipo.value)
  })).filter((grupo) => grupo.cuentas.length > 0)

  return (
    <>
      {/* Sin rayas entre filas, como el resto de la aplicación: el avatar y el
          aire ya separan, y la retícula pesaba más que los datos. */}
      <div className="card flush">
        <AccionCabecera>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Nueva cuenta
          </button>
        </AccionCabecera>

        {accounts.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="Todavía no hay cuentas"
            message="Crea una cuenta para empezar a registrar movimientos."
          />
        ) : (
          <div>
            {/* Agrupadas por tipo: es como se piensan —lo del banco, lo ahorrado,
                lo que se debe— y así la principal de cada uno se ve en su sitio. */}
            {porTipo.map(({ tipo, cuentas }) => (
              <div key={tipo.value}>
                <div className="grupo-cuentas">{tipo.label}</div>
                {cuentas.map((account) => (
              <button key={account.id} type="button" className="list-row clickable" onClick={() => setEditing(account)}>
                <Avatar icon={account.icon} color={account.color} size="large" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row tight" style={{ fontWeight: 600 }}>
                    {account.name}
                    {account.isPrimary && (
                      <span className="pill" title="Sale marcada por defecto en los formularios">
                        <Icon name="check" size={11} strokeWidth={2.6} />
                        Principal
                      </span>
                    )}
                  </div>
                  <div className="small muted">
                    {ACCOUNT_TYPES.find((item) => item.value === account.type)?.label ?? account.type}
                    {account.excludeFromTotal && ' · Fuera del total'}
                    {account.note ? ` · ${account.note}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`amount ${account.balance >= 0 ? '' : 'negative'}`} style={{ fontSize: 16 }}>
                    {formatMoney(account.balance, account.currency)}
                  </div>
                  {account.currency !== settings.baseCurrency && (
                    <div className="small subtle">≈ {formatMoney(account.balanceInBase, settings.baseCurrency)}</div>
                  )}
                </div>
              </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div
          className="card-body networth-strip"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div className="networth suelto">
            <div className="label">Patrimonio total</div>
            <div className={`value amount ${total > 0 ? 'positive' : total < 0 ? 'negative' : 'neutral'}`}>
              {formatMoney(total, settings.baseCurrency)}
            </div>
          </div>
          {excluded.length > 0 && (
            <div className="small subtle" style={{ maxWidth: 300, alignSelf: 'center' }}>
              {excluded.length === 1 ? 'Hay 1 cuenta excluida' : `Hay ${excluded.length} cuentas excluidas`} del
              total.
            </div>
          )}
          <div className="spacer" />
          <button className="link small" onClick={() => setShowArchived((value) => !value)}>
            {showArchived ? 'Ocultar archivadas' : 'Ver cuentas archivadas'}
          </button>
        </div>
      </div>

      {showArchived && (
        <div className="card flush">
          <div className="card-header">
            <h3>Archivadas</h3>
          </div>
          {archived.length === 0 ? (
            <div className="card-body small muted">No hay cuentas archivadas.</div>
          ) : (
            archived.map((account) => (
              <button key={account.id} type="button" className="list-row clickable" onClick={() => setEditing(account)}>
                <Avatar icon={account.icon} color={account.color} size="small" />
                <div style={{ flex: 1 }}>{account.name}</div>
                <div className="amount muted">{formatMoney(account.balance, account.currency)}</div>
              </button>
            ))
          )}
        </div>
      )}

      {(creating || editing) && (
        <AccountModal
          account={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={(input) =>
            run(() => api.accounts.save(input), editing ? 'Cuenta actualizada' : 'Cuenta creada')
          }
          onDelete={editing ? () => run(() => api.accounts.remove(editing.id), 'Cuenta eliminada') : undefined}
        />
      )}
    </>
  )
}

interface AccountModalProps {
  account: AccountWithBalance | null
  onClose: () => void
  onSave: (input: unknown) => Promise<Account | null>
  onDelete?: () => Promise<unknown>
}

function AccountModal({ account, onClose, onSave, onDelete }: AccountModalProps): ReactNode {
  const { settings, run } = useStore()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  // Sin selector: una cuenta nueva nace en la divisa de la aplicación.
  const currency = account?.currency ?? settings.baseCurrency

  /**
   * Lo que han movido las transacciones. Se edita el saldo de ahora, que es el
   * que uno conoce, y de ahí se deduce el de partida: pedir el saldo "antes del
   * primer movimiento" obligaba a hacer la resta a mano.
   */
  const movements = account ? account.balance - account.initialBalance : 0
  const [balance, setBalance] = useState(account?.balance ?? 0)
  const [icon, setIcon] = useState(account?.icon ?? 'bank')
  const [color, setColor] = useState(account?.color ?? '#0A84FF')
  const [excludeFromTotal, setExclude] = useState(account?.excludeFromTotal ?? false)
  const [lowBalance, setLowBalance] = useState(account?.lowBalanceThreshold ?? 0)
  const [archived, setArchived] = useState(account?.archived ?? false)
  // La nota ya no se edita —el título dice lo que hay que decir—, pero la que
  // tuviera una cuenta de antes viaja intacta al guardar en vez de borrarse sola.
  const note = account?.note ?? ''
  const [allowNegative, setAllowNegative] = useState(
    account ? account.allowNegative : type !== 'cash' && type !== 'savings'
  )
  const [isPrimary, setIsPrimary] = useState(account?.isPrimary ?? false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [linked, setLinked] = useState(0)

  useEffect(() => {
    if (!account) return
    // Si no se puede contar, el aviso de borrado sale sin la cifra, pero sale.
    api.accounts.countTransactions(account.id).then(setLinked).catch(() => undefined)
  }, [account])

  async function save(): Promise<void> {
    if (!name.trim()) return setError('La cuenta necesita un título')
    const saved = await onSave({
      id: account?.id,
      name: name.trim(),
      type,
      currency,
      // Se guarda el punto de partida que hace que el saldo acabe donde toca.
      initialBalance: balance - movements,
      icon,
      color,
      excludeFromTotal,
      allowNegative,
      lowBalanceThreshold: lowBalance,
      archived,
      note: note.trim() || null
    })
    if (!saved) return

    // La principal es una por tipo: marcarla aquí desmarca la que hubiera.
    if (isPrimary !== (account?.isPrimary ?? false) || (isPrimary && !archived)) {
      await run(() => api.accounts.setPrimary(saved.id, isPrimary && !archived))
    }
    onClose()
  }

  return (
    <>
      <Modal
        title={account ? 'Editar cuenta' : 'Nueva cuenta'}
        onClose={onClose}
        footer={
          <>
            {account && (
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
        {/* El icono, a ras del campo y no del rótulo: alineados por abajo, los dos
            cuadrados —el del avatar y el del campo— comparten canto. */}
        {/* El avatar, a la derecha: delante empujaba el rótulo del título 50 px
            hacia dentro y era el único que no arrancaba donde los demás. */}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Field label="Título" required error={error}>
              <input
                className="input"
                value={name}
                autoFocus
                placeholder="Cuenta corriente, Efectivo…"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </div>
          <Avatar icon={icon} color={color} size="large" />
        </div>

        {/* Cuánto hay, a lo ancho: es la cifra del formulario y la que se teclea.
            El signo se escribe, sin casilla que lo diga aparte: una tarjeta de
            crédito está en −250, y así es como se teclea. */}
        <Field
          label={account ? 'Saldo actual' : 'Saldo inicial'}
          hint={
            account && movements !== 0
              ? `Sus movimientos suman ${formatMoney(movements, currency, { sign: true })}.`
              : undefined
          }
        >
          <AmountInput value={balance} currency={currency} onChange={setBalance} signed />
        </Field>

        {/* Y debajo, a la par, los dos cortos. La ayuda del aviso cabe en un renglón
            a este ancho: con la larga estiraba la fila y dejaba un hueco al lado. */}
        <div className="grid cols-2">
          <Field label="Tipo">
            <select
              className="select"
              value={type}
              onChange={(event) => {
                const next = event.target.value as AccountType
                setType(next)
                const preset = ACCOUNT_TYPES.find((item) => item.value === next)
                if (preset && !account) {
                  setIcon(preset.icon)
                  // Efectivo y ahorro nacen con el candado; tarjeta y deuda, sin él.
                  setAllowNegative(next !== 'cash' && next !== 'savings')
                }
              }}
            >
              {ACCOUNT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Avisarme si baja de" hint="En cero no avisa nunca.">
            <AmountInput value={lowBalance} currency={currency} onChange={setLowBalance} compact />
          </Field>
        </div>

        <Field label="Icono">
          <IconPicker value={icon} options={ACCOUNT_ICONS} onChange={setIcon} />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>


        {/* A la par: son respuestas de sí o no, y en columna estiraban la ficha. */}
        <div className="casillas">
          {/* Una principal por tipo: la del banco es la que viene marcada al
              registrar un movimiento y la de ahorro la que abre Planes Ahorro. */}
          <Checkbox
            checked={isPrimary && !archived}
            onChange={setIsPrimary}
            label={`Usar como ${(ACCOUNT_TYPES.find((item) => item.value === type)?.label ?? 'cuenta').toLowerCase()} principal`}
            hint={
              archived
                ? 'Archivada no puede ser la principal.'
                : 'La que se propone por defecto. Solo una por tipo.'
            }
          />

          <Checkbox
            checked={excludeFromTotal}
            onChange={setExclude}
            label="Excluir del patrimonio total"
            hint="Dinero de terceros, o que no cuentas como tuyo."
          />

          {account && (
            <Checkbox
              checked={archived}
              onChange={setArchived}
              label="Archivar la cuenta"
              hint="No sale en los desplegables; conserva su histórico."
            />
          )}
        </div>
      </Modal>

      {confirmDelete && account && (
        <Confirm
          title="Eliminar cuenta"
          message={
            linked > 0
              ? `Esta cuenta tiene ${linked} movimientos y se eliminarán con ella. Los traspasos con otras cuentas se conservan como gasto o ingreso en la cuenta que sobrevive, para que su saldo no cambie. Si solo quieres dejar de verla, archívala en vez de borrarla.`
              : 'La cuenta se eliminará definitivamente.'
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

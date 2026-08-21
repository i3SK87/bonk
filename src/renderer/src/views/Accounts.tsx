import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon, ACCOUNT_ICONS } from '../components/Icon'
import { Avatar, Modal, Field, Checkbox, IconPicker, ColorPicker, AmountInput, Confirm, EmptyState } from '../components/ui'
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

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Tus cuentas</h2>
          <button className="btn primary small" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Nueva cuenta
          </button>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="Todavía no hay cuentas"
            message="Crea una cuenta para empezar a registrar movimientos."
          />
        ) : (
          <div>
            {accounts.map((account) => (
              <button key={account.id} type="button" className="list-row clickable" onClick={() => setEditing(account)}>
                <Avatar icon={account.icon} color={account.color} size="large" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row tight" style={{ fontWeight: 600 }}>
                    {account.name}
                    {settings.defaultAccountId === account.id && (
                      <span className="pill" title="Sale marcada por defecto en los formularios">
                        <Icon name="check" size={11} strokeWidth={2.6} />
                        Principal
                      </span>
                    )}
                  </div>
                  <div className="small muted">
                    {ACCOUNT_TYPES.find((item) => item.value === account.type)?.label ?? account.type}
                    {account.excludeFromTotal && ' · fuera del total'}
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
                <Icon name="chevronRight" size={16} className="muted" />
              </button>
            ))}
          </div>
        )}

        <div className="card-body row" style={{ borderTop: '1px solid var(--border)' }}>
          <div>
            <div className="small muted">Patrimonio total</div>
            <div className="amount" style={{ fontSize: 22, fontWeight: 700 }}>
              {formatMoney(total, settings.baseCurrency)}
            </div>
          </div>
          {excluded.length > 0 && (
            <div className="small subtle" style={{ maxWidth: 300 }}>
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
        <div className="card">
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
  const { settings, updateSettings } = useStore()
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
  const [negative, setNegative] = useState((account?.balance ?? 0) < 0)
  const [icon, setIcon] = useState(account?.icon ?? 'bank')
  const [color, setColor] = useState(account?.color ?? '#0A84FF')
  const [excludeFromTotal, setExclude] = useState(account?.excludeFromTotal ?? false)
  const [lowBalance, setLowBalance] = useState(account?.lowBalanceThreshold ?? 0)
  const [archived, setArchived] = useState(account?.archived ?? false)
  const [note, setNote] = useState(account?.note ?? '')
  const [allowNegative, setAllowNegative] = useState(
    account ? account.allowNegative : type !== 'cash' && type !== 'savings'
  )
  const [isDefault, setIsDefault] = useState(account ? settings.defaultAccountId === account.id : false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [linked, setLinked] = useState(0)

  useEffect(() => {
    if (!account) return
    // Si no se puede contar, el aviso de borrado sale sin la cifra, pero sale.
    api.accounts.countTransactions(account.id).then(setLinked).catch(() => undefined)
  }, [account])

  async function save(): Promise<void> {
    if (!name.trim()) return setError('La cuenta necesita un nombre')
    const target = negative ? -Math.abs(balance) : Math.abs(balance)
    const saved = await onSave({
      id: account?.id,
      name: name.trim(),
      type,
      currency,
      // Se guarda el punto de partida que hace que el saldo acabe donde toca.
      initialBalance: target - movements,
      icon,
      color,
      excludeFromTotal,
      allowNegative,
      lowBalanceThreshold: lowBalance,
      archived,
      note: note.trim() || null
    })
    if (!saved) return

    // La cuenta principal es única: marcarla aquí desmarca la anterior.
    if (isDefault && !archived && settings.defaultAccountId !== saved.id) {
      await updateSettings({ defaultAccountId: saved.id })
    } else if (!isDefault && settings.defaultAccountId === saved.id) {
      await updateSettings({ defaultAccountId: null })
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
        <div className="row">
          <Avatar icon={icon} color={color} size="large" />
          <div style={{ flex: 1 }}>
            <Field label="Nombre" error={error}>
              <input
                className="input"
                value={name}
                autoFocus
                placeholder="Cuenta corriente, Efectivo…"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </div>
        </div>

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

        </div>

        <Field
          label={account ? 'Saldo actual' : 'Saldo inicial'}
          hint={
            account && movements !== 0
              ? `Lo que tiene la cuenta ahora mismo. Sus movimientos suman ${formatMoney(movements, currency, { sign: true })}, así que al cambiarlo se ajusta solo el saldo de partida.`
              : 'El saldo que tiene la cuenta antes de empezar a registrar movimientos.'
          }
        >
          <AmountInput value={Math.abs(balance)} currency={currency} onChange={setBalance} />
          <Checkbox
            checked={negative}
            onChange={setNegative}
            label="Es un saldo negativo"
            hint="Para tarjetas de crédito o préstamos pendientes."
          />
        </Field>

        <Field label="Icono">
          <IconPicker value={icon} options={ACCOUNT_ICONS} onChange={setIcon} />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        <Field label="Nota">
          <input
            className="input"
            value={note}
            placeholder="Número parcial, banco, titular…"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <Field
          label="Avisarme si baja de"
          hint="Notificación de Windows y un aviso en Movimientos, mientras dure. Se vuelve a armar solo cuando el saldo remonta. En cero no avisa nunca."
        >
          <div style={{ maxWidth: 200 }}>
            <AmountInput value={lowBalance} currency={currency} onChange={setLowBalance} compact />
          </div>
        </Field>

        <Checkbox
          checked={isDefault && !archived}
          onChange={setIsDefault}
          label="Usar como cuenta principal"
          hint={
            archived
              ? 'Una cuenta archivada no puede ser la principal.'
              : 'Vendrá elegida por defecto al crear movimientos y programaciones. Solo puede haber una.'
          }
        />

        <Checkbox
          checked={!allowNegative}
          onChange={(value) => setAllowNegative(!value)}
          label="No dejar que el saldo baje de cero"
          hint="De una hucha o de la cartera no se puede sacar más de lo que hay. Quítalo en tarjetas de crédito y deudas, que viven en negativo."
        />

        <Checkbox
          checked={excludeFromTotal}
          onChange={setExclude}
          label="Excluir del patrimonio total"
          hint="Útil para cuentas de terceros o dinero que no consideras tuyo."
        />

        {account && (
          <Checkbox
            checked={archived}
            onChange={setArchived}
            label="Archivar la cuenta"
            hint="Desaparece de los desplegables pero conserva su histórico."
          />
        )}
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

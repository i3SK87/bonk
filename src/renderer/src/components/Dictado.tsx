/**
 * Dictar una orden.
 *
 * Lo que se dice no ejecuta nada: abre el formulario de siempre con lo que se
 * ha entendido puesto, y lo que no se entendió se queda en blanco. Guardar lo
 * pulsas tú, como cualquier otro movimiento.
 *
 * La caja de texto no es un adorno ni un apaño: la misma gramática sirve
 * escribiendo, va más rápido que hablar cuando ya se sabe la fórmula, y deja el
 * dictado utilizable si el micrófono o el modelo fallan.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { Modal } from './ui'
import { useStore } from '../lib/store'
import { entender, type OrdenVoz } from '@shared/voz'
import { today } from '@shared/dates'
import { Grabadora, escuchaLista, prepararEscucha, transcribir, type EstadoEscucha } from '../lib/escucha'

interface Props {
  onClose: () => void
  onEntendido: (orden: OrdenVoz) => void
}

export function Dictado({ onClose, onEntendido }: Props): ReactNode {
  const { accounts, categories } = useStore()
  const [estado, setEstado] = useState<EstadoEscucha>('dormido')
  const [progreso, setProgreso] = useState(0)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const grabadora = useRef<Grabadora | null>(null)

  // Soltar el micrófono si el diálogo se cierra a media grabación.
  useEffect(() => () => grabadora.current?.abortar(), [])

  const catalogo = {
    cuentas: accounts.map((cuenta) => ({ id: cuenta.id, name: cuenta.name })),
    categorias: categories.map((categoria) => ({
      id: categoria.id,
      name: categoria.name,
      kind: categoria.kind
    }))
  }

  function aceptar(frase: string): void {
    const limpia = frase.trim()
    if (!limpia) return
    onEntendido(entender(limpia, catalogo, today()))
    onClose()
  }

  async function empezar(): Promise<void> {
    setError(null)
    try {
      // Cargar el modelo antes de grabar: si se hace después, el silencio entre
      // soltar el botón y ver la frase serían noventa segundos sin explicación.
      if (!escuchaLista()) {
        setEstado('preparando')
        await prepararEscucha(setProgreso)
      }
      grabadora.current = new Grabadora()
      await grabadora.current.empezar()
      setEstado('grabando')
    } catch (fallo) {
      setEstado('dormido')
      setError(
        (fallo as Error)?.message?.includes('Permission')
          ? 'Windows no deja usar el micrófono. Mira Configuración ▸ Privacidad ▸ Micrófono.'
          : `No se ha podido preparar el dictado: ${(fallo as Error)?.message ?? 'fallo desconocido'}`
      )
    }
  }

  async function terminar(): Promise<void> {
    if (estado !== 'grabando') return
    setEstado('pensando')
    try {
      const muestras = await grabadora.current?.parar()
      grabadora.current = null
      if (!muestras) {
        setEstado('dormido')
        setError('No he oído nada. Mantén pulsado mientras hablas.')
        return
      }
      const frase = await transcribir(muestras)
      setEstado('dormido')
      if (!frase) {
        setError('No he entendido nada. Prueba otra vez, más cerca del micro.')
        return
      }
      // La frase se enseña antes de aplicarla: si Whisper ha oído «Lucha» donde
      // dijiste «Hucha», se ve aquí y se corrige escribiendo.
      setTexto(frase)
    } catch (fallo) {
      setEstado('dormido')
      setError(`No se ha podido transcribir: ${(fallo as Error)?.message ?? 'fallo desconocido'}`)
    }
  }

  const previa = texto.trim() ? entender(texto, catalogo, today()) : null
  const nombreCuenta = (id?: number): string =>
    accounts.find((cuenta) => cuenta.id === id)?.name ?? '—'

  return (
    <Modal
      title="Dictar un movimiento"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!texto.trim()} onClick={() => aceptar(texto)}>
            Abrir el formulario
          </button>
        </>
      }
    >
      <div className="dictado">
        <button
          className={`microfono${estado === 'grabando' ? ' escuchando' : ''}`}
          disabled={estado === 'preparando' || estado === 'pensando'}
          onPointerDown={empezar}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          title="Mantén pulsado mientras hablas"
        >
          <Icon name="microfono" size={26} strokeWidth={1.8} />
        </button>

        <div className="small muted" style={{ textAlign: 'center', minHeight: 34 }}>
          {estado === 'preparando'
            ? `Preparando el dictado… ${progreso}%. La primera vez se descarga; luego funciona sin conexión.`
            : estado === 'grabando'
              ? 'Te escucho. Suelta cuando termines.'
              : estado === 'pensando'
                ? 'Entendiendo lo que has dicho…'
                : 'Mantén pulsado y habla. O escríbelo aquí abajo.'}
        </div>
      </div>

      <input
        className="input"
        value={texto}
        autoFocus
        placeholder="Traspasa 200 euros de CaixaBank a Hucha"
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') aceptar(texto)
        }}
      />

      {error && <div className="field-error">{error}</div>}

      {/* Lo entendido, antes de abrir nada: es la única forma de ver que ha
          cogido la cuenta buena sin tener que abrir el formulario y mirarlo. */}
      {previa && (
        <div className="entendido">
          <div className="row tight">
            <span className="pill">
              {previa.tipo === 'transfer'
                ? 'Traspaso'
                : previa.tipo === 'income'
                  ? 'Ingreso'
                  : previa.tipo === 'refund'
                    ? 'Reembolso'
                    : 'Gasto'}
            </span>
            {previa.repeticion === 'deuda' && <span className="pill">Deuda a plazos</span>}
            {previa.repeticion === 'repite' && <span className="pill">Se repite</span>}
          </div>
          <div className="small">
            {previa.importe != null
              ? `${(previa.importe / 100).toFixed(2).replace('.', ',')} €`
              : 'Sin importe'}
            {previa.tipo === 'transfer'
              ? ` · ${nombreCuenta(previa.cuentaId)} → ${nombreCuenta(previa.cuentaDestinoId)}`
              : previa.cuentaId != null
                ? ` · ${nombreCuenta(previa.cuentaId)}`
                : ''}
            {previa.categoriaId != null
              ? ` · ${categories.find((c) => c.id === previa.categoriaId)?.name}`
              : ''}
            {previa.titulo ? ` · «${previa.titulo}»` : ''}
          </div>
          {previa.falta.length > 0 && (
            <div className="small subtle">Falta por decir: {previa.falta.join(', ')}.</div>
          )}
        </div>
      )}
    </Modal>
  )
}

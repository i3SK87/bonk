/**
 * El asistente de importación de CSV.
 *
 * Vive aquí y no dentro de Ajustes porque también se abre desde Movimientos:
 * importar un extracto es algo que se hace mirando la lista, no repasando la
 * configuración, y tener dos copias del mismo asistente sería tener dos que se
 * van separando con cada retoque.
 */
import { useState, type ReactNode } from 'react'
import { Modal, Checkbox } from './ui'
import { useStore } from '../lib/store'

const api = window.bonk

/** Lo que devuelve el diálogo de archivo: la ruta y una muestra de sus filas. */
export interface OrigenCsv {
  path: string
  preview: { headers: string[]; rows: string[][]; total: number }
}

export function ImportModal({
  source,
  onClose,
  onDone
}: {
  source: OrigenCsv
  onClose: () => void
  /** Importado y cerrado: quien lo abrió recarga lo que tenga en pantalla. */
  onDone: () => void
}): ReactNode {
  const { toast } = useStore()
  const [createMissing, setCreateMissing] = useState(true)
  // Apagado: reimportar el extracto del mes no debería duplicarlo entero.
  const [allowDuplicates, setAllowDuplicates] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    duplicates: number
    createdAccounts: string[]
    createdCategories: string[]
    errors: string[]
  } | null>(null)

  async function start(): Promise<void> {
    setImporting(true)
    try {
      setResult(await api.csv.importFile(source.path, { createMissing, allowDuplicates }))
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      title="Importar movimientos"
      wide
      onClose={result ? onDone : onClose}
      footer={
        result ? (
          <button className="btn primary" onClick={onDone}>
            Listo
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" onClick={start} disabled={importing}>
              {importing ? 'Importando…' : `Importar ${source.preview.total} filas`}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="col">
          <p>
            <strong>{result.imported}</strong> movimientos importados
            {result.skipped > 0 && `, ${result.skipped} descartados`}.
          </p>
          {result.duplicates > 0 && (
            <p className="small muted">
              {result.duplicates === 1
                ? 'Una fila ya estaba apuntada y no se ha repetido.'
                : `${result.duplicates} filas ya estaban apuntadas y no se han repetido.`}
            </p>
          )}
          {result.createdAccounts.length > 0 && (
            <p className="small muted">Cuentas creadas: {result.createdAccounts.join(', ')}</p>
          )}
          {result.createdCategories.length > 0 && (
            <p className="small muted">Categorías creadas: {result.createdCategories.join(', ')}</p>
          )}
          {result.errors.length > 0 && (
            <div>
              <div className="small" style={{ marginBottom: 4 }}>
                Filas con problemas:
              </div>
              <div className="small muted col" style={{ gap: 2, maxHeight: 160, overflowY: 'auto' }}>
                {result.errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="small muted">
            Se han detectado <strong>{source.preview.total}</strong> filas. Reconocemos columnas llamadas Fecha,
            Tipo, Cuenta, Categoría, Importe, Notas y Lugar, tanto en español como en inglés, y también las
            cabeceras que usa la aplicación de Apple.
          </p>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <table className="table">
              <thead>
                <tr>
                  {source.preview.headers.map((header, index) => (
                    <th key={`${header}-${index}`}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {source.preview.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="casillas">
            <Checkbox
              checked={createMissing}
              onChange={setCreateMissing}
              label="Crear cuentas y categorías que no existan"
              hint="Desactivado, esas filas se descartan."
            />
            <Checkbox
              checked={allowDuplicates}
              onChange={setAllowDuplicates}
              label="Importar lo que ya esté apuntado"
              hint="Normalmente no: reimportar un extracto duplicaría el mes."
            />
          </div>
        </>
      )}
    </Modal>
  )
}

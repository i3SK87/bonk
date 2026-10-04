import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon } from '../components/Icon'
import { Loading, EmptyState, Avatar, ProgressBar, AccionCabecera } from '../components/ui'
import { MenuContextual, type OpcionMenu } from '../components/MenuContextual'
import { PresupuestoRapido } from '../components/PresupuestoRapido'
import { NuevoPresupuesto } from '../components/NuevoPresupuesto'
import { Cambio } from './Reports'
import { formatMoney } from '@shared/money'
import { addMonths, formatMonth, startOfMonth, today } from '@shared/dates'
import { AVISO_CERCA } from '@shared/presupuestos'
import type { Category, EstadoPresupuesto } from '@shared/types'

const api = window.bonk

/**
 * Los presupuestos de un mes, cada uno con lo que llevas gastado.
 *
 * Pantalla propia y no tarjeta de Informes: Informes se mira de una cuenta cada
 * vez, y un presupuesto cuenta lo gastado en todas. Dentro de un informe de una
 * cuenta enseñaba cifras que no eran de esa cuenta.
 *
 * Arranca en el mes en curso y se puede ir hacia atrás a ver cómo cerraron los
 * anteriores. Hacia delante no pasa del de ahora: en un mes que no ha empezado
 * no hay nada gastado que contar.
 */
export function BudgetsView(): ReactNode {
  const { settings, categories: catalogo, revision, run, fail } = useStore()
  const hoy = startOfMonth(today())
  const [mes, setMes] = useState(hoy)
  const [presupuestos, setPresupuestos] = useState<EstadoPresupuesto[]>([])
  // Solo la primera vez: al cambiar de mes se quedan los de antes hasta que llegan los nuevos.
  const [cargado, setCargado] = useState(false)
  /** La categoría a la que se le está poniendo presupuesto. */
  const [poniendoPresupuesto, setPoniendoPresupuesto] = useState<Category | null>(null)
  /** Si está abierto el cuadro de estrenar un presupuesto en una categoría sin él. */
  const [nuevoPresupuesto, setNuevoPresupuesto] = useState(false)
  /** El menú del botón derecho sobre una tarjeta de presupuesto. */
  const [menuPresupuesto, setMenuPresupuesto] = useState<{ categoria: Category; x: number; y: number } | null>(
    null
  )

  useEffect(() => {
    api.categories
      .presupuestos(mes.slice(0, 7))
      .then(setPresupuestos)
      .catch(fail('los presupuestos'))
      .finally(() => setCargado(true))
  }, [mes, revision])

  const currency = settings.baseCurrency
  /*
   * Lo rojo late solo mientras el mes siga abierto: en uno cerrado es un parte
   * de lo que pasó, y no hay nada que hacer con él.
   */
  const enCurso = mes === hoy

  /** La ficha de la categoría de un presupuesto, que es lo que se guarda y se edita. */
  const categoriaDelPresupuesto = (categoryId: number): Category | undefined =>
    catalogo.find((item) => item.id === categoryId)

  /*
   * Quitar el presupuesto es guardar la categoría sin él.
   *
   * No borra nada más: la categoría se queda con su nombre, su color y sus
   * movimientos, y lo único que se va es la raya. De ahí que se llame «quitar
   * el presupuesto» y no «eliminar», que al lado de una categoría suena a otra cosa
   * bastante peor.
   */
  const quitarPresupuesto = async (categoria: Category): Promise<void> => {
    await run(() => api.categories.save({ ...categoria, spendLimit: null }), 'Presupuesto quitado')
  }

  const abrir = (categoryId: number): void => {
    const categoria = categoriaDelPresupuesto(categoryId)
    if (categoria) setPoniendoPresupuesto(categoria)
  }

  return (
    <>
      <AccionCabecera>
        <button className="btn primary" onClick={() => setNuevoPresupuesto(true)}>
          Nuevo presupuesto
        </button>
      </AccionCabecera>

      <div className="card">
        <div className="card-header">
          <button className="btn icon" onClick={() => setMes(addMonths(mes, -1))} aria-label="Mes anterior">
            <Icon name="chevronLeft" size={15} />
          </button>
          <button
            className="btn icon"
            onClick={() => setMes(addMonths(mes, 1))}
            disabled={mes >= hoy}
            title={mes >= hoy ? 'Este es el mes en curso: lo que viene aún no se ha gastado' : undefined}
            aria-label="Mes siguiente"
          >
            <Icon name="chevronRight" size={15} />
          </button>
          <div className="cal-mes">{formatMonth(mes)}</div>
          {mes !== hoy && (
            <button className="btn" onClick={() => setMes(hoy)}>
              Hoy
            </button>
          )}
        </div>

        <div className="card-body">
          {!cargado ? (
            <Loading />
          ) : presupuestos.length === 0 ? (
            <EmptyState
              icon="target"
              title="Aún no tienes presupuestos"
              message="Ponle una raya al mes a una categoría de gasto y aquí verás cuánto llevas gastado de ella."
            />
          ) : (
            <div className="tira-presupuestos">
              {presupuestos.map((presupuesto, indice) => {
                return (
                  <div
                    className={`tarjeta-presupuesto${
                      menuPresupuesto?.categoria.id === presupuesto.categoryId ? ' marcada' : ''
                    }`}
                    key={presupuesto.categoryId}
                    role="button"
                    tabIndex={0}
                    data-fila
                    title={`${presupuesto.name}: cambiar el presupuesto`}
                    onClick={() => abrir(presupuesto.categoryId)}
                    onKeyDown={(evento) => {
                      if (evento.key !== 'Enter' && evento.key !== ' ') return
                      evento.preventDefault()
                      abrir(presupuesto.categoryId)
                    }}
                    onContextMenu={(evento) => {
                      evento.preventDefault()
                      const categoria = categoriaDelPresupuesto(presupuesto.categoryId)
                      if (categoria) setMenuPresupuesto({ categoria, x: evento.clientX, y: evento.clientY })
                    }}
                  >
                    <div className="row tight">
                      <Avatar icon={presupuesto.icon} color={presupuesto.color} size="small" />
                      <span className="truncate" style={{ flex: 1, fontWeight: 550 }}>
                        {presupuesto.name}
                      </span>
                      {/*
                        Cuánto te falta o cuánto te has pasado, en dinero y con la
                        misma insignia que Informes. El porcentaje ya lo dice la
                        barra: repetirlo en cifra era decir dos veces lo mismo y
                        ninguna de las dos en euros, que es lo que se gasta.
                      */}
                      <Cambio
                        ahora={presupuesto.spent}
                        antes={presupuesto.limit}
                        kind="expense"
                        unidad="valor"
                        formatea={(valor) => formatMoney(valor, currency)}
                        pista={`${formatMoney(presupuesto.spent, currency)} gastados · presupuesto de ${formatMoney(presupuesto.limit, currency)}`}
                      />
                    </div>

                    {/* Rojo a partir del 80 %, que es la misma raya en la que salta
                        el aviso: lo que hay pasado de ahí es el margen que te has
                        comido, y se ve tal cual de grande que es. */}
                    <ProgressBar
                      percent={presupuesto.percent}
                      color={presupuesto.color}
                      rojoDesde={AVISO_CERCA}
                      late={enCurso}
                      turno={indice}
                    />

                    {/* Lo gastado y el presupuesto. Lo que queda ya lo dice la flecha de
                        arriba, y decirlo otra vez aquí era la misma cifra dos
                        veces en la misma tarjeta. */}
                    <span className="small subtle">
                      {formatMoney(presupuesto.spent, currency)} de {formatMoney(presupuesto.limit, currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {menuPresupuesto && (
        <MenuContextual
          x={menuPresupuesto.x}
          y={menuPresupuesto.y}
          opciones={
            [
              {
                etiqueta: 'Cambiar el presupuesto',
                icono: 'chart',
                onElegir: () => setPoniendoPresupuesto(menuPresupuesto.categoria)
              },
              {
                etiqueta: 'Quitar el presupuesto',
                icono: 'trash',
                peligrosa: true,
                onElegir: () => void quitarPresupuesto(menuPresupuesto.categoria)
              }
            ] satisfies OpcionMenu[]
          }
          onCerrar={() => setMenuPresupuesto(null)}
        />
      )}

      {nuevoPresupuesto && <NuevoPresupuesto onClose={() => setNuevoPresupuesto(false)} />}

      {poniendoPresupuesto && (
        <PresupuestoRapido category={poniendoPresupuesto} onClose={() => setPoniendoPresupuesto(null)} />
      )}
    </>
  )
}

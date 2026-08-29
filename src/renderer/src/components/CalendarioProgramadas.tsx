/**
 * El mes de las programadas, en rejilla.
 *
 * La lista de al lado contesta «qué tengo programado»; esta contesta «cómo cae
 * el mes»: dónde se apelotonan los recibos, qué semanas quedan secas y —en el
 * carril de la derecha— con cuánto se llega al final de cada una. Todo sale de
 * la proyección, que no escribe nada, y de los movimientos que esas mismas
 * programadas ya registraron.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Icon } from './Icon'
import { Avatar, EmptyState, Loading } from './ui'
import { formatMoney } from '@shared/money'
import { tituloProgramada } from '@shared/text'
import { cabecerasDeSemana, esDelMes, esFinDeSemana, semanasDelMes } from '@shared/calendario'
import { addMonths, formatDayHeading, formatMonth, startOfMonth, today } from '@shared/dates'
import type { ScheduledOccurrence, ScheduledView, TxType } from '@shared/types'

const api = window.bonk

/** Cuántos apuntes caben en una casilla antes de resumir el resto en «+N más». */
const CABEN = 2

/** Un apunte de la rejilla, venga de la proyección o de lo ya registrado. */
interface Apunte {
  clave: string
  fecha: string
  titulo: string
  tipo: TxType
  /** Siempre positivo y en la divisa de su cuenta, como en la base. */
  importe: number
  divisa: string
  /** Efecto sobre el patrimonio, en divisa base: un traspaso no mueve nada. */
  enBase: number
  icono: string
  color: string
  cuenta: string
  /** Lo que pasó con ella: registrada, por llegar, o vencida sin registrar. */
  status: ScheduledOccurrence['status']
  scheduledId: number
}

function deVuelta(row: ScheduledOccurrence, indice: number): Apunte {
  return {
    clave: `${row.scheduledId}-${row.date}-${indice}`,
    fecha: row.date,
    titulo: tituloProgramada(row),
    tipo: row.type,
    importe: row.amount,
    divisa: row.accountCurrency,
    enBase: row.amountInBase,
    icono: row.categoryIcon ?? 'repeat',
    color: row.categoryColor ?? '#8E8E93',
    cuenta:
      row.type === 'transfer' && row.toAccountName
        ? `${row.accountName} → ${row.toAccountName}`
        : row.accountName,
    status: row.status,
    scheduledId: row.scheduledId
  }
}

/**
 * El importe tal y como se lee en la aplicación: el gasto en rojo y con su
 * signo, y el traspaso en verde y sin signo, que el dinero sigue siendo tuyo.
 * Es la misma regla que la lista de Movimientos.
 */
function Importe({
  apunte,
  base,
  breve
}: {
  apunte: Apunte
  base: string
  breve?: boolean
}): ReactNode {
  // En la casilla el símbolo se calla cuando es la divisa de casa: son ciento
  // treinta píxeles y el euro no informa de nada. En otra divisa sí, porque
  // entonces la cifra no se puede comparar con las de al lado.
  const opciones = { noSymbol: Boolean(breve) && apunte.divisa === base }

  return (
    <span className={`amount ${apunte.tipo === 'expense' ? 'negative' : 'positive'}`}>
      {apunte.tipo === 'transfer'
        ? formatMoney(apunte.importe, apunte.divisa, opciones)
        : formatMoney(apunte.tipo === 'expense' ? -apunte.importe : apunte.importe, apunte.divisa, {
            ...opciones,
            sign: true
          })}
    </span>
  )
}

interface Props {
  /** Todas las programaciones, para poder abrir la ficha de la que se pulse. */
  programadas: ScheduledView[]
  onAbrir: (row: ScheduledView) => void
}

export function CalendarioProgramadas({ programadas, onAbrir }: Props): ReactNode {
  const { settings, accounts, revision, fail } = useStore()
  const [mes, setMes] = useState(() => startOfMonth(today()))
  const [vueltas, setVueltas] = useState<ScheduledOccurrence[]>([])
  /** Solo para el carril: lo que queda por caer entre hoy y el final del mes. */
  const [previstos, setPrevistos] = useState<ScheduledOccurrence[]>([])
  const [cargando, setCargando] = useState(true)
  const [elegido, setElegido] = useState<string | null>(null)

  const semanas = useMemo(
    () => semanasDelMes(mes, settings.startOfWeek),
    [mes, settings.startOfWeek]
  )
  const primero = semanas[0][0]
  const ultimo = semanas[semanas.length - 1][6]
  const hoy = today()

  useEffect(() => {
    setCargando(true)
    /*
     * Dos preguntas distintas.
     *
     * La rejilla quiere el mes entero: lo que cayó y lo que falta. El carril
     * quiere el camino desde hoy hasta el final de lo que se enseña, aunque el
     * mes esté meses por delante, porque si no el saldo llegaría allí sin haber
     * pasado por lo de en medio.
     */
    Promise.all([
      api.scheduled.occurrences(primero, ultimo),
      ultimo < hoy ? Promise.resolve([]) : api.scheduled.occurrences(hoy, ultimo)
    ])
      .then(([delMes, delCamino]) => {
        setVueltas(delMes)
        setPrevistos(delCamino)
      })
      .catch(fail('el calendario de programadas'))
      .finally(() => setCargando(false))
  }, [primero, ultimo, hoy, revision])

  /** Los apuntes de cada día, en el orden en que vienen: por fecha y programada. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, Apunte[]>()
    vueltas.forEach((row, i) => {
      const apunte = deVuelta(row, i)
      const lista = mapa.get(apunte.fecha)
      if (lista) lista.push(apunte)
      else mapa.set(apunte.fecha, [apunte])
    })
    return mapa
  }, [vueltas])

  /**
   * El patrimonio de ahora mismo, que es de donde arranca el carril. Es la misma
   * cifra que preside la barra lateral: las cuentas apartadas del total tampoco
   * cuentan aquí.
   */
  const patrimonio = useMemo(
    () =>
      accounts
        .filter((cuenta) => !cuenta.excludeFromTotal)
        .reduce((suma, cuenta) => suma + cuenta.balanceInBase, 0),
    [accounts]
  )

  /**
   * Con cuánto se cierra cada semana si se cumple todo lo previsto.
   *
   * Solo para las semanas que aún no han terminado: hacia atrás la pregunta ya
   * no es «con cuánto llego» sino «con cuánto llegué», y esa cifra no la sabe la
   * proyección. Ahí va una raya en vez de un número inventado.
   */
  const cierres = useMemo(
    () =>
      semanas.map((semana) => {
        if (semana[6] < hoy) return null
        // Lo ya registrado no vuelve a contar: el patrimonio de partida ya lo
        // lleva dentro. Lo vencido sin registrar sí, que ese dinero no se ha
        // movido todavía.
        const suma = previstos
          .filter((row) => row.date <= semana[6] && row.status !== 'done')
          .reduce((total, row) => total + row.amountInBase, 0)
        return patrimonio + suma
      }),
    [semanas, previstos, patrimonio, hoy]
  )

  /** La semana más apurada de las que aún están por venir. */
  const minimo = useMemo(() => {
    const conCifra = cierres.filter((cierre): cierre is number => cierre != null)
    return conCifra.length > 1 ? Math.min(...conCifra) : null
  }, [cierres])

  const delMes = useMemo(
    () => [...porDia.entries()].filter(([fecha]) => esDelMes(fecha, mes)),
    [porDia, mes]
  )
  const cuantos = delMes.reduce((total, [, lista]) => total + lista.length, 0)
  const netoDelMes = delMes.reduce(
    (total, [, lista]) => total + lista.reduce((suma, apunte) => suma + apunte.enBase, 0),
    0
  )

  /*
   * Qué día sale abierto abajo: hoy si el mes es el de hoy, y si no el primero
   * que tenga algo. Un mes entero sin nada deja la tarjeta fuera.
   */
  useEffect(() => {
    const conAlgo = delMes.map(([fecha]) => fecha).sort()
    setElegido(esDelMes(hoy, mes) ? hoy : (conAlgo[0] ?? null))
  }, [mes, hoy, cargando])

  const fichaDe = (id: number | null): ScheduledView | undefined =>
    id == null ? undefined : programadas.find((row) => row.id === id)

  const apuntesDelDia = elegido ? (porDia.get(elegido) ?? []) : []
  const netoDelDia = apuntesDelDia.reduce((total, apunte) => total + apunte.enBase, 0)
  const hayTraspaso = apuntesDelDia.some((apunte) => apunte.tipo === 'transfer')

  return (
    <>
      <div className="card flush">
        <div className="card-header">
          {/*
           * Hacia atrás solo hasta el mes en curso: lo de antes ya pasó, y el
           * calendario está para ver lo que viene. Lo ya registrado se mira en
           * Movimientos, que es de quien es.
           */}
          <button
            className="btn icon"
            onClick={() => setMes(addMonths(mes, -1))}
            disabled={mes <= startOfMonth(hoy)}
            title={mes <= startOfMonth(hoy) ? 'Este es el primer mes: hacia atrás ya está todo hecho' : undefined}
            aria-label="Mes anterior"
          >
            <Icon name="chevronLeft" size={15} />
          </button>
          <button
            className="btn icon"
            onClick={() => setMes(addMonths(mes, 1))}
            aria-label="Mes siguiente"
          >
            <Icon name="chevronRight" size={15} />
          </button>
          <div className="cal-mes">{formatMonth(mes)}</div>
          {mes !== startOfMonth(hoy) && (
            <button className="btn" onClick={() => setMes(startOfMonth(hoy))}>
              Hoy
            </button>
          )}
          <div className="cal-resumen">
            <div className="cal-dato">
              <span className="label">Movimientos</span>
              <span className="amount neutral">{cuantos}</span>
            </div>
            <div className="cal-dato">
              <span className="label">Neto del mes</span>
              <span
                className={`amount ${netoDelMes > 0 ? 'positive' : netoDelMes < 0 ? 'negative' : 'neutral'}`}
              >
                {formatMoney(netoDelMes, settings.baseCurrency, { sign: true })}
              </span>
            </div>
          </div>
        </div>

        {cargando ? (
          <Loading />
        ) : (
          <div className="cal-rejilla">
            {cabecerasDeSemana(settings.startOfWeek).map((nombre) => (
              <div key={nombre} className="cal-cabecera">
                {nombre}
              </div>
            ))}
            <div className="cal-cabecera carril">Saldo</div>

            {semanas.map((semana, i) => (
              <Fila
                key={semana[0]}
                semana={semana}
                mes={mes}
                hoy={hoy}
                base={settings.baseCurrency}
                porDia={porDia}
                elegido={elegido}
                onElegir={setElegido}
                cierre={cierres[i]}
                minimo={minimo}
              />
            ))}
          </div>
        )}
      </div>

      {!cargando && cuantos === 0 && (
        <div className="card">
          <EmptyState
            icon="calendar"
            title="Nada este mes"
            message="Ninguna programación cae en estas semanas. Cambia de mes con las flechas de arriba."
          />
        </div>
      )}

      {elegido && apuntesDelDia.length > 0 && (
        <div className="card flush">
          <div className="card-header">
            <h2>{formatDayHeading(elegido)}</h2>
            <span className="small muted">
              {apuntesDelDia.length === 1
                ? '1 movimiento'
                : `${apuntesDelDia.length} movimientos`}
            </span>
          </div>

          {apuntesDelDia.map((apunte) => {
            const ficha = fichaDe(apunte.scheduledId)
            return (
              <div
                key={apunte.clave}
                className={`list-row${ficha ? ' clickable' : ''}${apunte.status === 'done' ? ' finished' : ''}`}
                role={ficha ? 'button' : undefined}
                tabIndex={ficha ? 0 : undefined}
                onClick={ficha ? () => onAbrir(ficha) : undefined}
                onKeyDown={
                  ficha
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onAbrir(ficha)
                        }
                      }
                    : undefined
                }
              >
                <Avatar icon={apunte.icono} color={apunte.color} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row tight">
                    <span className="truncate">{apunte.titulo}</span>
                    {apunte.status === 'done' && (
                      <span className="pill">
                        <Icon name="check" size={12} /> Registrado
                      </span>
                    )}
                    {apunte.status === 'missed' && (
                      <span className="pill vencida">
                        <Icon name="alert" size={12} /> Sin registrar
                      </span>
                    )}
                  </div>
                  <div className="small muted truncate">{apunte.cuenta}</div>
                </div>
                <div className="amount">
                  <Importe apunte={apunte} base={settings.baseCurrency} />
                </div>
              </div>
            )
          })}

          <div className="cal-pie">
            <span className="label">Neto del día</span>
            {hayTraspaso && (
              <span className="small muted">
                El traspaso no suma: mueve dinero entre cuentas.
              </span>
            )}
            <span
              className={`amount ${netoDelDia > 0 ? 'positive' : netoDelDia < 0 ? 'negative' : 'neutral'}`}
            >
              {formatMoney(netoDelDia, settings.baseCurrency, { sign: true })}
            </span>
          </div>
        </div>
      )}
    </>
  )
}

/** Una semana de la rejilla: sus siete días y el saldo con el que cierra. */
function Fila({
  semana,
  mes,
  hoy,
  base,
  porDia,
  elegido,
  onElegir,
  cierre,
  minimo
}: {
  semana: string[]
  mes: string
  hoy: string
  base: string
  porDia: Map<string, Apunte[]>
  elegido: string | null
  onElegir: (fecha: string) => void
  cierre: number | null
  minimo: number | null
}): ReactNode {
  const esElMinimo = cierre != null && minimo != null && cierre === minimo

  return (
    <>
      {semana.map((fecha) => {
        const fuera = !esDelMes(fecha, mes)
        const lista = porDia.get(fecha) ?? []
        const neto = lista.reduce((total, apunte) => total + apunte.enBase, 0)
        const clases = [
          'cal-dia',
          fuera ? 'fuera' : '',
          esFinDeSemana(fecha) ? 'finde' : '',
          fecha === hoy ? 'hoy' : '',
          fecha === elegido ? 'elegido' : ''
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <button
            key={fecha}
            type="button"
            className={clases}
            onClick={() => onElegir(fecha)}
            aria-label={formatDayHeading(fecha)}
            aria-pressed={fecha === elegido}
          >
            <span className="cal-dia-cab">
              <span className="cal-num">{Number(fecha.slice(8))}</span>
              {lista.length > 0 && (
                <span
                  className={`cal-neto amount ${neto > 0 ? 'positive' : neto < 0 ? 'negative' : 'neutral'}`}
                >
                  {formatMoney(neto, base, { sign: true, noSymbol: true })}
                </span>
              )}
            </span>

            {lista.slice(0, CABEN).map((apunte) => (
              <span
                key={apunte.clave}
                className={`cal-apunte ${apunte.status}`}
                title={
                  apunte.status === 'missed'
                    ? `${apunte.titulo} — venció y no se registró`
                    : apunte.titulo
                }
              >
                {/* El color y el nombre van juntos: al bajar el importe de línea,
                    sueltos, el puntito se quedaba huérfano encima. */}
                <span className="cal-linea">
                  <span className="cal-punto" style={{ background: apunte.color }} />
                  <span className="cal-nombre">{apunte.titulo}</span>
                </span>
                <Importe apunte={apunte} base={base} breve />
              </span>
            ))}

            {lista.length > CABEN && (
              <span className="cal-mas">+{lista.length - CABEN} más</span>
            )}
          </button>
        )
      })}

      <div className={`cal-carril${esElMinimo ? ' minimo' : ''}`}>
        {cierre == null ? (
          <span className="cal-raya" title="Semana cerrada: eso ya pasó">
            —
          </span>
        ) : (
          <>
            <span className={`cal-cierre amount${esElMinimo ? ' warning' : ''}`}>
              {formatMoney(cierre, base)}
            </span>
            {esElMinimo && <span className="cal-aviso">mínimo</span>}
          </>
        )}
      </div>
    </>
  )
}

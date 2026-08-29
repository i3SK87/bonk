import { Notification, nativeImage, powerMonitor } from 'electron'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { addDays, today, msHastaElCambioDeDia } from '@shared/dates'
import { formatMoney } from '@shared/money'
import {
  pendingReminders,
  markReminded,
  postDue,
  pendingSettlements,
  markSettlementNotified,
  debtSummary
} from './repos/scheduled'
import { pendingGoals, markGoalReached } from './repos/goals'
import { listAccountsWithBalance, isLowBalanceWarned, setLowBalanceWarned } from './repos/accounts'
import { getSettings } from './repos/settings'
import { tituloProgramada } from '@shared/text'
import { registrar, registrarFallo } from './registro'
import type { ScheduledView, Settlement, GoalReached } from '@shared/types'

/**
 * Avisos del día antes de cada movimiento programado.
 *
 * Las programaciones solo tienen fecha, no hora, así que «24 horas antes» es
 * «el día de antes»: en cuanto la aplicación ve que algo vence mañana, avisa.
 * De ahí que el aviso llegue al abrirla, y luego cada media hora mientras siga
 * viva en la bandeja —que es justo para lo que sirve tenerla ahí—.
 */

const CHECK_EVERY_MS = 30 * 60 * 1000

/** A partir de cuatro, un solo aviso: el día 1 del mes vencen media docena. */
const MAX_INDIVIDUAL = 3

const title = (row: ScheduledView): string => tituloProgramada(row)

function amountOf(row: ScheduledView): string {
  return formatMoney(row.type === 'expense' ? -row.amount : row.amount, row.accountCurrency, {
    sign: row.type !== 'transfer'
  })
}

/**
 * Los iconos que dibuja la ventana, guardados aquí como PNG en base64. Las
 * claves llevan de qué son: «c:3» una categoría, «a:1» una cuenta, «g:2» un
 * hito. Se pierden al cerrar, y no importa: la ventana los vuelve a mandar en
 * cuanto arranca.
 */
const drawnIcons = new Map<string, string>()

export function setCategoryIcons(icons: Record<string, string>): void {
  drawnIcons.clear()
  for (const [key, data] of Object.entries(icons)) drawnIcons.set(key, data)
}

/** El suyo si la ventana lo ha dibujado; si no, el de la aplicación. */
function imageFor(fallback: string, key: string | null): Electron.NativeImage | string | null {
  const drawn = key == null ? undefined : drawnIcons.get(key)
  if (drawn) return nativeImage.createFromDataURL(drawn)
  return existsSync(fallback) ? fallback : null
}

const categoryImage = (fallback: string, id: number | null): Electron.NativeImage | string | null =>
  imageFor(fallback, id == null ? null : `c:${id}`)

const accountImage = (fallback: string, id: number): Electron.NativeImage | string | null =>
  imageFor(fallback, `a:${id}`)

const goalImage = (fallback: string, id: number): Electron.NativeImage | string | null =>
  imageFor(fallback, `g:${id}`)

/**
 * Windows saca el nombre y el icono de la cabecera del aviso del acceso directo
 * del menú Inicio que lleve el mismo AppUserModelID. El nuestro es `BONK.lnk`,
 * pero el motor de Electron planta un `Electron.lnk` con ese mismo
 * identificador en el momento de mandar el aviso, y como es el más reciente
 * gana él: de ahí que la cabecera dijera «Electron». El suyo apunta al motor
 * pelado, sin la carpeta del proyecto, así que ni siquiera abre nada.
 *
 * Se retira después de avisar y no antes, porque antes lo vuelve a crear. El
 * centro de notificaciones resuelve el nombre al dibujar la lista, así que para
 * cuando se mira ya solo queda el nuestro.
 */
function clearStrayShortcut(): void {
  if (process.platform !== 'win32' || !process.env.APPDATA) return
  const stray = join(
    process.env.APPDATA,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Electron.lnk'
  )
  try {
    if (existsSync(stray)) rmSync(stray)
  } catch {
    // Si no se deja borrar, el aviso sale igual: solo con el nombre equivocado.
  }
}

function notify(
  icon: Electron.NativeImage | string | null,
  onClick: () => void,
  options: { title: string; body: string }
): void {
  const notification = new Notification({
    ...options,
    ...(icon ? { icon } : {})
  })
  // Pulsar el aviso abre la ventana: si te avisan de un recibo, es porque
  // quieres mirarlo.
  notification.on('click', onClick)
  notification.show()
  sweepStrayShortcut()
}

/**
 * Dos pasadas en diferido: una en cuanto el motor ha terminado de plantar el
 * suyo y otra por si se retrasa. Hace falta después de cualquier trato con la
 * API de avisos, no solo al mandar uno: el acceso directo lo planta ya al
 * preguntarle si los admite.
 */
function sweepStrayShortcut(): void {
  setTimeout(clearStrayShortcut, 1000)
  setTimeout(clearStrayShortcut, 5000)
}

/**
 * Manda los avisos que tocan hoy. Marca cada programación como avisada aunque
 * el aviso vaya dentro de un resumen: lo que no se puede es avisar dos veces
 * de lo mismo.
 */
function checkReminders(icon: string, onClick: () => void): number {
  if (!getSettings().remindersEnabled || !Notification.isSupported()) return 0

  const target = addDays(today(), 1)
  const rows = pendingReminders(target)
  if (rows.length === 0) return 0

  if (rows.length <= MAX_INDIVIDUAL) {
    for (const row of rows) {
      notify(categoryImage(icon, row.categoryId), onClick, {
        title: `Mañana: ${title(row)}`,
        // «Lo registras tú» solo cuando hay algo que hacer: decir que las demás
        // se registran solas es contar lo que ya se da por hecho.
        body: `${amountOf(row)} · ${row.accountName}${row.autoPost ? '' : ' · lo registras tú'}`
      })
    }
  } else {
    const manual = rows.filter((row) => !row.autoPost).length
    // El resumen es de varias categorías a la vez: ahí manda el icono de la app.
    notify(categoryImage(icon, null), onClick, {
      title: `Mañana vencen ${rows.length} movimientos programados`,
      body:
        rows.map(title).slice(0, 4).join(', ') +
        (rows.length > 4 ? ` y ${rows.length - 4} más` : '') +
        (manual > 0 ? ` · ${manual} los registras tú` : '')
    })
  }

  for (const row of rows) markReminded(row.id, target)
  return rows.length
}

/**
 * Deudas recién saldadas. Una sola enhorabuena por deuda: la programación queda
 * marcada en cuanto se cuenta, para que el repaso de cada media hora no la
 * repita.
 */
export function announceSettlements(icon: string, onClick: () => void): Settlement[] {
  const done: Settlement[] = []

  for (const row of pendingSettlements()) {
    const summary = debtSummary(row.id)
    const name = title(row)

    /*
     * Las cuotas que se pagaron sin dejar rastro también se pagaron.
     *
     * La enhorabuena cuenta lo mismo que la pestaña de Deudas: sin sumarlas, una
     * deuda que venía de antes se despedía diciendo que habías pagado la mitad
     * de lo que pagaste.
     */
    const deMas = row.debtExtraCount ?? 0
    const count = summary.count + deMas
    const total = summary.total + deMas * row.amount

    if (Notification.isSupported()) {
      notify(categoryImage(icon, row.categoryId), onClick, {
        title: `¡${name} pagado!`,
        body: `${count} cuotas y ya está. ${formatMoney(total, summary.currency)} desde ${monthOf(row.debtStartDate ?? summary.firstDate)}.`
      })
    }

    markSettlementNotified(row.id)
    done.push({
      id: row.id,
      title: name,
      count,
      total,
      currency: summary.currency,
      firstDate: row.debtStartDate ?? summary.firstDate,
      lastDate: summary.lastDate
    })
  }

  return done
}

/**
 * Hitos de ahorro recién alcanzados. Una sola enhorabuena por hito: queda
 * marcado en cuanto se cuenta, para que el repaso de cada media hora no lo
 * repita mientras el dinero siga en la hucha.
 */
export function announceGoals(icon: string, onClick: () => void): GoalReached[] {
  const done: GoalReached[] = []

  for (const goal of pendingGoals()) {
    if (Notification.isSupported()) {
      notify(goalImage(icon, goal.id), onClick, {
        title: `¡${goal.title} conseguido!`,
        body: `${formatMoney(goal.total, goal.currency)} juntados en ${goal.accountName}.`
      })
    }
    markGoalReached(goal.id)
    done.push(goal)
  }

  return done
}

/**
 * Avisa cuando la cuenta principal se queda corta.
 *
 * Es lo que no se ve mirando el patrimonio: con mil euros apartados en la
 * hucha, el total sigue diciendo que vas bien mientras la cuenta del día a día
 * se queda en números rojos.
 *
 * El aviso se da una vez y se vuelve a armar solo cuando el saldo remonta, para
 * no repetirlo cada media hora mientras dure la cuesta abajo.
 */
export function checkLowBalance(icon: string, onClick: () => void): number {
  let avisadas = 0

  for (const account of listAccountsWithBalance()) {
    if (account.lowBalanceThreshold <= 0) continue

    const low = account.balance < account.lowBalanceThreshold
    if (!low) {
      if (isLowBalanceWarned(account.id)) setLowBalanceWarned(account.id, false)
      continue
    }
    if (isLowBalanceWarned(account.id)) continue

    setLowBalanceWarned(account.id, true)
    avisadas++
    if (Notification.isSupported()) {
      const empty = account.balance <= 0
      notify(accountImage(icon, account.id), onClick, {
        title: `${account.name} ${empty ? 'se ha quedado sin fondos' : 'se está quedando sin fondos'}`,
        body: formatMoney(account.balance, account.currency)
      })
    }
  }
  return avisadas
}

/** «agosto de 2025», para contar desde cuándo se pagaba. */
function monthOf(date: string | null): string {
  if (!date) return 'el principio'
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`)
  )
}

/** Lo que se espera a que la ventana mande los iconos antes del primer repaso. */
const FIRST_CHECK_MS = 6000

/**
 * Un respiro después de medianoche antes de mirar.
 *
 * Las programadas van por fecha, sin hora, así que lo que decide si una cuota
 * ha vencido es qué día dice el sistema. Despertando clavado a las 00:00:00 el
 * temporizador puede adelantarse unos milisegundos y encontrarse todavía en el
 * día de ayer: la cuota no vencería y habría que esperar a la vuelta siguiente.
 * Dos segundos lo cubren de sobra.
 */
const PROPINA_MEDIANOCHE = 2000

/**
 * Llama a `hacer` en cuanto cambie el día, y se vuelve a armar para el
 * siguiente.
 *
 * El repaso de cada media hora ya registraba lo vencido, pero a su ritmo: una
 * cuota que vence hoy podía tardar media hora en entrar desde que el reloj daba
 * las doce, y quien está delante mirando su deuda a las 00:01 solo ve que no ha
 * pasado nada. Con esto entra sola, al momento.
 *
 * Se vuelve a calcular la espera en cada vuelta en lugar de dejar puesto un
 * intervalo de veinticuatro horas: así el cambio de hora, un reloj que se
 * ajusta o el equipo durmiendo un rato no van desplazando la cita.
 */
function alCambiarElDia(hacer: () => void): void {
  setTimeout(() => {
    hacer()
    alCambiarElDia(hacer)
  }, msHastaElCambioDeDia() + PROPINA_MEDIANOCHE)
}

/**
 * El repaso periódico: registra lo que ha vencido y avisa de lo que vence
 * mañana.
 *
 * Las vencidas se generaban solo al arrancar, que valía cuando abrir la
 * aplicación era el gesto de cada día. Desde que vive en la bandeja puede pasar
 * semanas sin reiniciarse, y una cuota que vencía hoy se quedaba sin registrar
 * aunque su aviso sí hubiera llegado.
 */
export function startBackgroundWork(
  icon: string,
  onClick: () => void,
  onDataChanged: () => void,
  onFailure: (reason: string) => void,
  onSettled: (settlements: Settlement[]) => void,
  onGoalReached: (goals: GoalReached[]) => void
): void {
  // El de la sesión anterior sigue ahí: se retira al arrancar para que el
  // centro de notificaciones enseñe BONK también en los avisos ya recibidos.
  clearStrayShortcut()

  // Para no repetir el mismo aviso de fallo cada media hora.
  let failureReported = false

  const sweep = (): void => {
    try {
      const { created, failed, apartados } = postDue()
      // Si ha creado algo, la ventana tiene que enterarse: puede llevar días
      // abierta enseñando la lista de antes.
      if (created > 0) onDataChanged()

      // Y lo que se haya apartado solo, dicho en voz alta.
      anunciarApartados(icon, onClick, apartados)

      /*
       * Las que no han podido entrar. Ya no arrastran a las demás —cada una va
       * en su propia transacción—, pero siguen sin registrarse, y una cuota que
       * no entra en silencio es una cuenta que no cuadra a fin de mes.
       *
       * Se cuenta una vez y no en cada vuelta de media hora, que sería un
       * martilleo; vuelve a contarse en cuanto el repaso sale limpio y algo se
       * tuerce otra vez.
       */
      if (failed.length === 0) {
        failureReported = false
      } else {
        registrar('repaso', failed.map((f) => `«${f.title}» no entró: ${f.reason}`).join(' · '))
        if (!failureReported) {
          failureReported = true
          onFailure(
            failed.length === 1
              ? `«${failed[0].title}» no se ha podido registrar. ${failed[0].reason}`
              : `${failed.length} programaciones no se han podido registrar. La primera: ${failed[0].reason}`
          )
        }
      }
    } catch (error) {
      // Aquí ya no llega lo de una programada suelta, solo lo que impida el
      // repaso entero —la base caída, por ejemplo—.
      const reason = (error as Error).message ?? 'Error inesperado'
      registrarFallo('repaso', error)
      if (!failureReported) {
        failureReported = true
        onFailure(reason)
      }
    }
    try {
      // Antes que los avisos: una deuda que se acaba de saldar merece su
      // enhorabuena por delante del recordatorio del recibo de mañana.
      const settled = announceSettlements(icon, onClick)
      if (settled.length > 0) onSettled(settled)
    } catch (error) {
      console.error('No se pudo dar la enhorabuena:', error)
    }
    try {
      // La hucha puede llegar a la meta sin que nadie toque nada: una programada
      // que aparta dinero cada mes lo hace sola mientras la aplicación duerme.
      const reached = announceGoals(icon, onClick)
      if (reached.length > 0) onGoalReached(reached)
    } catch (error) {
      console.error('No se pudo celebrar el hito:', error)
    }
    try {
      // Y por lo mismo puede vaciarse: un recibo que entra solo deja la cuenta
      // principal en las últimas sin que nadie haya tocado nada.
      checkLowBalance(icon, onClick)
    } catch (error) {
      console.error('No se pudo comprobar el saldo:', error)
    }
    try {
      checkReminders(icon, onClick)
    } catch (error) {
      console.error('No se pudieron comprobar los avisos:', error)
    }
    sweepStrayShortcut()
  }

  // El primer repaso no es inmediato a propósito: los iconos de las categorías
  // los dibuja la ventana, y hasta que no ha cargado no han llegado. Seis
  // segundos de espera valen por que el aviso salga con el icono que toca.
  setTimeout(sweep, FIRST_CHECK_MS)
  // Sin `unref`: es el único motivo por el que la aplicación se queda en la
  // bandeja, así que este temporizador sí debe mantenerla despierta.
  setInterval(sweep, CHECK_EVERY_MS)
  // Y en el momento en que cambia el día, que es cuando vence lo que vence.
  alCambiarElDia(sweep)

  /*
   * Al volver de suspender, también.
   *
   * Un temporizador puesto para dentro de ocho horas no corre mientras el
   * equipo duerme: al despertar salta tarde. Si se ha dormido antes de las doce
   * y se despierta después, la cita de medianoche llega con retraso y hasta
   * entonces la cuota sigue sin entrar. Esto lo cubre: al levantarse, se repasa.
   */
  powerMonitor.on('resume', sweep)
}

/**
 * Dice en voz alta lo que la regla de ahorro ha apartado sola.
 *
 * Una regla automática mueve dinero sin que nadie la toque, así que callarlo es
 * justo lo que no se quiere: un traspaso que aparece en la lista sin que
 * recuerdes haberlo hecho. Se avisa de lo que acaba de pasar y no se guarda nada
 * pendiente.
 *
 * Vive suelta porque hay dos sitios que registran vencidas: el repaso de fondo
 * —el de cada media hora, el del cambio de día y el de volver de suspender— y el
 * arranque, que recupera todo lo que venció con la aplicación cerrada. Sin esto,
 * apartar mientras estaba cerrada no lo contaba nadie.
 */
export function anunciarApartados(
  icon: string,
  onClick: () => void,
  apartados: Array<{ title: string; amount: number; currency: string }>
): void {
  if (!Notification.isSupported()) return
  for (const apartado of apartados) {
    notify(categoryImage(icon, null), onClick, {
      title: `Apartados ${formatMoney(apartado.amount, apartado.currency)}`,
      body: `De ${apartado.title}, a tu hucha.`
    })
  }
}

/** Aviso de prueba, para comprobar que Windows los deja pasar. */
export function sendTestNotification(icon: string, onClick: () => void): boolean {
  if (!Notification.isSupported()) return false
  // Con el icono de una categoría cualquiera: el de prueba tiene que enseñar
  // cómo va a quedar el de verdad, y el de verdad lleva el de su categoría.
  const sample = drawnIcons.values().next().value
  notify(sample ? nativeImage.createFromDataURL(sample) : categoryImage(icon, null), onClick, {
    title: 'Mañana: Alquiler',
    body: '−753,00 € · BartBank'
  })
  return true
}

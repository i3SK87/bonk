import { Notification, nativeImage } from 'electron'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { addDays, today } from '@shared/dates'
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
import { listAccountsWithBalance } from './repos/accounts'
import { getSettings, getSetting, setSetting } from './repos/settings'
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

function title(row: ScheduledView): string {
  return row.name || row.note || row.categoryName || 'Movimiento programado'
}

function amountOf(row: ScheduledView): string {
  return formatMoney(row.type === 'expense' ? -row.amount : row.amount, row.accountCurrency, {
    sign: row.type !== 'transfer'
  })
}

/**
 * Los iconos de las categorías, dibujados por la ventana y guardados aquí como
 * PNG en base64. Se pierden al cerrar, y no importa: la ventana los vuelve a
 * mandar en cuanto arranca.
 */
const categoryIcons = new Map<number, string>()

export function setCategoryIcons(icons: Record<string, string>): void {
  categoryIcons.clear()
  for (const [id, data] of Object.entries(icons)) categoryIcons.set(Number(id), data)
}

/** El de la categoría si la ventana lo ha dibujado; si no, el de la aplicación. */
function imageFor(fallback: string, categoryId: number | null): Electron.NativeImage | string | null {
  const drawn = categoryId == null ? undefined : categoryIcons.get(categoryId)
  if (drawn) return nativeImage.createFromDataURL(drawn)
  return existsSync(fallback) ? fallback : null
}

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
export function checkReminders(icon: string, onClick: () => void): number {
  if (!getSettings().remindersEnabled || !Notification.isSupported()) return 0

  const target = addDays(today(), 1)
  const rows = pendingReminders(target)
  if (rows.length === 0) return 0

  if (rows.length <= MAX_INDIVIDUAL) {
    for (const row of rows) {
      notify(imageFor(icon, row.categoryId), onClick, {
        title: `Mañana: ${title(row)}`,
        // «Lo registras tú» solo cuando hay algo que hacer: decir que las demás
        // se registran solas es contar lo que ya se da por hecho.
        body: `${amountOf(row)} · ${row.accountName}${row.autoPost ? '' : ' · lo registras tú'}`
      })
    }
  } else {
    const manual = rows.filter((row) => !row.autoPost).length
    // El resumen es de varias categorías a la vez: ahí manda el icono de la app.
    notify(imageFor(icon, null), onClick, {
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

    if (Notification.isSupported()) {
      notify(imageFor(icon, row.categoryId), onClick, {
        title: `¡${name} pagado!`,
        body: `${summary.count} cuotas y ya está. ${formatMoney(summary.total, summary.currency)} desde ${monthOf(summary.firstDate)}.`
      })
    }

    markSettlementNotified(row.id)
    done.push({
      id: row.id,
      title: name,
      count: summary.count,
      total: summary.total,
      currency: summary.currency,
      firstDate: summary.firstDate,
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
      notify(imageFor(icon, null), onClick, {
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
export function checkLowBalance(icon: string, onClick: () => void): boolean {
  const settings = getSettings()
  const limit = settings.lowBalanceThreshold
  if (limit <= 0 || settings.defaultAccountId == null) return false

  const account = listAccountsWithBalance(true).find((row) => row.id === settings.defaultAccountId)
  if (!account) return false

  const low = account.balance < limit
  const warned = getSetting('lowBalanceWarned') === '1'

  if (!low) {
    if (warned) setSetting('lowBalanceWarned', false)
    return false
  }
  if (warned) return false

  setSetting('lowBalanceWarned', true)
  if (Notification.isSupported()) {
    notify(imageFor(icon, null), onClick, {
      title: `${account.name} se está quedando sin fondo`,
      body: `Quedan ${formatMoney(account.balance, account.currency)}, por debajo de ${formatMoney(limit, account.currency)}.`
    })
  }
  return true
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
      // Si ha creado algo, la ventana tiene que enterarse: puede llevar días
      // abierta enseñando la lista de antes.
      if (postDue() > 0) onDataChanged()
      failureReported = false
    } catch (error) {
      const reason = (error as Error).message ?? 'Error inesperado'
      console.error('No se pudieron generar las programadas vencidas:', error)
      // Una programada que no entra —porque dejaría una cuenta sin números
      // rojos en negativo, por ejemplo— se quedaría atascada repitiendo el
      // intento cada media hora sin que nadie se enterara. Se cuenta una vez, y
      // no en cada vuelta, que sería un martilleo.
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
}

/** Aviso de prueba, para comprobar que Windows los deja pasar. */
export function sendTestNotification(icon: string, onClick: () => void): boolean {
  if (!Notification.isSupported()) return false
  // Con el icono de una categoría cualquiera: el de prueba tiene que enseñar
  // cómo va a quedar el de verdad, y el de verdad lleva el de su categoría.
  const sample = categoryIcons.values().next().value
  notify(sample ? nativeImage.createFromDataURL(sample) : imageFor(icon, null), onClick, {
    title: 'Mañana: Alquiler',
    body: '−753,00 € · BartBank'
  })
  return true
}

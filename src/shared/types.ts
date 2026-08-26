/** Tipos de dominio compartidos entre el proceso principal y la interfaz. */

/**
 * Un reembolso es dinero que vuelve a tu bolsillo por un gasto que ya hiciste:
 * suma al saldo como un ingreso, pero en los informes y presupuestos resta del
 * gasto de su categoría en vez de contar como ingreso nuevo.
 */
export type TxType = 'expense' | 'income' | 'transfer' | 'refund'
export type CategoryKind = 'expense' | 'income'
export type AccountType = 'cash' | 'bank' | 'card' | 'savings' | 'investment' | 'debt'
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type ThemeMode = 'light' | 'dark' | 'system'
/** Paletas de color. Cambian la decoración, nunca el verde y el rojo del dinero. */
/**
 * Dónde se planta el widget del escritorio: una de las nueve esquinas.
 *
 * Se recalculan contra el área útil de la pantalla, así que sobreviven a un
 * cambio de resolución o a que aparezca una segunda pantalla. No hay posición
 * libre: se probó a arrastrarlo y no aporta nada frente a decir la esquina, y a
 * cambio la tarjeta tenía que tragarse el ratón para poder moverse.
 */
export type WidgetAnchor =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'left'
  | 'center'
  | 'right'
  | 'bottomLeft'
  | 'bottom'
  | 'bottomRight'

/** En qué se leen las diferencias de Informes: en porcentaje o en su unidad. */
export type UnidadCambio = 'porcentaje' | 'valor'

export type Palette =
  | 'grafito'
  | 'indigo'
  | 'marea'
  | 'sepia'
  | 'ciruela'
  | 'heat'
  | 'arasaka'
  | 'ghost'
  | '2049'

export interface Account {
  id: number
  name: string
  type: AccountType
  currency: string
  initialBalance: number
  icon: string
  color: string
  excludeFromTotal: boolean
  /** Si está en falso, la aplicación rechaza cualquier movimiento que deje la cuenta bajo cero. */
  allowNegative: boolean
  archived: boolean
  /**
   * La principal de su tipo: la del banco es la que viene marcada al registrar
   * un movimiento, la de ahorro es la que abre Planes Ahorro. Una por tipo.
   */
  isPrimary: boolean
  sortOrder: number
  note: string | null
  /**
   * Avisa cuando el saldo de esta cuenta baja de aquí, en unidades mínimas. En
   * cero no avisa. El aviso se vuelve a armar en cuanto el saldo remonta.
   */
  lowBalanceThreshold: number
  createdAt: string
}

/** Cuenta con el saldo ya calculado a partir de sus movimientos. */
export interface AccountWithBalance extends Account {
  balance: number
  balanceInBase: number
}

export interface Category {
  id: number
  name: string
  kind: CategoryKind
  parentId: number | null
  icon: string
  color: string
  archived: boolean
  sortOrder: number
  /** Si el informe abre la categoría en sus notas (Deuda → 4Geeks, PC, Kindle). */
  breakdownByNote: boolean
  /** Si sus movimientos pueden llevar facturas adjuntas. */
  keepsInvoices: boolean
}

export interface Tag {
  id: number
  name: string
  color: string
}

export interface Attachment {
  id: number
  transactionId: number
  filename: string
  originalName: string
  mime: string | null
  size: number | null
  createdAt: string
}

export interface Transaction {
  id: number
  type: TxType
  date: string
  time: string | null
  accountId: number
  toAccountId: number | null
  categoryId: number | null
  /** Importe en unidades mínimas (céntimos) y en la divisa de la cuenta de origen. Siempre positivo. */
  amount: number
  /** Importe recibido, solo en traspasos entre cuentas de distinta divisa. */
  amountTo: number | null
  payee: string | null
  note: string | null
  place: string | null
  lat: number | null
  lon: number | null
  scheduledId: number | null
  /** Gasto al que devuelve dinero este reembolso, cuando se registró desde él. */
  refundForId: number | null
  /**
   * Hito al que va este dinero, cuando se aparta a propósito. Solo lo llevan los
   * traspasos que entran en una cuenta de ahorro.
   */
  goalId: number | null
  createdAt: string
  updatedAt: string
}

/** Transacción enriquecida con los datos que la interfaz necesita para pintarla. */
export interface TransactionView extends Transaction {
  accountName: string
  accountCurrency: string
  accountColor: string
  toAccountName: string | null
  toAccountCurrency: string | null
  categoryName: string | null
  categoryIcon: string | null
  categoryColor: string | null
  tags: Tag[]
  attachmentCount: number
  /** Suma de los reembolsos enlazados a este gasto, en su misma divisa. */
  refundedTotal: number
  /** Efecto sobre el patrimonio total, convertido a la divisa base. */
  amountInBase: number
  /**
   * Es una cuota de una deuda a plazos, porque la programada que lo creó lo es.
   *
   * Viene de la programada y no del movimiento: la marca vive en el plan, que es
   * quien sabe que esto se paga a plazos. Un movimiento suelto nunca lo es.
   */
  isDebt: boolean
}

export interface TransactionInput {
  id?: number
  type: TxType
  date: string
  time?: string | null
  accountId: number
  toAccountId?: number | null
  categoryId?: number | null
  amount: number
  amountTo?: number | null
  payee?: string | null
  note?: string | null
  place?: string | null
  lat?: number | null
  lon?: number | null
  tagIds?: number[]
  refundForId?: number | null
  goalId?: number | null
  /** Programada que lo ha creado; queda anotado para poder rastrear su origen. */
  scheduledId?: number | null
}

export interface TransactionFilter {
  from?: string
  to?: string
  accountIds?: number[]
  categoryIds?: number[]
  /**
   * Los que no tienen categoría, que no son ninguna en concreto y por eso no
   * caben en la lista de arriba. Los traspasos quedan fuera: esos no es que
   * les falte la categoría, es que no la llevan.
   */
  uncategorized?: boolean
  tagIds?: number[]
  types?: TxType[]
  search?: string
  minAmount?: number
  maxAmount?: number
  limit?: number
  offset?: number
}

export interface Goal {
  id: number
  name: string
  /** Cuenta donde se junta el dinero; en la práctica, la hucha. */
  accountId: number
  targetAmount: number
  /** Fecha para la que se quiere tener juntado; opcional. */
  targetDate: string | null
  icon: string
  color: string
  note: string | null
  /**
   * Lo que se ha apartado para él de la hucha. Manda sobre el reparto automático
   * por fecha: lo apartado es suyo aunque otro hito venza antes.
   */
  reserved: number
  /** Se sella al darlo por cumplido; a partir de ahí deja de repartirse saldo. */
  achievedAt: string | null
  createdAt: string
}

/** Hito con lo que lleva juntado y el ritmo que hace falta, ya calculado. */
export interface GoalProgress extends Goal {
  accountName: string
  /** Parte del saldo de la hucha que le toca a este hito. */
  saved: number
  missing: number
  percent: number
  /** Días que quedan hasta la fecha; negativo si ya pasó. */
  daysLeft: number | null
  /** Lo que habría que apartar cada mes para llegar a tiempo. */
  perMonth: number | null
  /** Ritmo de ahorro de los últimos noventa días en esa cuenta, al mes. */
  recentPace: number
  status: 'achieved' | 'complete' | 'onTrack' | 'behind' | 'late' | 'open'
}

export interface Scheduled {
  id: number
  name: string | null
  type: TxType
  accountId: number
  toAccountId: number | null
  categoryId: number | null
  amount: number
  amountTo: number | null
  payee: string | null
  note: string | null
  freq: Frequency
  interval: number
  nextDate: string
  endDate: string | null
  autoPost: boolean
  active: boolean
  lastPosted: string | null
  createdAt: string
  /** Programada del gasto que esta devolución reembolsa, si cuelga de otra. */
  refundForScheduledId: number | null
  /** Plan de ahorro al que va este traspaso, cuando entra en una hucha. */
  goalId: number | null
  /**
   * Cuántas cuotas se pagaron sin dejar rastro en los movimientos, antes de que
   * hubiera un solo apunte. Se suman a las que se ven; sin esto, una deuda vieja
   * con registros nuevos sale casi a cero.
   */
  debtExtraCount: number | null
  /** La última cuota, cuando es más corta que las demás. */
  debtLastAmount: number | null
  /** Desde cuándo se paga, cuando empezó antes del primer apunte. */
  debtStartDate: string | null
  /** Quién cobra la deuda, de la lista de shared/lenders. */
  lender: string | null
  /**
   * El total de verdad de la deuda, cuando no sale de multiplicar la cuota por
   * las veces: la última suele ser más corta.
   */
  debtTotal: number | null
  /**
   * Deuda a plazos: sale en su pestaña con lo pagado y lo que falta, y termina
   * en vez de pausarse. Es del plan y no de la categoría, para que el portátil
   * pueda estar en Tecnología y contar igual.
   */
  isDebt: boolean
  /** Avisa el día antes. Se puede silenciar una sin callar las demás. */
  remind: boolean
  /** Fecha de la ocurrencia ya avisada; evita repetir el aviso en cada arranque. */
  remindedFor: string | null
  /**
   * Fecha en que el plan se dio por terminado, sea porque se agotó o porque se
   * finalizó a mano. Apagada no es lo mismo que terminada: una pausada también
   * está apagada, y esa espera a que la reanuden.
   */
  settledAt: string | null
}

export interface ScheduledView extends Scheduled {
  accountName: string
  accountCurrency: string
  toAccountName: string | null
  categoryName: string | null
  categoryIcon: string | null
  categoryColor: string | null
}

/**
 * Una repetición futura de una programada, proyectada para enseñarla en la lista.
 * No existe en la base de datos: se calcula al vuelo y desaparece en cuanto la
 * programada se registra de verdad.
 */
export interface ProjectedTransaction {
  scheduledId: number
  date: string
  type: TxType
  amount: number
  /** Lo que llegaría al destino en un traspaso entre divisas distintas. */
  amountTo: number | null
  /** Efecto sobre el patrimonio en divisa base, para poder sumarlo a los totales. */
  amountInBase: number
  accountId: number
  accountCurrency: string
  accountName: string
  toAccountId: number | null
  toAccountName: string | null
  categoryName: string | null
  categoryIcon: string | null
  categoryColor: string | null
  name: string | null
  payee: string | null
  note: string | null
  /** Programada del gasto del que cuelga, para poder anidarla en la lista. */
  refundForScheduledId: number | null
  /** La primera pendiente se puede registrar de un clic; las siguientes, no. */
  isNext: boolean
}

export interface Rate {
  code: string
  rate: number
  updatedAt: string
}

export interface Settings {
  baseCurrency: string

  /** Enseña las repeticiones futuras de las programadas dentro de la lista de movimientos. */
  theme: ThemeMode
  palette: Palette
  startOfWeek: 'monday' | 'sunday'
  /** Se abre sola al iniciar sesión en Windows, y lo hace directa a la bandeja. */
  startWithWindows: boolean
  /** El aspa esconde la ventana en la bandeja en vez de cerrar la aplicación. */
  closeToTray: boolean
  /** Avisa por notificación de Windows el día antes de cada programación. */
  remindersEnabled: boolean
  /**
   * El último mes cuyo resumen ya se ha visto, como «2026-07». Es lo que impide
   * que salga cada vez que abres, y lo que hace que salga igual si el día 1 no
   * llegaste a abrir la aplicación.
   */
  /**
     * Cómo se leen las diferencias en Informes.
     *
     * Se guarda, al revés que los filtros: un filtro cambia qué datos se ven y
     * se quiere empezar limpio cada día, pero esto es en qué unidad se leen los
     * mismos datos, y quien prefiere los euros los prefiere siempre.
     */
  balanceEn: UnidadCambio

  /* — El widget del escritorio — */
  /** En pantalla o escondido. Se apaga desde su menú y se enciende en Ajustes. */
  widgetVisible: boolean
  widgetAnchor: WidgetAnchor
  /**
   * Cuánto se ve la tarjeta, de 0,2 a 1.
   *
   * Va al fondo de la tarjeta y no a la ventana: bajándole la opacidad a la
   * ventana entera se desvanecían también las cifras y los iconos, que es lo que
   * se viene a leer. Así el cristal se aclara y lo escrito encima no se toca.
   */
  widgetOpacity: number
  /** En gris: los colores de las cuentas y de las cifras se apagan. */
  widgetGris: boolean
  /** Por delante de todas las ventanas. Apagado se queda en el orden normal. */
  widgetOnTop: boolean
  /** Qué cuentas salen. Vacío es todas, que es como empieza. */
  widgetAccountIds: number[]
  lastMonthlySummary: string | null
  lastBackupAt: string | null
}

/** Lo que se cuenta al saldar una deuda: cuántas cuotas, cuánto y desde cuándo. */
export interface Settlement {
  id: number
  title: string
  count: number
  total: number
  currency: string
  firstDate: string | null
  lastDate: string | null
}

/** Un hito de ahorro que acaba de llegar a su meta. */
/**
 * Cómo va una deuda a plazos: lo pagado, lo que queda y cuándo se acaba.
 *
 * Sale de la programación que genera las cuotas, no de un apunte aparte: la
 * deuda existe porque hay un recibo que se repite hasta una fecha.
 */
/** Lo que de una deuda no se puede deducir de los movimientos. */
export interface DebtAdjust {
  /** Cuotas pagadas en total; cero o null para contar solo las que se vean. */
  paidCount?: number | null
  /** La última cuota, si es más corta; cero o null si es igual que las demás. */
  lastAmount?: number | null
  /** El total de la deuda; cero o null para calcularlo con las cuotas. */
  total?: number | null
  /** Desde cuándo se paga; vacío o null para tomar el movimiento más antiguo. */
  startDate?: string | null
}

export interface DebtProgress {
  scheduledId: number
  title: string
  categoryName: string | null
  categoryIcon: string | null
  categoryColor: string | null
  accountName: string
  currency: string
  /** Lo que se paga cada vez. */
  installment: number
  /**
   * Cada cuánto se paga, para poder decir «29,75 €/mes». Cuando la repetición no
   * cae en una palabra —cada dos meses—, vale «cuota», que nunca miente.
   */
  cadence: string
  /** Cuántas cuotas se han pagado ya y cuánto suman, con lo de antes incluido. */
  paidCount: number
  paid: number
  /** Cuántas quedan y cuánto suman, cuando hay fecha de fin. */
  leftCount: number | null
  left: number | null
  /** El total del plan: lo pagado más lo que queda. */
  total: number | null
  /** El total puesto a mano, si lo hay: null cuando sale de la cuenta. */
  fixedTotal: number | null
  /** La última cuota, si se ha dicho que es más corta. */
  lastInstallment: number | null
  /** La fecha de inicio puesta a mano, si la hay. */
  fixedStart: string | null
  /** Quién la cobra, de la lista de shared/lenders. */
  lender: string | null
  percent: number | null
  firstDate: string | null
  nextDate: string
  endDate: string | null
  /** Días hasta la última cuota; negativo si ya pasó. */
  daysLeft: number | null
  /** Lo que le cuesta al mes, sea cual sea su frecuencia. */
  monthlyCost: number
  /** Terminada: ya no genera cuotas. */
  settled: boolean
  settledAt: string | null
}

export interface GoalReached {
  id: number
  title: string
  /** Lo juntado, que al llegar es la meta entera. */
  total: number
  currency: string
  accountName: string
  /** Desde cuándo se estaba juntando. */
  since: string
  /** La fecha que se puso de meta, si se puso alguna. */
  targetDate: string | null
}

export interface NoteTotal {
  /** La nota tal y como se escribió; «Sin nota» cuando el movimiento no lleva ninguna. */
  note: string
  total: number
  count: number
  /** Porcentaje sobre el total de su categoría, no sobre el del periodo. */
  percent: number
}

export interface CategoryTotal {
  categoryId: number | null
  name: string
  icon: string
  color: string
  total: number
  count: number
  percent: number
  /** Desglose por nota; vacío en las categorías fijas o sin notas. */
  notes: NoteTotal[]
}

export interface MonthlyPoint {
  month: string
  income: number
  expense: number
  net: number
}


/** Totales de todo lo que encaja con un filtro, contados en la base de datos. */
export interface FilterTotals {
  income: number
  expense: number
  net: number
  /** Cuántos movimientos encajan de verdad, no cuántos se han traído. */
  count: number
  firstDate: string | null
  lastDate: string | null
}

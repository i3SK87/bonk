/**
 * El informe del periodo, en HTML, listo para imprimirse a PDF.
 *
 * Vive aparte del proceso principal y no importa nada de Electron a propósito:
 * así se puede probar la maqueta sin arrancar la aplicación, que es donde de
 * verdad se cuelan los fallos de un documento —una fila descuadrada, un total
 * que no suma, una tilde rota—.
 *
 * Se imprime desde una ventana oculta con `printToPDF`, así que esto es una
 * página web normal: las reglas de impresión mandan y los colores van a fuego,
 * que un PDF no tiene tema claro ni oscuro.
 */
import { formatMoney } from '@shared/money'
import { formatDate } from '@shared/dates'
import type { TransactionView, TxType } from '@shared/types'

const TYPE_LABEL: Record<TxType, string> = {
  refund: 'Reembolso',
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Traspaso'
}

/** Lo que va en la cabecera del documento, además de las filas. */
export interface DatosInforme {
  from: string
  to: string
  /** Divisa en la que se dan los totales. */
  currency: string
  ingresos: number
  gastos: number
  balance: number
  /** Cuándo se sacó, que un informe sin fecha de emisión no se puede archivar. */
  generado: string
}

/** Nada de lo que entra aquí es de fiar: son notas escritas por quien sea. */
export function escaparHtml(valor: string | null | undefined): string {
  if (valor == null) return ''
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * El importe de una fila con su signo, como se lee en la lista.
 *
 * Un traspaso no lleva signo: no entra ni sale dinero del patrimonio, solo
 * cambia de bolsillo, y ponerle un menos lo haría parecer un gasto.
 */
function importeDe(tx: TransactionView): string {
  const texto = formatMoney(tx.amount, tx.accountCurrency)
  if (tx.type === 'transfer') return texto
  return `${tx.type === 'expense' ? '−' : '+'}${texto}`
}

/** El destino de un traspaso, o la nota del movimiento; lo que haya. */
function detalleDe(tx: TransactionView): string {
  if (tx.type === 'transfer' && tx.toAccountName) return `→ ${tx.toAccountName}`
  return tx.note ?? ''
}

export function construirInformeHtml(filas: TransactionView[], datos: DatosInforme): string {
  const euros = (valor: number): string => formatMoney(valor, datos.currency)

  /*
   * Las filas se agrupan por día, como en la pantalla.
   *
   * Una tabla de doscientas líneas seguidas no se lee: el día es el asidero que
   * usa cualquiera para buscar un movimiento, y de paso deja ver de un vistazo
   * qué días hubo movimiento y cuáles no.
   */
  const porDia = new Map<string, TransactionView[]>()
  for (const tx of filas) {
    const lista = porDia.get(tx.date)
    if (lista) lista.push(tx)
    else porDia.set(tx.date, [tx])
  }

  const cuerpo = [...porDia.entries()]
    .map(([dia, lista]) => {
      const encabezado = `<tr class="dia"><th colspan="5">${escaparHtml(formatDate(dia))}</th></tr>`
      const celdas = lista
        .map(
          (tx) => `<tr>
        <td class="tipo">${TYPE_LABEL[tx.type]}</td>
        <td>${escaparHtml(tx.categoryName ?? '—')}</td>
        <td class="detalle">${escaparHtml(detalleDe(tx))}</td>
        <td class="cuenta">${escaparHtml(tx.accountName)}</td>
        <td class="importe ${tx.type}">${escaparHtml(importeDe(tx))}</td>
      </tr>`
        )
        .join('')
      return encabezado + celdas
    })
    .join('')

  const vacio = `<tr><td class="vacio" colspan="5">No hay ningún movimiento en este periodo.</td></tr>`

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Movimientos ${escaparHtml(formatDate(datos.from))} – ${escaparHtml(formatDate(datos.to))}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, sans-serif;
    font-size: 10pt;
    color: #14161a;
    background: #fff;
  }
  header { border-bottom: 2px solid #14161a; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { margin: 0 0 2px; font-size: 17pt; letter-spacing: -0.01em; }
  .periodo { margin: 0; color: #5b6068; font-size: 10pt; }
  .generado { margin: 3px 0 0; color: #8a9099; font-size: 8.5pt; }

  /* Los tres totales, en fila y con la misma pinta que en la pantalla. */
  .totales { display: flex; gap: 26px; margin: 0 0 18px; }
  .totales div { display: flex; flex-direction: column; gap: 1px; }
  .totales span { font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #8a9099; }
  .totales b { font-size: 13pt; font-variant-numeric: tabular-nums; }
  .ingresos b { color: #1c7a4a; }
  .gastos b { color: #b4291f; }
  .balance b.negativo { color: #b4291f; }

  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 4px 6px; vertical-align: top; }
  thead th {
    font-size: 7.5pt; letter-spacing: 0.06em; text-transform: uppercase; color: #5b6068;
    border-bottom: 1px solid #c8ccd2;
  }
  /* La cabecera de la tabla se repite en cada página: sin ella, a partir de la
     segunda hoja las columnas dejan de tener nombre. */
  thead { display: table-header-group; }
  /* Y ninguna fila se parte por la mitad entre dos páginas. */
  tr { break-inside: avoid; }
  tr.dia th {
    padding-top: 12px;
    font-size: 9pt;
    font-weight: 600;
    color: #14161a;
    border-bottom: 1px solid #e4e7eb;
  }
  tbody td { border-bottom: 1px solid #f0f2f5; }
  .tipo { color: #5b6068; width: 68px; }
  .cuenta { color: #5b6068; width: 110px; }
  .detalle { color: #5b6068; }
  .importe { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; width: 96px; }
  .importe.expense { color: #b4291f; }
  .importe.income, .importe.refund { color: #1c7a4a; }
  .vacio { padding: 24px 6px; color: #8a9099; text-align: center; }
</style>
</head>
<body>
  <header>
    <h1>Movimientos</h1>
    <p class="periodo">Del ${escaparHtml(formatDate(datos.from))} al ${escaparHtml(formatDate(datos.to))} · ${filas.length} ${filas.length === 1 ? 'movimiento' : 'movimientos'}</p>
    <p class="generado">BONK · generado el ${escaparHtml(formatDate(datos.generado))}</p>
  </header>

  <div class="totales">
    <div class="ingresos"><span>Ingresos</span><b>${escaparHtml(euros(datos.ingresos))}</b></div>
    <div class="gastos"><span>Gastos</span><b>${escaparHtml(euros(datos.gastos))}</b></div>
    <div class="balance"><span>Balance</span><b class="${datos.balance < 0 ? 'negativo' : ''}">${escaparHtml(formatMoney(datos.balance, datos.currency, { sign: true }))}</b></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Tipo</th><th>Categoría</th><th>Detalle</th><th>Cuenta</th><th class="importe">Importe</th>
      </tr>
    </thead>
    <tbody>${cuerpo || vacio}</tbody>
  </table>
</body>
</html>`
}

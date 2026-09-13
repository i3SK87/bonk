// El manual de BONK en PDF. Se escribe como una página web y lo pagina el propio
// motor de Electron. Es hermano del tutorial de CLAC: mismas hechuras.
//
//   node_modules\electron\dist\electron.exe docs\manual\construir.cjs
//
// Las capturas salen de `capturas/`, que se rehacen con arnes/capturar.mjs.
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const RAIZ = join(__dirname, '..', '..')
const version = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version
const img = (nombre) => `data:image/png;base64,${readFileSync(join(__dirname, 'capturas', `${nombre}.png`)).toString('base64')}`

/** El icono de 256 px, sacado tal cual del .ico, que ya lo lleva en PNG. */
function icono() {
  const ico = readFileSync(join(RAIZ, 'resources', 'icon.ico'))
  let mejor = null
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const o = 6 + i * 16
    const lado = ico[o] || 256
    if (!mejor || lado > mejor.lado) mejor = { lado, tam: ico.readUInt32LE(o + 8), ini: ico.readUInt32LE(o + 12) }
  }
  return `data:image/png;base64,${ico.subarray(mejor.ini, mejor.ini + mejor.tam).toString('base64')}`
}

const figura = (nombre, pie, clase = '') => `
  <figure class="${clase}">
    <img src="${img(nombre)}" alt="">
    <figcaption>${pie}</figcaption>
  </figure>`

/**
 * Un trozo de una captura: [ancho, alto] de la captura entera y [x, y, ancho,
 * alto] del trozo, en píxeles de la captura.
 */
const recorte = (nombre, [W], [x, y, w, h], pie, { ancho = '100%', clase = '' } = {}) => `
  <figure>
    <div class="recorte ${clase}" style="aspect-ratio: ${w} / ${h}; width: ${ancho}">
      <img src="${img(nombre)}" alt="" style="width: ${(W / w) * 100}%; left: -${(x / w) * 100}%; top: -${(y / h) * 100}%">
    </div>
    <figcaption>${pie}</figcaption>
  </figure>`

const k = (...teclas) => teclas.map((t) => `<kbd>${t}</kbd>`).join('<span class="mas">+</span>')

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Cómo usar BONK</title>
<style>
  @page { size: A4; margin: 17mm 18mm 20mm; }
  @page :first { margin: 0; }
  :root {
    --tinta: #14161a;
    --atenuado: #5c636e;
    --sutil: #767e8c;
    --papel: #ffffff;
    --hundido: #f2f3f7;
    --borde: #dfe2e8;
    --acento: #0b6bd3;
    --acento-suave: #e6f0fb;
    --noche: #1c1f26;
    --noche-tinta: #a8b0bd;
    --aviso: #a35a00;
    --aviso-suave: #fbf1e3;
    --mal: #c0271c;
    --mal-suave: #fbeceb;
    --ok: #157f3d;
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
    color: var(--tinta);
    font-size: 10.5pt;
    line-height: 1.55;
  }
  h1, h2, h3 { font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -0.015em; text-wrap: balance; }
  h1 { font-size: 23pt; line-height: 1.15; margin: 0 0 4mm; }
  h2 { font-size: 13.5pt; margin: 7mm 0 2mm; }
  h3 { font-size: 11pt; margin: 5mm 0 1.5mm; }
  p { margin: 0 0 2.6mm; }
  strong { font-weight: 650; }
  code, .mono { font-family: "Cascadia Mono", Consolas, monospace; font-size: 0.9em; }
  code { background: var(--hundido); padding: 0.2mm 1.2mm; border-radius: 1mm; }
  kbd {
    display: inline-block;
    font-family: "Segoe UI", system-ui, sans-serif;
    font-size: 8.5pt;
    line-height: 1.5;
    padding: 0 1.6mm;
    border: 0.25mm solid #c8ccd4;
    border-bottom-width: 0.6mm;
    border-radius: 1.2mm;
    background: #fff;
    white-space: nowrap;
  }
  .mas { color: var(--sutil); margin: 0 0.6mm; font-size: 8.5pt; }
  .dinero-mas { color: var(--ok); font-weight: 650; white-space: nowrap; }
  .dinero-menos { color: var(--mal); font-weight: 650; white-space: nowrap; }

  /* ---------- Portada ---------- */
  .portada {
    height: 297mm;
    width: 210mm;
    background: var(--noche);
    color: #fff;
    padding: 34mm 24mm 22mm;
    display: flex;
    flex-direction: column;
    page-break-after: always;
  }
  .portada img { width: 30mm; height: 30mm; border-radius: 8mm; box-shadow: 0 6mm 16mm rgba(0,0,0,.4); }
  .portada .marca { font-size: 15pt; font-weight: 700; letter-spacing: -0.02em; margin-top: 7mm; color: #fff; }
  .portada h1 { font-size: 40pt; margin: 16mm 0 5mm; color: #fff; letter-spacing: -0.03em; }
  .portada .sub { font-size: 14pt; color: var(--noche-tinta); max-width: 130mm; line-height: 1.45; }
  .portada .pie { margin-top: auto; font-size: 9pt; color: var(--noche-tinta); border-top: 0.3mm solid rgba(255,255,255,.12); padding-top: 5mm; display: flex; justify-content: space-between; gap: 10mm; }

  /* ---------- Índice ---------- */
  .indice { page-break-after: always; }
  .indice ol { list-style: none; padding: 0; margin: 4mm 0 0; counter-reset: cap; }
  .indice li { counter-increment: cap; display: grid; grid-template-columns: 10mm 1fr; gap: 0 2mm; padding: 0.8mm 0; border-bottom: 0.25mm solid var(--borde); break-inside: avoid; }
  .indice li::before { content: counter(cap); font-weight: 700; color: var(--acento); font-size: 12pt; }
  .indice li strong { display: block; font-size: 10.5pt; }
  .indice li span { color: var(--atenuado); font-size: 9.2pt; line-height: 1.4; }
  .nota-ejemplo { margin-top: 5mm; font-size: 9pt; color: var(--atenuado); }

  /* ---------- Capítulos ---------- */
  section.capitulo { margin-top: 12mm; padding-top: 8mm; border-top: 0.4mm solid var(--borde); }
  section.capitulo:first-of-type { margin-top: 0; padding-top: 0; border-top: none; }
  .cabeza { break-inside: avoid; break-after: avoid; }
  /* Una tabla entera no se parte: su capítulo empieza en página nueva para que el título no se quede solo. */
  section.capitulo.pagina-nueva { break-before: page; margin-top: 0; padding-top: 0; border-top: none; }
  h2, h3 { break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  .num {
    display: inline-grid; place-items: center;
    width: 9mm; height: 9mm; border-radius: 50%;
    background: var(--acento-suave); color: var(--acento);
    font-weight: 700; font-size: 11pt; margin-bottom: 3mm;
  }
  .entradilla { font-size: 11.5pt; color: var(--atenuado); margin-bottom: 5mm; max-width: 160mm; }

  figure { margin: 4mm 0 5mm; break-inside: avoid; }
  figure img { display: block; width: auto; max-width: 100%; max-height: 92mm; margin: 0 auto; border: 0.25mm solid var(--borde); border-radius: 2.4mm; box-shadow: 0 1mm 3mm rgba(16,24,40,.08); }
  figure.estrecha img { max-height: 72mm; }
  figcaption { font-size: 8.8pt; color: var(--sutil); margin-top: 2mm; text-align: center; }
  .pareja { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; align-items: center; break-inside: avoid; }
  .pareja figure { margin: 0; }
  .pareja figure img { max-height: 110mm; }

  /* Un trozo de una captura grande. */
  .recorte { position: relative; overflow: hidden; margin: 0 auto; border: 0.25mm solid var(--borde); border-radius: 2.4mm; box-shadow: 0 1mm 3mm rgba(16,24,40,.08); }
  .recorte img { position: absolute; border: none; border-radius: 0; box-shadow: none; max-width: none; max-height: none !important; }
  /* El widget, recortado a su tarjeta: la sombra de la captura se corta en seco
     en el borde de la ventana, así que se le pone una aquí, con su mismo radio (18 px). */
  .recorte.suelto { border: none; border-radius: 8.7% / 8.3%; box-shadow: 0 1.5mm 5mm rgba(16,24,40,.16); }

  ol.pasos { list-style: none; counter-reset: paso; padding: 0; margin: 3mm 0 4mm; }
  ol.pasos > li { counter-increment: paso; position: relative; padding: 0 0 0 10mm; margin-bottom: 3mm; min-height: 7mm; }
  ol.pasos > li::before {
    content: counter(paso); position: absolute; left: 0; top: 0;
    width: 6.5mm; height: 6.5mm; border-radius: 50%;
    background: var(--noche); color: #fff; font-size: 8.5pt; font-weight: 700;
    display: grid; place-items: center;
  }
  ul { margin: 0 0 3mm; padding-left: 5mm; }
  ul li { margin-bottom: 1.4mm; }

  .caja-nota { border-radius: 2.4mm; padding: 3.2mm 4mm; margin: 4mm 0; font-size: 10pt; break-inside: avoid; }
  .caja-nota > strong:first-child { display: block; margin-bottom: 1mm; }
  .importante { background: var(--aviso-suave); }
  .importante > strong:first-child { color: var(--aviso); }
  .truco { background: var(--acento-suave); }
  .truco > strong:first-child { color: var(--acento); }
  .peligro { background: var(--mal-suave); }
  .peligro > strong:first-child { color: var(--mal); }

  table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; font-size: 9.8pt; break-inside: avoid; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--sutil); padding: 1.8mm 2mm; border-bottom: 0.3mm solid var(--borde); }
  td { padding: 2mm; border-bottom: 0.25mm solid var(--borde); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td:first-child { white-space: nowrap; }

  .preguntas h3 { margin-top: 6mm; }

  /* El reembolso, en cuentas */
  .cuenta-reembolso { display: grid; grid-template-columns: 1fr auto; gap: 1mm 8mm; max-width: 110mm; margin: 4mm auto; padding: 3.5mm 5mm; background: var(--hundido); border-radius: 2.4mm; font-size: 10pt; break-inside: avoid; }
  .cuenta-reembolso span:nth-child(even) { text-align: right; font-variant-numeric: tabular-nums; }
  .cuenta-reembolso .total { border-top: 0.3mm solid var(--borde); padding-top: 1.5mm; font-weight: 650; }
</style>
</head>
<body>

<div class="portada">
  <img src="${icono()}" alt="">
  <div class="marca">BONK</div>
  <h1>Cómo usar BONK</h1>
  <p class="sub">Las cuentas de casa, en tu ordenador y en ningún otro sitio. Del primer movimiento a los informes, paso a paso.</p>
  <div class="pie">
    <span>Versión ${version} · septiembre de 2026</span>
    <span>De la misma casa que CLAC</span>
  </div>
</div>

<div class="indice">
  <h1>Qué hay aquí</h1>
  <ol>
    <li><div><strong>Antes de empezar</strong><span>Qué es BONK y cómo dejarla a tu medida el primer día.</span></div></li>
    <li><div><strong>Instalarla</strong><span>El aviso azul de Windows, la bandeja y cómo se actualiza.</span></div></li>
    <li><div><strong>Movimientos</strong><span>La pantalla de cada día: saldos, periodos, búsqueda y filtros.</span></div></li>
    <li><div><strong>Apuntar un movimiento</strong><span>Gastos, ingresos, traspasos y reembolsos, en una sola ficha.</span></div></li>
    <li><div><strong>El clic derecho y los reembolsos</strong><span>Corregir sin abrir la ficha, y lo que te devuelven.</span></div></li>
    <li><div><strong>Programados</strong><span>Recibos, nómina y suscripciones que se apuntan solos.</span></div></li>
    <li><div><strong>Deudas</strong><span>Compras a plazos: lo pagado, lo que falta y cuándo se acaban.</span></div></li>
    <li><div><strong>Planes de ahorro</strong><span>Metas con fecha, lo que hay que apartar y el ahorro automático.</span></div></li>
    <li><div><strong>Cuentas</strong><span>Banco, efectivo, tarjeta, hucha… y el patrimonio total.</span></div></li>
    <li><div><strong>Categorías</strong><span>En qué se va el dinero, con su icono y su color.</span></div></li>
    <li><div><strong>Informes</strong><span>El reparto del periodo, la comparación con el mes anterior y las gráficas.</span></div></li>
    <li><div><strong>El resumen del mes</strong><span>Lo que sale al abrir BONK en un mes nuevo.</span></div></li>
    <li><div><strong>La calculadora y el widget</strong><span>Cuentas de servilleta y el patrimonio en el escritorio.</span></div></li>
    <li><div><strong>Ajustes</strong><span>Avisos, bandeja, aspecto, datos y versiones nuevas.</span></div></li>
    <li><div><strong>Copias, CSV y cambiar de ordenador</strong><span>Dónde están tus datos, cómo se guardan y cómo traerte los de fuera.</span></div></li>
    <li><div><strong>Atajos y gestos</strong><span>Todos, en una tabla.</span></div></li>
    <li><div><strong>Preguntas frecuentes</strong><span>Lo que más se pregunta, con respuesta corta.</span></div></li>
  </ol>
  <p class="nota-ejemplo">Las capturas de este manual usan datos inventados (Banco Ejemplo, el viaje a Japón, la cena de cumpleaños…): no son de nadie.</p>
</div>

<!-- 1 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">1</div>
  <h1>Antes de empezar</h1>
  <p class="entradilla">BONK lleva las cuentas de casa: en qué se va el dinero, qué recibos vienen y cuánto llevas ahorrado. Todo se queda en tu ordenador.</p></div>

  <h2>Lo que BONK no hace</h2>
  <ul>
    <li><strong>No te pide cuenta ni registro</strong>, y no hay nube: los datos viven en un archivo dentro de tu equipo.</li>
    <li><strong>No se conecta a tu banco.</strong> Lo que entra y sale lo apuntas tú, o lo traes de un extracto en CSV (capítulo 15). Es a propósito: al apuntarlo, te enteras.</li>
    <li><strong>No sale a internet</strong> salvo para una cosa, que puedes apagar: mirar al abrir si hay una versión nueva (capítulo 2).</li>
  </ul>

  <h2>El primer día</h2>
  <p>BONK viene con dos cuentas (una del banco y el efectivo) y una lista de categorías de gasto e ingreso para empezar. Antes de apuntar nada:</p>
  <ol class="pasos">
    <li>Ve a <strong>Cuentas</strong> y cámbiales el nombre a las que traiga. Crea las que falten: una tarjeta, una hucha…</li>
    <li>En cada cuenta, escribe en <strong>Saldo actual</strong> el dinero que tiene hoy. A partir de ahí, BONK lo lleva al día con lo que apuntes.</li>
    <li>En <strong>Categorías</strong>, borra o archiva las que no te sirvan y crea las tuyas.</li>
    <li>En <strong>Programados</strong>, da de alta lo que se repite: la nómina, el alquiler, las suscripciones. Desde ese momento se apuntan solos.</li>
  </ol>
  <div class="caja-nota truco"><strong>El hábito que hace que funcione</strong>Apuntar cada gasto cuando lo haces, o todos juntos por la noche. Con <kbd>Ctrl</kbd><span class="mas">+</span><kbd>N</kbd> son diez segundos. Lo que se repite no hace falta apuntarlo: para eso están los programados.</div>
</section>

<!-- 2 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">2</div>
  <h1>Instalarla</h1>
  <p class="entradilla">Un instalador normal de Windows, en la página de BONK en GitHub.</p></div>
  <ol class="pasos">
    <li>En la pestaña <strong>Releases</strong> de <code>github.com/i3SK87/bonk</code>, descarga el archivo <code>BONK-${version}-Setup.exe</code> (el de arriba del todo es el más reciente) y ábrelo.</li>
    <li><strong>Windows va a protestar</strong> con una pantalla azul que dice «Windows protegió su PC». Es lo normal en programas que no han pasado por la firma de pago de Microsoft; no significa que haya nada malo. Pulsa <strong>Más información</strong> y luego <strong>Ejecutar de todas formas</strong>.</li>
    <li>Sigue el instalador. Al acabar tendrás BONK en el escritorio y en el menú Inicio.</li>
  </ol>
  <div class="caja-nota truco"><strong>Si el instalador no pasa</strong>En Releases hay también un <code>.zip</code> portátil con la misma aplicación. Descomprímelo donde quieras (por ejemplo, en <code>Documentos\\BONK</code>) y abre <code>BONK.exe</code>.</div>

  <h2>La bandeja, junto al reloj</h2>
  <p>En <strong>Ajustes ▸ General</strong> puedes pedirle a BONK que <strong>arranque con Windows</strong>, sin ventana, como un icono junto al reloj, y que <strong>al cerrar la ventana siga en la bandeja</strong>. Así las programadas se apuntan el día que tocan y los avisos del día antes te llegan aunque no la abras. Desde el icono se abre (clic o doble clic) y se sale del todo (clic derecho ▸ <strong>Salir</strong>).</p>

  <h2>Se actualiza sola</h2>
  <p>Al abrir, BONK mira en GitHub si hay una versión nueva. Si la hay, te lo dice en <strong>Ajustes ▸ Acerca de</strong> y <strong>se descarga cuando tú digas</strong>; luego, <strong>Reiniciar e instalar</strong> la cierra y la vuelve a abrir en la versión nueva. Tus datos no se tocan. Si prefieres que no salga nunca a internet, desmarca <strong>Buscar versiones nuevas</strong>: entonces puedes mirarlo a mano con <strong>Buscar ahora</strong>.</p>
  <p>Tus datos no están en la carpeta del programa sino en <code>%APPDATA%\\BONK</code>. Desinstalar BONK no los borra.</p>
</section>

<!-- 3 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">3</div>
  <h1>Movimientos</h1>
  <p class="entradilla">La pantalla con la que se abre BONK, y la de uso diario: todo lo que entra y sale de una cuenta, día a día.</p></div>
  ${figura('b01-movimientos', 'La cuenta principal, «Banco Ejemplo», este mes. El reembolso de la cena resta de lo que te costó: «te cuesta 32,00 €».')}
  <h2>Arriba: el saldo y las cuentas</h2>
  <p>A la izquierda, el <strong>saldo</strong> de la cuenta que estás mirando; a la derecha, una pastilla por cuenta con el suyo, y el <strong>total</strong> de todas. Se mira <strong>una cuenta cada vez</strong>: pulsa otra pastilla y la lista cambia a esa. Al abrir, sale la que tengas marcada como <strong>principal</strong> (capítulo 9).</p>
  <p>Si una cuenta tiene puesto un aviso de saldo bajo, aquí mismo sale una franja cuando se está quedando sin fondos.</p>
  <h2>El periodo, la búsqueda y la cinta</h2>
  <ul>
    <li><strong>Este mes</strong>, <strong>Mes pasado</strong>, <strong>Últimos 3 meses</strong>, <strong>Este año</strong>, <strong>Todo</strong> o <strong>Personalizado</strong>, con las fechas que quieras.</li>
    <li><strong>Buscar</strong> mira en títulos, categorías, cuentas y etiquetas; «reembolso» trae las devoluciones. <kbd>Esc</kbd> borra la búsqueda.</li>
    <li>Debajo, una <strong>cinta</strong> que pasa sola con las cifras del periodo: gasto medio al día, ingresos, gastos, balance y número de movimientos.</li>
  </ul>
  <h2>La lista</h2>
  <p>Los movimientos van agrupados por días, con lo que sube o baja cada día a la derecha. Cada fila lleva el icono de su categoría, el título que le pusiste y la cuenta. <strong>Pulsa una fila para abrir su ficha</strong> y cambiar lo que quieras.</p>
  <p><strong>Arrastra una fila</strong> para recolocarla: dentro de su día cambia el orden (apuntaste la cena y luego te acordaste del taxi de antes); soltada en otro día, le cambia la fecha. BONK te lo confirma con un aviso.</p>
  <h2>Filtros</h2>
  ${recorte('b04-filtros', [1100, 860], [262, 230, 802, 460], 'Filtros por tipo, por categoría y por importe. Se combinan entre sí y con la búsqueda.')}
  <p>Pulsa lo que quieras ver y se marca; vuelve a pulsarlo para quitarlo. <strong>Sin categoría</strong> saca lo que se quedó sin clasificar. <strong>Limpiar</strong> los quita todos de golpe.</p>
  <h2>El botón «Programados»</h2>
  <p>Enseña en la lista, en otro tono, lo que <strong>todavía está por llegar</strong> dentro del periodo (el alquiler del día 1, la nómina del 28…) y cómo dejaría los totales: el saldo y el balance pasan a ser <strong>previstos</strong>. Vuelve a pulsarlo para ver solo las cifras reales. Cada fila prevista tiene un botón para <strong>registrarla ya</strong>, sin esperar a su fecha.</p>
</section>

<!-- 4 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">4</div>
  <h1>Apuntar un movimiento</h1>
  <p class="entradilla">Pulsa <strong>Nuevo movimiento</strong>, o ${k('Ctrl', 'N')} desde cualquier pantalla.</p></div>
  ${figura('b02-nuevo', 'La ficha, lista para un gasto. El cursor ya está en el importe: se escribe sin pinchar en él.')}
  <h2>Qué es</h2>
  <ul>
    <li><strong>Gasto</strong> e <strong>Ingreso</strong>: lo de siempre.</li>
    <li><strong>Traspaso</strong>: dinero que pasa de una cuenta tuya a otra (sacar del cajero, pagar la tarjeta, meter en la hucha). No es gasto ni ingreso: tu patrimonio no cambia. Se eligen las dos cuentas, <strong>Desde</strong> y <strong>Hacia</strong>.</li>
    <li><strong>Reembolso</strong>: lo que te devuelven de un gasto. Tiene su propio apartado en el capítulo 5.</li>
  </ul>
  <h2>Una vez, o que se repita</h2>
  <ul>
    <li><strong>Único</strong>: un movimiento normal.</li>
    <li><strong>Cíclico</strong>: lo apunta y además lo programa para que se repita (cada mes, cada semana…). Queda en Programados.</li>
    <li><strong>Deuda a plazos</strong>: una compra a plazos, con su número de cuotas. Queda en Programados y en Deudas (capítulo 7).</li>
  </ul>
  <h2>Los campos</h2>
  <ul>
    <li><strong>Importe</strong>, siempre en positivo: el tipo ya dice si entra o sale. Para repartir un gasto, la calculadora (capítulo 13).</li>
    <li><strong>Título</strong>: el comercio o lo que quieras recordar («Mercadona», «Cena de cumpleaños»). Es lo que sale en la lista bajo la categoría.</li>
    <li><strong>Cuenta</strong> y <strong>Fecha</strong> (hoy, si no la cambias).</li>
    <li><strong>Categoría</strong>: pulsa su icono. Si no está, <strong>Nueva</strong> la crea sin salir de la ficha.</li>
    <li><strong>Facturas</strong>: aparece en las categorías que tengan marcado «Adjuntar facturas». Guarda el recibo o la foto del tique con el movimiento.</li>
  </ul>
  <p><strong>Guardar</strong> cierra la ficha. <strong>Guardar y seguir</strong> la deja abierta y vacía para el siguiente: es lo cómodo cuando vuelves del súper con cinco tiques.</p>
  <div class="caja-nota importante"><strong>Si tienes ahorro automático</strong>Al guardar un ingreso de una categoría con regla de ahorro (por ejemplo, el 10 % de la nómina), la ficha te enseña cuánto se va a apartar y a dónde. <strong>Apartar y guardar</strong> hace el traspaso a la hucha; <strong>Esta vez no</strong> guarda el ingreso sin apartar nada, solo esta vez. Se configura en Planes de ahorro (capítulo 8).</div>
</section>

<!-- 5 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">5</div>
  <h1>El clic derecho y los reembolsos</h1>
  <p class="entradilla">Casi todo en BONK tiene clic derecho: movimientos, programados, deudas, planes, categorías.</p></div>
  ${recorte('b03-menu', [1100, 760], [262, 432, 802, 330], 'Clic derecho en un gasto de la lista.')}
  <ul>
    <li><strong>Editar importe</strong> y <strong>Cambiar categoría</strong>: lo que más se corrige, sin abrir la ficha entera.</li>
    <li><strong>Registrar reembolso</strong>: abre un reembolso ya enganchado a este gasto.</li>
    <li><strong>Programar</strong>: convierte el movimiento en uno que se repite, con el ritmo que elijas. Si ya viene de una programación, sale <strong>Editar programación</strong>.</li>
    <li><strong>Eliminar</strong>: lo borra, con sus facturas. Pide confirmación.</li>
  </ul>

  <h2>Los reembolsos</h2>
  <p>Pagas una cena de 96 € y dos amigos te hacen un Bizum de 32 € cada uno. Esos 64 € <strong>no son un ingreso</strong>: no has ganado nada, es que la cena te ha costado menos. Si los apuntaras como ingreso, tus gastos en restaurantes estarían inflados y tus ingresos también.</p>
  <p>Por eso existen los reembolsos: se enganchan a su gasto, <strong>heredan su categoría</strong> y se descuentan de él.</p>
  <div class="cuenta-reembolso">
    <span>Cena de cumpleaños</span><span class="dinero-menos">−96,00 €</span>
    <span>Bizum de Laura</span><span class="dinero-mas">+32,00 €</span>
    <span>Bizum de Marcos</span><span class="dinero-mas">+32,00 €</span>
    <span class="total">Te cuesta</span><span class="total">32,00 €</span>
  </div>
  <p>Hay dos formas de apuntarlo: <strong>clic derecho en el gasto ▸ Registrar reembolso</strong>, o <strong>Nuevo movimiento ▸ Reembolso</strong> y elegir en <strong>Gasto que te devuelven</strong> de cuál es (salen los que tienen algo pendiente). En la lista, el gasto dice lo que te acaba costando, y en Informes cuenta solo eso.</p>
</section>

<!-- 6 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">6</div>
  <h1>Programados</h1>
  <p class="entradilla">Lo que se repite: la nómina, el alquiler, la luz, las suscripciones, el seguro. Se dan de alta una vez y se apuntan solos el día que toca.</p></div>
  ${figura('b05-programados', 'Ordenados por lo próximo que viene. La marca ✓ apunta uno ya; la pausa lo detiene.')}
  <h2>Dar de alta uno</h2>
  <p><strong>Nueva programación</strong>, o desde un movimiento que ya tengas: clic derecho ▸ <strong>Programar</strong>. Además de lo de cualquier movimiento, tiene:</p>
  <ul>
    <li><strong>Repetición</strong>: <strong>Una vez</strong>, <strong>Diaria</strong>, <strong>Semanal</strong>, <strong>Mensual</strong>, <strong>Semestral</strong> (la de las pagas extra), <strong>Anual</strong> u <strong>Otro</strong> («cada 3 meses», «cada 2 semanas»…).</li>
    <li><strong>Próxima fecha</strong> y, si tiene final, <strong>Termina el</strong>. Déjalo vacío si no se acaba.</li>
    <li><strong>Avisarme el día antes</strong>: una notificación de Windows con el importe y la cuenta. Hace falta tener los avisos encendidos en Ajustes y BONK abierta o en la bandeja.</li>
    <li><strong>Deuda a plazos</strong>: la hace salir también en la pestaña Deudas.</li>
  </ul>
  <div class="caja-nota importante"><strong>Cuándo se apuntan</strong>Cuando BONK está abierta o en la bandeja, el mismo día. Si la tuviste cerrada, <strong>al abrirla se ponen al día</strong> todas las que vencieron mientras tanto, aunque hayan pasado meses.</div>
  <h2>Lista y calendario</h2>
  <p>Arriba a la derecha cambias entre la <strong>Lista</strong> y el <strong>Calendario</strong>, que enseña el mes con lo que cae cada día y, arriba, cuántos movimientos quedan y el neto del mes.</p>
  ${figura('b06-calendario', 'Septiembre en el calendario: lo ya apuntado, atenuado; lo que viene, en firme.')}
  <h2>Pausar, corregir, terminar</h2>
  <ul>
    <li><strong>Pausar</strong> detiene una programación sin borrarla; <strong>Reanudar</strong> la vuelve a poner en marcha desde la fecha que digas.</li>
    <li>El clic derecho tiene <strong>Editar importe</strong> (sube Netflix), <strong>Editar fechas</strong>, <strong>Registrar reembolso</strong> y <strong>Eliminar</strong>. Al eliminar una, lo ya apuntado se queda; solo deja de repetirse.</li>
    <li>Las que llegan a su fecha de fin pasan a <strong>Finalizadas</strong>, al final de la lista.</li>
  </ul>
</section>

<!-- 7 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">7</div>
  <h1>Deudas</h1>
  <p class="entradilla">Las compras a plazos y los préstamos: cuánto te queda, cuánto pagas al mes y cuándo te lo quitas de encima.</p></div>
  ${figura('b07-deudas', 'Dos compras a plazos. Cada rayita es una cuota; en verde, las pagadas.')}
  <p>Arriba, tres cifras: <strong>Te queda por pagar</strong>, <strong>Pagas al mes</strong> y <strong>Llevas pagado</strong>. Debajo, una tarjeta por deuda con quién la cobra (Amazon, Aplázame, SeQura, Bcas, Klarna), la cuota, la fecha de la última y cuántas llevas.</p>
  <h2>Crear una</h2>
  <p><strong>Nueva deuda</strong>, o <strong>Nuevo movimiento ▸ Deuda a plazos</strong>. Pon el importe de <strong>la cuota</strong>, cada cuánto y la fecha de la última: con eso BONK cuenta las cuotas, las apunta solas y sabe cuándo se acaba. Una deuda sin fecha de fin sale en la lista, pero no cuenta en «Te queda por pagar», porque no hay forma de saber cuánto es.</p>
  <h2>Lo que puedes hacer</h2>
  <ul>
    <li><strong>Pulsar la tarjeta</strong> abre <strong>Ajustar</strong>: las cuotas que ya has pagado, si la última es distinta de las demás, y el total de la deuda cuando lleva intereses o entrada.</li>
    <li><strong>Clic derecho ▸ Pagar cuota actual</strong>: apunta la cuota de este mes ya, sin esperar al día.</li>
    <li><strong>Clic derecho ▸ Pagar todo ahora</strong>: si la liquidas de una vez. Apunta un pago con lo que falta, con fecha de hoy, y las cuotas pendientes dejan de generarse.</li>
    <li><strong>Cambiar categoría</strong> (de las cuotas que vengan) y <strong>Eliminar</strong>.</li>
  </ul>
  <p>Cuando pagas la última cuota, BONK lo celebra —es el único sitio donde se celebra algo— y la deuda pasa a <strong>Finalizadas</strong>.</p>
</section>

<!-- 8 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">8</div>
  <h1>Planes de ahorro</h1>
  <p class="entradilla">Para qué es el dinero de tus huchas: «2500 € para Japón antes de mayo», y cuánto tendrías que apartar al mes para llegar.</p></div>
  ${figura('b08-ahorro', 'Tres planes en marcha sobre la misma hucha, una regla de ahorro automático y un plan cumplido.')}
  <h2>La hucha y el ahorro libre</h2>
  <p>Los planes viven en las cuentas de tipo <strong>Ahorro</strong>. Lo que tiene la hucha se reparte entre sus planes, y lo que no está asignado a ninguno es el <strong>Ahorro libre</strong>, la cifra grande de arriba. Si tienes varias huchas, pulsa cada una para ver sus planes.</p>
  <h2>Un plan</h2>
  <p><strong>Nuevo plan</strong>: un título, cuánto, para cuándo (opcional), un icono y un color. Cada plan enseña lo que lleva, lo que falta y, si tiene fecha, <strong>cuánto tendrías que apartar al mes</strong> para llegar a tiempo.</p>
  <ul>
    <li>La barra es también un mando: <strong>arrastra el punto</strong> para asignarle más o menos de la hucha. O clic derecho ▸ <strong>Editar ahorro</strong> para escribir la cifra.</li>
    <li>El color de la barra avisa: la del plan si vas bien, <strong>ámbar</strong> si vas por detrás del ritmo, <strong>rojo</strong> si la fecha ya pasó y <strong>verde</strong> cuando está completo.</li>
    <li>Pulsa el plan para cambiarle el nombre, la meta o la fecha.</li>
  </ul>
  <h2>Cuando llegas</h2>
  <p>Al completar un plan sale una celebración y, en su fila, un botón para <strong>archivarlo</strong>. Archivar es comprarlo: BONK apunta, con fecha de hoy, un <strong>traspaso</strong> de la hucha a la cuenta desde la que pagas y la <strong>compra</strong> en esa cuenta, con la categoría que elijas. El plan pasa a <strong>Cumplidos</strong>; si te equivocaste, el botón de su fila lo vuelve a poner en marcha.</p>
  <h2>Ahorro automático</h2>
  <p>Una regla por categoría de ingreso: <strong>de cada ingreso de esa categoría, aparta un porcentaje o una cantidad fija</strong> y lo traspasa a la hucha que digas, a un plan concreto o como ahorro libre. <strong>Nuevo ahorro auto.</strong> la crea; arriba ves cuánto apartas al año con todas las reglas juntas. Cada vez que apuntes ese ingreso, la ficha te preguntará (capítulo 4).</p>
</section>

<!-- 9 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">9</div>
  <h1>Cuentas</h1>
  <p class="entradilla">Todos los sitios donde tienes dinero, agrupados por tipo, y abajo el patrimonio total.</p></div>
  ${figura('b09-cuentas', 'Cuatro cuentas. La tarjeta en negativo es lo que se ha gastado con ella y todavía no se ha pagado desde el banco.', 'estrecha')}
  <p>Tipos: <strong>Efectivo</strong>, <strong>Cuenta bancaria</strong>, <strong>Tarjeta</strong>, <strong>Ahorro</strong> (las que tienen planes), <strong>Inversión</strong> y <strong>Deuda o préstamo</strong>. Pulsa una para editarla:</p>
  <ul>
    <li><strong>Saldo actual</strong>: si no cuadra con el del banco, escribe el de verdad y BONK ajusta el saldo inicial para que salga.</li>
    <li><strong>Avisarme si baja de</strong>: una cifra por debajo de la cual te avisa en Movimientos. En cero no avisa nunca.</li>
    <li><strong>Usar como cuenta principal</strong>: la que sale elegida al abrir Movimientos. Solo puede haber una.</li>
    <li><strong>Excluir del patrimonio total</strong>: para dinero que tienes pero no es tuyo (un bote común, lo de un familiar).</li>
    <li><strong>Archivar la cuenta</strong>: deja de salir en los desplegables, pero conserva su historia. Las archivadas se ven con <strong>Ver cuentas archivadas</strong>.</li>
  </ul>
  <div class="caja-nota peligro"><strong>Eliminar no es archivar</strong>Eliminar una cuenta borra todos sus movimientos. Los traspasos con otras cuentas se conservan como gasto o ingreso en la otra, para que su saldo no cambie. Si solo quieres dejar de verla, archívala.</div>
</section>

<!-- 10 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">10</div>
  <h1>Categorías</h1>
  <p class="entradilla">En qué se va el dinero y de dónde viene. Dos pestañas: <strong>Gastos</strong> e <strong>Ingresos</strong>.</p></div>
  ${figura('b10-categorias', 'Las categorías de gasto que trae BONK. Todas se pueden cambiar.', 'estrecha')}
  <p><strong>Nueva categoría</strong>, o pulsa una para editarla:</p>
  <ul>
    <li><strong>Icono</strong>: más de cien, en nueve familias (dinero, casa, comida, transporte…). Escribe en el buscador para encontrar el que quieres.</li>
    <li><strong>Color</strong>: el del cuadrado del icono, y el de su barra en los informes.</li>
    <li><strong>Adjuntar facturas</strong>: sus movimientos llevan un hueco para guardar el recibo.</li>
    <li><strong>Desglose en la pestaña Informes</strong>: en Informes, la categoría se despliega por el título de cada movimiento («Alimentación» se abre en Mercadona, Lidl, la frutería…).</li>
    <li><strong>Archivar la categoría</strong>: deja de salir al crear movimientos, pero lo ya apuntado la conserva.</li>
  </ul>
  <p>Al eliminar una categoría, sus movimientos pasan a <strong>Sin categoría</strong>. Si quieres conservar el histórico ordenado, mejor archivarla.</p>
</section>

<!-- 11 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">11</div>
  <h1>Informes</h1>
  <p class="entradilla">En qué se ha ido el dinero, comparado con el periodo anterior, y cómo va mes a mes.</p></div>
  ${figura('b11-informes', 'Los gastos de este mes en Banco Ejemplo, frente a agosto.')}
  <h2>Qué estás mirando</h2>
  <p>Como en Movimientos, <strong>una cuenta cada vez</strong> y el periodo de arriba. Los traspasos cuentan como salidas o entradas de esa cuenta, en gris, porque para ella sí es dinero que se va o que llega. <strong>Descargar PDF</strong> guarda el informe que ves.</p>
  <p>La cinta de cifras (gasto total, movimientos, media diaria…) lleva al lado cuánto ha cambiado respecto al periodo anterior.</p>
  <h2>Reparto del periodo</h2>
  <ul>
    <li><strong>Gastos</strong> o <strong>Ingresos</strong>, a la derecha; en <strong>%</strong> o en <strong>€</strong>, en el centro.</li>
    <li><strong>frente a</strong>: el mes con el que se compara. La columna <strong>Balance</strong> dice si esa categoría ha subido (▲, en rojo si es gasto) o bajado (▼) respecto a él.</li>
    <li>Las categorías con desglose llevan una flecha: <strong>púlsala</strong> y se abren por el título de cada movimiento.</li>
    <li>Clic derecho en una fila ▸ <strong>Cambiar categoría</strong>, para recolocar de golpe lo que estaba mal clasificado.</li>
  </ul>
  <h2>Las gráficas</h2>
  ${recorte('b12-informes-grafica', [1100, 1000], [262, 592, 802, 364], 'Un año de ingresos y gastos, y lo que sube o baja la cuenta cada mes. Este mes aún no ha entrado la nómina.')}
</section>

<!-- 12 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">12</div>
  <h1>El resumen del mes</h1>
  <p class="entradilla">La primera vez que abres BONK en un mes nuevo, te cuenta cómo fue el anterior.</p></div>
  ${figura('b16-resumen', 'Agosto, en resumen: las cinco categorías que más gastaron y las que más ingresaron.')}
  <p>Gastos e ingresos del mes, con cuánto han cambiado respecto al anterior, el <strong>balance</strong> y lo que te queda de <strong>deuda</strong>. Sale una sola vez por mes; <strong>Continuar</strong> lo cierra. Si el mes no tuvo ningún movimiento, no sale.</p>
</section>

<!-- 13 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">13</div>
  <h1>La calculadora y el widget</h1>
  <p class="entradilla">Dos ayudas pequeñas: una para echar cuentas y otra para ver tu dinero sin abrir BONK.</p></div>
  <h2>La calculadora</h2>
  <div class="pareja">
    ${recorte('b15-calculadora', [1100, 760], [381, 157, 340, 448], 'Flotante: se arrastra y deja usar lo de detrás.', { ancho: '78%' })}
    <div>
      <p>En la barra lateral, <strong>Calculadora</strong>. Nació para los reembolsos, que casi siempre son una división: la cena entre tres, la mitad del alquiler.</p>
      <p>Escribe la cuenta (<code>33,99/4</code>) y pulsa <kbd>Intro</kbd>: el resultado se queda escrito para <strong>seguir encadenando</strong>. El botón de la derecha lo copia, para pegarlo en el importe.</p>
      <p>Da el resultado entero, sin redondear: repartir entre tres da 8,4975 y esa es la cifra. Redondear es cosa tuya.</p>
    </div>
  </div>
  <h2>El widget del escritorio</h2>
  <div class="pareja">
    <div>
      <p>Una tarjeta con el <strong>patrimonio</strong> y el saldo de tus cuentas, sobre el escritorio. Se enciende en <strong>Ajustes ▸ Widget del escritorio ▸ Enseñarlo en el escritorio</strong>.</p>
      <p>Se <strong>arrastra</strong> para colocarlo y con <strong>doble clic</strong> abre BONK. En Ajustes eliges en qué esquina se planta, la opacidad, si va en escala de grises, si se queda por delante de las ventanas y qué cuentas enseña.</p>
    </div>
    ${recorte('b17-widget', [381, 331], [10, 10, 207, 218], 'El widget, con todas las cuentas.', { ancho: '62%', clase: 'suelto' })}
  </div>
</section>

<!-- 14 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">14</div>
  <h1>Ajustes</h1>
  <p class="entradilla">Cinco tarjetas: General, Apariencia, Widget del escritorio, Datos y Acerca de.</p></div>
  ${figura('b13-ajustes', 'General y Apariencia.')}
  <h2>General</h2>
  <ul>
    <li><strong>Primer día de la semana</strong>: lunes o domingo, para el calendario.</li>
    <li><strong>Arrancar con Windows, en la bandeja</strong> y <strong>Al cerrar la ventana, seguir en la bandeja</strong> (capítulo 2).</li>
    <li><strong>Avisarme el día antes de cada movimiento programado</strong>. <strong>Probar el aviso</strong> manda uno de prueba; si no llega, mira el permiso en Windows ▸ Sistema ▸ Notificaciones y el asistente de concentración.</li>
  </ul>
  <h2>Apariencia</h2>
  <p><strong>Claro</strong>, <strong>Oscuro</strong> o <strong>Según Windows</strong>, y nueve paletas de color, cada una en claro y en oscuro. El verde y el rojo del dinero no cambian con la paleta: significan algo.</p>
  ${recorte('b14-ajustes-datos', [1100, 1000], [262, 422, 802, 534], 'Datos y Acerca de.')}
  <h2>Datos</h2>
  <ul>
    <li><strong>Importar CSV</strong>: traer movimientos de un extracto (capítulo 15).</li>
    <li><strong>Exportar todo a PDF</strong>: todos tus movimientos, en un documento.</li>
    <li><strong>Copia de seguridad</strong>: una copia ahora mismo. <strong>Abrir carpeta de datos</strong> te lleva a donde están.</li>
    <li><strong>Vaciar movimientos</strong>: borra todos los movimientos y conserva cuentas, categorías y planes. No se puede deshacer, salvo tirando de una copia.</li>
  </ul>
  <h2>Acerca de</h2>
  <p>La versión que tienes y el interruptor de <strong>Buscar versiones nuevas</strong>, con <strong>Buscar ahora</strong> para mirarlo en el momento.</p>
</section>

<!-- 15 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">15</div>
  <h1>Copias, CSV y cambiar de ordenador</h1>
  <p class="entradilla">Todo BONK es un archivo, <code>bonk.db</code>, en <code>%APPDATA%\\BONK</code>.</p></div>
  <h2>Copias automáticas</h2>
  <p>Cada día, al cerrar BONK, se guarda una copia en la carpeta <code>backups</code>, al lado, y se conservan las <strong>diez últimas</strong>. También puedes hacer una cuando quieras: <strong>Ajustes ▸ Datos ▸ Copia de seguridad</strong>, o <strong>Archivo ▸ Copia de seguridad ahora</strong>.</p>
  <div class="caja-nota importante"><strong>Una copia en el mismo disco no es una copia</strong>Si el ordenador se rompe, las copias se van con él. De vez en cuando, copia la carpeta <code>%APPDATA%\\BONK</code> a una memoria USB o a otro disco.</div>
  <h2>Volver a una copia</h2>
  <ol class="pasos">
    <li>Cierra BONK del todo (clic derecho en el icono de la bandeja ▸ <strong>Salir</strong>).</li>
    <li>Abre <code>%APPDATA%\\BONK</code> y aparta el <code>bonk.db</code> actual (cámbiale el nombre, no lo borres).</li>
    <li>Copia la copia que quieras desde <code>backups</code> a esa carpeta y llámala <code>bonk.db</code>.</li>
    <li>Abre BONK.</li>
  </ol>
  <h2>Llevarte BONK a otro ordenador</h2>
  <p>Instala BONK en el ordenador nuevo, ábrela una vez y ciérrala del todo. Luego copia encima la carpeta <code>%APPDATA%\\BONK</code> del antiguo, entera. Al abrir, estará todo como lo dejaste.</p>
  <h2>Traer movimientos en CSV</h2>
  <p>Casi todos los bancos dejan descargar los movimientos en CSV o Excel (guardado como CSV). En <strong>Movimientos ▸ Importar CSV</strong> o <strong>Ajustes ▸ Datos ▸ Importar CSV</strong>:</p>
  <ul>
    <li>BONK reconoce columnas llamadas <strong>Fecha</strong>, <strong>Tipo</strong>, <strong>Cuenta</strong>, <strong>Categoría</strong>, <strong>Importe</strong>, <strong>Notas</strong> y <strong>Lugar</strong>, en español o en inglés, y también las cabeceras que usa la aplicación de Apple.</li>
    <li><strong>Crear cuentas y categorías que no existan</strong>: si lo desmarcas, las filas con una cuenta o categoría desconocida se descartan.</li>
    <li><strong>No duplica</strong>: lo que ya estaba apuntado se salta, salvo que marques <strong>Importar lo que ya esté apuntado</strong> (normalmente no: reimportar un extracto duplicaría el mes).</li>
  </ul>
  <p>Al terminar te dice cuántos ha importado, cuántos se ha saltado, qué cuentas y categorías ha creado y qué filas han dado problemas.</p>
</section>

<!-- 16 -->
<section class="capitulo">
  <div class="cabeza"><div class="num">16</div>
  <h1>Atajos y gestos</h1></div>
  <table>
    <tr><th>Dónde</th><th>Atajo o gesto</th><th>Qué hace</th></tr>
    <tr><td>Cualquier pantalla</td><td>${k('Ctrl', 'N')}</td><td>Nuevo movimiento</td></tr>
    <tr><td>Cualquier pantalla</td><td>${k('Ctrl', '+')} · ${k('Ctrl', '−')} · ${k('Ctrl', '0')}</td><td>Acercar · alejar · tamaño normal</td></tr>
    <tr><td>Cualquier pantalla</td><td><kbd>F11</kbd></td><td>Pantalla completa</td></tr>
    <tr><td>Casi cualquier fila</td><td>Clic derecho</td><td>Su menú: editar importe, cambiar categoría, eliminar…</td></tr>
    <tr><td>Movimientos</td><td>Pulsar una fila</td><td>Abre su ficha para editarla</td></tr>
    <tr><td>Movimientos</td><td>Arrastrar una fila</td><td>Cambia el orden dentro del día, o la fecha si la sueltas en otro</td></tr>
    <tr><td>Movimientos</td><td>Pulsar una cuenta</td><td>Ver solo esa cuenta</td></tr>
    <tr><td>Búsquedas</td><td><kbd>Esc</kbd></td><td>Borra lo escrito</td></tr>
    <tr><td>Menús</td><td><kbd>↑</kbd> <kbd>↓</kbd> · <kbd>Esc</kbd></td><td>Moverse por el menú · cerrarlo</td></tr>
    <tr><td>Planes de ahorro</td><td>Arrastrar el punto de la barra</td><td>Asigna más o menos de la hucha (también con las flechas)</td></tr>
    <tr><td>Calculadora</td><td><kbd>Intro</kbd> o <kbd>=</kbd></td><td>Resuelve la cuenta y la deja para seguir</td></tr>
    <tr><td>Widget</td><td>Arrastrar · doble clic</td><td>Colocarlo · abrir BONK</td></tr>
    <tr><td>Bandeja</td><td>Clic · clic derecho</td><td>Abrir BONK · Salir</td></tr>
  </table>
</section>

<!-- 17 -->
<section class="capitulo preguntas pagina-nueva">
  <div class="num">17</div>
  <h1>Preguntas frecuentes</h1>
  <h3>El saldo de BONK no cuadra con el del banco.</h3>
  <p>Falta algo por apuntar, o sobra algo. Si no lo encuentras, edita la cuenta y escribe en <strong>Saldo actual</strong> el del banco: BONK ajusta el saldo inicial para que cuadre.</p>
  <h3>¿Cómo apunto que he sacado dinero del cajero?</h3>
  <p>Como un <strong>traspaso</strong> del banco al efectivo. No es un gasto: el gasto será lo que pagues luego con ese dinero.</p>
  <h3>¿Y el pago de la tarjeta de crédito?</h3>
  <p>Cada compra con la tarjeta, como gasto en la cuenta «Tarjeta». Cuando el banco la cobra, un traspaso del banco a la tarjeta. Así cada compra está en su categoría y no cuentas el gasto dos veces.</p>
  <h3>Un programado no se ha apuntado.</h3>
  <p>Se apuntan con BONK abierta o en la bandeja; si estaba cerrada, se apuntan al abrirla. Si aun así falta, mira en Programados que no esté en pausa ni finalizada.</p>
  <h3>No me llegan los avisos del día antes.</h3>
  <p>Mira que estén encendidos en <strong>Ajustes ▸ General</strong>, que BONK esté abierta o en la bandeja, y usa <strong>Probar el aviso</strong>. Si el de prueba tampoco llega, el permiso está apagado en Windows ▸ Sistema ▸ Notificaciones, o el asistente de concentración lo está silenciando.</p>
  <h3>¿Se conecta a internet?</h3>
  <p>Solo para mirar si hay una versión nueva, al abrir. Si desmarcas <strong>Buscar versiones nuevas</strong> en Ajustes, no se conecta a nada.</p>
  <h3>He borrado algo sin querer.</h3>
  <p>Vuelve a la copia del día anterior (capítulo 15). Ten en cuenta que perderás lo que apuntaste después de esa copia.</p>
  <h3>¿Qué pasa si desinstalo BONK?</h3>
  <p>Tus datos se quedan en <code>%APPDATA%\\BONK</code>. Si vuelves a instalarla, aparecen tal cual.</p>
</section>

</body>
</html>`

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  // Con las capturas dentro pasa de los 2 MB que admite una URL data:, así que va por archivo.
  const carpeta = mkdtempSync(join(tmpdir(), 'bonk-manual-'))
  const pagina = join(carpeta, 'manual.html')
  writeFileSync(pagina, html)
  await w.loadFile(pagina)
  const pdf = await w.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  })
  const destino = join(__dirname, 'Manual de BONK.pdf')
  writeFileSync(destino, pdf)
  console.log(`${destino} (${Math.round(pdf.length / 1024)} KB)`)
  rmSync(carpeta, { recursive: true, force: true })
  app.quit()
})

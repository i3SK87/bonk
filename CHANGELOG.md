# Historial de cambios

Lo que ha ido entrando en cada versión de BONK, de lo más reciente a lo más
antiguo. Para instalarla y usarla, mira el [README](README.md).

## Novedades de la 1.10.5

- **Las programaciones ya no tienen nombre, solo notas**, igual que los
  movimientos. Eran dos campos para lo mismo. La nota es lo que se lee en la
  lista y lo que llevará cada movimiento que genere.
- Las que ya tenían nombre no lo pierden: al abrir su ficha, el nombre aparece
  en la nota, que es justo lo que la lista enseñaba.

## Novedades de la 1.10.4

- **«Gasto que te devuelven» pasa detrás de la categoría**, en el formulario de
  reembolso. Salía delante, pidiendo elegir un gasto de una categoría que
  todavía no se había elegido: el desplegable estaba siempre vacío la primera
  vez que se miraba.
- Y deja de hablar de fechas. Ahora dice lo que hace falta según el momento:
  «elige antes la categoría» si no hay ninguna, «ningún gasto de esta categoría
  tiene nada pendiente de devolver» si la hay pero está saldada, y qué gana uno
  enlazando cuando sí hay de dónde elegir.

## Novedades de la 1.10.3

- **La calculadora ya no redondea.** Repartir 33,99 entre cuatro da 8,4975, y
  esa es la cifra; redondear es decisión de quien lo apunte. Antes enseñaba
  8,50 en grande y el valor exacto en pequeño debajo: ahora sobra esa segunda
  línea, y lo que se copia es el resultado entero.
- Sigue habiendo un tope de diez decimales, que no es un redondeo sino la
  basura de la coma flotante: sin él, 0,1 + 0,2 se enseñaría como
  0,30000000000000004.
- **Fuera la última llamada a internet del código.** `refreshRates` descargaba
  tipos de cambio de un servicio externo. No estaba conectada a nada —ni
  manejador IPC, ni puente, ni interfaz—, así que la aplicación ya no salía a
  internet en la práctica, pero era un `fetch` vivo dentro de un programa que
  promete lo contrario. Ahora no queda ninguna.

## Novedades de la 1.10.2

- Fuera el «se registra solo» de los avisos: era decir lo que ya se da por
  hecho. «Lo registras tú» se queda, que ese sí avisa de algo que hacer.

## Novedades de la 1.10.1

- **Las programadas vencidas se registran sin reiniciar.** Se generaban solo al
  arrancar, que valía cuando abrir BONK era el gesto de cada día; desde que vive
  en la bandeja puede pasar semanas sin reiniciarse, y una cuota que vencía hoy
  se quedaba sin registrar aunque su aviso del día antes sí hubiera llegado.
  Ahora el repaso va en el mismo ciclo de media hora que los avisos.
- Si el repaso crea algo con la ventana abierta, la lista se recarga sola: antes
  se habría quedado enseñando lo de ayer.
- **Una programada que no puede entrar ya lo dice.** Si el cargo dejaría en
  negativo una cuenta que no lo admite, el registro falla y hasta ahora se
  quedaba en la consola: nadie se enteraba de que el recibo no había entrado.
  Ahora sale como aviso en la ventana, y una sola vez, no en cada vuelta del
  repaso.

## Novedades de la 1.10.0

- **El aviso lleva el icono de su categoría**, el mismo cuadrado de color con el
  símbolo en blanco que se ve en las listas. Los iconos son SVG que solo existen
  dentro de la interfaz, así que los dibuja la ventana en un lienzo y le pasa los
  PNG al proceso principal, que es quien manda el aviso: ahí no hay con qué
  rasterizar. El primer repaso de avisos espera seis segundos por eso, a que la
  ventana los haya mandado.
- **Ya no dice «Electron» en la cabecera.** El motor planta un `Electron.lnk` en
  el menú Inicio con nuestro mismo AppUserModelID justo al mandar el aviso, y
  como es el acceso directo más reciente, gana él. Ahora se retira después de
  avisar —antes no vale, lo vuelve a crear— y también al arrancar, así que para
  cuando se mira el centro de notificaciones solo queda `BONK.lnk`.
- **Se vuelve a arrancar desde el motor de Electron**, no desde el `BONK.exe`
  instalado. Probé la ruta directa porque el Control inteligente había dejado
  pasar una compilación, pero decide por reputación y cada compilación es un
  binario nuevo sin ninguna: la siguiente ya la bloqueó. El motor siempre pasa.
- La calculadora se va al extremo derecho de la barra, detrás de los tres
  puntos, con su raya vertical y al tamaño de los demás botones.

## Novedades de la 1.9.0

- **Los avisos ya salen como BONK**, con el icono de la aplicación, en vez de
  como «Electron» con su átomo. La cabecera de una notificación en Windows no la
  pone la aplicación: Windows busca en el menú Inicio un acceso directo cuyo
  AppUserModelID coincida con el que ella declara, y de ahí saca el nombre y el
  icono. No había ninguno con ese identificador, pero sí un `Electron.lnk` suelto
  apuntando al motor, y era eso lo que Windows encontraba.
- `npm run deploy` rehace ahora los dos accesos directos —escritorio y menú
  Inicio— con su AppUserModelID grabado, y retira el `Electron.lnk` intruso. La
  propiedad se escribe con IPropertyStore desde `scripts/shortcut.ps1`, porque no
  hay manera de tocarla sin bajar a COM.
- Se probó a arrancar desde `BONK.exe`, que el Control inteligente había dejado
  pasar, pero duró una compilación: ver la 1.10.0.
- La clave del registro `AppUserModelId` que se probó primero queda retirada: con
  ella puesta la cabecera seguía diciendo «Electron», así que no era el camino.
- **La calculadora pasa a la derecha de Filtros**, separada por una raya
  vertical, a tamaño normal y con su nombre escrito. Como icono suelto entre el
  buscador y los filtros parecía uno más de los que filtran.

## Novedades de la 1.8.0

- **Aviso el día antes de cada movimiento programado**, como notificación de
  Windows con el importe, la cuenta y si se registra solo o lo registras tú.
  Se enciende en Ajustes ▸ General y cada programación se puede callar por
  separado desde su ficha.
- Las programaciones tienen fecha pero no hora, así que «24 horas antes» es «el
  día de antes»: el aviso sale en cuanto BONK ve que algo vence mañana, y luego
  se comprueba cada media hora mientras siga viva. Por eso el arranque en la
  bandeja de la versión anterior y esto son la misma función partida en dos.
- La fecha ya avisada se guarda en la propia programación, así que abrir y
  cerrar la aplicación cinco veces en la misma tarde no trae cinco avisos.
  Cuando la programación salta al mes siguiente, vuelve a avisar.
- Cuando vencen más de tres el mismo día —el día 1 de cada mes— llega un solo
  aviso con el recuento en vez de seis seguidos.
- Botón «Probar el aviso» en Ajustes: si Windows los tiene bloqueados, mejor
  descubrirlo ahí que el día que venza el alquiler.

## Novedades de la 1.7.0

- **Arranca con Windows y se queda en la bandeja.** Dos casillas nuevas en
  Ajustes ▸ General. La primera da de alta BONK en el inicio de sesión, y lo
  hace con `--hidden`: no abre ventana, aparece como icono junto al reloj. Con
  eso las programadas vencidas se registran solas aunque no entres a mirar. La
  segunda hace que el aspa esconda la ventana en vez de cerrar la aplicación;
  para salir de verdad, «Salir» en el menú del icono.
- El icono de la bandeja está siempre, se haya pedido o no el arranque
  automático: es la única manera de recuperar la ventana cuando la aplicación
  ha arrancado escondida.
- La entrada del registro se reescribe en cada arranque, así que si la carpeta
  del proyecto se mueve, el inicio automático se corrige solo. Apunta al motor
  de Electron con la carpeta del proyecto, que es como se lanza BONK en este
  equipo desde que el Control inteligente de aplicaciones bloquea su .exe.

## Novedades de la 1.6.0

- **Mini-calculadora en Movimientos.** El botón de la calculadora, junto al
  buscador, abre un panel donde se teclea la operación —«33,99/4» para repartir
  una suscripción entre cuatro— y el resultado sale al momento, sin pulsar
  ningún igual. Tiene teclado propio, acepta paréntesis y porcentajes, y copia
  el resultado ya redondeado a dos decimales para pegarlo en el importe. Cuando
  el reparto no es exacto enseña además el valor sin redondear, que es lo que
  hace falta para saber quién se come el céntimo. Evalúa sin `eval`, con su
  propio analizador: la política de seguridad de la ventana no deja ejecutar
  cadenas.

## Novedades de la 1.5.1

- **Crear una categoría sin salir del movimiento.** La rejilla de categorías
  del formulario termina en una casilla «Nueva» que abre la misma ficha que
  Categorías; al guardarla queda elegida en el movimiento que estabas
  escribiendo. Antes había que abandonar el gasto a medio hacer.
- **Eliminar, en rojo** en las cinco fichas —movimiento, categoría, cuenta,
  hito y programación—. Ya no se confunde con Cancelar. Va sin relleno: es la
  salida del formulario, no la acción que se busca al abrirlo.
- **Sin rayas entre filas** en Programados y en el reparto por categorías. Las
  barras de color y el aire ya marcaban dónde acaba cada fila, y la retícula
  de líneas pesaba más que los datos.
- El patrimonio total de Cuentas va en negrita, que es la cifra que cierra la
  lista.
- «Acerca de» ya no enseña la ruta de la base de datos: para llegar a ella está
  el botón de abrir la carpeta de datos, ahí al lado.

## Novedades de la 1.4.3

- En Programados, los reembolsos llevan su etiqueta «Reembolso» en la línea de
  debajo, delante de la frecuencia y la cuenta, que es donde se describe qué es
  cada programación. Antes solo se distinguían por el signo del
  importe, y los que no cuelgan de un gasto programado no se distinguían.

## Novedades de la 1.4.0

- **Apartado «Finalizadas» en Programados.** Las que ya no pueden volver por su
  cuenta —apagadas y con la fecha de fin cumplida, sea porque se saldó la deuda
  o porque se agotó el plazo— salen abajo, en gris, con la fecha en que
  terminaron. Al pasar el ratón recuperan el color. Las pausadas siguen en la
  lista principal, que esas sí esperan a que las reanudes.
- **Los tres iconos de la marca son ahora el mismo archivo.** El de la barra
  lateral era una imitación en CSS; ahora carga el mismo `.ico` que la ventana
  y la barra de tareas. La contrapartida: ya no cambia de color con la paleta,
  porque es un logo.
- **La ventana declara su propio icono.** Sin eso heredaba el del ejecutable que
  la lanza, y al arrancar con el motor de Electron salía su átomo.

## Novedades de la 1.3.0

- **Las cuotas de deuda se finalizan, no se pausan.** Si saldas una deuda
  antes de tiempo, esas cuotas ya no van a existir: el botón las cierra con
  fecha de fin de hoy, así que no se proyectan ni reviven. Pausar sigue siendo
  lo que hacen las demás. Lo decide una casilla de la categoría, «Es una deuda
  a plazos», puesta en Deuda al actualizar.
- **La lista de programados enseña la categoría** de cada uno, que antes había
  que abrir la ficha para verla.
- El rótulo de la tarjeta decía «Programadas» dentro de «Movimientos
  programados».
- **Fuera la tipografía redondeada**, con su ajuste y su variable.

## Novedades de la 1.2.0

**Ajustes tiene un apartado Apariencia con cinco paletas**: Grafito, Índigo,
Marea, Sepia y Ciruela. Cada una con su versión clara y su versión oscura, y
con una muestra en el selector que enseña fondo, tarjeta y acento.

- **El verde y el rojo del dinero no cambian con la paleta.** Son significado,
  no decoración: un gasto tiene que verse igual de rojo en las cinco.
- Una paleta solo redefine doce tonos —acento, fondos, textos, bordes y barra
  lateral—; el resto se recalcula solo, porque ahora está expresado en función
  de ellos en vez de a mano.
- **Todas las combinaciones de texto están medidas**, no elegidas a ojo: 7:1 el
  texto principal, 4,5:1 el atenuado, los importes y el blanco sobre el botón
  de acento, 3:1 el texto sutil. De paso se arreglan cuatro casos del tema
  claro anterior que no llegaban, entre ellos el verde de los ingresos (3,5:1)
  y el blanco sobre el botón azul (3,65:1).
- El botón principal usa un acento un punto más oscuro que el del texto: es el
  que tiene que sostener el blanco encima.

## Novedades de la 1.1.0

- **La factura se sube al crear el movimiento**, no después. Antes había que
  guardar, volver a abrir el movimiento y adjuntarla: el botón necesitaba un
  id que todavía no existía. Ahora se elige el archivo mientras se rellena el
  formulario —sale marcado con borde punteado, porque aún no está guardado— y
  se copia en cuanto el movimiento existe.
- Elegir y adjuntar son ya dos pasos separados en el proceso principal, que es
  lo que permite lo anterior.
- Cancelar el formulario ya no deja facturas sueltas: solo se copian al
  guardar.

## Novedades de la 1.0.0

- **La aplicación se llama BONK.** Cambia el nombre en la ventana, en la barra
  lateral, en el menú de inicio, en el instalador y en Ajustes.
- **Los datos se mudan solos.** La carpeta de datos la nombra la propia
  aplicación, así que con el nombre nuevo (`%APPDATA%\BONK`) se habría abierto
  vacía. Al arrancar por primera vez, si la carpeta nueva está sin estrenar y
  la vieja tiene una base, se copia entera: base, adjuntos y copias de
  seguridad. Se copia y no se mueve, así que `%APPDATA%\Money Flow` se queda
  como red de seguridad; se puede borrar a mano cuando compruebes que todo
  está en su sitio.
- La pestaña «Programadas» pasa a «Programados», y su título a «Movimientos
  programados».
- El icono de la lupa se centra con la altura del campo en vez de con un
  desplazamiento fijo.

## Novedades de la 0.28.0

- **Fuera la hora.** El formulario ya no la pide. La que traigan los
  movimientos importados se conserva y se sigue exportando al CSV.
- **Los adjuntos pasan a llamarse facturas y solo salen donde hacen falta.**
  Guardar el papel tiene sentido en una compra con garantía; en el café de
  esta mañana, no. Lo decide una casilla de cada categoría, «Guardar facturas
  en sus movimientos», que arranca puesta en Compras y apagada en el resto.
  Va por categoría y no por nombre fijo para que renombrarla no lo rompa.

## Novedades de la 0.27.0

- El botón «Nuevo movimiento» solo sale en Movimientos. Ctrl+N sigue creando
  uno desde cualquier pestaña.
- El interruptor «Previstos» pasa a llamarse «Programados».

## Novedades de la 0.26.0

**Presupuestos se va; llega Ahorro.** En vez de un tope de gasto por categoría,
hitos: lo que quieres juntar, para cuándo, y cuánto llevas.

- Cada hito trae su barra, lo que falta, los días que quedan y **cuánto
  tendrías que apartar al mes** para llegar. Debajo, el ritmo real: lo que ha
  entrado en esa cuenta en los últimos tres meses, al mes. Si el ritmo no da
  para el objetivo, lo dice.
- **Con varios hitos sobre la misma hucha, el saldo se reparte por orden de
  fecha**: el que antes vence se lleva el dinero primero. Si cada hito enseñara
  el saldo entero, tres hitos sumarían tres veces el mismo dinero.
- Al llegar al 100 % se puede **dar por cumplido**: pasa a la lista de
  cumplidos y deja de repartir saldo, porque ese dinero ya está comprometido
  aunque siga en la cuenta hasta que se gaste.
- La cuenta se elige, pero por defecto viene la de ahorro.
- La tabla `budgets` se queda en la base, vacía y sin uso: una migración que
  tira datos es una migración que da miedo. También se han ido dos restos del
  antiguo Resumen que ya no llamaba nadie: `dashboard()` y `payeeTotals()`.

## Novedades de la 0.25.0

- **Arreglado otra vez el icono gris de las categorías desplegables.** Al pasar
  el desplegable de un botón a la fila entera, el chevrón dejó de ser hijo
  directo y el selector que lo apaga volvió a alcanzar al icono del Avatar.
  Ahora apunta solo a `.row > svg`, que el icono de la categoría cuelga de
  `.avatar` y queda fuera.

## Novedades de la 0.24.0

- **La fila entera abre el desglose**, no solo el chevrón. Con el teclado, el
  tabulador llega a ella y Enter la abre.
- **Cada nota tiene su barra**, en el color de su categoría pero más apagado,
  porque es una rama suya. El ancho se mide contra la nota mayor de esa misma
  categoría: medirlas contra el total del periodo las dejaría todas planas.

## Novedades de la 0.23.0

- **El importe se escribe directamente.** El campo salía con el 0,00 puesto y
  había que borrarlo. El campo ya se vaciaba al recibir el foco, pero el efecto
  que da formato al importe corría justo después y volvía a escribirlo encima,
  porque leía el estado del foco de antes de enfocarse.
- **El total del día va en una cápsula** sobre fondo hundido, en vez de con el
  mismo aspecto que los importes de las filas: es el resumen de la jornada, no
  un movimiento más, y así destaca sin competir con ellos.

## Novedades de la 0.22.0

- **Las devoluciones programadas se atan a su gasto programado.** En la ficha de
  una programación de tipo Reembolso hay un selector, «Devolución de esta
  programada»: el alquiler entero cuelga del recibo, la parte del otro cuelga
  de él. Al registrarse cada mes, la devolución se engancha sola al movimiento
  que acaba de dejar la programación del gasto, sin tocar nada a mano.
- Los gastos se registran antes que sus devoluciones, para que al enganchar ya
  exista el movimiento al que apuntar.
- **Cada movimiento anota qué programación lo creó.** Antes se perdía ese rastro
  en cuanto se registraba.
- En Programadas, y también en las previsiones de Movimientos, la devolución se
  dibuja colgando de su gasto, igual que en la lista de movimientos.

## Novedades de la 0.21.0

- En el desplegable de «Gasto que te devuelven», los gastos sin nota se nombran
  por su categoría: una lista de fechas e importes sueltos no decía de cuál se
  trataba.

## Novedades de la 0.20.0

- **Las devoluciones cuelgan de su gasto.** Cuando las dos son del mismo día, la
  devolución se coloca justo debajo del gasto, entrada hacia dentro y unida a él
  por un codo, como una rama. Si el gasto es de otro día no se mueve de su fecha
  —eso descuadraría el total de la jornada—: ahí el vínculo se marca con una
  raya azul en el canto de los dos.
- **Al pasar el ratón se encienden todos los de la familia**, y el emergente
  dice de qué gasto viene la devolución, o cuánto llevas devuelto del gasto.
- **Un reembolso suelto se puede enganchar a su gasto.** En el formulario, al
  elegir Reembolso, sale una lista con los gastos de esa categoría anteriores a
  la fecha y con algo pendiente de devolver. Antes solo se podía enlazar
  entrando por el botón «Registrar reembolso» del propio gasto, así que los
  reembolsos importados de un CSV se quedaban sin enlazar.

## Novedades de la 0.18.0

- **La tira de arriba tiene dos rótulos, no uno.** Las cuentas llevan ahora su
  «CUENTAS» a juego con el «PATRIMONIO» de al lado, y los dos bloques arrancan
  a la misma altura en vez de ir uno centrado y otro no.

## Novedades de la 0.17.0

- **La gráfica y la tabla son ahora una sola cosa.** En la 0.16.0 seguían
  siendo dos listas de lo mismo, una debajo de otra. Ahora la barra de reparto,
  con el color de la categoría, va dentro de su fila de la tabla, junto a los
  movimientos, el porcentaje y el total. La barra se mide contra la categoría
  más grande del periodo.
- Las notas del desglose van en blanco, no en el color de su categoría.
- **Arreglado: el icono de las categorías desplegables salía gris** y solo se
  encendía al pasar el ratón. La regla que apagaba el chevrón alcanzaba también
  al icono de dentro.

## Novedades de la 0.16.0

- **«Reparto por categorías» y «Detalle por categoría» son ahora un solo
  bloque.** Enseñaban lo mismo dos veces.
- **Desglose por notas.** Las categorías que son un cajón se abren pinchando en
  su nombre: Deuda se despliega en 4Geeks, OLED, iPad y demás; Cultura, en cada
  libro o juego. Cada línea trae sus movimientos, su porcentaje sobre la
  categoría y su total, ya descontados los reembolsos.
- **Cada categoría decide si se desglosa**, con una casilla en su ficha. Las
  fijas (alquiler, alimentación, restaurantes, jonesy, a domicilio, tabaco y
  transporte) arrancan sin desglose, porque ahí la nota no distingue nada.

## Novedades de la 0.15.0

- **Ningún importe en blanco en Movimientos.** Las cifras de las filas se
  quedaban sin color porque el color solo se aplicaba a los elementos con la
  clase `amount`, y las filas no la llevaban. Ahora el ingreso y el reembolso
  salen en verde y el gasto en rojo, como el total del día.
- El patrimonio y el saldo de cada cuenta también siguen el signo (0,00 € se
  queda en gris: ni ganancia ni pérdida).
- Los traspasos siguen en gris en Movimientos y ahora también en Programados,
  donde salían en blanco.

## Novedades de la 0.13.0

Los cuatro detalles que quedaban del repaso del frontend:

- **La búsqueda espera a que pares de teclear** (250 ms). Antes «mercadona»
  lanzaba dieciséis consultas, dos por letra.
- **La lista ya no parpadea al filtrar**: se atenúa lo que había en vez de
  vaciarse y poner un girador. El girador solo sale en la primera carga.
- **Guardar es más rápido**: la lista y los catálogos se recargan a la vez, no
  uno detrás del otro.
- **Los tres totales aguantan en una fila** hasta los 860 px, en vez de
  partirse en 2 + 1 y dejar una tarjeta huérfana.

## Novedades de la 0.12.0

- **El patrimonio manda.** Pasa de 24 a 38 px, con la etiqueta en versalitas.
  Antes competía de tú a tú con los tres totales del periodo (26 px) y se
  perdía entre ellos.
- **Fuera la raya suelta bajo los filtros.** Era el borde inferior de la
  cabecera de la tarjeta, que se dibujaba aunque no hubiera nada debajo que
  separar. Arreglado para todas las tarjetas de la aplicación.

## Novedades de la 0.11.0

Aplicación más corta, a petición: fuera lo que no se usa.

- **Sin divisas.** Todo es euro. Fuera el selector de divisa base, la tabla de
  tipos de cambio con su descarga del BCE, el selector de divisa al crear una
  cuenta y el campo de importe recibido en traspasos entre monedas distintas.
- **Sin beneficiario ni etiquetas.** Para lo que antes se repartía entre tres
  campos ahora está la nota, que además sube a primera fila del formulario en
  vez de esconderse tras «añadir detalles».
- El informe «Dónde más gastas», que ordenaba por beneficiario, se va con ellos.
- La exportación CSV pasa de doce columnas a nueve, y la importación deja de
  rellenar campos que ya no se ven en ninguna pantalla.
- El motor conserva las columnas y las tablas: no se ha borrado ni un dato, así
  que volver atrás es cuestión de devolver la interfaz, no de migrar nada.

## Novedades de la 0.10.0

Repaso del frontend, con lo que salió de él:

- **Un solo patrimonio en pantalla.** La barra lateral ya no repite la cifra
  cuando estás en Movimientos, donde preside la lista y además puede estar en
  modo previsión: antes se veían 645,65 € y 805,90 € a la vez, ambas correctas
  y juntas confusas.
- **Las cifras se pueden copiar.** Había un `user-select: none` general que
  impedía seleccionar un importe o una nota. Ahora solo se resisten los mandos
  —botones, pestañas, barra lateral—, donde arrastrar solo pintaba de azul.
- **Se maneja con el teclado.** Las filas de movimientos y de cuentas son
  elementos activables de verdad: el tabulador llega a ellas, Enter las abre y
  Ctrl+Enter alterna la selección. Los diálogos atrapan el foco mientras están
  abiertos y lo devuelven a su sitio al cerrarse.
- **Los fallos se cuentan.** Había quince `catch` mudos: si algo fallaba al
  cargar, veías una lista vacía sin explicación. Ahora cada carga dice qué no
  pudo traer.
- Limpieza: el medidor de ancho de las gráficas ya no recrea su observador en
  cada píxel, las miniaturas de adjuntos no reejecutan su efecto una vez por
  imagen, y fuera tres funciones sin usar.

## Novedades de la 0.9.0

- **Viene apagado.** Como las previsiones cambian las cifras de cabecera, hay
  que encenderlas a propósito; nunca se abre la aplicación enseñando números que
  todavía no han pasado.
- **El interruptor de previstos vive en la propia lista**, junto a Filtros, no
  en Ajustes: se enciende y se apaga de un clic sin salir de la pantalla.
- **Mientras están a la vista, cuentan.** Los ingresos, los gastos, el balance,
  el saldo de cada cuenta y el patrimonio incluyen lo que está por llegar, y las
  etiquetas cambian a «previsto» para que se note que es una previsión. Al
  apagarlo, todas las cifras vuelven a contar solo lo ocurrido.

## Novedades de la 0.8.0

- **Las programadas se ven en la lista de movimientos.** Cada repetición futura
  aparece el día que le toca, en gris y con borde punteado, para ver lo que está
  por venir sin confundirlo con lo ya ocurrido. No suman en ningún total ni se
  guardan en la base: se calculan al vuelo y desaparecen en cuanto se registran.
- Al pasar por encima asoma un botón para registrarla en el momento, solo en la
  primera pendiente de cada programación.
- Se puede apagar en Ajustes. No se proyecta nada cuando hay una búsqueda o un
  filtro por cuenta, categoría o etiqueta, porque filtrar lo que aún no existe
  daría una lista incoherente.

## Novedades de la 0.7.0

- **Cuentas que no admiten números rojos.** De una hucha o de la cartera no se
  puede sacar más de lo que hay, así que la aplicación rechaza el movimiento en
  vez de dejar el saldo en negativo. El efectivo y el ahorro nacen con el candado
  puesto; las tarjetas y las deudas, sin él, porque viven en negativo. Se cambia
  con una casilla en la ficha de la cuenta.
- **Mira todo el recorrido, no solo el saldo de hoy.** Un gasto con fecha
  antigua puede hundir la cuenta a mitad de camino aunque el saldo actual
  cuadre; la comprobación busca el punto más bajo de su historia y avisa con la
  fecha exacta.
- Vigila igualmente los traspasos que salen, los borrados que quitan un ingreso
  y las bajadas del saldo de partida.

## Novedades de la 0.6.0

- **Se edita el saldo actual, no el inicial.** En una cuenta ya creada, la ficha
  pide ahora «Saldo actual», que es el dato que uno conoce, y deduce sola el
  saldo de partida restándole lo que suman sus movimientos. Antes había que
  hacer esa resta a mano, y poner «0» en el saldo inicial no cambiaba nada
  cuando ya valía cero.
- **El cero se ve.** Los campos de importe mostraban el valor cero como casilla
  vacía, así que parecía que habían rechazado lo que acababas de escribir.

## Novedades de la 0.5.0

Importador de CSV mucho más listo, pensado para tragarse las exportaciones de
Money Flow para iOS y Mac:

- **Reconoce sus columnas**: Suma, Contraparte, Transferencia: Cuenta/Suma/Moneda,
  además de las que ya entendía.
- **Deduce el tipo sin columna de tipo.** Recorre el archivo entero para ver qué
  categorías se usan alguna vez en negativo; esas son de gasto, y un importe
  positivo en una de ellas es un **reembolso**, no un ingreso. Los positivos sin
  categoría o en categorías que solo reciben dinero se quedan como ingresos.
- **Traspasos de verdad**, con cuenta de destino e importe recibido, en vez de
  dos apuntes sueltos.
- **Encaja los nombres con los que ya tienes** ignorando mayúsculas, tildes,
  espacios y puntuación: «Bart Bank» encuentra a «Bartbank» y «Salud y Bienestar»
  a «Salud y bienestar», sin crear duplicados. Para los que no se parecen
  («Cerdito» es la «Hucha» de siempre) se pueden pasar sinónimos explícitos.
- **Rescata la hora** cuando viene pegada a la fecha (`2026-08-18 20:56:31`).

## Novedades de la 0.4.0

- **Reembolsos.** Cuarto tipo de movimiento, junto a gasto, ingreso y traspaso.
  El dinero entra en la cuenta como un ingreso, pero en informes y presupuestos
  **descuenta del gasto de su categoría** en lugar de contar como ingreso nuevo.
  Es lo que hace falta cuando pagas algo compartido y te devuelven su parte.
- **Enlazados al gasto.** Desde la ficha de un gasto, «Registrar reembolso» crea
  la devolución ya vinculada, con la categoría y la cuenta heredadas. La ficha
  lista todas las devoluciones y calcula lo que te acaba costando; en la lista,
  el gasto muestra un «te cuesta X» debajo del importe.
- **Reembolsos programados**, para las devoluciones que se repiten cada mes.
- Primera migración de esquema (v1 → v2): reconstruye las tablas para admitir el
  nuevo tipo y guardar el enlace, sin tocar los datos existentes.

## Novedades de la 0.3.0

- **Fuera la pestaña Resumen.** La aplicación abre directamente en Movimientos,
  que es donde se trabaja.
- **Patrimonio y cuentas sobre la lista.** Encima de los movimientos hay una
  tira con el patrimonio total y el saldo de cada cuenta. Pulsar una cuenta
  filtra la lista por ella; volver a pulsarla lo deshace.
- **Los movimientos se leen al derecho.** El titular es ahora la categoría, y
  debajo va la nota si la escribiste, o el beneficiario si no. La cuenta queda
  al final del subtexto.

## Novedades de la 0.2.0

- **Cuenta principal.** Se marca desde la ficha de la cuenta y viene elegida por
  defecto al crear movimientos y programaciones. Solo puede haber una; archivar
  o borrar esa cuenta libera el puesto.
- **Diálogos arrastrables.** Se mueven tirando de su cabecera, y al apartarlos
  se retira el velo oscuro para poder leer lo que hay detrás. Doble clic en la
  cabecera, o el botón de la diana, los devuelve al centro. Mientras están
  apartados, un clic fuera ya no los cierra.
- **Campos numéricos a prueba de letras.** Importes, tipos de cambio y
  repeticiones descartan cualquier carácter que no forme parte de un número
  según se teclea.

## Qué incluye

**Núcleo contable**
- Cuentas de efectivo, banco, tarjeta, ahorro, inversión y deuda, cada una con
  su divisa, icono, color y saldo inicial.
- Gastos, ingresos y traspasos entre cuentas con partida doble. Un traspaso no
  altera el patrimonio total, solo mueve el dinero de sitio.
- Categorías con icono y color, separadas en gasto e ingreso.
- Todos los importes se guardan como enteros en céntimos, nunca como decimales
  en coma flotante.

**Día a día**
- Lista de movimientos agrupada por día con el balance de cada jornada.
- Filtros por periodo, tipo, cuenta, categoría y etiqueta, más búsqueda libre.
- Selección múltiple (Ctrl o Mayús + clic) para recategorizar o borrar en lote.
- Autocompletado de beneficiarios que además propone la categoría que usaste la
  última vez con ese comercio.
- Ctrl+N abre el formulario desde cualquier pantalla.

**Presupuestos y recurrencias**
- Presupuestos semanales, mensuales, trimestrales o anuales, por categorías o
  sobre el gasto total, con acumulación opcional de lo que sobra.
- Marca de ritmo: señala cuánto tocaría llevar gastado a estas alturas del
  periodo, para distinguir «voy justo» de «voy adelantado».
- Transacciones programadas que se registran solas al abrir la aplicación,
  recuperando todo lo vencido aunque lleve meses cerrada.

**Informes**
- Reparto por categorías, ingresos y gastos mes a mes, evolución del balance y
  ranking de beneficiarios, todo con su tabla equivalente.
- Multidivisa con tipos de cambio editables a mano o descargables del BCE.

**Datos**
- Importación y exportación CSV en UTF-8 con punto y coma, que es lo que Excel
  en español abre sin romper las tildes.
- Copia de seguridad automática diaria al cerrar, con las diez últimas
  conservadas, y copia manual bajo demanda.
- Etiquetas, notas multilínea y adjuntos de imágenes o PDF por movimiento.

## Dónde viven tus datos

```
C:\Users\<usuario>\AppData\Roaming\Money Flow\
├── moneyflow.db      base de datos SQLite
├── attachments\      tickets y fotos adjuntas
└── backups\          las diez últimas copias
```

Para llevarte todo a otro equipo basta con copiar esa carpeta.

## Desarrollo

```bash
npm install
npm run dev        # arranca con recarga en caliente
npm run typecheck  # comprueba tipos de proceso principal e interfaz
npm run test       # 60 comprobaciones sobre la capa de datos
npm run dist       # genera el instalador en release/
```

### Estructura

```
src/
├── main/        proceso de Electron: base de datos, repositorios e IPC
│   ├── db/      conexión, migraciones versionadas y datos iniciales
│   └── repos/   una unidad por dominio (cuentas, movimientos, presupuestos…)
├── preload/     puente tipado; la interfaz nunca ve Node ni Electron
├── renderer/    React con TypeScript
└── shared/      tipos, dinero y fechas que usan los dos lados
```

### Decisiones que conviene conocer

- **SQLite viene de `node:sqlite`**, el módulo que Node 24 trae de serie. Evita
  `better-sqlite3`, que exige compilar código nativo con Visual Studio.
- **El dinero son enteros.** `src/shared/money.ts` centraliza la conversión, el
  formato en español y el análisis de lo que el usuario teclea, aceptando tanto
  `1.234,56` como `1234.56`.
- **Las fechas son cadenas `YYYY-MM-DD` en hora local.** No se usa
  `new Date(cadena)` porque interpreta el formato corto como UTC y desplaza el
  día en España.
- **Las transacciones de base de datos admiten anidamiento** mediante
  savepoints, porque operaciones compuestas como importar un CSV llaman por
  dentro a otras que ya son atómicas.
- **Borrar una cuenta no descuadra a las demás.** Los traspasos con otras
  cuentas se degradan a gasto o ingreso simple en la que sobrevive, para que su
  saldo no cambie sola.
- **Los colores de las gráficas son azul y naranja, no verde y rojo.** El par
  verde/rojo no separa lo suficiente para daltonismo (ΔE 5,2 frente al mínimo
  de 8); azul/naranja llega a 24,7. El verde y el rojo se reservan para el signo
  de las cifras, que es texto y no depende solo del color.
- **La ventana está aislada**: sin integración de Node, con contexto aislado y
  una política de seguridad que bloquea cualquier recurso remoto. Por eso los
  iconos son SVG escritos a mano en vez de una librería externa.

# BONK

Una aplicación de escritorio para llevar las cuentas de casa en Windows: en qué
se va el dinero, qué recibos vienen, cuánto se ha ahorrado.

**Todo se queda en tu ordenador.** No hay cuenta que crear, ni nube, ni registro:
los datos viven en un archivo dentro de tu equipo y la aplicación no se conecta a
internet en ningún momento.

---

## Cómo instalarla

1. Entra en la pestaña **[Releases](https://github.com/i3SK87/bonk/releases)** de esta página y descarga
   el archivo que acaba en `Setup.exe` (el de arriba del todo, que es el más
   reciente).
2. Ábrelo cuando termine de bajar.
3. **Windows va a protestar.** Saldrá una pantalla azul que dice *«Windows
   protegió su PC»*. Es lo normal en programas que no han pasado por la firma de
   pago de Microsoft; no significa que haya nada malo. Pulsa **«Más
   información»** y luego **«Ejecutar de todas formas»**.
4. Sigue el instalador. Al acabar tendrás BONK en el escritorio y en el menú
   Inicio.

> Si en vez de esa pantalla azul te sale un aviso del **Control inteligente de
> aplicaciones** que no te deja continuar de ninguna manera, dímelo: en ese caso
> hay que usar la otra vía, que está más abajo.

## Cómo empezar a usarla

Al abrirla por primera vez viene con unas cuentas y unas categorías de ejemplo.
Puedes cambiarlas por las tuyas desde **Cuentas** y **Categorías**: borra las que
no te sirvan, crea las que necesites y ponle a cada cuenta el dinero que tiene
hoy en «saldo inicial».

Lo que hay dentro:

- **Movimientos** — la lista de todo lo que entra y sale. El botón **Nuevo
  movimiento** es el de uso diario. Arriba tienes el patrimonio y el saldo de
  cada cuenta.
- **Cuentas** — el banco, la cartera, la hucha, una tarjeta. Cada una con su
  saldo.
- **Categorías** — en qué se va el dinero: alquiler, comida, ocio… Con su icono
  y su color.
- **Ahorro** — metas con fecha: «1.000 € antes de junio», y ves cómo va.
- **Programados** — lo que se repite: el alquiler, la nómina, las suscripciones.
  Se registran solos el día que toca, sin que tengas que acordarte.
- **Informes** — en qué se ha ido el dinero este mes, por categorías, y la
  evolución mes a mes.
- **Ajustes** — el aspecto (hay cinco combinaciones de color, claras y oscuras),
  los avisos y las copias de seguridad.

Un par de cosas que quizá no se ven a la primera:

- **Los avisos.** En Ajustes puedes pedirle que te avise el día antes de cada
  recibo programado. Para eso conviene marcar también «Arrancar con Windows»:
  se queda como un iconito junto al reloj, sin molestar, y desde ahí la abres.
- **Los reembolsos.** Cuando compartes un gasto y te devuelven una parte, eso no
  es un ingreso: es un gasto que te ha costado menos. Regístralo como
  «Reembolso» y BONK lo descuenta del gasto correspondiente en vez de sumarlo a
  los ingresos.
- **La calculadora**, arriba a la derecha en Movimientos, para repartir un recibo
  entre varios sin salir de la aplicación.

## Tus datos y las copias

Todo se guarda en un único archivo, en `%APPDATA%\BONK`. Al cerrar la aplicación
hace una copia de seguridad al día y guarda las diez últimas.

Desde **Ajustes ▸ Datos** puedes hacer una copia cuando quieras, abrir esa
carpeta y exportarlo todo a CSV para verlo en Excel.

Para llevarte los datos a otro ordenador, copia esa carpeta entera.

---

## La otra vía de instalación

Si el instalador no pasa el filtro de Windows, se puede usar la aplicación sin
instalarla:

1. En **[Releases](https://github.com/i3SK87/bonk/releases)**, descarga el archivo `.zip` en vez del
   `Setup.exe`.
2. Descomprímelo donde quieras, por ejemplo en `Documentos\BONK`.
3. Dentro hay un `BONK.exe`. Ábrelo y ya está.

Es la misma aplicación; solo que la carpeta te la colocas tú. Para tener acceso
directo, clic derecho en `BONK.exe` ▸ **Enviar a** ▸ **Escritorio**.

---

## Para desarrollar

Electron + React + TypeScript, con `node:sqlite` (el de Node 24, sin módulos
nativos que compilar). Hace falta Node 24 o superior.

```
npm install
npm run dev        # arranca en modo desarrollo
npm test           # las comprobaciones de la capa de datos
npm run typecheck  # TypeScript en modo estricto
```

```
npm run deploy  # compila y pone al día los accesos directos de este equipo
```

Y para generar lo que se publica en Releases:

```
npm run dist    # instalador NSIS y zip portable, en release/
npm run pack    # solo la carpeta sin empaquetar, en release/win-unpacked
```

En el equipo de desarrollo la aplicación se abre arrancando el motor de Electron
sobre la propia carpeta del proyecto, no desde una copia instalada: el Control
inteligente de aplicaciones de Windows decide por reputación, y cada compilación
es un ejecutable nuevo sin ninguna, así que una arranca y la siguiente no.

El historial de versiones está en [CHANGELOG.md](CHANGELOG.md).

Inspirado en Money Flow, la aplicación de Hermann Wagenleitner para iOS y Mac,
que no tiene versión para Windows.

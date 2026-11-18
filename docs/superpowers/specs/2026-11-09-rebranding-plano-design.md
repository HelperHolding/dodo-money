# Rebranding plano según el brandbook de Dodo (diseño)

**Fecha:** 2026-11-09 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Hoy la app se ve como el interior de una sucursal (tema «Sucursal Dodo», `app/sucursal.css`): muro de listones
naranjas con textura, tiras LED, barra de acero, letras de canal en 3D con resplandor, una «D» amarilla en relieve,
tarjetas de cristal, botones con canto y un letrero que parpadea al encender. Se quita todo eso y la app pasa a un
estilo **plano y limpio que sigue el brandbook de Dodo Pizza** (shift.dodobrands.io, *Dodo Pizza Brandbook*):
colores de marca, tipografía gruesa en títulos, logo oficial y nada de efectos de luz ni relieve.

No cambia ninguna funcionalidad, ruta, dato ni acomodo de las pantallas: solo presentación.

**Éxito:** al abrir cualquier pantalla con el marco (inicio, Ventas, Rappi en vivo, formularios, P&L, compras), el
fondo es blanco o beige liso, las tarjetas son blancas con una línea fina, el título de página es negro en mayúsculas
sin sombras, la «D» es el logo oficial plano, los botones no tienen degradado ni canto y no hay ninguna animación de
encendido. En modo noche se ve igual de plano sobre fondo casi negro. Las vistas de impresión no cambian.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Paleta | Naranja `#FF4E00` (acciones, selección, marca), beige `#F9F1E6` (fondo secundario y bandas), negro (texto y navegación), blanco (zona de trabajo y tarjetas), gris `#949598` del brandbook solo como referencia: el texto secundario se queda en los grises AA actuales |
| Naranja como texto | Se mantiene la regla actual: como texto se usa `--accion-oscuro` (`#b83800`, 5.9:1) |
| Tipografía de títulos | **Archivo** (Google Fonts vía `next/font`, pesos 700 y 800) en el token `--display`, en lugar de Rubik. Es un sustituto libre de **Rooftop**: la licencia de Rooftop que está en Drive es de escritorio (EULA de Type Today) y no permite servir el archivo de la fuente en la web. Cambiar a Rooftop después = tocar solo `--display` y `app/layout.tsx` |
| Texto corrido | Manrope, sin cambio |
| Títulos de página | Negros, mayúsculas, peso 800, interlineado 0.95–1.0 (brandbook: 90–100 %), sin `text-shadow`, sin contorno, sin capa de textura |
| Logo | «D» oficial plana: *Logos → English Sign → RGB → Orange → SIGN — Dodo Pizza — Orange — RGB.svg*; versión *Monochrome White* sobre el menú negro. Sin deformar ni recolorear |
| Modo noche | Se conserva el interruptor sol/luna, en versión plana: sin LED, sin resplandor, sin animación de encendido |
| Pantalla de Ventas | Deja de ser una «pantalla digital» oscura montada en el muro: pasa a una sección normal (blanca de día, carbón de noche). Los colores de datos siguen los tokens validados (`--dato-1` naranja para POS, `--dato-2` azul para Rappi) |
| Impresión | Sin cambio |

## 3. Qué se quita

De `app/sucursal.css`:

- Las propiedades animables `--enc` y `--led`, los `@keyframes led-encender` y `letrero-encender`, y todo lo que
  dependa de `html[data-encender]`.
- Los tokens de luz (`--luz-*`, `--led-*`, `--brillo-led`, `--charco`, `--halo`, `--y-barra`, `--luz-sala`) y de
  cristal (`--cristal-*`, `--sombra-cristal`, `--desenfoque`, superficies semitransparentes).
- El fondo `--sala` (muro, textura SVG de ruido, barra de acero, tiras y penumbra) y las tiras `::before/::after`
  de `.franja-lectura` y `.marco-contenido`.
- La «red de seguridad» que envolvía en placa de cristal el texto suelto sobre el muro, y los `h2/h3` sueltos en
  blanco con contorno: con fondo liso ya no hacen falta.
- El letrero: `.letrero::before`, el `text-shadow` / `-webkit-text-stroke` / capa `[data-texto]::after` del `h1`, la
  caja de luz `.figura-dodo` / `.figura-cara` y la regla de `main.pagina h1` con letras de canal.
- Botones con degradado, canto y hundimiento; secundario «acero».
- Tira de luz en KPIs (`::before` con `box-shadow`), resplandores en tablas y el bisel / scanlines de la pantalla
  de Ventas.
- En `app/layout.tsx`: la fuente Rubik y la parte del script `LUZ` que pone `data-encender` (se queda solo la
  lectura del modo noche guardado).
- `public/dodo-figura.png` deja de usarse (se borra si nada más lo usa).

## 4. Qué se queda o se reescribe

`app/sucursal.css` se reemplaza por **`app/marca.css`**, más corto y solo con presentación plana:

1. **Tokens de día**: `--display` a Archivo; superficies sólidas (`--superficie: #fff`); fondo de la zona de
   contenido `--papel` blanco y `--papel-2: #F9F1E6` para bandas, encabezados de tabla y rellenos secundarios;
   sombras mínimas (`--sombra-1` existente) o ninguna en tarjetas.
2. **Tokens de noche** (`html[data-luz="noche"]:has(.marco, .login)`): se conservan los colores de estado de noche
   que ya existen (verde, rojo, ámbar, violeta, turquesa, P&L) y se cambian superficies a sólidas: fondo
   `#121212`, tarjetas `#1c1c1c`, campos `#242424`, texto beige `#F9F1E6`, secundario en grises AA medidos.
3. **Marco**: menú lateral negro liso (sin degradado) con el filete naranja de 4 px que ya existe; contenido sobre
   fondo liso.
4. **Encabezado de página** (`components/EncabezadoPagina.tsx`): la «D» oficial (`<img>` del SVG, ~48 px, sin caja)
   a la izquierda y el `h1` en Archivo 800, mayúsculas, negro. La línea de descripción y las acciones van debajo,
   sin placa de cristal. Se quita `data-texto` y el comentario del letrero.
5. **Botones**: primario naranja liso con texto negro (contraste actual 6.3:1), hover `--accion-2`; secundario
   blanco con borde `--linea-fuerte`; seleccionado con `--accion-tinte` y borde naranja.
6. **Tablas**: encabezado beige `--papel-2` con línea inferior fina; hover de fila `--accion-tinte`; cifras en
   `--display` peso 600.
7. **KPIs**: cifras en `--display` 700, sin tira de luz.
8. **Tableros de Ventas y Rappi en vivo** (bloques «Tablero de Ventas» y «Rappi en vivo» del archivo actual): se
   conserva **todo el acomodo** (rejillas, mosaicos, tamaños, celular) y se quitan solo fondos oscuros, biseles,
   scanlines y colores redefinidos para la pantalla oscura. Antes de borrar una regla de esos bloques se clasifica
   como *acomodo* (se queda) o *luz/cristal/oscuro* (se va).
9. **Pop-up (ConInfo)**, **esqueletos de carga**, **acceso (login)**, **celular**, **movimiento reducido** e
   **impresión**: se conservan sus reglas de acomodo; se quitan las de cristal, letrero apagado y local de fondo.
10. **Interruptor sol/luna** (`components/InterruptorLuz.tsx`): mismo botón; se quita el bloque que dispara
    `data-encender` y se actualiza el comentario.

Logos (`/logo-dodo.png`, el dodo en círculo naranja) en login, cuenta, menú, 404, invitación, orden de compra y
reporte: **se quedan** (es el avatar oficial y funciona como ícono redondo). Solo el encabezado de página cambia de
la «D» 3D a la «D» oficial plana.

Archivos nuevos en `public/marca/`: `dodo-d-naranja.svg` y `dodo-d-blanca.svg` (copias sin modificar de Drive).

## 5. Riesgos

- **Reglas de acomodo escondidas en el tema**: Ventas y Rappi dependen de `sucursal.css` para su rejilla. Mitigación:
  clasificar regla por regla (punto 4.8) y comparar capturas antes/después de ambos tableros en escritorio y celular.
- **Contraste de noche**: al pasar de cristal a sólido cambian los fondos. Se mide cada par texto/fondo nuevo
  (≥ 4.5:1 texto, ≥ 3:1 bordes de control).
- **Fuente**: Archivo se parece a Rooftop pero no es igual. Queda aislada en `--display`.

## 6. Pruebas

- `npm run typecheck` y `npm test` (no hay lógica nueva; deben seguir pasando).
- Revisión en el navegador con el servidor de desarrollo, de día y de noche, a 1280 px y 375 px: inicio admin,
  Ventas, Rappi en vivo, un formulario (efectivo), P&L, compras/pagos, login y 404. Capturas antes/después.
- Búsqueda final sin resultados en `app/` y `components/`: `text-shadow` con más de una capa, `--enc`, `--led`,
  `data-encender`, `backdrop-filter`, `fuente-rubik`, `figura-dodo`.
- Vista de impresión del P&L y de orden de compra sin cambios.

## 7. Entrega

Rama `feat/rebranding-plano` desde `origin/main`, un PR hacia `main` con capturas. Sin migraciones ni cambios de
datos.

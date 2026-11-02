# Propuesta: tema «Sucursal Dodo» (Fase B)

## Fase C (2026-11-02): tema base en la app

Rama `rediseno/sucursal-dodo` (desde `main`). El tema vive en piezas compartidas, así que **todas las pantallas lo reciben a la vez**: ninguna queda con el diseño anterior.

| Pieza | Archivo | Qué hace |
|---|---|---|
| Tema | `app/sucursal.css` (nuevo, se carga después de `globals.css`) | Local de fondo, cristal, letrero, botones, tablas y KPIs, modo noche, impresión y movimiento reducido |
| Tokens de superficie | `app/globals.css` | 57 fondos blancos pasan a `--superficie` (cristal), `--superficie-solida` (menús, modales, columnas fijas) o `--campo` (controles). Solo cambia el color de fondo |
| Letrero | `components/EncabezadoPagina.tsx` | La «D» y el h1 en letras de canal; descripción y acciones en una vitrina de cristal. Lo usan 80 de las 100 páginas |
| Modo noche | `components/InterruptorLuz.tsx`, `app/layout.tsx`, `components/MenuLateral.tsx` | Interruptor en el menú y la barra móvil; se aplica antes de pintar y el encendido ocurre una vez por sesión |
| Pop-up | `components/ConInfo.tsx` | Cursor (450 ms), toque o teclado; Esc o tocar fuera cierra. Piloto: «Efectivo disponible» en Inicio |
| Letra | `app/layout.tsx` | Rubik (`next/font`) para títulos y cifras; Manrope sigue en el texto |
| Módulos | `banca`, `usuarios`, `asistente` (`*.module.css`) | Sus fondos blancos fijos pasan a los mismos tokens |

**Red de seguridad:** cualquier texto suelto en la página (párrafos, listas, formularios, notas plegables, tablas, enlaces de regreso) va en una placa de cristal. Los títulos sueltos se vuelven letras blancas con contorno.

**Auditoría automática en el navegador:** se recorren los 42 apartados del menú del administrador en un marco oculto, a 1280 px de día y de noche y a 375 px. Busca texto sobre el muro sin cristal, contraste aproximado bajo AA y desbordes horizontales. Lo que encontró se corrigió:

- Contenedores de las tablas de Costeo y Documentos.
- Pestañas.
- Notas plegables.
- Filtros sueltos.
- Piezas «invertidas» de noche.
- Encabezados del P&L.
- Avatares.
- 4 px de desborde del charco de luz.

**Respaldo de accesibilidad:** con «reducir transparencia» del sistema (el navegador del panel de Claude lo reporta), el cristal queda casi opaco (88 %) en lugar de blanco total.

## Revisión v9 (2026-11-02): el fondo se ajusta a lo largo

- **Sin techo visible.** La franja de techo con riel y focos se veía extraña bajo «Operando en», así que se quitó y el muro de listones empieza arriba.
  - La tira LED de arriba ahora es la orilla inferior de «Operando en» y baña el muro hacia abajo.
  - Los conos de luz de los focos quedan en el muro, cada 190 px.
- **La tira LED de la barra va justo debajo de la cubierta de acero.** La franja blanca queda entera, como marco, y la luz cae sobre el frente naranja (luz bajo barra, como en el local). Recortes: (captura local, no versionada).
- **Las dos tiras LED, más tenues.** La línea baja a 60 % de opacidad y el resplandor a 0.45 de día y 0.8 de noche (antes 0.75 y 1.35).
- **El menú lateral se estira con el fondo:** el panel oscuro mide lo que la página y su contenido se queda a la vista (`sticky`) al bajar. Ya no se ve cortado.
- **La barra de acero siempre queda después del último bloque.** El muro se alarga con el contenido: el padding inferior de `main` mide la barra más 28 px, así que ninguna tarjeta queda encima de la barra.
- **Revisado** a 1440, 1180, 940, 768 y 375 px, de día y de noche, sin desbordes. Capturas (captura local, no versionada).

## Revisión v8 (2026-11-02): orden y nada se corta

- **El acomodo depende del ancho real del contenido** (`container-type` en `main`), no de la ventana. Así responde igual con el menú abierto o cerrado.
  - **Saldos:** van los tres en fila o los tres en columna (bajo 700 px de contenido), nunca 2 + 1.
  - **Turno** va junto a Efectivo disponible solo si caben los tres saldos completos (más de 1180 px de contenido). Si no, va debajo, a todo el ancho.
  - Las cifras se ajustan con `clamp(1.4rem, 2.4cqi, 2rem)` y nunca se parten ni se recortan.
- **Ritmo vertical parejo:** 20 px entre todos los bloques. La vitrina de fecha y fuentes ya no queda pegada a Cumplimiento.
- **Pop-up real, cerrado hasta que se pide.** Se abre con el (i) de Efectivo disponible: cursor 450 ms, clic, toque o teclado. Se cierra al salir (con 180 ms de gracia), con Esc o al tocar fuera.
  - La tarjeta se eleva 2 px y gana borde naranja mientras está abierto.
  - Se quitaron los (i) sin contenido de cada saldo.
- **Revisado sin desbordes** a 1440, 1180, 940, 768 y 375 px: `scrollWidth` igual al ancho y ningún elemento fuera del área de contenido. (capturas reemplazadas por las de v9)

## Revisión v7 (2026-11-02): el letrero baja con su pared

- **Nada queda fijo ni se corta.** El local entero (techo, tiras LED, muro de listones con el letrero, barra) es el fondo de la página y se desplaza con el contenido.
  - El letrero se va para arriba montado en la pared, como en el local: no se va «solo el título».
  - El techo queda arriba de la página y la barra de acero con su tira LED al final.
  - Las capas del fondo se miden contra la altura de la página: el muro se estira y la barra se alinea abajo.
- **«Operando en»** también se desplaza, igual que en la app real (`.franja-lectura` no es fija).
- Se descartó la cabecera fija de la v6.
- **Tira LED en la nariz de acero de la barra**, igual a la del techo: baña los listones hacia arriba y se enciende con el modo noche.
- Capturas locales, no versionadas (el repositorio es público).

## Revisión v5 (2026-11-02): la luz en las letras

- **El brillo se queda en las letras.** El charco de luz sobre el muro baja a un tercio. El resplandor es un *bloom* cerrado (2–30 px) pegado a cada letra, sin el halo ancho que teñía el fondo.
- **Textura de la luz** en la cara de acrílico: zona caliente arriba, módulos LED que se adivinan detrás de la cara cada 22 px y un grano casi invisible.
  - Es una capa encima del texto (`::after` con `attr(data-texto)` y `background-clip: text`), porque `text-shadow` taparía un fondo recortado al texto.
  - En la app, `EncabezadoPagina` pasaría el título como `data-texto` cuando sea texto.
- **«D» más naranja y viva:**
  - Centro amarillo (#ffe85e) y orilla naranja Dodo (#ff5c00), sin el velo blanco que la apagaba.
  - Canto naranja, brillo especular arriba a la izquierda y resplandor naranja cerrado.
- Recortes del letrero: (captura local, no versionada).

## Revisión v4 (2026-11-02): el interior de la pizzería

Referencia: foto del interior (muro de listones naranjas con LED, «DO» gigante en listones, «D» amarilla encendida con
«DODO PIZZA» blanco y barra de acero). Boceto: [boceto/inicio-admin.html](boceto/inicio-admin.html), con un control abajo
a la derecha para cambiar de variante. Capturas: (captura local, no versionada).

- **Fondo = el local por dentro.** Es una capa fija, solo CSS, sin imágenes y sin puntos:
  - Techo blanco con riel y focos.
  - Muro de **listones verticales** naranjas, bañado por una tira LED desde arriba, con los conos de los focos.
  - ~~«D» gigante de listones en relieve~~: **se quitó** (v5, a pedido de Carlo). El muro queda solo con listones.
  - **Barra de acero** con frente naranja de paneles abajo.
  - De noche el local baja a penumbra y la tira LED brilla más. El modo noche enciende el local: primero la tira LED (0.8 s) y luego el letrero con su parpadeo.
- **Letrero más 3D y más luminoso, y de noche no se oscurece: brilla más.** **Carlo eligió la variante B (letras en el muro)**; la A queda solo como referencia:
  - **A. Caja de luz:**
    - Cara de acrílico naranja encendida, marco de aluminio y cuerpo inferior de aluminio de 30 px visto desde abajo.
    - Reflejo de la luz en ese aluminio, halo en el muro y sombra proyectada.
  - **B. Letras en el muro:**
    - Como en el local: la «D» y las letras de canal montadas directo en los listones, sin caja.
    - Letras con 8 px de relieve, sombra sobre el muro y halo.
  - En las dos, las letras llevan 7–8 px de canto y un resplandor de tres capas que crece de noche (×1.4).
- **«D» amarilla** (como la de la foto): cara de acrílico amarillo encendido (#fff2a6 → #ffc400) y canto de 8 px que sigue la forma.
- **Cuadros con transparencia:**
  - De día son cristal blanco al 60 % con desenfoque. Dejan pasar el naranja del muro y se ven durazno, con menos contraste.
  - De noche son **cristal ahumado** (marrón oscuro al 62 %) con texto claro.
  - El pop-up sigue siendo un ticket blanco en los dos modos.
- **Contraste medido en la captura real** (texto contra el color promedio detrás de él, con la transparencia activa):
  - Día: 5.7–11.6.
  - Noche: 6.6–13.2.
  - Todo pasa AA. Para lograrlo, el gris secundario de día pasa a #424242.
- **Respaldo:** si Windows tiene apagados los «Efectos de transparencia» (`prefers-reduced-transparency`), los cuadros quedan sólidos: blancos de día y marrón oscuro de noche.

## Revisión v2 (2026-11-02, comentarios de Carlo)

Esta versión **reemplaza** lo que dicen §2 y §3 sobre el fondo y el letrero. Boceto: [boceto/inicio-admin.html](boceto/inicio-admin.html);
capturas locales, no versionadas (el repositorio es público).

- **Enfoque:** el administrador en `/` (Inicio con «Operando en»). Pasa a ser el **piloto** en lugar de `/ventas`.
- **Sin fondos punteados.** Se quita la trama de puntos del muro, del lateral y del letrero.
- **Fondo = mostrador real:**
  - Muro liso gris cálido bañado por tres plafones desde arriba.
  - Mostrador naranja fijo en el tercio inferior: cubierta con nariz redondeada y brillo, sombra bajo la nariz, frente laminado con la luz que cae y un grano casi invisible, y zoclo de acero.
  - La cubierta proyecta una sombra sobre el muro.
- **Letrero liso con volumen:**
  - Caja de lámina naranja satinada, con filo de luz arriba y cara inferior en trapecio (vista desde abajo).
  - Proyecta una sombra en el muro.
  - Al lado, la caja de luz del dodo con su propio canto.
- **Letras de canal encendidas:**
  - Cara de acrílico blanca cálida.
  - Relieve de 4 px (el canto visto desde abajo) y separación de la lámina.
  - Resplandor en tres capas. De día es tenue; de noche la lámina baja a un naranja rojizo profundo (no emite), el canto de las letras se oscurece y la cara brilla con halo y charco de luz en el muro.
- **Modo noche como en The Coffee:**
  - Interruptor sol/luna en el lateral y en la franja móvil, aplicado antes de pintar y guardado en `localStorage`.
  - Una sola variable de luz `--enc` y el halo ×1.4 de noche.
  - Parpadeo de encendido de 1.4 s en la primera carga de la sesión y al pasar a noche. Sin parpadeo con `prefers-reduced-motion`.
  - Tarjetas y vitrina siguen claras, así que el texto no cambia de color.
- **«Operando en»** queda en una placa de cristal fija arriba, para que el texto no vaya sobre el muro.
- **Pop-up en Inicio:** la nota «Movimientos confirmados. La caja de venta se revisa en el arqueo.» sale de la cabecera de Efectivo disponible y pasa al (i).
- **Letreros de grupo del menú:** pasan a mayúsculas y minúsculas. Es solo `text-transform`; el texto es el mismo.
- **Sin subrayados en ningún vínculo ni texto** (v3):
  - `a { text-decoration: none }` en toda la app.
  - Los vínculos se distinguen por color naranja oscuro (`--accion-oscuro`, 5.9:1) y peso 600–700.
  - Al pasar el cursor, un fondo tenue (`--accion-tinte`); con teclado, el anillo de foco de siempre.
- **Figura del dodo sin marco** (v3):
  - Ya no va en un cuadro: es la «D» de la fachada como figura 3D.
  - Cara de acrílico amarilla al centro y naranja en la orilla, con el dodo encima.
  - Canto de 6 px que sigue la forma (de noche queda oscuro) y resplandor que crece de noche.
  - El dodo se separó del círculo naranja de `logo-dodo.png`, que no se modifica. En la app iría como recurso nuevo `public/dodo-figura.png` (`boceto/dodo-figura.png`, 20 KB). Lo ideal sería el SVG oficial de la marca, si Carlo lo tiene.

Fecha: 2026-11-02 · Estado: **dirección aprobada por Carlo; Fase C en la rama `rediseno/sucursal-dodo`** · El boceto v1 no se versiona; el vigente es [boceto/inicio-admin.html](boceto/inicio-admin.html)
(capturas locales, no versionadas).

## 1. Lectura de las fotos

| Foto | Qué tomo |
|---|---|
| Fachada de noche | Lámina **naranja perforada** con LEDs en la orilla que dibujan un marco de puntos. Letras de canal **blancas retroiluminadas**. Caja de luz cuadrada del dodo, más clara que la fachada |
| Inauguración | El naranja es la marca entera: fachada, muro con «DODO» repetido, tótem. Contraste plano blanco sobre naranja |
| Fachada de día | Perforación visible como trama de puntos. Letras 3D blancas con **retorno gris**. Vitrina de cristal debajo de la fachada. Mural de color, que no se usa en la app (ver §6) |
| Interior | **Mostrador naranja** («order here / pick up here»), plafón gris oscuro **perforado**, pantallas de menú y de pedidos, acero inoxidable de cocina, contador «1529 pizzerías» en fichas naranjas |

Concepto: **«sucursal tecnológica»**. En The Coffee el local es madera y caja de luz colgante. En Dodo es lámina perforada,
luz LED, pantallas, cristal y acero. El patrón que se repite en todo el local es la **trama de puntos**, y se vuelve el
material de la app: perforación en la fachada, plafón en el lateral y panel acústico en el muro.

Fuente de luz: el letrero **emite** luz y todo lo demás la recibe. Montaje: adosado (fachada), no colgante.

## 2. Tokens

### Color

| Token nuevo | Valor | Uso |
|---|---|---|
| `--muro` | `#ecebe8` + trama de puntos al 7 % cada 9 px | Fondo superior: panel acústico gris claro |
| `--mostrador` | `#ff4e00` con canto `#c23a00` y borde superior `#ff8a55` | Zócalo del tercio inferior, fijo, como el mostrador |
| `--fachada` / `--fachada-canto` | `#ff4e00` / `#c23a00` + perforación de 7 px | Letrero |
| `--caja-logo` | `#ff6a1f` | Caja de luz del dodo |
| `--plafon` | `#1f1f21` + trama al 4.5 % | Lateral y franja móvil (hoy negro liso) |
| `--acero-1/2` | `#fbfbfb` → `#e6e7e8` con cepillado | Botón secundario |
| `--cristal` / `--cristal-borde` | blanco 78 % / 85 % (noche 90 %) | Tarjetas, placa de filtros, pie del letrero |
| `--sombra-calida` | `0 18px 36px -22px rgb(90 30 0 / .45)` | Sombra de las tarjetas sobre el muro |

**Se conservan** todos los tokens actuales (`--accion`, `--tinta*`, estados, `--dato-*`, `--pl-*`). El naranja sigue
siendo #ff4e00 y el texto naranja sigue siendo `--accion-oscuro`.

### Tipografía

- **Rubik 700/800** (nuevo, por `next/font`, sin petición externa) para el h1 del letrero, los h2 de tarjeta y las cifras KPI.
  Es geométrica, con esquinas apenas redondeadas, y se parece a las letras de canal de la fachada sin ser infantil.
- **Manrope** se queda para el texto, las tablas y los formularios. No se cambia la lectura diaria.
- Cifras con `tabular-nums` (ya está así).

### Forma y movimiento

- Radios: 6 en la fachada, 10 en botones, 14 en tarjetas y 12 en pop-ups. Son los 4 valores de hoy más uno para el cristal.
- Movimiento (presupuesto de app: mínimo):
  - Encendido del letrero de 1.3 s, **solo en la primera carga de la sesión** (`sessionStorage`).
  - Entrada del pop-up de 220 ms.
  - Botones que «se hunden» 2 px al presionarlos.
  - Brillo del esqueleto.
  - Con `prefers-reduced-motion` no se anima nada de esto.

## 3. Piezas

1. **Letrero (EncabezadoPagina)**
   - Fachada: lámina naranja perforada con canto inferior de 6 px y el h1 en **letras de canal blancas** (retorno gris de 3 px más una sombra sobre la lámina). A la derecha, la caja de luz del dodo.
   - Debajo va una **vitrina de cristal** con las migas, la descripción y las acciones, como la vitrina bajo la fachada.
   - Contraste: blanco sobre #ff4e00 es 3.3:1 y pasa AA solo para texto grande. Por eso **en la lámina solo va el h1** (≥ 28 px, 800). Todo el texto chico va en la vitrina blanca.
   - De noche se encienden los LEDs de la orilla y el halo.
   - Todo usa una sola variable de luz, `@property --enc`, como en The Coffee.
2. **Fondo:** muro gris perforado con el mostrador naranja fijo en el 28 % inferior. Regla de The Coffee: **el texto nunca va directo sobre el fondo**.
3. **Cristal («vitrina»):** blanco al 78 % con `blur(16px) saturate(1.2)`, brillo interior y sombra cálida.
   - Respaldo al 94 % sin `backdrop-filter` y blanco sólido con `prefers-reduced-transparency`.
   - Sobre el mostrador naranja, el gris `--tinta-3` (#767676) no alcanza AA, así que dentro del cristal se usa #6b6b6b. Se mide en la Fase C.
4. **Pop-up (`ConInfo`, nuevo):** blanco sólido con filete naranja de 3 px arriba, como un ticket.
   - Contenido: título, qué mide, cifras de contexto (etiqueta → valor) y cómo se calcula.
   - Se abre con hover de 450 ms, con un toque o con el botón (i) desde el teclado. Se cierra con Esc, al salir (con 180 ms de gracia) o al tocar fuera.
   - Los textos viven en un catálogo aparte (`lib/info-pantallas.ts`).
   - Sin dependencias nuevas: botón + `role="dialog"` propio.
5. **Botones**
   - Primario «mostrador»: naranja con **texto negro** (6.3:1, la decisión aprobada en F1) y canto inferior.
   - Secundario «acero inoxidable».
   - Fantasma: texto naranja oscuro.
   - Peligro: rojo con canto.
   - Las clases actuales (`.boton`, `.boton-secundario`, …) se conservan.
6. **Carga:** la misma forma de hoy (`CargandoPagina`), con el **letrero apagado** (lámina desaturada, sin letras) y esqueletos de cristal al 60 %.
7. **Modo noche:** interruptor en el lateral y en la franja móvil, aplicado antes de pintar con un script en `<head>`.
   - El muro pasa a #29292b, el mostrador baja a 50 % de brillo y el letrero se enciende.
   - Las tarjetas siguen claras, así que **el texto no cambia de color**.
8. **Lateral:** plafón oscuro perforado. Se conserva el filete naranja del activo y el borde naranja de 4 px.

## 4. Plan por apartado

| Grupo | Pantallas | Qué cambia (además del tema) |
|---|---|---|
| **Piloto: Ventas** | `/ventas` | Letrero; párrafos `:113`, `:133` y `:219-220` a pop-up; KPIs en cristal con (i); calendario y gráficas en tarjetas de cristal; el `title` de Indicadores pasa a pop-up |
| D1 Inicio y corporativo | `/`, `/corporativo` | `DashboardVentasInicio` con las mismas piezas del piloto; textos `:76` y `:103` a pop-up |
| D2 Sucursal | arqueo, cierre, movimientos, caja chica, turnos, recepciones | El párrafo de instrucción pasa al (i) del letrero; formularios en cristal; tablas `.tabla-tarjetas` en celular sin cambios |
| D3 Checklists | 9 pantallas | Igual que D2; leyenda «Listo / Revisar» a pop-up junto a Franjas |
| D4 Efectivo | efectivo, recolecciones | Igual que D2 |
| D5 Compras | 22 pantallas | Fichas con KPIs de cristal; notas de factura y orden a pop-up; `<dialog>` con el mismo estilo del pop-up |
| D6 Finanzas | P&L y 6 más | P&L en cristal casi sólido (tabla densa); los `title` de `TablaPL` a pop-up |
| D7 Proyectos, conocimiento, asistente, admin | 12 pantallas | Tema y párrafos a pop-up |
| D8 Acceso | `/login`, `/invitacion` | Fachada grande con el dodo como portada del login |
| Fuera | `/reporte/*`, `/orden-compra/[id]` | Sin tema (impresión) |

**Piloto recomendado: `/ventas`.** Es el tablero más completo (KPIs, 9 gráficas, calendario, tablas, plegables) y el que
más texto explicativo tiene. Si ahí funciona, el resto es repetir. Si Carlo prefiere `/` (lo que ve el admin al entrar), se cambia.

## 5. Mejoras que tocarían lógica (solo propuesta, no se harán)

- Cifras de contexto **nuevas** en los pop-ups, como «mejor día» o «periodo anterior en pesos». El pop-up solo mostrará cifras que la página ya calcula. El «Mejor día» del boceto es ilustrativo.
- Contador estilo «1529 pizzerías» (fichas naranjas por dígito) para un número héroe. Se guarda para después porque exige decidir qué número.
- Guardar la preferencia de modo noche por usuario en Supabase. En el piloto va en `localStorage`, solo en ese navegador.

## 6. Decisiones que pido aprobar

1. **Letrero = fachada perforada + letras de canal + caja del dodo, con vitrina de cristal debajo.** Alternativa: solo la fachada, con la descripción en blanco sobre naranja (no pasa AA).
2. **Fondo = muro gris perforado + mostrador naranja abajo.** Alternativa más sobria: zócalo de acero o concreto gris y el naranja solo en el letrero.
3. **Rubik** para títulos y cifras; Manrope se queda en el texto.
4. **Botón primario con texto negro** (accesible, como hoy) y no blanco como en el mostrador del local.
5. **El mural de colores no entra**: compite con las gráficas. Sus colores ya están cubiertos por la serie de datos validada.
6. **Piloto `/ventas`.**

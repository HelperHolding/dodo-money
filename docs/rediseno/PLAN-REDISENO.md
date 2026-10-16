# Plan de rediseño — Dodo Money (control de efectivo, ventas, compras y finanzas)

Rama: `rediseno/ui` · Fecha: 2026-10-16 · Estado: **propuesta, pendiente de aprobación**

Hecho con las skills de The Coffee: `ui-ux-pro-max` (sistema de diseño + búsquedas de UX, color, tipografía y gráficas)
y `premium-web-experience` (dashboards, inteligencia de diseño y verificación visual).

---

## 0. Reglas del rediseño

1. **No se tocan datos ni cálculos.** Nada de cambios en Supabase, consultas, `lib/**` de negocio ni rutas/URLs.
   Los 70+ tests de `npm test` deben seguir pasando sin modificarse.
2. **Único cambio de funcionamiento autorizado:** el calendario de Ventas → Tablero (sección 8), y va **al final**.
3. **Rediseño visible, riesgo bajo:** la mayor parte se hace en `app/globals.css` (tokens + clases existentes) y
   con unos pocos componentes nuevos de presentación. Las clases actuales (`.boton`, `.seccion`, `.tabla`…) se
   conservan como API para no reescribir 82 páginas.
4. **Sin dependencias nuevas** salvo que se apruebe (ver 4.6 iconos). Hoy la app no usa Tailwind, shadcn ni librerías
   de gráficas, y así se queda.
5. **Producción en Vercel sale de `main`:** cada fase va en su rama/PR → se revisa en el *Preview* de Vercel → se aprueba
   → se integra. Nada llega a producción sin que lo veas.

---

## 1. Diagnóstico (lo que encontramos en el código)

| Área | Hallazgo | Impacto |
|---|---|---|
| Color | `.boton` ya usa texto negro sobre `#ff4e00` (6.3:1 ✅). El riesgo está en los lugares que ponen blanco sobre naranja (3.3:1, p. ej. el botón de enviar del asistente) y en los focos con naranja claro. | Accesibilidad, legibilidad en sucursal con luz fuerte |
| Color | Además del naranja oficial hay 6 naranjas sueltos (`#ff6900`, `#ff5000`, `#d74400`, `#b84600`, `#a73500`…), 6 tintes y una paleta azul/violeta/ámbar sin tokens. `--tinta-suave` se usa pero **no existe**. | Se ve "armado por partes" |
| Botones | ~15 estilos distintos de botón; radios de 3 a 20 px; dos `<button>` sin estilo. | Inconsistencia, poca intuición |
| Tarjetas KPI | 5 implementaciones distintas de indicador. | El usuario reaprende cada pantalla |
| Insignias/estados | 5+ sistemas de "badge" con tamaños y radios distintos. | Ruido visual |
| Tipografía | Manrope por `<link>` externo (parpadeo de fuente), tamaños en px/rem/em mezclados. | FOUT, jerarquía irregular |
| Iconos | Glifos Unicode (☰ × ▸ ▾ ← ▲ ▼ ⚠) y SVG a mano. | Se ven distinto por sistema operativo |
| Encabezados | 4 patrones de título de página (`.encabezado`, h1 suelto, `.compra-cabecera`, `.ficha-encabezado`). | Navegación poco predecible |
| Navegación | 9 grupos en el menú; "Aperturas" y "Activos" ocupan un grupo para 1 enlace; nombres repetidos ("Recepciones", "Mermas", "Efectivo" ×2, "Gastos" → `/caja-chica`). | Desorientación |
| Estados | **0** `loading.tsx` (pantalla en blanco al cargar), `error.tsx` solo en 4 áreas, vacíos = texto gris sin acción. | Sensación de "se trabó" |
| Tablas | ~26 de 49 tablas se desplazan de lado en celular; `.compra-tabla` fuerza 780 px. | Uso en celular |
| Toque | Botones de 28–36 px (`.aviso-sin-costo-boton`, `.accesos a`, `.check-proveedor`). | Errores al tocar |
| Inline | 77 `style={{}}` en 44 archivos y hex dentro de TSX (aperturas, rappi). | Imposible tematizar |

---

## 2. Dirección visual

**Qué es:** herramienta de operación diaria (gerentes en sucursal, celular) + tablero táctico (admin/corporativo,
escritorio). Se usa muchas veces al día para *leer números y capturar*, no para admirarla.

**Estilo elegido:** *Minimalism & Swiss + Data-Dense Dashboard* (resultado de la skill), sobre la identidad Dodo que
ya existe: barra negra, filete naranja, Manrope.

### Lo que la skill propuso y **rechazamos** (con motivo)

| Propuesta de la skill | Decisión | Motivo |
|---|---|---|
| Primario azul `#2563EB` ("trust blue") | ❌ | Rompe la marca Dodo. El naranja se queda como primario. |
| Tipografía Playfair Display SC + Karla | ❌ | Serif de solo mayúsculas, pensada para menús de restaurante: ilegible en tablas densas. |
| Fira Code / Fira Sans "Dashboard Data" | ❌ | Lenguaje técnico/programador, no de operación de sucursal. |
| Patrón "Hero + Features + CTA" | ❌ | Es de landing page; esta app es interna. |
| Scroll reveal con GSAP | ❌ | Un tablero se lee, no se "descubre". Nada de animaciones al hacer scroll. |
| *On primary* negro sobre naranja | ✅ (adaptado) | Coincide con nuestra medición: negro sobre `#ff4e00` = **6.3:1**. |
| Densidad 8/10, motion 3/10, varianza 3/10 | ✅ | Escala de espacios compacta (8–32 px), movimiento sutil. |
| Data-Dense: KPIs en fila, tablas con encabezado fijo, tooltips, estados de carga | ✅ | Base del tablero de Ventas. |

**El "default" que evitamos:** fondo crema + serif + terracota (el look genérico de "cafetería"). Dodo es negro/naranja,
directo y numérico; lo reforzamos en lugar de suavizarlo.

**Un solo elemento audaz:** el **filete naranja** de la barra superior se convierte en el motivo del sistema: aparece como
indicador de sección activa en el menú, como subrayado de la pestaña activa y como marca del día seleccionado en el
calendario. Todo lo demás, neutro.

---

## 3. Tokens (fuente única en `app/globals.css`)

### 3.1 Color

| Token | Valor | Uso | Contraste medido |
|---|---|---|---|
| `--marca` | `#ff4e00` | Rellenos de botón primario, filetes, día seleccionado | Texto negro encima: 6.3:1 ✅ |
| `--marca-hover` | `#e64600` | Hover/pressed del primario | — |
| `--marca-texto` | `#b83800` | Enlaces, texto naranja, anillo de foco | Sobre blanco: 5.9:1 ✅ |
| `--marca-suave` / `--marca-suave-borde` | `#ffe4d6` / `#ffc7ad` | Rango del calendario, chips activos | — |
| `--fondo` / `--superficie` / `--superficie-2` | `#f4f4f4` / `#fff` / `#fafafa` | Fondo de página, tarjetas, filas alternas | — |
| `--texto` / `--texto-2` / `--texto-3` | `#000` / `#595959` / `#767676` | Principal, secundario, ayudas (mín. 4.5:1) | 21 / 7 / 4.5 ✅ |
| `--borde` / `--borde-fuerte` | `#e3e3e3` / `#c4c4c4` | Separadores, inputs | — |
| `--exito` (+`-fondo`,`-texto`,`-borde`) | `#1f6b4f` | "Cuadra", bajadas buenas | — |
| `--peligro` (+…) | `#c62828` | Diferencias, errores | — |
| `--aviso` (+…) | ámbar `#a15c00` sobre `#fff4e0` | Pendientes, por vencer | — |
| `--info` (+…) | azul `#24528d` sobre `#eaf1fa` | Notas informativas | — |
| `--dato-1…6` | serie categórica validada (naranja, azul, verde, violeta, ámbar, gris) | Gráficas y categorías | Validar con el script de `dataviz` |

- Se eliminan los naranjas sueltos y los hex de TSX (`PanelProyecto`, `PanelRappi`, `ProductosRappi`, `CortePresupuesto`) → tokens.
- Se define `--tinta-suave` (hoy roto) como alias de `--texto-2`.
- Se mantienen los nombres viejos (`--accion`, `--tinta`…) como **alias** durante la migración, para no romper nada.
- Modo oscuro: **fuera de alcance** en esta etapa; los tokens quedan listos para agregarlo después.

### 3.2 Tipografía

- **Manrope** se queda (ya es la marca), pero cargada con `next/font/google` → sin parpadeo y sin petición externa.
- Escala (base 16 px, ratio 1.2): `--t-xs 12` · `--t-sm 14` · `--t-base 16` · `--t-lg 19` · `--t-xl 23` · `--t-2xl 28` · `--t-kpi 32`.
- Pesos: 400 texto, 600 etiquetas, 700 títulos, 800 cifras KPI.
- `font-variant-numeric: tabular-nums` en cifras, tablas, deltas y calendario (ya está en body; se refuerza en componentes).
- `text-wrap: balance` en títulos; ancho máx. de párrafo 70 caracteres.
- Todo en `rem`; se eliminan px sueltos (módulo de usuarios).

### 3.3 Espacio, radios, sombras, movimiento

- Espacios (densidad alta): `4 · 8 · 12 · 16 · 24 · 32`.
- Radios: **4 valores** — `--r-sm 6` (inputs, botones), `--r-md 10` (tarjetas), `--r-lg 16` (modales), `--r-full 999` (chips). Se borran 3/5/8/12/14/18/20.
- Sombras: 2 niveles (`--sombra-1` tarjeta flotante, `--sombra-2` modal/menú). Las tarjetas normales van con borde, sin sombra.
- Movimiento: `--dur-rapida 120ms` (hover/press), `--dur-media 200ms` (abrir/cerrar), salidas más cortas que entradas,
  nunca `transition: all`, y `prefers-reduced-motion` desactiva desplazamientos.

---

## 4. Componentes (esquema de botones, tarjetas, tableros…)

### 4.1 Botones — de ~15 estilos a 4 variantes × 2 tamaños

| Variante | Clase | Aspecto | Cuándo |
|---|---|---|---|
| **Primario** | `.boton` | Relleno `--marca`, **texto negro** 700 | La acción principal de la pantalla (máx. 1 por vista) |
| **Secundario** | `.boton-secundario` | Fondo blanco, borde `--borde-fuerte`, texto negro | Acciones de apoyo (Reporte PDF, Descargar Excel) |
| **Fantasma** | `.boton-fantasma` (nuevo) | Sin borde, texto `--marca-texto` | Acciones terciarias, "Cancelar", "Limpiar" |
| **Peligro** | `.boton-alerta` | Relleno `--peligro`, texto blanco | Eliminar, rechazar |
| **Icono** | `.boton-icono` (nuevo) | 44×44, solo icono + `aria-label` | Flechas del calendario, cerrar, menú |

- Tamaños: normal 48 px de alto (sucursal/táctil) y `.boton-compacto` 40 px (tablas de escritorio).
- Estados obligatorios: hover, `:active` (scale .97 solo en primario), `:focus-visible` (anillo 2 px `--marca-texto` + 2 px de separación), `disabled` (opacidad .45 + cursor), **cargando** (spinner + texto "Guardando…", ancho fijo para que no brinque).
- Se migran los botones raros: `.calendario-flecha`, `.compra-modal-cerrar`, `.aviso-sin-costo-boton` (28→40 px), `.costeo-ordenar`, `.compra-barra .accesos button`, botón de invitar de usuarios, `.chat .nueva`, botones de not-found y los 2 sin estilo de mermas/portal proveedor.
- Verbos consistentes: **Agregar** (crear registro), **Subir** (archivo), **Importar** (carga masiva), **Guardar**, **Descargar**.

### 4.2 Encabezado de página (`components/EncabezadoPagina.tsx`, nuevo)

Un solo patrón para las 82 páginas: migas → título (h1) → subtítulo con contexto (sucursal · periodo) → acciones a la
derecha (en celular, debajo y a todo lo ancho). Reemplaza `.encabezado`, `.compra-cabecera`, `.ficha-encabezado` y el
header viejo de `/cuenta`.

### 4.3 Tarjeta KPI (`components/Indicadores.tsx` como única fuente)

Orden fijo: **etiqueta → cifra → cambio (flecha + signo + %) → contexto**.
- Color del cambio según "más es mejor" por métrica (ya pasa en Costo teórico: ▼ verde). Nunca solo color: siempre flecha y signo.
- Alto igual en toda la fila; contexto anclado abajo.
- Celular: **2 columnas** (hoy se apilan), cifra a `--t-2xl`.
- Las otras 4 implementaciones (`.proveedor-indicador`, `.ap-indicador`, `.ficha-indicadores`, métricas de usuarios) pasan a este componente o a su clase.

### 4.4 Insignias de estado (`.insignia` + modificador)

Un solo chip: radio completo, 12 px, 600, con punto o icono. Variantes: `neutra`, `exito`, `aviso`, `peligro`, `info`, `marca`.
Absorbe `.estado-*`, `.compra-etapa`, `.compra-estado`, `.ficha-estado`, `.ap-estado`, `.proveedor-documento-estado`, `.tags`.

### 4.5 Tablas

- Todas las tablas con más de 4 columnas: `.tabla-tarjetas` en celular **o** contenedor con scroll propio + primera columna fija (`.tabla-comparativo` ya lo hace: se generaliza).
- Encabezado fijo en tablas largas, filas de 40 px en escritorio, cifras alineadas a la derecha.
- Se quita el `min-width: 780px` de `.compra-tabla` y se le da versión tarjeta.
- Las 3 tablas sin clase (`aperturas/inversion`, `ventas/operacion`, `ConvertirPrefactura`) reciben `.tabla`.

### 4.6 Iconos

Reemplazar glifos Unicode por un set SVG único de trazo 1.75 px. Dos opciones:
- **A (recomendada):** `lucide-react` (tree-shakeable, solo se empaquetan los iconos usados).
- **B (cero dependencias):** ampliar `components/IconoInicio.tsx` a un `Icono.tsx` con ~20 trazados copiados de Lucide (licencia ISC).

Iconos decorativos con `aria-hidden`; botones solo-icono siempre con `aria-label`.

### 4.7 Estados de datos (nuevos)

| Estado | Componente | Dónde |
|---|---|---|
| Cargando | `loading.tsx` con **esqueletos** con la forma final (KPIs, gráfica, tabla) | Una por área: ventas, compras, finanzas, aperturas, activos, sucursal, corporativo |
| Vacío | `EstadoVacio` (icono + qué falta + botón de acción) | Reemplaza las 67 `.vacio` donde haya acción posible |
| Error | `error.tsx` con "Reintentar" | Agregar en finanzas, aperturas, activos, asistente, conocimiento, efectivo, administración |
| Refrescando | Indicador discreto "Actualizando…" sin borrar los números viejos | Tablero de Ventas al cambiar periodo/sucursal |

### 4.8 Otros

- **Formularios:** etiqueta visible siempre, ayuda debajo, error junto al campo, un solo estilo de selector de archivo (fusionar `.caja-chica-archivo` y `.rappi-archivo`).
- **Confirmaciones:** sustituir `window.confirm` por un `<dialog>` propio (`ConfirmarDialogo`) con el mismo estilo que los modales de compras. *Mismo flujo, solo cambia cómo se ve.*
- **Avisos:** `Aviso.tsx` se queda; se le agrega icono por tipo y botón de cerrar opcional.
- **Plegables/acordeones:** unificar los 5 acordeones ad-hoc sobre `Plegable.tsx`.
- **Inline styles:** los 77 `style={{}}` pasan a clases.

---

## 5. Navegación e intuición

### 5.1 Menú lateral (`components/MenuLateral.tsx`, `lib/roles.ts` solo etiquetas/agrupación)

Propuesta de grupos (de 9 a 6), **mismos permisos por rol, mismas rutas**:

| Grupo | Contenido |
|---|---|
| **Sucursal** | Inicio, Turnos, Checklists, Arqueo, Cierre, Movimientos, Recepciones de sucursal |
| **Efectivo** | Recolecciones, Efectivo corporativo, Gastos de caja chica |
| **Ventas** | Tablero, Rappi, Conciliación, Operación, Costos, Importar |
| **Compras** | Órdenes, Recepciones de compra, Facturas, Pagos, Proveedores, Artículos, Documentos |
| **Finanzas** | P&L, Nómina, Personal, Retenciones, Mermas (financieras), Parámetros |
| **Proyectos y admin.** | Aperturas, Activos, Conocimiento, Asistente, Usuarios |

- Renombres para quitar ambigüedad (solo texto): "Recepciones" → *Recepciones de sucursal* / *Recepciones de compra*;
  "Gastos" → *Caja chica*; los dos "Efectivo" → *Recolecciones* y *Efectivo corporativo*; "Mermas" (finanzas) → *Mermas en P&L*.
- Iconos por grupo, grupo activo abierto por defecto, el resto recordado en `localStorage`.
- Indicador activo: fondo `#262626` + **filete naranja** (motivo del sistema).
- Celular: el menú sigue como cajón; se agrega **barra inferior fija con 4 accesos** según rol (p. ej. gerente: Inicio · Turnos · Arqueo · Ventas; admin: Ventas · Compras · Finanzas · Menú). Máximo 5 elementos.

### 5.2 Orientación

- Migas en todas las páginas (ya existen) + título consistente (4.2) = el usuario siempre sabe dónde está.
- "← Regresar" único: se eliminan `.compra-regreso` y el "Volver" de `/cuenta`.
- Compras: el menú lleva a la sección; las pestañas de etapa (`NavegacionDocumentos`) se quedan dentro de la página con el mismo estilo que `FichaPestanas` (subrayado naranja).
- Enlaces profundos: filtros y periodos ya viven en la URL; se mantiene.

### 5.3 Microcopy (glosario)

Un archivo `docs/rediseno/glosario.md` con: **Dodo MX** (no "DODO MX"), **Dodo IS** (sistema de ventas), separador `·`,
fechas `vie 9 oct`, moneda `$72,046` (sin decimales en KPIs, con decimales en tablas), mayúscula solo al inicio.

---

## 6. Ventas → Tablero (piloto del rediseño)

Es la pantalla que vio el jefe, así que se rediseña primero y sirve de muestra para las demás.

**Preguntas que responde (en orden):** ¿Cuánto vendí en el periodo? ¿Voy mejor o peor que antes? ¿Qué días y qué
productos lo explican? ¿Hay diferencias contra el cierre del gerente?

**Nuevo orden de la página:**
1. Encabezado: "Ventas" · sucursal · periodo (+ Reporte PDF / Descargar Excel como secundarios).
2. **Barra de periodo** compacta y fija al hacer scroll: chip con `vie 9 – jue 15 oct · 7 días` y selector de sucursal. Al tocarla se abre/cierra el calendario (abierto por defecto en escritorio, cerrado en celular para que los KPIs se vean sin scroll).
3. **KPIs** (Venta total, Pedidos, Ticket promedio, Costo teórico) — 4 en fila / 2×2 en celular.
4. Venta diaria + Mezcla por categoría.
5. Ventas por canal.
6. Top 10 productos, mayor costo, cierre vs. Dodo IS (plegables).

**Calendario (solo visual en esta fase):** días con cifra en `tabular-nums`; extremos del rango en `--marca` con texto
negro (hoy `#b83800` + blanco); rango en `--marca-suave`; "hoy" con contorno; días futuros con 35 % de opacidad;
flechas como `.boton-icono` con icono SVG. Mapa de calor opcional: intensidad del fondo según venta del día.

**Gráficas:** `BarrasVerticales`, `Dona`, `Grafica`, `MapaCalor` toman colores de `--dato-*`; eje en cero; unidades una
sola vez en el título ("miles de MXN"); tooltip también con teclado; tabla oculta para lector de pantalla.

---

## 7. Experiencia por área (resumen)

| Área | Usuario / dispositivo | Cambios clave |
|---|---|---|
| Sucursal (`(app)`, checklists) | Gerente/encargado, **celular** | Botones 48 px, barra inferior, checklists como lista de tareas con progreso, cifras de arqueo grandes |
| Efectivo / Recolecciones | Gerente + corporativo | Tarjetas de saldo unificadas (`.saldo`/`.resultado` → KPI), insignias de estado |
| Ventas | Admin/corporativo, escritorio | Sección 6; Rappi y Conciliación con el mismo encabezado y KPIs |
| Compras (20 páginas) | Admin, escritorio | Tabla→tarjeta en celular, insignias unificadas, modales con `ConfirmarDialogo`, verbos consistentes |
| Finanzas | Admin, escritorio | P&L con colores de sección tokenizados (hoy `#bdd7ee`, `#d9ead3`…), encabezado fijo en tablas |
| Aperturas / Activos / Conocimiento | Admin | Quitar estilos inline y hex, mismas tarjetas KPI |
| Usuarios / Cuenta | Admin / todos | Migrar `usuarios.module.css` a tokens; `/cuenta` dentro del `Marco` normal |
| Login / 404 | Todos | Mismo sistema de botones y logo |
| Reportes PDF / orden de compra | Impresión | **No se tocan** (formato de impresión propio) |

---

## 8. Cambio de funcionamiento: calendario sin botón "Ver este periodo"

**Pedido:** que los datos se actualicen solos al elegir, sin botón intermedio.

**Hoy** (`components/CalendarioVentas.tsx` + `lib/ventas/calendario.ts`): 1er toque = inicio, 2º toque = fin, y hay que
presionar "Ver este periodo" para recargar `/ventas?desde=…&hasta=…`.

### Comportamiento propuesto (opción A — la tuya, recomendada)

| Acción | Resultado |
|---|---|
| **Doble clic / doble toque en un día** | Carga ese día de inmediato. |
| **1 toque en un día** | Se marca como inicio y aparece: *"Toca otro día para elegir el rango, o vuelve a tocar este para ver solo ese día."* No se recarga nada todavía. |
| **2º toque en otro día** | Se arma el rango (si es anterior, se acomoda) y **se cargan los datos automáticamente**. |
| Rango mayor a `MAX_DIAS` | No carga; mensaje de error y se conserva el primer día marcado. |
| `Esc` o "Limpiar" | Cancela la selección a medias y vuelve al periodo cargado. |
| Mientras carga | La rejilla queda `aria-busy`, el chip del periodo dice "Actualizando…", los números anteriores siguen visibles. |

**Detalle técnico clave:** el "doble clic" no necesita un evento aparte. `elegirDia()` ya convierte dos toques en el
mismo día en un rango de 1 día (`{inicio: d, fin: d}`), así que **"doble toque" y "segundo toque" son la misma regla**:
cuando la selección queda completa → se navega. Funciona igual con mouse, celular y teclado (Enter dos veces), sin
depender de `dblclick`, que en móvil no es confiable.

**Cambios de código previstos (chicos):**
- `CalendarioVentas.tsx`: al hacer `setSel`, si la nueva selección tiene `fin` y no excede `maxDias` → `ir(rango, sucursal)`. Se quita el botón; el pie queda como texto de estado (`aria-live`).
- `lib/ventas/calendario.ts`: función pura `debeCargar(sel, maxDias)` + tests en `calendario.test.ts` (mismo día dos veces, rango invertido, exceso de días, selección incompleta).
- Teclado: flechas para moverse por la rejilla (`role="grid"` correcto con filas), Enter/Espacio para elegir.
- La sucursal ya se aplica sola al cambiar el selector; no cambia.

### Opción B (alternativa, por si el jefe la prefiere)
1er toque carga ese día de inmediato; un 2º toque en otro día extiende a rango y vuelve a cargar. Más inmediato, pero
hace una consulta extra por cada rango y la leyenda cambia de sentido después de cargar. **Recomendamos A.**

---

## 9. Fases y entregables

Cada fase = 1 PR desde `rediseno/ui` (o sub-rama) con Preview de Vercel y capturas antes/después.

| Fase | Contenido | Archivos principales | Tamaño |
|---|---|---|---|
| **F1 · Fundaciones** | Tokens (3), `next/font`, alias de variables viejas, foco, contraste del primario, radios | `app/globals.css`, `app/layout.tsx` | M |
| **F2 · Componentes base** | Botones (4.1), `EncabezadoPagina`, KPI único, insignias, iconos, `EstadoVacio`, `ConfirmarDialogo`, esqueletos | `components/*` nuevos + CSS | M |
| **F3 · Navegación** | Menú en 6 grupos, renombres, iconos, barra inferior móvil, `/cuenta` en el Marco | `MenuLateral.tsx`, `lib/roles.ts` (solo etiquetas/orden), `Marco.tsx` | M |
| **F4 · Ventas (piloto)** | Sección 6 completa | `app/ventas/page.tsx`, gráficas, calendario (visual) | M |
| **F5 · Sucursal y efectivo** | Pantallas de celular | `app/(app)/**`, recolecciones, efectivo | L |
| **F6 · Compras, finanzas y resto** | Tablas, insignias, inline styles, hex en TSX | `app/compras/**`, `app/finanzas/**`, aperturas, activos, usuarios | L |
| **F7 · Estados de datos** | `loading.tsx` y `error.tsx` por área, vacíos con acción | `app/**/loading.tsx`, `error.tsx` | S |
| **F8 · Calendario automático** | Sección 8 | `CalendarioVentas.tsx`, `lib/ventas/calendario.ts` + test | S |
| **F9 · QA final** | Checklist (10) en todas las áreas | — | S |

---

## 10. Verificación (definición de terminado)

Por cada PR:
- `npm run typecheck`, `npm test`, `npm run build` en verde.
- Revisión en navegador a **375, 768, 1280 y 1440 px**: sin scroll horizontal de página, nada recortado.
- Contraste medido en el DOM (texto ≥ 4.5:1, componentes ≥ 3:1), objetivos táctiles ≥ 44 px medidos tras el layout.
- Teclado: todo alcanzable, foco visible, `Esc` cierra menú/modales.
- `prefers-reduced-motion` respetado.
- **Línea base:** mismas cifras antes y después en Ventas, Arqueo, P&L y una orden de compra (los números no deben cambiar).
- F8: probar día suelto, rango normal, rango invertido, rango > máximo, cambio de sucursal, cambio de mes a mitad de selección.

---

## 11. Decisiones pendientes

1. ¿Aprobado el orden de fases (rediseño primero, calendario al final)?
2. Calendario: **opción A** (doble toque = día, toque + toque = rango) u opción B.
3. Iconos: `lucide-react` (A) o SVG propios sin dependencia (B).
4. ¿Barra inferior en celular para gerentes? (cambia la navegación diaria de sucursal).
5. Renombres del menú: confirmar con quienes lo usan antes de F3.

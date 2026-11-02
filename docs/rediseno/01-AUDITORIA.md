# Auditoría visual de Dodo MX (Fase A del rediseño «sucursal»)

Fecha: 2026-11-02 · Rama base: `feat/rappi-api-importar` (77dda7a) · Solo lectura: no se cambió código.

## 0. Estado de las capturas

**Pendiente.** En local la app no arranca con datos porque `.env.local` solo tiene el token de Vercel. Faltan
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y sin ellas el middleware responde 500 en todas las rutas.
Tampoco hay Docker ni el CLI de Supabase para levantar una base local. Hay dos opciones (las decide Carlo):

1. **Recomendada:** Carlo pone las dos variables públicas en `.env.local` (las mismas de Vercel), corre `npm run dev`
   e inicia sesión en el panel del navegador. Después saco las capturas de cada ruta a 1366 px y a 375 px con Playwright,
   que ya está en el repo (`playwright-core`, se probó con Edge).
2. Carlo inicia sesión en producción en el panel del navegador y saco las capturas de ahí. Así solo se ve «antes».

Las capturas van a `docs/rediseno/capturas/antes/<area>/<ruta>-{escritorio,movil}.png`.

## 1. Stack y capa visual

| Tema | Estado actual |
|---|---|
| Framework | Next.js 15.5 (App Router) + React 19.1, TypeScript. **Sin** Tailwind, shadcn, Radix ni librerías de gráficas o iconos |
| Estilos | `app/globals.css` (1268 líneas, tokens en `:root` 6-104) + 4 CSS modules (usuarios, chat, AdvertenciasPL, not-found) |
| Tipografía | Manrope por `next/font` (`--fuente-manrope`), escala `--t-xs` a `--t-kpi`, cifras con `tabular-nums` |
| Color | Naranja `--accion` #ff4e00 (solo rellenos y líneas; `--accion-oscuro` #b83800 para texto), negro, grises con contraste medido, estados `--cuadra`/`--alerta`/`--aviso`/`--info`, serie de datos validada `--dato-1..4` |
| Medidas | Espacios `--e-1..6`; radios 6/10/16/999; 2 sombras; `--dur-rapida`/`--dur-media`; `prefers-reduced-motion` global |
| Gráficas | Componentes propios en SVG/CSS: `Grafica`, `BarrasVerticales`, `Dona`, `MapaCalor`, `Franjas`, `CalendarioVentas`, `VentasPorCanal` |
| Iconos | `components/Icono.tsx` (trazos tipo Lucide copiados, sin dependencia) |
| Estilos en línea | 61 `style={{}}` en 41 archivos; la mayoría son anchos dinámicos de barras |
| Archivos minificados | Varios TSX están en una sola línea (aperturas, asistente, conocimiento, `DashboardVentasInicio`, `recolecciones/page`). Al tocarlos, el diff debe ser mínimo y no se deben reformatear |

Antecedente: el rediseño F1–F9 (`PLAN-REDISENO.md`, `QA-FINAL.md`) ya unificó tokens, botones, KPIs, insignias, encabezado,
carga y error. **Este rediseño se monta sobre esa base:** cambia materiales y atmósfera, no vuelve a inventariar componentes.

## 2. Marco

- **Escritorio:** `Marco.tsx` es una rejilla con lateral negro de 264 px (`.lateral`, sticky, filete naranja de 4 px a la derecha) y `main.pagina`.
  - Los grupos del menú son `<details>` con título gris en mayúsculas e icono.
  - El enlace activo lleva fondo #262626 y borde izquierdo naranja.
  - Pie con usuario, rol, «Mi contraseña» y «Salir».
- **Celular (≤ 900 px):** `.franja-movil` (negra, sticky, filete naranja), cajón lateral con velo y `.barra-inferior` blanca con 3 accesos según el rol + Menú.
- **`(app)/layout.tsx`** agrega `.franja-lectura` (corporativo «Solo lectura» o selector «Operando en» para admin).
- **`EncabezadoPagina`** (h1 + descripción + acciones) es el título único. Las migas las pone `Marco`, arriba.
- **Fondo:** `--papel` blanco liso. No hay textura, no hay modo noche y las tarjetas son blancas con borde, sin sombra.

## 3. Estados

| Estado | Hoy |
|---|---|
| Carga | `CargandoPagina` (variantes «tablero» y «lista»): esqueletos grises con brillo, `role="status"`. Hay `loading.tsx` en todas las áreas con Marco |
| Error | `ErrorPagina`: recuadro blanco, borde izquierdo rojo, icono, digest y «Intentar de nuevo». Hay `error.tsx` en todas las áreas (en `/cuenta` solo error) |
| Vacío | `EstadoVacio` en pocas pantallas; quedan ~67 `.vacio` de texto gris |
| Pop-ups | **No hay tooltip propio.** Solo atributos `title` (`Indicadores.tsx:36`, `CalendarioVentas.tsx:82`, `TablaPL.tsx:78-79`), el recuadro de `AvisoSinCosto` y `<dialog>` en compras |
| Impresión | Reglas `@media print` en globals 683, 804, 824, 1019, 1028, 1139 y 1185, en `AdvertenciasPL.module.css:14` y en `.no-imprimir`. **No se deben romper** |

## 4. Inventario por ruta

«Texto → pop-up» marca la información secundaria que hoy está en pantalla y es candidata a pasar a un pop-up.
Captura: ⏳ en todas las filas (ver §0).

### Sucursal — `app/(app)/*` (Marco de sucursal)

| Ruta | Qué es | Bloques | Texto → pop-up |
|---|---|---|---|
| `/` | Inicio: saldos, pendientes, accesos. Admin y corporativo ven además `DashboardVentasInicio` | EncabezadoPagina, KPIs `.ficha-indicadores`, BarrasVerticales, Dona, tabla-tarjetas | `page.tsx:76`, `:103` |
| `/arqueo` | Arqueo de turno | conteo por denominación, tabla-tarjetas | `:42` |
| `/caja-chica` | Gastos | tarjetas, acordeón, form, tabla | `:54` |
| `/cierre` | Cierre del día | forms, tabla | `:80`, `:118` |
| `/movimientos` | Movimientos entre cajas | form, tabla-tarjetas | `:30` |
| `/recepciones` | Recepciones en tienda | PestanasRecepciones, Plegable, tarjetas | `:35` |
| `/turnos`, `/turnos/[id]` | Turnos del día y detalle | tarjetas, tablas | `turnos:26` |
| `/checklists` | Resumen | Avance, Franjas ×3, Plegable ×6 | `:96`, leyenda `:105` |
| `/checklists/amasado` · `limpieza-profunda` · `masa` · `mermas` · `objetivos` · `recorrido` · `ronda` · `turno` | Listas operativas | forms, tarjetas `.zona`, tabla-tarjetas | 1 párrafo de instrucción en cada una (`:21`–`:51`) |

### Efectivo y corporativo

| Ruta | Qué es | Bloques | Texto → pop-up |
|---|---|---|---|
| `/efectivo` | Salidas a corporativo | tarjetas, forms | `:76` |
| `/recolecciones`, `/recolecciones/[id]` | Recolecciones | filtros, EstadoVacio, tabla-tarjetas | `:27`, `[id]:18` |
| `/corporativo` | Vista general | DashboardVentasInicio, tarjetas por sucursal | textos del tablero |

### Ventas — `ventas/*`

| Ruta | Qué es | Bloques | Texto → pop-up |
|---|---|---|---|
| `/ventas` | **Tablero de ventas** | CalendarioVentas, Indicadores, Grafica ×9, BarrasVerticales, Dona, MapaCalor, VentasPorCanal, Plegable ×10, AvisoSinCosto | `:113`, `:133`, `:219-220` |
| `/ventas/rappi` | Rappi | `.ap-panel` con dona, `.rappi-barra`, tabla | `:22`, `:25` |
| `/ventas/conciliacion` | Conciliación Dodo IS | forms | `:31`, `:38` |
| `/ventas/importar` | Importar | forms | — |
| `/ventas/operacion` | Indicadores de Analytics | tabla | `:13` |
| `/ventas/costos` (+ `calculadora`, `cargar`, `materiales`, `insumos/[ref]`, `productos/[id]`, `recetas/[clave]`) | Costeo | BusquedaUrl, tarjetas, FichaPestanas, tablas | `calculadora:15`, `materiales:21`, `productos:29` |

### Compras — `compras/*`

| Ruta | Qué es | Texto → pop-up |
|---|---|---|
| `/compras` | Proveedores (SelectorVista) | — |
| `/compras/documentos` | Cotizaciones, órdenes y facturas | `:44` |
| `/compras/articulos` · `cargar` | Artículos y carga | `:76`, `:18` |
| `/compras/facturas` (+ `[id]`, `empresa`, `nueva`, `subir`) | Facturas | `:39`, `[id]:154/165/201`, `empresa:26`, `nueva:26`, `subir:13` |
| `/compras/ordenes` (+ `[id]`, `[id]/comparar`, `nueva`) | Órdenes | `:57`, `[id]:115`, `comparar:34`, `nueva:23` |
| `/compras/pagos` (+ `[id]`, `nuevo`, `programar`, `reservas`) | Pagos | `:135`, `[id]:58`, `nuevo:50`, `reservas:20` |
| `/compras/proveedores/[id]` · `nuevo` | Proveedor | `nuevo:14` |
| `/compras/razones-sociales` | Empresas del grupo | `:11-12` |
| `/compras/recepciones` | Recepciones de compras | `:89`, `:115` |

### Finanzas — `finanzas/*`

| Ruta | Qué es | Texto → pop-up |
|---|---|---|
| `/finanzas` | P&L (`.tabla-pl`, comparativo deslizable) | `:41`, `:43`, `:76` |
| `/finanzas/mermas` · `nomina` · `parametros` · `personal` (+ `[id]`) · `retenciones` | Formularios y tablas | 1–2 párrafos en cada una |

### Proyectos, conocimiento y administración

| Ruta | Qué es | Texto → pop-up |
|---|---|---|
| `/aperturas` (+ `[id]`, `[id]/items/[item]`, `inversion`) | Aperturas: `.ap-indicadores`, Dona ×2, roadmap | `:7`, `[id]:29`, `inversion:17` |
| `/activos` (+ `[id]`, `nuevo`) | Activos | `:20` |
| `/conocimiento` (+ manuales y preguntas) | Manuales | `:13` |
| `/asistente` | Chat IA (`chat.module.css`) | `:3` |
| `/administracion/usuarios` | Usuarios (`usuarios.module.css`) | `:17` |
| `/cuenta` | Contraseña | — |

### Sin Marco

`/login`, `/invitacion` (acceso) y las vistas de impresión `/reporte/dia`, `/reporte/pl`, `/reporte/turno/[id]`,
`/reporte/ventas` y `/orden-compra/[id]`. **Las de impresión quedan fuera del tema:** se imprimen en blanco y negro como hoy.

## 5. Roles y pantalla principal

| Rol | Ve | Pantalla principal |
|---|---|---|
| encargado | Sucursal | `/` (operación) |
| gerente | Sucursal + Ventas de su sucursal | `/` (operación); su tablero es `/ventas` |
| corporativo | Solo lectura: Vista general, Ventas, Compras, Finanzas, Efectivo | `/corporativo` |
| admin | Todo | `/`, con `DashboardVentasInicio` arriba |

## 6. Hallazgos para el rediseño

1. La base de tokens es sólida y está medida (AA). El tema nuevo se agrega como **capa de tokens de sucursal**, sin romper los nombres actuales.
2. Casi todas las pantallas abren con un párrafo de instrucción bajo el título. Es el principal candidato a pop-up: un botón (i) en el letrero.
3. Las tarjetas son blancas sobre blanco y no hay jerarquía de superficie. El cristal sobre un fondo con material resuelve eso.
4. No hay un pop-up accesible reutilizable. Hace falta uno (hover, toque y teclado) que sustituya los `title`.
5. El lateral ya es oscuro y el filete naranja ya es el motivo de la marca, así que se puede conservar y darle material.
6. Las vistas de impresión y las reglas `@media print` son una restricción dura.

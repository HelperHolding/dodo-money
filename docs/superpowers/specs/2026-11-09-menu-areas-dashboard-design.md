# Menú por áreas y dashboard de inicio (diseño)

**Fecha:** 2026-11-09 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Hoy el menú lateral tiene ~45 páginas en 10 grupos plegables (Sucursal, Tareas, Efectivo, Ventas, Compras, Inventario,
Finanzas, Catálogos, Proyectos y admin., Conocimiento, Correos). Cuesta encontrar las cosas y el inicio de admin y
corporativo es un bloque de ventas con filtros, KPIs, barras, dona y una tabla por canal.

Se toma como referencia la captura de «Centro operativo» que compartió Sebastián (menú negro con secciones y áreas con
ícono, fondo beige, tarjetas blancas redondeadas, «Order sources» en dona y «Historical Performance» en línea):

1. **Menú por áreas con pestañas.** El menú solo lista áreas con ícono bajo encabezados de sección; las subpáginas de
   cada área aparecen como pestañas arriba de la página. Ninguna página cambia de ruta.
2. **Dashboard de inicio para admin y corporativo** con KPIs, orígenes de pedidos, venta diaria e historial de ventas.

**Éxito:** un corporativo abre la app y ve en el menú unas 15 áreas en vez de 45 enlaces; entra a «Compras» y arriba
de la página ve las pestañas Proveedores · Artículos · Compras y facturas · Recepciones · Pagos · Reservas. En su
inicio ve las cuatro cifras del mes con su cambio, la dona de orígenes (mostrador, app, sitio, agregadores…) con
pedidos y %, la venta diaria y la línea de venta de los últimos 12 meses, y puede cambiar a semanal o anual y a
«Toda la red».

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Páginas que no caben en el menú | Pestañas del área, generadas automáticamente por el `Marco` según la ruta |
| Dónde se define el menú | Un solo lugar: `lib/roles.ts` (áreas, ícono, sección y pestañas, filtradas por puesto como hoy) |
| Quién ve el dashboard nuevo | Admin (inicio `/`) y corporativo (inicio `/corporativo`). Gerente y operación conservan su inicio operativo con el estilo nuevo |
| Bloques del dashboard | KPIs del periodo, Orígenes de pedidos, Venta diaria, Historial de ventas. **Sin** «contra año anterior». Se quita la tabla por canal |
| Selector de sucursal | Se queda donde está (filtros del dashboard y vista general). No pasa al menú: cambiaría qué datos ve cada página |
| Rutas, permisos y datos | Sin cambios. Sin migraciones |
| Marketing | Sigue entrando directo a Correos con su menú propio |

## 3. Menú por áreas

### 3.1 Áreas

Cada puesto ve solo las áreas y pestañas que hoy le muestra `menuLateral(rol)`; un área sin pestañas visibles no
aparece. Un área con una sola página no muestra pestañas.

| Sección | Área | Ícono (`Icono`) | Pestañas (ruta) |
|---|---|---|---|
| General | Inicio (o «Vista general» en corporativo) | `casa` | — (`/` o `/corporativo`; corporativo además «Inicio de sucursal» `/`) |
| | Tareas | `lista` | Mis tareas `/tareas` · Tablero `/tareas/tablero` |
| | Ventas | `grafica` | Tablero `/ventas` · Rappi `/ventas/rappi` · Conciliación `/ventas/conciliacion` · Importar `/ventas/importar` · Dodo IS `/ventas/dodois` · Costeo `/ventas/costos` |
| Operación | Operación diaria | `tienda` | Arqueo `/arqueo` · Movimientos `/movimientos` · Gastos `/caja-chica` · Cierre `/cierre` · Checklists `/checklists` · Turnos `/turnos` |
| | Efectivo | `billete` | Recolecciones `/recolecciones` · Salidas a corporativo `/efectivo` |
| | Compras | `carrito` | Proveedores `/compras` · Artículos · Compras y facturas · Recepciones · Pagos · Reservas de bóveda · Cargar Excel (mismas rutas y alias de hoy) |
| | Inventario | `bandeja` | Insumos Dodo IS `/inventario` · Uniformes `/inventario/uniformes` |
| Finanzas | P&L | `documento` | P&L `/finanzas` · Flujo de efectivo `/finanzas/flujo` · Mermas Dodo IS `/finanzas/mermas` · Parámetros y metas `/finanzas/parametros` |
| | Banca | `banco` | — (`/banca`) |
| | Nómina | `cartera` | Nómina `/finanzas/nomina` · Personal `/finanzas/personal` · Retenciones `/finanzas/retenciones` |
| | Catálogos | `libro` | Todos `/catalogos` · Cuentas contables `/finanzas/catalogo` · Asignación `/finanzas/asignacion` · Razones sociales `/compras/razones-sociales` |
| Proyectos | Aperturas · Activos · Cumplimiento · Usuarios y sucursales | `maletin` · `termometro` · `calendario` · `nombre` | — (una página cada una) |
| Marca | Correos | `brillo` | Campañas `/correos` · Contactos `/correos/contactos` · (las mismas de hoy) |
| Inteligencia | Conocimiento | `info` | Manuales y Q&A `/conocimiento` · Asistente IA `/asistente` |

Los íconos salen de `components/Icono.tsx` (los nombres listados ya existen). Si al implementar uno se ve mal, se
cambia por otro existente; no se agregan librerías de íconos.

Las páginas que hoy dependen de condiciones (`puedeImportarVentas`, `puedeEditarCompras`, `rol === "admin"`, etc.)
conservan exactamente esas condiciones. Los `aliases` y `contador` (tareas abiertas) se conservan.

### 3.2 Estructura de datos

En `lib/roles.ts`:

```ts
export type Area = { clave: string; texto: string; icono: NombreIcono; seccion: Seccion; enlaces: Enlace[] };
export type Seccion = "General" | "Operación" | "Finanzas" | "Proyectos" | "Marca" | "Inteligencia";
export type Menu = { inicio: Enlace; areas: Area[] };
```

- `menuLateral(rol)` devuelve áreas en vez de grupos. El `href` de un área es el de su primera pestaña visible.
- `enlacesDelMenu(menu)` sigue devolviendo todas las páginas (lo usan el buscador y las migas).
- `grupoAbierto` se reemplaza por `areaActiva(menu, ruta)`: el área cuya pestaña coincide con la ruta (misma regla
  de prefijo y alias que hoy; gana la coincidencia más larga).
- `accesosRapidos(rol)` (barra inferior en celular) no cambia.

### 3.3 Componentes

- **`MenuLateral`**: identidad de la sucursal en una tarjeta arriba, buscador, interruptor de noche, y debajo las
  secciones con sus áreas (ícono + texto + contador). Sin `<details>` plegables. El área activa con fondo más claro
  y filete naranja. En celular sigue siendo cajón.
- **`PestanasArea`** (nuevo, cliente): lee la ruta con `usePathname`, busca el área activa y pinta sus pestañas como
  `<nav aria-label="Secciones de {área}">` con `aria-current="page"` en la actual. Con una sola pestaña no pinta nada.
  En celular desplaza horizontalmente.
- **`Marco`**: pone `<PestanasArea menu={menu} />` arriba del contenido, debajo de las migas.
- **`MigasDePan`** y `BuscadorPaginas`: se adaptan al nuevo tipo `Menu` sin cambiar su comportamiento.

Las páginas que ya tienen pestañas propias (`PestanasRecepciones`, `FichaPestanas`, `.compra-etapas`) se quedan: son
de segundo nivel dentro de una página.

## 4. Dashboard de inicio (admin y corporativo)

Se rediseña `components/DashboardVentasInicio.tsx`, que ya usan `/` (admin) y `/corporativo`. Mismos parámetros
(`ventas_mes`, `ventas_sucursal`) y misma regla de periodo (`periodoInicioVentas`).

De arriba hacia abajo:

1. **Cabecera:** «Dashboard de ventas», sucursal y periodo, y los filtros de mes y sucursal (iguales que hoy) y el
   botón «Abrir reporte de ventas».
2. **KPIs del periodo:** venta con IVA, venta neta, pedidos y ticket, cada uno con su chip ▲/▼ contra el periodo
   anterior (lógica actual, estilo de tarjetas de la captura).
3. **Dos tarjetas lado a lado** (una debajo de otra en celular):
   - **Orígenes de pedidos:** dona + lista con pedidos y % por origen. Orígenes: los de `separarDesglose().origen`
     (centro de llamadas, sitio, app, agregador) y **Mostrador** = pedidos del periodo menos la suma de esos orígenes.
     Rappi (n8n) se suma a «Agregadores» **solo si** no viene ya en el agregador de Dodo IS: al implementar se
     compara un mes real (pedidos de agregador en Dodo IS vs órdenes de Rappi); si coinciden, Rappi no se suma otra
     vez. El resultado queda escrito en el PR. Orígenes con 0 pedidos se muestran en la lista con 0 % (como la
     captura) pero no en la dona.
   - **Venta diaria:** las barras de hoy (`BarrasVerticales`).
4. **Historial de ventas:** título grande, línea naranja de venta con IVA con puntos, eje de montos abreviado
   ($200k), y dos controles:
   - **Periodo:** Semanal (últimas 12 semanas) · Mensual (últimos 12 meses, por defecto) · Anual (todos los años con
     datos). El mes en curso va hasta hoy y se marca como parcial.
   - **Alcance:** «Esta sucursal» · «Toda la red». Con «Todas las sucursales» en el filtro solo existe «Toda la red».
   Los controles son enlaces con parámetros (`hist`, `alcance`), sin JavaScript obligatorio; la gráfica es SVG
   propio (como `CurvaAcumulada`), sin librerías nuevas. Las fechas sin importación no se dibujan como cero.
5. Nota al pie actual (comparación y advertencia de importaciones), más «Mostrador se calcula como el resto».

Se quita la tabla «por canal» (la dona de orígenes la reemplaza). Lo que hoy va debajo del dashboard en cada inicio
(vista general por sucursal, efectivo en camino y pagos en corporativo; pendientes y alertas en admin) no cambia.

## 5. Aspecto

- Fondo de página beige (`--papel-2` del brandbook) en la zona de contenido; tarjetas blancas con radio `--r-lg`
  (16 px) y sin sombra.
- Menú negro; área activa `--oscuro-activo` con filete naranja; encabezados de sección en gris pequeño.
- Títulos grandes de bloque («Historial de ventas») en `--display` 800.
- Dona con la serie categórica validada (`--dato-*`); línea del historial en `--accion`.
- Modo noche: mismos tokens de `app/marca.css`.

## 6. Riesgos

- **Encontrar páginas:** quien conoce el menú actual tendrá que aprenderse las áreas. Mitigación: el buscador de
  páginas sigue encontrando todas por nombre y alias.
- **Ruta en dos áreas:** `/recepciones` (gerente) y `/compras/recepciones`; se resuelve con los alias actuales.
- **Doble conteo de Rappi** en orígenes: se verifica con datos reales antes de sumar (punto 4.3).
- **Historial pesado:** 12 meses de toda la red puede ser mucha lectura. Se consulta solo `fecha` y `total` agregados
  por día (o con la función de agregado que ya usa el reporte de ventas); si tarda más de 2 s se mueve a una consulta
  agregada en SQL (migración aparte, entregada a Sebastián).

## 7. Pruebas

- Unitarias (node `--test`), en `lib/roles.test.ts` y nuevas en `lib/ventas/`:
  - Cada puesto ve exactamente las mismas páginas que hoy (`enlacesDelMenu` antes = después, por rol).
  - `areaActiva` para rutas con prefijo, alias y la raíz.
  - Orígenes: mostrador como resto, sin negativos, porcentajes que suman 100 %.
  - Historial: agrupación semanal/mensual/anual, mes parcial, días sin datos fuera.
- `npm run typecheck` y `npm test`.
- Revisión en el navegador del preview de Vercel por Sebastián (pantallas con sesión), de día y de noche, 1280 y 375 px.

## 8. Entrega

Rama `feat/menu-areas-dashboard` desde `origin/main`, un PR a `main`. Sin migraciones salvo que el historial lo
requiera (riesgo 6.4), en cuyo caso se entrega a Sebastián antes de publicar.

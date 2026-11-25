# Cierre del día: ventas de Dodo MX a la vista e IVA calculado (HD-10) — diseño

Fecha: 2026-11-25 · Ticket: HD-10 (Sebastián) · Responsable: Sebastián

## Objetivo

Que quien hace el corte vea, en el momento de capturarlo, las ventas que Dodo MX ya sincronizó de Dodo IS. Así puede notar un error antes de guardar. Además, que el IVA ya no se capture a mano.

## Hallazgos que fijan el diseño

- Los cortes los hacen usuarios con rol **encargado**: Brandon, Gael y Miguel. Ese rol no puede leer `ventas_dia`, porque `ve_ventas()` solo deja a gerente y admin de la sucursal (`0006_ventas_costos.sql`).
- En el cierre, el encargado teclea efectivo, tarjeta, app, Rappi, descuentos, IVA y transacciones. `venta_total` y `venta_neta` son columnas calculadas (`0001_control_efectivo.sql`).
- Comparé los 12 últimos cierres de La Calma con `ventas_dia`:
  - **Hasta el 24-oct**, efectivo y tarjeta cuadran al peso.
  - **Desde el 30-oct**, Dodo IS registra casi todo como efectivo y la tarjeta en $0. El 22-nov fueron 58 «Cash», 1 «Card» y 41 «Aggregator» según la API cruda. El cierre, en cambio, trae la tarjeta real de la terminal ($11,471.50). Es decir, en la caja de Dodo IS se cobra con tarjeta pero se registra como efectivo.
  - **En 6 de 12 cierres, el campo «IVA incluido» tiene la venta total.** Por ejemplo, el 22-nov tiene IVA $26,295.50 sobre $26,296. Esto deja mal la venta neta.
  - El IVA de Dodo IS es la venta × 16/116 con diferencia de centavos (redondeo por producto). Ejemplos: $17,068.00 → $2,354.21 contra $2,354.19, y $19,900.80 → $2,744.94 contra $2,744.87.
  - Rappi no está en `ventas_dia`: la sincronización ignora los pedidos «Aggregator», porque Rappi sale del portal (n8n).

## Decisiones

1. **IVA calculado.**
   - Se quita el campo «IVA incluido» del cierre. Al guardar, el servidor calcula `iva = round(venta_total × 16 / 116, 2)`, con `venta_total = efectivo + tarjeta + app + rappi`.
   - El formulario muestra, y recalcula mientras se captura: «Venta total $X · IVA $Y · Venta neta $Z».
2. **Comparación con Dodo MX en el paso 1** («Ventas según Dodo IS»). No bloquea el cierre y no guarda nada nuevo.

   | Campo | Se compara con | Aviso |
   |---|---|---|
   | Efectivo | `ventas_dia.efectivo` | Diferencia mayor a $1 |
   | Tarjeta | `ventas_dia.tarjeta` | Diferencia mayor a $1 |
   | Efectivo + tarjeta | `efectivo + tarjeta` de Dodo MX | Si la suma cuadra (±$1) pero por separado no: «En Dodo IS se registró tarjeta como efectivo» |
   | Transacciones | `ventas_dia.pedidos` | Solo informativo («Dodo MX: N pedidos sin Rappi») |
   | App, Rappi, descuentos | — | No se comparan: Rappi y app no salen de `ventas_dia` de forma confiable |

   - Arriba aparece «Ventas en Dodo MX a las {HH:MM}», que es la hora de `importaciones_ventas.importado_en`. Si no hay fila del día: «Aún no hay ventas sincronizadas de hoy; se actualizan cada 20 min».
   - Si la fila del día vino de Excel (`formato<>'api'`), la hora se toma igual.
3. **Permisos.** Nueva función `ventas_para_cierre(p_fecha date)`, `security definer set search_path=''`.
   - Devuelve `(efectivo, tarjeta, en_linea, iva, total, pedidos, actualizado_en)` de `ventas_dia` de **la sucursal del usuario** (`mi_sucursal()`) para esa fecha, solo si `mi_rol()` es encargado, gerente o admin.
   - Si no, error «Solo quien cierra el día puede ver estas ventas».
   - Si no hay fila, no devuelve filas.
   - No abre el módulo Ventas ni cambia `ve_ventas`.
4. **Corrección del IVA de cierres pasados** (opcional, la corre Sebastián): `supabase/correcciones/2026-11-25_iva_cierres.sql`.
   - Primero un `select` que lista los cierres con `iva > venta_total × 0.2`, con su IVA actual y el recalculado.
   - Después un `update cierres_dia set iva = round(venta_total*16/116,2) where iva > venta_total*0.2`, dentro de `begin … commit` y con el conteo esperado en un `do` que aborta si no coincide.
   - Antes de correrlo, Sebastián confirma con el `select`.

## Código

- **Migración `supabase/migrations/20261125150000_ventas_para_cierre.sql`:** la función, más `revoke` a public/anon y `grant execute` a authenticated.
- **Prueba `supabase/pruebas/20261125150000_ventas_para_cierre.sql`:** termina en «PRUEBAS OK».
- **`lib/cierre/ventasDodo.ts`** (puro):
  - `ivaDeVenta(total)`;
  - `compararVentas(capturado: {efectivo, tarjeta, transacciones}, dodo: {efectivo, tarjeta, pedidos} | null)`, que devuelve los avisos por campo y si el caso es «tarjeta como efectivo».
- **`app/(app)/cierre/VentasCierre.tsx`** (cliente):
  - el paso 1 completo, con los mismos `name` que hoy salvo `iva`, que se elimina;
  - lee los campos con estado local y pinta debajo de cada uno «Dodo MX: $X» y su aviso;
  - muestra la línea de venta total, IVA y venta neta.
- **`app/(app)/cierre/page.tsx`:**
  - llama a `ventas_para_cierre(hoy)`; si falla, el paso 1 aparece sin comparación;
  - pasa los datos a `VentasCierre`;
  - cambia el texto de `info` para quitar «se copian del reporte» si conviene.
- **`app/(app)/cierre/actions.ts`:** `iva: ivaDeVenta(efectivo + tarjeta + app + rappi)`; ya no lee `formData.get("iva")`.

## Pruebas

- **Unitarias** de `ivaDeVenta` (17068 → 2354.21) y de `compararVentas`:
  - cuadra;
  - efectivo distinto;
  - «tarjeta como efectivo» (22-nov: capturado 5732 + 11471.50, Dodo 17068 + 0; la suma 17203.50 ≠ 17068, así que es diferencia normal);
  - un caso donde la suma cuadra y el reparto no;
  - sin datos de Dodo;
  - tolerancia de $1.
- **PGlite de la migración:**
  - encargado, gerente y admin ven su sucursal;
  - operación, corporativo y marketing reciben error;
  - no se pueden ver otras sucursales;
  - sin fila no devuelve nada.
- **De cableado:**
  - el cierre ya no tiene el campo `iva`;
  - la acción calcula el IVA;
  - la página usa `ventas_para_cierre`.
- **SQL de corrección:** PGlite con 3 cierres: 2 mal y 1 bien. Solo cambian los 2.

## Fuera de alcance

- Cambiar cómo se cobra en la caja de Dodo IS (capacitación).
- Abrir el módulo Ventas al encargado.
- Comparar app y Rappi.
- Bloquear el cierre por diferencias.

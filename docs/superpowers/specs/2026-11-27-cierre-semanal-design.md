# Cierre semanal por sucursal (HD-5) — diseño

Fecha: 2026-11-27 · Ticket: HD-5 (Julio) · Responsable: Sebastián

## Objetivo

Que Dodo MX arme solo el cierre semanal de cada sucursal, que hoy Ricardo hace en papel. Cada canal se toma de su fuente real. Ricardo solo revisa y aprueba.

## Decisiones tomadas

- **Formato:** el que pidió el ticket, sin una foto del papel. Una fila por día y columnas por canal, con total y diferencias.
- **Semana:** de lunes a domingo, hora de México. Por defecto se muestra la semana anterior completa.
- **Aprobación:**
  - Aprueba admin (`puedeEditarFinanzas`). Corporativo solo consulta (`puedeVerFinanzas`).
  - Al aprobar se guarda una copia de los totales.
  - Si después cambian los datos, la semana se marca «Cambió después de aprobar» y se puede volver a aprobar.
- **Rappi y Rappi Turbo:**
  - Salen de `rappi_ordenes`, que el extractor de n8n carga solo cada 15 min desde el portal de aliados.
  - Turbo es la tienda `TIENDA_TURBO` (`lib/ventas/rappi.ts`).
  - No hace falta revisarlo a mano cada lunes.
- **NetPay:**
  - Los depósitos llegan de 1 a 4 días después de la venta, así que se comparan por semana, no por día.
  - La conciliación automática de Banca compara contra la tarjeta de Dodo IS. Como desde el 30-oct Dodo IS registra la tarjeta como efectivo (HD-10), esa conciliación dejó de encontrar ventas. Aquí se compara contra la tarjeta del arqueo, que es la de la terminal.
  - Arreglar la conciliación de Banca queda fuera.

## Pantalla `/ventas/cierre-semanal`

- **Filtros:** sucursal (las que ve el usuario; admin y corporativo ven todas) y semana (`?semana=AAAA-MM-DD`, el lunes). Hay botones «‹ Semana anterior» y «Semana siguiente ›».
- **Encabezado:** «Cierre semanal · {sucursal} · lun {d} – dom {d} {mes}», más el estado:
  - **Sin aprobar**;
  - **Aprobado por {nombre} el {fecha}**;
  - **Cambió después de aprobar**, con la lista de lo que cambió.
- **Tabla, una fila por día de lunes a domingo:**

  | Columna | Cálculo |
  |---|---|
  | Efectivo | Venta en efectivo real de los arqueos del día |
  | Tarjeta | Σ `tarjeta_real` de los mismos arqueos |
  | Rappi | Σ `subtotal_restaurante` de `rappi_ordenes` del día con `estado='Finalizado'`, tienda distinta de Turbo y `archivo<>'dodo-is'`. Es el mismo criterio que `fraccionTurbo` |
  | Rappi Turbo | Lo mismo, solo de la tienda Turbo |
  | Total | Efectivo + tarjeta + Rappi + Turbo |

  Debajo de cada cifra, en tono suave, va la diferencia contra su referencia cuando pasa de $1:
  - **Efectivo:** contra `ventas_dia.efectivo` de Dodo IS.
  - **Rappi (normal + Turbo):** contra Σ `rappi_real` de los arqueos del día. El arqueo no separa Turbo.
  - **Tarjeta:** no lleva diferencia por día.
- **Venta en efectivo real de los arqueos.** Para cada turno del día (matutino y vespertino) se toma el arqueo que cierra la venta del turno: el de `traspaso` para el matutino y el de `cierre` para el vespertino o para el turno único. Se usa `ventas_efectivo + diferencia`, es decir, lo que de verdad entró en efectivo. El implementador confirma en `app/(app)/arqueo/` si `ventas_efectivo` es del turno o acumulada del día, y ajusta la suma para no contar doble.
- **Día sin datos:**
  - Sin arqueos: «Sin arqueos».
  - Sin órdenes de Rappi, si en ese día no hay ninguna orden importada en `rappi_ordenes` para la sucursal: «Sin datos del portal».
- **Total de la semana:** la suma de cada columna.
- **NetPay de la semana**, en un recuadro aparte:
  - **Tarjeta en arqueos:** Σ de la semana.
  - **Depositado por NetPay:** el criterio sigue la conciliación de Banca para reconocer un depósito (abono con «NET PAY» que no sea comisión) en la cuenta de la razón social de la sucursal. Se toma:
    - si existen, los movimientos ya conciliados en `banca_conciliaciones` tipo `cobro_tarjeta` contra `ventas_dia` de esa semana;
    - si no, los abonos NetPay con fecha del martes de esa semana al jueves de la siguiente (venta del lunes a domingo + 1 a 4 días) que no estén conciliados contra otra semana.
  - **Comisiones NetPay** del mismo rango.
  - **Diferencia:** tarjeta − (depositado + comisiones).
  - Si el estado de cuenta todavía no llega al jueves siguiente: «Pendiente de estado de cuenta (último movimiento: {fecha})».
  - El texto aclara que la atribución es aproximada mientras no se concilie en Banca.
- **Acciones:**
  - «Aprobar semana», con nota opcional de hasta 500 caracteres. Solo admin y solo si la semana ya terminó.
  - «Imprimir / PDF» (carta horizontal, `@page` con nombre).
- **Menú:** «Cierre semanal» en el grupo Ventas, visible para admin y corporativo.

## Datos (migración `supabase/migrations/20261127120000_cierres_semanales.sql`)

**Tabla `cierres_semanales`**

| Columna | Tipo |
|---|---|
| id | uuid pk |
| sucursal_id | uuid, fk `sucursales` |
| semana | date (el lunes), con `check (extract(isodow from semana)=1)` |
| totales | jsonb: la copia fija de la tabla al aprobar, con `{dias:[…], semana:{…}, netpay:{…}}` |
| nota | text, hasta 500 |
| aprobado_por | uuid |
| aprobado_en | timestamptz |

- `unique(sucursal_id, semana)`.
- RLS: el select se permite con `ve_finanzas` o el equivalente que usa P&L (admin o corporativo). No hay DML directo.

**Función `aprobar_cierre_semanal(p_sucursal uuid, p_semana date, p_totales jsonb, p_nota text)`**
- `security definer set search_path=''`.
- Solo admin (`edita_finanzas()` o la función equivalente).
- Hace upsert: volver a aprobar reemplaza la copia, el aprobador y la fecha.
- Exige que la semana ya haya terminado: `p_semana + 7 <= hoy MX`.
- Valida que `p_totales` sea un objeto con `dias` de 7 elementos.

**Pruebas:** PGlite, y un script `supabase/pruebas/20261127120000_cierres_semanales.sql` que termina en «PRUEBAS OK».

## Código

- **`lib/ventas/cierreSemanal.ts`** (puro):
  - `semanaDe(fecha)` devuelve el lunes;
  - `diasDeSemana(lunes)`;
  - `armarCierreSemanal({arqueos, ventasDia, rappi, netpay})` devuelve las filas, el total, las diferencias, el bloque NetPay y los avisos;
  - `cambiosDesdeAprobacion(aprobado, actual)` devuelve la lista de diferencias mayores a $1 por celda.
- **`app/ventas/cierre-semanal/page.tsx`** (servidor): carga los datos de la semana y la aprobación, y pinta.
- **`app/ventas/cierre-semanal/acciones.ts`:** `aprobarSemana` recalcula los totales en el servidor y llama a la función. No confía en totales enviados por el navegador.
- **`lib/roles.ts` / menú:** el enlace nuevo.

## Pruebas

- **Unitarias de `cierreSemanal`:**
  - semana de lunes a domingo, incluido un domingo y el cambio de mes;
  - suma de arqueos de 2 turnos sin contar doble;
  - Rappi normal contra Turbo;
  - día sin arqueos y día sin portal;
  - diferencias con tolerancia de $1;
  - NetPay pendiente;
  - `cambiosDesdeAprobacion`.
- **PGlite:**
  - solo admin aprueba;
  - corporativo lee y no aprueba;
  - semana no terminada se rechaza;
  - lunes obligatorio;
  - reaprobar reemplaza.
- **De cableado:** la página usa `armarCierreSemanal`, la acción recalcula y el menú tiene el enlace.

## Fuera de alcance

- Arreglar la conciliación automática de NetPay en Banca contra la tarjeta del arqueo.
- Diferencias de Rappi pedido por pedido.
- Captura manual de reportes de Rappi Partners, porque ya llegan solos.
- Cierre semanal consolidado de todas las sucursales.

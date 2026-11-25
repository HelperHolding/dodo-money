# Cierre del día: ventas de Dodo MX a la vista e IVA calculado (HD-10) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en el Cierre del día el encargado vea las ventas sincronizadas de Dodo IS junto a lo que captura, con avisos de diferencia, y que el IVA lo calcule el sistema.

**Architecture:**
- Una función `security definer` entrega los totales del día de la sucursal propia a quien cierra.
- Un componente cliente muestra el paso 1 del cierre con la comparación y la línea de venta total, IVA y venta neta.
- La acción del servidor calcula el IVA.
- Aparte va un SQL de corrección opcional para el IVA de cierres pasados.

**Tech Stack:** Next.js 15.5, Supabase (Postgres, RLS), PGlite, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-cierre-ventas-dodo-design.md`

## Global Constraints

- **Rama y commits.**
  - Rama `feat/cierre-ventas-dodo` en el worktree `C:\Users\sebcm\Downloads\dodo-control-efectivo\wt-help-desk`; PR hacia `main`.
  - Nunca commits a `main` ni push.
  - Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Quién cierra.** Roles `encargado`, `gerente` y `admin`. En la app, `puedeCerrarDia(perfil.rol)` de `lib/roles.ts`; en SQL, `mi_rol()::text in ('encargado','gerente','admin')` y la sucursal `mi_sucursal()`, de `0001_control_efectivo.sql`.
- **IVA.**
  - `iva = round(venta_total × 16 / 116, 2)`, con `venta_total = efectivo + tarjeta + app + rappi`.
  - Redondeo a centavos con `Math.round(x*100)/100` en TS y `round(…, 2)` en SQL.
- **Tolerancia de comparación:** $1.00, con diferencia absoluta mayor a 1.00 como aviso.
- **SQL.**
  - Todo `update`/`delete` lleva `where`.
  - Funciones `security definer set search_path=''`, con nombres `public.` calificados.
  - Migraciones en `begin; set local lock_timeout='5s'; … commit;`.
- **Estilo.**
  - Pastel de la paleta Dodo, nada llamativo.
  - Funciona en celular, porque los encargados cierran desde el teléfono.
  - Textos en español de México.
  - Los avisos usan las clases existentes (`aviso`, `saldo-nota`, etc.).
- **Pruebas.**
  - Cada archivo de prueba nuevo se agrega al script `test` de `package.json`.
  - Los imports entre archivos de `lib/` probados con node usan extensión `.ts` con `// @ts-expect-error Node strip-types requiere extensión explícita.`

## Review Focus

1. **Un encargado no ve ventas de otra sucursal.** `ventas_para_cierre` usa solo `mi_sucursal()`, sin parámetro de sucursal (Task 1).
2. **El IVA no se toma del navegador.** La acción ignora cualquier `iva` del formulario y lo calcula (Task 3).
3. **Sin datos de Dodo** (no hay fila del día, o la función falla porque la migración no se ha corrido): el cierre funciona igual, sin comparación (Task 3).
4. **«Tarjeta como efectivo»** solo aparece cuando la suma cuadra dentro de $1 y el reparto no (Task 2).
5. **La corrección de IVA solo toca cierres con `iva > venta_total × 0.2`** y aborta si el conteo no coincide con el esperado (Task 4).

---

### Task 1: Función `ventas_para_cierre`

**Files:**
- Create: `supabase/migrations/20261125150000_ventas_para_cierre.sql`
- Create: `supabase/pruebas/20261125150000_ventas_para_cierre.sql`
- Create: `tests/ventasParaCierre.test.mjs`
- Modify: `package.json`

**Interfaces producidas:**
- `public.ventas_para_cierre(p_fecha date) returns table(efectivo numeric, tarjeta numeric, en_linea numeric, iva numeric, total numeric, pedidos integer, actualizado_en timestamptz)`
  - Lee `public.ventas_dia` con `sucursal_id = public.mi_sucursal()` y `fecha = p_fecha`.
  - `actualizado_en` sale de `public.importaciones_ventas.importado_en` de su `importacion_id`.
  - Si `public.mi_rol()::text not in ('encargado','gerente','admin')`, lanza `raise exception 'Solo quien cierra el día puede ver estas ventas.'`.
  - Sin fila, no devuelve filas.
  - `revoke all … from public, anon` y `grant execute … to authenticated`.

- [ ] **Step 1: Lee la base.**
  - `supabase/migrations/0001_control_efectivo.sql` (`mi_sucursal`, `mi_rol`, enum `rol_usuario`);
  - `supabase/migrations/0006_ventas_costos.sql` (`ventas_dia`, `importaciones_ventas`, `ve_ventas`);
  - un test PGlite que cargue esas migraciones o stubs equivalentes, por ejemplo `tests/aperturasPlanos.test.mjs` (stubs de auth/perfiles) o alguno de ventas. Los stubs deben copiar los CHECK y enums reales.
- [ ] **Step 2: Escribe la prueba que falla.** Verifica:
  1. encargado, gerente y admin de la sucursal A reciben la fila de A del día, con `actualizado_en`;
  2. operación, corporativo y marketing reciben el error;
  3. un encargado de B no ve A, porque recibe la de B o ninguna;
  4. sin fila no hay filas;
  5. la función es `security definer` con `search_path=''`;
  6. el script de pruebas termina en «PRUEBAS OK».
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Escribe la migración.**
- [ ] **Step 5: Escribe `supabase/pruebas/…`.**
  - Es un bloque `do $$`. Toma una sucursal con alguna fila en `ventas_dia` y un perfil activo de esa sucursal con rol encargado, gerente o admin.
  - Si no hay perfil de esa sucursal, usa un admin y verifica que la función responde para la sucursal del admin.
  - Pone `request.jwt.claims` y llama a la función para la fecha de esa fila. Comprueba que devuelve el mismo `total`.
  - Termina en `raise exception 'PRUEBAS OK — …'`.
  - Debe funcionar en producción real, no en stubs.
- [ ] **Step 6: Agrega al script `test` y corre.** Expected: PASS.
- [ ] **Step 7: Commit** — `feat(cierre): función ventas_para_cierre para quien cierra el día (HD-10)`

---

### Task 2: Lógica pura de IVA y comparación

**Files:**
- Create: `lib/cierre/ventasDodo.ts`
- Create: `lib/cierre/ventasDodo.test.ts`
- Modify: `package.json`

**Interfaces producidas:**
- `ivaDeVenta(total: number): number`, con `round(total*16/116, 2)`.
- `type VentasDodo = { efectivo: number; tarjeta: number; pedidos: number; actualizado_en: string | null }`
- `type Comparacion = { efectivo: number | null; tarjeta: number | null; tarjetaComoEfectivo: boolean; pedidos: number | null }`
  - Cada número es la diferencia capturado − Dodo, redondeada a centavos.
  - Vale `null` si no hay datos de Dodo o si el campo capturado está vacío.
  - `pedidos` es el número de Dodo, solo informativo.
- `compararVentas(capturado: { efectivo: number | null; tarjeta: number | null }, dodo: VentasDodo | null): Comparacion`
- `hayDiferencia(d: number | null): boolean`: `d !== null && Math.abs(d) > 1`.
- `tarjetaComoEfectivo` es true cuando:
  - las dos diferencias existen;
  - `|(efectivo+tarjeta capturado) − (efectivo+tarjeta Dodo)| ≤ 1`;
  - y al menos una de las dos difiere en más de 1.

- [ ] **Step 1: Escribe la prueba que falla.**
  - `ivaDeVenta(17068)===2354.21` e `ivaDeVenta(19900.80)===2744.94`.
  - Todo cuadra.
  - Efectivo distinto.
  - Reparto distinto con suma igual, que activa `tarjetaComoEfectivo`; por ejemplo capturado 5000/12068 contra Dodo 17068/0.
  - El caso real del 22-nov (5732/11471.50 contra 17068/0) da diferencias y no activa `tarjetaComoEfectivo`, porque la suma no cuadra.
  - Sin Dodo, todo null.
  - Campo vacío da null.
  - Tolerancia exacta de $1.00, que no es diferencia, contra $1.01, que sí lo es.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implementa.**
- [ ] **Step 4: Run.** `node --experimental-strip-types --test lib/cierre/ventasDodo.test.ts && npm run -s typecheck`
- [ ] **Step 5: Commit** — `feat(cierre): IVA calculado y comparación con ventas de Dodo MX (HD-10)`

---

### Task 3: Cierre del día con comparación e IVA calculado

**Files** (léelos antes):
- Create: `app/(app)/cierre/VentasCierre.tsx` (cliente). Props: `{ dodo: VentasDodo | null; error: boolean }`.
  - Pinta la sección completa «1. Ventas según Dodo IS» que hoy está en `page.tsx`, con los mismos `name`, `id`, `required` y atributos de los campos: `efectivo`, `tarjeta`, `app`, `rappi`, `descuentos`, `transacciones`. **El campo `iva` se elimina.**
  - Usa estado local para efectivo, tarjeta, app y rappi.
  - Bajo «Efectivo» y «Tarjeta» muestra «Dodo MX: {pesos}». Si `hayDiferencia`, agrega «Diferencia {pesos con signo}» en tono de aviso.
  - Bajo «Transacciones» muestra «Dodo MX: N pedidos sin Rappi».
  - Si `tarjetaComoEfectivo`, muestra un aviso en la sección: «En Dodo IS se registró tarjeta como efectivo: la suma cuadra pero el reparto no. Captura lo de la terminal y avisa a caja.»
  - Arriba de los campos:
    - si hay `dodo`: «Ventas en Dodo MX a las {HH:MM}», usando `actualizado_en` en hora de México con el helper de `lib/formato` que exista;
    - si `dodo` es null y no hubo error: «Aún no hay ventas sincronizadas de hoy; se actualizan cada 20 min.»;
    - si hubo error: nada.
  - Debajo de los campos, la línea «Venta total {pesos} · IVA {pesos} · Venta neta {pesos}», calculada con `ivaDeVenta` y recalculada al teclear.
  - Usa `pesos` de `lib/formato`.
- Modify: `app/(app)/cierre/page.tsx`.
  - Reemplaza la sección del paso 1 por `<VentasCierre>`.
  - Antes, llama a `supabase.rpc('ventas_para_cierre', { p_fecha: fecha })` dentro de try/catch. Error o excepción da `error=true` y `dodo=null`. Sin filas da `dodo=null`.
  - Quita «Las ventas se copian del reporte de Dodo IS» del `info` o ajústalo: «Captura las ventas del reporte de Dodo IS; abajo ves lo que Dodo MX ya sincronizó. El IVA se calcula solo.»
- Modify: `app/(app)/cierre/actions.ts`. Calcula `iva: ivaDeVenta(efectivo + tarjeta + app + rappi)` con los mismos números ya leídos, y no lee `formData.get("iva")`.
- Modify: `app/globals.css`, solo si hace falta: estilos mínimos para la nota de Dodo bajo el campo, reusando las clases existentes cuando se pueda.
- Create: `tests/cierreVentasDodo.test.mjs`, con pruebas por lectura de fuente:
  - `page.tsx` usa `ventas_para_cierre` y `<VentasCierre`;
  - el cierre ya no tiene `campo("iva"` ni `name="iva"`;
  - `actions.ts` usa `ivaDeVenta(` y no `formData.get("iva")`;
  - `VentasCierre` usa `compararVentas(`, `tarjetaComoEfectivo` e `ivaDeVenta(`.
- Modify: `package.json`. Agrega la prueba.

- [ ] **Step 1: Escribe la prueba de cableado y verifica que falla.**
- [ ] **Step 2: Implementa.**
- [ ] **Step 3: Run.** `node --experimental-strip-types --test tests/cierreVentasDodo.test.mjs && npm run -s typecheck && npm run -s build 2>&1 | tail -15`
- [ ] **Step 4: Commit** — `feat(cierre): ventas de Dodo MX junto a la captura y sin campo de IVA (HD-10)`

---

### Task 4: Corrección opcional del IVA de cierres pasados

**Files:**
- Create: `supabase/correcciones/2026-11-25_iva_cierres.sql`
- Create: `tests/correccionIvaCierres.test.mjs`
- Modify: `package.json`

**Contenido del SQL** (dos bloques, comentados en español):
1. **Revisión, solo lectura:** `select c.fecha, s.nombre, c.venta_total, c.iva as iva_actual, round(c.venta_total*16/116,2) as iva_correcto from public.cierres_dia c join public.sucursales s on s.id=c.sucursal_id where c.iva > c.venta_total*0.2 order by c.fecha;` más un `select count(*)` con el mismo filtro.
2. **Corrección:**
   - `begin;` y un bloque `do $$` que declara `v_esperado integer := :ESPERADO;`. Como el SQL Editor no admite variables psql, usa una línea editable `v_esperado integer := 0; -- ← pon aquí el conteo del bloque 1` y aborta si sigue en 0.
   - Cuenta las filas con el filtro y aborta si no es igual.
   - `update public.cierres_dia set iva = round(venta_total*16/116,2) where iva > venta_total*0.2;`, que verifica con `get diagnostics` que el número de filas es igual.
   - `raise notice` con el conteo y `commit;`.
   - Revisa si `cierres_dia` tiene triggers que bloqueen updates de cierres cerrados. Si los hay, documenta el bloqueo en el reporte y no lo saltes sin decirlo.
- **Prueba PGlite:**
  - con el esquema real de `cierres_dia` (migración 0001 y las que la alteran, o un stub fiel con `venta_total` generado) inserta 3 cierres: 2 con IVA mal y 1 bien;
  - corre el bloque 2 con el esperado puesto en 2: cambian solo esos 2 y el bueno queda igual;
  - con el esperado en 3 aborta y no cambia nada;
  - con 0 aborta.

- [ ] **Step 1: Escribe la prueba y verifica que falla.**
- [ ] **Step 2: Escribe el SQL.**
- [ ] **Step 3: Run.** Expected: PASS.
- [ ] **Step 4: Commit** — `feat(cierre): corrección opcional del IVA capturado como venta total (HD-10)`

---

### Task 5: Verificación completa

- [ ] `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`: fail 0.
- [ ] `npm run -s typecheck && npm run -s build`: sin errores.

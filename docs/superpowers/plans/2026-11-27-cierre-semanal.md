# Cierre semanal por sucursal (HD-5) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pantalla Ventas → Cierre semanal que arma sola el cierre de lunes a domingo por sucursal, desde arqueos, Dodo IS, portal Rappi y NetPay del banco, con aprobación de admin y copia fija.

**Architecture:**
- La lógica va en una función pura (`armarCierreSemanal`) que recibe filas ya leídas.
- La página de servidor las lee de Supabase con RLS.
- La aprobación guarda una copia `jsonb` mediante una RPC `security definer`.
- La acción recalcula los totales en el servidor.

**Tech Stack:** Next.js 15.5, Supabase (Postgres, RLS), PGlite, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-27-cierre-semanal-design.md`

## Global Constraints

- **Rama y commits.**
  - Rama `feat/cierre-semanal` en el worktree `C:\Users\sebcm\Downloads\dodo-control-efectivo\wt-help-desk`; PR hacia `main`.
  - Nunca commits a `main` ni push.
  - Los commits terminan con `Co-Authored-By: <tu modelo> <noreply@anthropic.com>`.
- **Permisos.**
  - Ver: admin y corporativo, con `puedeVerFinanzas` en la app y `public.ve_finanzas()` en SQL.
  - Aprobar: admin, con `puedeEditarFinanzas` y `public.edita_finanzas()`.
- **Semana.** De lunes a domingo, en hora de México. `semana` es la fecha del lunes. Una semana se puede aprobar solo cuando `semana + 7 <= hoy MX`.
- **Tolerancia de diferencias:** $1.00, con diferencia absoluta mayor a 1.00.
- **Rappi.**
  - `rappi_ordenes` con `estado='Finalizado'` y `archivo` distinto de `'dodo-is'`. Revisa cómo `fraccionTurbo` (`lib/ventas/rappi.ts`) lee `archivo`, porque puede venir de `importaciones`.
  - Se suma `subtotal_restaurante`.
  - Turbo es `tienda_id = TIENDA_TURBO` (`lib/ventas/rappi.ts`), usando `esTurbo` si existe.
- **NetPay.** Abono con «NET PAY» en el texto que no sea comisión, y comisión con `DOMI:.*COM VTAS`. Son los mismos criterios de `lib/banca/conciliacion.ts` (`esNetPay`, `esComisionNetPay`); expórtalos y reúsalos en lugar de copiarlos.
- **SQL.**
  - Todo `update`/`delete` lleva `where`.
  - Funciones `security definer set search_path=''`, con nombres `public.` calificados.
  - Migraciones en `begin; set local lock_timeout='5s'; … commit;`.
- **Estilo.**
  - Pastel de la paleta Dodo, estilo Akton para la tabla (`akton-tabla`, como en el P&L).
  - Funciona en celular con tarjetas (`tabla-tarjetas`).
  - Textos en español de México.
- **Pruebas.**
  - Cada archivo de prueba nuevo se agrega al script `test` de `package.json`.
  - Los imports entre archivos de `lib/` probados con node usan `.ts` con `// @ts-expect-error Node strip-types requiere extensión explícita.`

## Review Focus

1. **Dos turnos en un día:** el efectivo y la tarjeta no se cuentan doble (Task 2; el implementador confirma en el código de arqueo si `ventas_efectivo` es del turno o acumulada).
2. **Semana que cruza de mes, y domingo:** `semanaDe` devuelve el lunes correcto. Por ejemplo, el domingo 2026-11-30 da el lunes 2026-11-24 (Task 2).
3. **Aprobar con totales del navegador:** la acción recalcula y no acepta totales enviados (Task 3).
4. **Semana en curso:** no se puede aprobar (Task 1 y Task 3).
5. **Datos faltantes:** un día sin arqueos o sin portal aparece marcado y no como $0 cuadrado (Task 2).

---

### Task 1: Tabla y función de aprobación

**Files:**
- Create: `supabase/migrations/20261127120000_cierres_semanales.sql`
- Create: `supabase/pruebas/20261127120000_cierres_semanales.sql`
- Create: `tests/cierresSemanales.test.mjs`
- Modify: `package.json`

**Interfaces producidas:**
- Tabla `public.cierres_semanales`:
  - `id uuid pk default gen_random_uuid()`;
  - `sucursal_id uuid not null references public.sucursales(id)`;
  - `semana date not null check(extract(isodow from semana)=1)`;
  - `totales jsonb not null check(jsonb_typeof(totales)='object')`;
  - `nota text check(length(nota)<=500)`;
  - `aprobado_por uuid not null`, `aprobado_en timestamptz not null default now()`;
  - `unique(sucursal_id, semana)`.
- RLS con select `using(public.ve_finanzas())`; `revoke all … from public, anon, authenticated` y `grant select … to authenticated`.
- `public.aprobar_cierre_semanal(p_sucursal uuid, p_semana date, p_totales jsonb, p_nota text) returns uuid`:
  - solo `public.edita_finanzas()`;
  - `p_semana` debe ser lunes;
  - `p_semana + 7 <= (now() at time zone 'America/Mexico_City')::date`;
  - `p_totales` es un objeto con `jsonb_array_length(p_totales->'dias') = 7`;
  - la nota se recorta (trim) y se guarda null si queda vacía; hasta 500 caracteres;
  - hace upsert por `(sucursal_id, semana)`, reemplazando totales, nota, `aprobado_por=auth.uid()` y `aprobado_en=now()`;
  - devuelve el id.
  - Mensajes en español: «Solo administración aprueba el cierre semanal.», «La semana debe empezar en lunes.», «La semana aún no termina.» y «Los totales no son válidos.».

- [ ] **Step 1: Lee la base.**
  - Dónde están `ve_finanzas` y `edita_finanzas` (`grep -rn "function.*edita_finanzas" supabase/migrations`).
  - Un test PGlite reciente como patrón, por ejemplo `tests/ventasParaCierre.test.mjs`. Los stubs deben copiar las definiciones reales.
- [ ] **Step 2: Escribe la prueba que falla.** Verifica:
  - admin aprueba, y reaprobar reemplaza y conserva un solo renglón;
  - corporativo lee y no aprueba;
  - operación y encargado no leen ni aprueban;
  - un día que no es lunes se rechaza;
  - la semana en curso se rechaza;
  - `dias` con 6 elementos se rechaza;
  - una nota de 501 caracteres se rechaza;
  - `security definer` con `search_path=''`;
  - el script de pruebas termina en «PRUEBAS OK».
- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Escribe la migración.**
- [ ] **Step 5: Escribe el script `supabase/pruebas`.**
  - Es un bloque `do $$`: toma un admin activo sin cambio de contraseña pendiente y una sucursal.
  - Aprueba la semana de hace 2 semanas con 7 días vacíos, reaprueba con otra nota y verifica que hay una sola fila con la nota nueva.
  - Verifica el rechazo de la semana actual.
  - Termina en `raise exception 'PRUEBAS OK — …'`.
- [ ] **Step 6: Agrega al script `test` y corre.** Expected: PASS.
- [ ] **Step 7: Commit** — `feat(ventas): tabla y aprobación del cierre semanal (HD-5)`

---

### Task 2: Lógica pura del cierre semanal

**Files:**
- Create: `lib/ventas/cierreSemanal.ts`
- Create: `lib/ventas/cierreSemanal.test.ts`
- Modify: `lib/banca/conciliacion.ts`. Exporta `esNetPay` y `esComisionNetPay` sin cambiar su comportamiento.
- Modify: `package.json`

**Interfaces producidas** (puedes ajustar los nombres de campos internos, pero no estas firmas):
- `semanaDe(fecha: string): string`, que devuelve el lunes en `AAAA-MM-DD`.
- `diasDeSemana(lunes: string): string[]`, con 7 fechas.
- Tipos de entrada:
  - `ArqueoDia = { fecha: string; turno: 'matutino'|'vespertino'; momento: 'inicio'|'traspaso'|'cierre'; ventas_efectivo: number; diferencia: number; tarjeta_real: number|null; rappi_real: number|null }`
  - `OrdenRappi = { fecha: string; turbo: boolean; subtotal: number }`, ya filtradas a finalizadas y no Dodo IS.
  - `VentaDodoDia = { fecha: string; efectivo: number }`
  - `MovNetPay = { fecha: string; tipo: 'deposito'|'comision'; monto: number; conciliadoSemana: string|null }`
- `armarCierreSemanal(lunes: string, d: { arqueos: ArqueoDia[]; rappi: OrdenRappi[]; dodo: VentaDodoDia[]; netpay: MovNetPay[]; ultimoMovimiento: string|null }): CierreSemanal`. Devuelve:
  - `dias`: 7 elementos con `{ fecha, efectivo, tarjeta, rappi, turbo, total, sinArqueos, sinPortal, difEfectivo: number|null, difRappi: number|null }`;
  - `semana`: las sumas;
  - `netpay`: `{ tarjeta, depositado, comisiones, diferencia: number|null, pendiente: boolean, ultimoMovimiento }`.
- **Reglas:**
  - **Efectivo y tarjeta de un día:** por cada turno se toma el arqueo que cierra la venta del turno, `traspaso` para el matutino si existe y si no `cierre`. Se suma `ventas_efectivo + diferencia` y `tarjeta_real ?? 0`. Antes de implementar, lee `app/(app)/arqueo/actions.ts` y `datos.ts`:
    - si `ventas_efectivo` del vespertino es **acumulada del día**, resta la del matutino;
    - documenta en el reporte cuál es y deja una prueba que lo fije.
  - **`sinArqueos`:** no hay arqueo de venta ese día. Ese día efectivo y tarjeta van en 0, con el aviso.
  - **`sinPortal`:** no hay ninguna orden de Rappi ese día, normal ni Turbo, y el día ya pasó.
  - **`difEfectivo`:** efectivo − Dodo efectivo, null si no hay Dodo o si `sinArqueos`.
  - **`difRappi`:** (rappi + turbo) − Σ `rappi_real` del día, null si `sinArqueos`.
  - Las diferencias se redondean a centavos; la vista solo las muestra si `> 1`.
  - **NetPay:**
    - `depositado` = depósitos con `conciliadoSemana === lunes`, más los no conciliados (`conciliadoSemana === null`) con fecha entre el martes de la semana y el jueves siguiente;
    - `comisiones`: el mismo rango de fechas;
    - `pendiente` = `ultimoMovimiento === null || ultimoMovimiento < jueves siguiente`;
    - `diferencia` = tarjeta − (depositado + comisiones), o null si pendiente.
- `cambiosDesdeAprobacion(aprobado: CierreSemanal, actual: CierreSemanal): string[]`, con textos como «mié 26: efectivo $5,000.00 → $5,120.00» cuando la diferencia es mayor a $1. Cubre `efectivo`, `tarjeta`, `rappi`, `turbo` y `total` de los días, y el `depositado` de NetPay.

- [ ] **Step 1: Escribe la prueba que falla.** Cubre:
  - `semanaDe` en domingo, lunes y cambio de mes (2026-12-01 → 2026-11-30);
  - dos turnos sin contar doble, según lo que encuentres;
  - turno único con `cierre`;
  - Rappi normal contra Turbo;
  - día sin arqueos y día sin portal;
  - diferencias y la tolerancia;
  - NetPay conciliado, no conciliado y pendiente;
  - `cambiosDesdeAprobacion` con y sin cambios.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implementa.**
- [ ] **Step 4: Run.** `node --experimental-strip-types --test lib/ventas/cierreSemanal.test.ts lib/banca/conciliacion.test.ts && npm run -s typecheck`
- [ ] **Step 5: Commit** — `feat(ventas): cálculo del cierre semanal por canal (HD-5)`

---

### Task 3: Pantalla, aprobación y menú

**Files** (léelos antes):
- Create: `app/ventas/cierre-semanal/datos.ts` (servidor): `cargarCierreSemanal(supabase, sucursal, lunes)`. Lee:
  - turnos y arqueos de los 7 días de la sucursal;
  - `ventas_dia` (efectivo);
  - `rappi_ordenes` finalizadas de la sucursal, con el mismo criterio de `archivo` y Turbo que el resto de Ventas;
  - **NetPay:** los `banca_movimientos` de las cuentas de la razón social de la sucursal (busca cómo `app/banca/conciliacion/datos.ts` relaciona cuenta y sucursal o empresa), en el rango del martes de la semana al jueves siguiente, filtrados con `esNetPay` y `esComisionNetPay`;
  - su `conciliadoSemana`, a partir de `banca_conciliacion_movimientos` → `banca_conciliaciones` tipo `cobro_tarjeta` → `banca_conciliacion_documentos` → `ventas_dia.fecha`, convertido a `semanaDe`;
  - `ultimoMovimiento`: la fecha máxima de movimientos de esas cuentas;
  - la aprobación guardada.

  Devuelve `{ cierre: CierreSemanal, aprobacion: {…}|null, cambios: string[] }`. Cualquier consulta que falle debe dar un error claro, no un cero.
- Create: `app/ventas/cierre-semanal/page.tsx`:
  - solo `puedeVerFinanzas` (si no, `notFound()` o redirect, como otras páginas de finanzas);
  - filtros de sucursal y `?semana=` (normalizado con `semanaDe`; por defecto la semana anterior);
  - navegación ‹ semana anterior · semana siguiente ›;
  - encabezado con el estado (Sin aprobar / Aprobado por … / Cambió después de aprobar con la lista);
  - tabla Akton de 7 filas más el total, con diferencias en tono suave bajo la cifra cuando pasan de $1 y avisos «Sin arqueos» o «Sin datos del portal»;
  - recuadro NetPay;
  - formulario «Aprobar semana» con nota, solo `puedeEditarFinanzas` y semana terminada;
  - botón «Imprimir / PDF», que es un pequeño componente cliente.
- Create: `app/ventas/cierre-semanal/acciones.ts` (`"use server"`): `aprobarSemana(formData)`.
  - valida `puedeEditarFinanzas`;
  - recalcula con `cargarCierreSemanal`, sin aceptar totales del formulario;
  - llama a `aprobar_cierre_semanal`;
  - hace `revalidatePath` y redirige con aviso, siguiendo el patrón de otras acciones de finanzas.
- Modify: `lib/roles.ts`. Agrega el enlace «Cierre semanal» (`/ventas/cierre-semanal`) en el área Ventas, solo si `puedeVerFinanzas(rol)`.
- Modify: `app/globals.css`. Estilos mínimos y `@page cierre-semanal { size: letter landscape; margin: 10mm }` aplicado con `page:` a un contenedor de la página, sin `@page` global.
- Create: `tests/cierreSemanalVista.test.mjs`, con pruebas por lectura de fuente:
  - la página usa `armarCierreSemanal` (o `cargarCierreSemanal`) y `puedeVerFinanzas`;
  - la acción valida `puedeEditarFinanzas`, llama a `aprobar_cierre_semanal` y no lee totales del formulario (no hay `formData.get("totales")`);
  - el menú tiene `/ventas/cierre-semanal`;
  - el CSS usa `@page cierre-semanal`.
- Modify: `package.json`.

- [ ] **Step 1: Escribe la prueba de cableado y verifica que falla.**
- [ ] **Step 2: Implementa.**
- [ ] **Step 3: Run.** `node --experimental-strip-types --test tests/cierreSemanalVista.test.mjs && npm run -s typecheck && npm run -s build 2>&1 | tail -15`
- [ ] **Step 4: Commit** — `feat(ventas): pantalla de cierre semanal con aprobación (HD-5)`

---

### Task 4: Verificación completa

- [ ] `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`: fail 0.
- [ ] `npm run -s typecheck && npm run -s build`: sin errores.

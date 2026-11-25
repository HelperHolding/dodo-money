# Aperturas: avance por etapas (HD-12) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el % de avance de las aperturas cuente etapas (equipo y actividades) y se pondere por bloque 20/35/30/15, igual en todas las pantallas.

**Architecture:** Una función de puntos por partida y una de avance ponderado en `lib/aperturas.ts`, que reemplazan los cálculos «listos/total» de checklist, portada, Akton, Gantt y categorías. Una migración chica agrega el estado `por_cerrar` a actividades. Las etiquetas por bloque viven solo en TS.

**Tech Stack:** Next.js 15.5, Supabase/Postgres, PGlite, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-aperturas-avance-etapas-design.md`

## Global Constraints

- Rama `feat/aperturas-avance-etapas` en el worktree `C:\Users\sebcm\Downloads\dodo-control-efectivo\wt-help-desk`. PR hacia `main`; nunca hacer commit en `main` ni push.
- Puntos: equipo/referencia `por_validar,por_cotizar,bloqueado`=0, `cotizado,aprobado`=0.25, `pedido,recibido_parcial`=0.5, `recibido`=0.75, `instalado,verificado`=1. Actividad/técnico `pendiente,por_validar,bloqueado`=0, `en_curso`=1/3, `por_cerrar`=2/3, `completado`=1.
- Fuera del cálculo: `no_aplica`, y el equipo/referencia en `por_validar` (`cuentaEnAvance`).
- Pesos fijos: proyecto 0.20 (P1–P3), compras 0.35 (P4 y categorías `obra:false`), obra 0.30 (P5 y categorías `obra:true`), apertura 0.15 (P6–P7). Un bloque sin partidas reparte su peso proporcionalmente; sin partidas, `null`.
- El % mostrado se redondea y queda topado en 99 mientras alguna partida tenga menos de 1 punto.
- Etiquetas de actividad/técnico por bloque (solo visibles; el valor en la base no cambia):
  - proyecto: en_curso «Expediente armado / enviado», por_cerrar «Ingresado / en revisión», completado «Aprobado».
  - obra: «Cotizado / aprobado», «En ejecución», «Terminado».
  - apertura: «En curso», «Casi listo», «Listo».
  - compras: los nombres de `ESTADOS`.
- SQL: todo `update`/`delete` lleva `where`; funciones `security definer set search_path=''`.
- Los imports entre archivos de `lib/` que se prueban con node usan extensión `.ts` relativa con `// @ts-expect-error Node strip-types requiere extensión explícita.`
- Cada archivo de prueba nuevo se agrega al script `test` de `package.json`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Una apertura sin partidas de obra (bloque vacío) no debe quedar castigada: los pesos se reparten. Prueba en Task 2.
2. Un equipo en una categoría de obra cuenta en Obra, no en Compras. Prueba en Task 2.
3. `por_cerrar` en un equipo debe rechazarse (la RPC y `validarCambioEstado`). Pruebas en Tasks 1 y 2.
4. 100 % solo si todas las partidas tienen 1 punto. Prueba en Task 2.
5. La portada debe dar el mismo % que el checklist del detalle para la misma apertura. Prueba en Task 3.

---

### Task 1: Migración `por_cerrar`

**Files:**
- Create: `supabase/migrations/20261125120000_aperturas_por_cerrar.sql`
- Create: `supabase/pruebas/20261125120000_aperturas_por_cerrar.sql`
- Create: `tests/aperturasPorCerrar.test.mjs`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: `apertura_items.estado` acepta `por_cerrar`; `actualizar_apertura_item` lo acepta solo para `tipo in ('actividad','tecnico')`.

- [ ] **Step 1: Lee la base.** Lee `supabase/migrations/0037_aperturas.sql` (tabla y CHECK de estado en la línea 13) y la versión más reciente de `public.actualizar_apertura_item`, que es la de `supabase/migrations/20261103120000_aperturas_categoria_actividades.sql`. Busca también cómo `tests/aperturasCategorias.test.mjs` arma PGlite (stubs de base y orden de migraciones) para reusar el mismo arranque.

- [ ] **Step 2: Write the failing test** — `tests/aperturasPorCerrar.test.mjs`. Debe cargar las mismas migraciones que `tests/aperturasCategorias.test.mjs` más la nueva, y verificar:
  1. Una actividad pasa de `pendiente` a `por_cerrar` con `actualizar_apertura_item`, sin evidencia, y queda guardada.
  2. Un `tecnico` también lo acepta.
  3. Un `equipo` con `por_cerrar` se rechaza con el mismo mensaje que la RPC da hoy para un estado inválido.
  4. El CHECK de la tabla acepta `por_cerrar`; un `insert` directo como superusuario no falla.
  5. Todo `update`/`delete` de la migración nueva lleva `where`. Copia la prueba de regex de `tests/soporte.test.mjs`.
  6. El script `supabase/pruebas/20261125120000_aperturas_por_cerrar.sql` termina en el error «PRUEBAS OK».

- [ ] **Step 3: Run to verify it fails**

  Run: `node --experimental-strip-types --test tests/aperturasPorCerrar.test.mjs`. Expected: FAIL (no existe la migración).

- [ ] **Step 4: Escribe la migración**, dentro de `begin; set local lock_timeout='5s'; … commit;`:
  1. Busca el nombre real del CHECK de estado con `select conname from pg_constraint where conrelid='public.apertura_items'::regclass and pg_get_constraintdef(oid) like '%por_cotizar%'`; Postgres lo llama `apertura_items_estado_check`. Haz `drop constraint` y créalo de nuevo con la lista original más `'por_cerrar'`.
  2. Haz `create or replace function public.actualizar_apertura_item(...)` copiando **exactamente** la versión de `20261103120000`. El único cambio: agregar `'por_cerrar'` a la lista de estados válidos de actividad/técnico. Conserva la firma, los grants y los comentarios.

- [ ] **Step 5: Escribe el script de pruebas** `supabase/pruebas/20261125120000_aperturas_por_cerrar.sql`. Es un bloque `do $$ … raise exception 'PRUEBAS OK'; end $$;` que:
  - busca un admin activo y una actividad existente, y si no los hay lanza `raise exception 'FALTAN DATOS…'`;
  - fija `request.jwt.claims` con ese admin;
  - pasa la actividad a `por_cerrar` con la RPC, usando su revisión actual y conservando sus demás campos;
  - verifica que quedó en `por_cerrar`;
  - termina en PRUEBAS OK, que revierte todo.

  Usa la misma firma de llamada que la RPC real.

- [ ] **Step 6: Agrega** ` tests/aperturasPorCerrar.test.mjs` al script `test` de `package.json`, junto a `tests/aperturasCategorias.test.mjs`.

- [ ] **Step 7: Run tests**

  Run: `node --experimental-strip-types --test tests/aperturasPorCerrar.test.mjs tests/aperturasCategorias.test.mjs`. Expected: PASS.

- [ ] **Step 8: Commit**

  `git add supabase/migrations/20261125120000_aperturas_por_cerrar.sql supabase/pruebas/20261125120000_aperturas_por_cerrar.sql tests/aperturasPorCerrar.test.mjs package.json && git commit -m "feat(aperturas): estado por_cerrar para actividades (HD-12)"`

---

### Task 2: Núcleo de puntos y avance ponderado

**Files:**
- Modify: `lib/aperturas.ts`
- Modify: `lib/aperturas.test.ts`

**Interfaces:**
- Produces (exportados de `lib/aperturas.ts`):
  - `ESTADOS` incluye `por_cerrar:'Por cerrar'`.
  - `estadosPara('actividad'|'tecnico')` incluye `'por_cerrar'` después de `'en_curso'`.
  - `grupoApertura` manda `por_cerrar` a `'en_curso'`.
  - `type BloqueApertura = 'proyecto'|'compras'|'obra'|'apertura'`
  - `PESOS_BLOQUE: Record<BloqueApertura, number>`
  - `puntosItem(i: Pick<ItemApertura,'tipo'|'estado'>): number`
  - `bloqueDe(i: Pick<ItemApertura,'tipo'|'etapa'|'categoria'>): BloqueApertura`
  - `avanceApertura(items: Pick<ItemApertura,'tipo'|'etapa'|'estado'|'categoria'>[]): { bloques: { clave: BloqueApertura; peso: number; partidas: number; porcentaje: number|null }[]; general: number|null; completo: boolean }`. `general` ya viene redondeado y topado en 99 si `!completo`; `completo` es true cuando hay partidas y todas valen 1.
  - `nombreEstado(i: Pick<ItemApertura,'tipo'|'etapa'|'categoria'|'estado'>): string`, también usable con un estado distinto del guardado: `nombreEstado({...i, estado: e})`.
  - `conteoEtapasEquipo(items: Pick<ItemApertura,'tipo'|'estado'>[]): { sinCotizar:number; cotizados:number; pedidos:number; entregados:number; instalados:number }`. Solo equipo/referencia que cuentan en avance; los bloqueados van a sinCotizar.

- [ ] **Step 1: Write the failing tests** — agrega a `lib/aperturas.test.ts`, en el estilo del archivo y usando los mismos helpers que ya tiene para construir items:

```ts
test('puntosItem: etapas de equipo y pasos de actividad', () => {
  const e = (estado: string) => puntosItem({ tipo: 'equipo', estado });
  assert.deepEqual(['por_validar','por_cotizar','bloqueado','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado'].map(e), [0,0,0,0.25,0.25,0.5,0.5,0.75,1,1]);
  const a = (estado: string) => puntosItem({ tipo: 'actividad', estado });
  assert.deepEqual(['pendiente','por_validar','bloqueado','en_curso','por_cerrar','completado'].map(a), [0,0,0,1/3,2/3,1]);
  assert.equal(puntosItem({ tipo: 'tecnico', estado: 'por_cerrar' }), 2/3);
});

test('bloqueDe: etapa y categoría de obra', () => {
  assert.equal(bloqueDe({ tipo: 'actividad', etapa: 'P2', categoria: null }), 'proyecto');
  assert.equal(bloqueDe({ tipo: 'equipo', etapa: 'P4', categoria: 'equipo_cocina' }), 'compras');
  assert.equal(bloqueDe({ tipo: 'equipo', etapa: 'P4', categoria: 'contactos' }), 'obra');
  assert.equal(bloqueDe({ tipo: 'actividad', etapa: 'P5', categoria: null }), 'obra');
  assert.equal(bloqueDe({ tipo: 'actividad', etapa: 'P7', categoria: null }), 'apertura');
});

test('avanceApertura: pondera 20/35/30/15, reparte bloques vacíos y topa en 99', () => {
  const it = (tipo: string, etapa: string, estado: string, categoria: string | null = null) => ({ tipo, etapa, estado, categoria }) as never;
  const r = avanceApertura([it('actividad','P1','completado'), it('equipo','P4','pedido'), it('actividad','P5','en_curso'), it('actividad','P7','pendiente')]);
  assert.deepEqual(r.bloques.map(b => [b.clave, b.porcentaje]), [['proyecto',100],['compras',50],['obra',33],['apertura',0]]);
  assert.equal(r.general, Math.round(20*1 + 35*0.5 + 30*(1/3) + 15*0)); // 48
  const sinObra = avanceApertura([it('actividad','P1','completado'), it('equipo','P4','cotizado')]);
  assert.equal(sinObra.general, Math.round((0.20*1 + 0.35*0.25) / 0.55 * 100)); // 52
  assert.equal(avanceApertura([]).general, null);
  assert.equal(avanceApertura([it('actividad','P1','no_aplica'), it('equipo','P4','por_validar')]).general, null);
  const casi = avanceApertura([...Array(199)].map(() => it('actividad','P1','completado')).concat([it('actividad','P1','por_cerrar')]));
  assert.equal(casi.general, 99); assert.equal(casi.completo, false);
  const todo = avanceApertura([it('actividad','P1','completado'), it('equipo','P4','verificado')]);
  assert.equal(todo.general, 100); assert.equal(todo.completo, true);
});

test('avanceApertura: ejemplo del ticket — 72 pedidos y 9 recibidos de 112 equipos ≈ 38 %', () => {
  const eq = (estado: string) => ({ tipo: 'equipo', etapa: 'P4', estado, categoria: 'equipo_cocina' }) as never;
  const items = [...Array(72)].map(() => eq('pedido')).concat([...Array(9)].map(() => eq('recibido')), [...Array(31)].map(() => eq('por_cotizar')));
  assert.equal(avanceApertura(items).bloques.find(b => b.clave === 'compras')!.porcentaje, Math.round((72*0.5 + 9*0.75) / 112 * 100)); // 38
});

test('nombreEstado: etiquetas por bloque solo en actividades', () => {
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P3', categoria: null, estado: 'por_cerrar' }), 'Ingresado / en revisión');
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P5', categoria: null, estado: 'en_curso' }), 'Cotizado / aprobado');
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P7', categoria: null, estado: 'completado' }), 'Listo');
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P4', categoria: null, estado: 'por_cerrar' }), 'Por cerrar');
  assert.equal(nombreEstado({ tipo: 'equipo', etapa: 'P4', categoria: null, estado: 'pedido' }), 'Pedido');
  assert.equal(nombreEstado({ tipo: 'actividad', etapa: 'P1', categoria: null, estado: 'bloqueado' }), 'Bloqueado');
});

test('estadosPara y validarCambioEstado: por_cerrar solo en actividades', () => {
  assert.ok(estadosPara('actividad').includes('por_cerrar')); assert.ok(estadosPara('tecnico').includes('por_cerrar'));
  assert.ok(!estadosPara('equipo').includes('por_cerrar'));
  assert.equal(validarCambioEstado('actividad', { estado: 'por_cerrar', evidencia: '', cantidad: '', recibido: '' }), null);
  assert.equal(validarCambioEstado('equipo', { estado: 'por_cerrar', evidencia: '', cantidad: '', recibido: '' }), 'Estado inválido para este registro.');
});

test('conteoEtapasEquipo', () => {
  const eq = (estado: string) => ({ tipo: 'equipo', estado }) as never;
  assert.deepEqual(conteoEtapasEquipo(['por_cotizar','bloqueado','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado','no_aplica','por_validar'].map(eq)),
    { sinCotizar: 2, cotizados: 2, pedidos: 2, entregados: 1, instalados: 2 });
});
```

- [ ] **Step 2: Run to verify it fails**

  Run: `node --experimental-strip-types --test lib/aperturas.test.ts`. Expected: FAIL (las funciones no existen).

- [ ] **Step 3: Implement.** Agrégalo a `lib/aperturas.ts`, después de `MODULOS_CHECKLIST` y `marcaItem`. Ajusta además `ESTADOS`, `estadosPara` y `grupoApertura` como dice Interfaces.

```ts
export type BloqueApertura = 'proyecto'|'compras'|'obra'|'apertura';
export const PESOS_BLOQUE: Record<BloqueApertura, number> = { proyecto: 0.20, compras: 0.35, obra: 0.30, apertura: 0.15 };
const BLOQUES: BloqueApertura[] = ['proyecto','compras','obra','apertura'];
const PUNTOS_EQUIPO: Record<string, number> = { cotizado: 0.25, aprobado: 0.25, pedido: 0.5, recibido_parcial: 0.5, recibido: 0.75, instalado: 1, verificado: 1 };
const PUNTOS_ACTIVIDAD: Record<string, number> = { en_curso: 1/3, por_cerrar: 2/3, completado: 1 };
/** Puntos de una partida (0 a 1) según su etapa: equipo por cotizado/comprado/entregado/instalado; actividades por pasos. */
export const puntosItem = (i: Pick<ItemApertura,'tipo'|'estado'>) =>
  (i.tipo === 'equipo' || i.tipo === 'referencia' ? PUNTOS_EQUIPO : PUNTOS_ACTIVIDAD)[i.estado] ?? 0;
/** Bloque del avance: lo de categoría de obra va a Obra aunque su etapa sea otra (igual que el checklist). */
export function bloqueDe(i: Pick<ItemApertura,'tipo'|'etapa'|'categoria'>): BloqueApertura {
  if (i.categoria !== null && CATEGORIAS[i.categoria]?.obra === true) return 'obra';
  if (i.categoria !== null || i.etapa === 'P4') return 'compras';
  if (i.etapa === 'P5') return 'obra';
  return i.etapa === 'P6' || i.etapa === 'P7' ? 'apertura' : 'proyecto';
}
const cuenta = (i: Pick<ItemApertura,'tipo'|'estado'>) => i.estado !== 'no_aplica' && !((i.tipo === 'equipo' || i.tipo === 'referencia') && i.estado === 'por_validar');
/** Avance ponderado por bloque (20/35/30/15). Un bloque vacío reparte su peso; 100 solo si todo está completo. */
export function avanceApertura(items: Pick<ItemApertura,'tipo'|'etapa'|'estado'|'categoria'>[]) {
  const de = items.filter(cuenta);
  const bloques = BLOQUES.map(clave => {
    const p = de.filter(i => bloqueDe(i) === clave);
    const fr = p.length ? p.reduce((s, i) => s + puntosItem(i), 0) / p.length : null;
    return { clave, peso: PESOS_BLOQUE[clave], partidas: p.length, fraccion: fr, porcentaje: fr === null ? null : Math.round(fr * 100) };
  });
  const con = bloques.filter(b => b.fraccion !== null), pesos = con.reduce((s, b) => s + b.peso, 0);
  const completo = de.length > 0 && de.every(i => puntosItem(i) === 1);
  const bruto = pesos ? con.reduce((s, b) => s + b.peso * (b.fraccion as number), 0) / pesos * 100 : null;
  return { bloques: bloques.map(({ fraccion: _f, ...b }) => b), completo,
    general: bruto === null ? null : completo ? 100 : Math.min(99, Math.round(bruto)) };
}
const NOMBRES_BLOQUE: Partial<Record<BloqueApertura, Record<string, string>>> = {
  proyecto: { en_curso: 'Expediente armado / enviado', por_cerrar: 'Ingresado / en revisión', completado: 'Aprobado' },
  obra: { en_curso: 'Cotizado / aprobado', por_cerrar: 'En ejecución', completado: 'Terminado' },
  apertura: { en_curso: 'En curso', por_cerrar: 'Casi listo', completado: 'Listo' },
};
/** Nombre visible del estado: las actividades usan el paso de su bloque; lo demás, ESTADOS. */
export const nombreEstado = (i: Pick<ItemApertura,'tipo'|'etapa'|'categoria'|'estado'>) =>
  (i.tipo === 'actividad' || i.tipo === 'tecnico' ? NOMBRES_BLOQUE[bloqueDe(i)]?.[i.estado] : undefined) ?? ESTADOS[i.estado] ?? i.estado;
export function conteoEtapasEquipo(items: Pick<ItemApertura,'tipo'|'estado'>[]) {
  const r = { sinCotizar: 0, cotizados: 0, pedidos: 0, entregados: 0, instalados: 0 };
  for (const i of items) {
    if ((i.tipo !== 'equipo' && i.tipo !== 'referencia') || !cuenta(i)) continue;
    const p = puntosItem(i);
    if (p === 0) r.sinCotizar++; else if (p === 0.25) r.cotizados++; else if (p === 0.5) r.pedidos++; else if (p === 0.75) r.entregados++; else r.instalados++;
  }
  return r;
}
```

  Importa `puntosItem`, `bloqueDe`, `avanceApertura`, `nombreEstado` y `conteoEtapasEquipo` en el test.

- [ ] **Step 4: Run tests**

  Run: `node --experimental-strip-types --test lib/aperturas.test.ts && npm run -s typecheck`. Expected: PASS. Si `ItemApertura['etapa']`/`categoria` piden tipos más estrictos en las pruebas, usa `as never`, como en el ejemplo.

- [ ] **Step 5: Commit** — `feat(aperturas): puntos por etapa y avance ponderado por bloque (HD-12)`

---

### Task 3: Todas las pantallas con la misma regla

**Files** (léelos antes de cambiar):
- Modify: `lib/aperturas.ts`
  - `checklistApertura`: el `porcentaje` de cada módulo pasa a ser el % de su bloque, y `general` el global ponderado.
  - `avanceCategorias`: `porcentaje` = promedio de `puntosItem`.
  - `indicadoresApertura.avance` = `avanceApertura(items).general`.
  - `avancePorProyecto` y `porcentajeAvance`: ver abajo.
- Modify: `lib/aperturasGantt.ts`. En `ganttEtapas`, `porcentaje` = promedio de `puntosItem` de la etapa. `avanceGeneral` no se usa: bórralo junto con su prueba.
- Modify: `lib/aperturasAkton.ts`. En `avanceComparado`:
  - `real` = `avanceApertura(de).general`;
  - `realConFecha` y `esperado` siguen igual, pero `realConFecha` pasa a ser el promedio de `puntosItem` × 100 de los fechados, para comparar contra `esperado` en la misma escala;
  - `Concepto` agrega `'categoria'`;
  - revisa `filasCronograma`, `indicadoresProyecto` y `lecturaApertura` para que usen el mismo `real`.
- Modify: `app/aperturas/page.tsx`. La consulta de items trae `proyecto_id, tipo, etapa, estado, categoria`. El % por proyecto sale de `avanceApertura` (ver abajo) y el texto cambia a «N de M partidas listas», con N = partidas con 1 punto y M = partidas que cuentan.
- Modify: todo llamador de `avanceComparado`/`Concepto` que arme `select` sin `categoria` (busca con grep `avanceComparado(`, `filasCronograma(`, `indicadoresProyecto(`). Agrega `categoria` a esos selects.
- Modify tests: `lib/aperturas.test.ts`, `lib/aperturasGantt.test.ts`, `lib/aperturasAkton.test.ts`, `tests/aperturasPortada.test.mjs`. Ajusta los valores esperados a la regla nueva. No borres casos: actualiza el número y deja un comentario corto con el cálculo.

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `avancePorProyecto(items: {proyecto_id,tipo,etapa,estado,categoria}[]): Record<string, {listos:number; total:number; porcentaje:number|null}>`, donde `porcentaje` = `avanceApertura(dePro).general`, `listos` = partidas con 1 punto y `total` = partidas que cuentan.
  - `porcentajeAvance` se conserva para los llamadores que aún lo usen: recibe `{terminados,total}`, igual que hoy. Si ya no queda ninguno, bórralo junto con su prueba.

- [ ] **Step 1: Escribe primero las pruebas** que fijan la regla nueva. Agrega a `lib/aperturas.test.ts` una prueba de que, para el mismo conjunto de items, `avancePorProyecto(...)[id].porcentaje === checklistApertura(items).general === avanceApertura(items).general` (Review Focus 5). Actualiza las pruebas existentes que fijan fórmulas viejas: el promedio simple en `checklistApertura` (aperturas.test.ts ~l.61), `avanceCategorias`, `ganttEtapas`, `avanceComparado` y la regex de la portada si cambias el nombre de la función. Corre y confirma que fallan por la regla vieja.
- [ ] **Step 2: Implementa** los cambios listados arriba.
- [ ] **Step 3: Run**

  Run: `node --experimental-strip-types --test lib/aperturas.test.ts lib/aperturasGantt.test.ts lib/aperturasAkton.test.ts tests/aperturasPortada.test.mjs && npm run -s typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** — `feat(aperturas): portada, checklist, Akton, Gantt y categorías con el avance por etapas (HD-12)`

---

### Task 4: Nombres por bloque, peso visible y conteo de equipo

**Files** (léelos antes de cambiar):
- Modify: `app/aperturas/ChecklistEditable.tsx`
  - Las opciones de estado de la línea 78 usan `nombreEstado({...c, estado: e})` en lugar de `ESTADOS[e]`, y «Estado actual» (línea 71) usa `nombreEstado(c)`. `ItemChecklist` ya trae `tipo`, `etapa` y `categoria`.
  - Junto al nombre de cada módulo muestra su peso: «· {Math.round(PESOS_BLOQUE[clave]*100)} % del total». La clave del módulo coincide con `BloqueApertura`: proyecto, compras, obra, apertura.
- Modify: `app/aperturas/[id]/items/[item]/page.tsx`. El `<dd>` de Estado (línea 27) y las `<option>` del select (línea 29) usan `nombreEstado`.
- Modify: las pantallas que muestran `ESTADOS[...]` de un item de apertura: `Calendario.tsx`, `Cronograma.tsx`, `Gantt.tsx`, `ListaConceptos.tsx` e `Historial.tsx`.
  - Usa `nombreEstado(item)` donde el objeto traiga `tipo`, `etapa` y `categoria`.
  - Donde no los traiga, agrégalos al select de origen si es trivial; si no, deja `ESTADOS` y anótalo en el reporte.
  - `Historial.tsx` muestra valores sueltos, así que deja `ESTADOS`: «Por cerrar» ya existe ahí.
- Modify: la vista de Equipo y compras. Encuéntrala con grep de `vista=compras` / `'compras'` en `app/aperturas/[id]`.
  - En su encabezado, muestra `conteoEtapasEquipo(items)` como «{sinCotizar} sin cotizar · {cotizados} cotizados · {pedidos} pedidos · {entregados} entregados · {instalados} instalados».
- Create: `tests/aperturasEtapasVista.test.mjs`, con pruebas de cableado por lectura de fuente (estilo `tests/soporteVista.test.mjs`):
  - ChecklistEditable usa `nombreEstado(` y `PESOS_BLOQUE`;
  - la ficha del item usa `nombreEstado(`;
  - la vista de compras usa `conteoEtapasEquipo(`.
- Modify: `package.json`. Agrega la prueba nueva al script `test`.

- [ ] **Step 1: Write the failing test** (`tests/aperturasEtapasVista.test.mjs`) y córrela para verla fallar.
- [ ] **Step 2: Implement** los cambios de UI listados.
- [ ] **Step 3: Run**

  Run: `node --experimental-strip-types --test tests/aperturasEtapasVista.test.mjs && npm run -s typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** — `feat(aperturas): nombres de paso por bloque, peso de cada módulo y conteo de equipo por etapa (HD-12)`

---

### Task 5: Verificación completa

- [ ] Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`. Expected: `fail 0`.
- [ ] Run: `npm run -s typecheck && npm run -s build 2>&1 | grep -E "aperturas|Failed|rror"`. Expected: sin errores.
- [ ] Commit de correcciones, si hubo.

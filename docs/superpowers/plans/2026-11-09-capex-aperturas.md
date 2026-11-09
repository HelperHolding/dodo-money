# CAPEX de aperturas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reporte en Finanzas de presupuesto vs real del CAPEX de cada apertura (comprometido, facturado, pagado, por ejercer), alimentado por asignaciones explícitas en órdenes y facturas de Compras, más la inversión histórica importada.

**Architecture:** Una migración Supabase crea el catálogo de categorías, el presupuesto por revisiones, las asignaciones de documentos, las equivalencias del histórico, dos vistas (`capex_resumen`, `capex_historico`) y funciones `security definer` que validan todo lo que se escribe. TypeScript solo resume y presenta: funciones puras en `lib/finanzas/capex.ts`, páginas server-side en `app/finanzas/capex/`, y un bloque de servidor reutilizable en los detalles de orden y factura de Compras.

**Tech Stack:** Next.js (App Router, server components y server actions), Supabase/PostgreSQL, PGlite para probar la migración en node, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-11-09-capex-aperturas-design.md`

## Global Constraints

- Todo en la rama `feat/capex-aperturas` (worktree `C:\Users\sebcm\Downloads\dodo-control-efectivo\wt-capex-aperturas`); integración solo por PR a `main` con **Historial válido** y **Pruebas y tipos** en verde. Nada de commits directos a `main`, `--allow-empty` ni `--no-verify`.
- Migración: `supabase/migrations/20261109180000_capex_aperturas.sql`, en una sola transacción (`begin; … commit;`). Prueba para producción: `supabase/pruebas/20261109180000_capex_aperturas.sql`, termina en `raise exception 'PRUEBAS OK — …'`.
- La migración la ejecuta Sebastián en el proyecto Supabase de **producción**; las pantallas de captura no se publican antes de su resultado `PRUEBAS OK`.
- Permisos: ver = `ve_finanzas()` / `puedeVerFinanzas` (admin y corporativo); escribir = `edita_finanzas()` / `puedeEditarFinanzas` (solo admin). Sin `insert/update/delete` directos en tablas CAPEX: solo funciones.
- Montos de comparación **sin IVA**; pagado y por pagar también **con IVA**. Redondeo a centavos.
- Semáforo: **verde** < 90 % · **ámbar** 90–100 % · **rojo** > 100 % · **gris** sin presupuesto aprobado.
- Las 10 categorías y sus claves exactas: `proyecto_permisos, obra_civil, instalaciones, equipo_cocina, camara_fria, mobiliario, tecnologia, senaletica, smallware, otros`.
- Interfaz en español, tarjetas en lugar de tablas anchas; clases CSS existentes (`seccion`, `rejilla`, `saldo`, `saldo-monto`, `saldo-nota`, `barra-apilada`, `insignia[data-tono]`, `tabla`, `tabla-contenedor`, `boton`).
- Stubs de PGlite copian los CHECK y enums reales de las tablas que imitan.

## Review Focus

1. **Factura ligada a dos órdenes asignadas en la misma categoría** — su monto se descuenta del comprometido de ambas órdenes; se espera que el comprometido nunca sea negativo (el `greatest(0, …)` lo garantiza) y que se documente que puede quedar subestimado. Prueba en Task 3.
2. **Factura con `total = 0` (todo retenido)** — no debe romper la vista por división entre cero; se espera pagado sin IVA 0 y el pago con IVA visible tal cual. (`subtotal − descuento = 0` no puede tener asignación porque el tope sería 0.) Prueba en Task 3.
3. **Monto con más de dos decimales o con formato "$1,234.50" en el formulario** — se espera que se lea bien y se redondee a centavos, y que un texto inválido avise con el número de renglón en lugar de guardarse como 0. Prueba en Task 6.
4. **Asignar una orden que tiene renglones con precio 0** — el tope es solo lo que suman los renglones con precio; se espera el mensaje "Lo asignado pasa el subtotal del documento." Prueba en Task 2.
5. **Un `proyecto_id` que no es uuid válido en el JSON** — se espera el mensaje de sucursal, no un error de conversión de tipos de Postgres. Prueba en Task 2.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261109180000_capex_aperturas.sql` | Tablas, funciones, vistas, RLS y grants del CAPEX (Tasks 1–4) |
| `supabase/pruebas/20261109180000_capex_aperturas.sql` | Prueba para que Sebastián la corra en producción (Task 5) |
| `tests/capexAperturas.test.mjs` | PGlite: migración + reglas + vistas + prueba de producción (Tasks 1–5) |
| `lib/finanzas/capex.ts` | Catálogo en TS, semáforo, resúmenes, sugerencias, lectura de formulario (Task 6) |
| `lib/finanzas/capex.test.ts` | Unitarias de lo anterior (Task 6) |
| `lib/roles.ts`, `lib/roles.test.ts` | Entrada de menú `/finanzas/capex` (Task 7) |
| `app/finanzas/capex/datos.ts` | Lectura de Supabase para resumen y detalle (Task 8) |
| `app/finanzas/capex/TarjetaCapex.tsx` | Tarjeta con cifras, barra y semáforo (Task 8) |
| `app/finanzas/capex/page.tsx` | Resumen de todas las aperturas (Task 8) |
| `app/finanzas/capex/[proyecto]/page.tsx` | Detalle por categoría, documentos, presupuesto, sin categorizar (Task 9) |
| `app/finanzas/capex/acciones.ts` | Server actions: aprobar presupuesto, guardar asignación (Tasks 9–10) |
| `app/finanzas/capex/BloqueCapex.tsx` | Bloque de captura reutilizado en orden y factura (Task 10) |
| `app/compras/facturas/[id]/page.tsx`, `app/compras/ordenes/[id]/page.tsx` | Pestaña "CAPEX de apertura" (Task 10) |
| `package.json` | Agregar las dos pruebas nuevas al script `test` (Tasks 1 y 6) |

---

### Task 1: Catálogo de categorías y presupuesto por revisiones

**Files:**
- Create: `supabase/migrations/20261109180000_capex_aperturas.sql`
- Create: `tests/capexAperturas.test.mjs`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: tablas `public.capex_categorias(clave, nombre, orden)`, `public.capex_presupuestos(...)`; función `public.aprobar_capex_presupuesto(p_proyecto uuid, p_revision_actual integer, p_montos jsonb, p_motivo text) returns integer`. Test helpers `preparar()`, `como(db, id)`, constantes `ADMIN, CORP, GER, S1, S2, P1, P2` en `tests/capexAperturas.test.mjs`.

- [ ] **Step 1: Write the failing test**

Crear `tests/capexAperturas.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Diseño: docs/superpowers/specs/2026-11-09-capex-aperturas-design.md
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^\uFEFF/,'');
const migracion=load('supabase/migrations/20261109180000_capex_aperturas.sql');
export const ADMIN='00000000-0000-0000-0000-0000000000a1',CORP='00000000-0000-0000-0000-0000000000c1',GER='00000000-0000-0000-0000-0000000000e1';
export const S1='10000000-0000-0000-0000-000000000001',S2='10000000-0000-0000-0000-000000000002';
export const P1='20000000-0000-0000-0000-000000000001',P2='20000000-0000-0000-0000-000000000002';
const CATEGORIAS=['proyecto_permisos','obra_civil','instalaciones','equipo_cocina','camara_fria','mobiliario','tecnologia','senaletica','smallware','otros'];

// Lo mínimo de Supabase, perfiles, compras y aperturas; CHECK y enums copiados de 0012, 0013, 0014 y 0037.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean not null default true,rol text not null,nombre text);
 insert into perfiles values('${ADMIN}',true,'admin','Admin'),('${CORP}',true,'corporativo','Corporativo'),('${GER}',true,'gerente','Gerente');
 create function ve_finanzas() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_finanzas() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('${S1}','Dodo Uno'),('${S2}','Dodo Dos');
 create type estado_orden as enum ('borrador','enviada','confirmada','cerrada','cancelada');
 create type tipo_factura as enum ('ingreso','egreso');
 create type estado_factura as enum ('por_pagar','parcial','pagada','cancelada');
 create table proveedores(id uuid primary key default gen_random_uuid(),razon_social text not null);
 create table ordenes_compra(id uuid primary key,folio text,proveedor_id uuid references proveedores(id),sucursal_id uuid references sucursales(id),estado estado_orden not null default 'borrador');
 create table orden_renglones(id uuid primary key default gen_random_uuid(),orden_id uuid not null references ordenes_compra(id),cantidad numeric(12,3) not null check(cantidad>0),precio numeric(12,2) not null default 0 check(precio>=0));
 create table facturas(id uuid primary key,uuid text not null unique,folio text,tipo tipo_factura not null,proveedor_id uuid references proveedores(id),sucursal_id uuid references sucursales(id),uuid_relacionado text,
  subtotal numeric(14,2) not null,descuento numeric(14,2) not null default 0,total numeric(14,2) not null check(total>=0),estado estado_factura not null default 'por_pagar');
 create table factura_ordenes(factura_id uuid not null references facturas(id),orden_id uuid not null references ordenes_compra(id),primary key(factura_id,orden_id));
 create table pagos(id uuid primary key default gen_random_uuid(),monto numeric(14,2) not null check(monto>0),anulado_en timestamptz);
 create table pago_aplicaciones(id bigserial primary key,pago_id uuid not null references pagos(id),factura_id uuid not null references facturas(id),monto numeric(14,2) not null check(monto>0),unique(pago_id,factura_id));
 create table apertura_proyectos(id uuid primary key,sucursal_id uuid not null unique references sucursales(id),responsable text not null,objetivo_desde date not null,objetivo_hasta date not null check(objetivo_hasta>=objetivo_desde),presupuesto numeric(16,2),revision integer not null default 1);
 insert into apertura_proyectos values('${P1}','${S1}','Julio','2026-11-01','2026-12-15',null,1),('${P2}','${S2}','Julio','2026-12-01','2027-01-15',null,1);
 create table apertura_items(id uuid primary key default gen_random_uuid(),proyecto_id uuid not null references apertura_proyectos(id),tipo text not null,categoria text,nombre text not null default 'Item',orden_id uuid references ordenes_compra(id),factura_id uuid references facturas(id));
 create table inversion_apertura_fuentes(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),nombre text not null,fecha date not null,total numeric(16,2) not null,datos jsonb not null);
 grant usage on schema auth to authenticated;grant select on perfiles to authenticated;`;

export async function preparar(){const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;}
export async function como(db,id){await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);}
const aprobar=(db,p,rev,montos,motivo='Presupuesto inicial')=>db.query('select public.aprobar_capex_presupuesto($1,$2,$3::jsonb,$4) r',[p,rev,JSON.stringify(montos),motivo]).then(x=>x.rows[0].r);

test('capex: diez categorías con las claves del diseño',async()=>{
 const db=await preparar();
 try{assert.deepEqual((await db.query('select clave from capex_categorias order by orden')).rows.map(r=>r.clave),CATEGORIAS);}
 finally{await db.close();}
});

test('capex: aprobar presupuesto crea revisiones completas y detecta conflictos',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  assert.equal(await aprobar(db,P1,0,{obra_civil:1300000,equipo_cocina:450000.555}),1);
  const r1=(await db.query(`select categoria,monto::float8 m from capex_presupuestos where proyecto_id=$1 and revision=1 order by categoria`,[P1])).rows;
  assert.equal(r1.length,10);
  assert.equal(r1.find(x=>x.categoria==='obra_civil').m,1300000);
  assert.equal(r1.find(x=>x.categoria==='equipo_cocina').m,450000.56);
  assert.equal(r1.find(x=>x.categoria==='otros').m,0);
  await assert.rejects(aprobar(db,P1,0,{obra_civil:1}),/El presupuesto cambió/);
  assert.equal(await aprobar(db,P1,1,{obra_civil:1400000},'Ajuste por cotización de obra'),2);
  await assert.rejects(aprobar(db,P1,2,{pisos:1}),/Categoría inválida/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:-1}),/Monto inválido/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:'mil'}),/Monto inválido/);
  await assert.rejects(aprobar(db,P1,2,{},'Sin montos'),/al menos una categoría/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:1},'abc'),/motivo/);
  await assert.rejects(aprobar(db,'30000000-0000-0000-0000-000000000009',0,{obra_civil:1}),/La apertura no existe/);
  await como(db,CORP);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:1}),/Solo administración/);
  assert.equal((await db.query(`select has_function_privilege('anon','public.aprobar_capex_presupuesto(uuid,integer,jsonb,text)','EXECUTE') p`)).rows[0].p,false);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: FAIL con `ENOENT ... 20261109180000_capex_aperturas.sql`.

- [ ] **Step 3: Write minimal implementation**

Crear `supabase/migrations/20261109180000_capex_aperturas.sql` (las Tasks 2–4 agregan secciones antes del `commit;`):

```sql
-- CAPEX de aperturas: presupuesto aprobado por categoría vs comprometido, facturado y pagado.
-- Diseño: docs/superpowers/specs/2026-11-09-capex-aperturas-design.md. Prueba: supabase/pruebas/20261109180000_capex_aperturas.sql.
begin;

create table public.capex_categorias(
 clave text primary key,nombre text not null,orden integer not null unique
);
insert into public.capex_categorias values
 ('proyecto_permisos','Proyecto y permisos',1),('obra_civil','Obra civil y acabados',2),
 ('instalaciones','Instalaciones (eléctrica, hidráulica, gas, HVAC)',3),('equipo_cocina','Equipo de cocina',4),
 ('camara_fria','Cámara fría',5),('mobiliario','Mobiliario',6),('tecnologia','Tecnología y POS',7),
 ('senaletica','Señalética',8),('smallware','Smallware',9),('otros','Otros',10);

create table public.capex_presupuestos(
 id uuid primary key default gen_random_uuid(),
 proyecto_id uuid not null references public.apertura_proyectos(id),
 revision integer not null check(revision>=1),
 categoria text not null references public.capex_categorias(clave),
 monto numeric(16,2) not null check(monto>=0 and monto<1e12),
 motivo text not null check(length(trim(motivo)) between 5 and 2000),
 aprobado_por uuid not null references public.perfiles(id),
 aprobado_en timestamptz not null default now(),
 unique(proyecto_id,revision,categoria)
);

-- Una revisión trae todas las categorías (las omitidas valen 0). Solo admin; revisión optimista.
create function public.aprobar_capex_presupuesto(p_proyecto uuid,p_revision_actual integer,p_montos jsonb,p_motivo text) returns integer
language plpgsql security definer set search_path='' as $$
declare v integer;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración aprueba el presupuesto CAPEX.';end if;
 perform 1 from public.apertura_proyectos where id=p_proyecto for update;
 if not found then raise exception 'La apertura no existe.';end if;
 select coalesce(max(revision),0) into v from public.capex_presupuestos where proyecto_id=p_proyecto;
 if v is distinct from p_revision_actual then raise exception 'El presupuesto cambió. Recarga antes de guardar.';end if;
 if length(trim(coalesce(p_motivo,''))) not between 5 and 2000 then raise exception 'Escribe el motivo de la revisión.';end if;
 if jsonb_typeof(p_montos) is distinct from 'object' or not exists(select 1 from jsonb_object_keys(p_montos)) then raise exception 'Captura al menos una categoría.';end if;
 if exists(select 1 from jsonb_object_keys(p_montos) k where k not in (select clave from public.capex_categorias)) then raise exception 'Categoría inválida.';end if;
 -- case evita convertir a numeric un valor que no es número (OR no garantiza orden de evaluación).
 if exists(select 1 from jsonb_each(p_montos) e where case when jsonb_typeof(e.value)='number' then (e.value)::numeric<0 or (e.value)::numeric>=1e12 else true end) then raise exception 'Monto inválido.';end if;
 insert into public.capex_presupuestos(proyecto_id,revision,categoria,monto,motivo,aprobado_por)
 select p_proyecto,v+1,c.clave,round(coalesce((p_montos->>c.clave)::numeric,0),2),trim(p_motivo),auth.uid() from public.capex_categorias c;
 return v+1;
end $$;

alter table public.capex_categorias enable row level security;
alter table public.capex_presupuestos enable row level security;
create policy ver_capex_categorias on public.capex_categorias for select using(public.ve_finanzas());
create policy ver_capex_presupuestos on public.capex_presupuestos for select using(public.ve_finanzas());
revoke all on public.capex_categorias,public.capex_presupuestos from public,anon,authenticated;
grant select on public.capex_categorias,public.capex_presupuestos to authenticated;
revoke all on function public.aprobar_capex_presupuesto(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.aprobar_capex_presupuesto(uuid,integer,jsonb,text) to authenticated;

commit;
```

En `package.json`, agregar al final del script `test`, después de `tests/dashboardInicio.test.mjs`: ` tests/capexAperturas.test.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261109180000_capex_aperturas.sql tests/capexAperturas.test.mjs package.json
git commit -m "feat(capex): categorías y presupuesto aprobado por revisiones"
```

---

### Task 2: Asignación de órdenes y facturas a CAPEX

**Files:**
- Modify: `supabase/migrations/20261109180000_capex_aperturas.sql` (antes de `commit;`)
- Modify: `tests/capexAperturas.test.mjs`

**Interfaces:**
- Consumes: `preparar`, `como`, constantes de Task 1.
- Produces: tablas `public.capex_asignaciones(id, orden_id, factura_id, proyecto_id, categoria, monto, nota, creado_por, creado_en)`, `public.capex_asignacion_historial`; función `public.guardar_capex_asignacion(p_tipo text, p_documento uuid, p_renglones jsonb, p_motivo text) returns void` donde `p_renglones = [{proyecto_id, categoria, monto, nota?}]`. Test helpers `orden(db,id,sucursal,estado,renglones)`, `factura(db,id,sucursal,{tipo,subtotal,descuento,total,estado,uuid_relacionado})`, `asignar(db,tipo,doc,renglones)`.

- [ ] **Step 1: Write the failing test**

Agregar a `tests/capexAperturas.test.mjs`:

```js
export const orden=async(db,id,sucursal,estado,renglones)=>{
 await db.query('insert into ordenes_compra(id,folio,sucursal_id,estado) values($1,$2,$3,$4)',[id,'OC-'+id.slice(-4),sucursal,estado]);
 for(const [cantidad,precio] of renglones)await db.query('insert into orden_renglones(orden_id,cantidad,precio) values($1,$2,$3)',[id,cantidad,precio]);
};
export const factura=async(db,id,sucursal,{tipo='ingreso',subtotal,descuento=0,total,estado='por_pagar',uuid_relacionado=null})=>
 db.query('insert into facturas(id,uuid,folio,tipo,sucursal_id,subtotal,descuento,total,estado,uuid_relacionado) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,'U-'+id,'F-'+id.slice(-4),tipo,sucursal,subtotal,descuento,total,estado,uuid_relacionado]);
export const asignar=(db,tipo,doc,renglones,motivo='Asignación de prueba')=>db.query('select public.guardar_capex_asignacion($1,$2,$3::jsonb,$4)',[tipo,doc,JSON.stringify(renglones),motivo]);
const O1='40000000-0000-0000-0000-000000000001',O2='40000000-0000-0000-0000-000000000002',OF='40000000-0000-0000-0000-000000000003';
const F1='50000000-0000-0000-0000-000000000001',FC='50000000-0000-0000-0000-000000000002';

test('capex: asignar documentos valida sucursal, tope, cancelados, duplicados y deja historial',async()=>{
 const db=await preparar();
 try{
  await orden(db,O1,S1,'confirmada',[[10,1000]]);
  await orden(db,O2,S1,'confirmada',[[1,500],[3,0]]);
  await orden(db,OF,null,'confirmada',[[1,100]]);
  await factura(db,F1,S1,{subtotal:5000,descuento:500,total:5220});
  await factura(db,FC,S1,{subtotal:100,total:116,estado:'cancelada'});
  await como(db,ADMIN);
  await asignar(db,'orden',O1,[{proyecto_id:P1,categoria:'obra_civil',monto:6000},{proyecto_id:P1,categoria:'instalaciones',monto:4000,nota:'Tablero'}]);
  assert.equal((await db.query('select sum(monto)::float8 s from capex_asignaciones where orden_id=$1',[O1])).rows[0].s,10000);
  await assert.rejects(asignar(db,'orden',O1,[{proyecto_id:P1,categoria:'obra_civil',monto:6000},{proyecto_id:P1,categoria:'instalaciones',monto:4000.01}]),/pasa el subtotal/);
  await assert.rejects(asignar(db,'orden',O2,[{proyecto_id:P1,categoria:'otros',monto:500.01}]),/pasa el subtotal/);
  await asignar(db,'orden',O2,[{proyecto_id:P1,categoria:'otros',monto:500}]);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:4500.01}]),/pasa el subtotal/);
  await asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:4500}]);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P2,categoria:'otros',monto:1}]),/sucursal del documento/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:'no-es-uuid',categoria:'otros',monto:1}]),/sucursal del documento/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'pisos',monto:1}]),/Categoría inválida/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:0}]),/Monto inválido/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:'mil'}]),/Monto inválido/);
  await assert.rejects(asignar(db,'factura',F1,[{proyecto_id:P1,categoria:'otros',monto:1},{proyecto_id:P1,categoria:'otros',monto:2}]),/Repetiste/);
  await assert.rejects(asignar(db,'factura',FC,[{proyecto_id:P1,categoria:'otros',monto:1}]),/cancelado/);
  await assert.rejects(asignar(db,'orden',OF,[{proyecto_id:P1,categoria:'otros',monto:1}]),/Oficina/);
  await assert.rejects(asignar(db,'factura','50000000-0000-0000-0000-000000000099',[]),/El documento no existe/);
  await assert.rejects(asignar(db,'factura',F1,[],'abc'),/motivo/);
  await assert.rejects(asignar(db,'remision',F1,[]),/Tipo inválido/);
  await asignar(db,'orden',O1,[],'Ya no es CAPEX');
  assert.equal((await db.query('select count(*)::int n from capex_asignaciones where orden_id=$1',[O1])).rows[0].n,0);
  const h=(await db.query(`select anterior,nuevo,motivo from capex_asignacion_historial where documento_tipo='orden' and documento_id=$1 order by fecha,id`,[O1])).rows;
  assert.equal(h.length,2);
  assert.equal(h[0].anterior.length,0);assert.equal(h[0].nuevo.length,2);
  assert.equal(h[1].anterior.length,2);assert.equal(h[1].nuevo.length,0);assert.equal(h[1].motivo,'Ya no es CAPEX');
  await como(db,CORP);
  await assert.rejects(asignar(db,'factura',F1,[]),/Solo administración/);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: FAIL con `function public.guardar_capex_asignacion(...) does not exist`.

- [ ] **Step 3: Write minimal implementation**

Agregar a la migración, antes de `commit;`:

```sql
create table public.capex_asignaciones(
 id uuid primary key default gen_random_uuid(),
 orden_id uuid references public.ordenes_compra(id),
 factura_id uuid references public.facturas(id),
 proyecto_id uuid not null references public.apertura_proyectos(id),
 categoria text not null references public.capex_categorias(clave),
 monto numeric(16,2) not null check(monto>0 and monto<1e12),
 nota text check(nota is null or length(nota)<=500),
 creado_por uuid not null references public.perfiles(id),
 creado_en timestamptz not null default now(),
 check(num_nonnulls(orden_id,factura_id)=1)
);
create unique index capex_asignacion_orden on public.capex_asignaciones(orden_id,proyecto_id,categoria) where orden_id is not null;
create unique index capex_asignacion_factura on public.capex_asignaciones(factura_id,proyecto_id,categoria) where factura_id is not null;
create index capex_asignacion_proyecto on public.capex_asignaciones(proyecto_id);

create table public.capex_asignacion_historial(
 id uuid primary key default gen_random_uuid(),
 documento_tipo text not null check(documento_tipo in ('orden','factura')),
 documento_id uuid not null,
 anterior jsonb not null,nuevo jsonb not null,
 motivo text not null check(length(trim(motivo)) between 5 and 2000),
 usuario_id uuid not null references public.perfiles(id),
 fecha timestamptz not null default now()
);

-- Reemplaza todos los renglones CAPEX de un documento. Lista vacía = quitar la marca.
create function public.guardar_capex_asignacion(p_tipo text,p_documento uuid,p_renglones jsonb,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid;est text;tope numeric;suma numeric;ant jsonb;nue jsonb;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración asigna CAPEX.';end if;
 if length(trim(coalesce(p_motivo,''))) not between 5 and 2000 then raise exception 'Escribe el motivo del cambio.';end if;
 if jsonb_typeof(p_renglones) is distinct from 'array' then raise exception 'Renglones inválidos.';end if;
 if p_tipo='factura' then
  select f.sucursal_id,f.estado::text,f.subtotal-f.descuento into s,est,tope from public.facturas f where f.id=p_documento for update;
 elsif p_tipo='orden' then
  select o.sucursal_id,o.estado::text into s,est from public.ordenes_compra o where o.id=p_documento for update;
  select coalesce(sum(r.cantidad*r.precio),0) into tope from public.orden_renglones r where r.orden_id=p_documento;
 else raise exception 'Tipo inválido.';end if;
 if est is null then raise exception 'El documento no existe.';end if;
 if est='cancelada' then raise exception 'No se asigna un documento cancelado.';end if;
 if jsonb_array_length(p_renglones)>0 then
  if s is null then raise exception 'Un documento de Oficina no se asigna a una apertura.';end if;
  if exists(select 1 from jsonb_array_elements(p_renglones) r where jsonb_typeof(r)<>'object'
   or not exists(select 1 from public.apertura_proyectos p where p.id::text=r->>'proyecto_id' and p.sucursal_id=s)) then raise exception 'El proyecto debe ser de la sucursal del documento.';end if;
  if exists(select 1 from jsonb_array_elements(p_renglones) r where r->>'categoria' is null or r->>'categoria' not in (select clave from public.capex_categorias)) then raise exception 'Categoría inválida.';end if;
  if exists(select 1 from jsonb_array_elements(p_renglones) r where case when jsonb_typeof(r->'monto')='number' then round((r->>'monto')::numeric,2)<=0 or (r->>'monto')::numeric>=1e12 else true end) then raise exception 'Monto inválido.';end if;
  if exists(select 1 from jsonb_array_elements(p_renglones) r where length(coalesce(r->>'nota',''))>500) then raise exception 'La nota es demasiado larga.';end if;
  if (select count(distinct (r->>'proyecto_id',r->>'categoria')) from jsonb_array_elements(p_renglones) r)<>jsonb_array_length(p_renglones) then raise exception 'Repetiste proyecto y categoría en el mismo documento.';end if;
  select sum(round((r->>'monto')::numeric,2)) into suma from jsonb_array_elements(p_renglones) r;
  if suma>tope then raise exception 'Lo asignado pasa el subtotal del documento.';end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.proyecto_id,a.categoria),'[]'::jsonb) into ant from public.capex_asignaciones a
  where (p_tipo='factura' and a.factura_id=p_documento) or (p_tipo='orden' and a.orden_id=p_documento);
 delete from public.capex_asignaciones a where (p_tipo='factura' and a.factura_id=p_documento) or (p_tipo='orden' and a.orden_id=p_documento);
 insert into public.capex_asignaciones(orden_id,factura_id,proyecto_id,categoria,monto,nota,creado_por)
 select case when p_tipo='orden' then p_documento end,case when p_tipo='factura' then p_documento end,
  (r->>'proyecto_id')::uuid,r->>'categoria',round((r->>'monto')::numeric,2),nullif(trim(r->>'nota'),''),auth.uid()
 from jsonb_array_elements(p_renglones) r;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.proyecto_id,a.categoria),'[]'::jsonb) into nue from public.capex_asignaciones a
  where (p_tipo='factura' and a.factura_id=p_documento) or (p_tipo='orden' and a.orden_id=p_documento);
 insert into public.capex_asignacion_historial(documento_tipo,documento_id,anterior,nuevo,motivo,usuario_id)
 values(p_tipo,p_documento,ant,nue,trim(p_motivo),auth.uid());
end $$;

alter table public.capex_asignaciones enable row level security;
alter table public.capex_asignacion_historial enable row level security;
create policy ver_capex_asignaciones on public.capex_asignaciones for select using(public.ve_finanzas());
create policy ver_capex_asignacion_historial on public.capex_asignacion_historial for select using(public.ve_finanzas());
revoke all on public.capex_asignaciones,public.capex_asignacion_historial from public,anon,authenticated;
grant select on public.capex_asignaciones,public.capex_asignacion_historial to authenticated;
revoke all on function public.guardar_capex_asignacion(text,uuid,jsonb,text) from public,anon;
grant execute on function public.guardar_capex_asignacion(text,uuid,jsonb,text) to authenticated;
```

Nota: `p.id::text=r->>'proyecto_id'` evita que un texto que no es uuid truene con error de conversión (Review Focus 5).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261109180000_capex_aperturas.sql tests/capexAperturas.test.mjs
git commit -m "feat(capex): asignación de órdenes y facturas con validación e historial"
```

---

### Task 3: Vista `capex_resumen` (comprometido, facturado, pagado, por ejercer)

**Files:**
- Modify: `supabase/migrations/20261109180000_capex_aperturas.sql`
- Modify: `tests/capexAperturas.test.mjs`

**Interfaces:**
- Consumes: `capex_presupuestos`, `capex_asignaciones`, helpers de Tasks 1–2.
- Produces: vista `public.capex_resumen` con columnas `proyecto_id uuid, categoria text, presupuesto numeric|null, comprometido, facturado, pagado, pagado_con_iva, por_pagar_con_iva numeric, por_ejercer numeric|null, desviacion numeric|null`.

- [ ] **Step 1: Write the failing test**

Agregar a `tests/capexAperturas.test.mjs`:

```js
const fila=async(db,p,c)=>(await db.query(`select presupuesto::float8,comprometido::float8,facturado::float8,pagado::float8,pagado_con_iva::float8,por_pagar_con_iva::float8,por_ejercer::float8,desviacion::float8
 from capex_resumen where proyecto_id=$1 and categoria=$2`,[p,c])).rows[0];
const pagar=async(db,facturaId,monto,anulado=false)=>{const g=(await db.query('insert into pagos(monto,anulado_en) values($1,$2) returning id',[monto,anulado?new Date().toISOString():null])).rows[0].id;
 await db.query('insert into pago_aplicaciones(pago_id,factura_id,monto) values($1,$2,$3)',[g,facturaId,monto]);};
const id=(p,n)=>`${p}0000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('capex: resumen cruza presupuesto, órdenes, facturas, notas de crédito y pagos',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  await db.query('select public.aprobar_capex_presupuesto($1,0,$2::jsonb,$3)',[P1,JSON.stringify({obra_civil:10000,instalaciones:5000}),'Presupuesto inicial']);
  await orden(db,id(4,11),S1,'confirmada',[[1,8000]]);
  await asignar(db,'orden',id(4,11),[{proyecto_id:P1,categoria:'obra_civil',monto:8000}]);
  await factura(db,id(5,11),S1,{subtotal:3000,total:3480});
  await db.query('insert into factura_ordenes values($1,$2)',[id(5,11),id(4,11)]);
  await asignar(db,'factura',id(5,11),[{proyecto_id:P1,categoria:'obra_civil',monto:3000}]);
  await pagar(db,id(5,11),1740);
  await factura(db,id(5,12),S1,{subtotal:2000,total:2320});
  await asignar(db,'factura',id(5,12),[{proyecto_id:P1,categoria:'instalaciones',monto:2000}]);
  await pagar(db,id(5,12),2320,true);
  await factura(db,id(5,13),S1,{tipo:'egreso',subtotal:500,total:580,uuid_relacionado:id(5,11)});
  await asignar(db,'factura',id(5,13),[{proyecto_id:P1,categoria:'obra_civil',monto:500}]);
  await factura(db,id(5,14),S1,{subtotal:1000,total:1160});
  await asignar(db,'factura',id(5,14),[{proyecto_id:P1,categoria:'obra_civil',monto:1000}]);
  await db.query(`update facturas set estado='cancelada' where id=$1`,[id(5,14)]);
  await orden(db,id(4,12),S1,'borrador',[[1,700]]);
  await asignar(db,'orden',id(4,12),[{proyecto_id:P1,categoria:'instalaciones',monto:700}]);
  // Total 0 (todo retenido): no debe dividir entre cero.
  await factura(db,id(5,15),S1,{subtotal:100,total:0});
  await asignar(db,'factura',id(5,15),[{proyecto_id:P1,categoria:'otros',monto:100}]);
  assert.deepEqual(await fila(db,P1,'obra_civil'),{presupuesto:10000,comprometido:5000,facturado:2500,pagado:1500,pagado_con_iva:1740,por_pagar_con_iva:1160,por_ejercer:2500,desviacion:-2500});
  assert.deepEqual(await fila(db,P1,'instalaciones'),{presupuesto:5000,comprometido:0,facturado:2000,pagado:0,pagado_con_iva:0,por_pagar_con_iva:2320,por_ejercer:3000,desviacion:-3000});
  assert.deepEqual(await fila(db,P1,'otros'),{presupuesto:0,comprometido:0,facturado:100,pagado:0,pagado_con_iva:0,por_pagar_con_iva:0,por_ejercer:-100,desviacion:100});
  assert.deepEqual(await fila(db,P1,'mobiliario'),{presupuesto:0,comprometido:0,facturado:0,pagado:0,pagado_con_iva:0,por_pagar_con_iva:0,por_ejercer:0,desviacion:0});
  await db.query(`update ordenes_compra set estado='cerrada' where id=$1`,[id(4,11)]);
  assert.equal((await fila(db,P1,'obra_civil')).comprometido,0);
 }finally{await db.close();}
});

test('capex: reparto 60/40 prorratea pago e IVA; sin presupuesto no hay desviación',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  await factura(db,id(5,21),S2,{subtotal:10000,total:11600});
  await asignar(db,'factura',id(5,21),[{proyecto_id:P2,categoria:'equipo_cocina',monto:6000},{proyecto_id:P2,categoria:'mobiliario',monto:4000}]);
  await pagar(db,id(5,21),5800);
  assert.deepEqual(await fila(db,P2,'equipo_cocina'),{presupuesto:null,comprometido:0,facturado:6000,pagado:3000,pagado_con_iva:3480,por_pagar_con_iva:3480,por_ejercer:null,desviacion:null});
  assert.deepEqual(await fila(db,P2,'mobiliario'),{presupuesto:null,comprometido:0,facturado:4000,pagado:2000,pagado_con_iva:2320,por_pagar_con_iva:2320,por_ejercer:null,desviacion:null});
 }finally{await db.close();}
});

test('capex: una factura de dos órdenes no deja comprometido negativo',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  await orden(db,id(4,31),S1,'confirmada',[[1,1000]]);
  await orden(db,id(4,32),S1,'confirmada',[[1,1000]]);
  for(const o of [id(4,31),id(4,32)])await asignar(db,'orden',o,[{proyecto_id:P1,categoria:'mobiliario',monto:1000}]);
  await factura(db,id(5,31),S1,{subtotal:1500,total:1740});
  for(const o of [id(4,31),id(4,32)])await db.query('insert into factura_ordenes values($1,$2)',[id(5,31),o]);
  await asignar(db,'factura',id(5,31),[{proyecto_id:P1,categoria:'mobiliario',monto:1500}]);
  const f=await fila(db,P1,'mobiliario');
  assert.equal(f.comprometido,0);
  assert.equal(f.facturado,1500);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: FAIL con `relation "capex_resumen" does not exist`.

- [ ] **Step 3: Write minimal implementation**

Agregar a la migración, antes de `commit;`:

```sql
-- Presupuesto vs real por apertura y categoría. Sin IVA salvo las columnas *_con_iva.
-- Una factura ligada a dos órdenes de la misma categoría se descuenta de ambas (comprometido puede quedar bajo, nunca negativo).
create view public.capex_resumen with(security_invoker=true) as
with pre as(
 select p.proyecto_id,p.categoria,p.monto from public.capex_presupuestos p
 where p.revision=(select max(x.revision) from public.capex_presupuestos x where x.proyecto_id=p.proyecto_id)
),pag as(
 select pa.factura_id,sum(pa.monto) pagado from public.pago_aplicaciones pa join public.pagos g on g.id=pa.pago_id
 where g.anulado_en is null group by pa.factura_id
),fac as(
 select a.proyecto_id,a.categoria,
  sum(case when f.tipo='egreso' then -a.monto else a.monto end) facturado,
  sum(case when f.tipo='egreso' then -1 else 1 end*a.monto*f.total/nullif(f.subtotal-f.descuento,0)) facturado_con_iva,
  sum(case when f.tipo='egreso' then 0 else a.monto*coalesce(pag.pagado,0)/nullif(f.subtotal-f.descuento,0) end) pagado_con_iva,
  sum(case when f.tipo='egreso' then 0 else a.monto*coalesce(pag.pagado,0)/nullif(f.total,0) end) pagado
 from public.capex_asignaciones a join public.facturas f on f.id=a.factura_id left join pag on pag.factura_id=f.id
 where f.estado<>'cancelada' group by a.proyecto_id,a.categoria
),ord as(
 select a.proyecto_id,a.categoria,sum(greatest(0,a.monto-coalesce((
  select sum(case when f.tipo='egreso' then -b.monto else b.monto end)
  from public.factura_ordenes fo join public.facturas f on f.id=fo.factura_id and f.estado<>'cancelada'
  join public.capex_asignaciones b on b.factura_id=f.id and b.proyecto_id=a.proyecto_id and b.categoria=a.categoria
  where fo.orden_id=a.orden_id),0))) comprometido
 from public.capex_asignaciones a join public.ordenes_compra o on o.id=a.orden_id
 where o.estado='confirmada' group by a.proyecto_id,a.categoria
),llaves as(
 select proyecto_id,categoria from pre union select proyecto_id,categoria from fac union select proyecto_id,categoria from ord
)
select l.proyecto_id,l.categoria,pre.monto presupuesto,
 round(coalesce(ord.comprometido,0),2) comprometido,
 round(coalesce(fac.facturado,0),2) facturado,
 round(coalesce(fac.pagado,0),2) pagado,
 round(coalesce(fac.pagado_con_iva,0),2) pagado_con_iva,
 round(coalesce(fac.facturado_con_iva,0)-coalesce(fac.pagado_con_iva,0),2) por_pagar_con_iva,
 round(pre.monto-coalesce(ord.comprometido,0)-coalesce(fac.facturado,0),2) por_ejercer,
 round(coalesce(ord.comprometido,0)+coalesce(fac.facturado,0)-pre.monto,2) desviacion
from llaves l
left join pre on pre.proyecto_id=l.proyecto_id and pre.categoria=l.categoria
left join fac on fac.proyecto_id=l.proyecto_id and fac.categoria=l.categoria
left join ord on ord.proyecto_id=l.proyecto_id and ord.categoria=l.categoria;
revoke all on public.capex_resumen from public,anon,authenticated;
grant select on public.capex_resumen to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: PASS (6 tests). Si `por_pagar_con_iva` de obra_civil no da 1160: facturado con IVA = 3480 − 580 = 2900, menos pagado con IVA 1740.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261109180000_capex_aperturas.sql tests/capexAperturas.test.mjs
git commit -m "feat(capex): vista de presupuesto vs comprometido, facturado y pagado"
```

---

### Task 4: Inversión histórica con equivalencias

**Files:**
- Modify: `supabase/migrations/20261109180000_capex_aperturas.sql`
- Modify: `tests/capexAperturas.test.mjs`

**Interfaces:**
- Produces: tabla `public.capex_equivalencias_historico(tipo, categoria_origen, categoria|null)`; función `public.guardar_capex_equivalencia(p_tipo text, p_origen text, p_categoria text) returns void`; vista `public.capex_historico(fuente_id, sucursal_id, nombre, fecha, categoria, monto)`.

- [ ] **Step 1: Write the failing test**

Agregar a `tests/capexAperturas.test.mjs`:

```js
test('capex: equivalencias cubren todos los pares de la carga de Zapopan-1',async()=>{
 const db=await preparar();
 try{
  const carga=load('supabase/cargas/inversion_zapopan_1.sql');
  const pares=new Set([...carga.matchAll(/"tipo": "([^"]*)", "categoria": "([^"]*)"/g)].map(m=>m[1]+'|'+m[2]));
  assert.equal(pares.size,23);
  const filas=(await db.query('select tipo,categoria_origen from capex_equivalencias_historico')).rows.map(r=>r.tipo+'|'+r.categoria_origen);
  assert.deepEqual([...filas].sort(),[...pares].sort());
 }finally{await db.close();}
});

test('capex: histórico agrupa por categoría, excluye lo que no es CAPEX y admin ajusta',async()=>{
 const db=await preparar();
 try{
  const detalles=[
   {id:'D1',tipo:'1. CAPEX – Activo fijo',categoria:'Mobiliario',monto:1000},
   {id:'D2',tipo:'1. CAPEX – Activo fijo',categoria:'Equipo de cocina mayor',monto:2000.5},
   {id:'D3',tipo:'3. Gastos preoperativos',categoria:'Renta',monto:500},
   {id:'D4',tipo:'X',categoria:'Nueva',monto:300}];
  await db.query(`insert into inversion_apertura_fuentes(sucursal_id,nombre,fecha,total,datos) values($1,'Zoho','2026-08-01',3800.5,$2::jsonb)`,[S2,JSON.stringify({detalles})]);
  const hist=async()=>Object.fromEntries((await db.query('select categoria,monto::float8 m from capex_historico order by categoria')).rows.map(r=>[r.categoria,r.m]));
  assert.deepEqual(await hist(),{equipo_cocina:2000.5,mobiliario:1000,otros:300});
  await como(db,ADMIN);
  await db.query(`select public.guardar_capex_equivalencia('X','Nueva','tecnologia')`);
  assert.deepEqual(await hist(),{equipo_cocina:2000.5,mobiliario:1000,tecnologia:300});
  await db.query(`select public.guardar_capex_equivalencia('X','Nueva',null)`);
  assert.deepEqual(await hist(),{equipo_cocina:2000.5,mobiliario:1000});
  await assert.rejects(db.query(`select public.guardar_capex_equivalencia('X','Nueva','pisos')`),/Categoría inválida/);
  await como(db,CORP);
  await assert.rejects(db.query(`select public.guardar_capex_equivalencia('X','Nueva','otros')`),/Solo administración/);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: FAIL con `relation "capex_equivalencias_historico" does not exist`.

- [ ] **Step 3: Write minimal implementation**

Agregar a la migración, antes de `commit;` (los textos de `tipo` llevan guion largo `–`, copiados de `supabase/cargas/inversion_zapopan_1.sql`):

```sql
-- Equivalencia de la clasificación de las fuentes históricas. categoria null = no es CAPEX (preoperativos, depósitos).
create table public.capex_equivalencias_historico(
 tipo text not null,categoria_origen text not null,
 categoria text references public.capex_categorias(clave),
 primary key(tipo,categoria_origen)
);
insert into public.capex_equivalencias_historico(tipo,categoria_origen,categoria) values
 ('1. CAPEX – Activo fijo','Equipo tecnológico','tecnologia'),
 ('1. CAPEX – Activo fijo','Equipo de cocina mayor','equipo_cocina'),
 ('1. CAPEX – Activo fijo','Instalaciones y materiales menores de obra','instalaciones'),
 ('1. CAPEX – Activo fijo','Obra civil e instalaciones (contratista general)','obra_civil'),
 ('1. CAPEX – Activo fijo','Carpintería, decoración y cortinas','obra_civil'),
 ('1. CAPEX – Activo fijo','Señalética y logotipos','senaletica'),
 ('1. CAPEX – Activo fijo','Mobiliario','mobiliario'),
 ('1. CAPEX – Activo fijo','Aluminio, cristal y fachada','obra_civil'),
 ('1. CAPEX – Activo fijo','Aire acondicionado y extracción (HVAC)','instalaciones'),
 ('1. CAPEX – Activo fijo','Acabados (pisos, azulejo, pintura)','obra_civil'),
 ('2. Equipo menor','Accesorios tecnológicos','tecnologia'),
 ('2. Equipo menor','Limpieza, higiene y seguridad','smallware'),
 ('2. Equipo menor','Utensilios de cocina (smallwares)','smallware'),
 ('2. Equipo menor','Oficina, papelería durable e identificación','otros'),
 ('3. Gastos preoperativos','Licencias, permisos y protección civil','proyecto_permisos'),
 ('3. Gastos preoperativos','Consumibles (limpieza, papelería, agua)',null),
 ('3. Gastos preoperativos','Traslados y viáticos',null),
 ('3. Gastos preoperativos','Insumos, bebidas y pruebas de producto',null),
 ('3. Gastos preoperativos','Servicios (luz, internet, gas, mensajería)',null),
 ('3. Gastos preoperativos','Nómina y bonos',null),
 ('3. Gastos preoperativos','Renta',null),
 ('4. Depósitos y fondos','Depósitos en garantía',null),
 ('4. Depósitos y fondos','Fondo de caja chica',null);

create function public.guardar_capex_equivalencia(p_tipo text,p_origen text,p_categoria text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.edita_finanzas() then raise exception 'Solo administración ajusta equivalencias.';end if;
 if length(trim(coalesce(p_tipo,'')))=0 or length(trim(coalesce(p_origen,'')))=0 then raise exception 'Tipo y categoría de origen son obligatorios.';end if;
 if p_categoria is not null and not exists(select 1 from public.capex_categorias where clave=p_categoria) then raise exception 'Categoría inválida.';end if;
 insert into public.capex_equivalencias_historico(tipo,categoria_origen,categoria) values(p_tipo,p_origen,p_categoria)
 on conflict(tipo,categoria_origen) do update set categoria=excluded.categoria;
end $$;

-- Importe tal como viene en la fuente contable (sin desglose de IVA). Par sin equivalencia → otros.
create view public.capex_historico with(security_invoker=true) as
select f.id fuente_id,f.sucursal_id,f.nombre,f.fecha,coalesce(e.categoria,'otros') categoria,round(sum((d->>'monto')::numeric),2) monto
from public.inversion_apertura_fuentes f
cross join lateral jsonb_array_elements(f.datos->'detalles') d
left join public.capex_equivalencias_historico e on e.tipo=d->>'tipo' and e.categoria_origen=d->>'categoria'
where e.tipo is null or e.categoria is not null
group by f.id,f.sucursal_id,f.nombre,f.fecha,coalesce(e.categoria,'otros');

alter table public.capex_equivalencias_historico enable row level security;
create policy ver_capex_equivalencias on public.capex_equivalencias_historico for select using(public.ve_finanzas());
revoke all on public.capex_equivalencias_historico,public.capex_historico from public,anon,authenticated;
grant select on public.capex_equivalencias_historico,public.capex_historico to authenticated;
revoke all on function public.guardar_capex_equivalencia(text,text,text) from public,anon;
grant execute on function public.guardar_capex_equivalencia(text,text,text) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261109180000_capex_aperturas.sql tests/capexAperturas.test.mjs
git commit -m "feat(capex): inversión histórica agrupada con equivalencias editables"
```

---

### Task 5: Permisos por rol y prueba para producción

**Files:**
- Create: `supabase/pruebas/20261109180000_capex_aperturas.sql`
- Modify: `tests/capexAperturas.test.mjs`

**Interfaces:**
- Consumes: todo lo de Tasks 1–4.
- Produces: script que Sebastián corre en producción; debe terminar en `PRUEBAS OK — …`.

- [ ] **Step 1: Write the failing test**

Agregar a `tests/capexAperturas.test.mjs`:

```js
test('capex: corporativo lee y no escribe; gerente no ve nada',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  await db.query('select public.aprobar_capex_presupuesto($1,0,$2::jsonb,$3)',[P1,JSON.stringify({obra_civil:1}),'Presupuesto inicial']);
  await db.exec('grant select on all tables in schema public to authenticated');
  await como(db,CORP);await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int n from capex_resumen')).rows[0].n,10);
  await assert.rejects(db.query(`insert into capex_asignaciones(factura_id,proyecto_id,categoria,monto,creado_por) values(gen_random_uuid(),'${P1}','otros',1,'${CORP}')`),/permission denied/);
  await assert.rejects(db.query(`delete from capex_presupuestos`),/permission denied/);
  await db.exec('reset role');
  await como(db,GER);await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int n from capex_presupuestos')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from capex_categorias')).rows[0].n,0);
  await db.exec('reset role');
 }finally{await db.close();}
});

test('capex: la prueba de producción termina en PRUEBAS OK y no deja cambios',async()=>{
 const db=await preparar();
 try{
  await assert.rejects(db.exec(load('supabase/pruebas/20261109180000_capex_aperturas.sql')),e=>{assert.match(e.message,/^PRUEBAS OK/);return true;});
  assert.equal((await db.query('select count(*)::int n from capex_presupuestos')).rows[0].n,0);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: el test de roles PASA (la RLS ya existe) y el de producción FALLA con `ENOENT ... supabase/pruebas/20261109180000_capex_aperturas.sql`.

- [ ] **Step 3: Write minimal implementation**

Crear `supabase/pruebas/20261109180000_capex_aperturas.sql`:

```sql
-- Después de 20261109180000_capex_aperturas.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;c uuid;p uuid;r integer;n integer;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and rol::text='corporativo' limit 1;
 select id into p from public.apertura_proyectos order by id limit 1;
 if a is null or p is null then raise exception 'FALTAN DATOS: un admin y al menos una apertura.';end if;
 if (select count(*) from public.capex_categorias)<>10 then raise exception 'FALLÓ: categorías';end if;
 if (select count(*) from public.capex_equivalencias_historico)<>23 then raise exception 'FALLÓ: equivalencias del histórico';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 select coalesce(max(revision),0) into n from public.capex_presupuestos where proyecto_id=p;
 r:=public.aprobar_capex_presupuesto(p,n,'{"obra_civil":100,"equipo_cocina":50}'::jsonb,'Prueba de revisión');
 if r<>n+1 or (select sum(monto) from public.capex_presupuestos where proyecto_id=p and revision=r)<>150 then raise exception 'FALLÓ: aprobar presupuesto';end if;
 begin perform public.aprobar_capex_presupuesto(p,n,'{"obra_civil":1}'::jsonb,'Prueba de conflicto');raise exception 'FALLÓ: conflicto de revisión';
 exception when others then if sqlerrm not like 'El presupuesto cambió%' then raise;end if;end;
 begin perform public.guardar_capex_asignacion('factura',gen_random_uuid(),'[]'::jsonb,'Prueba documento inexistente');raise exception 'FALLÓ: documento inexistente';
 exception when others then if sqlerrm<>'El documento no existe.' then raise;end if;end;
 perform 1 from public.capex_resumen where proyecto_id=p;
 perform 1 from public.capex_historico;
 if c is not null then
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  begin perform public.aprobar_capex_presupuesto(p,r,'{"obra_civil":1}'::jsonb,'Prueba corporativo');raise exception 'FALLÓ: corporativo aprueba';
  exception when others then if sqlerrm not like 'Solo administración%' then raise;end if;end;
 end if;
 if has_function_privilege('anon','public.aprobar_capex_presupuesto(uuid,integer,jsonb,text)','EXECUTE')
 or has_function_privilege('anon','public.guardar_capex_asignacion(text,uuid,jsonb,text)','EXECUTE')
 or has_function_privilege('anon','public.guardar_capex_equivalencia(text,text,text)','EXECUTE') then raise exception 'FALLÓ: permisos de anon';end if;
 raise exception 'PRUEBAS OK — 10 categorías · 23 equivalencias · revisión de presupuesto con conflicto · documento inexistente rechazado · vistas legibles · corporativo no aprueba · anon sin ejecutar';
end $$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/capexAperturas.test.mjs`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/pruebas/20261109180000_capex_aperturas.sql tests/capexAperturas.test.mjs
git commit -m "test(capex): permisos por rol y prueba para producción"
```

---

### Task 6: Lógica pura en `lib/finanzas/capex.ts`

**Files:**
- Create: `lib/finanzas/capex.ts`
- Create: `lib/finanzas/capex.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `CATEGORIAS_CAPEX: readonly {clave: CategoriaCapex; nombre: string}[]`, `type CategoriaCapex`, `nombreCategoriaCapex(clave: string): string`
  - `type FilaCapex = {proyecto_id: string; categoria: string; presupuesto: number|null; comprometido: number; facturado: number; pagado: number; pagado_con_iva: number; por_pagar_con_iva: number; por_ejercer: number|null; desviacion: number|null}`
  - `type Semaforo = "verde"|"ambar"|"rojo"|"gris"`, `semaforo(presupuesto: number|null, ejercido: number): Semaforo`, `TONO_SEMAFORO: Record<Semaforo, string|undefined>`, `TEXTO_SEMAFORO: Record<Semaforo,string>`
  - `type ResumenCapex = {presupuesto: number|null; comprometido: number; facturado: number; ejercido: number; pagado_con_iva: number; por_pagar_con_iva: number; por_ejercer: number|null; porcentaje: number|null; semaforo: Semaforo}`, `resumir(filas: FilaCapex[]): ResumenCapex`
  - `equivalenciaItem(categoria: string|null): CategoriaCapex`
  - `type RenglonCapex = {proyecto_id: string; categoria: string; monto: number; nota?: string|null}`, `sugerirAsignacion(e: {subtotal: number; proyectos: string[]; categoriasItems: (string|null)[]; base: RenglonCapex[]}): RenglonCapex[]`
  - `leerRenglones(fd: FormData, filas: number): RenglonCapex[]` (lee `proyecto_i`, `categoria_i`, `monto_i`, `nota_i`; lanza `Error` con el número de renglón si el monto no es número)

- [ ] **Step 1: Write the failing test**

Crear `lib/finanzas/capex.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORIAS_CAPEX, equivalenciaItem, leerRenglones, resumir, semaforo, sugerirAsignacion, type FilaCapex } from "./capex.ts";

const fila = (x: Partial<FilaCapex>): FilaCapex => ({ proyecto_id: "p", categoria: "otros", presupuesto: null, comprometido: 0, facturado: 0, pagado: 0, pagado_con_iva: 0, por_pagar_con_iva: 0, por_ejercer: null, desviacion: null, ...x });

test("las categorías en TS son las mismas de la migración", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261109180000_capex_aperturas.sql", import.meta.url), "utf8");
  const enSql = [...sql.matchAll(/\('([a-z_]+)','[^']+',(\d+)\)/g)].map((m) => m[1]);
  assert.deepEqual(CATEGORIAS_CAPEX.map((c) => c.clave), enSql);
});

test("semáforo: bordes de 90 % y 100 %, cero y sin presupuesto", () => {
  assert.equal(semaforo(null, 5), "gris");
  assert.equal(semaforo(100, 89.99), "verde");
  assert.equal(semaforo(100, 90), "ambar");
  assert.equal(semaforo(100, 100), "ambar");
  assert.equal(semaforo(100, 100.01), "rojo");
  assert.equal(semaforo(0, 0), "verde");
  assert.equal(semaforo(0, 1), "rojo");
});

test("resumir suma en centavos y calcula ejercido, por ejercer y porcentaje", () => {
  const r = resumir([fila({ presupuesto: 0.1, comprometido: 0.1, facturado: 0.2, pagado_con_iva: 0.1, por_pagar_con_iva: 0.2 }), fila({ presupuesto: 0.2, facturado: 0.05 })]);
  assert.deepEqual(r, { presupuesto: 0.3, comprometido: 0.1, facturado: 0.25, ejercido: 0.35, pagado_con_iva: 0.1, por_pagar_con_iva: 0.2, por_ejercer: -0.05, porcentaje: 0.35 / 0.3, semaforo: "rojo" });
  const sin = resumir([fila({ facturado: 10 })]);
  assert.equal(sin.presupuesto, null);
  assert.equal(sin.por_ejercer, null);
  assert.equal(sin.porcentaje, null);
  assert.equal(sin.semaforo, "gris");
  assert.equal(resumir([]).semaforo, "gris");
});

test("equivalencia de categorías de items de apertura", () => {
  assert.equal(equivalenciaItem("pisos"), "obra_civil");
  assert.equal(equivalenciaItem("iluminacion"), "instalaciones");
  assert.equal(equivalenciaItem("senaletica_fachada"), "senaletica");
  assert.equal(equivalenciaItem("camara_fria"), "camara_fria");
  assert.equal(equivalenciaItem(null), "otros");
  assert.equal(equivalenciaItem("desconocida"), "otros");
});

test("sugerir: prorratea la base al subtotal; sin base usa la categoría más común", () => {
  assert.deepEqual(sugerirAsignacion({ subtotal: 1000, proyectos: ["p"], categoriasItems: [], base: [{ proyecto_id: "p", categoria: "obra_civil", monto: 2 }, { proyecto_id: "p", categoria: "instalaciones", monto: 1 }] }),
    [{ proyecto_id: "p", categoria: "obra_civil", monto: 666.67 }, { proyecto_id: "p", categoria: "instalaciones", monto: 333.33 }]);
  assert.deepEqual(sugerirAsignacion({ subtotal: 500, proyectos: ["p"], categoriasItems: ["pisos", "mobiliario", "plafones"], base: [] }), [{ proyecto_id: "p", categoria: "obra_civil", monto: 500 }]);
  assert.deepEqual(sugerirAsignacion({ subtotal: 500, proyectos: ["p"], categoriasItems: [], base: [] }), [{ proyecto_id: "p", categoria: "otros", monto: 500 }]);
  assert.deepEqual(sugerirAsignacion({ subtotal: 500, proyectos: [], categoriasItems: [], base: [] }), []);
  assert.deepEqual(sugerirAsignacion({ subtotal: 0, proyectos: ["p"], categoriasItems: [], base: [] }), []);
  assert.deepEqual(sugerirAsignacion({ subtotal: 500, proyectos: ["p"], categoriasItems: [], base: [{ proyecto_id: "otro", categoria: "otros", monto: 1 }] }), [{ proyecto_id: "p", categoria: "otros", monto: 500 }]);
});

test("leer renglones del formulario: formatos de pesos, renglones vacíos y montos inválidos", () => {
  const fd = new FormData();
  fd.set("proyecto_0", "p"); fd.set("categoria_0", "obra_civil"); fd.set("monto_0", "$1,234.567"); fd.set("nota_0", " Anticipo ");
  fd.set("proyecto_1", "p"); fd.set("categoria_1", "otros"); fd.set("monto_1", "");
  fd.set("proyecto_2", "p"); fd.set("categoria_2", "mobiliario"); fd.set("monto_2", "500");
  assert.deepEqual(leerRenglones(fd, 3), [{ proyecto_id: "p", categoria: "obra_civil", monto: 1234.57, nota: "Anticipo" }, { proyecto_id: "p", categoria: "mobiliario", monto: 500, nota: null }]);
  fd.set("monto_1", "mil");
  assert.throws(() => leerRenglones(fd, 3), /renglón 2/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/finanzas/capex.test.ts`
Expected: FAIL con `Cannot find module './capex.ts'`.

- [ ] **Step 3: Write minimal implementation**

Crear `lib/finanzas/capex.ts`:

```ts
// CAPEX de aperturas: catálogo, semáforo, resúmenes y sugerencias. Diseño: docs/superpowers/specs/2026-11-09-capex-aperturas-design.md
export const CATEGORIAS_CAPEX = [
  { clave: "proyecto_permisos", nombre: "Proyecto y permisos" },
  { clave: "obra_civil", nombre: "Obra civil y acabados" },
  { clave: "instalaciones", nombre: "Instalaciones (eléctrica, hidráulica, gas, HVAC)" },
  { clave: "equipo_cocina", nombre: "Equipo de cocina" },
  { clave: "camara_fria", nombre: "Cámara fría" },
  { clave: "mobiliario", nombre: "Mobiliario" },
  { clave: "tecnologia", nombre: "Tecnología y POS" },
  { clave: "senaletica", nombre: "Señalética" },
  { clave: "smallware", nombre: "Smallware" },
  { clave: "otros", nombre: "Otros" },
] as const;
export type CategoriaCapex = (typeof CATEGORIAS_CAPEX)[number]["clave"];
export const nombreCategoriaCapex = (clave: string) => CATEGORIAS_CAPEX.find((c) => c.clave === clave)?.nombre ?? clave;

export type FilaCapex = {
  proyecto_id: string; categoria: string; presupuesto: number | null; comprometido: number; facturado: number;
  pagado: number; pagado_con_iva: number; por_pagar_con_iva: number; por_ejercer: number | null; desviacion: number | null;
};

export type Semaforo = "verde" | "ambar" | "rojo" | "gris";
export const TONO_SEMAFORO: Record<Semaforo, string | undefined> = { verde: "exito", ambar: "aviso", rojo: "peligro", gris: undefined };
export const TEXTO_SEMAFORO: Record<Semaforo, string> = { verde: "En presupuesto", ambar: "Cerca del límite", rojo: "Sobre presupuesto", gris: "Sin presupuesto aprobado" };

/** verde < 90 % · ámbar 90–100 % · rojo > 100 % · gris sin presupuesto. */
export function semaforo(presupuesto: number | null, ejercido: number): Semaforo {
  if (presupuesto === null) return "gris";
  if (presupuesto === 0) return ejercido > 0 ? "rojo" : "verde";
  const p = ejercido / presupuesto;
  return p > 1 ? "rojo" : p >= 0.9 ? "ambar" : "verde";
}

const c = (n: number) => Math.round(n * 100);

export type ResumenCapex = {
  presupuesto: number | null; comprometido: number; facturado: number; ejercido: number;
  pagado_con_iva: number; por_pagar_con_iva: number; por_ejercer: number | null; porcentaje: number | null; semaforo: Semaforo;
};

export function resumir(filas: FilaCapex[]): ResumenCapex {
  const suma = (f: (x: FilaCapex) => number) => filas.reduce((a, x) => a + c(f(x)), 0) / 100;
  const presupuesto = filas.some((x) => x.presupuesto !== null) ? suma((x) => x.presupuesto ?? 0) : null;
  const comprometido = suma((x) => x.comprometido);
  const facturado = suma((x) => x.facturado);
  const ejercido = (c(comprometido) + c(facturado)) / 100;
  return {
    presupuesto, comprometido, facturado, ejercido,
    pagado_con_iva: suma((x) => x.pagado_con_iva), por_pagar_con_iva: suma((x) => x.por_pagar_con_iva),
    por_ejercer: presupuesto === null ? null : (c(presupuesto) - c(ejercido)) / 100,
    porcentaje: presupuesto ? ejercido / presupuesto : null,
    semaforo: semaforo(presupuesto, ejercido),
  };
}

const ITEM_A_CAPEX: Record<string, CategoriaCapex> = {
  equipo_cocina: "equipo_cocina", camara_fria: "camara_fria", mobiliario: "mobiliario",
  puertas: "obra_civil", zoclos: "obra_civil", pisos: "obra_civil", acabados: "obra_civil", paneles: "obra_civil", plafones: "obra_civil", sanitarios: "obra_civil",
  contactos: "instalaciones", salidas_cable: "instalaciones", baja_tension: "instalaciones", iluminacion: "instalaciones",
  senaletica_interior: "senaletica", senaletica_fachada: "senaletica",
};
export const equivalenciaItem = (categoria: string | null): CategoriaCapex => (categoria && ITEM_A_CAPEX[categoria]) || "otros";

export type RenglonCapex = { proyecto_id: string; categoria: string; monto: number; nota?: string | null };

/** Sugerencia para un documento sin asignación: reparte la base (orden o factura relacionada) al subtotal, o usa la categoría más común de sus items. */
export function sugerirAsignacion(e: { subtotal: number; proyectos: string[]; categoriasItems: (string | null)[]; base: RenglonCapex[] }): RenglonCapex[] {
  if (e.subtotal <= 0) return [];
  const base = e.base.filter((r) => e.proyectos.includes(r.proyecto_id) && r.monto > 0);
  if (base.length) {
    const total = base.reduce((a, r) => a + c(r.monto), 0);
    let resto = c(e.subtotal);
    return base.map((r, i) => {
      const m = i === base.length - 1 ? resto : Math.round((c(e.subtotal) * c(r.monto)) / total);
      resto -= m;
      return { proyecto_id: r.proyecto_id, categoria: r.categoria, monto: m / 100 };
    });
  }
  if (e.proyectos.length !== 1) return [];
  const cuenta = new Map<CategoriaCapex, number>();
  for (const x of e.categoriasItems) { const k = equivalenciaItem(x); cuenta.set(k, (cuenta.get(k) ?? 0) + 1); }
  const categoria = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "otros";
  return [{ proyecto_id: e.proyectos[0]!, categoria, monto: e.subtotal }];
}

/** Lee los renglones `proyecto_i, categoria_i, monto_i, nota_i`; omite los que no traen monto. */
export function leerRenglones(fd: FormData, filas: number): RenglonCapex[] {
  const out: RenglonCapex[] = [];
  for (let i = 0; i < filas; i++) {
    const texto = String(fd.get(`monto_${i}`) ?? "").replace(/[$,\s]/g, "");
    if (!texto) continue;
    const monto = Number(texto);
    if (!Number.isFinite(monto)) throw new Error(`El monto del renglón ${i + 1} no es un número.`);
    const nota = String(fd.get(`nota_${i}`) ?? "").trim();
    out.push({ proyecto_id: String(fd.get(`proyecto_${i}`) ?? ""), categoria: String(fd.get(`categoria_${i}`) ?? ""), monto: Math.round(monto * 100) / 100, nota: nota || null });
  }
  return out;
}
```

En `package.json`, agregar al script `test`, después de `lib/finanzas/retenciones.test.ts`: ` lib/finanzas/capex.test.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/finanzas/capex.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/finanzas/capex.ts lib/finanzas/capex.test.ts package.json
git commit -m "feat(capex): semáforo, resúmenes, sugerencias y lectura de renglones"
```

---

### Task 7: Entrada de menú en Finanzas

**Files:**
- Modify: `lib/roles.ts` (bloque de áreas de Finanzas, junto a `area("Banca", …)`)
- Modify: `lib/roles.test.ts` (listas de rutas de admin y corporativo, líneas ~91–92; test "finanzas: admin y corporativo ven…", línea ~214)

**Interfaces:**
- Produces: área de menú `"CAPEX"` (sección `"Finanzas"`, icono `"grafica"`) con `{ href: "/finanzas/capex", texto: "CAPEX de aperturas" }`.

- [ ] **Step 1: Write the failing test**

En `lib/roles.test.ts`:
- En las listas esperadas de `admin` y `corporativo`, insertar `"/finanzas/capex",` entre `"/finanzas/catalogo",` y `"/finanzas/flujo",` (orden alfabético existente).
- En el test `"finanzas: admin y corporativo ven; solo admin edita; grupo Finanzas"`, agregar después de la línea de `"Nómina"`:

```ts
  assert.deepEqual(grupo("admin", "CAPEX"), ["/finanzas/capex"]);
```

y cambiar el `for` siguiente a:

```ts
  for (const a of ["P&L", "Banca", "Nómina", "CAPEX"]) assert.deepEqual(grupo("corporativo", a), grupo("admin", a));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/roles.test.ts`
Expected: FAIL (falta `/finanzas/capex` y el grupo `CAPEX` es `undefined`).

- [ ] **Step 3: Write minimal implementation**

En `lib/roles.ts`, después de la línea `...area("Banca", "banco", "Finanzas", finanzas ? [{ href: "/banca", texto: "Banca" }] : []),` agregar:

```ts
    ...area("CAPEX", "grafica", "Finanzas", finanzas ? [{ href: "/finanzas/capex", texto: "CAPEX de aperturas" }] : []),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/roles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/roles.ts lib/roles.test.ts
git commit -m "feat(capex): entrada CAPEX de aperturas en el menú de Finanzas"
```

---

### Task 8: Resumen `/finanzas/capex`

**Files:**
- Create: `app/finanzas/capex/datos.ts`
- Create: `app/finanzas/capex/TarjetaCapex.tsx`
- Create: `app/finanzas/capex/page.tsx`

**Interfaces:**
- Consumes: `resumir`, `TONO_SEMAFORO`, `TEXTO_SEMAFORO`, `nombreCategoriaCapex`, `type FilaCapex`, `type ResumenCapex` (Task 6); vistas `capex_resumen`, `capex_historico` (Tasks 3–4).
- Produces:
  - `type ProyectoCapex = {id: string; sucursal_id: string; sucursal: string; responsable: string; objetivo_desde: string; objetivo_hasta: string}`
  - `cargarResumenCapex(db: SupabaseClient): Promise<{proyectos: ProyectoCapex[]; filas: FilaCapex[]; historico: {sucursal_id: string; sucursal: string; categoria: string; monto: number}[]}>`
  - `filaCapex(x: Record<string, unknown>): FilaCapex` (normaliza numeric → number)
  - `<TarjetaCapex titulo: string href?: string detalle?: ReactNode r: ResumenCapex />`
  - `cargarProyectosCapex(db: SupabaseClient, id?: string): Promise<ProyectoCapex[]>`

- [ ] **Step 1: Write the data layer**

Crear `app/finanzas/capex/datos.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import type { FilaCapex } from "@/lib/finanzas/capex";

export type ProyectoCapex = { id: string; sucursal_id: string; sucursal: string; responsable: string; objetivo_desde: string; objetivo_hasta: string };
type ProyectoBd = Omit<ProyectoCapex, "sucursal"> & { sucursales: { nombre: string } | null };

const num = (v: unknown) => Number(v ?? 0);
const numONull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const filaCapex = (x: Record<string, unknown>): FilaCapex => ({
  proyecto_id: String(x.proyecto_id), categoria: String(x.categoria), presupuesto: numONull(x.presupuesto),
  comprometido: num(x.comprometido), facturado: num(x.facturado), pagado: num(x.pagado), pagado_con_iva: num(x.pagado_con_iva),
  por_pagar_con_iva: num(x.por_pagar_con_iva), por_ejercer: numONull(x.por_ejercer), desviacion: numONull(x.desviacion),
});
const proyecto = (p: ProyectoBd): ProyectoCapex => ({ id: p.id, sucursal_id: p.sucursal_id, sucursal: p.sucursales?.nombre ?? "Sucursal", responsable: p.responsable, objetivo_desde: p.objetivo_desde, objetivo_hasta: p.objetivo_hasta });

export async function cargarProyectosCapex(db: SupabaseClient, id?: string): Promise<ProyectoCapex[]> {
  let q = db.from("apertura_proyectos").select("id, sucursal_id, responsable, objetivo_desde, objetivo_hasta, sucursales(nombre)").order("objetivo_desde");
  if (id) q = q.eq("id", id);
  const { data, error } = await q.returns<ProyectoBd[]>();
  if (error) throw new Error(`No se pudieron cargar las aperturas: ${error.message}`);
  return (data ?? []).map(proyecto);
}

export async function cargarResumenCapex(db: SupabaseClient) {
  const [proyectos, filas, historico, sucursales] = await Promise.all([
    cargarProyectosCapex(db),
    leerTodo((d, h) => db.from("capex_resumen").select("*").order("proyecto_id").order("categoria").range(d, h).returns<Record<string, unknown>[]>()),
    leerTodo((d, h) => db.from("capex_historico").select("sucursal_id, categoria, monto").order("sucursal_id").order("categoria").range(d, h).returns<{ sucursal_id: string; categoria: string; monto: number }[]>()),
    db.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const nombre = new Map((sucursales.data ?? []).map((s) => [s.id, s.nombre]));
  return {
    proyectos,
    filas: filas.map(filaCapex),
    historico: historico.map((x) => ({ sucursal_id: x.sucursal_id, sucursal: nombre.get(x.sucursal_id) ?? "Sucursal", categoria: x.categoria, monto: Number(x.monto) })),
  };
}
```

- [ ] **Step 2: Write the card**

Crear `app/finanzas/capex/TarjetaCapex.tsx`:

```tsx
import Link from "next/link";
import { pesos } from "@/lib/formato";
import { TEXTO_SEMAFORO, TONO_SEMAFORO, type ResumenCapex } from "@/lib/finanzas/capex";

/** Tarjeta de una apertura o categoría: cifras, barra facturado · comprometido · disponible y semáforo. */
export function TarjetaCapex({ titulo, href, detalle, r }: { titulo: string; href?: string; detalle?: React.ReactNode; r: ResumenCapex }) {
  const base = Math.max(r.presupuesto ?? 0, r.ejercido, 0.01);
  const ancho = (n: number) => `${Math.max(0, (n / base) * 100)}%`;
  const disponible = Math.max(0, (r.presupuesto ?? 0) - r.ejercido);
  return (
    <article className="saldo" data-tono={r.semaforo === "rojo" ? undefined : r.semaforo === "ambar" ? "ambar" : r.semaforo === "verde" ? "cuadra" : undefined} data-alerta={r.semaforo === "rojo" ? "" : undefined}>
      <span>{href ? <Link href={href}>{titulo}</Link> : titulo}</span>
      <span className="insignia" data-tono={TONO_SEMAFORO[r.semaforo]}>{TEXTO_SEMAFORO[r.semaforo]}{r.porcentaje !== null && ` · ${(r.porcentaje * 100).toFixed(1)} %`}</span>
      <span className="saldo-monto">{pesos(r.ejercido)}</span>
      <small className="saldo-nota">Ejercido sin IVA{r.presupuesto !== null && ` de ${pesos(r.presupuesto)}`}</small>
      <div className="barra-apilada" aria-hidden="true">
        <div style={{ background: "var(--info)", width: ancho(r.facturado) }} />
        <div style={{ background: "var(--ambar)", width: ancho(r.comprometido) }} />
        <div style={{ background: "var(--cuadra)", width: ancho(disponible) }} />
      </div>
      <dl className="saldo-nota">
        <div><dt>Facturado</dt><dd>{pesos(r.facturado)}</dd></div>
        <div><dt>Comprometido</dt><dd>{pesos(r.comprometido)}</dd></div>
        {r.por_ejercer !== null && <div><dt>Por ejercer</dt><dd>{pesos(r.por_ejercer)}</dd></div>}
        <div><dt>Pagado con IVA</dt><dd>{pesos(r.pagado_con_iva)}</dd></div>
        <div><dt>Por pagar con IVA</dt><dd>{pesos(r.por_pagar_con_iva)}</dd></div>
      </dl>
      {detalle}
    </article>
  );
}
```

- [ ] **Step 3: Write the page**

Crear `app/finanzas/capex/page.tsx`:

```tsx
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { nombreCategoriaCapex, resumir, type Semaforo } from "@/lib/finanzas/capex";
import { cargarResumenCapex } from "./datos";
import { TarjetaCapex } from "./TarjetaCapex";

export const dynamic = "force-dynamic";
const FILTROS: { valor: Semaforo | ""; texto: string }[] = [{ valor: "", texto: "Todas" }, { valor: "rojo", texto: "Sobre presupuesto" }, { valor: "ambar", texto: "Cerca del límite" }, { valor: "verde", texto: "En presupuesto" }, { valor: "gris", texto: "Sin presupuesto" }];

export default async function PaginaCapex({ searchParams }: { searchParams: Promise<{ semaforo?: string }> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const d = await cargarResumenCapex(supabase);
  const total = resumir(d.filas);
  const tarjetas = d.proyectos.map((p) => ({ p, r: resumir(d.filas.filter((f) => f.proyecto_id === p.id)) }))
    .filter((t) => !q.semaforo || t.r.semaforo === q.semaforo);
  const historicas = [...new Set(d.historico.map((h) => h.sucursal_id))].map((s) => {
    const filas = d.historico.filter((h) => h.sucursal_id === s);
    return { sucursal: filas[0]!.sucursal, total: filas.reduce((a, h) => a + Math.round(h.monto * 100), 0) / 100, filas };
  });
  return (
    <>
      <EncabezadoPagina titulo="CAPEX de aperturas" descripcion="Presupuesto aprobado contra lo comprometido, facturado y pagado. Montos sin IVA salvo donde dice con IVA." />
      <section className="seccion rejilla" aria-label="Totales">
        <div className="saldo"><span>Presupuesto aprobado</span><span className="saldo-monto">{pesos(total.presupuesto ?? 0)}</span></div>
        <div className="saldo"><span>Ejercido</span><span className="saldo-monto">{pesos(total.ejercido)}</span><small className="saldo-nota">Comprometido + facturado</small></div>
        <div className="saldo"><span>Pagado con IVA</span><span className="saldo-monto">{pesos(total.pagado_con_iva)}</span></div>
        <div className="saldo"><span>Por pagar con IVA</span><span className="saldo-monto">{pesos(total.por_pagar_con_iva)}</span></div>
      </section>
      <form className="seccion" method="get"><label>Semáforo<select name="semaforo" defaultValue={q.semaforo ?? ""}>{FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}</select></label><button className="boton">Filtrar</button></form>
      <section className="seccion"><h2>Aperturas en curso · {tarjetas.length}</h2>
        {tarjetas.length === 0 ? <EstadoVacio titulo="Sin aperturas en este filtro" descripcion="Cambia el semáforo o registra una apertura en Aperturas." /> :
          <div className="rejilla">{tarjetas.map(({ p, r }) => <TarjetaCapex key={p.id} titulo={p.sucursal} href={`/finanzas/capex/${p.id}`} r={r}
            detalle={<small className="saldo-nota">{p.responsable} · {fechaTexto(p.objetivo_desde)} a {fechaTexto(p.objetivo_hasta)}</small>} />)}</div>}
      </section>
      {historicas.length > 0 && <section className="seccion"><h2>Inversión histórica · sin presupuesto</h2>
        <p>Importe de la fuente contable importada, sin desglose de IVA. Excluye gastos preoperativos y depósitos.</p>
        <div className="rejilla">{historicas.map((h) => <article key={h.sucursal} className="saldo"><span>{h.sucursal}</span><span className="saldo-monto">{pesos(h.total)}</span>
          <ul className="saldo-nota">{h.filas.map((f) => <li key={f.categoria}>{nombreCategoriaCapex(f.categoria)}: {pesos(f.monto)}</li>)}</ul></article>)}</div>
      </section>}
    </>
  );
}
```

- [ ] **Step 4: Verify types and render**

Run: `npm run typecheck`
Expected: sin errores.

Verificar en el navegador con la vista previa (`preview_start`): `/finanzas/capex` como admin carga sin errores en consola y muestra los cuatro totales; con datos vacíos aparece el estado vacío. Revisar a 375 px que no haya desplazamiento horizontal.

- [ ] **Step 5: Commit**

```bash
git add app/finanzas/capex/datos.ts app/finanzas/capex/TarjetaCapex.tsx app/finanzas/capex/page.tsx
git commit -m "feat(capex): resumen de CAPEX por apertura con semáforo e histórico"
```

---

### Task 9: Detalle `/finanzas/capex/[proyecto]` y aprobación de presupuesto

**Files:**
- Modify: `app/finanzas/capex/datos.ts`
- Create: `app/finanzas/capex/acciones.ts`
- Create: `app/finanzas/capex/[proyecto]/page.tsx`

**Interfaces:**
- Consumes: `cargarProyectosCapex`, `filaCapex`, `TarjetaCapex` (Task 8); `resumir`, `CATEGORIAS_CAPEX`, `nombreCategoriaCapex` (Task 6); `aprobar_capex_presupuesto` (Task 1).
- Produces:
  - `cargarDetalleCapex(db, id): Promise<{proyecto: ProyectoCapex; filas: FilaCapex[]; revisiones: Revision[]; documentos: DocumentoCapex[]; sinCategorizar: SinCategorizar[]}>`
  - `type DocumentoCapex = {id: string; tipo: "orden"|"factura"; documento_id: string; folio: string; proveedor: string; estado: string; categoria: string; monto: number; egreso: boolean}`
  - server action `aprobarPresupuesto(fd: FormData)` con campos `proyecto`, `revision`, `motivo`, `monto_<clave>`.

- [ ] **Step 1: Extend the data layer**

Agregar al final de `app/finanzas/capex/datos.ts`:

```ts
export type Revision = { revision: number; categoria: string; monto: number; motivo: string; aprobado_en: string; aprobador: string };
export type DocumentoCapex = { id: string; tipo: "orden" | "factura"; documento_id: string; folio: string; proveedor: string; estado: string; categoria: string; monto: number; egreso: boolean };
export type SinCategorizar = { id: string; nombre: string; tipo: "orden" | "factura"; documento_id: string };

type AsignacionBd = {
  id: string; categoria: string; monto: number; orden_id: string | null; factura_id: string | null;
  ordenes_compra: { folio: string; estado: string; proveedores: { razon_social: string } | null } | null;
  facturas: { serie: string | null; folio: string | null; estado: string; tipo: string; proveedores: { razon_social: string } | null } | null;
};

export async function cargarDetalleCapex(db: SupabaseClient, id: string) {
  const [proyecto] = await cargarProyectosCapex(db, id);
  if (!proyecto) return null;
  const [filas, revisiones, asignaciones, items, todas] = await Promise.all([
    db.from("capex_resumen").select("*").eq("proyecto_id", id).returns<Record<string, unknown>[]>(),
    db.from("capex_presupuestos").select("revision, categoria, monto, motivo, aprobado_en, perfiles(nombre)").eq("proyecto_id", id).order("revision", { ascending: false })
      .returns<{ revision: number; categoria: string; monto: number; motivo: string; aprobado_en: string; perfiles: { nombre: string } | null }[]>(),
    db.from("capex_asignaciones").select("id, categoria, monto, orden_id, factura_id, ordenes_compra(folio, estado, proveedores(razon_social)), facturas(serie, folio, estado, tipo, proveedores(razon_social))")
      .eq("proyecto_id", id).order("creado_en").returns<AsignacionBd[]>(),
    db.from("apertura_items").select("id, nombre, orden_id, factura_id").eq("proyecto_id", id).or("orden_id.not.is.null,factura_id.not.is.null")
      .returns<{ id: string; nombre: string; orden_id: string | null; factura_id: string | null }[]>(),
    db.from("capex_asignaciones").select("orden_id, factura_id").returns<{ orden_id: string | null; factura_id: string | null }[]>(),
  ]);
  for (const r of [filas, revisiones, asignaciones, items, todas]) if (r.error) throw new Error(`No se pudo cargar el CAPEX: ${r.error.message}`);
  const asignados = new Set((todas.data ?? []).flatMap((a) => [a.orden_id, a.factura_id]).filter(Boolean));
  return {
    proyecto,
    filas: (filas.data ?? []).map(filaCapex),
    revisiones: (revisiones.data ?? []).map((r) => ({ revision: r.revision, categoria: r.categoria, monto: Number(r.monto), motivo: r.motivo, aprobado_en: r.aprobado_en, aprobador: r.perfiles?.nombre ?? "Administración" })),
    documentos: (asignaciones.data ?? []).map((a): DocumentoCapex => a.orden_id
      ? { id: a.id, tipo: "orden", documento_id: a.orden_id, folio: a.ordenes_compra?.folio ?? "Orden", proveedor: a.ordenes_compra?.proveedores?.razon_social ?? "", estado: a.ordenes_compra?.estado ?? "", categoria: a.categoria, monto: Number(a.monto), egreso: false }
      : { id: a.id, tipo: "factura", documento_id: a.factura_id!, folio: [a.facturas?.serie, a.facturas?.folio].filter(Boolean).join("-") || "Factura", proveedor: a.facturas?.proveedores?.razon_social ?? "", estado: a.facturas?.estado ?? "", categoria: a.categoria, monto: Number(a.monto), egreso: a.facturas?.tipo === "egreso" }),
    sinCategorizar: (items.data ?? []).flatMap((i): SinCategorizar[] => [
      ...(i.orden_id && !asignados.has(i.orden_id) ? [{ id: `${i.id}-o`, nombre: i.nombre, tipo: "orden" as const, documento_id: i.orden_id }] : []),
      ...(i.factura_id && !asignados.has(i.factura_id) ? [{ id: `${i.id}-f`, nombre: i.nombre, tipo: "factura" as const, documento_id: i.factura_id }] : []),
    ]),
  };
}
```

- [ ] **Step 2: Write the action**

Crear `app/finanzas/capex/acciones.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas } from "@/lib/roles";
import { CATEGORIAS_CAPEX } from "@/lib/finanzas/capex";

const volver = (ruta: string, clave: "ok" | "error", texto: string) => redirect(`${ruta}?${clave}=${encodeURIComponent(texto)}`);

export async function aprobarPresupuesto(fd: FormData) {
  const proyecto = String(fd.get("proyecto") ?? "");
  const ruta = `/finanzas/capex/${proyecto}`;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver(ruta, "error", "Solo administración aprueba el presupuesto.");
  const montos: Record<string, number> = {};
  for (const c of CATEGORIAS_CAPEX) {
    const texto = String(fd.get(`monto_${c.clave}`) ?? "").replace(/[$,\s]/g, "");
    if (!texto) continue;
    const n = Number(texto);
    if (!Number.isFinite(n)) volver(ruta, "error", `El monto de ${c.nombre} no es un número.`);
    montos[c.clave] = Math.round(n * 100) / 100;
  }
  const { error } = await supabase.rpc("aprobar_capex_presupuesto", { p_proyecto: proyecto, p_revision_actual: Number(fd.get("revision") ?? 0), p_montos: montos, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) volver(ruta, "error", error.message);
  revalidatePath(ruta);
  revalidatePath("/finanzas/capex");
  volver(ruta, "ok", "Presupuesto aprobado.");
}
```

- [ ] **Step 3: Write the page**

Crear `app/finanzas/capex/[proyecto]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { pesos } from "@/lib/formato";
import { puedeEditarFinanzas } from "@/lib/roles";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { CATEGORIAS_CAPEX, nombreCategoriaCapex, resumir } from "@/lib/finanzas/capex";
import { cargarDetalleCapex } from "../datos";
import { TarjetaCapex } from "../TarjetaCapex";
import { aprobarPresupuesto } from "../acciones";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleCapex({ params, searchParams }: { params: Promise<{ proyecto: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ proyecto: id }, { ok, error }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { supabase, perfil } = await obtenerPerfil();
  const d = await cargarDetalleCapex(supabase, id);
  if (!d) notFound();
  const vigente = d.revisiones[0]?.revision ?? 0;
  const actual = new Map(d.revisiones.filter((r) => r.revision === vigente).map((r) => [r.categoria, r.monto]));
  const categorias = CATEGORIAS_CAPEX.filter((c) => d.filas.some((f) => f.categoria === c.clave && ((f.presupuesto ?? 0) > 0 || f.comprometido || f.facturado)));
  const revisiones = [...new Set(d.revisiones.map((r) => r.revision))];
  const ruta = (x: { tipo: "orden" | "factura"; documento_id: string }) => `/compras/${x.tipo === "orden" ? "ordenes" : "facturas"}/${x.documento_id}`;
  return (
    <>
      <EncabezadoPagina titulo={`CAPEX · ${d.proyecto.sucursal}`} descripcion={<><Link href="/finanzas/capex">← Todas las aperturas</Link> · Montos sin IVA salvo donde dice con IVA.</>} />
      <Aviso ok={ok} error={error} />
      <section className="seccion rejilla"><TarjetaCapex titulo="Total de la apertura" r={resumir(d.filas)} /></section>
      {d.sinCategorizar.length > 0 && <section className="seccion" aria-labelledby="t-sin"><h2 id="t-sin">Sin categorizar · {d.sinCategorizar.length}</h2>
        <p className="aviso aviso-error">Estos items de la apertura tienen orden o factura que todavía no está asignada como CAPEX; no cuentan en el reporte.</p>
        <ul>{d.sinCategorizar.map((s) => <li key={s.id}>{s.nombre} · <Link href={ruta(s)}>{s.tipo === "orden" ? "Ver orden" : "Ver factura"}</Link></li>)}</ul></section>}
      <section className="seccion"><h2>Por categoría</h2>
        <div className="rejilla">{categorias.map((c) => {
          const filas = d.filas.filter((f) => f.categoria === c.clave);
          const docs = d.documentos.filter((x) => x.categoria === c.clave);
          return <TarjetaCapex key={c.clave} titulo={c.nombre} r={resumir(filas)} detalle={<>
            {vigente > 0 && (actual.get(c.clave) ?? 0) === 0 && <small className="saldo-nota">Sin presupuesto en esta categoría</small>}
            <details><summary>Documentos ({docs.length})</summary><ul>{docs.map((x) => <li key={x.id}><Link href={ruta(x)}>{x.folio}</Link> · {x.proveedor} · {x.egreso ? "−" : ""}{pesos(x.monto)} · {x.estado}</li>)}</ul></details>
          </>} />;
        })}</div>
        {categorias.length === 0 && <p className="vacio">Todavía no hay presupuesto aprobado ni documentos asignados.</p>}
      </section>
      <section className="seccion" aria-labelledby="t-presupuesto"><h2 id="t-presupuesto">Presupuesto</h2>
        {vigente === 0 ? <p>Sin presupuesto aprobado.</p> : <p>Revisión vigente: {vigente}.</p>}
        {revisiones.map((rev) => { const filas = d.revisiones.filter((r) => r.revision === rev); const r0 = filas[0]!;
          const previa = new Map(d.revisiones.filter((r) => r.revision === rev - 1).map((r) => [r.categoria, r.monto]));
          return <details key={rev}><summary>Revisión {rev} · {pesos(filas.reduce((a, r) => a + r.monto, 0))} · {r0.aprobador} · {new Date(r0.aprobado_en).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</summary>
            <p>{r0.motivo}</p><ul>{filas.filter((r) => r.monto > 0 || (previa.get(r.categoria) ?? 0) > 0).map((r) => { const dif = rev > 1 ? r.monto - (previa.get(r.categoria) ?? 0) : 0;
              return <li key={r.categoria}>{nombreCategoriaCapex(r.categoria)}: {pesos(r.monto)}{dif !== 0 && ` (${dif > 0 ? "+" : "−"}${pesos(Math.abs(dif))})`}</li>; })}</ul></details>; })}
        {puedeEditarFinanzas(perfil.rol) && <form action={aprobarPresupuesto} className="formulario">
          <h3>{vigente === 0 ? "Aprobar presupuesto" : "Nueva revisión"}</h3>
          <input type="hidden" name="proyecto" value={id} /><input type="hidden" name="revision" value={vigente} />
          {CATEGORIAS_CAPEX.map((c) => <label key={c.clave}>{c.nombre} (sin IVA)<input name={`monto_${c.clave}`} inputMode="decimal" defaultValue={actual.get(c.clave) || ""} /></label>)}
          <label>Motivo<input name="motivo" required minLength={5} maxLength={2000} placeholder={vigente === 0 ? "Presupuesto inicial aprobado" : "Qué cambió y por qué"} /></label>
          <button className="boton">Aprobar</button>
        </form>}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Verify types and behavior**

Run: `npm run typecheck`
Expected: sin errores.

En la vista previa como admin, con una base local o de vista previa con la migración: abrir una apertura desde `/finanzas/capex`, aprobar un presupuesto con motivo y confirmar que aparece "Presupuesto aprobado.", la revisión 1 y las tarjetas por categoría. Enviar otra vez el mismo formulario desde una pestaña vieja y confirmar el aviso "El presupuesto cambió. Recarga antes de guardar.". Como corporativo, el formulario no aparece.

- [ ] **Step 5: Commit**

```bash
git add app/finanzas/capex/datos.ts app/finanzas/capex/acciones.ts "app/finanzas/capex/[proyecto]/page.tsx"
git commit -m "feat(capex): detalle por categoría, documentos, sin categorizar y presupuesto"
```

---

### Task 10: Captura CAPEX en órdenes y facturas de Compras

**Files:**
- Create: `app/finanzas/capex/BloqueCapex.tsx`
- Modify: `app/finanzas/capex/acciones.ts`
- Modify: `app/compras/facturas/[id]/page.tsx` (arreglo de `FichaPestanas`, antes de `{id:"adjuntos", …}` en la línea ~428)
- Modify: `app/compras/ordenes/[id]/page.tsx` (arreglo de `FichaPestanas`, antes de `{id:"adjuntos", …}` en la línea ~337)

**Interfaces:**
- Consumes: `sugerirAsignacion`, `leerRenglones`, `CATEGORIAS_CAPEX`, `nombreCategoriaCapex`, `type RenglonCapex` (Task 6); `guardar_capex_asignacion` (Task 2).
- Produces:
  - `<BloqueCapex tipo="orden"|"factura" id sucursalId subtotal cancelado uuidRelacionado? puedeEditar />` (server component async; no pinta nada si la sucursal no tiene apertura)
  - `capexVisible(db, sucursalId): Promise<boolean>`
  - server action `guardarCapexDocumento(fd: FormData)` con `tipo`, `documento`, `filas`, `motivo`, `proyecto_i`, `categoria_i`, `monto_i`, `nota_i`.

- [ ] **Step 1: Write the action**

Agregar a `app/finanzas/capex/acciones.ts`:

```ts
import { leerRenglones, type RenglonCapex } from "@/lib/finanzas/capex";

export async function guardarCapexDocumento(fd: FormData) {
  const tipo = fd.get("tipo") === "orden" ? "orden" : "factura";
  const documento = String(fd.get("documento") ?? "");
  const ruta = `/compras/${tipo === "orden" ? "ordenes" : "facturas"}/${documento}`;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver(ruta, "error", "Solo administración asigna CAPEX.");
  let renglones: RenglonCapex[] = [];
  try { renglones = leerRenglones(fd, Math.min(Number(fd.get("filas") ?? 0), 20)); }
  catch (e) { volver(ruta, "error", (e as Error).message); }
  const { error } = await supabase.rpc("guardar_capex_asignacion", { p_tipo: tipo, p_documento: documento, p_renglones: renglones, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) volver(ruta, "error", error.message);
  revalidatePath(ruta);
  revalidatePath("/finanzas/capex", "layout");
  volver(ruta, "ok", "CAPEX guardado.");
}
```

(Unir este `import` con los de la parte superior del archivo.)

- [ ] **Step 2: Write the block**

Crear `app/finanzas/capex/BloqueCapex.tsx`:

```tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import { pesos } from "@/lib/formato";
import { CATEGORIAS_CAPEX, nombreCategoriaCapex, sugerirAsignacion, type RenglonCapex } from "@/lib/finanzas/capex";
import { guardarCapexDocumento } from "./acciones";

type Props = { db: SupabaseClient; tipo: "orden" | "factura"; id: string; sucursalId: string | null; subtotal: number; cancelado: boolean; uuidRelacionado?: string | null; puedeEditar: boolean };

export async function capexVisible(db: SupabaseClient, sucursalId: string | null) {
  if (!sucursalId) return false;
  const { count } = await db.from("apertura_proyectos").select("id", { count: "exact", head: true }).eq("sucursal_id", sucursalId);
  return (count ?? 0) > 0;
}

/** Bloque "CAPEX de apertura" en el detalle de una orden o factura de Compras. */
export async function BloqueCapex({ db, tipo, id, sucursalId, subtotal, cancelado, uuidRelacionado, puedeEditar }: Props) {
  const campo = tipo === "orden" ? "orden_id" : "factura_id";
  const [{ data: proyectos }, { data: actuales }, { data: items }, { data: ordenes }, { data: relacionada }] = await Promise.all([
    db.from("apertura_proyectos").select("id, sucursales(nombre)").eq("sucursal_id", sucursalId ?? "").returns<{ id: string; sucursales: { nombre: string } | null }[]>(),
    db.from("capex_asignaciones").select("proyecto_id, categoria, monto, nota").eq(campo, id).returns<RenglonCapex[]>(),
    db.from("apertura_items").select("categoria").eq(campo, id).returns<{ categoria: string | null }[]>(),
    tipo === "factura" ? db.from("factura_ordenes").select("orden_id").eq("factura_id", id).returns<{ orden_id: string }[]>() : Promise.resolve({ data: [] as { orden_id: string }[] }),
    tipo === "factura" && uuidRelacionado ? db.from("facturas").select("id").eq("uuid", uuidRelacionado).returns<{ id: string }[]>() : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  const ids = (proyectos ?? []).map((p) => p.id);
  const fuente = (ordenes ?? []).length ? { col: "orden_id", ids: (ordenes ?? []).map((o) => o.orden_id) } : (relacionada ?? []).length ? { col: "factura_id", ids: (relacionada ?? []).map((f) => f.id) } : null;
  const base = fuente ? (await db.from("capex_asignaciones").select("proyecto_id, categoria, monto").in(fuente.col, fuente.ids).returns<RenglonCapex[]>()).data ?? [] : [];
  const renglones = (actuales ?? []).map((r) => ({ ...r, monto: Number(r.monto) }));
  const sugerido = renglones.length === 0;
  const filas = sugerido ? sugerirAsignacion({ subtotal, proyectos: ids, categoriasItems: (items ?? []).map((i) => i.categoria), base: base.map((b) => ({ ...b, monto: Number(b.monto) })) }) : renglones;
  const asignado = renglones.reduce((a, r) => a + Math.round(r.monto * 100), 0) / 100;
  const nombre = (p: string) => (proyectos ?? []).find((x) => x.id === p)?.sucursales?.nombre ?? "Apertura";
  const vacias = Math.max(2, 4 - filas.length);
  const total = filas.length + vacias;
  return (
    <section className="seccion" aria-labelledby="t-capex"><h2 id="t-capex">CAPEX de apertura</h2>
      <p>Asignado {pesos(asignado)} de {pesos(subtotal)} sin IVA · sin asignar {pesos(Math.max(0, subtotal - asignado))}. Lo que no se asigna no cuenta en el reporte de CAPEX.</p>
      {renglones.length > 0 && <ul>{renglones.map((r) => <li key={r.proyecto_id + r.categoria}>{nombre(r.proyecto_id)} · {nombreCategoriaCapex(r.categoria)} · {pesos(r.monto)}{r.nota && ` · ${r.nota}`}</li>)}</ul>}
      {cancelado && <p>Documento cancelado: no cuenta en el CAPEX.</p>}
      {puedeEditar && !cancelado && <form action={guardarCapexDocumento} className="formulario">
        {sugerido && filas.length > 0 && <p className="saldo-nota">Sugerencia sin guardar: revisa la categoría y el monto antes de guardar.</p>}
        <input type="hidden" name="tipo" value={tipo} /><input type="hidden" name="documento" value={id} /><input type="hidden" name="filas" value={total} />
        {Array.from({ length: total }, (_, i) => { const r = filas[i]; return <fieldset key={i}><legend>Renglón {i + 1}</legend>
          <label>Apertura<select name={`proyecto_${i}`} defaultValue={r?.proyecto_id ?? ids[0]}>{(proyectos ?? []).map((p) => <option key={p.id} value={p.id}>{p.sucursales?.nombre ?? "Apertura"}</option>)}</select></label>
          <label>Categoría<select name={`categoria_${i}`} defaultValue={r?.categoria ?? "otros"}>{CATEGORIAS_CAPEX.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</select></label>
          <label>Monto sin IVA<input name={`monto_${i}`} inputMode="decimal" defaultValue={r?.monto ?? ""} /></label>
          <label>Nota<input name={`nota_${i}`} maxLength={500} defaultValue={r?.nota ?? ""} /></label>
        </fieldset>; })}
        <label>Motivo del cambio<input name="motivo" required minLength={5} maxLength={2000} placeholder="Por qué se asigna así" /></label>
        <button className="boton">Guardar CAPEX</button>
        <small className="saldo-nota">Deja el monto vacío para quitar un renglón; todos vacíos quita la marca CAPEX.</small>
      </form>}
    </section>
  );
}
```

- [ ] **Step 3: Add the tab to factura and orden**

En `app/compras/facturas/[id]/page.tsx`:
- Imports: `import { BloqueCapex, capexVisible } from "@/app/finanzas/capex/BloqueCapex";` y `import { puedeEditarFinanzas, puedeVerFinanzas } from "@/lib/roles";` (si `@/lib/roles` ya se importa, agregar los nombres a ese import).
- Antes del `return (`:

```tsx
  const conCapex = puedeVerFinanzas(perfil.rol) && await capexVisible(supabase, f.sucursal_id);
```

- En el arreglo de `FichaPestanas`, antes de `{id:"adjuntos",…}`:

```tsx
        ...(conCapex ? [{id:"capex", titulo:"CAPEX de apertura", contenido:<BloqueCapex db={supabase} tipo="factura" id={f.id} sucursalId={f.sucursal_id} subtotal={Number(f.subtotal) - Number(f.descuento)} cancelado={f.estado === "cancelada"} uuidRelacionado={f.uuid_relacionado} puedeEditar={puedeEditarFinanzas(perfil.rol)} />}] : []),
```

En `app/compras/ordenes/[id]/page.tsx`:
- Los mismos imports.
- Antes del `return (`:

```tsx
  const conCapex = puedeVerFinanzas(perfil.rol) && await capexVisible(supabase, o.sucursal_id);
  const subtotalOrden = rs.reduce((a, r) => a + Math.round(Number(r.cantidad) * Number(r.precio) * 100), 0) / 100;
```

(`rs` es el arreglo de renglones que ya usa la pestaña "Artículos"; si en ese punto se llama distinto, usar el mismo arreglo que alimenta `Artículos (${rs.length})`.)

- En el arreglo de `FichaPestanas`, antes de `{id:"adjuntos",…}`:

```tsx
        ...(conCapex ? [{id:"capex", titulo:"CAPEX de apertura", contenido:<BloqueCapex db={supabase} tipo="orden" id={o.id} sucursalId={o.sucursal_id} subtotal={subtotalOrden} cancelado={o.estado === "cancelada"} puedeEditar={puedeEditarFinanzas(perfil.rol)} />}] : []),
```

- [ ] **Step 4: Verify types and behavior**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm test`
Expected: todo en verde (incluye `tests/capexAperturas.test.mjs` y `lib/finanzas/capex.test.ts`).

En la vista previa como admin, en una factura de una sucursal con apertura:
1. La pestaña "CAPEX de apertura" aparece con la sugerencia (subtotal completo, categoría según sus items).
2. Guardar con motivo → "CAPEX guardado." y el renglón listado.
3. Capturar un monto mayor al subtotal → aviso "Lo asignado pasa el subtotal del documento.".
4. Capturar "mil" como monto → aviso "El monto del renglón 1 no es un número.".
5. `/finanzas/capex/<proyecto>` muestra la factura en su categoría y el item deja de salir en "Sin categorizar".
6. En una factura de Oficina o de sucursal sin apertura, la pestaña no aparece. Como corporativo, se ve la lista y no el formulario.

- [ ] **Step 5: Commit**

```bash
git add app/finanzas/capex/BloqueCapex.tsx app/finanzas/capex/acciones.ts "app/compras/facturas/[id]/page.tsx" "app/compras/ordenes/[id]/page.tsx"
git commit -m "feat(capex): captura de asignación CAPEX en órdenes y facturas"
```

---

### Task 11: Revisión final y PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Run the full checks**

Run: `npm test` y `npm run typecheck`
Expected: ambos en verde.

- [ ] **Step 2: Review the full diff**

Run: `git diff origin/main...HEAD --stat` y luego `git diff origin/main...HEAD`
Expected: solo los archivos de la tabla "File Structure", la spec y este plan.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/capex-aperturas
```

Abrir PR a `main` en `HelperHolding/dodo-money` con `gh pr create`. El cuerpo explica: qué agrega, que la migración `20261109180000_capex_aperturas.sql` y su prueba `supabase/pruebas/20261109180000_capex_aperturas.sql` se entregan a Sebastián para correrlas en el proyecto Supabase de producción (resultado esperado `PRUEBAS OK — …`), y que no se integra antes de ese resultado. Termina con la línea de atribución de Claude Code.

- [ ] **Step 4: Wait for checks**

Confirmar que **Historial válido** y **Pruebas y tipos** están en verde antes de pedir integración.

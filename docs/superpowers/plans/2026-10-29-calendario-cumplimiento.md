# Calendario de cumplimiento — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el calendario de mantenimiento en un calendario de cumplimiento que une obligaciones nuevas (permisos, licencias, protección civil, extintores, trámites fiscales, seguros), compromisos con servicio y mantenimientos de activos, con evidencia, factura, alertas en el portal y avisos diarios de n8n por correo y Google Chat.

**Architecture:** La regla de cada obligación vive en `cumplimiento_obligaciones`; las fechas las calcula `fechas_cumplimiento` (única fuente) y solo se guarda una fila en `cumplimiento_fechas` cuando alguien actúa. `cumplimiento_en_rango(desde, hasta, hoy)` une los tres orígenes con un estado común; de ella salen el calendario, la franja de alertas y `avisos_cumplimiento`, que n8n consulta por un endpoint con `x-api-key` y confirma con otro, de modo que ningún aviso se repite por canal y día.

**Tech Stack:** Next.js 15 (App Router, server actions), Supabase/Postgres (RLS + funciones `security definer`), TypeScript, `node --test` con `--experimental-strip-types`, PGlite para pruebas SQL, n8n.

**Spec:** `docs/superpowers/specs/2026-10-29-calendario-cumplimiento-design.md`

## Global Constraints

- Rama `feat/calendario-cumplimiento` (worktree `.cumplimiento`) y PR a `main`; nunca commit ni push directo a `main`, sin commits vacíos, sin `--no-verify` (AGENTS.md). Antes de integrar: `Historial válido` y `Pruebas y tipos` en verde.
- Migración: `supabase/migrations/20261029150000_calendario_cumplimiento.sql`. Prueba: `supabase/pruebas/20261029150000_calendario_cumplimiento.sql`, termina con `raise exception 'PRUEBAS OK';`. Sebastián la ejecuta en Supabase; el formulario no se publica antes de su "PRUEBAS OK".
- Funciones SQL: `language plpgsql` (o `sql`) `set search_path=''`, todo con prefijo `public.`; escritura solo vía funciones `security definer` que llaman `public.exigir_admin_compras()`; lectura con RLS `public.ve_compras()`.
- Las funciones `ligar_*` no tienen `UPDATE`/`DELETE` sin `WHERE` (lo revisa `lib/dodois/migraciones.test.ts`).
- `lib/cumplimiento.ts` no importa **valores** de otros módulos (solo `import type`); las pruebas importan con extensión `./cumplimiento.ts`.
- Tipos exactos: `permiso`, `licencia`, `proteccion_civil`, `extintores`, `tramite_fiscal`, `seguro`, `otro`. Frecuencias exactas: `semanal`, `quincenal`, `mensual`, `bimestral`, `anual`. Orígenes: `obligacion`, `compromiso`, `mantenimiento`. Estados: `pendiente`, `por_vencer`, `vencida`, `cumplida`, `cumplida_sin_factura`, `omitida`. Tipos de aviso: `vencida`, `por_vencer`, `sin_factura`. Canales: `correo`, `chat`.
- Anticipación (días antes del vencimiento en que se avisa): semanal y quincenal `{2,0}`; mensual y bimestral `{7,2,0}`; anual `{60,30,7,0}`. Mantenimientos usan la de mensual. Vencidas y cumplidas sin factura: diario.
- Quincenal = día 15 y último día de cada mes. Mensual/bimestral/anual = día de la fecha de inicio; si el mes es más corto, su último día.
- Cierre de obligación: al menos una foto (`image/*`) y un PDF confirmados, nota ≥ 5 letras, fecha ≤ hoy.
- Pertenencia: exactamente una de `sucursal_id` o `razon_social_rfc` (las razones sociales tienen PK `rfc`; las facturas se ligan por `facturas.rfc_receptor`).
- Textos de UI en español de México; pantallas con tarjetas, nada de tablas anchas. Hoy: `hoyCalendarioMX()` en la app, `hoyMX()` en endpoints, `public.hoy_mx()` en SQL.
- Variables nuevas: `CUMPLIMIENTO_API_KEY` (Vercel y credencial de n8n). La cuenta `REPORTE_CUENTA_EMAIL` debe tener rol `admin`. Las ligas absolutas usan `APP_URL`.
- Cada prueba nueva de Node se agrega al script `test` de `package.json` (la lista es explícita).

## Review Focus

1. **Quincena en febrero y meses de 30 días** — una quincenal debe dar 15 y 28 (29 en bisiesto) en febrero y 15 y 30 en abril, nunca el 31 inexistente ni saltarse. (Prueba SQL en Task 1.)
2. **Seguro anual que inicia el 29 de febrero** — en años no bisiestos cae el 28 de febrero, no el 1 de marzo. (Prueba SQL en Task 1.)
3. **Aviso repetido por reintento de n8n** — si n8n reintenta el POST de entregados o el GET corre dos veces el mismo día, no se duplica el registro ni el aviso; y lo entregado por correo sigue pendiente por chat. (Prueba SQL en Task 3 y Node en Task 4.)
4. **Factura sustituida o cancelada** — un gasto sin CFDI ligado que se sustituye por su CFDI sigue ligado (al CFDI); una factura cancelada vuelve la fecha a *cumplida sin factura*. (Trigger y prueba SQL en Task 2; estado en Task 3.)
5. **Clave de aviso manipulada** — el POST con claves mal formadas, de otro tipo o con más de 500 elementos se rechaza completo sin registrar nada. (Prueba SQL en Task 3 y Node en Task 4.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261029150000_calendario_cumplimiento.sql` | Tablas, RLS, regla de fechas, alta/edición, acciones por fecha, evidencias, vista unificada, avisos |
| `supabase/pruebas/20261029150000_calendario_cumplimiento.sql` | Prueba SQL que corre Sebastián |
| `tests/calendarioCumplimiento.test.mjs` | Corre migración + prueba SQL en PGlite y casos que solo PGlite puede montar (storage) |
| `lib/cumplimiento.ts` (+ `.test.ts`) | Lógica pura: catálogos, textos, filtros, conteo de alertas, validación de formulario y de endpoints |
| `app/cumplimiento/datos.ts` | Lecturas compartidas |
| `app/cumplimiento/acciones.ts` | Server actions |
| `app/cumplimiento/CalendarioCumplimiento.tsx` | Calendario cliente (sustituye a `app/activos/CalendarioMantenimiento.tsx`) |
| `app/cumplimiento/FranjaAlertas.tsx` | Contadores de alertas (inicio y calendario) |
| `app/cumplimiento/FormObligacion.tsx` | Formulario cliente alta/edición |
| `app/cumplimiento/page.tsx`, `nueva/page.tsx`, `[id]/page.tsx`, `[id]/editar/page.tsx`, `[id]/TarjetaFecha.tsx` | Pantallas |
| `app/cumplimiento/evidencia/[id]/route.ts` | Descarga de evidencia |
| `app/api/cumplimiento/cuenta.ts`, `app/api/cumplimiento/avisos/route.ts`, `app/api/cumplimiento/avisos/entregados/route.ts` | Endpoints de n8n |
| `tests/cumplimientoCalendario.cjs` | Render del calendario y la franja (sustituye a `tests/activosCalendario.cjs`) |
| `docs/n8n/cumplimiento-avisos.json`, `docs/n8n/cumplimiento-avisos-error.json`, `docs/n8n-cumplimiento.md`, `tests/n8nCumplimiento.test.mjs` | Flujo de n8n, guía y su prueba |
| `docs/tecnica/calendario-cumplimiento.md` | Sustituye a `docs/tecnica/activos-calendario.md` |
| Modificados: `app/activos/page.tsx`, `lib/roles.ts`, `lib/roles.test.ts`, `lib/rutasPublicas.ts`, `lib/rutasPublicas.test.ts`, `app/(app)/page.tsx`, `app/corporativo/page.tsx`, `package.json`, `.env.example` | Integración |

---

### Task 1: Obligaciones, regla de fechas y alta/edición (SQL)

**Files:**
- Create: `supabase/migrations/20261029150000_calendario_cumplimiento.sql`
- Create: `supabase/pruebas/20261029150000_calendario_cumplimiento.sql`
- Create: `tests/calendarioCumplimiento.test.mjs`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: tablas `cumplimiento_obligaciones`, `cumplimiento_fechas`, `cumplimiento_historial`, `cumplimiento_avisos_enviados`; `public.fechas_cumplimiento(p_obligacion uuid, p_desde date, p_hasta date) returns setof date`; `public.dias_aviso_cumplimiento(p_frecuencia text) returns integer[]`; `public.guardar_obligacion(p_id uuid, p_revision integer, p_datos jsonb) returns uuid` con claves `tipo, nombre, descripcion, autoridad, folio, notas, sucursal_id, razon_social_rfc, frecuencia, inicio, fin, con_pago, proveedor_id, monto_estimado` (texto; `con_pago` `'true'|'false'`).

- [ ] **Step 1: Escribir la prueba de Node que carga PGlite (falla porque no existen los archivos)**

`tests/calendarioCumplimiento.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const compromisos=load('supabase/migrations/20261028180000_compromisos_recurrentes.sql');
const retenciones=load('supabase/migrations/20261029120000_compromisos_retenciones.sql');
const migracion=load('supabase/migrations/20261029150000_calendario_cumplimiento.sql');
const pruebas=load('supabase/pruebas/20261029150000_calendario_cumplimiento.sql');

// Lo mínimo de Supabase, Compras y Activos que usan las migraciones. Los checks copian los reales (0038, 0068).
export const BASE=`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table auth.users(id uuid primary key,email text);
 create table perfiles(id uuid primary key,activo boolean,rol text);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo'),('00000000-0000-0000-0000-0000000000a2',false,'admin');
 insert into auth.users values('00000000-0000-0000-0000-0000000000a1','julio@ejemplo.mx'),('00000000-0000-0000-0000-0000000000c1','halim@ejemplo.mx'),('00000000-0000-0000-0000-0000000000a2','baja@ejemplo.mx');
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create function exigir_admin_compras() returns void language plpgsql as $$begin if not public.edita_compras() then raise exception 'Solo administración.';end if;end$$;
 create function hoy_mx() returns date language sql stable as $$select current_date$$;
 create type forma_pago as enum('transferencia','efectivo','tarjeta','cheque');
 create table sucursales(id uuid primary key,nombre text);insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Zapopan-1');
 create table razones_sociales(rfc text primary key check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),razon_social text not null);
 insert into razones_sociales values('CMS230321FI8','COMERCIALIZADORA MASTER SITRU');
 create table proveedores(id uuid primary key);insert into proveedores values('00000000-0000-0000-0000-0000000000b1'),('00000000-0000-0000-0000-0000000000b2');
 create type estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create table facturas(id uuid primary key,tipo text,estado estado_factura,proveedor_id uuid,sucursal_id uuid,rfc_receptor text,sustituido_por uuid,saldo numeric,motivo_cancelacion text,
  check (estado <> 'cancelada' or coalesce(trim(motivo_cancelacion), '') <> ''));
 create table factura_recepciones(id uuid primary key,factura_id uuid,anulada_en timestamptz);
 insert into facturas values('00000000-0000-0000-0000-0000000000f1','ingreso','por_pagar','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','CMS230321FI8',null,45000),
  ('00000000-0000-0000-0000-0000000000f2','ingreso','por_pagar','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e1','CMS230321FI8',null,100),
  ('00000000-0000-0000-0000-0000000000f3','ingreso','por_pagar','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','CMS230321FI8',null,900);
 create view facturas_saldo as select id,tipo,estado,proveedor_id,sucursal_id,rfc_receptor,saldo from facturas;
 create table activos(id uuid primary key,nombre text not null,sucursal_id uuid);
 insert into activos values('00000000-0000-0000-0000-0000000000d1','Horno de cocina','00000000-0000-0000-0000-0000000000e1');
 create table activo_mantenimientos (
  id uuid primary key default gen_random_uuid(),activo_id uuid not null references activos(id),
  tipo text not null check(tipo in ('preventivo','correctivo')),tarea text not null check(length(trim(tarea)) between 5 and 1000),
  programado date not null,estado text not null default 'pendiente' check(estado in ('pendiente','completado','anulado')),
  realizado date,costo numeric(16,2) check(costo>=0 and costo<1e12),tecnico text,evidencia text,
  revision integer not null default 1,creado_en timestamptz not null default now(),
  check(estado<>'completado' or (realizado is not null and costo is not null and length(trim(coalesce(evidencia,'')))>=5)),
  check(estado<>'anulado' or length(trim(coalesce(evidencia,'')))>=5));
 create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`;

export async function montar(){
 const db=new PGlite();
 await db.exec(BASE);await db.exec(compromisos);await db.exec(retenciones);await db.exec(migracion);
 return db;
}

test('cumplimiento: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await montar();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('cumplimiento: la app solo lee las tablas',async()=>{
 const db=await montar();
 try{
  for(const t of ['cumplimiento_obligaciones','cumplimiento_fechas','cumplimiento_historial','cumplimiento_avisos_enviados'])
   for(const p of ['insert','update','delete'])
    assert.equal((await db.query(`select has_table_privilege('authenticated','${t}','${p}') ok`)).rows[0].ok,false,`${t} ${p}`);
 }finally{await db.close();}
});
```

Agregar `tests/calendarioCumplimiento.test.mjs` al final del script `test` de `package.json` (después de `tests/preciosRappi.test.mjs`).

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/calendarioCumplimiento.test.mjs`
Expected: FAIL con `ENOENT ... 20261029150000_calendario_cumplimiento.sql`.

- [ ] **Step 3: Escribir la prueba SQL (sección 1)**

`supabase/pruebas/20261029150000_calendario_cumplimiento.sql`:

```sql
-- Ejecutar completo después de 20261029150000_calendario_cumplimiento.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;corp uuid;f record;o uuid;o2 uuid;fechas date[];ok boolean;n integer;
begin
  select id into a from public.perfiles where activo and rol::text='admin' limit 1;
  select id into corp from public.perfiles where activo and rol::text='corporativo' limit 1;
  select x.id,x.proveedor_id,x.sucursal_id,x.rfc_receptor into f from public.facturas x where x.tipo='ingreso' and x.estado<>'cancelada'
    and x.sucursal_id is not null and x.rfc_receptor is not null and not exists(select 1 from public.compromiso_fechas cf where cf.factura_id=x.id) limit 1;
  if a is null or corp is null or f.id is null then raise exception 'FALTAN DATOS: admin, corporativo y una factura vigente con sucursal y RFC receptor.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 1. Semanal: el día de la semana del inicio.
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','extintores','nombre','Revisión de extintores','sucursal_id',f.sucursal_id,'frecuencia','semanal','inicio','2027-01-05','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2027-01-01','2027-01-31') d;
  if fechas is distinct from array['2027-01-05','2027-01-12','2027-01-19','2027-01-26']::date[] then raise exception 'FALLÓ: semanal %',fechas;end if;

  -- 2. Quincenal: 15 y último día; no antes del inicio; febrero normal y bisiesto; abril de 30.
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','tramite_fiscal','nombre','Pago provisional','razon_social_rfc',f.rfc_receptor,'frecuencia','quincenal','inicio','2027-01-20','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2027-01-01','2027-04-30') d;
  if fechas is distinct from array['2027-01-31','2027-02-15','2027-02-28','2027-03-15','2027-03-31','2027-04-15','2027-04-30']::date[] then raise exception 'FALLÓ: quincenal %',fechas;end if;
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2028-02-01','2028-02-29') d;
  if fechas is distinct from array['2028-02-15','2028-02-29']::date[] then raise exception 'FALLÓ: quincena bisiesta %',fechas;end if;

  -- 3. Mensual el 31 y bimestral.
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','permiso','nombre','Permiso de anuncio','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-31','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2027-01-01','2027-04-30') d;
  if fechas is distinct from array['2027-01-31','2027-02-28','2027-03-31','2027-04-30']::date[] then raise exception 'FALLÓ: mensual 31 %',fechas;end if;
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','proteccion_civil','nombre','Simulacro','sucursal_id',f.sucursal_id,'frecuencia','bimestral','inicio','2027-01-31','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2027-01-01','2027-06-30') d;
  if fechas is distinct from array['2027-01-31','2027-03-31','2027-05-31']::date[] then raise exception 'FALLÓ: bimestral %',fechas;end if;

  -- 4. Anual desde el 29 de febrero: 28 en años no bisiestos.
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','seguro','nombre','Póliza de daños','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2028-02-29','con_pago','true','proveedor_id',f.proveedor_id,'monto_estimado','18000'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2028-01-01','2030-12-31') d;
  if fechas is distinct from array['2028-02-29','2029-02-28','2030-02-28']::date[] then raise exception 'FALLÓ: anual bisiesto %',fechas;end if;

  -- 5. Fin: no hay fechas después.
  o2:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','licencia','nombre','Licencia de funcionamiento','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-31','fin','2027-03-15','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o2,'2027-01-01','2027-12-31') d;
  if fechas is distinct from array['2027-01-31','2027-02-28']::date[] then raise exception 'FALLÓ: fin %',fechas;end if;

  -- 6. Pertenencia: ambas o ninguna, rechazadas. Pago sin proveedor y "otro" sin descripción, rechazados.
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','permiso','nombre','Doble','sucursal_id',f.sucursal_id,'razon_social_rfc',f.rfc_receptor,'frecuencia','anual','inicio','2027-01-01','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: sucursal y razón social a la vez';end if;
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','permiso','nombre','Ninguna','frecuencia','anual','inicio','2027-01-01','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: sin pertenencia';end if;
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','seguro','nombre','Sin proveedor','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2027-01-01','con_pago','true'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: pago sin proveedor';end if;
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','otro','nombre','Algo','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2027-01-01','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: otro sin descripción';end if;

  -- 7. Editar: el nombre cambia y sube la revisión; revisión vieja y cambio de frecuencia, rechazados.
  perform public.guardar_obligacion(o2,1,jsonb_build_object('tipo','licencia','nombre','Licencia municipal','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-31','fin','2027-03-15','con_pago','false'));
  if (select nombre||revision from public.cumplimiento_obligaciones where id=o2)<>'Licencia municipal2' then raise exception 'FALLÓ: edición';end if;
  begin perform public.guardar_obligacion(o2,1,jsonb_build_object('tipo','licencia','nombre','Otra','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-31','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: revisión vieja aceptada';end if;
  begin perform public.guardar_obligacion(o2,2,jsonb_build_object('tipo','licencia','nombre','Licencia municipal','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2027-01-31','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cambio de frecuencia aceptado';end if;
  select count(*) into n from public.cumplimiento_historial where obligacion_id=o2;
  if n<>2 then raise exception 'FALLÓ: historial %',n;end if;

  -- 8. Corporativo no da de alta.
  perform set_config('request.jwt.claims',json_build_object('sub',corp,'role','authenticated')::text,true);
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','permiso','nombre','Corporativo','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2027-01-01','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: corporativo editó';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 9. Anticipación por frecuencia.
  if public.dias_aviso_cumplimiento('anual') is distinct from array[60,30,7,0] or public.dias_aviso_cumplimiento('quincenal') is distinct from array[2,0]
   or public.dias_aviso_cumplimiento('bimestral') is distinct from array[7,2,0] then raise exception 'FALLÓ: anticipación';end if;

  raise exception 'PRUEBAS OK';
end $$;
```

- [ ] **Step 4: Escribir la migración (sección 1)**

`supabase/migrations/20261029150000_calendario_cumplimiento.sql`:

```sql
-- Calendario de cumplimiento: obligaciones (permisos, licencias, protección civil, extintores, trámites fiscales, seguros)
-- por sucursal o razón social, con evidencia (foto + PDF) y factura si llevan pago. Las fechas futuras se calculan de la
-- regla (fechas_cumplimiento); solo se guarda una fecha cuando alguien actúa sobre ella. cumplimiento_en_rango une
-- obligaciones, compromisos con servicio y mantenimientos; avisos_cumplimiento es lo que n8n entrega cada mañana.
begin;
create table public.cumplimiento_obligaciones (
 id uuid primary key default gen_random_uuid(),
 tipo text not null check(tipo in ('permiso','licencia','proteccion_civil','extintores','tramite_fiscal','seguro','otro')),
 nombre text not null check(length(trim(nombre)) between 3 and 150),
 descripcion text check(length(descripcion)<=300),
 autoridad text check(length(autoridad)<=150),
 folio text check(length(folio)<=100),
 notas text check(length(notas)<=1000),
 sucursal_id uuid references public.sucursales(id),
 razon_social_rfc text references public.razones_sociales(rfc),
 frecuencia text not null check(frecuencia in ('semanal','quincenal','mensual','bimestral','anual')),
 inicio date not null, fin date,
 con_pago boolean not null default false,
 proveedor_id uuid references public.proveedores(id),
 monto_estimado numeric(16,2) check(monto_estimado>0 and monto_estimado<1e12),
 revision integer not null default 1,
 creado_por uuid not null default auth.uid() references public.perfiles(id),
 creado_en timestamptz not null default now(),
 check((sucursal_id is null)<>(razon_social_rfc is null)),
 check(fin is null or fin>=inicio),
 check(not con_pago or proveedor_id is not null),
 check(con_pago or (proveedor_id is null and monto_estimado is null)),
 check(tipo<>'otro' or length(trim(coalesce(descripcion,'')))>=3)
);
create index cumplimiento_obligaciones_sucursal on public.cumplimiento_obligaciones(sucursal_id);
create table public.cumplimiento_fechas (
 id uuid primary key default gen_random_uuid(),
 obligacion_id uuid not null references public.cumplimiento_obligaciones(id),
 vence date not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','cumplida','omitida')),
 cumplida_fecha date,
 nota text check(nota is null or length(trim(nota)) between 5 and 2000),
 omitida_motivo text check(omitida_motivo is null or length(trim(omitida_motivo)) between 5 and 1000),
 factura_id uuid unique references public.facturas(id),
 revision integer not null default 0,
 unique(obligacion_id,vence),
 check(estado<>'cumplida' or (cumplida_fecha is not null and nota is not null)),
 check((estado='omitida')=(omitida_motivo is not null)),
 check(estado<>'omitida' or factura_id is null)
);
create table public.cumplimiento_historial (
 id bigint generated always as identity primary key,
 obligacion_id uuid not null references public.cumplimiento_obligaciones(id),
 evento text not null, anterior jsonb not null, nuevo jsonb not null,
 usuario_id uuid not null references public.perfiles(id), fecha timestamptz not null default now()
);
create index cumplimiento_historial_obligacion on public.cumplimiento_historial(obligacion_id,fecha);
-- Un renglón por aviso entregado y canal: n8n puede reintentar sin duplicar.
create table public.cumplimiento_avisos_enviados (
 id bigint generated always as identity primary key,
 clave text not null, canal text not null check(canal in ('correo','chat')),
 origen text not null check(origen in ('obligacion','compromiso','mantenimiento')),
 referencia_id uuid not null, vence date not null,
 tipo_aviso text not null check(tipo_aviso in ('vencida','por_vencer','sin_factura')),
 enviado_el date not null, usuario_id uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 unique(clave,canal)
);
alter table public.cumplimiento_obligaciones enable row level security;
alter table public.cumplimiento_fechas enable row level security;
alter table public.cumplimiento_historial enable row level security;
alter table public.cumplimiento_avisos_enviados enable row level security;
create policy ver_cumplimiento_obligaciones on public.cumplimiento_obligaciones for select using(public.ve_compras());
create policy ver_cumplimiento_fechas on public.cumplimiento_fechas for select using(public.ve_compras());
create policy ver_cumplimiento_historial on public.cumplimiento_historial for select using(public.ve_compras());
create policy ver_cumplimiento_avisos on public.cumplimiento_avisos_enviados for select using(public.ve_compras());
revoke all on public.cumplimiento_obligaciones,public.cumplimiento_fechas,public.cumplimiento_historial,public.cumplimiento_avisos_enviados from public,anon,authenticated;
grant select on public.cumplimiento_obligaciones,public.cumplimiento_fechas,public.cumplimiento_historial,public.cumplimiento_avisos_enviados to authenticated;

-- Única fuente de la regla. Semanal: cada 7 días desde el inicio. Quincenal: día 15 y último día de cada mes.
-- Mensual, bimestral y anual: el día del inicio cada 1, 2 o 12 meses (si el mes es más corto, su último día).
create function public.fechas_cumplimiento(p_obligacion uuid,p_desde date,p_hasta date) returns setof date
language sql stable set search_path='' as $$
 with o as (select * from public.cumplimiento_obligaciones where id=p_obligacion),
 meses as (
  select o.frecuencia,o.inicio,k,(date_trunc('month',o.inicio::timestamp)+make_interval(months=>k))::date m from o
  cross join lateral generate_series(0,greatest(0,((extract(year from p_hasta)-extract(year from o.inicio))*12+extract(month from p_hasta)-extract(month from o.inicio))::int)) k
  where o.frecuencia<>'semanal'),
 fechas as (
  select o.inicio+7*k d from o cross join lateral generate_series(0,greatest(0,(p_hasta-o.inicio)/7)) k where o.frecuencia='semanal'
  union all select m+14 from meses where frecuencia='quincenal'
  union all select (m+interval '1 month - 1 day')::date from meses where frecuencia='quincenal'
  union all select m+(least(extract(day from inicio)::int,extract(day from m+interval '1 month - 1 day')::int)-1) from meses
   where frecuencia in ('mensual','bimestral','anual') and k%(case frecuencia when 'mensual' then 1 when 'bimestral' then 2 else 12 end)=0)
 select f.d from fechas f cross join o where f.d>=o.inicio and (o.fin is null or f.d<=o.fin) and f.d between p_desde and p_hasta order by f.d
$$;

-- Días antes del vencimiento en que se avisa (0 = el mismo día).
create function public.dias_aviso_cumplimiento(p_frecuencia text) returns integer[]
language sql immutable set search_path='' as $$
 select case when p_frecuencia in ('semanal','quincenal') then array[2,0] when p_frecuencia='anual' then array[60,30,7,0] else array[7,2,0] end
$$;

create function public.guardar_obligacion(p_id uuid,p_revision integer,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.cumplimiento_obligaciones;n public.cumplimiento_obligaciones;v_fin date;v_pago boolean;
begin
 perform public.exigir_admin_compras();
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('tipo','nombre','descripcion','autoridad','folio','notas','sucursal_id','razon_social_rfc','frecuencia','inicio','fin','con_pago','proveedor_id','monto_estimado')) then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>1000) then raise exception 'Texto demasiado largo.';end if;
 v_fin:=nullif(p_datos->>'fin','')::date;
 v_pago:=coalesce((p_datos->>'con_pago')::boolean,false);
 if p_id is null then
  insert into public.cumplimiento_obligaciones(tipo,nombre,descripcion,autoridad,folio,notas,sucursal_id,razon_social_rfc,frecuencia,inicio,fin,con_pago,proveedor_id,monto_estimado)
  values(p_datos->>'tipo',trim(p_datos->>'nombre'),nullif(trim(p_datos->>'descripcion'),''),nullif(trim(p_datos->>'autoridad'),''),nullif(trim(p_datos->>'folio'),''),nullif(trim(p_datos->>'notas'),''),
   nullif(p_datos->>'sucursal_id','')::uuid,nullif(p_datos->>'razon_social_rfc',''),p_datos->>'frecuencia',(p_datos->>'inicio')::date,v_fin,v_pago,
   case when v_pago then nullif(p_datos->>'proveedor_id','')::uuid end,case when v_pago then nullif(p_datos->>'monto_estimado','')::numeric end) returning * into n;
 else
  select * into a from public.cumplimiento_obligaciones where id=p_id for update;
  if not found then raise exception 'Obligación inexistente.';end if;
  if a.revision is distinct from p_revision then raise exception 'La obligación cambió. Recarga antes de guardar.';end if;
  if p_datos->>'tipo' is distinct from a.tipo or nullif(p_datos->>'sucursal_id','')::uuid is distinct from a.sucursal_id
   or nullif(p_datos->>'razon_social_rfc','') is distinct from a.razon_social_rfc or p_datos->>'frecuencia' is distinct from a.frecuencia
   or (p_datos->>'inicio')::date is distinct from a.inicio then
   raise exception 'Tipo, sucursal o razón social, frecuencia e inicio no cambian. Ponle fin a esta obligación y crea otra.';
  end if;
  if v_fin is not null and exists(select 1 from public.cumplimiento_fechas where obligacion_id=p_id and vence>v_fin and (estado<>'pendiente' or factura_id is not null)) then
   raise exception 'Hay fechas cumplidas, omitidas o con factura después del fin.';end if;
  if not v_pago and exists(select 1 from public.cumplimiento_fechas where obligacion_id=p_id and factura_id is not null) then
   raise exception 'Hay facturas ligadas. Quítalas antes de marcarla sin pago.';end if;
  update public.cumplimiento_obligaciones set nombre=trim(p_datos->>'nombre'),descripcion=nullif(trim(p_datos->>'descripcion'),''),autoridad=nullif(trim(p_datos->>'autoridad'),''),
   folio=nullif(trim(p_datos->>'folio'),''),notas=nullif(trim(p_datos->>'notas'),''),fin=v_fin,con_pago=v_pago,
   proveedor_id=case when v_pago then nullif(p_datos->>'proveedor_id','')::uuid end,monto_estimado=case when v_pago then nullif(p_datos->>'monto_estimado','')::numeric end,
   revision=revision+1 where id=p_id returning * into n;
 end if;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(n.id,case when p_id is null then 'Alta' else 'Actualización' end,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
 return n.id;
end $$;

revoke all on function public.fechas_cumplimiento(uuid,date,date),public.dias_aviso_cumplimiento(text),public.guardar_obligacion(uuid,integer,jsonb) from public,anon;
grant execute on function public.fechas_cumplimiento(uuid,date,date),public.dias_aviso_cumplimiento(text),public.guardar_obligacion(uuid,integer,jsonb) to authenticated;
commit;
```

- [ ] **Step 5: Correr las pruebas**

Run: `node --test tests/calendarioCumplimiento.test.mjs lib/dodois/migraciones.test.ts`
Expected: PASS (2 pruebas de cumplimiento + las de migraciones). Si una sección falla, el mensaje dice `FALLÓ: …` con las fechas obtenidas.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261029150000_calendario_cumplimiento.sql supabase/pruebas/20261029150000_calendario_cumplimiento.sql tests/calendarioCumplimiento.test.mjs package.json
git commit -m "feat(cumplimiento): obligaciones con regla de fechas y alta/edición"
```

---

### Task 2: Acciones por fecha, evidencias y factura (SQL)

**Files:**
- Modify: `supabase/migrations/20261029150000_calendario_cumplimiento.sql` (antes del `commit;` final)
- Modify: `supabase/pruebas/20261029150000_calendario_cumplimiento.sql` (antes de `raise exception 'PRUEBAS OK';`)
- Modify: `tests/calendarioCumplimiento.test.mjs`

**Interfaces:**
- Consumes: `fechas_cumplimiento`, tablas de Task 1.
- Produces: `public.cerrar_fecha_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_fecha date,p_nota text) returns void`; `public.omitir_fecha_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_motivo text) returns void` (motivo vacío quita la omisión); `public.ligar_factura_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_factura uuid) returns void` (null quita); `public.preparar_evidencia_cumplimiento(p_id uuid,p_obligacion uuid,p_vence date,p_nombre text,p_extension text,p_mime text,p_bytes integer,p_sha256 text) returns jsonb` (`{ruta, disponible}`); `public.confirmar_evidencia_cumplimiento(p_id uuid) returns void`; tabla `cumplimiento_evidencias(id, fecha_id, clase 'foto'|'documento', nombre, ruta, mime, bytes, sha256, usuario_id, creado_en, confirmado_en)`. Cada acción sube `revision` de la fecha en 1.

- [ ] **Step 1: Agregar las pruebas SQL (fallan: las funciones no existen)**

Agregar en `declare` de la prueba: `p uuid;ef uuid;ed uuid;r record;`. Insertar antes de `raise exception 'PRUEBAS OK';`:

```sql
  -- 10. Obligación con pago, mensual desde el 10 de enero de 2027.
  p:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','seguro','nombre','Póliza de responsabilidad','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-10','con_pago','true','proveedor_id',f.proveedor_id));
  -- Cerrar sin evidencia: rechazado. Fecha que no sale de la regla: rechazada.
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,'2027-01-10','Póliza renovada');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cierre sin evidencia';end if;
  begin perform public.omitir_fecha_cumplimiento(p,'2027-01-11',0,'No corresponde');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: fecha fuera de la regla';end if;

  -- 11. Evidencias: foto y PDF reservados; solo cuentan confirmadas. Solo la foto no basta.
  ef:=gen_random_uuid();ed:=gen_random_uuid();
  perform public.preparar_evidencia_cumplimiento(ef,p,'2027-01-10','poliza.jpg','jpg','image/jpeg',1000,repeat('a',64));
  perform public.preparar_evidencia_cumplimiento(ed,p,'2027-01-10','poliza.pdf','pdf','application/pdf',2000,repeat('b',64));
  if (select clase from public.cumplimiento_evidencias where id=ef)<>'foto' or (select clase from public.cumplimiento_evidencias where id=ed)<>'documento' then raise exception 'FALLÓ: clase de evidencia';end if;
  begin perform public.preparar_evidencia_cumplimiento(gen_random_uuid(),p,'2027-01-10','x.exe','exe','application/octet-stream',10,repeat('c',64));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: evidencia no permitida';end if;
  update public.cumplimiento_evidencias set confirmado_en=now() where id=ef;
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,'2027-01-10','Póliza renovada');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cierre solo con foto';end if;
  update public.cumplimiento_evidencias set confirmado_en=now() where id=ed;

  -- 12. Fecha futura y nota corta: rechazadas. Cierre correcto: cumplida, revisión 1.
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,public.hoy_mx()+1,'Póliza renovada');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cierre con fecha futura';end if;
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,'2026-01-10','ok');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: nota corta';end if;
  perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,'2026-01-10','Póliza renovada con folio 123');
  select * into r from public.cumplimiento_fechas where obligacion_id=p and vence='2027-01-10';
  if r.estado<>'cumplida' or r.revision<>1 or r.cumplida_fecha<>'2026-01-10' then raise exception 'FALLÓ: cierre %',to_jsonb(r);end if;
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',1,'2026-01-10','Otra vez cerrada');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cierre doble';end if;

  -- 13. Factura: del proveedor y sucursal, revisión al día. Revisión vieja y factura repetida, rechazadas.
  begin perform public.ligar_factura_cumplimiento(p,'2027-01-10',0,f.id);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: revisión vieja al ligar';end if;
  perform public.ligar_factura_cumplimiento(p,'2027-01-10',1,f.id);
  if (select factura_id from public.cumplimiento_fechas where obligacion_id=p and vence='2027-01-10') is distinct from f.id then raise exception 'FALLÓ: ligar factura';end if;
  begin perform public.ligar_factura_cumplimiento(p,'2027-02-10',0,f.id);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: factura repetida';end if;
  -- Obligación sin pago (extintores) no acepta factura.
  select id into o from public.cumplimiento_obligaciones where nombre='Revisión de extintores' limit 1;
  begin perform public.ligar_factura_cumplimiento(o,'2027-01-05',0,f.id);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: factura en obligación sin pago';end if;

  -- 14. Omitir: no con factura ni cumplida; sí una fecha pendiente; motivo vacío la regresa a pendiente.
  begin perform public.omitir_fecha_cumplimiento(p,'2027-01-10',2,'Ya no aplica');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: omitir cumplida con factura';end if;
  perform public.omitir_fecha_cumplimiento(p,'2027-02-10',0,'Sucursal cerrada por remodelación');
  if (select estado from public.cumplimiento_fechas where obligacion_id=p and vence='2027-02-10')<>'omitida' then raise exception 'FALLÓ: omitir';end if;
  perform public.omitir_fecha_cumplimiento(p,'2027-02-10',1,'');
  if (select estado from public.cumplimiento_fechas where obligacion_id=p and vence='2027-02-10')<>'pendiente' then raise exception 'FALLÓ: quitar omisión';end if;
  -- Marzo queda omitida: es la fecha trabajada que impide poner fin antes.
  perform public.omitir_fecha_cumplimiento(p,'2027-03-10',0,'Cierre temporal de la sucursal');

  -- 15. Fin antes de una fecha trabajada (marzo omitida): rechazado. Sin pago con factura ligada: rechazado.
  begin perform public.guardar_obligacion(p,1,jsonb_build_object('tipo','seguro','nombre','Póliza de responsabilidad','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-10','fin','2027-02-15','con_pago','true','proveedor_id',f.proveedor_id));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: fin antes de fecha trabajada';end if;
  begin perform public.guardar_obligacion(p,1,jsonb_build_object('tipo','seguro','nombre','Póliza de responsabilidad','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-10','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: sin pago con factura ligada';end if;
```

Agregar al final de `tests/calendarioCumplimiento.test.mjs` (casos que necesitan `storage.objects` y la sustitución de facturas):

```js
const ADMIN=`select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false)`;

test('cumplimiento: la evidencia se confirma solo si el archivo existe con el mismo tamaño y tipo',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  const {rows:[{id:o}]}=await db.query(`select public.guardar_obligacion(null,0,'{"tipo":"permiso","nombre":"Uso de suelo","sucursal_id":"00000000-0000-0000-0000-0000000000e1","frecuencia":"anual","inicio":"2027-01-10","con_pago":"false"}'::jsonb) id`);
  const ev='00000000-0000-0000-0000-00000000ee01';
  const {rows:[{r}]}=await db.query(`select public.preparar_evidencia_cumplimiento('${ev}','${o}','2027-01-10','uso.pdf','pdf','application/pdf',2000,repeat('b',64)) r`);
  assert.equal(r.disponible,false);assert.match(r.ruta,/^cumplimiento\/[0-9a-f-]{36}\/0{8}-0{4}-0{4}-0{4}-00000000ee01\.pdf$/);
  await assert.rejects(db.exec(`select public.confirmar_evidencia_cumplimiento('${ev}')`),/no está subido/);
  await db.query(`insert into storage.objects values('adjuntos-compras',$1,'{"size":"2000","mimetype":"application/pdf"}')`,[r.ruta]);
  await db.exec(`select public.confirmar_evidencia_cumplimiento('${ev}')`);
  assert.ok((await db.query(`select confirmado_en from cumplimiento_evidencias where id='${ev}'`)).rows[0].confirmado_en);
 }finally{await db.close();}
});

test('cumplimiento: al sustituir un gasto sin CFDI por su CFDI la liga pasa al CFDI',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  const {rows:[{id:o}]}=await db.query(`select public.guardar_obligacion(null,0,'{"tipo":"seguro","nombre":"Póliza","sucursal_id":"00000000-0000-0000-0000-0000000000e1","frecuencia":"anual","inicio":"2027-01-10","con_pago":"true","proveedor_id":"00000000-0000-0000-0000-0000000000b1"}'::jsonb) id`);
  await db.exec(`select public.ligar_factura_cumplimiento('${o}','2027-01-10',0,'00000000-0000-0000-0000-0000000000f1')`);
  await db.exec(`update facturas set sustituido_por='00000000-0000-0000-0000-0000000000f3' where id='00000000-0000-0000-0000-0000000000f1'`);
  assert.equal((await db.query(`select factura_id from cumplimiento_fechas where obligacion_id='${o}'`)).rows[0].factura_id,'00000000-0000-0000-0000-0000000000f3');
 }finally{await db.close();}
});

test('cumplimiento: la factura de una obligación de razón social debe ser de ese RFC receptor',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  await db.exec(`update facturas set rfc_receptor=null where id='00000000-0000-0000-0000-0000000000f3'`);
  const {rows:[{id:o}]}=await db.query(`select public.guardar_obligacion(null,0,'{"tipo":"tramite_fiscal","nombre":"Declaración anual","razon_social_rfc":"CMS230321FI8","frecuencia":"anual","inicio":"2027-03-31","con_pago":"true","proveedor_id":"00000000-0000-0000-0000-0000000000b1"}'::jsonb) id`);
  await assert.rejects(db.exec(`select public.ligar_factura_cumplimiento('${o}','2027-03-31',0,'00000000-0000-0000-0000-0000000000f3')`),/razón social/);
  await db.exec(`select public.ligar_factura_cumplimiento('${o}','2027-03-31',0,'00000000-0000-0000-0000-0000000000f1')`);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/calendarioCumplimiento.test.mjs`
Expected: FAIL con `function public.cerrar_fecha_cumplimiento(...) does not exist` (o `preparar_evidencia_cumplimiento`).

- [ ] **Step 3: Agregar a la migración (antes de `commit;`)**

```sql
-- Fila de una fecha (la crea si aún no existe), bloqueada. Rechaza fechas que no salen de la regla.
create function public.fila_fecha_cumplimiento(p_obligacion uuid,p_vence date) returns public.cumplimiento_fechas
language plpgsql security definer set search_path='' as $$
declare r public.cumplimiento_fechas;
begin
 if not exists(select 1 from public.fechas_cumplimiento(p_obligacion,p_vence,p_vence)) then raise exception 'Esa fecha no corresponde a la obligación.';end if;
 insert into public.cumplimiento_fechas(obligacion_id,vence) values(p_obligacion,p_vence) on conflict(obligacion_id,vence) do nothing;
 select * into r from public.cumplimiento_fechas where obligacion_id=p_obligacion and vence=p_vence for update;
 return r;
end $$;

-- Evidencia (foto o PDF): mismo patrón preparar → subir → confirmar que compromiso_evidencias.
create table public.cumplimiento_evidencias (
 id uuid primary key, fecha_id uuid not null references public.cumplimiento_fechas(id),
 clase text not null check(clase in ('foto','documento')),
 nombre text not null check(length(nombre) between 1 and 200), ruta text not null unique,
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes between 1 and 4194304), sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 usuario_id uuid not null references public.perfiles(id), creado_en timestamptz not null default now(), confirmado_en timestamptz,
 check((clase='documento')=(mime='application/pdf'))
);
create index cumplimiento_evidencias_fecha on public.cumplimiento_evidencias(fecha_id,creado_en);
alter table public.cumplimiento_evidencias enable row level security;
revoke all on public.cumplimiento_evidencias from public,anon,authenticated;
grant select on public.cumplimiento_evidencias to authenticated;
create policy ver_cumplimiento_evidencias on public.cumplimiento_evidencias for select to authenticated using(public.ve_compras() and (confirmado_en is not null or usuario_id=auth.uid() and public.edita_compras()));
create policy cumplimiento_evidencias_lectura on storage.objects for select to authenticated using(bucket_id='adjuntos-compras' and public.ve_compras() and exists(select 1 from public.cumplimiento_evidencias e where e.ruta=name));
create policy cumplimiento_evidencias_subir on storage.objects for insert to authenticated with check(bucket_id='adjuntos-compras' and public.edita_compras() and exists(select 1 from public.cumplimiento_evidencias e where e.ruta=name and e.usuario_id=auth.uid() and e.confirmado_en is null and e.creado_en>now()-interval '1 day'));

create function public.preparar_evidencia_cumplimiento(p_id uuid,p_obligacion uuid,p_vence date,p_nombre text,p_extension text,p_mime text,p_bytes integer,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.cumplimiento_fechas;v public.cumplimiento_evidencias;ruta_nueva text;mime_esperado text;
begin
 perform public.exigir_admin_compras();
 if p_id is null or p_nombre is null or length(trim(p_nombre)) not between 1 and 200 or p_nombre~'[[:cntrl:]/\\]' or p_bytes is null or p_bytes not between 1 and 4194304 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' then raise exception 'Datos de archivo inválidos.';end if;
 mime_esperado:=case p_extension when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' end;
 if mime_esperado is null or p_mime is distinct from mime_esperado then raise exception 'La evidencia debe ser PDF o foto.';end if;
 if not exists(select 1 from public.cumplimiento_obligaciones where id=p_obligacion) then raise exception 'Obligación inexistente.';end if;
 r:=public.fila_fecha_cumplimiento(p_obligacion,p_vence);
 if r.estado='omitida' then raise exception 'La fecha está omitida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('evidencia-cumplimiento:'||p_id::text,0));
 ruta_nueva:='cumplimiento/'||r.id::text||'/'||p_id::text||'.'||p_extension;
 select * into v from public.cumplimiento_evidencias where id=p_id;
 if found then
  if v.usuario_id<>auth.uid() or v.ruta<>ruta_nueva or v.sha256<>p_sha256 or v.bytes<>p_bytes then raise exception 'Esta solicitud ya corresponde a otro archivo.';end if;
 else
  insert into public.cumplimiento_evidencias(id,fecha_id,clase,nombre,ruta,mime,bytes,sha256,usuario_id)
  values(p_id,r.id,case when p_mime='application/pdf' then 'documento' else 'foto' end,trim(p_nombre),ruta_nueva,p_mime,p_bytes,p_sha256,auth.uid()) returning * into v;
 end if;
 return jsonb_build_object('ruta',v.ruta,'disponible',v.confirmado_en is not null);
end $$;

create function public.confirmar_evidencia_cumplimiento(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.cumplimiento_evidencias;
begin
 perform public.exigir_admin_compras();
 select * into v from public.cumplimiento_evidencias where id=p_id for update;
 if not found or v.usuario_id<>auth.uid() then raise exception 'Evidencia no encontrada.';end if;
 if v.confirmado_en is not null then return;end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='adjuntos-compras' and o.name=v.ruta and (o.metadata->>'size')::bigint=v.bytes and o.metadata->>'mimetype'=v.mime) then raise exception 'El archivo no está subido o no coincide con la reserva.';end if;
 update public.cumplimiento_evidencias set confirmado_en=now() where id=p_id;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id)
  select f.obligacion_id,'Evidencia','{}'::jsonb,jsonb_build_object('nombre',v.nombre,'clase',v.clase,'fecha',f.vence),auth.uid() from public.cumplimiento_fechas f where f.id=v.fecha_id;
end $$;

create function public.cerrar_fecha_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_fecha date,p_nota text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.cumplimiento_fechas;n public.cumplimiento_fechas;
begin
 perform public.exigir_admin_compras();
 perform 1 from public.cumplimiento_obligaciones where id=p_obligacion for update;
 if not found then raise exception 'Obligación inexistente.';end if;
 if p_fecha is null or p_fecha>public.hoy_mx() then raise exception 'Indica cuándo se cumplió; no puede ser una fecha futura.';end if;
 if length(trim(coalesce(p_nota,'')))<5 then raise exception 'Escribe qué se hizo (al menos 5 letras).';end if;
 r:=public.fila_fecha_cumplimiento(p_obligacion,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if r.estado='omitida' then raise exception 'La fecha está omitida.';end if;
 if r.estado='cumplida' then raise exception 'La fecha ya está cumplida.';end if;
 if not exists(select 1 from public.cumplimiento_evidencias e where e.fecha_id=r.id and e.clase='foto' and e.confirmado_en is not null)
  or not exists(select 1 from public.cumplimiento_evidencias e where e.fecha_id=r.id and e.clase='documento' and e.confirmado_en is not null) then
  raise exception 'Sube al menos una foto y un documento PDF antes de cerrarla.';end if;
 update public.cumplimiento_fechas set estado='cumplida',cumplida_fecha=p_fecha,nota=trim(p_nota),revision=revision+1 where id=r.id returning * into n;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(p_obligacion,'Cumplida',to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create function public.omitir_fecha_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.cumplimiento_fechas;n public.cumplimiento_fechas;v_motivo text:=nullif(trim(coalesce(p_motivo,'')),'');
begin
 perform public.exigir_admin_compras();
 if not exists(select 1 from public.cumplimiento_obligaciones where id=p_obligacion) then raise exception 'Obligación inexistente.';end if;
 if v_motivo is not null and length(v_motivo)<5 then raise exception 'Escribe el motivo (al menos 5 letras).';end if;
 r:=public.fila_fecha_cumplimiento(p_obligacion,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if r.estado='cumplida' then raise exception 'La fecha ya está cumplida.';end if;
 if r.factura_id is not null then raise exception 'La fecha ya tiene factura. Quítala antes de omitirla.';end if;
 update public.cumplimiento_fechas set estado=case when v_motivo is null then 'pendiente' else 'omitida' end,omitida_motivo=v_motivo,revision=revision+1 where id=r.id returning * into n;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(p_obligacion,case when v_motivo is null then 'Omisión quitada' else 'Fecha omitida' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create function public.ligar_factura_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_factura uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.cumplimiento_obligaciones;r public.cumplimiento_fechas;n public.cumplimiento_fechas;f public.facturas;
begin
 perform public.exigir_admin_compras();
 select * into o from public.cumplimiento_obligaciones where id=p_obligacion for update;
 if not found then raise exception 'Obligación inexistente.';end if;
 r:=public.fila_fecha_cumplimiento(p_obligacion,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if p_factura is not null then
  if not o.con_pago then raise exception 'Esta obligación no lleva pago.';end if;
  if r.estado='omitida' then raise exception 'La fecha está omitida. Quita la omisión antes de ligar la factura.';end if;
  select * into f from public.facturas where id=p_factura for update;
  if not found or f.tipo<>'ingreso' or f.estado='cancelada' then raise exception 'Elige una factura vigente.';end if;
  if f.proveedor_id<>o.proveedor_id then raise exception 'La factura debe ser del proveedor de la obligación.';end if;
  if o.sucursal_id is not null and f.sucursal_id is distinct from o.sucursal_id then raise exception 'La factura debe ser de la sucursal de la obligación.';end if;
  if o.razon_social_rfc is not null and f.rfc_receptor is distinct from o.razon_social_rfc then raise exception 'La factura debe ser de la razón social de la obligación.';end if;
  if exists(select 1 from public.cumplimiento_fechas where factura_id=p_factura and id<>r.id) or exists(select 1 from public.compromiso_fechas where factura_id=p_factura) then
   raise exception 'Esa factura ya está ligada a otra fecha.';end if;
 end if;
 update public.cumplimiento_fechas set factura_id=p_factura,revision=revision+1 where id=r.id returning * into n;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(p_obligacion,case when p_factura is null then 'Factura quitada' else 'Factura ligada' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

-- Cuando un gasto sin CFDI ligado se sustituye por su CFDI, la liga pasa al CFDI (si el CFDI no está ligado ya).
create function public.cumplimiento_sigue_sustitucion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.cumplimiento_fechas set factura_id=new.sustituido_por,revision=revision+1
  where factura_id=new.id and not exists(select 1 from public.cumplimiento_fechas x where x.factura_id=new.sustituido_por)
   and not exists(select 1 from public.compromiso_fechas x where x.factura_id=new.sustituido_por);
 return new;
end $$;
create trigger cumplimiento_sustitucion after update of sustituido_por on public.facturas
 for each row when (new.sustituido_por is not null and old.sustituido_por is distinct from new.sustituido_por)
 execute function public.cumplimiento_sigue_sustitucion();

revoke all on function public.fila_fecha_cumplimiento(uuid,date),public.cumplimiento_sigue_sustitucion() from public,anon,authenticated;
revoke all on function public.preparar_evidencia_cumplimiento(uuid,uuid,date,text,text,text,integer,text),public.confirmar_evidencia_cumplimiento(uuid),
 public.cerrar_fecha_cumplimiento(uuid,date,integer,date,text),public.omitir_fecha_cumplimiento(uuid,date,integer,text),public.ligar_factura_cumplimiento(uuid,date,integer,uuid) from public,anon;
grant execute on function public.preparar_evidencia_cumplimiento(uuid,uuid,date,text,text,text,integer,text),public.confirmar_evidencia_cumplimiento(uuid),
 public.cerrar_fecha_cumplimiento(uuid,date,integer,date,text),public.omitir_fecha_cumplimiento(uuid,date,integer,text),public.ligar_factura_cumplimiento(uuid,date,integer,uuid) to authenticated;
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --test tests/calendarioCumplimiento.test.mjs lib/dodois/migraciones.test.ts`
Expected: PASS (5 de cumplimiento).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261029150000_calendario_cumplimiento.sql supabase/pruebas/20261029150000_calendario_cumplimiento.sql tests/calendarioCumplimiento.test.mjs
git commit -m "feat(cumplimiento): cierre con foto y PDF, omisión y factura por fecha"
```

---

### Task 3: Vista unificada y avisos (SQL)

**Files:**
- Modify: `supabase/migrations/20261029150000_calendario_cumplimiento.sql` (antes de `commit;`)
- Modify: `supabase/pruebas/20261029150000_calendario_cumplimiento.sql`

**Interfaces:**
- Consumes: todo lo anterior y `public.compromisos_en_rango(date,date)`, `public.compromiso_evidencias`, `public.activo_mantenimientos`, `public.activos`.
- Produces:
  - `public.cumplimiento_en_rango(p_desde date,p_hasta date,p_hoy date) returns table(origen text, referencia_id uuid, fecha_id uuid, revision integer, titulo text, detalle text, tipo text, sucursal_id uuid, razon_social_rfc text, ambito text, vence date, fecha date, frecuencia text, estado text, falta_evidencia boolean, falta_factura boolean, factura_id uuid, ruta text)`. `fecha` = día donde se pinta (cumplida: fecha real; resto: vence). `ruta` relativa. Rango máximo 800 días.
  - `public.avisos_cumplimiento(p_hoy date,p_canal text) returns table(clave text, origen text, referencia_id uuid, titulo text, detalle text, ambito text, vence date, tipo_aviso text, dias integer, ruta text)`; `dias = vence - hoy` (negativo si vencida). Clave `origen:referencia_id:vence:tipo_aviso:hoy`. Solo admin.
  - `public.registrar_avisos_cumplimiento(p_claves text[],p_canal text) returns integer` (nuevos registrados). Solo admin.
  - `public.correos_avisos_cumplimiento() returns setof text`. Solo admin.

- [ ] **Step 1: Agregar las pruebas SQL (fallan)**

Agregar en `declare`: `s uuid;an uuid;m uuid;act uuid;claves text[];`. Insertar antes de `raise exception 'PRUEBAS OK';`:

```sql
  -- 16. Vista unificada con hoy = 8 de marzo de 2027. Semanal desde el lunes 1: vencida, por vencer (hoy) y pendiente.
  s:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','extintores','nombre','Bitácora de extintores','sucursal_id',f.sucursal_id,'frecuencia','semanal','inicio','2027-03-01','con_pago','false'));
  an:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','seguro','nombre','Seguro de local','razon_social_rfc',f.rfc_receptor,'frecuencia','anual','inicio','2027-05-07','con_pago','true','proveedor_id',f.proveedor_id));
  select array_agg(r.estado order by r.vence) into claves from public.cumplimiento_en_rango('2027-03-01','2027-03-15','2027-03-08') r where r.referencia_id=s;
  if claves is distinct from array['vencida','por_vencer','pendiente'] then raise exception 'FALLÓ: estados semanal %',claves;end if;
  if (select r.estado from public.cumplimiento_en_rango('2027-05-01','2027-05-31','2027-03-08') r where r.referencia_id=an)<>'por_vencer' then raise exception 'FALLÓ: anual a 60 días';end if;
  if (select r.ambito from public.cumplimiento_en_rango('2027-05-01','2027-05-31','2027-03-08') r where r.referencia_id=an) is distinct from (select razon_social from public.razones_sociales where rfc=f.rfc_receptor) then raise exception 'FALLÓ: ámbito de razón social';end if;
  -- La póliza cumplida en enero sin factura vigente queda como cumplida_sin_factura al quitar la factura.
  perform public.ligar_factura_cumplimiento(p,'2027-01-10',2,null);
  if (select r.estado from public.cumplimiento_en_rango('2027-01-01','2027-01-31','2027-03-08') r where r.referencia_id=p)<>'cumplida_sin_factura' then raise exception 'FALLÓ: cumplida sin factura';end if;
  if (select r.fecha from public.cumplimiento_en_rango('2027-01-01','2027-01-31','2027-03-08') r where r.referencia_id=p)<>'2026-01-10' then raise exception 'FALLÓ: fecha real de cumplida';end if;
  begin perform public.cumplimiento_en_rango('2027-01-01','2030-01-01','2027-03-08');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: rango demasiado largo';end if;

  -- 17. Mantenimiento pendiente del 1 de marzo: sale como vencido con su liga a la ficha.
  select id into act from public.activos limit 1;
  if act is not null then
   insert into public.activo_mantenimientos(activo_id,tipo,tarea,programado) values(act,'preventivo','Limpieza de campana','2027-03-01') returning id into m;
   if not exists(select 1 from public.cumplimiento_en_rango('2027-03-01','2027-03-31','2027-03-08') r where r.origen='mantenimiento' and r.referencia_id=m and r.estado='vencida' and r.ruta='/activos/'||act||'#servicio-'||m) then raise exception 'FALLÓ: mantenimiento en la vista';end if;
  end if;

  -- 18. Avisos del día: vencida (1 mar), hoy (8 mar, 0 días), anual a 60 días; no el 15 de marzo.
  select array_agg(x.tipo_aviso||':'||x.dias order by x.vence) into claves from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id in (s,an);
  if claves is distinct from array['vencida:-7','por_vencer:0','por_vencer:60'] then raise exception 'FALLÓ: avisos %',claves;end if;
  -- El día 9 la anual (59 días) no se avisa; el día 6 de abril (30 días) sí.
  if exists(select 1 from public.avisos_cumplimiento('2027-03-09','correo') x where x.referencia_id=an) then raise exception 'FALLÓ: aviso fuera de anticipación';end if;
  if not exists(select 1 from public.avisos_cumplimiento('2027-04-07','correo') x where x.referencia_id=an and x.dias=30) then raise exception 'FALLÓ: aviso a 30 días';end if;
  -- Cumplida sin factura: aviso diario.
  if not exists(select 1 from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id=p and x.tipo_aviso='sin_factura') then raise exception 'FALLÓ: aviso sin factura';end if;

  -- 19. Registrar entregados: idempotente y por canal.
  select array_agg(x.clave) into claves from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id in (s,an);
  if public.registrar_avisos_cumplimiento(claves,'correo')<>3 then raise exception 'FALLÓ: registrar';end if;
  if public.registrar_avisos_cumplimiento(claves,'correo')<>0 then raise exception 'FALLÓ: registrar dos veces';end if;
  if exists(select 1 from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id in (s,an)) then raise exception 'FALLÓ: aviso repetido por correo';end if;
  if (select count(*) from public.avisos_cumplimiento('2027-03-08','chat') x where x.referencia_id in (s,an))<>3 then raise exception 'FALLÓ: chat debe seguir pendiente';end if;
  -- Claves mal formadas o canal inválido: rechazo completo.
  begin perform public.registrar_avisos_cumplimiento(array['obligacion:x:2027-03-08:vencida:2027-03-08'],'correo');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: clave mal formada';end if;
  begin perform public.registrar_avisos_cumplimiento(claves,'whatsapp');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: canal inválido';end if;
  begin perform public.registrar_avisos_cumplimiento(array_fill('x'::text,array[501]),'chat');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: demasiadas claves';end if;

  -- 20. Correos: solo admins activos. Corporativo no consulta avisos ni correos.
  if not exists(select 1 from public.correos_avisos_cumplimiento()) then raise exception 'FALLÓ: sin correos de admins';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',corp,'role','authenticated')::text,true);
  begin perform public.avisos_cumplimiento('2027-03-08','correo');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: corporativo consultó avisos';end if;
  begin perform public.correos_avisos_cumplimiento();ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: corporativo consultó correos';end if;
  -- Corporativo sí ve la vista unificada.
  if not exists(select 1 from public.cumplimiento_en_rango('2027-03-01','2027-03-15','2027-03-08') r where r.referencia_id=s) then raise exception 'FALLÓ: corporativo no ve el calendario';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
```

Agregar en `tests/calendarioCumplimiento.test.mjs`:

```js
test('cumplimiento: correos de avisos solo de admins activos',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  assert.deepEqual((await db.query(`select c from public.correos_avisos_cumplimiento() c`)).rows.map(r=>r.c),['julio@ejemplo.mx']);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/calendarioCumplimiento.test.mjs`
Expected: FAIL con `function public.cumplimiento_en_rango(...) does not exist`.

- [ ] **Step 3: Agregar a la migración (antes de `commit;`)**

```sql
-- Lo que leen el calendario, las alertas y los avisos: los tres orígenes con un estado común.
-- Compromisos: solo los que comprueban servicio (fumigación, basura, trampas); la renta se queda en Pagos.
create function public.cumplimiento_en_rango(p_desde date,p_hasta date,p_hoy date)
returns table(origen text,referencia_id uuid,fecha_id uuid,revision integer,titulo text,detalle text,tipo text,sucursal_id uuid,razon_social_rfc text,ambito text,
 vence date,fecha date,frecuencia text,estado text,falta_evidencia boolean,falta_factura boolean,factura_id uuid,ruta text)
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
begin
 if p_desde is null or p_hasta is null or p_hoy is null or p_hasta<p_desde or p_hasta-p_desde>800 then raise exception 'Rango de fechas inválido.';end if;
 return query
 select 'obligacion'::text,o.id,f.id,coalesce(f.revision,0),o.nombre,coalesce(o.autoridad,''),o.tipo,o.sucursal_id,o.razon_social_rfc,coalesce(s.nombre,rs.razon_social),
  v.d,case when f.estado='cumplida' then f.cumplida_fecha else v.d end,o.frecuencia,
  case when f.estado='omitida' then 'omitida'
   when f.estado='cumplida' and o.con_pago and (f.factura_id is null or fs.estado::text='cancelada') then 'cumplida_sin_factura'
   when f.estado='cumplida' then 'cumplida'
   when v.d<p_hoy then 'vencida'
   when v.d-p_hoy<=(public.dias_aviso_cumplimiento(o.frecuencia))[1] then 'por_vencer'
   else 'pendiente' end,
  false,
  o.con_pago and coalesce(f.estado,'pendiente')<>'omitida' and (f.factura_id is null or fs.estado::text='cancelada'),
  f.factura_id,'/cumplimiento/'||o.id||'#fecha-'||v.d
 from public.cumplimiento_obligaciones o
 cross join lateral public.fechas_cumplimiento(o.id,p_desde,p_hasta) v(d)
 left join public.cumplimiento_fechas f on f.obligacion_id=o.id and f.vence=v.d
 left join public.facturas_saldo fs on fs.id=f.factura_id
 left join public.sucursales s on s.id=o.sucursal_id
 left join public.razones_sociales rs on rs.rfc=o.razon_social_rfc
 union all
 select 'compromiso',c.id,r.fecha_id,r.revision,
  case when c.concepto='otro' and c.descripcion is not null then c.descripcion
   else case c.concepto when 'fumigacion' then 'Fumigación' when 'basura' then 'Recolección de basura' when 'trampas_grasa' then 'Limpieza de trampas de grasa' when 'renta' then 'Renta' else 'Otro' end end,
  'Compromiso fijo',c.concepto,c.sucursal_id,null::text,s.nombre,r.vence,
  case when r.servicio='realizado' then r.servicio_fecha else r.vence end,q.frecuencia,
  case when r.omitida_motivo is not null or r.servicio='no_realizado' then 'omitida'
   when r.servicio='realizado' and (r.factura_id is null or r.factura_estado='cancelada') then 'cumplida_sin_factura'
   when r.servicio='realizado' then 'cumplida'
   when r.vence<p_hoy then 'vencida'
   when r.vence-p_hoy<=(public.dias_aviso_cumplimiento(q.frecuencia))[1] then 'por_vencer'
   else 'pendiente' end,
  r.servicio='realizado' and not exists(select 1 from public.compromiso_evidencias e where e.fecha_id=r.fecha_id and e.confirmado_en is not null),
  r.omitida_motivo is null and r.servicio<>'no_realizado' and (r.factura_id is null or r.factura_estado='cancelada'),
  r.factura_id,'/compras/pagos/compromisos/'||c.id||'#fecha-'||r.vence
 from public.compromisos_en_rango(p_desde,p_hasta) r
 join public.compromisos c on c.id=r.compromiso_id
 cross join lateral (select case when c.unidad='semana' then case when c.cada=1 then 'semanal' else 'quincenal' end
  when c.cada=1 then 'mensual' when c.cada<12 then 'bimestral' else 'anual' end) q(frecuencia)
 left join public.sucursales s on s.id=c.sucursal_id
 where c.requiere_servicio
 union all
 select 'mantenimiento',m.id,null::uuid,m.revision,a.nombre,m.tarea,m.tipo,a.sucursal_id,null::text,s.nombre,m.programado,
  case when m.estado='completado' then m.realizado else m.programado end,null::text,
  case when m.estado='anulado' then 'omitida' when m.estado='completado' then 'cumplida'
   when m.programado<p_hoy then 'vencida'
   when m.programado-p_hoy<=(public.dias_aviso_cumplimiento('mensual'))[1] then 'por_vencer'
   else 'pendiente' end,
  false,false,null::uuid,'/activos/'||a.id||'#servicio-'||m.id
 from public.activo_mantenimientos m
 join public.activos a on a.id=m.activo_id
 left join public.sucursales s on s.id=a.sucursal_id
 where (case when m.estado='completado' then m.realizado else m.programado end) between p_desde and p_hasta;
end $$;

-- Lo que toca avisar hoy por un canal: vencidas y cumplidas sin factura cada día; por vencer solo en los días de
-- anticipación de su frecuencia. Excluye lo ya entregado por ese canal hoy. Ventana: 2 años atrás, 61 días adelante.
create function public.avisos_cumplimiento(p_hoy date,p_canal text)
returns table(clave text,origen text,referencia_id uuid,titulo text,detalle text,ambito text,vence date,tipo_aviso text,dias integer,ruta text)
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
begin
 perform public.exigir_admin_compras();
 if p_hoy is null or p_canal is null or p_canal not in ('correo','chat') then raise exception 'Datos inválidos.';end if;
 return query
 select x.clave,x.origen,x.referencia_id,x.titulo,x.detalle,x.ambito,x.vence,x.tipo_aviso,x.dias,x.ruta from (
  select concat_ws(':',r.origen,r.referencia_id,r.vence,t.tipo_aviso,p_hoy) clave,r.origen,r.referencia_id,r.titulo,r.detalle,r.ambito,r.vence,t.tipo_aviso,(r.vence-p_hoy) dias,r.ruta
  from public.cumplimiento_en_rango(p_hoy-730,p_hoy+61,p_hoy) r
  cross join lateral (select case when r.estado='vencida' then 'vencida' when r.estado='cumplida_sin_factura' then 'sin_factura'
   when r.estado='por_vencer' and (r.vence-p_hoy)=any(public.dias_aviso_cumplimiento(coalesce(r.frecuencia,'mensual'))) then 'por_vencer' end) t(tipo_aviso)
  where t.tipo_aviso is not null) x
 where not exists(select 1 from public.cumplimiento_avisos_enviados e where e.clave=x.clave and e.canal=p_canal)
 order by case x.tipo_aviso when 'vencida' then 0 when 'por_vencer' then 1 else 2 end,x.vence,x.titulo;
end $$;

create function public.registrar_avisos_cumplimiento(p_claves text[],p_canal text) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 perform public.exigir_admin_compras();
 if p_canal is null or p_canal not in ('correo','chat') then raise exception 'Canal inválido.';end if;
 if p_claves is null or cardinality(p_claves) not between 1 and 500 then raise exception 'Envía de 1 a 500 claves.';end if;
 if exists(select 1 from unnest(p_claves) c where c is null or c!~'^(obligacion|compromiso|mantenimiento):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]{4}-[0-9]{2}-[0-9]{2}:(vencida|por_vencer|sin_factura):[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
  raise exception 'Clave de aviso inválida.';end if;
 insert into public.cumplimiento_avisos_enviados(clave,canal,origen,referencia_id,vence,tipo_aviso,enviado_el,usuario_id)
 select distinct c,p_canal,split_part(c,':',1),split_part(c,':',2)::uuid,split_part(c,':',3)::date,split_part(c,':',4),split_part(c,':',5)::date,auth.uid()
 from unnest(p_claves) c
 on conflict(clave,canal) do nothing;
 get diagnostics n=row_count;
 return n;
end $$;

-- Correos de los administradores activos (viven en auth.users; la app no los lee directo).
create function public.correos_avisos_cumplimiento() returns setof text
language plpgsql security definer set search_path='' as $$
begin
 perform public.exigir_admin_compras();
 return query select u.email::text from auth.users u join public.perfiles p on p.id=u.id
  where p.activo and p.rol::text='admin' and u.email is not null order by 1;
end $$;

revoke all on function public.cumplimiento_en_rango(date,date,date),public.avisos_cumplimiento(date,text),public.registrar_avisos_cumplimiento(text[],text),public.correos_avisos_cumplimiento() from public,anon;
grant execute on function public.cumplimiento_en_rango(date,date,date),public.avisos_cumplimiento(date,text),public.registrar_avisos_cumplimiento(text[],text),public.correos_avisos_cumplimiento() to authenticated;
```

Nota: `avisos_cumplimiento` es `security invoker` (lee con RLS de quien llama) y aun así exige admin; `registrar_*` y `correos_*` son `security definer` porque escriben o leen `auth.users`.

- [ ] **Step 4: Correr las pruebas**

Run: `node --test tests/calendarioCumplimiento.test.mjs tests/compromisosRecurrentes.test.mjs lib/dodois/migraciones.test.ts`
Expected: PASS (las de compromisos siguen pasando).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261029150000_calendario_cumplimiento.sql supabase/pruebas/20261029150000_calendario_cumplimiento.sql tests/calendarioCumplimiento.test.mjs
git commit -m "feat(cumplimiento): vista unificada y avisos idempotentes por canal"
```

---

### Task 4: Lógica pura `lib/cumplimiento.ts`

**Files:**
- Create: `lib/cumplimiento.ts`
- Create: `lib/cumplimiento.test.ts`
- Modify: `package.json` (agregar `lib/cumplimiento.test.ts` al script `test`)

**Interfaces:**
- Produces (exactamente estos nombres):
  - Tipos `TipoObligacion`, `Frecuencia`, `Origen`, `EstadoCumplimiento`, `TipoAviso`, `Canal`, `Obligacion`, `FilaCumplimiento`, `AvisoCumplimiento`, `FiltroEstado`, `Alertas`.
  - Constantes `TIPOS`, `FRECUENCIAS`, `ORIGENES`, `ESTADOS` (`{texto,tono}`), `FILTROS_ESTADO`.
  - `textoFrecuencia(frecuencia: Frecuencia, inicio: string): string`
  - `ambitoDe(f: {sucursal_id: string|null; razon_social_rfc: string|null}): string` → `s:<uuid>` o `r:<RFC>`
  - `filtrarFilas(filas: FilaCumplimiento[], f: {origen: string; estado: FiltroEstado; ambito: string}): FilaCumplimiento[]`
  - `contarAlertas(filas: readonly FilaCumplimiento[]): Alertas` (`{vencidas, porVencer, sinFactura, sinEvidencia}`)
  - `ventanaCalendario(hoy: string): {desde: string; hasta: string}` (−12 y +13 meses); `ventanaAlertas(hoy: string)` (−730 y +61 días)
  - `leerObligacion(campo: (c: string) => string): {datos: Record<string,string>} | {error: string}`
  - `agruparAvisos(avisos: AvisoCumplimiento[]): Record<TipoAviso, AvisoCumplimiento[]>`
  - `llaveValida(recibida: string|null, esperada: string|undefined): boolean`
  - `leerEntregados(cuerpo: unknown): {canal: Canal; claves: string[]} | {error: string}`

- [ ] **Step 1: Escribir las pruebas (fallan)**

`lib/cumplimiento.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparAvisos, ambitoDe, contarAlertas, filtrarFilas, leerEntregados, leerObligacion, llaveValida, textoFrecuencia, ventanaAlertas, ventanaCalendario, type FilaCumplimiento } from "./cumplimiento.ts";

const fila = (x: Partial<FilaCumplimiento>): FilaCumplimiento => ({
  origen: "obligacion", referencia_id: "o1", fecha_id: null, revision: 0, titulo: "Licencia", detalle: "", tipo: "licencia",
  sucursal_id: "s1", razon_social_rfc: null, ambito: "Zapopan-1", vence: "2027-03-08", fecha: "2027-03-08", frecuencia: "mensual",
  estado: "pendiente", falta_evidencia: false, falta_factura: false, factura_id: null, ruta: "/cumplimiento/o1#fecha-2027-03-08", ...x,
});

test("textoFrecuencia: cada frecuencia en palabras", () => {
  assert.equal(textoFrecuencia("semanal", "2027-01-05"), "Cada semana, los martes");
  assert.equal(textoFrecuencia("quincenal", "2027-01-20"), "Cada quincena: día 15 y último día del mes");
  assert.equal(textoFrecuencia("mensual", "2027-01-31"), "Cada mes, día 31 (o el último del mes)");
  assert.equal(textoFrecuencia("bimestral", "2027-01-10"), "Cada 2 meses, día 10");
  assert.equal(textoFrecuencia("anual", "2028-02-29"), "Cada año, el 29 de febrero (o el 28 si no es bisiesto)");
  assert.equal(textoFrecuencia("anual", "2027-05-07"), "Cada año, el 7 de mayo");
});

test("filtros: origen, ámbito y estado; 'vigentes' oculta omitidas; 'sin_evidencia' usa la bandera", () => {
  const filas = [fila({}), fila({ referencia_id: "o2", estado: "omitida" }), fila({ origen: "compromiso", referencia_id: "c1", estado: "cumplida", falta_evidencia: true }),
    fila({ referencia_id: "o3", sucursal_id: null, razon_social_rfc: "CMS230321FI8", estado: "vencida" })];
  assert.deepEqual(filtrarFilas(filas, { origen: "", estado: "vigentes", ambito: "" }).map((f) => f.referencia_id), ["o1", "c1", "o3"]);
  assert.deepEqual(filtrarFilas(filas, { origen: "compromiso", estado: "todos", ambito: "" }).map((f) => f.referencia_id), ["c1"]);
  assert.deepEqual(filtrarFilas(filas, { origen: "", estado: "sin_evidencia", ambito: "" }).map((f) => f.referencia_id), ["c1"]);
  assert.deepEqual(filtrarFilas(filas, { origen: "", estado: "todos", ambito: "r:CMS230321FI8" }).map((f) => f.referencia_id), ["o3"]);
  assert.equal(ambitoDe({ sucursal_id: "s1", razon_social_rfc: null }), "s:s1");
});

test("contarAlertas: vencidas, por vencer, sin factura y sin evidencia", () => {
  assert.deepEqual(contarAlertas([fila({ estado: "vencida" }), fila({ estado: "por_vencer" }), fila({ estado: "cumplida_sin_factura" }), fila({ estado: "cumplida", falta_evidencia: true }), fila({ estado: "omitida" })]),
    { vencidas: 1, porVencer: 1, sinFactura: 1, sinEvidencia: 1 });
});

test("ventanas: el calendario y las alertas caben en 800 días", () => {
  assert.deepEqual(ventanaCalendario("2027-03-31"), { desde: "2026-03-31", hasta: "2028-04-30" });
  assert.deepEqual(ventanaAlertas("2027-03-08"), { desde: "2025-03-08", hasta: "2027-05-08" });
});

test("leerObligacion: valida y arma los datos de guardar_obligacion", () => {
  const base: Record<string, string> = { tipo: "seguro", nombre: "Póliza de daños", ambito: "s:00000000-0000-0000-0000-0000000000e1", frecuencia: "anual", inicio: "2027-05-07", fin: "", con_pago: "si", proveedor_id: "p1", monto_estimado: "$18,000.50" };
  const campo = (x: Record<string, string>) => (c: string) => x[c] ?? "";
  assert.deepEqual(leerObligacion(campo(base)), { datos: { tipo: "seguro", nombre: "Póliza de daños", descripcion: "", autoridad: "", folio: "", notas: "", sucursal_id: "00000000-0000-0000-0000-0000000000e1", razon_social_rfc: "", frecuencia: "anual", inicio: "2027-05-07", fin: "", con_pago: "true", proveedor_id: "p1", monto_estimado: "18000.50" } });
  const rs = leerObligacion(campo({ ...base, ambito: "r:CMS230321FI8", con_pago: "no" }));
  assert.ok("datos" in rs && rs.datos.razon_social_rfc === "CMS230321FI8" && rs.datos.sucursal_id === "" && rs.datos.proveedor_id === "" && rs.datos.con_pago === "false");
  assert.deepEqual(leerObligacion(campo({ ...base, tipo: "x" })), { error: "Elige el tipo de obligación." });
  assert.deepEqual(leerObligacion(campo({ ...base, nombre: "ab" })), { error: "Escribe el nombre (al menos 3 letras)." });
  assert.deepEqual(leerObligacion(campo({ ...base, ambito: "" })), { error: "Elige la sucursal o la razón social." });
  assert.deepEqual(leerObligacion(campo({ ...base, frecuencia: "diaria" })), { error: "Elige la frecuencia." });
  assert.deepEqual(leerObligacion(campo({ ...base, proveedor_id: "" })), { error: "Elige el proveedor que factura el pago." });
  assert.deepEqual(leerObligacion(campo({ ...base, monto_estimado: "0" })), { error: "El monto estimado debe ser mayor a cero (o déjalo vacío)." });
  assert.deepEqual(leerObligacion(campo({ ...base, fin: "2027-01-01" })), { error: "El fin no puede ser antes del inicio." });
  assert.deepEqual(leerObligacion(campo({ ...base, tipo: "otro", descripcion: "" })), { error: "Describe la obligación (al menos 3 letras)." });
});

test("avisos: se agrupan por tipo conservando el orden", () => {
  const a = { clave: "k", origen: "obligacion" as const, referencia_id: "o1", titulo: "A", detalle: "", ambito: "Z", vence: "2027-03-01", dias: -7, ruta: "/x", url: "https://app/x" };
  const g = agruparAvisos([{ ...a, tipo_aviso: "vencida" as const }, { ...a, titulo: "B", tipo_aviso: "por_vencer" as const }, { ...a, titulo: "C", tipo_aviso: "vencida" as const }]);
  assert.deepEqual(g.vencida.map((x) => x.titulo), ["A", "C"]);assert.deepEqual(g.por_vencer.map((x) => x.titulo), ["B"]);assert.deepEqual(g.sin_factura, []);
});

test("endpoints: llave y cuerpo de entregados", () => {
  assert.equal(llaveValida("abc", "abc"), true);assert.equal(llaveValida("abc", undefined), false);assert.equal(llaveValida(null, "abc"), false);assert.equal(llaveValida("abd", "abc"), false);
  const k = "obligacion:00000000-0000-0000-0000-0000000000e1:2027-03-08:vencida:2027-03-08";
  assert.deepEqual(leerEntregados({ canal: "chat", claves: [k, k] }), { canal: "chat", claves: [k] });
  assert.deepEqual(leerEntregados({ canal: "whatsapp", claves: [k] }), { error: "Canal inválido." });
  assert.deepEqual(leerEntregados({ canal: "correo", claves: [] }), { error: "Envía de 1 a 500 claves." });
  assert.deepEqual(leerEntregados({ canal: "correo", claves: ["obligacion:x"] }), { error: "Clave de aviso inválida." });
  assert.deepEqual(leerEntregados("texto"), { error: "Cuerpo inválido." });
});
```

Agregar `lib/cumplimiento.test.ts` al script `test` de `package.json` (junto a `lib/activos.test.ts`).

- [ ] **Step 2: Correr y ver que falla**

Run: `node --experimental-strip-types --test lib/cumplimiento.test.ts`
Expected: FAIL `Cannot find module './cumplimiento.ts'`.

- [ ] **Step 3: Implementar**

`lib/cumplimiento.ts`:

```ts
/** Calendario de cumplimiento: obligaciones, compromisos con servicio y mantenimientos en una sola lista. Fechas YYYY-MM-DD.
 * Sin imports: lo usan componentes de cliente y las pruebas con strip-types. */
export type TipoObligacion = "permiso" | "licencia" | "proteccion_civil" | "extintores" | "tramite_fiscal" | "seguro" | "otro";
export const TIPOS: Record<TipoObligacion, string> = {
  permiso: "Permiso", licencia: "Licencia", proteccion_civil: "Protección civil", extintores: "Extintores",
  tramite_fiscal: "Trámite fiscal", seguro: "Seguro", otro: "Otro",
};
export type Frecuencia = "semanal" | "quincenal" | "mensual" | "bimestral" | "anual";
export const FRECUENCIAS: Record<Frecuencia, string> = { semanal: "Semanal", quincenal: "Quincenal (15 y último día)", mensual: "Mensual", bimestral: "Bimestral", anual: "Anual" };
export type Origen = "obligacion" | "compromiso" | "mantenimiento";
export const ORIGENES: Record<Origen, string> = { obligacion: "Obligaciones", compromiso: "Compromisos fijos", mantenimiento: "Mantenimiento de activos" };
export type EstadoCumplimiento = "pendiente" | "por_vencer" | "vencida" | "cumplida" | "cumplida_sin_factura" | "omitida";
export const ESTADOS: Record<EstadoCumplimiento, { texto: string; tono: string }> = {
  pendiente: { texto: "Pendiente", tono: "info" }, por_vencer: { texto: "Por vencer", tono: "aviso" }, vencida: { texto: "Vencida", tono: "peligro" },
  cumplida: { texto: "Cumplida", tono: "exito" }, cumplida_sin_factura: { texto: "Cumplida, falta factura", tono: "aviso" }, omitida: { texto: "Omitida", tono: "gris" },
};
export type TipoAviso = "vencida" | "por_vencer" | "sin_factura";
export type Canal = "correo" | "chat";

export type Obligacion = {
  id: string; tipo: TipoObligacion; nombre: string; descripcion: string | null; autoridad: string | null; folio: string | null; notas: string | null;
  sucursal_id: string | null; razon_social_rfc: string | null; frecuencia: Frecuencia; inicio: string; fin: string | null;
  con_pago: boolean; proveedor_id: string | null; monto_estimado: number | null; revision: number;
};
/** Una fila de `cumplimiento_en_rango`. */
export type FilaCumplimiento = {
  origen: Origen; referencia_id: string; fecha_id: string | null; revision: number; titulo: string; detalle: string; tipo: string;
  sucursal_id: string | null; razon_social_rfc: string | null; ambito: string | null; vence: string; fecha: string; frecuencia: Frecuencia | null;
  estado: EstadoCumplimiento; falta_evidencia: boolean; falta_factura: boolean; factura_id: string | null; ruta: string;
};
/** Una fila de `avisos_cumplimiento` con la liga absoluta que arma el endpoint. */
export type AvisoCumplimiento = {
  clave: string; origen: Origen; referencia_id: string; titulo: string; detalle: string; ambito: string | null; vence: string;
  tipo_aviso: TipoAviso; dias: number; ruta: string; url: string;
};

const LOS_DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function textoFrecuencia(frecuencia: Frecuencia, inicio: string): string {
  const [, m, d] = inicio.split("-").map(Number);
  if (frecuencia === "semanal") return `Cada semana, los ${LOS_DIAS[new Date(`${inicio}T00:00:00Z`).getUTCDay()]}`;
  if (frecuencia === "quincenal") return "Cada quincena: día 15 y último día del mes";
  if (frecuencia === "anual") return `Cada año, el ${d} de ${MESES[m - 1]}${m === 2 && d === 29 ? " (o el 28 si no es bisiesto)" : ""}`;
  return `${frecuencia === "mensual" ? "Cada mes" : "Cada 2 meses"}, día ${d}${d > 28 ? " (o el último del mes)" : ""}`;
}

export const ambitoDe = (f: { sucursal_id: string | null; razon_social_rfc: string | null }) => (f.sucursal_id ? `s:${f.sucursal_id}` : `r:${f.razon_social_rfc}`);

export type FiltroEstado = "vigentes" | "pendiente" | "por_vencer" | "vencida" | "cumplida_sin_factura" | "sin_evidencia" | "cumplida" | "todos";
export const FILTROS_ESTADO: Record<FiltroEstado, string> = {
  vigentes: "Todo menos omitidas", pendiente: "Pendientes", por_vencer: "Por vencer", vencida: "Vencidas",
  cumplida_sin_factura: "Cumplidas sin factura", sin_evidencia: "Sin evidencia", cumplida: "Cumplidas", todos: "Todas, incluidas omitidas",
};

export function filtrarFilas(filas: FilaCumplimiento[], f: { origen: string; estado: FiltroEstado; ambito: string }): FilaCumplimiento[] {
  return filas.filter((x) => (!f.origen || x.origen === f.origen) && (!f.ambito || ambitoDe(x) === f.ambito) && (
    f.estado === "todos" ? true : f.estado === "vigentes" ? x.estado !== "omitida" : f.estado === "sin_evidencia" ? x.falta_evidencia : x.estado === f.estado));
}

export type Alertas = { vencidas: number; porVencer: number; sinFactura: number; sinEvidencia: number };
export const contarAlertas = (filas: readonly FilaCumplimiento[]): Alertas => ({
  vencidas: filas.filter((f) => f.estado === "vencida").length,
  porVencer: filas.filter((f) => f.estado === "por_vencer").length,
  sinFactura: filas.filter((f) => f.estado === "cumplida_sin_factura").length,
  sinEvidencia: filas.filter((f) => f.falta_evidencia).length,
});

/** Mismo día `n` meses antes o después; si ese mes es más corto, su último día. */
function moverMeses(f: string, n: number): string {
  const [a, m, d] = f.split("-").map(Number), total = a * 12 + (m - 1) + n, anio = Math.floor(total / 12), mes = (total % 12) + 1;
  const dia = Math.min(d, new Date(Date.UTC(anio, mes, 0)).getUTCDate());
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
const sumarDias = (f: string, n: number) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Lo que muestra el calendario: un año atrás y 13 meses adelante (cabe en el máximo de 800 días de la consulta). */
export const ventanaCalendario = (hoy: string) => ({ desde: moverMeses(hoy, -12), hasta: moverMeses(hoy, 13) });
/** La misma ventana que usa `avisos_cumplimiento`: dos años atrás y 61 días adelante (el aviso anual más lejano es a 60). */
export const ventanaAlertas = (hoy: string) => ({ desde: sumarDias(hoy, -730), hasta: sumarDias(hoy, 61) });

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Valida el formulario y arma `p_datos` de `guardar_obligacion`. `ambito` llega como `s:<sucursal>` o `r:<RFC>`. */
export function leerObligacion(campo: (c: string) => string): { datos: Record<string, string> } | { error: string } {
  const v = (c: string) => campo(c).trim();
  const tipo = v("tipo"), frecuencia = v("frecuencia"), ambito = v("ambito"), pago = v("con_pago") === "si", monto = v("monto_estimado").replace(/[$,\s]/g, "");
  if (!(tipo in TIPOS)) return { error: "Elige el tipo de obligación." };
  if (v("nombre").length < 3) return { error: "Escribe el nombre (al menos 3 letras)." };
  if (tipo === "otro" && v("descripcion").length < 3) return { error: "Describe la obligación (al menos 3 letras)." };
  if (!/^[sr]:.+/.test(ambito)) return { error: "Elige la sucursal o la razón social." };
  if (!(frecuencia in FRECUENCIAS)) return { error: "Elige la frecuencia." };
  if (!FECHA.test(v("inicio"))) return { error: "Indica la fecha de inicio." };
  if (v("fin") && (!FECHA.test(v("fin")) || v("fin") < v("inicio"))) return { error: "El fin no puede ser antes del inicio." };
  if (pago && !v("proveedor_id")) return { error: "Elige el proveedor que factura el pago." };
  if (pago && monto && (!/^\d+(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0)) return { error: "El monto estimado debe ser mayor a cero (o déjalo vacío)." };
  return { datos: {
    tipo, nombre: v("nombre"), descripcion: v("descripcion"), autoridad: v("autoridad"), folio: v("folio"), notas: v("notas"),
    sucursal_id: ambito.startsWith("s:") ? ambito.slice(2) : "", razon_social_rfc: ambito.startsWith("r:") ? ambito.slice(2) : "",
    frecuencia, inicio: v("inicio"), fin: v("fin"), con_pago: pago ? "true" : "false",
    proveedor_id: pago ? v("proveedor_id") : "", monto_estimado: pago ? monto : "",
  } };
}

export function agruparAvisos(avisos: AvisoCumplimiento[]): Record<TipoAviso, AvisoCumplimiento[]> {
  const r: Record<TipoAviso, AvisoCumplimiento[]> = { vencida: [], por_vencer: [], sin_factura: [] };
  for (const a of avisos) r[a.tipo_aviso].push(a);
  return r;
}

/** Compara la llave del header contra la configurada en tiempo constante (sin `node:crypto`, para que el módulo sirva
 * también en el cliente). Sin llave configurada, nadie entra. */
export function llaveValida(recibida: string | null, esperada: string | undefined): boolean {
  if (!recibida || !esperada || recibida.length !== esperada.length) return false;
  let d = 0;
  for (let i = 0; i < esperada.length; i++) d |= recibida.charCodeAt(i) ^ esperada.charCodeAt(i);
  return d === 0;
}

const CLAVE = new RegExp(`^(obligacion|compromiso|mantenimiento):${UUID.source.slice(1, -1)}:\\d{4}-\\d{2}-\\d{2}:(vencida|por_vencer|sin_factura):\\d{4}-\\d{2}-\\d{2}$`);
/** Cuerpo de POST /api/cumplimiento/avisos/entregados. Mismas reglas que `registrar_avisos_cumplimiento`. */
export function leerEntregados(cuerpo: unknown): { canal: Canal; claves: string[] } | { error: string } {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return { error: "Cuerpo inválido." };
  const { canal, claves } = cuerpo as { canal?: unknown; claves?: unknown };
  if (canal !== "correo" && canal !== "chat") return { error: "Canal inválido." };
  if (!Array.isArray(claves) || claves.length < 1 || claves.length > 500) return { error: "Envía de 1 a 500 claves." };
  if (!claves.every((c) => typeof c === "string" && CLAVE.test(c))) return { error: "Clave de aviso inválida." };
  return { canal, claves: [...new Set(claves as string[])] };
}
```

- [ ] **Step 4: Correr las pruebas y tipos**

Run: `node --experimental-strip-types --test lib/cumplimiento.test.ts` y `npm run typecheck`
Expected: PASS (7 pruebas) y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add lib/cumplimiento.ts lib/cumplimiento.test.ts package.json
git commit -m "feat(cumplimiento): catálogos, filtros, alertas y validaciones"
```

---

### Task 5: Datos, acciones y descarga de evidencia

**Files:**
- Create: `app/cumplimiento/datos.ts`
- Create: `app/cumplimiento/acciones.ts`
- Create: `app/cumplimiento/evidencia/[id]/route.ts`

**Interfaces:**
- Consumes: RPC de Tasks 1–3; `leerObligacion`, `contarAlertas`, `ventanaAlertas` de Task 4; `clienteAdmin`, `volver` de `app/compras/servidor.ts`; `MAX_ADJUNTO`, `validarAdjunto` de `lib/compras/adjuntos.ts`.
- Produces:
  - `leerFilas(supabase, desde: string, hasta: string, hoy: string): Promise<FilaCumplimiento[]>`
  - `leerAlertas(supabase, hoy: string): Promise<Alertas>`
  - `leerObligaciones(supabase, id?: string): Promise<ObligacionConNombres[]>` con `sucursales{nombre}`, `razones_sociales{razon_social}`, `proveedores{razon_social,nombre_comercial}`; `ambitoTexto(o)`; `proveedorTexto(o)`.
  - `leerOpciones(supabase): Promise<{ambitos: {valor: string; nombre: string}[]; proveedores: {id: string; nombre: string}[]}>`
  - Server actions `guardarObligacion`, `cerrarFecha`, `ligarFactura`, `omitirFecha`, `subirEvidencia` (todas `(fd: FormData)`; campos ocultos `obligacion_id`, `vence`, `revision`).
  - `GET /cumplimiento/evidencia/[id]`.

- [ ] **Step 1: `app/cumplimiento/datos.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { contarAlertas, ventanaAlertas, type Alertas, type FilaCumplimiento, type Obligacion } from "@/lib/cumplimiento";

export type ObligacionConNombres = Obligacion & {
  sucursales: { nombre: string } | null; razones_sociales: { razon_social: string } | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null;
};
export const ambitoTexto = (o: ObligacionConNombres) => o.sucursales?.nombre ?? o.razones_sociales?.razon_social ?? o.razon_social_rfc ?? "Sin ámbito";
export const proveedorTexto = (o: ObligacionConNombres) => o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social ?? "Sin proveedor";

export async function leerFilas(supabase: SupabaseClient, desde: string, hasta: string, hoy: string): Promise<FilaCumplimiento[]> {
  const { data, error } = await supabase.rpc("cumplimiento_en_rango", { p_desde: desde, p_hasta: hasta, p_hoy: hoy });
  if (error) throw new Error(error.message);
  return (data ?? []) as FilaCumplimiento[];
}

/** Contadores de la franja de alertas (inicio y calendario), en la misma ventana que los avisos de n8n. */
export async function leerAlertas(supabase: SupabaseClient, hoy: string): Promise<Alertas> {
  const { desde, hasta } = ventanaAlertas(hoy);
  return contarAlertas(await leerFilas(supabase, desde, hasta, hoy));
}

export async function leerObligaciones(supabase: SupabaseClient, id?: string): Promise<ObligacionConNombres[]> {
  let q = supabase.from("cumplimiento_obligaciones").select("*, sucursales(nombre), razones_sociales(razon_social), proveedores(razon_social, nombre_comercial)").order("nombre").order("id");
  if (id) q = q.eq("id", id);
  const { data, error } = await q.returns<ObligacionConNombres[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((o) => ({ ...o, monto_estimado: o.monto_estimado === null ? null : Number(o.monto_estimado) }));
}

/** Sucursales y razones sociales activas en una sola lista (`s:<id>` / `r:<RFC>`), y proveedores activos. */
export async function leerOpciones(supabase: SupabaseClient) {
  const [{ data: sucursales }, { data: razones }, { data: proveedores }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("razones_sociales").select("rfc, razon_social").eq("activa", true).order("razon_social").returns<{ rfc: string; razon_social: string }[]>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
  ]);
  return {
    ambitos: [...(sucursales ?? []).map((s) => ({ valor: `s:${s.id}`, nombre: `Sucursal · ${s.nombre}` })), ...(razones ?? []).map((r) => ({ valor: `r:${r.rfc}`, nombre: `Razón social · ${r.razon_social}` }))],
    proveedores: (proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre_comercial ?? p.razon_social })),
  };
}
```

- [ ] **Step 2: `app/cumplimiento/acciones.ts`**

```ts
"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { leerObligacion } from "@/lib/cumplimiento";
import { MAX_ADJUNTO, validarAdjunto } from "@/lib/compras/adjuntos";
import { clienteAdmin, volver } from "../compras/servidor";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();

export async function guardarObligacion(fd: FormData) {
  const id = texto(fd, "id");
  const ruta = id ? `/cumplimiento/${id}/editar` : "/cumplimiento/nueva";
  const supabase = await clienteAdmin(ruta);
  const r = leerObligacion((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const { data, error } = await supabase.rpc("guardar_obligacion", { p_id: id || null, p_revision: Number(texto(fd, "revision") || 0), p_datos: r.datos });
  if (error) return volver(ruta, "error", error.message);
  revalidatePath("/cumplimiento", "layout");
  volver(`/cumplimiento/${data}`, "ok", "Obligación guardada.");
}

const rutaDe = (fd: FormData) => `/cumplimiento/${texto(fd, "obligacion_id")}`;
const base = (fd: FormData) => ({ p_obligacion: texto(fd, "obligacion_id"), p_vence: texto(fd, "vence"), p_revision: Number(texto(fd, "revision") || 0) });
/** Como `volver`, pero regresa a la tarjeta de la fecha: el ancla va después del aviso. */
const aFecha = (fd: FormData, clave: "ok" | "error", msg: string): never =>
  redirect(`${rutaDe(fd)}?${clave}=${encodeURIComponent(msg)}#fecha-${texto(fd, "vence")}`);
const hecho = (fd: FormData, msg: string) => { revalidatePath("/cumplimiento", "layout"); revalidatePath("/"); aFecha(fd, "ok", msg); };

/** Cierra la fecha y, si eligieron factura, la liga en seguida (la revisión ya subió en 1 por el cierre). */
export async function cerrarFecha(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("cerrar_fecha_cumplimiento", { ...base(fd), p_fecha: texto(fd, "cumplida_fecha") || null, p_nota: texto(fd, "nota") });
  if (error) return aFecha(fd, "error", error.message);
  const factura = texto(fd, "factura_id");
  if (factura) {
    const { error: e2 } = await supabase.rpc("ligar_factura_cumplimiento", { ...base(fd), p_revision: base(fd).p_revision + 1, p_factura: factura });
    if (e2) return aFecha(fd, "error", `Quedó cumplida, pero no se ligó la factura (${e2.message}).`);
  }
  hecho(fd, factura ? "Cumplida con factura." : "Cumplida. Si lleva pago, liga la factura cuando llegue.");
}

export async function ligarFactura(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("ligar_factura_cumplimiento", { ...base(fd), p_factura: texto(fd, "factura_id") || null });
  if (error) return aFecha(fd, "error", error.message);
  hecho(fd, texto(fd, "factura_id") ? "Factura ligada." : "Factura quitada de la fecha.");
}

export async function omitirFecha(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("omitir_fecha_cumplimiento", { ...base(fd), p_motivo: texto(fd, "motivo") });
  if (error) return aFecha(fd, "error", error.message);
  hecho(fd, texto(fd, "motivo") ? "Fecha omitida." : "Omisión quitada.");
}

export async function subirEvidencia(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || !archivo.size || archivo.size > MAX_ADJUNTO) return aFecha(fd, "error", "Elige una foto o PDF de hasta 4 MB.");
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let formato: ReturnType<typeof validarAdjunto>;
  try { formato = validarAdjunto(archivo.name, bytes); } catch (e) { return aFecha(fd, "error", e instanceof Error ? e.message : "Archivo inválido."); }
  const sha = createHash("sha256").update(bytes).digest("hex"), solicitud = texto(fd, "solicitud");
  const { data, error } = await supabase.rpc("preparar_evidencia_cumplimiento", { p_id: solicitud, p_obligacion: texto(fd, "obligacion_id"), p_vence: texto(fd, "vence"), p_nombre: formato.nombre, p_extension: formato.extension, p_mime: formato.mime, p_bytes: bytes.length, p_sha256: sha });
  if (error) return aFecha(fd, "error", error.message);
  const ev = data as { ruta: string; disponible: boolean };
  if (!ev.disponible) {
    const subido = await supabase.storage.from("adjuntos-compras").upload(ev.ruta, bytes, { contentType: formato.mime, upsert: false });
    if (subido.error) {
      // Reintento tras una respuesta perdida: si ya está el mismo archivo, se confirma.
      const previo = await supabase.storage.from("adjuntos-compras").download(ev.ruta);
      if (previo.error || !previo.data || createHash("sha256").update(new Uint8Array(await previo.data.arrayBuffer())).digest("hex") !== sha) return aFecha(fd, "error", "No se pudo subir el archivo. Vuelve a intentarlo.");
    }
    const { error: e2 } = await supabase.rpc("confirmar_evidencia_cumplimiento", { p_id: solicitud });
    if (e2) return aFecha(fd, "error", "El archivo se subió pero no se pudo confirmar. Vuelve a intentarlo.");
  }
  hecho(fd, formato.mime === "application/pdf" ? "Documento guardado." : "Foto guardada.");
}
```

- [ ] **Step 3: `app/cumplimiento/evidencia/[id]/route.ts`**

```ts
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerCompras } from "@/lib/roles";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const { data: e } = await supabase.from("cumplimiento_evidencias").select("ruta,nombre,mime").eq("id", id).not("confirmado_en", "is", null).maybeSingle<{ ruta: string; nombre: string; mime: string }>();
  if (!e) return new Response("Evidencia no encontrada", { status: 404 });
  const { data, error } = await supabase.storage.from("adjuntos-compras").download(e.ruta);
  if (error || !data) return new Response("No se pudo descargar la evidencia", { status: 404 });
  const nombre = encodeURIComponent(e.nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(await data.arrayBuffer(), { headers: { "Content-Type": e.mime, "Content-Disposition": `inline; filename*=UTF-8''${nombre}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/cumplimiento/datos.ts app/cumplimiento/acciones.ts "app/cumplimiento/evidencia/[id]/route.ts"
git commit -m "feat(cumplimiento): lecturas, acciones y descarga de evidencia"
```

---

### Task 6: Alta, edición y detalle de obligaciones

**Files:**
- Create: `app/cumplimiento/FormObligacion.tsx`
- Create: `app/cumplimiento/nueva/page.tsx`
- Create: `app/cumplimiento/[id]/editar/page.tsx`
- Create: `app/cumplimiento/[id]/TarjetaFecha.tsx`
- Create: `app/cumplimiento/[id]/page.tsx`
- Modify: `tests/cumplimientoCalendario.cjs` (se crea en Task 7; aquí se agrega la prueba de la tarjeta, ver Step 6)

**Interfaces:**
- Consumes: Task 4 (`TIPOS`, `FRECUENCIAS`, `ESTADOS`, `textoFrecuencia`, `ventanaCalendario`, `ambitoDe`), Task 5 (`leerObligaciones`, `leerOpciones`, `leerFilas`, `ambitoTexto`, `proveedorTexto`, acciones).
- Produces: `FormObligacion({o?, ambitos, proveedores, hoy})`; `TarjetaFecha({f, obligacion, hoy, edita, conPago, facturas, evidencias})` con `evidencias: {id, nombre, clase: "foto"|"documento"}[]` y `facturas: {id, nombre, saldo}[]`.

- [ ] **Step 1: `app/cumplimiento/FormObligacion.tsx`**

```tsx
"use client";
import { useState } from "react";
import { FRECUENCIAS, TIPOS, ambitoDe, textoFrecuencia, type Frecuencia, type Obligacion, type TipoObligacion } from "@/lib/cumplimiento";
import { guardarObligacion } from "./acciones";

/** Alta o edición. En edición, tipo, sucursal o razón social, frecuencia e inicio se muestran pero no cambian. */
export function FormObligacion({ o, ambitos, proveedores, hoy }: {
  o?: Obligacion; ambitos: { valor: string; nombre: string }[]; proveedores: { id: string; nombre: string }[]; hoy: string;
}) {
  const [tipo, setTipo] = useState<TipoObligacion>(o?.tipo ?? "permiso");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(o?.frecuencia ?? "anual");
  const [inicio, setInicio] = useState(o?.inicio ?? hoy);
  const [pago, setPago] = useState(o?.con_pago ?? false);
  const fijo = !!o;
  return (
    <form action={guardarObligacion} className="formulario seccion">
      {o && <><input type="hidden" name="id" value={o.id} /><input type="hidden" name="revision" value={o.revision} /></>}
      {fijo && <p className="saldo-nota">Tipo, sucursal o razón social, frecuencia e inicio no cambian. Para cambiarlos, ponle fin a esta obligación y crea otra.</p>}
      <div className="rejilla">
        <label className="campo">Tipo
          <select name="tipo" value={tipo} disabled={fijo} onChange={(e) => setTipo(e.target.value as TipoObligacion)}>
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {fijo && <input type="hidden" name="tipo" value={tipo} />}
        </label>
        <label className="campo">Nombre<input name="nombre" defaultValue={o?.nombre ?? ""} minLength={3} maxLength={150} required placeholder="Ej. Póliza de daños, Licencia de funcionamiento" /></label>
        <label className="campo">Descripción{tipo === "otro" ? "" : " (opcional)"}<input name="descripcion" defaultValue={o?.descripcion ?? ""} maxLength={300} required={tipo === "otro"} /></label>
        <label className="campo">Sucursal o razón social
          <select name="ambito" defaultValue={o ? ambitoDe(o) : ""} required disabled={fijo}>
            <option value="">Elige…</option>{ambitos.map((a) => <option key={a.valor} value={a.valor}>{a.nombre}</option>)}
          </select>
          {fijo && <input type="hidden" name="ambito" value={ambitoDe(o)} />}
        </label>
        <label className="campo">Autoridad o aseguradora (opcional)<input name="autoridad" defaultValue={o?.autoridad ?? ""} maxLength={150} /></label>
        <label className="campo">Folio o número de póliza (opcional)<input name="folio" defaultValue={o?.folio ?? ""} maxLength={100} /></label>
        <label className="campo">Frecuencia
          <select name="frecuencia" value={frecuencia} disabled={fijo} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
            {Object.entries(FRECUENCIAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {fijo && <input type="hidden" name="frecuencia" value={frecuencia} />}
        </label>
        <label className="campo">Primera fecha (inicio)<input type="date" name="inicio" value={inicio} onChange={(e) => setInicio(e.target.value)} required readOnly={fijo} /><small>{inicio ? textoFrecuencia(frecuencia, inicio) : ""}</small></label>
        <label className="campo">Fin (opcional)<input type="date" name="fin" defaultValue={o?.fin ?? ""} min={inicio} /></label>
        <label className="campo">¿Lleva pago?
          <select name="con_pago" value={pago ? "si" : "no"} onChange={(e) => setPago(e.target.value === "si")}>
            <option value="no">No</option><option value="si">Sí, se liga a su factura</option>
          </select>
        </label>
        {pago && <>
          <label className="campo">Proveedor que factura
            <select name="proveedor_id" defaultValue={o?.proveedor_id ?? ""} required>
              <option value="">Elige…</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="campo">Monto estimado (opcional)<input name="monto_estimado" inputMode="decimal" defaultValue={o?.monto_estimado ?? ""} /></label>
        </>}
        <label className="campo">Notas (opcional)<textarea name="notas" defaultValue={o?.notas ?? ""} maxLength={1000} /></label>
      </div>
      <p className="saldo-nota">Al guardar verás las próximas fechas. Cada fecha se cierra con al menos una foto y un PDF.</p>
      <button className="boton" type="submit">Guardar</button>
    </form>
  );
}
```

- [ ] **Step 2: `app/cumplimiento/nueva/page.tsx` y `app/cumplimiento/[id]/editar/page.tsx`**

```tsx
// app/cumplimiento/nueva/page.tsx
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerOpciones } from "../datos";
import { FormObligacion } from "../FormObligacion";

export default async function NuevaObligacion({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/cumplimiento");
  return <>
    <EncabezadoPagina titulo="Nueva obligación" descripcion="Permisos, licencias, protección civil, extintores, trámites fiscales y seguros." />
    <Aviso error={error} />
    <FormObligacion {...await leerOpciones(supabase)} hoy={hoyCalendarioMX()} />
  </>;
}
```

```tsx
// app/cumplimiento/[id]/editar/page.tsx
import { notFound, redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerObligaciones, leerOpciones } from "../../datos";
import { FormObligacion } from "../../FormObligacion";

export default async function EditarObligacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect(`/cumplimiento/${id}`);
  const [[o], opciones] = await Promise.all([leerObligaciones(supabase, id), leerOpciones(supabase)]);
  if (!o) notFound();
  return <>
    <EncabezadoPagina titulo={`Editar · ${o.nombre}`} descripcion="Los cambios aplican a las fechas que aún no se trabajan." />
    <Aviso error={error} />
    <FormObligacion o={o} {...opciones} hoy={hoyCalendarioMX()} />
  </>;
}
```

- [ ] **Step 3: `app/cumplimiento/[id]/TarjetaFecha.tsx`**

```tsx
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ESTADOS, type FilaCumplimiento } from "@/lib/cumplimiento";
import { fechaTexto, pesos } from "@/lib/formato";
import { cerrarFecha, ligarFactura, omitirFecha, subirEvidencia } from "../acciones";

type Factura = { id: string; nombre: string; saldo: number };
type Evidencia = { id: string; nombre: string; clase: "foto" | "documento" };

/** Una fecha de la obligación: estado, evidencia y factura, con sus acciones para administración. */
export function TarjetaFecha({ f, obligacion, hoy, edita, conPago, facturas, evidencias }: {
  f: FilaCumplimiento; obligacion: string; hoy: string; edita: boolean; conPago: boolean; facturas: Factura[]; evidencias: Evidencia[];
}) {
  const fotos = evidencias.filter((e) => e.clase === "foto").length, documentos = evidencias.length - fotos;
  const cumplida = f.estado === "cumplida" || f.estado === "cumplida_sin_factura", omitida = f.estado === "omitida";
  const ocultos = <><input type="hidden" name="obligacion_id" value={obligacion} /><input type="hidden" name="vence" value={f.vence} /><input type="hidden" name="revision" value={f.revision} /></>;
  const selectorFactura = <label className="campo">Factura del proveedor<select name="factura_id" defaultValue=""><option value="">{cumplida ? "Ninguna (quitar)" : "Después"}</option>{facturas.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {pesos(x.saldo)}</option>)}</select></label>;
  return (
    <article id={`fecha-${f.vence}`} className="tarjeta" data-alerta={f.estado === "vencida" || f.estado === "cumplida_sin_factura" ? "si" : undefined}>
      <div className="tarjeta-encabezado"><div><h3>Vence {fechaTexto(f.vence)}</h3>{cumplida && <p>Cumplida el {fechaTexto(f.fecha)}</p>}</div>
        <span className="insignia" data-tono={ESTADOS[f.estado].tono}>{ESTADOS[f.estado].texto}</span></div>
      <dl className="tarjeta-datos">
        <dt>Evidencia</dt><dd>{evidencias.length ? evidencias.map((e) => <Link key={e.id} href={`/cumplimiento/evidencia/${e.id}`} target="_blank">{e.clase === "foto" ? "Foto" : "PDF"}: {e.nombre} </Link>) : "Sin archivos"}{!cumplida && !omitida && <small className="saldo-nota"> · {fotos} foto(s) y {documentos} PDF; se necesita al menos uno de cada uno.</small>}</dd>
        {conPago && <><dt>Factura</dt><dd>{f.factura_id ? <Link href={`/compras/facturas/${f.factura_id}`}>Ver factura</Link> : "Sin factura"}</dd></>}
      </dl>
      {edita && !omitida && <>
        {!cumplida && <details><summary>Subir foto o PDF</summary>
          <form action={subirEvidencia} className="formulario">{ocultos}<input type="hidden" name="solicitud" value={randomUUID()} />
            <label className="campo">Foto o PDF<input type="file" name="archivo" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
            <button className="boton boton-secundario" type="submit">Subir</button>
          </form>
        </details>}
        {!cumplida && <details open={fotos > 0 && documentos > 0}><summary>Marcar como cumplida</summary>
          <form action={cerrarFecha} className="formulario">{ocultos}
            <label className="campo">Fecha en que se cumplió<input type="date" name="cumplida_fecha" max={hoy} defaultValue={hoy} required /></label>
            <label className="campo">Qué se hizo<textarea name="nota" minLength={5} maxLength={2000} required placeholder="Ej. Renovación de póliza 2027, folio 12345" /></label>
            {conPago && selectorFactura}
            <button className="boton" type="submit" disabled={!fotos || !documentos}>Marcar cumplida</button>
          </form>
        </details>}
        {cumplida && conPago && <details open={!f.factura_id}><summary>{f.factura_id ? "Cambiar o quitar factura" : "Ligar factura"}</summary>
          <form action={ligarFactura} className="formulario">{ocultos}{selectorFactura}<button className="boton" type="submit">Guardar</button></form>
        </details>}
      </>}
      {edita && !cumplida && !f.factura_id && <details><summary>{omitida ? "Quitar omisión" : "Omitir esta fecha"}</summary>
        <form action={omitirFecha} className="formulario">{ocultos}
          {omitida ? <input type="hidden" name="motivo" value="" /> : <label className="campo">Motivo<textarea name="motivo" minLength={5} maxLength={1000} required placeholder="Ej. sucursal cerrada, trámite ya no aplica" /></label>}
          <button className="boton boton-secundario" type="submit">{omitida ? "Quitar omisión" : "Omitir"}</button>
        </form>
      </details>}
    </article>
  );
}
```

- [ ] **Step 4: `app/cumplimiento/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeEditarCompras, puedeVerCompras } from "@/lib/roles";
import { nombreFactura } from "@/lib/compras/facturas";
import { TIPOS, textoFrecuencia, ventanaCalendario } from "@/lib/cumplimiento";
import { ambitoTexto, leerFilas, leerObligaciones, proveedorTexto } from "../datos";
import { TarjetaFecha } from "./TarjetaFecha";

type Candidata = { id: string; serie: string | null; folio: string | null; uuid: string | null; uuid_manual: string | null; saldo: number };

export default async function DetalleObligacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  const hoy = hoyCalendarioMX(), { desde, hasta } = ventanaCalendario(hoy);
  const [[o], todas] = await Promise.all([leerObligaciones(supabase, id), leerFilas(supabase, desde, hasta, hoy)]);
  if (!o) notFound();
  const fechas = todas.filter((f) => f.origen === "obligacion" && f.referencia_id === id);
  const conFila = fechas.map((f) => f.fecha_id).filter((x): x is string => !!x);
  let candidatas: Candidata[] = [];
  if (o.con_pago && o.proveedor_id) {
    let q = supabase.from("facturas_saldo").select("id, serie, folio, uuid, uuid_manual, saldo").eq("tipo", "ingreso").neq("estado", "cancelada").eq("proveedor_id", o.proveedor_id);
    q = o.sucursal_id ? q.eq("sucursal_id", o.sucursal_id) : q.eq("rfc_receptor", o.razon_social_rfc!);
    candidatas = (await q.order("vence_el", { ascending: false }).limit(50).returns<Candidata[]>()).data ?? [];
  }
  const [{ data: ligadasC }, { data: ligadasK }, { data: evidencias }, { data: historial }] = await Promise.all([
    supabase.from("cumplimiento_fechas").select("factura_id").not("factura_id", "is", null).returns<{ factura_id: string }[]>(),
    supabase.from("compromiso_fechas").select("factura_id").not("factura_id", "is", null).returns<{ factura_id: string }[]>(),
    conFila.length
      ? supabase.from("cumplimiento_evidencias").select("id, nombre, clase, fecha_id").in("fecha_id", conFila).not("confirmado_en", "is", null).returns<{ id: string; nombre: string; clase: "foto" | "documento"; fecha_id: string }[]>()
      : Promise.resolve({ data: [] as { id: string; nombre: string; clase: "foto" | "documento"; fecha_id: string }[] }),
    supabase.from("cumplimiento_historial").select("id, evento, fecha").eq("obligacion_id", id).order("fecha", { ascending: false }).limit(20).returns<{ id: number; evento: string; fecha: string }[]>(),
  ]);
  const usadas = new Set([...(ligadasC ?? []), ...(ligadasK ?? [])].map((l) => l.factura_id));
  const facturas = candidatas.filter((x) => !usadas.has(x.id)).map((x) => ({ id: x.id, nombre: nombreFactura({ ...x, uuid: x.uuid ?? x.uuid_manual }), saldo: Number(x.saldo) }));
  const edita = puedeEditarCompras(perfil.rol);
  return <>
    <EncabezadoPagina titulo={o.nombre} descripcion={`${TIPOS[o.tipo]} · ${ambitoTexto(o)} · ${textoFrecuencia(o.frecuencia, o.inicio)}`}
      acciones={edita && <Link className="boton boton-secundario" href={`/cumplimiento/${id}/editar`}>Editar o ponerle fin</Link>} />
    <Aviso ok={ok} error={error} />
    <section className="seccion"><dl className="tarjeta-datos">
      {o.autoridad && <><dt>Autoridad o aseguradora</dt><dd>{o.autoridad}</dd></>}
      {o.folio && <><dt>Folio</dt><dd>{o.folio}</dd></>}
      <dt>Vigencia</dt><dd>Desde {fechaTexto(o.inicio)}{o.fin ? ` hasta ${fechaTexto(o.fin)}` : ", sin fecha de fin"}</dd>
      <dt>Pago</dt><dd>{o.con_pago ? `${proveedorTexto(o)}${o.monto_estimado ? ` · ${pesos(o.monto_estimado)} estimado` : ""}` : "No lleva pago"}</dd>
      {o.descripcion && <><dt>Descripción</dt><dd className="texto-libre">{o.descripcion}</dd></>}
      {o.notas && <><dt>Notas</dt><dd className="texto-libre">{o.notas}</dd></>}
    </dl></section>
    <section className="seccion"><h2>Fechas</h2><p className="saldo-nota">Un año atrás y 13 meses adelante.</p>
      {!fechas.length ? <p>No hay fechas en este periodo.</p> : <div className="tarjetas">{fechas.map((f) =>
        <TarjetaFecha key={f.vence} f={f} obligacion={id} hoy={hoy} edita={edita} conPago={o.con_pago} facturas={facturas}
          evidencias={(evidencias ?? []).filter((e) => e.fecha_id === f.fecha_id)} />)}</div>}
    </section>
    {!!historial?.length && <section className="seccion"><h2>Historial</h2><ul>{historial.map((h) => <li key={h.id}>{h.evento} · {fechaTexto(h.fecha.slice(0, 10))}</li>)}</ul></section>}
  </>;
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores. (`facturas_saldo` es `f.*` más saldo, así que expone `rfc_receptor`; Pagos ya lo lee de ahí.)

- [ ] **Step 6: Commit**

```bash
git add app/cumplimiento/FormObligacion.tsx app/cumplimiento/nueva "app/cumplimiento/[id]"
git commit -m "feat(cumplimiento): alta, edición y detalle con cierre por fecha"
```

---

### Task 7: Calendario unificado, franja de alertas y menú

**Files:**
- Create: `app/cumplimiento/CalendarioCumplimiento.tsx`
- Create: `app/cumplimiento/FranjaAlertas.tsx`
- Create: `app/cumplimiento/page.tsx`
- Create: `tests/cumplimientoCalendario.cjs`
- Delete: `app/activos/CalendarioMantenimiento.tsx`, `tests/activosCalendario.cjs`
- Modify: `app/activos/page.tsx:25-26`, `lib/roles.ts` (grupo "Proyectos y admin."), `lib/roles.test.ts:78-79`, `app/(app)/page.tsx`, `app/corporativo/page.tsx`, `package.json`
- Move: `docs/tecnica/activos-calendario.md` → `docs/tecnica/calendario-cumplimiento.md`

**Interfaces:**
- Consumes: Task 4 y Task 5 (`leerFilas`, `leerAlertas`); `mesDe`, `moverMes`, `semanasDelMes` de `@/lib/ventas/calendario`; `fechaActivo` de `@/lib/activos`.
- Produces: `CalendarioCumplimiento({filas, hoy, inicial: {origen, estado, ambito}, ambitos})`; `FranjaAlertas({alertas})` (no renderiza nada si todo está en cero).

- [ ] **Step 1: Escribir la prueba de render (falla)**

`tests/cumplimientoCalendario.cjs`:

```js
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const base=fs.readFileSync('tests/pagosVista.cjs','utf8');
const cargar=new Function('require',base.slice(0,base.indexOf('const {CalendarioPagos}'))+'return cargar;')(require);
const {CalendarioCumplimiento}=cargar('app/cumplimiento/CalendarioCumplimiento.tsx');
const {FranjaAlertas}=cargar('app/cumplimiento/FranjaAlertas.tsx');
const fila={origen:'obligacion',referencia_id:'o1',fecha_id:null,revision:0,titulo:'Licencia de funcionamiento',detalle:'Municipio',tipo:'licencia',sucursal_id:'s1',razon_social_rfc:null,ambito:'Zapopan-1',vence:'2026-10-10',fecha:'2026-10-10',frecuencia:'anual',estado:'vencida',falta_evidencia:false,falta_factura:false,factura_id:null,ruta:'/cumplimiento/o1#fecha-2026-10-10'};
const inicial={origen:'',estado:'vigentes',ambito:''};
test('calendario de cumplimiento: mes, vencidas, omitidas ocultas y enlace al detalle',()=>{
 const filas=[fila,{...fila,referencia_id:'o2',titulo:'Trámite omitido',estado:'omitida'},{...fila,referencia_id:'o3',titulo:'Trámite de noviembre',vence:'2026-11-01',fecha:'2026-11-01',estado:'pendiente'},
  {...fila,origen:'mantenimiento',referencia_id:'m1',titulo:'Horno de cocina',detalle:'Limpieza de horno',tipo:'preventivo',estado:'cumplida',vence:'2026-10-01',fecha:'2026-10-03',ruta:'/activos/a1#servicio-m1'}];
 const html=renderToStaticMarkup(React.createElement(CalendarioCumplimiento,{hoy:'2026-10-16',filas,inicial,ambitos:[{valor:'s:s1',nombre:'Sucursal · Zapopan-1'}]}));
 assert.match(html,/octubre de 2026/);assert.match(html,/Licencia de funcionamiento/);assert.match(html,/Vencida/);assert.match(html,/href="\/cumplimiento\/o1#fecha-2026-10-10"/);
 assert.match(html,/href="\/activos\/a1#servicio-m1"/);assert.match(html,/Mantenimiento de activos/);assert.match(html,/3 oct 2026/);
 assert.ok(!html.includes('Trámite omitido'));assert.ok(!html.includes('Trámite de noviembre'));
});
test('calendario de cumplimiento: el filtro inicial por origen se respeta',()=>{
 const html=renderToStaticMarkup(React.createElement(CalendarioCumplimiento,{hoy:'2026-10-16',filas:[fila,{...fila,origen:'mantenimiento',referencia_id:'m1',titulo:'Horno de cocina'}],inicial:{...inicial,origen:'mantenimiento'},ambitos:[]}));
 assert.match(html,/Horno de cocina/);assert.ok(!html.includes('Licencia de funcionamiento'));
});
test('franja de alertas: contadores con liga al filtro y nada si todo está en cero',()=>{
 const html=renderToStaticMarkup(React.createElement(FranjaAlertas,{alertas:{vencidas:2,porVencer:1,sinFactura:0,sinEvidencia:3}}));
 assert.match(html,/href="\/cumplimiento\?estado=vencida"/);assert.match(html,/2 vencidas/);assert.match(html,/1 por vencer/);assert.match(html,/3 sin evidencia/);assert.ok(!html.includes('sin factura'));
 assert.equal(renderToStaticMarkup(React.createElement(FranjaAlertas,{alertas:{vencidas:0,porVencer:0,sinFactura:0,sinEvidencia:0}})),'');
});
```

En `package.json`, reemplazar `tests/activosCalendario.cjs` por `tests/cumplimientoCalendario.cjs`.

Run: `node --test tests/cumplimientoCalendario.cjs`
Expected: FAIL `ENOENT ... CalendarioCumplimiento.tsx`.

- [ ] **Step 2: `app/cumplimiento/CalendarioCumplimiento.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { mesDe, moverMes, semanasDelMes } from "@/lib/ventas/calendario";
import { fechaActivo } from "@/lib/activos";
import { ESTADOS, FILTROS_ESTADO, ORIGENES, TIPOS, filtrarFilas, type FilaCumplimiento, type FiltroEstado, type TipoObligacion } from "@/lib/cumplimiento";

const tipoTexto = (f: FilaCumplimiento) => f.origen === "obligacion" ? TIPOS[f.tipo as TipoObligacion] : f.origen === "mantenimiento" ? (f.tipo === "preventivo" ? "Preventivo" : "Correctivo") : "Servicio";

/** Calendario mensual de todo lo que hay que cumplir. Las cumplidas se pintan en su fecha real; lo demás, en su vencimiento. */
export function CalendarioCumplimiento({ filas, hoy, inicial, ambitos }: {
  filas: FilaCumplimiento[]; hoy: string; inicial: { origen: string; estado: FiltroEstado; ambito: string }; ambitos: { valor: string; nombre: string }[];
}) {
  const [mes, setMes] = useState(mesDe(hoy));
  const [dia, setDia] = useState<string | null>(null);
  const [filtro, setFiltro] = useState(inicial);
  const periodo = `${mes.anio}-${String(mes.mes).padStart(2, "0")}`;
  const titulo = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(mes.anio, mes.mes - 1, 1)));
  const filtradas = filtrarFilas(filas, filtro);
  const delMes = filtradas.filter((f) => f.fecha.startsWith(periodo)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo) || a.referencia_id.localeCompare(b.referencia_id));
  const lista = dia ? delMes.filter((f) => f.fecha === dia) : delMes;
  const cambiarMes = (pasos: number) => { setMes(moverMes(mes, pasos)); setDia(null); };
  const cambiar = (c: keyof typeof filtro, v: string) => { setFiltro({ ...filtro, [c]: v } as typeof filtro); setDia(null); };
  return <section className="seccion activos-calendario" aria-label="Calendario de cumplimiento">
    <div className="calendario-cabecera"><button className="boton-icono" type="button" aria-label="Mes anterior" onClick={() => cambiarMes(-1)}><Icono nombre="izquierda" /></button><h2>{titulo}</h2><button className="boton-icono" type="button" aria-label="Mes siguiente" onClick={() => cambiarMes(1)}><Icono nombre="derecha" /></button></div>
    <div className="acciones">
      <button className="boton boton-secundario" type="button" onClick={() => { setMes(mesDe(hoy)); setDia(hoy); }}>Hoy</button>
      <button className="boton boton-secundario" type="button" onClick={() => setDia(null)} aria-pressed={!dia}>Ver todo el mes</button>
      <label className="campo">Origen<select value={filtro.origen} onChange={(e) => cambiar("origen", e.target.value)}><option value="">Todos</option>{Object.entries(ORIGENES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      <label className="campo">Estado<select value={filtro.estado} onChange={(e) => cambiar("estado", e.target.value)}>{Object.entries(FILTROS_ESTADO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      {ambitos.length > 0 && <label className="campo">Sucursal o razón social<select value={filtro.ambito} onChange={(e) => cambiar("ambito", e.target.value)}><option value="">Todas</option>{ambitos.map((a) => <option key={a.valor} value={a.valor}>{a.nombre}</option>)}</select></label>}
    </div>
    <p className="saldo-nota">{delMes.length} en el mes · {filtradas.filter((f) => f.estado === "vencida").length} vencidas con estos filtros. Las cumplidas aparecen en su fecha real; lo demás, en su vencimiento.</p>
    <div className="activos-mes">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span className="activos-semana" key={d}>{d}</span>)}{semanasDelMes(mes.anio, mes.mes).flat().map((fecha, i) => {
      if (!fecha) return <span key={`vacio-${i}`} aria-hidden="true" />;
      const eventos = delMes.filter((f) => f.fecha === fecha), vencidas = eventos.filter((f) => f.estado === "vencida").length;
      return <button className="activos-dia" key={fecha} type="button" aria-pressed={dia === fecha} aria-current={fecha === hoy ? "date" : undefined} aria-label={`${fechaActivo(fecha)}: ${eventos.length} pendientes de cumplimiento${vencidas ? `, ${vencidas} vencidas` : ""}`} data-vencido={vencidas > 0 || undefined} onClick={() => setDia(dia === fecha ? null : fecha)}><strong>{Number(fecha.slice(8))}</strong>{eventos.length > 0 && <><span>{eventos.length}</span><small className="activos-dia-nombres">{eventos.slice(0, 2).map((f) => f.titulo).join(" · ")}{eventos.length > 2 ? " · …" : ""}</small></>}</button>;
    })}</div>
    <h3 aria-live="polite">{dia ? `Del ${fechaActivo(dia)}` : "Del mes"} · {lista.length}</h3>
    {!lista.length ? <p>No hay nada {dia ? "para este día" : "para este mes"} con los filtros seleccionados.</p> : <div className="tarjetas">{lista.map((f) =>
      <article className="tarjeta" key={`${f.origen}-${f.referencia_id}-${f.vence}`} data-alerta={f.estado === "vencida" ? "si" : undefined}>
        <div className="tarjeta-encabezado"><div><h3><Link href={f.ruta}>{f.titulo}</Link></h3><p>{ORIGENES[f.origen]} · {tipoTexto(f)}{f.ambito ? ` · ${f.ambito}` : ""}</p></div>
          <span className="insignia" data-tono={ESTADOS[f.estado].tono}>{ESTADOS[f.estado].texto}</span></div>
        <dl className="tarjeta-datos">
          {f.detalle && <><dt>Detalle</dt><dd>{f.detalle}</dd></>}
          <dt>Fecha</dt><dd>{fechaActivo(f.fecha)}{f.fecha !== f.vence ? ` · vencía ${fechaActivo(f.vence)}` : ""}</dd>
          {(f.falta_evidencia || (f.falta_factura && f.estado !== "pendiente" && f.estado !== "por_vencer")) && <><dt>Falta</dt><dd>{[f.falta_evidencia && "evidencia", f.falta_factura && "factura"].filter(Boolean).join(" y ")}</dd></>}
        </dl>
      </article>)}</div>}
  </section>;
}
```

- [ ] **Step 3: `app/cumplimiento/FranjaAlertas.tsx`**

```tsx
import Link from "next/link";
import type { Alertas } from "@/lib/cumplimiento";

/** Contadores que no se deben perder de vista; cada uno abre el calendario con su filtro. Sin pendientes no se muestra. */
export function FranjaAlertas({ alertas }: { alertas: Alertas }) {
  const partes = [
    { n: alertas.vencidas, texto: "vencidas", estado: "vencida", tono: "peligro" },
    { n: alertas.porVencer, texto: "por vencer", estado: "por_vencer", tono: "aviso" },
    { n: alertas.sinFactura, texto: "cumplidas sin factura", estado: "cumplida_sin_factura", tono: "aviso" },
    { n: alertas.sinEvidencia, texto: "sin evidencia", estado: "sin_evidencia", tono: "aviso" },
  ].filter((p) => p.n > 0);
  if (!partes.length) return null;
  return <section className="seccion" aria-label="Alertas de cumplimiento"><h2>Cumplimiento</h2>
    <div className="acciones">{partes.map((p) => <Link key={p.estado} className="insignia" data-tono={p.tono} href={`/cumplimiento?estado=${p.estado}`}>{p.n} {p.texto}</Link>)}</div>
  </section>;
}
```

- [ ] **Step 4: `app/cumplimiento/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras, puedeVerCompras } from "@/lib/roles";
import { FILTROS_ESTADO, ORIGENES, contarAlertas, ventanaAlertas, ventanaCalendario, type FiltroEstado } from "@/lib/cumplimiento";
import { leerFilas, leerOpciones } from "./datos";
import { CalendarioCumplimiento } from "./CalendarioCumplimiento";
import { FranjaAlertas } from "./FranjaAlertas";

export default async function Cumplimiento({ searchParams }: { searchParams: Promise<{ origen?: string; estado?: string; ambito?: string; ok?: string; error?: string }> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  const hoy = hoyCalendarioMX(), cal = ventanaCalendario(hoy), al = ventanaAlertas(hoy);
  let filas, alertas, ambitos;
  try {
    const [f, a, o] = await Promise.all([leerFilas(supabase, cal.desde, cal.hasta, hoy), leerFilas(supabase, al.desde, al.hasta, hoy), leerOpciones(supabase)]);
    filas = f; alertas = contarAlertas(a); ambitos = o.ambitos;
  } catch { return <p className="aviso aviso-error">No se pudo consultar el calendario de cumplimiento. Revisa que la migración 20261029150000 esté aplicada y vuelve a intentar.</p>; }
  const inicial = {
    origen: p.origen && p.origen in ORIGENES ? p.origen : "",
    estado: (p.estado && p.estado in FILTROS_ESTADO ? p.estado : "vigentes") as FiltroEstado,
    ambito: p.ambito ?? "",
  };
  return <>
    <EncabezadoPagina titulo="Calendario de cumplimiento" descripcion="Permisos, licencias, protección civil, extintores, trámites fiscales, seguros, servicios fijos y mantenimiento de activos."
      acciones={puedeEditarCompras(perfil.rol) && <Link className="boton" href="/cumplimiento/nueva">Nueva obligación</Link>} />
    <Aviso ok={p.ok} error={p.error} />
    <FranjaAlertas alertas={alertas} />
    <CalendarioCumplimiento key={`${inicial.origen}:${inicial.estado}:${inicial.ambito}`} filas={filas} hoy={hoy} inicial={inicial} ambitos={ambitos} />
  </>;
}
```

- [ ] **Step 5: Retirar el calendario embebido de Activos**

Borrar `app/activos/CalendarioMantenimiento.tsx` y `tests/activosCalendario.cjs` (`git rm`). En `app/activos/page.tsx`:
- Quitar `import {CalendarioMantenimiento} from './CalendarioMantenimiento';`.
- Reemplazar la línea 25 (`<nav className="acciones">…</nav>`) por:

```tsx
 <nav className="acciones"><Link className="boton" href={`/cumplimiento?${new URLSearchParams({origen:'mantenimiento',...(filtros.sucursal?{ambito:`s:${filtros.sucursal}`}:{})})}`}>Calendario de cumplimiento</Link></nav>
```

- En la línea 26, reemplazar `{filtros.vista==='mantenimiento'?<CalendarioMantenimiento … />:<section className="seccion"><h2>Inventario</h2>` por `<section className="seccion"><h2>Inventario</h2>` y quitar el `}` final que cerraba el ternario (la línea termina en `</section></>;`).
- Quitar `vista` del tipo de `searchParams` y el `<input type="hidden" name="vista" …/>` del formulario.

- [ ] **Step 6: Menú y alertas en inicio**

`lib/roles.ts`, en `proyectos`:

```ts
    ...(puedeVerCompras(rol) ? [{ href: "/aperturas", texto: "Aperturas" }, { href: "/activos", texto: "Activos" }, { href: "/cumplimiento", texto: "Calendario de cumplimiento" }] : []),
```

`lib/roles.test.ts:78-79`:

```ts
  assert.deepEqual(grupo("admin", "Proyectos y admin."), ["/aperturas", "/activos", "/cumplimiento", "/administracion/usuarios"]);
  assert.deepEqual(grupo("corporativo", "Proyectos y admin."), ["/aperturas", "/activos", "/cumplimiento"]);
```

`app/(app)/page.tsx`: importar `import { FranjaAlertas } from "@/app/cumplimiento/FranjaAlertas";` y `import { leerAlertas } from "@/app/cumplimiento/datos";`. Después del `Promise.all` inicial agregar:

```tsx
  // Cumplimiento: si la consulta falla (migración pendiente), el inicio se muestra sin la franja.
  const alertasCumplimiento = puedeVerCompras(perfil.rol) ? await leerAlertas(supabase, hoyCalendarioMX()).catch(() => null) : null;
```

y justo después de `<Aviso ok={ok} error={error} />` (línea 82): `{alertasCumplimiento && <FranjaAlertas alertas={alertasCumplimiento} />}`.

`app/corporativo/page.tsx` (ya importa `hoyCalendarioMX` y define `const hoyCalendario = hoyCalendarioMX();` en la línea 21): agregar los dos imports de arriba, después de la línea 21 agregar

```tsx
  const alertasCumplimiento = await leerAlertas(supabase, hoyCalendario).catch(() => null);
```

y cambiar el `return` final por:

```tsx
  return <>{alertasCumplimiento && <FranjaAlertas alertas={alertasCumplimiento} />}<PanelVistaGeneral fecha={fecha} hoy={hoy} filas={filas} efectivo={efectivo} proveedoresResumen={proveedoresResumen}
    ventas={<DashboardVentasInicio supabase={supabase} rol={perfil.rol} mes={ventas_mes} sucursal={ventas_sucursal} porDefecto={null} ruta="/corporativo" fecha={fecha}/>} /></>;
```

- [ ] **Step 7: Documento técnico**

`git mv docs/tecnica/activos-calendario.md docs/tecnica/calendario-cumplimiento.md` y reemplazar su contenido:

```markdown
# Calendario de cumplimiento

`/cumplimiento` muestra en un calendario mensual obligaciones (permisos, licencias, protección civil, extintores, trámites fiscales y seguros), compromisos fijos que comprueban servicio y mantenimientos de activos. Todo sale de `cumplimiento_en_rango(desde, hasta, hoy)`: las cumplidas se pintan en su fecha real y lo demás en su vencimiento. Filtros por origen, estado y sucursal o razón social; Activos enlaza con el origen `mantenimiento` ya elegido.

Las obligaciones se cierran en su detalle con al menos una foto y un PDF; si llevan pago, quedan *cumplidas sin factura* hasta ligarla. Compromisos y mantenimientos se cierran en sus pantallas. La franja de alertas del inicio y del calendario usa la misma ventana que los avisos de n8n (`docs/n8n-cumplimiento.md`). Migración: `20261029150000_calendario_cumplimiento.sql`.
```

- [ ] **Step 8: Correr pruebas y tipos**

Run: `node --test tests/cumplimientoCalendario.cjs && node --experimental-strip-types --test lib/roles.test.ts && npm run typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 9: Commit**

```bash
git add -A app/cumplimiento app/activos "app/(app)/page.tsx" app/corporativo/page.tsx lib/roles.ts lib/roles.test.ts tests/cumplimientoCalendario.cjs tests/activosCalendario.cjs docs/tecnica package.json
git commit -m "feat(cumplimiento): calendario unificado, franja de alertas y menú"
```

---

### Task 8: Endpoints para n8n

**Files:**
- Create: `app/api/cumplimiento/cuenta.ts`
- Create: `app/api/cumplimiento/avisos/route.ts`
- Create: `app/api/cumplimiento/avisos/entregados/route.ts`
- Modify: `lib/rutasPublicas.ts`, `lib/rutasPublicas.test.ts`, `.env.example`

**Interfaces:**
- Consumes: `llaveValida`, `leerEntregados`, `agruparAvisos`, tipos de Task 4; RPC `avisos_cumplimiento`, `registrar_avisos_cumplimiento`, `correos_avisos_cumplimiento`; `hoyMX` de `@/lib/formato`.
- Produces:
  - `GET /api/cumplimiento/avisos?canal=correo|chat` → `200 {hoy, canal, destinatarios: string[], total: number, avisos: {vencida: Aviso[], por_vencer: Aviso[], sin_factura: Aviso[]}}`; `401` sin llave; `400` canal inválido; `500` con `{error}`.
  - `POST /api/cumplimiento/avisos/entregados` body `{canal, claves}` → `200 {registrados: number}`; `401`; `400 {error}`.

- [ ] **Step 1: Prueba de ruta pública (falla)**

En `lib/rutasPublicas.test.ts`, agregar `"/api/cumplimiento/avisos"` y `"/api/cumplimiento/avisos/entregados"` a la lista de rutas sin sesión, y `"/api/cumplimiento"` y `"/cumplimiento"` a la lista que **sí** requiere sesión.

Run: `node --experimental-strip-types --test lib/rutasPublicas.test.ts`
Expected: FAIL en `/api/cumplimiento/avisos`.

- [ ] **Step 2: Abrir la ruta en `lib/rutasPublicas.ts`**

```ts
const CON_PREFIJO = ["/login", "/api/reporte-semanal", "/api/reporte-diario", "/api/reporte-mensual", "/api/cumplimiento/avisos"];
```

y en el comentario agregar "y los avisos de cumplimiento para n8n". Run de nuevo: PASS.

- [ ] **Step 3: `app/api/cumplimiento/cuenta.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { llaveValida } from "@/lib/cumplimiento";

/** Valida `x-api-key` contra CUMPLIMIENTO_API_KEY y corre `fn` con la sesión de la cuenta de automatización
 * (REPORTE_CUENTA_EMAIL/PASSWORD, rol admin): RLS normal, sin llave de servicio. */
export async function conCuentaAutomatizacion(req: NextRequest, fn: (supabase: SupabaseClient) => Promise<NextResponse>): Promise<NextResponse> {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.CUMPLIMIENTO_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const email = process.env.REPORTE_CUENTA_EMAIL, password = process.env.REPORTE_CUENTA_PASSWORD;
  if (!email || !password) return NextResponse.json({ error: "Falta configurar la cuenta de automatización (REPORTE_CUENTA_EMAIL/PASSWORD)" }, { status: 500 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim());
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: `No se pudo autenticar la cuenta de automatización: ${error.message}` }, { status: 500 });
  try { return await fn(supabase); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 }); }
  finally { await supabase.auth.signOut(); }
}
```

- [ ] **Step 4: `app/api/cumplimiento/avisos/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { agruparAvisos, type AvisoCumplimiento } from "@/lib/cumplimiento";
import { hoyMX } from "@/lib/formato";
import { conCuentaAutomatizacion } from "../cuenta";

export const dynamic = "force-dynamic";

/** Lo que n8n debe avisar hoy por un canal (aún no entregado por ese canal), agrupado, con ligas absolutas y los correos de los admins. */
export async function GET(req: NextRequest) {
  return conCuentaAutomatizacion(req, async (supabase) => {
    const canal = req.nextUrl.searchParams.get("canal");
    if (canal !== "correo" && canal !== "chat") return NextResponse.json({ error: "Indica canal=correo o canal=chat." }, { status: 400 });
    const hoy = hoyMX(), base = (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/$/, "");
    const [avisos, correos] = await Promise.all([
      supabase.rpc("avisos_cumplimiento", { p_hoy: hoy, p_canal: canal }),
      supabase.rpc("correos_avisos_cumplimiento"),
    ]);
    if (avisos.error) throw new Error(avisos.error.message);
    if (correos.error) throw new Error(correos.error.message);
    const lista = ((avisos.data ?? []) as Omit<AvisoCumplimiento, "url">[]).map((a) => ({ ...a, url: `${base}${a.ruta}` }));
    return NextResponse.json({ hoy, canal, destinatarios: (correos.data ?? []) as string[], total: lista.length, avisos: agruparAvisos(lista) });
  });
}
```

- [ ] **Step 5: `app/api/cumplimiento/avisos/entregados/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { leerEntregados } from "@/lib/cumplimiento";
import { conCuentaAutomatizacion } from "../../cuenta";

export const dynamic = "force-dynamic";

/** n8n confirma lo que sí salió por un canal. Repetir el mismo POST no duplica nada. */
export async function POST(req: NextRequest) {
  return conCuentaAutomatizacion(req, async (supabase) => {
    const r = leerEntregados(await req.json().catch(() => null));
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    const { data, error } = await supabase.rpc("registrar_avisos_cumplimiento", { p_claves: r.claves, p_canal: r.canal });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ registrados: Number(data ?? 0) });
  });
}
```

- [ ] **Step 6: `.env.example`**

Agregar después de la sección de reportes (o al final):

```bash
# Avisos del calendario de cumplimiento para n8n: header x-api-key. Usa la cuenta REPORTE_CUENTA_EMAIL (debe ser admin).
CUMPLIMIENTO_API_KEY=
```

- [ ] **Step 7: Pruebas y tipos**

Run: `node --experimental-strip-types --test lib/rutasPublicas.test.ts lib/cumplimiento.test.ts && npm run typecheck`
Expected: PASS y sin errores.

- [ ] **Step 8: Commit**

```bash
git add app/api/cumplimiento lib/rutasPublicas.ts lib/rutasPublicas.test.ts .env.example
git commit -m "feat(cumplimiento): endpoints de avisos y entregados para n8n"
```

---

### Task 9: Flujo de n8n y guía

**Files:**
- Create: `docs/n8n/cumplimiento-avisos.json`
- Create: `docs/n8n/cumplimiento-avisos-error.json`
- Create: `docs/n8n-cumplimiento.md`
- Create: `tests/n8nCumplimiento.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: endpoints de Task 8. En n8n: variable `PORTAL_URL`, credencial *Header Auth* `Portal cumplimiento` (`x-api-key`), credencial SMTP `Correo avisos`, variable `GCHAT_WEBHOOK_URL`.
- Produces: flujo `cumplimiento-avisos` (8:00 America/Mexico_City diario) y flujo de error.

- [ ] **Step 1: Prueba del JSON (falla)**

`tests/n8nCumplimiento.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));

test('n8n cumplimiento: nodos, horario, canales y sin secretos',()=>{
 const wf=leer('docs/n8n/cumplimiento-avisos.json'),texto=JSON.stringify(wf);
 const nombres=wf.nodes.map(n=>n.name);
 for(const n of ['Cada mañana','Avisos por correo','¿Hay avisos por correo?','Armar correo','Enviar correo','Confirmar correo','Avisos por chat','¿Hay avisos por chat?','Armar mensaje','Enviar a Google Chat','Confirmar chat'])
  assert.ok(nombres.includes(n),n);
 assert.equal(wf.settings.timezone,'America/Mexico_City');
 assert.match(texto,/canal=correo/);assert.match(texto,/canal=chat/);assert.match(texto,/avisos\/entregados/);
 assert.ok(!/x-api-key"\s*:\s*"[^{]/.test(texto),'la llave va en una credencial, no en el JSON');
 assert.ok(!/chat\.googleapis\.com\/v1\/spaces\/[A-Za-z0-9]/.test(texto),'el webhook va en una variable');
 for(const [origen,destinos] of Object.entries(wf.connections))
  for(const salida of destinos.main) for(const d of salida) assert.ok(nombres.includes(d.node),`${origen} → ${d.node}`);
 const error=leer('docs/n8n/cumplimiento-avisos-error.json');
 assert.ok(error.nodes.some(n=>n.type==='n8n-nodes-base.errorTrigger'));
});
```

Agregar `tests/n8nCumplimiento.test.mjs` al script `test`.

Run: `node --test tests/n8nCumplimiento.test.mjs` → FAIL (`ENOENT`).

- [ ] **Step 2: `docs/n8n/cumplimiento-avisos.json`**

```json
{
  "name": "cumplimiento-avisos",
  "settings": { "timezone": "America/Mexico_City", "executionOrder": "v1", "errorWorkflow": "" },
  "nodes": [
    { "id": "1", "name": "Cada mañana", "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [0, 200],
      "parameters": { "rule": { "interval": [{ "field": "cronExpression", "expression": "0 8 * * *" }] } } },
    { "id": "2", "name": "Avisos por correo", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [240, 100],
      "parameters": { "method": "GET", "url": "={{ $vars.PORTAL_URL }}/api/cumplimiento/avisos?canal=correo", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth", "options": { "timeout": 30000 } },
      "credentials": { "httpHeaderAuth": { "name": "Portal cumplimiento" } } },
    { "id": "3", "name": "¿Hay avisos por correo?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [480, 100],
      "parameters": { "conditions": { "options": { "caseSensitive": true, "typeValidation": "strict" }, "combinator": "and",
        "conditions": [{ "leftValue": "={{ $json.total }}", "rightValue": 0, "operator": { "type": "number", "operation": "gt" } }] } } },
    { "id": "4", "name": "Armar correo", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [720, 100],
      "parameters": { "jsCode": "const d = $input.first().json;\nconst esc = (s) => String(s ?? '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]));\nconst fecha = (f) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z'));\nconst cuando = (a) => a.tipo_aviso === 'vencida' ? `vencida hace ${-a.dias} día(s)` : a.tipo_aviso === 'sin_factura' ? 'cumplida, falta factura' : a.dias === 0 ? 'vence hoy' : `vence en ${a.dias} día(s)`;\nconst grupo = (titulo, lista) => lista.length ? `<h3>${titulo} (${lista.length})</h3><ul>` + lista.map((a) => `<li><a href=\"${esc(a.url)}\">${esc(a.titulo)}</a> · ${esc(a.ambito)} · ${fecha(a.vence)} · <strong>${cuando(a)}</strong>${a.detalle ? ` · ${esc(a.detalle)}` : ''}</li>`).join('') + '</ul>' : '';\nconst html = `<p>Resumen del calendario de cumplimiento del ${fecha(d.hoy)}.</p>` + grupo('Vencidas', d.avisos.vencida) + grupo('Por vencer', d.avisos.por_vencer) + grupo('Cumplidas sin factura', d.avisos.sin_factura);\nconst claves = [...d.avisos.vencida, ...d.avisos.por_vencer, ...d.avisos.sin_factura].map((a) => a.clave);\nreturn [{ json: { para: d.destinatarios.join(','), asunto: `Cumplimiento: ${d.avisos.vencida.length} vencidas, ${d.avisos.por_vencer.length} por vencer`, html, claves } }];" } },
    { "id": "5", "name": "Enviar correo", "type": "n8n-nodes-base.emailSend", "typeVersion": 2.1, "position": [960, 100],
      "parameters": { "fromEmail": "={{ $vars.CORREO_REMITENTE }}", "toEmail": "={{ $json.para }}", "subject": "={{ $json.asunto }}", "emailFormat": "html", "html": "={{ $json.html }}", "options": {} },
      "credentials": { "smtp": { "name": "Correo avisos" } } },
    { "id": "6", "name": "Confirmar correo", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1200, 100],
      "parameters": { "method": "POST", "url": "={{ $vars.PORTAL_URL }}/api/cumplimiento/avisos/entregados", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ canal: 'correo', claves: $('Armar correo').first().json.claves }) }}", "options": {} },
      "credentials": { "httpHeaderAuth": { "name": "Portal cumplimiento" } } },
    { "id": "7", "name": "Avisos por chat", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [240, 320],
      "parameters": { "method": "GET", "url": "={{ $vars.PORTAL_URL }}/api/cumplimiento/avisos?canal=chat", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth", "options": { "timeout": 30000 } },
      "credentials": { "httpHeaderAuth": { "name": "Portal cumplimiento" } } },
    { "id": "8", "name": "¿Hay avisos por chat?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [480, 320],
      "parameters": { "conditions": { "options": { "caseSensitive": true, "typeValidation": "strict" }, "combinator": "and",
        "conditions": [{ "leftValue": "={{ $json.total }}", "rightValue": 0, "operator": { "type": "number", "operation": "gt" } }] } } },
    { "id": "9", "name": "Armar mensaje", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [720, 320],
      "parameters": { "jsCode": "const d = $input.first().json;\nconst linea = (a) => `• <${a.url}|${a.titulo}> · ${a.ambito ?? ''} · ${a.tipo_aviso === 'vencida' ? `vencida hace ${-a.dias} día(s)` : a.tipo_aviso === 'sin_factura' ? 'falta factura' : a.dias === 0 ? 'vence hoy' : `vence en ${a.dias} día(s)`}`;\nconst bloque = (t, l) => l.length ? `*${t} (${l.length})*\\n` + l.slice(0, 15).map(linea).join('\\n') + (l.length > 15 ? `\\n… y ${l.length - 15} más en el portal` : '') : '';\nconst text = [`*Cumplimiento ${d.hoy}*`, bloque('Vencidas', d.avisos.vencida), bloque('Por vencer', d.avisos.por_vencer), bloque('Cumplidas sin factura', d.avisos.sin_factura)].filter(Boolean).join('\\n\\n');\nconst claves = [...d.avisos.vencida, ...d.avisos.por_vencer, ...d.avisos.sin_factura].map((a) => a.clave);\nreturn [{ json: { text, claves } }];" } },
    { "id": "10", "name": "Enviar a Google Chat", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [960, 320],
      "parameters": { "method": "POST", "url": "={{ $vars.GCHAT_WEBHOOK_URL }}", "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ text: $json.text }) }}", "options": {} } },
    { "id": "11", "name": "Confirmar chat", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1200, 320],
      "parameters": { "method": "POST", "url": "={{ $vars.PORTAL_URL }}/api/cumplimiento/avisos/entregados", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ canal: 'chat', claves: $('Armar mensaje').first().json.claves }) }}", "options": {} },
      "credentials": { "httpHeaderAuth": { "name": "Portal cumplimiento" } } }
  ],
  "connections": {
    "Cada mañana": { "main": [[{ "node": "Avisos por correo", "type": "main", "index": 0 }, { "node": "Avisos por chat", "type": "main", "index": 0 }]] },
    "Avisos por correo": { "main": [[{ "node": "¿Hay avisos por correo?", "type": "main", "index": 0 }]] },
    "¿Hay avisos por correo?": { "main": [[{ "node": "Armar correo", "type": "main", "index": 0 }], []] },
    "Armar correo": { "main": [[{ "node": "Enviar correo", "type": "main", "index": 0 }]] },
    "Enviar correo": { "main": [[{ "node": "Confirmar correo", "type": "main", "index": 0 }]] },
    "Avisos por chat": { "main": [[{ "node": "¿Hay avisos por chat?", "type": "main", "index": 0 }]] },
    "¿Hay avisos por chat?": { "main": [[{ "node": "Armar mensaje", "type": "main", "index": 0 }], []] },
    "Armar mensaje": { "main": [[{ "node": "Enviar a Google Chat", "type": "main", "index": 0 }]] },
    "Enviar a Google Chat": { "main": [[{ "node": "Confirmar chat", "type": "main", "index": 0 }]] }
  }
}
```

Las claves de confirmación salen del nodo "Armar …", no de la respuesta del envío: si el envío falla, la ejecución se detiene antes de confirmar y al día siguiente se vuelven a mandar.

- [ ] **Step 3: `docs/n8n/cumplimiento-avisos-error.json`**

```json
{
  "name": "cumplimiento-avisos-error",
  "settings": { "timezone": "America/Mexico_City", "executionOrder": "v1" },
  "nodes": [
    { "id": "1", "name": "Al fallar", "type": "n8n-nodes-base.errorTrigger", "typeVersion": 1, "position": [0, 0], "parameters": {} },
    { "id": "2", "name": "Avisar falla", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [240, 0],
      "parameters": { "method": "POST", "url": "={{ $vars.GCHAT_WEBHOOK_URL }}", "sendBody": true, "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ text: `⚠️ Falló el aviso de cumplimiento en el nodo \"${$json.execution.lastNodeExecuted}\": ${$json.execution.error.message}. Se reintenta mañana; revisa ${$json.execution.url}` }) }}", "options": {} } }
  ],
  "connections": { "Al fallar": { "main": [[{ "node": "Avisar falla", "type": "main", "index": 0 }]] } }
}
```

- [ ] **Step 4: `docs/n8n-cumplimiento.md`**

```markdown
# Avisos del calendario de cumplimiento en n8n

Cada día a las 8:00 (Ciudad de México) n8n pregunta al portal qué avisar y lo manda por correo a los administradores y al espacio de Google Chat. Después confirma lo que sí salió; así nada se repite el mismo día y lo que falló se reintenta mañana.

## Qué avisa
- **Vencidas** y **cumplidas sin factura**: todos los días hasta resolverse.
- **Por vencer**: semanal y quincenal 2 días antes y el día; mensual y bimestral 7, 2 y el día; anual 60, 30, 7 y el día. Mantenimientos como mensual.

## Configuración (una vez)
1. Vercel → Environment Variables: `CUMPLIMIENTO_API_KEY` (cadena larga aleatoria). La cuenta `REPORTE_CUENTA_EMAIL` debe tener rol **admin** en Usuarios y sucursales.
2. Google Chat → espacio del equipo → *Apps e integraciones* → *Webhooks* → crear "Cumplimiento" y copiar la URL.
3. n8n → *Variables*: `PORTAL_URL` (ej. `https://dodo-money-j31t.vercel.app`, sin `/` final), `GCHAT_WEBHOOK_URL` (la URL del paso 2), `CORREO_REMITENTE`.
4. n8n → *Credentials*: *Header Auth* llamada `Portal cumplimiento` con nombre `x-api-key` y el valor de `CUMPLIMIENTO_API_KEY`; *SMTP* llamada `Correo avisos` con la cuenta remitente.
5. Importar `docs/n8n/cumplimiento-avisos-error.json` y luego `docs/n8n/cumplimiento-avisos.json`. En *Settings* del segundo, elegir el primero como *Error workflow*. Activar ambos.

## Probar
- `curl -H "x-api-key: …" "$PORTAL_URL/api/cumplimiento/avisos?canal=correo"` debe responder `{hoy, destinatarios, total, avisos}`.
- Ejecutar el flujo a mano: llega el correo, el mensaje de Chat, y una segunda ejecución el mismo día ya no envía nada (`total: 0`).

## Si algo falla
El flujo de error publica en el mismo espacio de Chat el nodo y el mensaje. Como no se confirmó, al día siguiente sale de nuevo. `401` = llave distinta; `500` con "cuenta de automatización" = revisar `REPORTE_CUENTA_*`; error "Solo administración" = la cuenta no es admin.
```

- [ ] **Step 5: Correr la prueba**

Run: `node --test tests/n8nCumplimiento.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/n8n docs/n8n-cumplimiento.md tests/n8nCumplimiento.test.mjs package.json
git commit -m "feat(cumplimiento): flujo de n8n para correo y Google Chat con guía"
```

---

### Task 10: Verificación completa y PR

**Files:** ninguno nuevo (solo correcciones que salgan).

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run test:git-policy && npm run typecheck && npm run build`
Expected: todo en verde; `next build` lista `/cumplimiento`, `/cumplimiento/[id]`, `/api/cumplimiento/avisos`.

- [ ] **Step 2: Revisión en navegador (sin migración en producción, con datos de prueba locales si hay Supabase local; si no, solo render)**

Arrancar con `preview_start` el servidor de `.claude/launch.json` (si no existe, crearlo con `npm run dev`, puerto 3000) y revisar en escritorio y en `mobile`:
- `/cumplimiento`: calendario, filtros, tarjetas sin tablas anchas, franja.
- `/cumplimiento/nueva`: cambiar frecuencia actualiza el texto de ayuda; "¿Lleva pago?" muestra proveedor.
- `/activos`: el botón lleva a `/cumplimiento?origen=mantenimiento`.
- Consola sin errores. Tomar captura como evidencia.

- [ ] **Step 3: Revisar el diff completo**

Run: `git diff origin/main...HEAD --stat` y leer el diff entero (AGENTS.md). Confirmar que no hay archivos ajenos, secretos ni `.env`.

- [ ] **Step 4: Push y PR**

```bash
git push -u origin feat/calendario-cumplimiento
gh pr create --base main --title "Calendario de cumplimiento con alertas y avisos por n8n" --body-file -
```

Cuerpo del PR: resumen, migración a ejecutar (`supabase/migrations/20261029150000_calendario_cumplimiento.sql` y luego `supabase/pruebas/20261029150000_calendario_cumplimiento.sql`, que debe terminar en `PRUEBAS OK`), variables nuevas (`CUMPLIMIENTO_API_KEY`), pasos de n8n (`docs/n8n-cumplimiento.md`), y que no se fusiona antes del resultado de Sebastián. Terminar con la línea de atribución.

- [ ] **Step 5: Entregar a Sebastián**

Pasar el orden de ejecución en Supabase y esperar su "PRUEBAS OK" antes de fusionar. Revisar que `Historial válido` y `Pruebas y tipos` estén en verde.

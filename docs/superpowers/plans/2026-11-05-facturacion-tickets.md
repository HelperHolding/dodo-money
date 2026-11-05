# Autofacturación de tickets — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página pública `/facturar` donde el cliente encuentra su ticket de Dodo Pizza (fecha, hora, total), captura sus datos fiscales y obtiene un CFDI 4.0 timbrado por Facturapi; más una pantalla en Finanzas para consultar, cancelar, reenviar y exportar lo facturado.

**Architecture:**
- Las reglas de qué ticket se puede facturar viven en SQL, en funciones `security definer` que solo ejecuta `service_role`. La base garantiza "un ticket, una factura" con un índice único parcial.
- El servidor Next (server actions con `crearClienteAdmin`) orquesta reservar → timbrar en Facturapi → confirmar o liberar. Esa orquestación vive en un módulo puro con dependencias inyectadas para poder probarla.
- Facturapi guarda el CSD, sella, timbra, genera el PDF y envía el correo. El repo nunca ve el CSD.

**Tech Stack:** Next 15 (App Router, server actions), Supabase (Postgres, RLS), PGlite para pruebas SQL, `node --test --experimental-strip-types`, API REST de Facturapi v2 con `fetch`, sin SDK.

**Spec:** `docs/superpowers/specs/2026-11-05-facturacion-tickets-design.md`

## Global Constraints

- Emisor único en esta fase: Helper Comercializadora Master, RFC `HCM260306B93`. Su sucursal es la que tenga `dodois_unit_id = '11f187558e757f53b0570d952420b810'` (Zapopan-1, Mariano Otero). El emisor se fija en la tabla `facturacion_sucursales`, **no** se deduce de `razon_social_sucursales`: en la base, Zapopan-1 aparece ligada a CMS230321FI8 (SITRU) y el ticket dice Helper.
- CFDI 4.0, moneda MXN, método `PUE`, IVA 16 % incluido en el precio.
- Plazo: solo pedidos cuya `fecha` cae en el mes calendario en curso, en hora de Ciudad de México (`America/Mexico_City`).
- No se facturan los pedidos con `estado <> 'entregado'`, `tipo = 'personal'`, `agregador is not null` o `pago = 'otro'`.
- RFC genéricos prohibidos: `XAXX010101000` y `XEXX010101000`.
- Uso del CFDI: solo `G03` (Gastos en general) y `S01` (Sin efectos fiscales).
- Forma de pago: efectivo → `01`. Tarjeta o en línea → el cliente elige crédito `04` o débito `28`.
- Claves SAT: producto `90101501` y unidad `E48`. Van como constantes en `lib/facturacion/conceptos.ts`; Sebastián las confirma con el contador antes de pasar a producción.
- Ventana de búsqueda: ±3 minutos sobre `pedidos.hora`, con `total` exacto.
- Anti-abuso: máximo 10 búsquedas por IP (guardada como hash SHA-256) cada 10 minutos.
- Llave `FACTURAPI_KEY` solo en el servidor (`sk_test_…` en Preview y la real en Production). Nunca en el cliente, en el repo ni en el chat.
- Convención del repo: los módulos de `lib/` no se importan **valores** entre sí, solo tipos. Los catálogos y dependencias que vienen de otro módulo se pasan como parámetro desde `app/`.
- Pruebas: `node --experimental-strip-types --test`. Cada archivo de prueba nuevo se agrega a la lista del script `test` en `package.json`.
- AGENTS.md: rama `feat/facturacion-tickets`, PR hacia `main`, sin commits vacíos ni omitir hooks. La migración la ejecuta Sebastián en producción y reporta el resultado **antes** de publicar `/facturar`.
- Textos de UI en español de México, sin anglicismos. Listas de oficina en tarjetas, no en tablas anchas.

## Review Focus

1. **Doble clic o dos pestañas en "Facturar".** Debe salir una sola factura. Lo cubre la Task 1 (índice único y reserva doble en PGlite) y la Task 5 (el orquestador no llama a Facturapi si la reserva falla).
2. **Timeout de Facturapi después de timbrar.** El reintento no debe timbrar otra vez. Lo cubre la Task 5 (fila `en_proceso` vieja → se busca por `external_id` y se confirma).
3. **Hora del ticket en otro formato o redondeada (5:36 PM contra 17:35 en la base).** Debe encontrarse el ticket. Lo cubren la Task 1 (±3 minutos) y la Task 6 (el `<input type="time">` manda `HH:MM` en 24 h).
4. **Ticket del mes pasado capturado el día 1 a las 00:30.** Debe rechazarse por plazo usando la hora de México, no UTC. Lo cubre la Task 1 (`facturacion_dia_mx('2026-11-01 05:30Z')` da 2026-10-31).
5. **Nombre con "S.A. de C.V." o en minúsculas.** Facturapi y el SAT lo rechazan. El cliente debe ver un mensaje claro y poder corregir, y el ticket queda libre para reintentar. Lo cubren la Task 2 (normalización y aviso del régimen de capital) y la Task 5 (rechazo → `liberar`).

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261106120000_facturacion_clientes.sql` | Tablas `facturacion_sucursales`, `facturas_clientes` y `facturacion_intentos`; funciones de búsqueda, reserva, confirmación, liberación y cancelación; RLS y permisos |
| `supabase/pruebas/20261106120000_facturacion_clientes.sql` | Prueba de solo catálogo para que Sebastián la corra en producción (termina en `PRUEBAS OK`) |
| `tests/facturacionClientes.test.mjs` | Comportamiento SQL en PGlite |
| `lib/facturacion/reglas.ts` (+ `.test.ts`) | Validación y normalización de datos fiscales, forma de pago, usos del CFDI y mensajes de búsqueda |
| `lib/facturacion/conceptos.ts` (+ `.test.ts`) | Productos del pedido → conceptos de Facturapi; cuadre al centavo |
| `lib/facturacion/facturapi.ts` (+ `.test.ts`) | Cliente HTTP de Facturapi con `fetch` inyectable |
| `lib/facturacion/timbrar.ts` (+ `.test.ts`) | Orquestación reservar → timbrar → confirmar o liberar, con dependencias inyectadas |
| `lib/facturacion/excel.ts` (+ `.test.ts`) | Hoja del Excel mensual para el contador |
| `app/facturar/page.tsx`, `Flujo.tsx`, `acciones.ts`, `facturar.module.css` | Portal público |
| `app/facturar/descargar/route.ts` | Descarga del PDF o XML con un token de un solo ticket |
| `app/finanzas/facturacion/page.tsx`, `acciones.ts`, `excel/route.ts` | Pantalla de oficina |
| `lib/rutasPublicas.ts` (+ test) | Agrega `/facturar` |
| `app/finanzas/page.tsx` | Botón "Facturación de tickets" |
| `package.json` | Agrega las pruebas nuevas al script `test` |

---

### Task 1: Migración SQL y pruebas en PGlite

**Files:**
- Create: `supabase/migrations/20261106120000_facturacion_clientes.sql`
- Create: `supabase/pruebas/20261106120000_facturacion_clientes.sql`
- Create: `tests/facturacionClientes.test.mjs`
- Modify: `package.json` (script `test`: agregar `tests/facturacionClientes.test.mjs`)

**Interfaces:**
- Produces (todas `security definer`, `search_path=public`, `execute` solo para `service_role`, salvo donde se indica):
  - `facturacion_buscar_ticket(p_ip text, p_sucursal uuid, p_fecha date, p_hora time, p_total numeric)` regresa `table(resultado text, pedido_id text, fecha date, hora time, total numeric, pago text, productos jsonb, factura_id uuid, correo text)`. `resultado` puede ser `ok`, `limite`, `fuera_de_plazo`, `no_encontrado`, `varios`, `no_facturable` o `facturado`. `productos` es un arreglo de `{nombre, precio}`. `correo` viene enmascarado (`ju***@gmail.com`) solo cuando el resultado es `facturado`.
  - `facturacion_reservar(p_pedido text, p_datos jsonb)` regresa `uuid` (id de `facturas_clientes`). `p_datos` trae las llaves `rfc`, `nombre`, `regimen_fiscal`, `codigo_postal`, `uso_cfdi`, `correo` y `forma_pago`. Si ya hay una fila activa, lanza `'YA_FACTURADO'` o `'EN_PROCESO:<id>:<epoch de creada>'`. Si el pedido ya no es facturable, lanza `'NO_FACTURABLE:<motivo>'`.
  - `facturacion_confirmar(p_id uuid, p_facturapi_id text, p_uuid text, p_serie text, p_folio integer, p_subtotal numeric, p_iva numeric)` regresa `void`.
  - `facturacion_liberar(p_id uuid, p_error text)` regresa `void`.
  - `facturacion_para_descarga(p_id uuid, p_token uuid)` regresa `text` (el `facturapi_id` si la factura está timbrada y el token coincide; si no, `null`).
  - `facturacion_registrar_cancelacion(p_id uuid, p_motivo text)` regresa `void`. **Esta la ejecuta `authenticated`**, y solo funciona si `mi_rol() = 'admin'`.

- [ ] **Step 1: Escribir la prueba PGlite (falla porque la migración no existe)**

```js
// tests/facturacionClientes.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261106120000_facturacion_clientes.sql');
const pruebas=load('supabase/pruebas/20261106120000_facturacion_clientes.sql');

// Stubs que copian columnas, enums y CHECK reales (0001, 0004, 0006, 0007, 0068, 20261020180000).
const S='00000000-0000-0000-0000-0000000000a1',ADMIN='00000000-0000-0000-0000-0000000000ad',CORP='00000000-0000-0000-0000-0000000000c0',GER='00000000-0000-0000-0000-0000000000ae';
const BASE=`create role service_role;create role anon;create role authenticated;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create type rol_usuario as enum('cajero','encargado','gerente','admin');alter type rol_usuario add value 'corporativo';
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null unique,dodois_unit_id text unique);
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null default 'cajero',sucursal_id uuid references sucursales(id),activo boolean not null default true);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path=public as $$select rol from perfiles where id=auth.uid() and activo$$;
 create table importaciones_ventas(id uuid primary key default gen_random_uuid());
 create table pedidos(dodo_id text primary key,sucursal_id uuid not null references sucursales(id),fecha date not null,hora time not null,
  pago text not null check (pago in ('efectivo','tarjeta','en_linea','otro')),tipo text not null check (tipo in ('en_tienda','entrega','personal')),
  estado text not null check (estado in ('entregado','cancelado')),total numeric(12,2) not null,agregador text,importacion_id uuid not null references importaciones_ventas(id));
 create table pedido_productos(pedido_id text not null references pedidos(dodo_id) on delete cascade,renglon integer not null,nombre text not null,precio numeric(12,2) not null,primary key(pedido_id,renglon));
 create table razones_sociales(rfc text primary key check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),razon_social text not null,activa boolean not null default true);
 insert into sucursales(id,nombre,dodois_unit_id) values('${S}','Zapopan-1','11f187558e757f53b0570d952420b810');
 insert into perfiles(id,nombre,rol) values('${ADMIN}','Admin','admin'),('${CORP}','Corp','corporativo'),('${GER}','Ger','gerente');
 insert into razones_sociales(rfc,razon_social) values('HCM260306B93','HELPER COMERCIALIZADORA MASTER');
 insert into importaciones_ventas(id) values('00000000-0000-0000-0000-00000000000f');`;

// "Hoy" fijo en México: 2026-11-05 12:00 (18:00 UTC). La migración lee la fecha de facturacion_hoy(), que en la prueba se reemplaza.
const HOY=`create or replace function public.facturacion_hoy() returns date language sql stable as $$select date '2026-11-05'$$;`;
const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);await db.exec(HOY);return db;};
const pedido=(db,id,c={})=>db.query(`insert into pedidos(dodo_id,sucursal_id,fecha,hora,pago,tipo,estado,total,agregador,importacion_id)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,'00000000-0000-0000-0000-00000000000f')`,
 [id,S,c.fecha??'2026-11-04',c.hora??'17:35',c.pago??'tarjeta',c.tipo??'en_tienda',c.estado??'entregado',c.total??383,c.agregador??null]);
const productos=async(db,id)=>{for(const [i,[n,p]] of [['Dodo Supreme Grande Tradicional',269],['Coca Light 2 L',59],['Rolls de manzana 8',55]].entries())
 await db.query(`insert into pedido_productos values($1,$2,$3,$4)`,[id,i+1,n,p]);};
const buscar=(db,{ip='ip1',fecha='2026-11-04',hora='17:36',total=383}={})=>db.query(`select * from facturacion_buscar_ticket($1,$2,$3,$4,$5)`,[ip,S,fecha,hora,total]).then(r=>r.rows[0]);
const DATOS={rfc:'XYZ010101AB1',nombre:'CLIENTE PRUEBA',regimen_fiscal:'601',codigo_postal:'45160',uso_cfdi:'G03',correo:'juan@gmail.com',forma_pago:'04'};
const reservar=(db,id,d=DATOS)=>db.query(`select facturacion_reservar($1,$2::jsonb) as id`,[id,JSON.stringify(d)]).then(r=>r.rows[0].id);
const como=(db,u)=>db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[u??'']);
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});

test('facturación: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();try{await rechaza(db.exec(pruebas),/^PRUEBAS OK$/);}finally{await db.close();}
});

test('facturación: encuentra el ticket con ±3 minutos y total exacto',async()=>{
 const db=await nueva();try{
  await pedido(db,'A');await productos(db,'A');
  const r=await buscar(db);
  assert.equal(r.resultado,'ok');assert.equal(r.pedido_id,'A');assert.equal(r.productos.length,3);
  assert.equal((await buscar(db,{hora:'17:38'})).resultado,'ok');
  assert.equal((await buscar(db,{hora:'17:39'})).resultado,'no_encontrado');
  assert.equal((await buscar(db,{total:383.01})).resultado,'no_encontrado');
 }finally{await db.close();}
});

test('facturación: dos pedidos iguales en la ventana dan "varios"',async()=>{
 const db=await nueva();try{await pedido(db,'A');await pedido(db,'B',{hora:'17:37'});
  const r=await buscar(db);assert.equal(r.resultado,'varios');assert.equal(r.pedido_id,null);}finally{await db.close();}
});

test('facturación: plazo del mes en curso según México',async()=>{
 const db=await nueva();try{
  // 1 de noviembre 05:30 UTC = 31 de octubre 23:30 en México.
  assert.equal((await db.query(`select facturacion_dia_mx('2026-11-01 05:30+00')::text as d`)).rows[0].d,'2026-10-31');
  assert.equal((await db.query(`select facturacion_dia_mx('2026-11-01 06:30+00')::text as d`)).rows[0].d,'2026-11-01');
  await pedido(db,'V',{fecha:'2026-10-31'});
  assert.equal((await buscar(db,{fecha:'2026-10-31'})).resultado,'fuera_de_plazo');
  assert.equal((await buscar(db,{fecha:'2026-11-06'})).resultado,'fuera_de_plazo');
 }finally{await db.close();}
});

test('facturación: cancelados, personal, agregadores y pago "otro" no se facturan',async()=>{
 const db=await nueva();try{
  for(const [id,c] of [['C',{estado:'cancelado'}],['P',{tipo:'personal',total:100}],['R',{agregador:'Rappi',total:200}],['O',{pago:'otro',total:300}]]){
   await pedido(db,id,c);
   assert.equal((await buscar(db,{total:c.total??383})).resultado,'no_facturable',id);
   await rechaza(reservar(db,id),/NO_FACTURABLE/);
  }
 }finally{await db.close();}
});

test('facturación: un ticket, una factura (reserva doble, liberar, cancelar)',async()=>{
 const db=await nueva();try{
  await pedido(db,'A');
  const id=await reservar(db,'A');
  await rechaza(reservar(db,'A'),/^EN_PROCESO:/);
  await db.query(`select facturacion_liberar($1,'RFC no coincide')`,[id]);
  const id2=await reservar(db,'A');
  await db.query(`select facturacion_confirmar($1,'fa_1','11111111-2222-3333-4444-555555555555','F',1,330.17,52.83)`,[id2]);
  await rechaza(reservar(db,'A'),/^YA_FACTURADO$/);
  const r=await buscar(db);assert.equal(r.resultado,'facturado');assert.equal(r.factura_id,id2);assert.equal(r.correo,'ju***@gmail.com');
  await como(db,GER);await rechaza(db.query(`select facturacion_registrar_cancelacion($1,'02')`,[id2]),/Solo administración/);
  await como(db,ADMIN);await db.query(`select facturacion_registrar_cancelacion($1,'02')`,[id2]);
  const f=(await db.query(`select estado,cancelada_por,motivo_cancelacion from facturas_clientes where id=$1`,[id2])).rows[0];
  assert.deepEqual(f,{estado:'cancelada',cancelada_por:ADMIN,motivo_cancelacion:'02'});
  await como(db,null);assert.ok(await reservar(db,'A'));
 }finally{await db.close();}
});

test('facturación: datos inválidos se rechazan en la base',async()=>{
 const db=await nueva();try{await pedido(db,'A');
  await rechaza(reservar(db,'A',{...DATOS,rfc:'XAXX010101000'}),/facturas_clientes_rfc_check/);
  await rechaza(reservar(db,'A',{...DATOS,uso_cfdi:'G01'}),/facturas_clientes_uso_cfdi_check/);
  await rechaza(reservar(db,'A',{...DATOS,forma_pago:'03'}),/facturas_clientes_forma_pago_check/);
 }finally{await db.close();}
});

test('facturación: límite de 10 búsquedas por IP cada 10 minutos',async()=>{
 const db=await nueva();try{
  for(let i=0;i<10;i++) assert.equal((await buscar(db,{ip:'x'})).resultado,'no_encontrado');
  assert.equal((await buscar(db,{ip:'x'})).resultado,'limite');
  assert.equal((await buscar(db,{ip:'y'})).resultado,'no_encontrado');
 }finally{await db.close();}
});

test('facturación: descarga solo con el token correcto y factura timbrada',async()=>{
 const db=await nueva();try{await pedido(db,'A');const id=await reservar(db,'A');
  const tok=(await db.query(`select token_descarga from facturas_clientes where id=$1`,[id])).rows[0].token_descarga;
  const desc=t=>db.query(`select facturacion_para_descarga($1,$2) as f`,[id,t]).then(r=>r.rows[0].f);
  assert.equal(await desc(tok),null);
  await db.query(`select facturacion_confirmar($1,'fa_9','11111111-2222-3333-4444-555555555559','F',9,330.17,52.83)`,[id]);
  assert.equal(await desc(tok),'fa_9');
  assert.equal(await desc('00000000-0000-0000-0000-000000000000'),null);
 }finally{await db.close();}
});

test('facturación: permisos (anon y authenticated no ejecutan las funciones del servidor)',async()=>{
 const db=await nueva();try{
  const puede=(rol,fn)=>db.query(`select has_function_privilege($1,$2,'execute') as p`,[rol,fn]).then(r=>r.rows[0].p);
  for(const fn of ['facturacion_buscar_ticket(text,uuid,date,time,numeric)','facturacion_reservar(text,jsonb)','facturacion_liberar(uuid,text)'])
   for(const rol of ['anon','authenticated']) assert.equal(await puede(rol,fn),false,`${rol} ${fn}`);
  assert.equal(await puede('service_role','facturacion_reservar(text,jsonb)'),true);
  assert.equal(await puede('authenticated','facturacion_registrar_cancelacion(uuid,text)'),true);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `node --test tests/facturacionClientes.test.mjs`
Expected: FAIL con `ENOENT ... 20261106120000_facturacion_clientes.sql`.

- [ ] **Step 3: Escribir la migración**

```sql
-- supabase/migrations/20261106120000_facturacion_clientes.sql
-- Autofacturación de tickets (spec 2026-11-05). El cliente factura desde /facturar; Facturapi sella y timbra con el CSD de Helper.
-- Las reglas de qué ticket se factura viven aquí. Solo el servidor (service_role) busca, reserva y confirma; la oficina consulta por RLS.
-- Requiere 0007 (pedidos), 0068 (razones_sociales) y 20261020180000 (sucursales.dodois_unit_id). No modifica datos existentes.
begin;
set local lock_timeout='5s';

-- Qué sucursales facturan y con qué emisor. Se fija por RFC: razon_social_sucursales liga Zapopan-1 a SITRU y el ticket dice Helper.
create table public.facturacion_sucursales(
 sucursal_id uuid primary key references public.sucursales(id),
 rfc_emisor text not null references public.razones_sociales(rfc)
);
insert into public.facturacion_sucursales(sucursal_id,rfc_emisor)
 select id,'HCM260306B93' from public.sucursales where dodois_unit_id='11f187558e757f53b0570d952420b810';

create table public.facturas_clientes(
 id uuid primary key default gen_random_uuid(),
 pedido_id text not null references public.pedidos(dodo_id),
 rfc_emisor text not null references public.razones_sociales(rfc),
 rfc text not null constraint facturas_clientes_rfc_check check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' and rfc not in ('XAXX010101000','XEXX010101000')),
 nombre text not null check(length(trim(nombre))>0),
 regimen_fiscal text not null check(regimen_fiscal ~ '^6[0-9]{2}$'),
 codigo_postal text not null check(codigo_postal ~ '^[0-9]{5}$'),
 uso_cfdi text not null constraint facturas_clientes_uso_cfdi_check check(uso_cfdi in ('G03','S01')),
 correo text not null check(correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
 forma_pago text not null constraint facturas_clientes_forma_pago_check check(forma_pago in ('01','04','28')),
 subtotal numeric(12,2),iva numeric(12,2),total numeric(12,2) not null check(total>0),
 estado text not null default 'en_proceso' check(estado in ('en_proceso','timbrada','cancelada','error')),
 facturapi_id text unique,uuid text unique,serie text,folio integer,error text,
 token_descarga uuid not null default gen_random_uuid(),
 creada timestamptz not null default now(),timbrada_en timestamptz,
 cancelada_en timestamptz,motivo_cancelacion text check(motivo_cancelacion in ('02','03')),cancelada_por uuid references public.perfiles(id),
 check(estado<>'timbrada' or (facturapi_id is not null and uuid is not null)),
 check(estado<>'cancelada' or (cancelada_en is not null and motivo_cancelacion is not null))
);
-- Un ticket, una factura: la fila en proceso o timbrada bloquea; error y cancelada liberan.
create unique index facturas_clientes_un_ticket on public.facturas_clientes(pedido_id) where estado in ('en_proceso','timbrada');
create index facturas_clientes_creada on public.facturas_clientes(creada);

create table public.facturacion_intentos(id bigint generated always as identity primary key,ip text not null,creado timestamptz not null default now());
create index facturacion_intentos_ip on public.facturacion_intentos(ip,creado);

-- "Hoy" en México (no UTC: el día 1 a las 00:30 de México todavía es el mes nuevo). facturacion_hoy va aparte para fijarla en pruebas.
create function public.facturacion_dia_mx(p timestamptz) returns date language sql immutable as $$select (p at time zone 'America/Mexico_City')::date$$;
create function public.facturacion_hoy() returns date language sql stable set search_path=public as $$select facturacion_dia_mx(now())$$;

-- Motivo por el que un pedido no se puede facturar, o null si sí.
create function public.facturacion_motivo(p public.pedidos) returns text language sql stable set search_path=public as $$
 select case
  when not exists(select 1 from facturacion_sucursales s where s.sucursal_id=p.sucursal_id) then 'sucursal'
  when date_trunc('month',p.fecha)<>date_trunc('month',facturacion_hoy()) or p.fecha>facturacion_hoy() then 'plazo'
  when p.estado<>'entregado' then 'cancelado'
  when p.tipo='personal' then 'personal'
  when p.agregador is not null then 'agregador'
  when p.pago='otro' then 'pago'
 end$$;

create function public.facturacion_buscar_ticket(p_ip text,p_sucursal uuid,p_fecha date,p_hora time,p_total numeric)
returns table(resultado text,pedido_id text,fecha date,hora time,total numeric,pago text,productos jsonb,factura_id uuid,correo text)
language plpgsql security definer set search_path=public as $$
declare v_n int;v_p pedidos;v_f facturas_clientes;
begin
 if (select count(*) from facturacion_intentos i where i.ip=p_ip and i.creado>now()-interval '10 minutes')>=10 then
  return query select 'limite',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 insert into facturacion_intentos(ip) values(p_ip);
 delete from facturacion_intentos i where i.creado<now()-interval '1 day';
 if date_trunc('month',p_fecha)<>date_trunc('month',facturacion_hoy()) or p_fecha>facturacion_hoy() then
  return query select 'fuera_de_plazo',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 select count(*) into v_n from pedidos p where p.sucursal_id=p_sucursal and p.fecha=p_fecha and p.total=p_total
  and p.hora between p_hora-interval '3 minutes' and p_hora+interval '3 minutes';
 if v_n=0 then return query select 'no_encontrado',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 if v_n>1 then return query select 'varios',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 select * into v_p from pedidos p where p.sucursal_id=p_sucursal and p.fecha=p_fecha and p.total=p_total
  and p.hora between p_hora-interval '3 minutes' and p_hora+interval '3 minutes';
 if facturacion_motivo(v_p) is not null then
  return query select 'no_facturable',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 select * into v_f from facturas_clientes f where f.pedido_id=v_p.dodo_id and f.estado='timbrada';
 if found then return query select 'facturado',v_p.dodo_id,v_p.fecha,v_p.hora,v_p.total,v_p.pago,null::jsonb,v_f.id,
  left(split_part(v_f.correo,'@',1),2)||'***@'||split_part(v_f.correo,'@',2);return;end if;
 return query select 'ok',v_p.dodo_id,v_p.fecha,v_p.hora,v_p.total,v_p.pago,
  coalesce((select jsonb_agg(jsonb_build_object('nombre',x.nombre,'precio',x.precio) order by x.renglon) from pedido_productos x where x.pedido_id=v_p.dodo_id),'[]'::jsonb),
  null::uuid,null::text;
end$$;

create function public.facturacion_reservar(p_pedido text,p_datos jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_p pedidos;v_m text;v_f facturas_clientes;v_id uuid;
begin
 select * into v_p from pedidos where dodo_id=p_pedido for update;
 if not found then raise exception 'NO_FACTURABLE:no_encontrado';end if;
 v_m:=facturacion_motivo(v_p);
 if v_m is not null then raise exception 'NO_FACTURABLE:%',v_m;end if;
 select * into v_f from facturas_clientes where pedido_id=p_pedido and estado in ('en_proceso','timbrada');
 if found and v_f.estado='timbrada' then raise exception 'YA_FACTURADO';end if;
 if found then raise exception 'EN_PROCESO:%:%',v_f.id,floor(extract(epoch from v_f.creada))::bigint;end if;
 insert into facturas_clientes(pedido_id,rfc_emisor,rfc,nombre,regimen_fiscal,codigo_postal,uso_cfdi,correo,forma_pago,total)
  select p_pedido,s.rfc_emisor,p_datos->>'rfc',p_datos->>'nombre',p_datos->>'regimen_fiscal',p_datos->>'codigo_postal',
   p_datos->>'uso_cfdi',p_datos->>'correo',p_datos->>'forma_pago',v_p.total
  from facturacion_sucursales s where s.sucursal_id=v_p.sucursal_id
  returning id into v_id;
 return v_id;
end$$;

create function public.facturacion_confirmar(p_id uuid,p_facturapi_id text,p_uuid text,p_serie text,p_folio integer,p_subtotal numeric,p_iva numeric) returns void
language plpgsql security definer set search_path=public as $$
begin
 update facturas_clientes set estado='timbrada',facturapi_id=p_facturapi_id,uuid=upper(p_uuid),serie=p_serie,folio=p_folio,
  subtotal=p_subtotal,iva=p_iva,timbrada_en=now(),error=null where id=p_id and estado='en_proceso';
 if not found then raise exception 'La factura % no está en proceso.',p_id;end if;
end$$;

create function public.facturacion_liberar(p_id uuid,p_error text) returns void
language sql security definer set search_path=public as $$
 update facturas_clientes set estado='error',error=left(p_error,500) where id=p_id and estado='en_proceso'$$;

create function public.facturacion_para_descarga(p_id uuid,p_token uuid) returns text
language sql stable security definer set search_path=public as $$
 select facturapi_id from facturas_clientes where id=p_id and token_descarga=p_token and estado='timbrada'$$;

-- La oficina cancela en Facturapi y luego registra aquí (solo admin). Motivos sin sustitución: 02 errores sin relación, 03 operación no realizada.
create function public.facturacion_registrar_cancelacion(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if mi_rol() is distinct from 'admin' then raise exception 'Solo administración puede cancelar facturas.';end if;
 update facturas_clientes set estado='cancelada',cancelada_en=now(),motivo_cancelacion=p_motivo,cancelada_por=auth.uid()
  where id=p_id and estado='timbrada';
 if not found then raise exception 'La factura no está timbrada.';end if;
end$$;

alter table public.facturacion_sucursales enable row level security;
alter table public.facturas_clientes enable row level security;
alter table public.facturacion_intentos enable row level security;
revoke all on public.facturacion_sucursales,public.facturas_clientes,public.facturacion_intentos from public,anon,authenticated;
grant select on public.facturas_clientes,public.facturacion_sucursales to authenticated;
create policy ver_facturas_clientes on public.facturas_clientes for select using (mi_rol() in ('admin','corporativo'));
create policy ver_facturacion_sucursales on public.facturacion_sucursales for select using (mi_rol() in ('admin','corporativo'));

revoke all on function public.facturacion_dia_mx(timestamptz),public.facturacion_hoy(),public.facturacion_motivo(public.pedidos),
 public.facturacion_buscar_ticket(text,uuid,date,time,numeric),public.facturacion_reservar(text,jsonb),
 public.facturacion_confirmar(uuid,text,text,text,integer,numeric,numeric),public.facturacion_liberar(uuid,text),
 public.facturacion_para_descarga(uuid,uuid),public.facturacion_registrar_cancelacion(uuid,text) from public,anon,authenticated;
grant execute on function public.facturacion_buscar_ticket(text,uuid,date,time,numeric),public.facturacion_reservar(text,jsonb),
 public.facturacion_confirmar(uuid,text,text,text,integer,numeric,numeric),public.facturacion_liberar(uuid,text),
 public.facturacion_para_descarga(uuid,uuid) to service_role;
grant execute on function public.facturacion_registrar_cancelacion(uuid,text) to authenticated;

do $$begin
 if (select count(*) from public.facturacion_sucursales)<>1 then raise exception 'No se encontró la sucursal de Mariano Otero (dodois_unit_id 11f1…b810).';end if;
 if not exists(select 1 from public.razones_sociales where rfc='HCM260306B93' and activa) then raise exception 'Helper (HCM260306B93) no está activa en razones_sociales.';end if;
end $$;
commit;
```

Nota para quien implemente: `facturacion_motivo` y `facturacion_hoy` las llaman las funciones `security definer`, que corren como su dueño, así que no necesitan `grant`. La función de reemplazo `HOY` de la prueba usa `create or replace` sobre la misma firma.

- [ ] **Step 4: Escribir la prueba SQL de catálogo para producción**

```sql
-- supabase/pruebas/20261106120000_facturacion_clientes.sql
-- Ejecutar completo después de 20261106120000_facturacion_clientes.sql. Solo lee el catálogo; PRUEBAS OK es un ERROR intencional.
do $$
declare v int;
begin
 if (select count(*) from public.facturacion_sucursales f join public.sucursales s on s.id=f.sucursal_id
     where s.dodois_unit_id='11f187558e757f53b0570d952420b810' and f.rfc_emisor='HCM260306B93')<>1 then
  raise exception 'FALLÓ: Mariano Otero no quedó ligada a Helper';end if;
 if not exists(select 1 from pg_indexes where indexname='facturas_clientes_un_ticket') then raise exception 'FALLÓ: falta el índice de un ticket, una factura';end if;
 select count(*) into v from pg_proc where proname like 'facturacion\_%' and prosecdef;
 if v<>6 then raise exception 'FALLÓ: se esperaban 6 funciones security definer de facturación y hay %',v;end if;
 if has_function_privilege('anon','public.facturacion_reservar(text,jsonb)','execute')
  or has_function_privilege('authenticated','public.facturacion_buscar_ticket(text,uuid,date,time,numeric)','execute') then
  raise exception 'FALLÓ: anon o authenticated pueden ejecutar funciones del servidor';end if;
 if not (select relrowsecurity from pg_class where oid='public.facturas_clientes'::regclass) then raise exception 'FALLÓ: facturas_clientes sin RLS';end if;
 raise exception 'PRUEBAS OK';
end $$;
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `node --test tests/facturacionClientes.test.mjs`
Expected: PASS en las 10 pruebas.
- `time ± interval` da `time` en Postgres. Cerca de medianoche la resta da la vuelta (00:01 − 3 min = 23:58) y el `between` no encuentra nada. Dodo no vende entre 23:57 y 00:03, así que se deja un comentario en la función y no se maneja.
- Si una búsqueda falla con "column reference is ambiguous" (las columnas de `returns table` chocan con las de las tablas), poner `#variable_conflict use_column` como primera línea del cuerpo de `facturacion_buscar_ticket`.

- [ ] **Step 6: Agregar la prueba a `package.json` y commit**

En `package.json`, dentro de `scripts.test`, agregar ` tests/facturacionClientes.test.mjs` al final de la lista.

```bash
git add supabase/migrations/20261106120000_facturacion_clientes.sql supabase/pruebas/20261106120000_facturacion_clientes.sql tests/facturacionClientes.test.mjs package.json
git commit -m "feat(facturacion): tablas y funciones SQL de autofacturación de tickets"
```

---

### Task 2: Reglas de datos fiscales (`lib/facturacion/reglas.ts`)

**Files:**
- Create: `lib/facturacion/reglas.ts`
- Test: `lib/facturacion/reglas.test.ts`
- Modify: `package.json` (agregar `lib/facturacion/reglas.test.ts`)

**Interfaces:**
- Produces:
  - `type DatosFiscales = { rfc: string; nombre: string; regimen_fiscal: string; codigo_postal: string; uso_cfdi: UsoCfdi; correo: string; forma_pago: FormaPagoSat }`
  - `type UsoCfdi = "G03" | "S01"`; `type FormaPagoSat = "01" | "04" | "28"`; `type PagoPedido = "efectivo" | "tarjeta" | "en_linea" | "otro"`
  - `USOS_CFDI: Record<UsoCfdi, string>`
  - `usosPermitidos(regimen: string): UsoCfdi[]`
  - `pideTipoTarjeta(pago: PagoPedido): boolean`
  - `formaPago(pago: PagoPedido, tarjeta: "credito" | "debito" | null): FormaPagoSat | null`
  - `validarDatosFiscales(entrada: Record<string, string | null | undefined>, pago: PagoPedido, regimenes: Readonly<Record<string, string>>): { datos: DatosFiscales } | { error: string }`. Las llaves de `entrada` son `rfc`, `nombre`, `regimen_fiscal`, `codigo_postal`, `uso_cfdi`, `correo` y `tarjeta`.
  - `type ResultadoBusqueda = "ok" | "limite" | "fuera_de_plazo" | "no_encontrado" | "varios" | "no_facturable" | "facturado"`
  - `mensajeBusqueda(r: Exclude<ResultadoBusqueda, "ok" | "facturado">): string`
  - `CORREO_FACTURACION = "facturacion@dodopizza.mx"`

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/facturacion/reglas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formaPago, mensajeBusqueda, pideTipoTarjeta, usosPermitidos, validarDatosFiscales } from "./reglas.ts";

const REG = { "601": "General de Ley Personas Morales", "605": "Sueldos y Salarios", "612": "Actividades Empresariales", "626": "RESICO" };
const BASE = { rfc: " xyz010101ab1 ", nombre: "  cliente   prueba ", regimen_fiscal: "601", codigo_postal: "45160", uso_cfdi: "G03", correo: " Juan@Gmail.com ", tarjeta: "credito" };

test("normaliza RFC, nombre y correo", () => {
  const r = validarDatosFiscales(BASE, "tarjeta", REG);
  assert.ok("datos" in r);
  assert.deepEqual(r.datos, { rfc: "XYZ010101AB1", nombre: "CLIENTE PRUEBA", regimen_fiscal: "601", codigo_postal: "45160", uso_cfdi: "G03", correo: "juan@gmail.com", forma_pago: "04" });
});

test("rechaza RFC genérico, RFC mal formado y CP inválido", () => {
  assert.match((validarDatosFiscales({ ...BASE, rfc: "XAXX010101000" }, "tarjeta", REG) as { error: string }).error, /público en general/);
  assert.match((validarDatosFiscales({ ...BASE, rfc: "ABC12" }, "tarjeta", REG) as { error: string }).error, /RFC/);
  assert.match((validarDatosFiscales({ ...BASE, codigo_postal: "4516" }, "tarjeta", REG) as { error: string }).error, /código postal/);
});

test("persona moral (12) no puede tener régimen de persona física y viceversa", () => {
  assert.match((validarDatosFiscales({ ...BASE, regimen_fiscal: "612" }, "tarjeta", REG) as { error: string }).error, /régimen/);
  assert.ok("datos" in validarDatosFiscales({ ...BASE, rfc: "XYZW010101AB1", regimen_fiscal: "612" }, "tarjeta", REG));
});

test("avisa si el nombre trae el régimen de capital", () => {
  assert.match((validarDatosFiscales({ ...BASE, nombre: "Cliente Prueba S.A. de C.V." }, "tarjeta", REG) as { error: string }).error, /sin "S\.A\. de C\.V\."/);
  assert.match((validarDatosFiscales({ ...BASE, nombre: "CLIENTE SA DE CV" }, "tarjeta", REG) as { error: string }).error, /sin "S\.A\. de C\.V\."/);
});

test("uso del CFDI según régimen: 605 solo S01", () => {
  assert.deepEqual(usosPermitidos("601"), ["G03", "S01"]);
  assert.deepEqual(usosPermitidos("605"), ["S01"]);
  assert.match((validarDatosFiscales({ ...BASE, rfc: "XYZW010101AB1", regimen_fiscal: "605" }, "tarjeta", REG) as { error: string }).error, /uso/);
});

test("forma de pago", () => {
  assert.equal(formaPago("efectivo", null), "01");
  assert.equal(formaPago("tarjeta", "credito"), "04");
  assert.equal(formaPago("en_linea", "debito"), "28");
  assert.equal(formaPago("tarjeta", null), null);
  assert.equal(formaPago("otro", "credito"), null);
  assert.equal(pideTipoTarjeta("en_linea"), true);
  assert.equal(pideTipoTarjeta("efectivo"), false);
  assert.match((validarDatosFiscales({ ...BASE, tarjeta: "" }, "tarjeta", REG) as { error: string }).error, /crédito o débito/);
});

test("mensajes de búsqueda mencionan el correo cuando no hay salida en el portal", () => {
  assert.match(mensajeBusqueda("fuera_de_plazo"), /facturacion@dodopizza\.mx/);
  assert.match(mensajeBusqueda("varios"), /facturacion@dodopizza\.mx/);
  assert.match(mensajeBusqueda("no_encontrado"), /fecha, la hora y el total/);
  assert.match(mensajeBusqueda("limite"), /minutos/);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --experimental-strip-types --test lib/facturacion/reglas.test.ts`
Expected: FAIL con `Cannot find module './reglas.ts'`.

- [ ] **Step 3: Implementar**

```ts
// lib/facturacion/reglas.ts
/** Reglas del portal de autofacturación: datos fiscales del cliente, forma de pago y mensajes. Las de qué ticket se factura viven en SQL. */

export type UsoCfdi = "G03" | "S01";
export type FormaPagoSat = "01" | "04" | "28";
export type PagoPedido = "efectivo" | "tarjeta" | "en_linea" | "otro";
export type DatosFiscales = { rfc: string; nombre: string; regimen_fiscal: string; codigo_postal: string; uso_cfdi: UsoCfdi; correo: string; forma_pago: FormaPagoSat };
export type ResultadoBusqueda = "ok" | "limite" | "fuera_de_plazo" | "no_encontrado" | "varios" | "no_facturable" | "facturado";

export const CORREO_FACTURACION = "facturacion@dodopizza.mx";
export const USOS_CFDI: Record<UsoCfdi, string> = { G03: "Gastos en general", S01: "Sin efectos fiscales" };

const GENERICOS = new Set(["XAXX010101000", "XEXX010101000"]);
const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
// c_RegimenFiscal: cuáles aplican a moral (RFC de 12) y a física (13).
const MORAL = new Set(["601", "603", "607", "610", "620", "622", "623", "624", "626", "628"]);
const FISICA = new Set(["605", "606", "607", "608", "610", "611", "612", "614", "615", "616", "621", "622", "625", "626", "629", "630"]);
// c_UsoCFDI G03 según el SAT; S01 aplica a todos.
const CON_G03 = new Set(["601", "603", "606", "612", "620", "621", "622", "623", "624", "625", "626"]);
const CAPITAL = /\b(S\.?\s?A\.?|S\.?\s?DE\s?R\.?\s?L\.?|S\.?\s?C\.?|A\.?\s?C\.?|S\.?\s?A\.?\s?P\.?\s?I\.?)(\s?DE\s?C\.?\s?V\.?)?\s*$/i;

export const usosPermitidos = (regimen: string): UsoCfdi[] => (CON_G03.has(regimen) ? ["G03", "S01"] : ["S01"]);
export const pideTipoTarjeta = (pago: PagoPedido) => pago === "tarjeta" || pago === "en_linea";

export function formaPago(pago: PagoPedido, tarjeta: "credito" | "debito" | null): FormaPagoSat | null {
  if (pago === "efectivo") return "01";
  if (!pideTipoTarjeta(pago) || !tarjeta) return null;
  return tarjeta === "credito" ? "04" : "28";
}

const limpio = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ");

export function validarDatosFiscales(
  e: Record<string, string | null | undefined>, pago: PagoPedido, regimenes: Readonly<Record<string, string>>,
): { datos: DatosFiscales } | { error: string } {
  const rfc = limpio(e.rfc).toUpperCase().replace(/[\s-]/g, "");
  const nombre = limpio(e.nombre).toUpperCase();
  const regimen = limpio(e.regimen_fiscal), cp = limpio(e.codigo_postal), uso = limpio(e.uso_cfdi), correo = limpio(e.correo).toLowerCase();
  if (GENERICOS.has(rfc)) return { error: "Ese es el RFC de público en general. Para facturar a tu nombre escribe tu propio RFC." };
  if (!RFC.test(rfc)) return { error: "Revisa el RFC: son 12 caracteres para empresas y 13 para personas." };
  if (!nombre) return { error: "Escribe el nombre o la razón social tal como aparece en tu constancia." };
  if (CAPITAL.test(nombre)) return { error: 'Escribe la razón social sin "S.A. de C.V." ni el régimen de capital, como aparece en tu constancia.' };
  if (!(regimen in regimenes)) return { error: "Elige tu régimen fiscal." };
  if (!(rfc.length === 12 ? MORAL : FISICA).has(regimen)) return { error: `El régimen ${regimen} no corresponde a ${rfc.length === 12 ? "una empresa" : "una persona física"}. Revisa tu constancia.` };
  if (!/^[0-9]{5}$/.test(cp)) return { error: "El código postal son 5 dígitos, el de tu constancia." };
  if (!(usosPermitidos(regimen) as string[]).includes(uso)) return { error: "Ese uso del CFDI no aplica a tu régimen fiscal." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Revisa tu correo." };
  const t = e.tarjeta === "credito" || e.tarjeta === "debito" ? e.tarjeta : null;
  const fp = formaPago(pago, t);
  if (!fp) return { error: pideTipoTarjeta(pago) ? "Indica si pagaste con tarjeta de crédito o débito." : `Este ticket no se puede facturar aquí. Escríbenos a ${CORREO_FACTURACION}.` };
  return { datos: { rfc, nombre, regimen_fiscal: regimen, codigo_postal: cp, uso_cfdi: uso as UsoCfdi, correo, forma_pago: fp } };
}

const MENSAJES: Record<Exclude<ResultadoBusqueda, "ok" | "facturado">, string> = {
  limite: "Hiciste muchas búsquedas seguidas. Espera unos minutos y vuelve a intentar.",
  fuera_de_plazo: `Solo se facturan tickets del mes en curso. Los de meses anteriores ya están en la factura global; si necesitas ayuda escríbenos a ${CORREO_FACTURACION}.`,
  no_encontrado: "No encontramos el ticket. Revisa la fecha, la hora y el total tal como vienen impresos. Si acabas de comprar, espera 15 minutos.",
  varios: `Hay más de un ticket con esos datos. Escríbenos a ${CORREO_FACTURACION} con una foto del ticket.`,
  no_facturable: `Este ticket no se puede facturar en línea (pedidos por Rappi u otras apps se facturan en su plataforma). Escríbenos a ${CORREO_FACTURACION} si necesitas ayuda.`,
};
export const mensajeBusqueda = (r: Exclude<ResultadoBusqueda, "ok" | "facturado">) => MENSAJES[r];
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --experimental-strip-types --test lib/facturacion/reglas.test.ts`
Expected: PASS en las 7 pruebas. Si falla la de "persona física con 612", revisar que `XYZW010101AB1` tenga 13 caracteres.

- [ ] **Step 5: Agregar a `package.json` y commit**

```bash
git add lib/facturacion/reglas.ts lib/facturacion/reglas.test.ts package.json
git commit -m "feat(facturacion): validación de datos fiscales y forma de pago"
```

---

### Task 3: Conceptos del CFDI (`lib/facturacion/conceptos.ts`)

**Files:**
- Create: `lib/facturacion/conceptos.ts`
- Test: `lib/facturacion/conceptos.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: el `productos` jsonb que regresa `facturacion_buscar_ticket` (`{nombre: string, precio: number}[]`) y `pedidos.total`.
- Produces:
  - `type ConceptoFacturapi = { quantity: number; product: { description: string; product_key: string; unit_key: string; price: number; tax_included: true; taxes: [{ type: "IVA"; rate: 0.16 }] } }`
  - `CLAVE_PRODUCTO = "90101501"`, `CLAVE_UNIDAD = "E48"`
  - `armarConceptos(productos: readonly { nombre: string; precio: number }[], total: number): { conceptos: ConceptoFacturapi[] } | { error: string }`
  - `desglose(total: number): { subtotal: number; iva: number }`: estimado para mostrar al cliente; lo oficial lo da Facturapi.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// lib/facturacion/conceptos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarConceptos, desglose } from "./conceptos.ts";

const TICKET = [{ nombre: "Dodo Supreme Grande Tradicional", precio: 269 }, { nombre: "Coca Light 2 L", precio: 59 }, { nombre: "Rolls de manzana 8", precio: 55 }];

test("arma un concepto por producto con IVA incluido", () => {
  const r = armarConceptos(TICKET, 383);
  assert.ok("conceptos" in r);
  assert.equal(r.conceptos.length, 3);
  assert.deepEqual(r.conceptos[1], { quantity: 1, product: { description: "Coca Light 2 L", product_key: "90101501", unit_key: "E48", price: 59, tax_included: true, taxes: [{ type: "IVA", rate: 0.16 }] } });
});

test("agrupa productos iguales con el mismo precio", () => {
  const r = armarConceptos([{ nombre: "Coca 600", precio: 30 }, { nombre: "Coca 600", precio: 30 }, { nombre: "Coca 600", precio: 25 }], 85);
  assert.ok("conceptos" in r);
  assert.deepEqual(r.conceptos.map((c) => [c.product.description, c.quantity, c.product.price]), [["Coca 600", 2, 30], ["Coca 600", 1, 25]]);
});

test("omite renglones en cero (regalos de combo) y conserva el total", () => {
  const r = armarConceptos([{ nombre: "Combo", precio: 199 }, { nombre: "Dip", precio: 0 }], 199);
  assert.ok("conceptos" in r);
  assert.equal(r.conceptos.length, 1);
});

test("falla si la suma no cuadra al centavo o no hay productos", () => {
  assert.match((armarConceptos(TICKET, 384) as { error: string }).error, /no cuadra/);
  assert.match((armarConceptos([], 100) as { error: string }).error, /productos/);
  assert.match((armarConceptos([{ nombre: "X", precio: -5 }, { nombre: "Y", precio: 105 }], 100) as { error: string }).error, /negativo/);
});

test("centavos: 0.1 + 0.2 cuadra con 0.30", () => {
  assert.ok("conceptos" in armarConceptos([{ nombre: "A", precio: 0.1 }, { nombre: "B", precio: 0.2 }], 0.3));
});

test("desglose como el ticket: 383 → 330.17 + 52.83", () => {
  assert.deepEqual(desglose(383), { subtotal: 330.17, iva: 52.83 });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --experimental-strip-types --test lib/facturacion/conceptos.test.ts`
Expected: FAIL con `Cannot find module './conceptos.ts'`.

- [ ] **Step 3: Implementar**

```ts
// lib/facturacion/conceptos.ts
/** Productos del pedido de Dodo IS → conceptos de Facturapi. Precio con descuento e IVA 16 % incluido. */

// Claves SAT por confirmar con el contador (spec, Entregas de Sebastián).
export const CLAVE_PRODUCTO = "90101501";
export const CLAVE_UNIDAD = "E48";

export type ConceptoFacturapi = {
  quantity: number;
  product: { description: string; product_key: string; unit_key: string; price: number; tax_included: true; taxes: [{ type: "IVA"; rate: 0.16 }] };
};

const cent = (n: number) => Math.round(n * 100);

export function armarConceptos(productos: readonly { nombre: string; precio: number }[], total: number): { conceptos: ConceptoFacturapi[] } | { error: string } {
  if (productos.length === 0) return { error: "El ticket no tiene productos registrados." };
  if (productos.some((p) => Number(p.precio) < 0)) return { error: "El ticket tiene un renglón con precio negativo." };
  const suma = productos.reduce((s, p) => s + cent(Number(p.precio)), 0);
  if (suma !== cent(total)) return { error: `La suma de productos (${(suma / 100).toFixed(2)}) no cuadra con el total del ticket (${total.toFixed(2)}).` };
  const grupos = new Map<string, ConceptoFacturapi>();
  for (const p of productos) {
    const precio = cent(Number(p.precio)) / 100;
    if (precio === 0) continue;
    const llave = `${p.nombre}|${precio}`;
    const g = grupos.get(llave);
    if (g) g.quantity += 1;
    else grupos.set(llave, { quantity: 1, product: { description: p.nombre.trim(), product_key: CLAVE_PRODUCTO, unit_key: CLAVE_UNIDAD, price: precio, tax_included: true, taxes: [{ type: "IVA", rate: 0.16 }] } });
  }
  return { conceptos: [...grupos.values()] };
}

export function desglose(total: number) {
  const subtotal = Math.round((total / 1.16) * 100) / 100;
  return { subtotal, iva: Math.round((total - subtotal) * 100) / 100 };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --experimental-strip-types --test lib/facturacion/conceptos.test.ts`
Expected: PASS en las 6 pruebas.

- [ ] **Step 5: `package.json` y commit**

```bash
git add lib/facturacion/conceptos.ts lib/facturacion/conceptos.test.ts package.json
git commit -m "feat(facturacion): conceptos del CFDI a partir del pedido"
```

---

### Task 4: Cliente de Facturapi (`lib/facturacion/facturapi.ts`)

**Files:**
- Create: `lib/facturacion/facturapi.ts`
- Test: `lib/facturacion/facturapi.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ConceptoFacturapi` (solo el tipo) de `./conceptos.ts`; `DatosFiscales` (solo el tipo) de `./reglas.ts`.
- Produces:
  - `type FacturaTimbrada = { id: string; uuid: string; series: string; folio_number: number; subtotal: number; total: number; status: string }`
  - `type Respuesta<T> = { ok: true; valor: T } | { ok: false; tipo: "rechazo" | "incierto"; mensaje: string }`. `rechazo` significa que Facturapi respondió 400 o 422 y seguro no timbró. `incierto` significa red, 5xx, 429 o 202: no sabemos si timbró.
  - `crearClienteFacturapi(llave: string, f?: typeof fetch)`, que regresa:
    - `crear(datos: DatosFiscales, conceptos: ConceptoFacturapi[], llaves: { externo: string; idempotencia: string }): Promise<Respuesta<FacturaTimbrada>>`
    - `buscarPorExterno(externo: string): Promise<Respuesta<FacturaTimbrada | null>>` (solo facturas `valid`)
    - `urlDescarga(id: string, formato: "pdf" | "xml"): Promise<Respuesta<string>>`
    - `enviarCorreo(id: string, correo: string): Promise<Respuesta<null>>`
    - `cancelar(id: string, motivo: "02" | "03"): Promise<Respuesta<{ status: string; cancellation_status: string }>>`

Rutas verificadas en docs.facturapi.io el 2026-11-05: base `https://www.facturapi.io/v2`, `Authorization: Bearer <llave>`; `POST /invoices`, con `idempotency_key` y `external_id` en el cuerpo; `GET /invoices?external_id=`; `GET /invoices/{id}/download-url/{pdf|xml}`, que regresa una URL temporal; `DELETE /invoices/{id}?motive=`; `POST /invoices/{id}/email`, con cuerpo `{ email }`. **Verificar esta última en la documentación al implementar**, porque la página leída no la mostraba completa. Los errores llegan como `{ message, status, errors? }`.

- [ ] **Step 1: Escribir la prueba con `fetch` falso**

```ts
// lib/facturacion/facturapi.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteFacturapi } from "./facturapi.ts";

type Llamada = { url: string; init: RequestInit };
const falso = (respuestas: (Response | Error)[]) => {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas.shift()!;
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { f, llamadas };
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const DATOS = { rfc: "XYZ010101AB1", nombre: "CLIENTE PRUEBA", regimen_fiscal: "601", codigo_postal: "45160", uso_cfdi: "G03" as const, correo: "juan@gmail.com", forma_pago: "04" as const };
const FACT = { id: "fa_1", uuid: "abc", series: "F", folio_number: 7, subtotal: 330.17, total: 383, status: "valid" };

test("crear: manda cliente, conceptos, PUE, idempotencia y externo", async () => {
  const { f, llamadas } = falso([json(200, FACT)]);
  const r = await crearClienteFacturapi("sk_test_x", f).crear(DATOS, [], { externo: "ped-1", idempotencia: "fila-1" });
  assert.deepEqual(r, { ok: true, valor: FACT });
  assert.equal(llamadas[0].url, "https://www.facturapi.io/v2/invoices");
  assert.equal((llamadas[0].init.headers as Record<string, string>).Authorization, "Bearer sk_test_x");
  const body = JSON.parse(llamadas[0].init.body as string);
  assert.deepEqual(body.customer, { legal_name: "CLIENTE PRUEBA", tax_id: "XYZ010101AB1", tax_system: "601", email: "juan@gmail.com", address: { zip: "45160" } });
  assert.equal(body.payment_form, "04"); assert.equal(body.payment_method, "PUE"); assert.equal(body.use, "G03");
  assert.equal(body.external_id, "ped-1"); assert.equal(body.idempotency_key, "fila-1");
});

test("crear: 400 es rechazo con el mensaje de Facturapi; 500, 202 y red son inciertos", async () => {
  const { f } = falso([json(400, { message: "El RFC del receptor no está en la lista de RFC inscritos", status: 400 }), json(500, { message: "x" }), json(202, { ...FACT, status: "pending" }), new Error("ECONNRESET")]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.crear(DATOS, [], { externo: "a", idempotencia: "b" }), { ok: false, tipo: "rechazo", mensaje: "El RFC del receptor no está en la lista de RFC inscritos" });
  for (let i = 0; i < 3; i++) assert.equal(((await c.crear(DATOS, [], { externo: "a", idempotencia: "b" })) as { tipo: string }).tipo, "incierto");
});

test("buscarPorExterno: regresa la válida o null", async () => {
  const { f, llamadas } = falso([json(200, { data: [{ ...FACT, status: "canceled" }, FACT] }), json(200, { data: [] })]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.buscarPorExterno("ped 1"), { ok: true, valor: FACT });
  assert.equal(llamadas[0].url, "https://www.facturapi.io/v2/invoices?external_id=ped%201");
  assert.deepEqual(await c.buscarPorExterno("x"), { ok: true, valor: null });
});

test("urlDescarga, enviarCorreo y cancelar usan las rutas correctas", async () => {
  const { f, llamadas } = falso([json(200, { url: "https://s3/x.pdf", expires_at: "…" }), json(200, { ok: true }), json(200, { status: "canceled", cancellation_status: "accepted" })]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.urlDescarga("fa_1", "pdf"), { ok: true, valor: "https://s3/x.pdf" });
  assert.deepEqual(await c.enviarCorreo("fa_1", "a@b.mx"), { ok: true, valor: null });
  assert.equal((await c.cancelar("fa_1", "02") as { ok: true; valor: { status: string } }).valor.status, "canceled");
  assert.deepEqual(llamadas.map((l) => `${l.init.method} ${l.url}`), [
    "GET https://www.facturapi.io/v2/invoices/fa_1/download-url/pdf",
    "POST https://www.facturapi.io/v2/invoices/fa_1/email",
    "DELETE https://www.facturapi.io/v2/invoices/fa_1?motive=02",
  ]);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --experimental-strip-types --test lib/facturacion/facturapi.test.ts`
Expected: FAIL con `Cannot find module`.

- [ ] **Step 3: Implementar**

```ts
// lib/facturacion/facturapi.ts
/** Cliente mínimo de la API v2 de Facturapi (https://docs.facturapi.io/api). La llave define organización y ambiente (sk_test_ = pruebas). */
import type { ConceptoFacturapi } from "./conceptos";
import type { DatosFiscales } from "./reglas";

const BASE = "https://www.facturapi.io/v2";
export type FacturaTimbrada = { id: string; uuid: string; series: string; folio_number: number; subtotal: number; total: number; status: string };
export type Respuesta<T> = { ok: true; valor: T } | { ok: false; tipo: "rechazo" | "incierto"; mensaje: string };

export function crearClienteFacturapi(llave: string, f: typeof fetch = fetch) {
  async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
    let r: Response;
    try {
      r = await f(`${BASE}${ruta}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json", "Accept-Language": "es" },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      return { ok: false, tipo: "incierto", mensaje: `Sin respuesta de Facturapi: ${(e as Error).message}` };
    }
    const datos = await r.json().catch(() => ({})) as { message?: string };
    if (r.status === 200 || r.status === 201) return { ok: true, valor: datos as T };
    const mensaje = datos.message ?? `Facturapi respondió ${r.status}.`;
    return { ok: false, tipo: r.status === 400 || r.status === 422 ? "rechazo" : "incierto", mensaje };
  }
  return {
    crear: (d: DatosFiscales, conceptos: ConceptoFacturapi[], llaves: { externo: string; idempotencia: string }) =>
      llamar<FacturaTimbrada>("POST", "/invoices", {
        customer: { legal_name: d.nombre, tax_id: d.rfc, tax_system: d.regimen_fiscal, email: d.correo, address: { zip: d.codigo_postal } },
        items: conceptos, payment_form: d.forma_pago, payment_method: "PUE", use: d.uso_cfdi,
        external_id: llaves.externo, idempotency_key: llaves.idempotencia,
      }),
    async buscarPorExterno(externo: string): Promise<Respuesta<FacturaTimbrada | null>> {
      const r = await llamar<{ data: FacturaTimbrada[] }>("GET", `/invoices?external_id=${encodeURIComponent(externo)}`);
      return r.ok ? { ok: true, valor: r.valor.data.find((x) => x.status === "valid") ?? null } : r;
    },
    async urlDescarga(id: string, formato: "pdf" | "xml"): Promise<Respuesta<string>> {
      const r = await llamar<{ url: string }>("GET", `/invoices/${encodeURIComponent(id)}/download-url/${formato}`);
      return r.ok ? { ok: true, valor: r.valor.url } : r;
    },
    async enviarCorreo(id: string, correo: string): Promise<Respuesta<null>> {
      const r = await llamar<unknown>("POST", `/invoices/${encodeURIComponent(id)}/email`, { email: correo });
      return r.ok ? { ok: true, valor: null } : r;
    },
    cancelar: (id: string, motivo: "02" | "03") =>
      llamar<{ status: string; cancellation_status: string }>("DELETE", `/invoices/${encodeURIComponent(id)}?motive=${motivo}`),
  };
}
export type ClienteFacturapi = ReturnType<typeof crearClienteFacturapi>;
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --experimental-strip-types --test lib/facturacion/facturapi.test.ts`
Expected: PASS en las 4 pruebas.

- [ ] **Step 5: `package.json` y commit**

```bash
git add lib/facturacion/facturapi.ts lib/facturacion/facturapi.test.ts package.json
git commit -m "feat(facturacion): cliente de la API de Facturapi"
```

---

### Task 5: Orquestación del timbrado (`lib/facturacion/timbrar.ts`)

**Files:**
- Create: `lib/facturacion/timbrar.ts`
- Test: `lib/facturacion/timbrar.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes (solo tipos): `DatosFiscales` de `./reglas.ts`; `ConceptoFacturapi` de `./conceptos.ts`; `Respuesta` y `FacturaTimbrada` de `./facturapi.ts`.
- Produces:
  - `type Base = { reservar(pedido: string, datos: DatosFiscales): Promise<{ id: string } | { error: string }>; confirmar(id: string, f: FacturaTimbrada): Promise<void>; liberar(id: string, error: string): Promise<void>; token(id: string): Promise<string> }`. La implementación real (Task 6) traduce las excepciones `YA_FACTURADO`, `EN_PROCESO:<id>:<epoch>` y `NO_FACTURABLE:<m>` a `{ error }` con ese mismo texto.
  - `type Pac = { crear(d: DatosFiscales, c: ConceptoFacturapi[], llaves: { externo: string; idempotencia: string }): Promise<Respuesta<FacturaTimbrada>>; buscarPorExterno(externo: string): Promise<Respuesta<FacturaTimbrada | null>> }`
  - `type ResultadoTimbrado = { estado: "timbrada"; id: string; token: string; uuid: string } | { estado: "rechazada"; mensaje: string } | { estado: "procesando" } | { estado: "ya_facturado" } | { estado: "no_facturable"; mensaje: string }`
  - `timbrarTicket(dep: { base: Base; pac: Pac; ahora: () => number }, pedido: string, datos: DatosFiscales, conceptos: ConceptoFacturapi[]): Promise<ResultadoTimbrado>`

Reglas:
1. Reservar. Si regresa `YA_FACTURADO` → `ya_facturado`. Si regresa `NO_FACTURABLE:*` → `no_facturable`.
2. Si regresa `EN_PROCESO:<id>:<epoch>`, buscar en Facturapi por `external_id = <id de la fila>`. Si la encuentra → `confirmar` y `timbrada`. Si no la encuentra y la fila tiene más de 120 s → `liberar(id, "Sin respuesta de Facturapi; reintento")` y volver a reservar una sola vez. Si tiene menos → `procesando`.
3. Con la fila reservada, llamar a `crear` con `externo = id de la fila` e `idempotencia = id de la fila`. Si sale bien → `confirmar` y `timbrada`. Si hay `rechazo` → `liberar` y `rechazada` con el mensaje. Si es `incierto` → se deja `en_proceso` y se regresa `procesando`.

`external_id` es el id de la fila (no el del pedido) para que, después de una cancelación, la búsqueda no confunda la factura vieja con la nueva.

- [ ] **Step 1: Escribir la prueba con dobles**

```ts
// lib/facturacion/timbrar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { timbrarTicket, type Base, type Pac } from "./timbrar.ts";

const DATOS = { rfc: "XYZ010101AB1", nombre: "C", regimen_fiscal: "601", codigo_postal: "45160", uso_cfdi: "G03" as const, correo: "a@b.mx", forma_pago: "04" as const };
const FACT = { id: "fa_1", uuid: "U1", series: "F", folio_number: 1, subtotal: 330.17, total: 383, status: "valid" };
function dobles(reservas: ({ id: string } | { error: string })[], crear: Awaited<ReturnType<Pac["crear"]>>[] = [], buscar: Awaited<ReturnType<Pac["buscarPorExterno"]>>[] = []) {
  const log: string[] = [];
  const base: Base = {
    reservar: async () => { const r = reservas.shift()!; log.push(`reservar:${"id" in r ? r.id : r.error}`); return r; },
    confirmar: async (id, f) => { log.push(`confirmar:${id}:${f.id}`); },
    liberar: async (id, e) => { log.push(`liberar:${id}:${e}`); },
    token: async (id) => `tok-${id}`,
  };
  const pac: Pac = {
    crear: async (_d, _c, ll) => { log.push(`crear:${ll.externo}:${ll.idempotencia}`); return crear.shift()!; },
    buscarPorExterno: async (e) => { log.push(`buscar:${e}`); return buscar.shift()!; },
  };
  return { log, dep: { base, pac, ahora: () => 1_000_000_000 } };
}

test("camino feliz: reservar, crear con id de fila, confirmar", async () => {
  const { log, dep } = dobles([{ id: "f1" }], [{ ok: true, valor: FACT }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "timbrada", id: "f1", token: "tok-f1", uuid: "U1" });
  assert.deepEqual(log, ["reservar:f1", "crear:f1:f1", "confirmar:f1:fa_1"]);
});

test("rechazo de Facturapi libera el ticket", async () => {
  const { log, dep } = dobles([{ id: "f1" }], [{ ok: false, tipo: "rechazo", mensaje: "CP no coincide" }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "rechazada", mensaje: "CP no coincide" });
  assert.deepEqual(log, ["reservar:f1", "crear:f1:f1", "liberar:f1:CP no coincide"]);
});

test("respuesta incierta deja la fila en proceso y no libera", async () => {
  const { log, dep } = dobles([{ id: "f1" }], [{ ok: false, tipo: "incierto", mensaje: "timeout" }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "procesando" });
  assert.deepEqual(log, ["reservar:f1", "crear:f1:f1"]);
});

test("doble clic: si ya hay otra en proceso reciente, no llama a crear", async () => {
  const { log, dep } = dobles([{ error: "EN_PROCESO:f1:999999990" }], [], [{ ok: true, valor: null }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "procesando" });
  assert.deepEqual(log, ["reservar:EN_PROCESO:f1:999999990", "buscar:f1"]);
});

test("reintento tras timeout: la factura sí se timbró → se confirma sin timbrar otra", async () => {
  const { log, dep } = dobles([{ error: "EN_PROCESO:f1:999000000" }], [], [{ ok: true, valor: FACT }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "timbrada", id: "f1", token: "tok-f1", uuid: "U1" });
  assert.deepEqual(log, ["reservar:EN_PROCESO:f1:999000000", "buscar:f1", "confirmar:f1:fa_1"]);
});

test("reintento tras timeout: no se timbró y pasaron más de 2 min → libera y reserva de nuevo", async () => {
  const { log, dep } = dobles([{ error: "EN_PROCESO:f1:999000000" }, { id: "f2" }], [{ ok: true, valor: { ...FACT, id: "fa_2" } }], [{ ok: true, valor: null }]);
  assert.equal((await timbrarTicket(dep, "P", DATOS, [])).estado, "timbrada");
  assert.deepEqual(log, ["reservar:EN_PROCESO:f1:999000000", "buscar:f1", "liberar:f1:Sin respuesta de Facturapi; reintento", "reservar:f2", "crear:f2:f2", "confirmar:f2:fa_2"]);
});

test("ya facturado y no facturable", async () => {
  assert.deepEqual(await timbrarTicket(dobles([{ error: "YA_FACTURADO" }]).dep, "P", DATOS, []), { estado: "ya_facturado" });
  assert.equal((await timbrarTicket(dobles([{ error: "NO_FACTURABLE:plazo" }]).dep, "P", DATOS, [])).estado, "no_facturable");
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --experimental-strip-types --test lib/facturacion/timbrar.test.ts`
Expected: FAIL con `Cannot find module`.

- [ ] **Step 3: Implementar**

```ts
// lib/facturacion/timbrar.ts
/** Reservar → timbrar → confirmar o liberar. Las dependencias se inyectan para probar doble clic y timeouts sin red ni base. */
import type { ConceptoFacturapi } from "./conceptos";
import type { FacturaTimbrada, Respuesta } from "./facturapi";
import type { DatosFiscales } from "./reglas";

export type Base = {
  reservar(pedido: string, datos: DatosFiscales): Promise<{ id: string } | { error: string }>;
  confirmar(id: string, f: FacturaTimbrada): Promise<void>;
  liberar(id: string, error: string): Promise<void>;
  token(id: string): Promise<string>;
};
export type Pac = {
  crear(d: DatosFiscales, c: ConceptoFacturapi[], llaves: { externo: string; idempotencia: string }): Promise<Respuesta<FacturaTimbrada>>;
  buscarPorExterno(externo: string): Promise<Respuesta<FacturaTimbrada | null>>;
};
export type ResultadoTimbrado =
  | { estado: "timbrada"; id: string; token: string; uuid: string }
  | { estado: "rechazada"; mensaje: string } | { estado: "procesando" } | { estado: "ya_facturado" } | { estado: "no_facturable"; mensaje: string };

const ESPERA_MS = 120_000;

export async function timbrarTicket(dep: { base: Base; pac: Pac; ahora: () => number }, pedido: string, datos: DatosFiscales, conceptos: ConceptoFacturapi[], reintento = false): Promise<ResultadoTimbrado> {
  const { base, pac } = dep;
  const listo = async (id: string, f: FacturaTimbrada): Promise<ResultadoTimbrado> => {
    await base.confirmar(id, f);
    return { estado: "timbrada", id, token: await base.token(id), uuid: f.uuid };
  };
  const r = await base.reservar(pedido, datos);
  if ("error" in r) {
    if (r.error === "YA_FACTURADO") return { estado: "ya_facturado" };
    if (r.error.startsWith("NO_FACTURABLE:")) return { estado: "no_facturable", mensaje: r.error.slice(14) };
    const m = /^EN_PROCESO:([^:]+):(\d+)$/.exec(r.error);
    if (!m) throw new Error(r.error);
    const [, id, epoch] = m;
    const previa = await pac.buscarPorExterno(id);
    if (previa.ok && previa.valor) return listo(id, previa.valor);
    if (!previa.ok || reintento || dep.ahora() - Number(epoch) * 1000 < ESPERA_MS) return { estado: "procesando" };
    await base.liberar(id, "Sin respuesta de Facturapi; reintento");
    return timbrarTicket(dep, pedido, datos, conceptos, true);
  }
  const c = await pac.crear(datos, conceptos, { externo: r.id, idempotencia: r.id });
  if (c.ok) return listo(r.id, c.valor);
  if (c.tipo === "rechazo") { await base.liberar(r.id, c.mensaje); return { estado: "rechazada", mensaje: c.mensaje }; }
  return { estado: "procesando" };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --experimental-strip-types --test lib/facturacion/timbrar.test.ts`
Expected: PASS en las 7 pruebas.

- [ ] **Step 5: `package.json` y commit**

```bash
git add lib/facturacion/timbrar.ts lib/facturacion/timbrar.test.ts package.json
git commit -m "feat(facturacion): orquestación del timbrado con reserva e idempotencia"
```

---

### Task 6: Portal público `/facturar`

**Files:**
- Create: `app/facturar/page.tsx`, `app/facturar/Flujo.tsx`, `app/facturar/acciones.ts`, `app/facturar/facturar.module.css`, `app/facturar/descargar/route.ts`, `lib/facturacion/servidor.ts`
- Modify: `lib/rutasPublicas.ts`, `lib/rutasPublicas.test.ts`

**Interfaces:**
- Consumes: todo lo de las Tasks 1 a 5; `crearClienteAdmin` (`lib/supabase/admin.ts`); `leerConstancia` (`lib/compras/constancia.ts`); `REGIMENES` (`lib/compras/proveedores.ts`).
- Produces (server actions en `app/facturar/acciones.ts`):
  - `buscarTicket(_: EstadoBusqueda, fd: FormData): Promise<EstadoBusqueda>` con `EstadoBusqueda = { error?: string; ticket?: { pedido: string; fecha: string; hora: string; total: number; pago: PagoPedido; productos: { nombre: string; precio: number }[] }; facturado?: { factura: string; correo: string } }`
  - `leerConstanciaCliente(fd: FormData): Promise<{ datos?: { rfc: string; nombre: string; codigo_postal: string | null; regimen: string | null }; error?: string }>`
  - `facturar(_: EstadoFactura, fd: FormData): Promise<EstadoFactura>` con `EstadoFactura = { error?: string; listo?: { id: string; token: string; uuid: string }; procesando?: boolean }`
  - `reenviar(fd: FormData): Promise<{ ok?: boolean; error?: string }>`

- [ ] **Step 1: Ruta pública (TDD)**

En `lib/rutasPublicas.test.ts`, agregar `"/facturar"` y `"/facturar/descargar"` a la primera lista (sí entran sin sesión) y `"/facturacion"` a la segunda.
Run: `node --experimental-strip-types --test lib/rutasPublicas.test.ts`. Expected: FAIL.
En `lib/rutasPublicas.ts`, agregar `"/facturar"` a `CON_PREFIJO`. Actualizar el comentario: "…y el portal de facturación de tickets, que es público y solo usa funciones de servidor".
Run de nuevo. Expected: PASS.

- [ ] **Step 2: `lib/facturacion/servidor.ts`, la unión con la base y Facturapi (solo servidor)**

```ts
// lib/facturacion/servidor.ts
import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteFacturapi } from "./facturapi";
import type { Base } from "./timbrar";

export function facturapi() {
  const llave = process.env.FACTURAPI_KEY?.trim();
  if (!llave) throw new Error("Configura FACTURAPI_KEY en el servidor.");
  return crearClienteFacturapi(llave);
}

/** Implementación real de Base: las excepciones de SQL (YA_FACTURADO, EN_PROCESO:…, NO_FACTURABLE:…) se regresan como { error }. */
export function baseFacturacion(): Base {
  const db = crearClienteAdmin();
  return {
    async reservar(pedido, datos) {
      const { data, error } = await db.rpc("facturacion_reservar", { p_pedido: pedido, p_datos: datos });
      if (error) {
        if (/^(YA_FACTURADO|EN_PROCESO:|NO_FACTURABLE:)/.test(error.message)) return { error: error.message };
        throw new Error(error.message);
      }
      return { id: data as string };
    },
    async confirmar(id, f) {
      const { error } = await db.rpc("facturacion_confirmar", { p_id: id, p_facturapi_id: f.id, p_uuid: f.uuid, p_serie: f.series, p_folio: f.folio_number, p_subtotal: f.subtotal, p_iva: Math.round((f.total - f.subtotal) * 100) / 100 });
      if (error) throw new Error(error.message);
    },
    async liberar(id, mensaje) {
      const { error } = await db.rpc("facturacion_liberar", { p_id: id, p_error: mensaje });
      if (error) throw new Error(error.message);
    },
    async token(id) {
      const { data, error } = await db.from("facturas_clientes").select("token_descarga").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data.token_descarga as string;
    },
  };
}

export async function sucursalFacturacion(): Promise<{ id: string; nombre: string }> {
  const { data, error } = await crearClienteAdmin().from("facturacion_sucursales").select("sucursal_id, sucursales(nombre)").limit(1).single();
  if (error) throw new Error(error.message);
  return { id: data.sucursal_id as string, nombre: (data.sucursales as unknown as { nombre: string }).nombre };
}
```

Nota: `service_role` se salta RLS, así que `select` sobre `facturas_clientes` y `facturacion_sucursales` funciona con el cliente admin.

- [ ] **Step 3: Server actions `app/facturar/acciones.ts`**

```ts
"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { leerConstancia } from "@/lib/compras/constancia";
import { REGIMENES } from "@/lib/compras/proveedores";
import { armarConceptos } from "@/lib/facturacion/conceptos";
import { CORREO_FACTURACION, mensajeBusqueda, validarDatosFiscales, type PagoPedido, type ResultadoBusqueda } from "@/lib/facturacion/reglas";
import { timbrarTicket } from "@/lib/facturacion/timbrar";
import { baseFacturacion, facturapi, sucursalFacturacion } from "@/lib/facturacion/servidor";

export type Ticket = { pedido: string; fecha: string; hora: string; total: number; pago: PagoPedido; productos: { nombre: string; precio: number }[] };
export type EstadoBusqueda = { error?: string; ticket?: Ticket; facturado?: { factura: string; correo: string } };
export type EstadoFactura = { error?: string; listo?: { id: string; token: string; uuid: string }; procesando?: boolean };

const ipHash = async () => {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconocida";
  return createHash("sha256").update(`facturar|${ip}`).digest("hex");
};

export async function buscarTicket(_: EstadoBusqueda, fd: FormData): Promise<EstadoBusqueda> {
  const fecha = String(fd.get("fecha") ?? ""), hora = String(fd.get("hora") ?? ""), total = Number(String(fd.get("total") ?? "").replace(/[$,\s]/g, ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora) || !(total > 0)) return { error: "Escribe la fecha, la hora y el total del ticket." };
  const sucursal = await sucursalFacturacion();
  const { data, error } = await crearClienteAdmin().rpc("facturacion_buscar_ticket", { p_ip: await ipHash(), p_sucursal: sucursal.id, p_fecha: fecha, p_hora: hora, p_total: total });
  if (error) return { error: `No pudimos buscar el ticket. Intenta de nuevo o escríbenos a ${CORREO_FACTURACION}.` };
  const r = (data as { resultado: ResultadoBusqueda; pedido_id: string; fecha: string; hora: string; total: number; pago: PagoPedido; productos: Ticket["productos"]; factura_id: string; correo: string }[])[0];
  if (r.resultado === "facturado") return { facturado: { factura: r.factura_id, correo: r.correo } };
  if (r.resultado !== "ok") return { error: mensajeBusqueda(r.resultado) };
  return { ticket: { pedido: r.pedido_id, fecha: r.fecha, hora: r.hora.slice(0, 5), total: Number(r.total), pago: r.pago, productos: r.productos.map((p) => ({ nombre: p.nombre, precio: Number(p.precio) })) } };
}

export async function leerConstanciaCliente(fd: FormData) {
  const a = fd.get("constancia");
  if (!(a instanceof File) || a.size === 0) return { error: "Elige el PDF de tu constancia." };
  if (a.size > 4 * 1024 * 1024) return { error: "La constancia pesa más de 4 MB." };
  const c = leerConstancia(new Uint8Array(await a.arrayBuffer()), REGIMENES);
  if ("error" in c) return { error: c.error };
  const regimen = c.datos.regimenes.find((r) => !r.fin && r.codigo)?.codigo ?? null;
  return { datos: { rfc: c.datos.rfc, nombre: c.datos.razon_social, codigo_postal: c.datos.codigo_postal, regimen } };
}

export async function facturar(_: EstadoFactura, fd: FormData): Promise<EstadoFactura> {
  // Se vuelve a buscar con los datos del ticket: el pedido nunca viene del navegador sin comprobar fecha, hora y total.
  const busqueda = await buscarTicket({}, fd);
  if (busqueda.facturado) return { error: "Este ticket ya se facturó." };
  if (!busqueda.ticket) return { error: busqueda.error };
  const t = busqueda.ticket;
  const v = validarDatosFiscales(Object.fromEntries([...fd.entries()].map(([k, x]) => [k, String(x)])), t.pago, REGIMENES);
  if ("error" in v) return { error: v.error };
  const c = armarConceptos(t.productos, t.total);
  if ("error" in c) return { error: `${c.error} Escríbenos a ${CORREO_FACTURACION}.` };
  const r = await timbrarTicket({ base: baseFacturacion(), pac: facturapi(), ahora: Date.now }, t.pedido, v.datos, c.conceptos);
  switch (r.estado) {
    case "timbrada": return { listo: { id: r.id, token: r.token, uuid: r.uuid } };
    case "rechazada": return { error: `El SAT rechazó los datos: ${r.mensaje} Revisa que coincidan con tu constancia.` };
    case "procesando": return { procesando: true };
    case "ya_facturado": return { error: "Este ticket ya se facturó." };
    case "no_facturable": return { error: mensajeBusqueda(r.mensaje === "plazo" ? "fuera_de_plazo" : "no_facturable") };
  }
}

/** Reenvía al correo con que se facturó (nunca a uno nuevo): solo con fecha, hora y total del ticket. */
export async function reenviar(fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  const b = await buscarTicket({}, fd);
  if (!b.facturado) return { error: "No encontramos una factura para este ticket." };
  const { data, error } = await crearClienteAdmin().from("facturas_clientes").select("facturapi_id, correo").eq("id", b.facturado.factura).eq("estado", "timbrada").single();
  if (error || !data) return { error: "No encontramos la factura." };
  const r = await facturapi().enviarCorreo(data.facturapi_id as string, data.correo as string);
  return r.ok ? { ok: true } : { error: "No pudimos reenviarla. Intenta más tarde." };
}
```

Importante: `facturar` y `reenviar` vuelven a ejecutar `buscarTicket`, que suma un intento al límite por IP. Es a propósito: también limita los timbrados en ráfaga.

- [ ] **Step 4: Ruta de descarga `app/facturar/descargar/route.ts`**

```ts
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { facturapi } from "@/lib/facturacion/servidor";
export const dynamic = "force-dynamic";

/** /facturar/descargar?f=<id>&t=<token>&formato=pdf|xml → redirige a la URL temporal de Facturapi. El token solo lo recibe quien timbró. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, formato = q.get("formato") === "xml" ? "xml" : "pdf";
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(q.get("f") ?? "") || !uuid.test(q.get("t") ?? "")) return new Response("Enlace inválido.", { status: 404 });
  const { data } = await crearClienteAdmin().rpc("facturacion_para_descarga", { p_id: q.get("f"), p_token: q.get("t") });
  if (!data) return new Response("Enlace inválido.", { status: 404 });
  const r = await facturapi().urlDescarga(data as string, formato);
  if (!r.ok) return new Response("No pudimos obtener el archivo. Intenta en un momento.", { status: 502 });
  return Response.redirect(r.valor, 302);
}
```

El token viaja en la URL de descarga. No es un dato personal: es un identificador aleatorio de un solo ticket y no se guarda en ningún registro.

- [ ] **Step 5: Página y flujo del cliente**

`app/facturar/page.tsx`, componente de servidor sin `Marco`:

```tsx
import { sucursalFacturacion } from "@/lib/facturacion/servidor";
import { REGIMENES } from "@/lib/compras/proveedores";
import { Flujo } from "./Flujo";
import s from "./facturar.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Factura tu ticket · Dodo Pizza" };

export default async function Facturar() {
  const sucursal = await sucursalFacturacion();
  return (
    <main className={s.pagina}>
      <header className={s.encabezado}><img src="/logo-dodo.png" alt="Dodo Pizza" width={56} height={56} /><h1>Factura tu ticket</h1></header>
      <p className={s.nota}>Sucursal {sucursal.nombre}. Solo tickets del mes en curso.</p>
      <Flujo regimenes={REGIMENES} />
    </main>
  );
}
```

`app/facturar/Flujo.tsx` (`"use client"`) tiene tres pasos con `useActionState`:

1. Formulario de búsqueda: `fecha` (`type="date"`, `max` = hoy), `hora` (`type="time"`) y `total` (`inputMode="decimal"`), con el botón "Buscar ticket". Al buscar se conservan los tres valores en el estado del cliente.
2. Si `ticket` existe: lista de productos y total, y debajo el formulario de datos fiscales. Ese formulario repite fecha, hora y total en `<input type="hidden">` y trae:
   - un `<input type="file" accept="application/pdf">` "Llenar con mi constancia" que llama a `leerConstanciaCliente` y escribe los valores en los campos, con el mismo patrón `poner()` de `app/compras/CampoConstancia.tsx`;
   - RFC, nombre o razón social (con la ayuda "Sin S.A. de C.V., como en tu constancia"), régimen (`<select>` con `regimenes`), código postal, uso del CFDI (`<select>` con las opciones de `usosPermitidos(regimen)`, que se recalcula al cambiar el régimen; `usosPermitidos` y `USOS_CFDI` se importan de `@/lib/facturacion/reglas`) y correo;
   - si `pideTipoTarjeta(ticket.pago)`: radios `tarjeta` = `credito` | `debito`.

   El botón "Facturar" se desactiva mientras se envía.
3. Si `listo`: "¡Listo! Te enviamos la factura a tu correo", el folio fiscal (`uuid`) y botones "Descargar PDF" y "Descargar XML" que apuntan a `/facturar/descargar?f=${id}&t=${token}&formato=pdf|xml`.
   - Si `procesando`: "Estamos timbrando tu factura. Vuelve a intentar en 2 minutos con los mismos datos; no se duplicará."
   - Si `facturado`: "Este ticket ya se facturó y se envió a {correo}", con un botón "Reenviar factura" que llama a `reenviar` con fecha, hora y total.

Errores con el componente `Aviso` (`@/components/Aviso`). `facturar.module.css`: columna de máximo 480 px centrada, `padding: 16px`, botones de ancho completo en móvil y colores con las variables de `app/globals.css`.

- [ ] **Step 6: Verificar tipos y pruebas**

Run: `npm run typecheck && npm test`
Expected: sin errores de tipos; todas las pruebas pasan.

- [ ] **Step 7: Prueba manual local con la llave de prueba**

Con `FACTURAPI_KEY=sk_test_…` en `.env.local` (Sebastián la pega ahí; no va al chat), levantar el dev server con `preview_start` y abrir `/facturar` en el tamaño `mobile`. Buscar un pedido real de este mes (tomar fecha, hora y total de Ventas → Dodo IS). Facturar con el RFC de pruebas de Facturapi: confirmar en su documentación el RFC de receptor válido en modo de pruebas (por ejemplo `EKU9003173C9` con su razón social, CP y régimen de ejemplo). Verificar:
- que se descargan el PDF y el XML;
- que una segunda búsqueda dice "ya se facturó";
- que el doble clic no crea dos facturas en el panel de Facturapi.

**Ojo:** esto escribe en la base de producción. Usar la base de la rama de Preview solo si tiene pedidos; si no, hacerlo en el Preview de Vercel después de que Sebastián corra la migración (ver Task 8).

- [ ] **Step 8: Commit**

```bash
git add app/facturar lib/facturacion/servidor.ts lib/rutasPublicas.ts lib/rutasPublicas.test.ts
git commit -m "feat(facturacion): portal público para facturar tickets"
```

---

### Task 7: Oficina, en Finanzas → Facturación

**Files:**
- Create: `app/finanzas/facturacion/page.tsx`, `app/finanzas/facturacion/acciones.ts`, `app/finanzas/facturacion/excel/route.ts`, `lib/facturacion/excel.ts`, `lib/facturacion/excel.test.ts`
- Modify: `app/finanzas/page.tsx` (botón junto a "Catálogo contable"), `package.json`

**Interfaces:**
- Consumes: la tabla `facturas_clientes` por RLS (admin y corporativo); `facturacion_registrar_cancelacion`; `facturapi()` de `lib/facturacion/servidor.ts`; `escribirXlsx` y `HojaXlsx` de `lib/xlsx-escribir.ts`.
- Produces:
  - `type FilaFacturaCliente = { creada: string; pedido_id: string; rfc: string; nombre: string; subtotal: number | null; iva: number | null; total: number; uuid: string | null; estado: string; serie: string | null; folio: number | null }`
  - `hojaFacturasClientes(filas: readonly FilaFacturaCliente[], mes: string): HojaXlsx`, con la hoja "Facturas {mes}", encabezado, una fila por factura y totales al final **solo de las timbradas**.

- [ ] **Step 1: Prueba de la hoja (falla)**

```ts
// lib/facturacion/excel.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaFacturasClientes } from "./excel.ts";

const F = (estado: string, total: number) => ({ creada: "2026-11-04T23:40:00Z", pedido_id: "A", rfc: "XYZ010101AB1", nombre: "C", subtotal: 330.17, iva: 52.83, total, uuid: "U", estado, serie: "F", folio: 1 });

test("una fila por factura y totales solo de timbradas", () => {
  const h = hojaFacturasClientes([F("timbrada", 383), F("cancelada", 100), F("timbrada", 116)], "2026-11");
  assert.equal(h.nombre, "Facturas 2026-11");
  assert.deepEqual(h.filas[0], ["Fecha", "Ticket", "RFC", "Nombre", "Subtotal", "IVA", "Total", "Folio fiscal (UUID)", "Serie y folio", "Estado"]);
  assert.equal(h.filas.length, 5);
  const ultima = h.filas[4];
  assert.equal(ultima[0], "Total timbrado");
  assert.deepEqual(ultima[6], { valor: 499, formato: "pesos" });
});

test("fecha en hora de México", () => {
  const h = hojaFacturasClientes([{ ...F("timbrada", 1), creada: "2026-11-01T05:30:00Z" }], "2026-10");
  assert.deepEqual(h.filas[1][0], { fecha: "2026-10-31" });
});
```

Run: `node --experimental-strip-types --test lib/facturacion/excel.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implementar `lib/facturacion/excel.ts`**

```ts
// lib/facturacion/excel.ts
import type { Celda, HojaXlsx } from "../xlsx-escribir";
export type FilaFacturaCliente = { creada: string; pedido_id: string; rfc: string; nombre: string; subtotal: number | null; iva: number | null; total: number; uuid: string | null; estado: string; serie: string | null; folio: number | null };

const diaMX = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" });
const pesos = (n: number | null): Celda => (n === null ? null : { valor: Math.round(n * 100) / 100, formato: "pesos" });
const ESTADO: Record<string, string> = { timbrada: "Timbrada", cancelada: "Cancelada", en_proceso: "Por confirmar", error: "Rechazada" };

export function hojaFacturasClientes(filas: readonly FilaFacturaCliente[], mes: string): HojaXlsx {
  const t = filas.filter((f) => f.estado === "timbrada"), suma = (k: "subtotal" | "iva" | "total") => t.reduce((s, f) => s + Number(f[k] ?? 0), 0);
  return {
    nombre: `Facturas ${mes}`,
    filas: [
      ["Fecha", "Ticket", "RFC", "Nombre", "Subtotal", "IVA", "Total", "Folio fiscal (UUID)", "Serie y folio", "Estado"],
      ...filas.map((f): Celda[] => [{ fecha: diaMX.format(new Date(f.creada)) }, f.pedido_id, f.rfc, f.nombre, pesos(f.subtotal), pesos(f.iva), pesos(f.total), f.uuid, f.serie ? `${f.serie}-${f.folio}` : null, ESTADO[f.estado] ?? f.estado]),
      ["Total timbrado", null, null, null, pesos(suma("subtotal")), pesos(suma("iva")), pesos(suma("total")), null, null, `${t.length} facturas`],
    ],
    negritas: [0, filas.length + 1], anchos: [12, 36, 15, 36, 12, 12, 12, 38, 12, 14], inmovilizar: 1,
  };
}
```

Si `escribirXlsx` espera la `fecha` en otro formato, revisar `lib/xlsx-escribir.ts:8-15` y ajustar la prueba y la implementación juntas.

Run: `node --experimental-strip-types --test lib/facturacion/excel.test.ts`. Expected: PASS. Agregar a `package.json`.

- [ ] **Step 3: Acciones `app/finanzas/facturacion/acciones.ts`**

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas } from "@/lib/roles";
import { facturapi } from "@/lib/facturacion/servidor";

const volver = (q: string) => redirect(`/finanzas/facturacion?${q}`);

export async function cancelarFactura(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver("error=Solo administración puede cancelar.");
  const id = String(fd.get("id")), motivo = fd.get("motivo") === "03" ? "03" : "02";
  const { data: f } = await supabase.from("facturas_clientes").select("facturapi_id, estado").eq("id", id).single();
  if (!f || f.estado !== "timbrada") volver("error=La factura no está timbrada.");
  const r = await facturapi().cancelar(f!.facturapi_id as string, motivo);
  if (!r.ok) volver(`error=${encodeURIComponent(`Facturapi no canceló: ${r.mensaje}`)}`);
  if (r.ok && r.valor.status !== "canceled") volver("error=La cancelación quedó pendiente de que el cliente la acepte en el SAT. Revisa más tarde.");
  const { error } = await supabase.rpc("facturacion_registrar_cancelacion", { p_id: id, p_motivo: motivo });
  if (error) volver(`error=${encodeURIComponent(error.message)}`);
  revalidatePath("/finanzas/facturacion");
  volver("ok=Factura cancelada. El cliente puede volver a facturar su ticket.");
}

export async function reenviarFactura(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver("error=Solo administración puede reenviar.");
  const { data: f } = await supabase.from("facturas_clientes").select("facturapi_id, correo").eq("id", String(fd.get("id"))).eq("estado", "timbrada").single();
  if (!f) volver("error=La factura no está timbrada.");
  const r = await facturapi().enviarCorreo(f!.facturapi_id as string, f!.correo as string);
  volver(r.ok ? `ok=Reenviada a ${encodeURIComponent(f!.correo as string)}.` : "error=No se pudo reenviar.");
}
```

- [ ] **Step 4: Página `app/finanzas/facturacion/page.tsx`**

Componente de servidor. El layout de Finanzas ya exige `puedeVerFinanzas`. Hace lo siguiente:
- Lee `mes` de `searchParams` con el mismo patrón que `app/finanzas/mermas/page.tsx:17`, y consulta `supabase.from("facturas_clientes").select("id, creada, pedido_id, rfc, nombre, correo, total, uuid, serie, folio, estado, error, motivo_cancelacion").gte("creada", inicioMesMX).lt("creada", inicioSiguienteMX).order("creada", { ascending: false })`. Los límites se calculan en hora de México: `${mes}-01T00:00:00-06:00` (México no tiene horario de verano desde 2022).
- `EncabezadoPagina` con el título "Facturación de tickets", un selector de mes (`<input type="month">` en un `<form method="get">`) y el botón "Excel del mes" hacia `/finanzas/facturacion/excel?mes=…`.
- Resumen: número de facturas timbradas y suma de su total con `pesos()` de `lib/formato`.
- Una tarjeta por factura (clase `seccion`), siguiendo la preferencia del proyecto por tarjetas sobre tablas anchas. Cada tarjeta muestra: nombre y RFC; total; fecha y hora (`fechaMX`, `hora`); el estado con etiqueta, donde `en_proceso` se muestra como "Por confirmar" y `error` como "Rechazada", con el mensaje; y el UUID en letra chica.
- Si `puedeEditarFinanzas(perfil.rol)` y el estado es `timbrada`: formulario `cancelarFactura` con un `<select name="motivo">` (02 "Errores sin relación", 03 "No se llevó a cabo la operación") y un `BotonEnviar` con confirmación, y formulario `reenviarFactura`.
- `Aviso` con `ok` y `error` de `searchParams`.

- [ ] **Step 5: Excel `app/finanzas/facturacion/excel/route.ts`**

Copia el patrón de `app/reporte/ventas/excel/route.ts`:
- `obtenerPerfil()`; si no `puedeVerFinanzas`, responde 403.
- Hace la misma consulta del mes y regresa `escribirXlsx([hojaFacturasClientes(filas, mes)])`.
- El archivo se llama `Facturas tickets ${mes}.xlsx`, con los mismos encabezados `Content-Disposition` y `Cache-Control`.

- [ ] **Step 6: Enlace desde Finanzas**

En `app/finanzas/page.tsx`, junto a la línea 79, agregar:
`<Link className="boton boton-secundario boton-compacto" href="/finanzas/facturacion">Facturación de tickets</Link>`

- [ ] **Step 7: Tipos, pruebas y revisión visual**

Run: `npm run typecheck && npm test`. Expected: todo verde.
Con `preview_start`, entrar como admin a `/finanzas/facturacion`, revisar la tarjeta de la factura de prueba de la Task 6, descargar el Excel y abrirlo, y cancelarla con el motivo 02. Confirmar que `/facturar` vuelve a permitir facturar el ticket.

- [ ] **Step 8: Commit**

```bash
git add app/finanzas/facturacion app/finanzas/page.tsx lib/facturacion/excel.ts lib/facturacion/excel.test.ts package.json
git commit -m "feat(facturacion): pantalla de oficina, cancelación y Excel del mes"
```

---

### Task 8: Entrega, PR y paso a producción

**Files:**
- Modify: `README.md` (sección "Facturación de tickets": variables, flujo y qué hacer con "Por confirmar")

- [ ] **Step 1: README**

Agregar una sección con:
- variable `FACTURAPI_KEY` (de prueba en Preview y real en Production);
- ruta pública `/facturar`;
- reglas (mes en curso, exclusiones);
- qué hacer con una factura "Por confirmar": buscar en el panel de Facturapi por `external_id` = id de la fila; si existe, el cliente puede reintentar y se confirma sola;
- las claves SAT, que se cambian en `lib/facturacion/conceptos.ts`.

- [ ] **Step 2: Verificación completa**

Run: `npm run typecheck && npm test && npm run build`
Expected: todo verde. Pegar el resumen de la salida en el PR.

- [ ] **Step 3: Push y PR**

```bash
git push -u origin feat/facturacion-tickets
gh pr create --repo HelperHolding/dodo-money --base main --title "Autofacturación de tickets con Facturapi" --body-file <archivo con resumen, pruebas y entregas de Sebastián>
```

El cuerpo del PR termina con la línea de atribución de Claude Code. Revisar el diff completo del PR y esperar `Historial válido` y `Pruebas y tipos`.

- [ ] **Step 4: Entregas de Sebastián (en este orden; no publicar `/facturar` antes del paso 3)**

1. En Facturapi: crear la organización Helper Comercializadora Master, subir el CSD (.cer, .key y contraseña) y configurar el logo y la serie (por ejemplo `T`).
2. En Vercel: `FACTURAPI_KEY` con la llave de prueba en Preview y la real en Production.
3. En Supabase (producción, ver la memoria "Proyecto Supabase correcto"): ejecutar `supabase/migrations/20261106120000_facturacion_clientes.sql` y luego `supabase/pruebas/20261106120000_facturacion_clientes.sql`. El resultado esperado es `ERROR: PRUEBAS OK`. Pegar el resultado en el PR.
4. Prueba de punta a punta en el Preview del PR con la llave de prueba (mismos pasos que la Task 6, Step 7) y una cancelación desde la oficina (Task 7, Step 7).
5. Confirmar con el contador las claves `90101501` y `E48` y que el uso de forma de pago 04/28 para pagos en línea es correcto. Si cambian, ajustar `lib/facturacion/conceptos.ts` en este mismo PR.
6. Integrar el PR. Ya en producción, facturar un ticket real de bajo monto, revisar el XML en el portal del SAT y cancelarlo si era solo de prueba.
7. Cambiar el pie del ticket en Dodo IS: "Factura en línea: https://<dominio>/facturar".

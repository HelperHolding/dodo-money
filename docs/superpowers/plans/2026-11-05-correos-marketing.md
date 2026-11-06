# Correos de marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sección «Correos» en DODO MX para que marketing cree campañas HTML, las mande (vía n8n por SMTP) a una base de contactos con bajas y vea aperturas y clics.

**Architecture:** Supabase guarda contactos, campañas, envíos y eventos; las transiciones y la reserva de correos son funciones SQL `security definer`. La app (Next.js) prepara el HTML con enlaces de seguimiento, sirve el píxel, la redirección de clics y la página de baja. n8n consulta `POST /api/correos/siguiente` cada minuto, manda por SMTP y reporta a `POST /api/correos/resultado`.

**Tech Stack:** Next.js 15 (App Router, server actions), Supabase (Postgres + RLS), TypeScript, `node --test` con `--experimental-strip-types`, PGlite para pruebas SQL, n8n.

**Spec:** `docs/superpowers/specs/2026-11-05-correos-marketing-design.md`

## Global Constraints

- Rama `feat/correos-marketing`, PR hacia `main`; nada directo a `main`; pasar «Historial válido» y «Pruebas y tipos».
- Una sola migración nueva: `supabase/migrations/20261106120000_correos_marketing.sql`. Se entrega a Sebastián para correrla en producción; la sección no se publica hasta tener su resultado.
- `alter type rol_usuario add value 'marketing'` va en la migración; en esa misma migración **nunca** convertir `'marketing'` a `rol_usuario` (comparar siempre `mi_rol()::text`), porque un valor de enum nuevo no se puede usar en la misma transacción.
- Remitente fijo `Dodo Pizza México <hola@dodopizza.mx>`, responder a `hola@dodopizza.mx`.
- Zona horaria `America/Mexico_City` para todo lo que se muestra o se programa.
- Lote máximo 8; pausa 5 s entre correos en n8n; envíos `procesando` de más de 15 min → `problema`; aviso «Esperando a n8n» a los 10 min sin consulta; clics en los primeros 10 s tras `enviado_en` son `sospechoso`.
- Prueba de campaña: máximo 5 destinatarios, asunto con prefijo `[PRUEBA] `, `es_prueba = true`, nunca cuenta en estadísticas.
- HTML máximo 500 000 caracteres; asunto 1–150; nombre 1–120.
- Dominios de clic permitidos: `dodopizza.mx` y subdominios + `CORREOS_DOMINIOS_EXTRA` (coma). Lo demás redirige a `https://dodopizza.mx/`.
- UTM: `utm_source=correo&utm_medium=email&utm_campaign=<slug>` solo si la URL no trae `utm_source`.
- Variables nuevas: `CORREOS_API_KEY` (obligatoria), `CORREOS_DOMINIOS_EXTRA` (opcional). La URL pública sale de `APP_URL`.
- Mensajes al usuario en español; los errores propios de la base usan `raise exception` (código P0001) y llegan tal cual; los demás se ocultan con `mensajeDe`.
- Puestos: `marketing` y `admin` editan; `corporativo` solo consulta campañas y estadísticas (no Contactos); el resto no ve la sección.
- Los correos de clientes **no** se versionan: los 249 contactos se cargan con la importación de CSV de la propia sección (cambio respecto a la sección 8 del spec; la tarea 13 actualiza el spec).
- Agregar cada archivo de prueba nuevo a `scripts.test` de `package.json`.

## Review Focus

1. HTML de Canva con enlaces `href='...'` (comillas simples) o con `&amp;` en la URL: deben reescribirse y la redirección debe llegar a la URL original decodificada.
2. Dos ejecuciones de n8n que se empalman (la del minuto anterior aún mandando): ningún correo se reserva dos veces.
3. Contacto que se da de baja después de armarse la lista pero antes de que salga su correo: no se le manda y «Reintentar con problema» no lo revive.
4. CSV exportado de Excel con BOM, `;` como separador, encabezados en mayúsculas o correos con espacios/mayúsculas: se importa igual y sin duplicados.
5. Programar una campaña con fecha en el pasado o a una etiqueta sin contactos activos: se rechaza con mensaje claro, no queda «enviando» para siempre.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261106120000_correos_marketing.sql` | Puesto marketing, tablas, RLS y funciones SQL de correos |
| `tests/correosBase.mjs` | Stub mínimo de Supabase para PGlite (copia enums y CHECK reales) |
| `tests/correos.test.mjs` | Pruebas SQL: permisos, transiciones, reserva, eventos, bajas |
| `lib/tipos.ts` | `Rol` incluye `"marketing"` |
| `lib/roles.ts` | `NOMBRE_ROL`, `puedeVerCorreos`, `puedeEditarCorreos`, menú y accesos de marketing |
| `lib/contexto.ts` | Marketing que entra a una página de sucursal va a `/correos` |
| `lib/rutasPublicas.ts` | `/api/correos/` y `/baja/` sin sesión |
| `lib/correos/preparar.ts` | Reescritura de enlaces, píxel, pie de baja y texto plano (puro) |
| `lib/correos/destino.ts` | Validación del destino del clic y UTM (puro) |
| `lib/correos/html.ts` | Limpieza del HTML subido (puro) |
| `lib/correos/csv.ts` | Lectura del CSV de contactos (puro) |
| `lib/correos/estadisticas.ts` | Números de una campaña a partir de envíos y eventos (puro) |
| `lib/correos/tipos.ts` | Tipos compartidos y `slug` |
| `app/api/correos/siguiente/route.ts` | n8n pide el siguiente lote |
| `app/api/correos/resultado/route.ts` | n8n reporta el resultado |
| `app/api/correos/a/[token]/route.ts` | Píxel de apertura |
| `app/api/correos/c/[token]/route.ts` | Redirección de clic |
| `app/baja/[token]/page.tsx`, `app/baja/[token]/acciones.ts` | Página pública de baja |
| `app/correos/layout.tsx`, `page.tsx`, `datos.ts`, `acciones.ts`, `correos.module.css` | Lista de campañas, lecturas y acciones |
| `app/correos/nueva/page.tsx`, `app/correos/[id]/editar/page.tsx`, `app/correos/FormCampana.tsx` | Crear y editar |
| `app/correos/[id]/page.tsx`, `app/correos/[id]/csv/route.ts` | Estadísticas y CSV |
| `app/correos/contactos/page.tsx`, `app/correos/contactos/acciones.ts` | Contactos e importación |
| `app/administracion/usuarios/Invitar.tsx`, `Lista.tsx` | Marketing sin sucursal en invitar/editar |
| `scripts/n8n/flujo-correos.mjs`, `docs/n8n/correos-dodo-money.json`, `tests/n8nCorreos.test.mjs` | Flujo de n8n |

---

### Task 1: Puesto `marketing`

**Files:**
- Create: `supabase/migrations/20261106120000_correos_marketing.sql`
- Create: `tests/correosBase.mjs`, `tests/correos.test.mjs`
- Modify: `lib/tipos.ts:1`, `lib/roles.ts`, `lib/roles.test.ts`, `lib/contexto.ts:33-37`, `app/administracion/usuarios/Invitar.tsx:22-23`, `app/administracion/usuarios/Lista.tsx:15,28,32`, `package.json` (scripts.test)

**Interfaces:**
- Produces: `Rol` con `"marketing"`; `puedeVerCorreos(rol: Rol): boolean`; `puedeEditarCorreos(rol: Rol): boolean`; SQL `puede_ver_correos()`, `puede_editar_correos()` (boolean, `security definer`); `tests/correosBase.mjs` exporta `BASE`, `U` (`admin`, `corp`, `mkt`, `gerente`), `como(db,id)`, `nueva()`.

- [ ] **Step 1: Leer las funciones a extender**

Run: `grep -n "'corporativo'" supabase/migrations/0058_invitaciones_usuarios.sql supabase/migrations/0057_administracion_usuarios.sql`
Anota cada función que valida la lista de roles o que pone `sucursal := null` para corporativo (al menos `preparar_invitacion_usuario` en 0058:22-50 y la función de editar usuario en 0057). Se recrean en el Step 3 con `create or replace`, copiando su cuerpo completo y cambiando solo esas líneas.

- [ ] **Step 2: Escribir el stub y las pruebas que fallan**

`tests/correosBase.mjs`:

```js
// Lo mínimo de Supabase para correos. Enums y checks copian los reales (0001, 0004, 0008).
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
export const BASE=`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create type rol_usuario as enum('operacion','encargado','gerente','admin','corporativo');
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Zapopan-1');
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null,sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 alter table perfiles add constraint perfiles_corporativo_sin_sucursal check ((rol::text = 'corporativo') = (sucursal_id is null));
 insert into perfiles values
  ('00000000-0000-0000-0000-0000000000a1','Julio','admin','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000c1','Halim','corporativo',null,true,false),
  ('00000000-0000-0000-0000-0000000000d0','Gerente Z','gerente','00000000-0000-0000-0000-0000000000e1',true,false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 grant execute on function mi_rol() to authenticated;`;
export const U={admin:'00000000-0000-0000-0000-0000000000a1',corp:'00000000-0000-0000-0000-0000000000c1',gerente:'00000000-0000-0000-0000-0000000000d0',mkt:'00000000-0000-0000-0000-0000000000b7'};
// Como en Supabase: las pruebas corren con el rol authenticated (aplica RLS) o service_role (n8n/seguimiento).
export const como=async(db,id)=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);await db.exec('set role authenticated');};
export const servicio=async(db)=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims','',false)`);await db.exec('set role service_role');};
// La migración real menos las funciones de invitación (sus tablas no existen en el stub): se cortan entre marcas.
export const migracion=()=>load('supabase/migrations/20261106120000_correos_marketing.sql').replace(/-- <invitaciones>[\s\S]*?-- <\/invitaciones>/,'');
export const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion());
 await db.exec(`insert into perfiles values('${U.mkt}','Mariana','marketing',null,true,false)`);return db;};
```

`tests/correos.test.mjs` (primer bloque; las tareas 2–4 agregan más pruebas al mismo archivo):

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {U,como,nueva} from './correosBase.mjs';
export const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
const v=async(db,id,sql)=>{await como(db,id);return (await db.query(sql)).rows[0];};

test('correos: puesto marketing sin sucursal y permisos de la sección',async()=>{
 const db=await nueva();
 try{
  for(const [id,ver,editar] of [[U.mkt,true,true],[U.admin,true,true],[U.corp,true,false],[U.gerente,false,false]]){
   const r=await v(db,id,`select public.puede_ver_correos() ver,public.puede_editar_correos() editar`);
   assert.deepEqual([r.ver,r.editar],[ver,editar],id);
  }
  await db.exec('reset role');
  await rechaza(db.exec(`insert into perfiles values('00000000-0000-0000-0000-0000000000b8','X','marketing','00000000-0000-0000-0000-0000000000e1',true,false)`),/perfiles_sin_sucursal/);
 }finally{await db.close();}
});
```

En `lib/roles.test.ts` agrega al import `puedeVerCorreos, puedeEditarCorreos` y:

```ts
test("marketing: solo la sección Correos; corporativo consulta", () => {
  assert.equal(NOMBRE_ROL.marketing, "Marketing");
  for (const rol of ["marketing", "admin"] as const) { assert.equal(puedeVerCorreos(rol), true); assert.equal(puedeEditarCorreos(rol), true); }
  assert.equal(puedeVerCorreos("corporativo"), true); assert.equal(puedeEditarCorreos("corporativo"), false);
  for (const rol of ["gerente", "encargado", "operacion"] as const) assert.equal(puedeVerCorreos(rol), false);
  const menu = menuLateral("marketing");
  assert.deepEqual(menu.inicio, { href: "/correos", texto: "Campañas" });
  assert.deepEqual(menu.grupos.map((g) => g.titulo), ["Correos"]);
  assert.deepEqual(menuLateral("admin").grupos.find((g) => g.titulo === "Correos")?.enlaces.map((e) => e.href), ["/correos", "/correos/contactos"]);
  assert.deepEqual(menuLateral("corporativo").grupos.find((g) => g.titulo === "Correos")?.enlaces.map((e) => e.href), ["/correos"]);
  assert.deepEqual(accesosRapidos("marketing").map((e) => e.href), ["/correos", "/correos/contactos", "/correos/nueva"]);
  for (const rol of ["gerente", "operacion"] as const) assert.equal(menuLateral(rol).grupos.some((g) => g.titulo === "Correos"), false);
});
```

Agrega `tests/correos.test.mjs` al final de `scripts.test` en `package.json`.

- [ ] **Step 3: Correr y ver que fallan**

Run: `node --experimental-strip-types --test lib/roles.test.ts tests/correos.test.mjs`
Expected: FAIL (`ENOENT` de la migración y `puedeVerCorreos` no exportado).

- [ ] **Step 4: Migración, parte 1**

`supabase/migrations/20261106120000_correos_marketing.sql`:

```sql
-- Correos de marketing: puesto marketing, contactos, campañas, envíos por n8n y seguimiento (spec 2026-11-05).
-- Ojo: el valor nuevo del enum no se puede usar en esta misma transacción; siempre se compara mi_rol()::text.
alter type public.rol_usuario add value if not exists 'marketing';

-- Corporativo y marketing son de oficina central: sin sucursal. Los demás puestos, con sucursal.
alter table public.perfiles drop constraint perfiles_corporativo_sin_sucursal;
alter table public.perfiles add constraint perfiles_sin_sucursal
  check ((rol::text in ('corporativo','marketing')) = (sucursal_id is null));

create function public.puede_ver_correos() returns boolean language sql stable security definer set search_path='' as
$$select coalesce(public.mi_rol()::text in ('marketing','admin','corporativo'),false)$$;
create function public.puede_editar_correos() returns boolean language sql stable security definer set search_path='' as
$$select coalesce(public.mi_rol()::text in ('marketing','admin'),false)$$;
revoke all on function public.puede_ver_correos(),public.puede_editar_correos() from public,anon;
grant execute on function public.puede_ver_correos(),public.puede_editar_correos() to authenticated;

-- <invitaciones>
-- Copiar aquí con `create or replace` el cuerpo completo de cada función anotada en el Step 1, cambiando:
--   la lista de roles válidos a ('operacion','encargado','gerente','admin','corporativo','marketing')
--   `if p_rol='corporativo' then p_sucursal:=null;` por `if p_rol in ('corporativo','marketing') then p_sucursal:=null;`
-- y repetir sus `revoke`/`grant` originales.
-- </invitaciones>
```

El bloque `<invitaciones>` lleva el SQL real copiado (no el comentario); las marcas se quedan para que el stub lo omita.

- [ ] **Step 5: Roles, menú y contexto**

`lib/tipos.ts:1`:

```ts
export type Rol = "operacion" | "encargado" | "gerente" | "admin" | "corporativo" | "marketing";
```

`lib/roles.ts`: en `NOMBRE_ROL` agrega `marketing: "Marketing"`. Debajo de `puedeVerFinanzas` agrega:

```ts
/** Correos de marketing: marketing y admin crean y mandan campañas; corporativo consulta estadísticas. */
export const puedeVerCorreos = (rol: Rol) => rol === "marketing" || rol === "admin" || rol === "corporativo";
export const puedeEditarCorreos = (rol: Rol) => rol === "marketing" || rol === "admin";
export const esMarketing = (rol: Rol) => rol === "marketing";
```

Al inicio de `menuLateral` (antes de `const corporativo`):

```ts
  const correos: GrupoMenu = { titulo: "Correos", enlaces: [{ href: "/correos", texto: "Campañas" }, ...(puedeEditarCorreos(rol) ? [{ href: "/correos/contactos", texto: "Contactos" }] : [])] };
  // Marketing solo usa Correos.
  if (esMarketing(rol)) return { inicio: { href: "/correos", texto: "Campañas" }, grupos: [correos] };
```

y antes del `return` final de `menuLateral`: `if (puedeVerCorreos(rol)) grupos.push(correos);`.
En `accesosRapidos`, primera línea: `if (rol === "marketing") return [{ href: "/correos", texto: "Campañas" }, { href: "/correos/contactos", texto: "Contactos" }, { href: "/correos/nueva", texto: "Nueva" }];`

`lib/contexto.ts`, en `obtenerContexto` justo después de `const { supabase, user, perfil } = await obtenerPerfil();`:

```ts
  // Marketing no tiene sucursal: su inicio es Correos.
  if (perfil.rol === "marketing") redirect("/correos");
```

`Invitar.tsx` y `Lista.tsx`: donde dice `rol!=="corporativo"` / `rol==="corporativo"` para la sucursal, usa `!["corporativo","marketing"].includes(rol)` / `["corporativo","marketing"].includes(rol)`; en `general` de `Lista.tsx:15` agrega `||u.rol==="marketing"`; en las notas agrega el caso `rol==="marketing"?"Marketing solo entra a Correos: campañas, contactos y estadísticas."`.

- [ ] **Step 6: Correr pruebas y tipos**

Run: `node --experimental-strip-types --test lib/roles.test.ts tests/correos.test.mjs && npx tsc --noEmit`
Expected: PASS y sin errores de tipos (si `tsc` marca `Record<Rol,…>` incompletos en otros archivos, agrega la llave `marketing` con el valor del puesto más cercano sin permisos, p. ej. el de `operacion`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261106120000_correos_marketing.sql tests/correosBase.mjs tests/correos.test.mjs lib/tipos.ts lib/roles.ts lib/roles.test.ts lib/contexto.ts app/administracion/usuarios/Invitar.tsx app/administracion/usuarios/Lista.tsx package.json
git commit -m "feat(correos): puesto marketing con acceso solo a Correos"
```

---

### Task 2: Tablas, RLS y funciones de edición

**Files:**
- Modify: `supabase/migrations/20261106120000_correos_marketing.sql` (agregar al final)
- Modify: `tests/correos.test.mjs`

**Interfaces:**
- Consumes: `puede_ver_correos()`, `puede_editar_correos()`, `nueva()`, `U`, `como`.
- Produces (RPC para `authenticated`):
  - `correo_guardar_contacto(p jsonb) returns uuid` — `{id?, email, nombre?, etiquetas?: text[]}`
  - `correo_importar_contactos(p_filas jsonb, p_origen text, p_confirmar boolean) returns jsonb` — filas `[{email,nombre,etiquetas}]` → `{nuevos, existentes, bajas, invalidos}`
  - `correo_baja_manual(p_id uuid) returns void`
  - `correo_guardar_campana(p jsonb) returns uuid` — `{id?, nombre, asunto, html, etiqueta?}`
  - `correo_cambiar_estado(p_id uuid, p_accion text, p_cuando timestamptz default null) returns void` — acciones `programar|borrador|cancelar|detener|reanudar|reintentar`
  - `correo_mandar_prueba(p_id uuid, p_correos text[]) returns int`
  - `correo_contar_destinatarios(p_etiqueta text) returns int`

- [ ] **Step 1: Pruebas que fallan** (agregar a `tests/correos.test.mjs`)

```js
const rpc=async(db,id,sql,args=[])=>{await como(db,id);return (await db.query(sql,args)).rows[0];};
const campana=(db,id,extra={})=>rpc(db,id,`select public.correo_guardar_campana($1::jsonb) id`,[JSON.stringify({nombre:'Go Big',asunto:'Go Big · Dodo',html:'<html><body><a href="https://dodopizza.mx/x">Ver</a></body></html>',...extra})]).then(r=>r.id);
const contacto=(db,email,etiquetas=[])=>rpc(db,U.mkt,`select public.correo_guardar_contacto($1::jsonb) id`,[JSON.stringify({email,etiquetas})]).then(r=>r.id);
const accion=(db,id,c,a,cuando=null)=>rpc(db,id,`select public.correo_cambiar_estado($1,$2,$3)`,[c,a,cuando]);
export {rpc,campana,contacto,accion};

test('correos: contactos normalizados, sin duplicados, y quién los ve',async()=>{
 const db=await nueva();
 try{
  const a=await contacto(db,'  Ana@Mail.com ',['zapopan']);
  assert.equal(await contacto(db,'ana@mail.com',['vip']),a);
  await como(db,U.mkt);
  assert.deepEqual((await db.query(`select email,etiquetas from correo_contactos`)).rows,[{email:'ana@mail.com',etiquetas:['vip','zapopan']}]);
  await rechaza(contacto(db,'no-es-correo'),/Correo inválido/);
  await como(db,U.corp);assert.equal((await db.query(`select count(*)::int n from correo_contactos`)).rows[0].n,0);
  await rechaza(rpc(db,U.corp,`select public.correo_guardar_contacto('{"email":"x@y.com"}')`),/Solo marketing o administración/);
  await rechaza(rpc(db,U.gerente,`select public.correo_guardar_campana('{"nombre":"a","asunto":"b","html":"c"}')`),/Solo marketing o administración/);
 }finally{await db.close();}
});

test('correos: importar CSV no reactiva bajas y suma etiquetas',async()=>{
 const db=await nueva();
 try{
  const b=await contacto(db,'baja@mail.com');await rpc(db,U.mkt,`select public.correo_baja_manual($1)`,[b]);
  await contacto(db,'ya@mail.com',['a']);
  const filas=JSON.stringify([{email:'NUEVO@mail.com',nombre:'N',etiquetas:['b']},{email:'ya@mail.com',etiquetas:['b']},{email:'baja@mail.com'},{email:'mal'},{email:'nuevo@mail.com'}]);
  const previa=(await rpc(db,U.mkt,`select public.correo_importar_contactos($1::jsonb,'lista.csv',false) r`,[filas])).r;
  assert.deepEqual(previa,{nuevos:1,existentes:1,bajas:1,invalidos:1});
  await como(db,U.mkt);assert.equal((await db.query(`select count(*)::int n from correo_contactos`)).rows[0].n,2);
  await rpc(db,U.mkt,`select public.correo_importar_contactos($1::jsonb,'lista.csv',true)`,[filas]);
  const filasDb=Object.fromEntries((await db.query(`select email,estado,etiquetas,origen from correo_contactos`)).rows.map(r=>[r.email,r]));
  assert.equal(filasDb['baja@mail.com'].estado,'baja');
  assert.deepEqual(filasDb['ya@mail.com'].etiquetas,['a','b']);
  assert.equal(filasDb['nuevo@mail.com'].origen,'lista.csv');
 }finally{await db.close();}
});

test('correos: programar valida fecha, lista y estados',async()=>{
 const db=await nueva();
 try{
  const c=await campana(db,U.mkt,{etiqueta:'zapopan'});
  await rechaza(accion(db,U.mkt,c,'programar','2020-01-01T00:00:00Z'),/La fecha ya pasó/);
  await rechaza(accion(db,U.mkt,c,'programar',null),/No hay contactos activos/);
  await contacto(db,'a@mail.com',['zapopan']);
  assert.equal((await rpc(db,U.mkt,`select public.correo_contar_destinatarios('zapopan') n`)).n,1);
  await accion(db,U.mkt,c,'programar',null);
  await como(db,U.mkt);assert.equal((await db.query(`select estado from correo_campanas where id=$1`,[c])).rows[0].estado,'programada');
  await rechaza(accion(db,U.mkt,c,'programar',null),/no se puede programar/);
  await rechaza(campana(db,U.mkt,{id:c,html:'<p>otro</p>'}).then(()=>accion(db,U.mkt,c,'detener')),/no se puede detener/);
  await accion(db,U.mkt,c,'borrador');await accion(db,U.mkt,c,'cancelar');
  await rechaza(campana(db,U.mkt,{id:c}),/Solo se editan borradores o programadas/);
  await rechaza(accion(db,U.corp,c,'cancelar'),/Solo marketing o administración/);
 }finally{await db.close();}
});

test('correos: prueba a máximo 5 correos válidos',async()=>{
 const db=await nueva();
 try{
  const c=await campana(db,U.mkt);
  assert.equal((await rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2) n`,[c,['scervera@dodopizza.mx',' Otro@Mail.com ']])).n,2);
  await rechaza(rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2)`,[c,['a@a.com','b@a.com','c@a.com','d@a.com','e@a.com','f@a.com']]),/hasta 5 correos/);
  await rechaza(rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2)`,[c,['nope']]),/Correo inválido/);
  await como(db,U.mkt);
  assert.deepEqual((await db.query(`select email,es_prueba,estado from correo_envios order by email`)).rows,[{email:'otro@mail.com',es_prueba:true,estado:'pendiente'},{email:'scervera@dodopizza.mx',es_prueba:true,estado:'pendiente'}]);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --experimental-strip-types --test tests/correos.test.mjs`
Expected: FAIL con `function public.correo_guardar_campana(jsonb) does not exist`.

- [ ] **Step 3: Migración, parte 2** (agregar al final del archivo)

```sql
create table public.correo_contactos(
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$'),
  nombre text check (nombre is null or length(nombre) <= 160),
  etiquetas text[] not null default '{}',
  estado text not null default 'activo' check (estado in ('activo','baja','rebote')),
  origen text, fecha_baja timestamptz,
  creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now());
create table public.correo_campanas(
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  asunto text not null check (length(btrim(asunto)) between 1 and 150),
  html text not null check (length(html) between 1 and 500000),
  etiqueta text,
  programada_para timestamptz,
  estado text not null default 'borrador' check (estado in ('borrador','programada','enviando','detenida','enviada','cancelada')),
  iniciada_en timestamptz, terminada_en timestamptz,
  creada_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(),
  check (estado <> 'programada' or programada_para is not null));
create table public.correo_envios(
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.correo_campanas(id) on delete cascade,
  contacto_id uuid references public.correo_contactos(id),
  email text not null,
  token text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  es_prueba boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente','procesando','aceptado','problema')),
  reservado_en timestamptz, enviado_en timestamptz, message_id text, detalle text,
  creado_en timestamptz not null default now(),
  check (es_prueba or contacto_id is not null));
create unique index correo_envios_uno_por_contacto on public.correo_envios(campana_id, contacto_id) where not es_prueba;
create index correo_envios_pendientes on public.correo_envios(estado, creado_en) where estado in ('pendiente','procesando');
create table public.correo_eventos(
  id bigint generated always as identity primary key,
  envio_id uuid not null references public.correo_envios(id) on delete cascade,
  tipo text not null check (tipo in ('apertura','clic','baja')),
  enlace text, agente text, sospechoso boolean not null default false,
  creado_en timestamptz not null default now());
create index correo_eventos_envio on public.correo_eventos(envio_id);
create table public.correo_estado_n8n(id int primary key check (id = 1), ultima_consulta timestamptz);
insert into public.correo_estado_n8n values (1, null);

alter table public.correo_contactos enable row level security;
alter table public.correo_campanas enable row level security;
alter table public.correo_envios enable row level security;
alter table public.correo_eventos enable row level security;
alter table public.correo_estado_n8n enable row level security;
create policy correo_contactos_ver on public.correo_contactos for select to authenticated using (public.puede_editar_correos());
create policy correo_campanas_ver on public.correo_campanas for select to authenticated using (public.puede_ver_correos());
create policy correo_envios_ver on public.correo_envios for select to authenticated using (public.puede_ver_correos());
create policy correo_eventos_ver on public.correo_eventos for select to authenticated using (public.puede_ver_correos());
create policy correo_estado_n8n_ver on public.correo_estado_n8n for select to authenticated using (public.puede_ver_correos());
grant select on public.correo_contactos, public.correo_campanas, public.correo_envios, public.correo_eventos, public.correo_estado_n8n to authenticated;

create function public.correo_exigir_editor() returns void language plpgsql stable security definer set search_path='' as $$
begin if not public.puede_editar_correos() then raise exception 'Solo marketing o administración puede hacer esto.'; end if; end $$;

create function public.correo_email_valido(p text) returns text language plpgsql immutable set search_path='' as $$
declare e text := lower(btrim(coalesce(p,'')));
begin if e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' then raise exception 'Correo inválido: %', left(coalesce(p,''),80); end if; return e; end $$;

create function public.correo_etiquetas(p jsonb) returns text[] language sql immutable set search_path='' as $$
select coalesce(array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p,'[]'::jsonb)) x where btrim(x) <> '' order by 1), '{}')$$;

create function public.correo_guardar_contacto(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e text; v uuid;
begin
  perform public.correo_exigir_editor();
  e := public.correo_email_valido(p->>'email');
  if p ? 'id' and p->>'id' is not null then
    update public.correo_contactos set email = e, nombre = nullif(btrim(p->>'nombre'),''), etiquetas = public.correo_etiquetas(p->'etiquetas'), actualizado_en = now()
      where id = (p->>'id')::uuid returning id into v;
    if v is null then raise exception 'Contacto no encontrado.'; end if;
    return v;
  end if;
  insert into public.correo_contactos(email, nombre, etiquetas, origen) values (e, nullif(btrim(p->>'nombre'),''), public.correo_etiquetas(p->'etiquetas'), 'manual')
  on conflict (email) do update set etiquetas = array(select distinct x from unnest(public.correo_contactos.etiquetas || excluded.etiquetas) x order by 1),
    nombre = coalesce(public.correo_contactos.nombre, excluded.nombre), actualizado_en = now()
  returning id into v;
  return v;
end $$;

create function public.correo_importar_contactos(p_filas jsonb, p_origen text, p_confirmar boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare f jsonb; e text; vistos text[] := '{}'; r jsonb := '{"nuevos":0,"existentes":0,"bajas":0,"invalidos":0}'; previo text;
begin
  perform public.correo_exigir_editor();
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 20000 then raise exception 'El archivo debe tener de 1 a 20 000 contactos.'; end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    e := lower(btrim(coalesce(f->>'email','')));
    if e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' then r := jsonb_set(r,'{invalidos}',to_jsonb((r->>'invalidos')::int+1)); continue; end if;
    if e = any(vistos) then continue; end if;
    vistos := vistos || e;
    select estado into previo from public.correo_contactos where email = e;
    if previo is null then r := jsonb_set(r,'{nuevos}',to_jsonb((r->>'nuevos')::int+1));
    elsif previo in ('baja','rebote') then r := jsonb_set(r,'{bajas}',to_jsonb((r->>'bajas')::int+1)); continue;
    else r := jsonb_set(r,'{existentes}',to_jsonb((r->>'existentes')::int+1)); end if;
    if p_confirmar then
      insert into public.correo_contactos(email, nombre, etiquetas, origen) values (e, nullif(btrim(f->>'nombre'),''), public.correo_etiquetas(f->'etiquetas'), left(coalesce(nullif(btrim(p_origen),''),'CSV'),120))
      on conflict (email) do update set etiquetas = array(select distinct x from unnest(public.correo_contactos.etiquetas || excluded.etiquetas) x order by 1),
        nombre = coalesce(public.correo_contactos.nombre, excluded.nombre), actualizado_en = now();
    end if;
  end loop;
  return r;
end $$;

create function public.correo_baja_manual(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.correo_exigir_editor();
  update public.correo_contactos set estado = 'baja', fecha_baja = coalesce(fecha_baja, now()), actualizado_en = now() where id = p_id;
end $$;

create function public.correo_contar_destinatarios(p_etiqueta text) returns int language sql stable security definer set search_path='' as $$
select case when public.puede_ver_correos() then (select count(*)::int from public.correo_contactos where estado = 'activo' and (nullif(btrim(p_etiqueta),'') is null or lower(btrim(p_etiqueta)) = any(etiquetas))) else 0 end$$;

create function public.correo_guardar_campana(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; est text;
begin
  perform public.correo_exigir_editor();
  if p ? 'id' and p->>'id' is not null then
    select estado into est from public.correo_campanas where id = (p->>'id')::uuid for update;
    if est is null then raise exception 'Campaña no encontrada.'; end if;
    if est not in ('borrador','programada') then raise exception 'Solo se editan borradores o programadas.'; end if;
    update public.correo_campanas set nombre = btrim(p->>'nombre'), asunto = btrim(p->>'asunto'), html = p->>'html',
      etiqueta = nullif(lower(btrim(p->>'etiqueta')),''), actualizado_en = now() where id = (p->>'id')::uuid returning id into v;
    return v;
  end if;
  insert into public.correo_campanas(nombre, asunto, html, etiqueta, creada_por)
    values (btrim(p->>'nombre'), btrim(p->>'asunto'), p->>'html', nullif(lower(btrim(p->>'etiqueta')),''), auth.uid()) returning id into v;
  return v;
exception when check_violation then raise exception 'Revisa nombre (1–120), asunto (1–150) y HTML (hasta 500 000 caracteres).';
end $$;

create function public.correo_cambiar_estado(p_id uuid, p_accion text, p_cuando timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.correo_campanas;
begin
  perform public.correo_exigir_editor();
  select * into c from public.correo_campanas where id = p_id for update;
  if c.id is null then raise exception 'Campaña no encontrada.'; end if;
  if p_accion = 'programar' then
    if c.estado <> 'borrador' then raise exception 'Esta campaña no se puede programar (está %).', c.estado; end if;
    if p_cuando is not null and p_cuando < now() - interval '1 minute' then raise exception 'La fecha ya pasó; elige una hora futura.'; end if;
    if public.correo_contar_destinatarios(c.etiqueta) = 0 then raise exception 'No hay contactos activos para esta campaña.'; end if;
    update public.correo_campanas set estado = 'programada', programada_para = coalesce(p_cuando, now()), actualizado_en = now() where id = p_id;
  elsif p_accion = 'borrador' then
    if c.estado <> 'programada' then raise exception 'Solo una campaña programada regresa a borrador.'; end if;
    update public.correo_campanas set estado = 'borrador', programada_para = null, actualizado_en = now() where id = p_id;
  elsif p_accion = 'cancelar' then
    if c.estado not in ('borrador','programada') then raise exception 'Esta campaña no se puede cancelar (está %).', c.estado; end if;
    update public.correo_campanas set estado = 'cancelada', actualizado_en = now() where id = p_id;
  elsif p_accion = 'detener' then
    if c.estado <> 'enviando' then raise exception 'Esta campaña no se puede detener (está %).', c.estado; end if;
    update public.correo_campanas set estado = 'detenida', actualizado_en = now() where id = p_id;
  elsif p_accion = 'reanudar' then
    if c.estado <> 'detenida' then raise exception 'Solo una campaña detenida se reanuda.'; end if;
    update public.correo_campanas set estado = 'enviando', actualizado_en = now() where id = p_id;
  elsif p_accion = 'reintentar' then
    if c.estado not in ('enviada','detenida','enviando') then raise exception 'Esta campaña aún no tiene envíos que reintentar.'; end if;
    update public.correo_envios e set estado = 'pendiente', reservado_en = null, detalle = null
      from public.correo_contactos k where e.campana_id = p_id and not e.es_prueba and e.estado = 'problema' and k.id = e.contacto_id and k.estado = 'activo';
    update public.correo_campanas set estado = 'enviando', terminada_en = null, actualizado_en = now() where id = p_id and estado = 'enviada';
  else raise exception 'Acción inválida.';
  end if;
end $$;

create function public.correo_mandar_prueba(p_id uuid, p_correos text[]) returns int language plpgsql security definer set search_path='' as $$
declare e text; n int := 0; correos text[];
begin
  perform public.correo_exigir_editor();
  if not exists (select 1 from public.correo_campanas where id = p_id and estado <> 'cancelada') then raise exception 'Campaña no encontrada.'; end if;
  correos := array(select distinct public.correo_email_valido(x) from unnest(coalesce(p_correos,'{}')) x where btrim(x) <> '');
  if cardinality(correos) not between 1 and 5 then raise exception 'La prueba va de 1 hasta 5 correos.'; end if;
  foreach e in array correos loop
    insert into public.correo_envios(campana_id, email, es_prueba) values (p_id, e, true); n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.correo_exigir_editor(), public.correo_email_valido(text), public.correo_etiquetas(jsonb) from public, anon, authenticated;
revoke all on function public.correo_guardar_contacto(jsonb), public.correo_importar_contactos(jsonb,text,boolean), public.correo_baja_manual(uuid),
  public.correo_contar_destinatarios(text), public.correo_guardar_campana(jsonb), public.correo_cambiar_estado(uuid,text,timestamptz), public.correo_mandar_prueba(uuid,text[]) from public, anon;
grant execute on function public.correo_guardar_contacto(jsonb), public.correo_importar_contactos(jsonb,text,boolean), public.correo_baja_manual(uuid),
  public.correo_contar_destinatarios(text), public.correo_guardar_campana(jsonb), public.correo_cambiar_estado(uuid,text,timestamptz), public.correo_mandar_prueba(uuid,text[]) to authenticated;
```

Nota: `correo_mandar_prueba` valida con `correo_email_valido` antes de contar, así que `['nope']` falla con «Correo inválido» y 6 correos con «hasta 5 correos».

- [ ] **Step 4: Ver que pasan**

Run: `node --experimental-strip-types --test tests/correos.test.mjs`
Expected: PASS (5 pruebas).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261106120000_correos_marketing.sql tests/correos.test.mjs
git commit -m "feat(correos): tablas, permisos y funciones de contactos y campañas"
```

---

### Task 3: Reserva de lotes, resultados y eventos (funciones para n8n y seguimiento)

**Files:**
- Modify: `supabase/migrations/20261106120000_correos_marketing.sql` (al final)
- Modify: `tests/correos.test.mjs`

**Interfaces:**
- Consumes: tablas de la tarea 2.
- Produces (solo `service_role`):
  - `correo_tomar_lote(p_lote int) returns jsonb` → `[{envio_id, token, para, asunto, html, es_prueba, campana_nombre}]`
  - `correo_registrar_resultado(p_envio uuid, p_aceptado boolean, p_message_id text, p_detalle text, p_rebote boolean) returns void`
  - `correo_registrar_evento(p_token text, p_tipo text, p_enlace text, p_agente text) returns jsonb` → `null` si el token no existe, o `{campana_nombre}`
  - `correo_baja_por_token(p_token text) returns jsonb` → `{email}` enmascarado o `null`

- [ ] **Step 1: Pruebas que fallan**

```js
import {servicio} from './correosBase.mjs';
const lote=async(db,n=8)=>{await servicio(db);try{return (await db.query(`select public.correo_tomar_lote($1) r`,[n])).rows[0].r;}finally{await db.exec('reset role');}};
const sql=async(db,q,a=[])=>{await servicio(db);try{return (await db.query(q,a)).rows;}finally{await db.exec('reset role');}};

test('correos: el lote arranca la campaña, excluye bajas y no repite',async()=>{
 const db=await nueva();
 try{
  for(const e of ['a@m.com','b@m.com','c@m.com'])await contacto(db,e);
  const x=await contacto(db,'x@m.com');await rpc(db,U.mkt,`select public.correo_baja_manual($1)`,[x]);
  const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  await rpc(db,U.mkt,`select public.correo_mandar_prueba($1,$2)`,[c,['p@m.com']]);
  const r1=await lote(db,2);
  assert.equal(r1[0].para,'p@m.com');assert.equal(r1[0].es_prueba,true);assert.equal(r1[0].asunto,'[PRUEBA] Go Big · Dodo');
  assert.equal(r1.length,2);
  const r2=await lote(db,8);
  assert.equal(r2.length,2);
  const todos=[...r1,...r2].map(x=>x.para).sort();
  assert.deepEqual(todos,['a@m.com','b@m.com','c@m.com','p@m.com']);
  assert.equal((await sql(db,`select estado from correo_campanas where id=$1`,[c]))[0].estado,'enviando');
  assert.deepEqual(await lote(db,8),[]);
 }finally{await db.close();}
});

test('correos: resultados cierran la campaña; rebote marca contacto; vencidos pasan a problema',async()=>{
 const db=await nueva();
 try{
  await contacto(db,'a@m.com');await contacto(db,'b@m.com');
  const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  const [a,b]=await lote(db,8);
  await sql(db,`select public.correo_registrar_resultado($1,true,'<id@x>',null,false)`,[a.envio_id]);
  await sql(db,`select public.correo_registrar_resultado($1,false,null,'550 no existe',true)`,[b.envio_id]);
  await sql(db,`select public.correo_registrar_resultado($1,true,null,null,false)`,[a.envio_id]); // repetido: se ignora
  assert.equal((await sql(db,`select estado from correo_campanas where id=$1`,[c]))[0].estado,'enviada');
  assert.equal((await sql(db,`select estado from correo_contactos where email='b@m.com'`))[0].estado,'rebote');
  // Vencido
  await contacto(db,'v@m.com');const c2=await campana(db,U.mkt,{nombre:'Dos'});await accion(db,U.mkt,c2,'programar',null);
  await lote(db,8);await sql(db,`update correo_envios set reservado_en=now()-interval '16 minutes' where campana_id=$1`,[c2]);
  await lote(db,8);
  const [v]=await sql(db,`select estado,detalle from correo_envios where campana_id=$1`,[c2]);
  assert.equal(v.estado,'problema');assert.match(v.detalle,/Sin respuesta de n8n/);
  // Reintentar no revive al rebotado
  await accion(db,U.mkt,c,'reintentar');
  assert.equal((await sql(db,`select count(*)::int n from correo_envios where campana_id=$1 and estado='pendiente'`,[c]))[0].n,0);
 }finally{await db.close();}
});

test('correos: detenida no entrega; baja entre armado y envío se omite',async()=>{
 const db=await nueva();
 try{
  const a=await contacto(db,'a@m.com');await contacto(db,'b@m.com');
  const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  await lote(db,1); // arma la lista y reserva 1
  await accion(db,U.mkt,c,'detener');
  assert.deepEqual(await lote(db,8),[]);
  await accion(db,U.mkt,c,'reanudar');
  await rpc(db,U.mkt,`select public.correo_baja_manual($1)`,[a]);
  const r=await lote(db,8);
  assert.ok(r.every(x=>x.para!=='a@m.com'));
 }finally{await db.close();}
});

test('correos: eventos por token; clic sospechoso y baja idempotente',async()=>{
 const db=await nueva();
 try{
  await contacto(db,'a@m.com');const c=await campana(db,U.mkt);await accion(db,U.mkt,c,'programar',null);
  const [e]=await lote(db,8);
  await sql(db,`select public.correo_registrar_resultado($1,true,null,null,false)`,[e.envio_id]);
  const r=(await sql(db,`select public.correo_registrar_evento($1,'clic','https://dodopizza.mx/','UA') r`,[e.token]))[0].r;
  assert.deepEqual(r,{campana_nombre:'Go Big'});
  await sql(db,`update correo_envios set enviado_en=now()-interval '1 minute'`);
  await sql(db,`select public.correo_registrar_evento($1,'apertura',null,'UA')`,[e.token]);
  await sql(db,`select public.correo_registrar_evento($1,'clic','https://dodopizza.mx/','UA')`,[e.token]);
  assert.deepEqual((await sql(db,`select tipo,sospechoso from correo_eventos order by id`)).map(x=>[x.tipo,x.sospechoso]),[['clic',true],['apertura',false],['clic',false]]);
  assert.equal((await sql(db,`select public.correo_registrar_evento('nada','apertura',null,null) r`))[0].r,null);
  assert.deepEqual((await sql(db,`select public.correo_baja_por_token($1) r`,[e.token]))[0].r,{email:'a***@m.com'});
  await sql(db,`select public.correo_baja_por_token($1)`,[e.token]);
  assert.equal((await sql(db,`select estado from correo_contactos`))[0].estado,'baja');
  assert.equal((await sql(db,`select count(*)::int n from correo_eventos where tipo='baja'`))[0].n,1);
  await como(db,U.mkt);await rechaza(db.query(`select public.correo_tomar_lote(8)`),/permission denied/);
 }finally{await db.close();}
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --experimental-strip-types --test tests/correos.test.mjs`
Expected: FAIL con `function public.correo_tomar_lote(integer) does not exist`.

- [ ] **Step 3: Migración, parte 3**

```sql
create function public.correo_tomar_lote(p_lote int) returns jsonb language plpgsql security definer set search_path='' as $$
declare n int := least(greatest(coalesce(p_lote,8),1),8); r jsonb;
begin
  update public.correo_estado_n8n set ultima_consulta = now() where id = 1;
  -- Campañas cuya hora llegó: se arma la lista con los contactos activos de ese momento.
  with listas as (
    update public.correo_campanas set estado = 'enviando', iniciada_en = coalesce(iniciada_en, now()), actualizado_en = now()
    where estado = 'programada' and programada_para <= now() returning id, etiqueta)
  insert into public.correo_envios(campana_id, contacto_id, email)
    select l.id, k.id, k.email from listas l join public.correo_contactos k on k.estado = 'activo' and (l.etiqueta is null or l.etiqueta = any(k.etiquetas))
  on conflict do nothing;
  -- Reservados sin respuesta: pudieron haber salido; no se reintentan solos.
  update public.correo_envios set estado = 'problema', detalle = 'Sin respuesta de n8n; puede haber salido, revisar antes de reintentar.'
    where estado = 'procesando' and reservado_en < now() - interval '15 minutes';
  -- Pendientes de contactos que ya no están activos: no salen.
  update public.correo_envios e set estado = 'problema', detalle = 'El contacto se dio de baja o rebotó antes del envío.'
    from public.correo_contactos k where e.estado = 'pendiente' and not e.es_prueba and k.id = e.contacto_id and k.estado <> 'activo';
  with elegidos as (
    select e.id from public.correo_envios e join public.correo_campanas c on c.id = e.campana_id
    where e.estado = 'pendiente' and (e.es_prueba and c.estado <> 'cancelada' or not e.es_prueba and c.estado = 'enviando')
    order by e.es_prueba desc, c.iniciada_en nulls first, e.creado_en, e.id
    limit n for update of e skip locked),
  reservados as (
    update public.correo_envios e set estado = 'procesando', reservado_en = now() from elegidos where e.id = elegidos.id
    returning e.id, e.token, e.email, e.es_prueba, e.campana_id, e.creado_en)
  select coalesce(jsonb_agg(jsonb_build_object('envio_id', r.id, 'token', r.token, 'para', r.email, 'es_prueba', r.es_prueba,
      'asunto', case when r.es_prueba then '[PRUEBA] ' else '' end || c.asunto, 'html', c.html, 'campana_nombre', c.nombre)
      order by r.es_prueba desc, r.creado_en, r.id), '[]'::jsonb)
    into r from reservados r join public.correo_campanas c on c.id = r.campana_id;
  update public.correo_campanas c set estado = 'enviada', terminada_en = now(), actualizado_en = now()
    where c.estado = 'enviando' and not exists (select 1 from public.correo_envios e where e.campana_id = c.id and not e.es_prueba and e.estado in ('pendiente','procesando'));
  return r;
end $$;

create function public.correo_registrar_resultado(p_envio uuid, p_aceptado boolean, p_message_id text, p_detalle text, p_rebote boolean) returns void language plpgsql security definer set search_path='' as $$
declare e public.correo_envios;
begin
  update public.correo_envios set estado = case when p_aceptado then 'aceptado' else 'problema' end, enviado_en = case when p_aceptado then now() end,
    message_id = left(p_message_id, 300), detalle = left(coalesce(p_detalle, case when p_aceptado then 'Aceptado por SMTP; no confirma entrega a bandeja.' end), 1500)
    where id = p_envio and estado = 'procesando' returning * into e;
  if e.id is null then return; end if;
  if not p_aceptado and p_rebote and e.contacto_id is not null then
    update public.correo_contactos set estado = 'rebote', actualizado_en = now() where id = e.contacto_id and estado = 'activo';
  end if;
  update public.correo_campanas c set estado = 'enviada', terminada_en = now(), actualizado_en = now()
    where c.id = e.campana_id and c.estado = 'enviando' and not exists (select 1 from public.correo_envios x where x.campana_id = c.id and not x.es_prueba and x.estado in ('pendiente','procesando'));
end $$;

create function public.correo_registrar_evento(p_token text, p_tipo text, p_enlace text, p_agente text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.correo_envios; nombre text;
begin
  if p_tipo not in ('apertura','clic') then raise exception 'Tipo inválido.'; end if;
  select * into e from public.correo_envios where token = p_token;
  if e.id is null then return null; end if;
  insert into public.correo_eventos(envio_id, tipo, enlace, agente, sospechoso)
    values (e.id, p_tipo, left(p_enlace, 500), left(p_agente, 300), p_tipo = 'clic' and (e.enviado_en is null or now() - e.enviado_en < interval '10 seconds'));
  select c.nombre into nombre from public.correo_campanas c where c.id = e.campana_id;
  return jsonb_build_object('campana_nombre', nombre);
end $$;

create function public.correo_baja_por_token(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.correo_envios; correo text;
begin
  select * into e from public.correo_envios where token = p_token;
  if e.id is null then return null; end if;
  if e.contacto_id is not null then
    update public.correo_contactos set estado = 'baja', fecha_baja = coalesce(fecha_baja, now()), actualizado_en = now() where id = e.contacto_id and estado <> 'baja';
    if found then insert into public.correo_eventos(envio_id, tipo) values (e.id, 'baja'); end if;
  end if;
  correo := left(e.email, 1) || '***@' || split_part(e.email, '@', 2);
  return jsonb_build_object('email', correo);
end $$;

revoke all on function public.correo_tomar_lote(int), public.correo_registrar_resultado(uuid,boolean,text,text,boolean),
  public.correo_registrar_evento(text,text,text,text), public.correo_baja_por_token(text) from public, anon, authenticated;
grant execute on function public.correo_tomar_lote(int), public.correo_registrar_resultado(uuid,boolean,text,text,boolean),
  public.correo_registrar_evento(text,text,text,text), public.correo_baja_por_token(text) to service_role;
grant select, insert, update on public.correo_envios, public.correo_eventos, public.correo_contactos, public.correo_campanas, public.correo_estado_n8n to service_role;
```

Una prueba no se marca `sospechoso` por el envío de prueba porque `enviado_en` sí se llena al aceptarse.

- [ ] **Step 4: Ver que pasan**

Run: `node --experimental-strip-types --test tests/correos.test.mjs`
Expected: PASS (9 pruebas).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261106120000_correos_marketing.sql tests/correos.test.mjs
git commit -m "feat(correos): reserva de lotes, resultados SMTP, eventos y bajas"
```

---

### Task 4: Librerías puras (preparar HTML, destino, limpieza, CSV, estadísticas)

**Files:**
- Create: `lib/correos/tipos.ts`, `lib/correos/preparar.ts`, `lib/correos/destino.ts`, `lib/correos/html.ts`, `lib/correos/csv.ts`, `lib/correos/estadisticas.ts`
- Test: `lib/correos/preparar.test.ts`, `lib/correos/destino.test.ts`, `lib/correos/html.test.ts`, `lib/correos/csv.test.ts`, `lib/correos/estadisticas.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `slug(texto: string): string`
  - `prepararCorreo(html: string, token: string, base: string, asunto: string): { html: string; texto: string }`
  - `dominioPermitido(host: string, extra: string[]): boolean`
  - `destinoClic(u: string | null, campana: string, extra: string[]): string`
  - `limpiarHtml(html: string): { html: string; quitados: number }`
  - `leerCsvContactos(texto: string): { filas: { email: string; nombre: string | null; etiquetas: string[] }[]; error?: string }`
  - `tipos`: `Envio = { id: string; email: string; es_prueba: boolean; estado: "pendiente"|"procesando"|"aceptado"|"problema"; enviado_en: string | null; detalle: string | null }`, `Evento = { envio_id: string; tipo: "apertura"|"clic"|"baja"; enlace: string | null; sospechoso: boolean; creado_en: string }`
  - `estadisticas(envios: Envio[], eventos: Evento[]): Estadisticas` con `Estadisticas = { destinatarios, aceptados, problema, pendientes, abrieron, clics, bajas: number; pctApertura, pctClic: number; porEnlace: { enlace: string; personas: number }[]; porHora: { hora: string; aperturas: number; clics: number }[]; porEnvio: Record<string, { abrio: string | null; clic: string | null }> }`

- [ ] **Step 1: Pruebas que fallan**

`lib/correos/preparar.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararCorreo } from "./preparar.ts";
const B = "https://app.test";

test("preparar: reescribe enlaces de dodopizza (comillas dobles, simples y &amp;) y deja los demás", () => {
  const html = `<html><body><a href="https://dodopizza.mx/zp1/go-big?a=1&amp;b=2">A</a><a href='https://www.dodopizza.mx/x'>B</a><a href="https://instagram.com/dodo">C</a><a href="mailto:hola@dodopizza.mx">D</a></body></html>`;
  const r = prepararCorreo(html, "tok123", B, "Go Big");
  assert.match(r.html, /href="https:\/\/app\.test\/api\/correos\/c\/tok123\?u=https%3A%2F%2Fdodopizza\.mx%2Fzp1%2Fgo-big%3Fa%3D1%26b%3D2"/);
  assert.match(r.html, /href="https:\/\/app\.test\/api\/correos\/c\/tok123\?u=https%3A%2F%2Fwww\.dodopizza\.mx%2Fx"/);
  assert.match(r.html, /href="https:\/\/instagram\.com\/dodo"/);
  assert.match(r.html, /href="mailto:hola@dodopizza\.mx"/);
});

test("preparar: píxel y pie de baja antes de </body>; sin </body> van al final", () => {
  const r = prepararCorreo("<html><BODY><p>x</p></BODY></html>", "t", B, "S");
  assert.match(r.html, /<img src="https:\/\/app\.test\/api\/correos\/a\/t" width="1" height="1" alt=""[^>]*>.*<\/BODY>/s);
  assert.match(r.html, /href="https:\/\/app\.test\/baja\/t"[^>]*>date de baja aquí<\/a>/);
  assert.match(prepararCorreo("<p>sin body</p>", "t", B, "S").html, /baja\/t.*$/s);
  assert.match(r.texto, /^S\n/);
  assert.match(r.texto, /Darte de baja: https:\/\/app\.test\/baja\/t/);
});
```

`lib/correos/destino.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoClic, dominioPermitido } from "./destino.ts";

test("destino: solo dodopizza.mx, subdominios y extras; agrega UTM si falta", () => {
  assert.equal(destinoClic("https://dodopizza.mx/zp1/go-big", "go-big", []), "https://dodopizza.mx/zp1/go-big?utm_source=correo&utm_medium=email&utm_campaign=go-big");
  assert.equal(destinoClic("https://www.dodopizza.mx/a?b=1", "x", []), "https://www.dodopizza.mx/a?b=1&utm_source=correo&utm_medium=email&utm_campaign=x");
  assert.equal(destinoClic("https://dodopizza.mx/a?utm_source=ig", "x", []), "https://dodopizza.mx/a?utm_source=ig");
  for (const malo of ["https://dodopizza.mx.malo.com/", "http://dodopizza.mx/", "javascript:alert(1)", "https://evil.com/?dodopizza.mx", "", null])
    assert.equal(destinoClic(malo, "x", []), "https://dodopizza.mx/");
  assert.equal(dominioPermitido("wa.me", ["wa.me"]), true);
  assert.equal(destinoClic("https://wa.me/523312345678", "x", ["wa.me"]), "https://wa.me/523312345678?utm_source=correo&utm_medium=email&utm_campaign=x");
});
```

`lib/correos/html.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiarHtml } from "./html.ts";

test("html: quita scripts, on*= y javascript:, cuenta lo quitado y conserva comentarios condicionales de Outlook", () => {
  const r = limpiarHtml(`<!--[if mso]><v:roundrect href="https://dodopizza.mx"/><![endif]--><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><a href="https://dodopizza.mx" onclick='y()'>ok</a>`);
  assert.equal(r.quitados, 4);
  assert.doesNotMatch(r.html, /script|onerror|onclick|javascript:/i);
  assert.match(r.html, /<!--\[if mso\]><v:roundrect href="https:\/\/dodopizza\.mx"\/><!\[endif\]-->/);
  assert.equal(limpiarHtml("<p>ok</p>").quitados, 0);
});
```

`lib/correos/csv.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCsvContactos } from "./csv.ts";

test("csv: BOM, ; o , como separador, encabezados en mayúsculas y comillas", () => {
  const r = leerCsvContactos("﻿CORREO;Nombre;Etiquetas\r\n Ana@Mail.com ;\"Ana; López\";zapopan;vip\r\nluis@mail.com;;\r\n\r\n");
  assert.equal(r.error, undefined);
  assert.deepEqual(r.filas, [{ email: "ana@mail.com", nombre: "Ana; López", etiquetas: ["zapopan"] }, { email: "luis@mail.com", nombre: null, etiquetas: [] }]);
  const c = leerCsvContactos("email,nombre,etiquetas\nx@y.com,X,\"a;b\"");
  assert.deepEqual(c.filas[0], { email: "x@y.com", nombre: "X", etiquetas: ["a", "b"] });
  assert.match(leerCsvContactos("nombre\nAna").error ?? "", /columna correo/);
});
```

Nota del CSV: con `;` como separador las etiquetas no pueden ir separadas por `;` en la misma celda sin comillas; la columna `etiquetas` toma solo su celda (por eso `zapopan;vip` sin comillas deja `vip` en una columna extra que se ignora).

`lib/correos/estadisticas.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { estadisticas } from "./estadisticas.ts";
const env = (id: string, estado: "aceptado" | "problema" | "pendiente", es_prueba = false) => ({ id, email: id + "@m.com", es_prueba, estado, enviado_en: "2026-11-07T18:00:00Z", detalle: null });
const ev = (envio_id: string, tipo: "apertura" | "clic" | "baja", creado_en: string, enlace: string | null = null, sospechoso = false) => ({ envio_id, tipo, enlace, sospechoso, creado_en });

test("estadísticas: únicos, sin pruebas, clic sospechoso fuera y clic cuenta como apertura", () => {
  const s = estadisticas(
    [env("a", "aceptado"), env("b", "aceptado"), env("c", "aceptado"), env("d", "problema"), env("e", "pendiente"), env("p", "aceptado", true)],
    [ev("a", "apertura", "2026-11-07T18:05:00Z"), ev("a", "apertura", "2026-11-07T19:05:00Z"), ev("b", "clic", "2026-11-07T18:20:00Z", "https://dodopizza.mx/go-big?utm_source=correo"),
     ev("c", "clic", "2026-11-07T18:00:03Z", "https://dodopizza.mx/", true), ev("p", "apertura", "2026-11-07T18:01:00Z"), ev("c", "baja", "2026-11-07T20:00:00Z")]);
  assert.deepEqual([s.destinatarios, s.aceptados, s.problema, s.pendientes, s.abrieron, s.clics, s.bajas], [5, 3, 1, 1, 2, 1, 1]);
  assert.equal(s.pctApertura, 2 / 3); assert.equal(s.pctClic, 1 / 3);
  assert.deepEqual(s.porEnlace, [{ enlace: "https://dodopizza.mx/go-big", personas: 1 }]);
  assert.equal(s.porEnvio.b.abrio, "2026-11-07T18:20:00Z");
  // 18:05 y 18:20 UTC caen a las 12:00 de México; la segunda apertura de "a" (13:00) no es única y no suma.
  assert.deepEqual(s.porHora.map((h) => [h.hora, h.aperturas, h.clics]), [["2026-11-07 12:00", 2, 1]]);
  assert.equal(estadisticas([], []).pctApertura, 0);
});
```

Agrega los cinco `lib/correos/*.test.ts` a `scripts.test`.

- [ ] **Step 2: Ver que fallan**

Run: `node --experimental-strip-types --test lib/correos/*.test.ts`
Expected: FAIL (`Cannot find module './preparar.ts'`).

- [ ] **Step 3: Implementación**

`lib/correos/tipos.ts`:

```ts
export type EstadoEnvio = "pendiente" | "procesando" | "aceptado" | "problema";
export type Envio = { id: string; email: string; es_prueba: boolean; estado: EstadoEnvio; enviado_en: string | null; detalle: string | null };
export type Evento = { envio_id: string; tipo: "apertura" | "clic" | "baja"; enlace: string | null; sospechoso: boolean; creado_en: string };
export type EstadoCampana = "borrador" | "programada" | "enviando" | "detenida" | "enviada" | "cancelada";
export type Campana = { id: string; nombre: string; asunto: string; html: string; etiqueta: string | null; programada_para: string | null; estado: EstadoCampana; iniciada_en: string | null; terminada_en: string | null; creado_en: string };
export const NOMBRE_ESTADO: Record<EstadoCampana, string> = { borrador: "Borrador", programada: "Programada", enviando: "Enviando", detenida: "Detenida", enviada: "Enviada", cancelada: "Cancelada" };
/** "Go Big · 30 oct" → "go-big-30-oct" (para utm_campaign). */
export const slug = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "correo";
```

`lib/correos/destino.ts`:

```ts
const INICIO = "https://dodopizza.mx/";
export const dominioPermitido = (host: string, extra: string[]) => {
  const h = host.toLowerCase();
  return h === "dodopizza.mx" || h.endsWith(".dodopizza.mx") || extra.some((d) => { const x = d.trim().toLowerCase(); return x !== "" && (h === x || h.endsWith("." + x)); });
};
/** A dónde manda el clic: solo https a dominios permitidos; agrega UTM si la URL no trae utm_source. */
export function destinoClic(u: string | null, campana: string, extra: string[]): string {
  let url: URL;
  try { url = new URL(String(u ?? "")); } catch { return INICIO; }
  if (url.protocol !== "https:" || url.username || url.password || !dominioPermitido(url.hostname, extra)) return INICIO;
  if (!url.searchParams.has("utm_source")) {
    url.searchParams.set("utm_source", "correo"); url.searchParams.set("utm_medium", "email"); url.searchParams.set("utm_campaign", campana);
  }
  return url.toString();
}
export const dominiosExtra = () => (process.env.CORREOS_DOMINIOS_EXTRA ?? "").split(",").map((d) => d.trim()).filter(Boolean);
```

`lib/correos/preparar.ts`:

```ts
const DODO = /^https:\/\/(?:[a-z0-9-]+\.)*dodopizza\.mx(?:[/?#]|$)/i;
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const decodificar = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** HTML listo para un destinatario: enlaces de Dodo pasan por el seguimiento, píxel de apertura y pie de baja. */
export function prepararCorreo(html: string, token: string, base: string, asunto: string): { html: string; texto: string } {
  const b = base.replace(/\/+$/, ""), t = encodeURIComponent(token);
  const enlaces: string[] = [];
  const conClics = html.replace(/href\s*=\s*(["'])(.*?)\1/gi, (todo, _q: string, url: string) => {
    const real = decodificar(url.trim());
    if (!DODO.test(real)) return todo;
    if (!enlaces.includes(real)) enlaces.push(real);
    return `href="${b}/api/correos/c/${t}?u=${encodeURIComponent(real)}"`;
  });
  const baja = `${b}/baja/${t}`;
  const extra = `<img src="${b}/api/correos/a/${t}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
    + `<p style="margin:16px 0;font:12px Arial,Helvetica,sans-serif;color:#777;text-align:center">Si ya no quieres recibir estos correos, <a href="${escapar(baja)}" style="color:#777">date de baja aquí</a>.</p>`;
  const i = conClics.search(/<\/body>/i);
  const final = i >= 0 ? conClics.slice(0, i) + extra + conClics.slice(i) : conClics + extra;
  const texto = [asunto, "", ...enlaces.map((e) => e), "", `Darte de baja: ${baja}`].join("\n");
  return { html: final, texto };
}
```

`lib/correos/html.ts`:

```ts
/** Quita lo que los clientes de correo bloquean y que sería riesgoso en la vista previa. */
export function limpiarHtml(html: string): { html: string; quitados: number } {
  let quitados = 0;
  const contar = (re: RegExp, s: string) => s.replace(re, () => { quitados++; return ""; });
  let r = contar(/<script\b[\s\S]*?<\/script\s*>/gi, html);
  r = contar(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, r);
  r = r.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, (_m, attr: string) => { quitados++; return `${attr}="#"`; });
  return { html: r, quitados };
}
```

`lib/correos/csv.ts`:

```ts
type Fila = { email: string; nombre: string | null; etiquetas: string[] };
function celdas(linea: string, sep: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (q) { if (ch === '"' && linea[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out.map((c) => c.trim());
}
/** CSV de contactos: columnas correo/email (obligatoria), nombre, etiquetas (separadas por ; o ,). */
export function leerCsvContactos(texto: string): { filas: Fila[]; error?: string } {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) return { filas: [], error: "El archivo está vacío." };
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cab = celdas(lineas[0], sep).map((c) => c.toLowerCase());
  const iC = cab.findIndex((c) => c === "correo" || c === "email" || c === "e-mail"), iN = cab.indexOf("nombre"), iE = cab.indexOf("etiquetas");
  if (iC < 0) return { filas: [], error: "Falta la columna correo (o email)." };
  const filas = lineas.slice(1).map((l) => {
    const c = celdas(l, sep);
    const etiquetas = iE >= 0 ? (c[iE] ?? "").split(/[;,]/).map((x) => x.trim().toLowerCase()).filter(Boolean) : [];
    return { email: (c[iC] ?? "").trim().toLowerCase(), nombre: iN >= 0 && c[iN] ? c[iN] : null, etiquetas };
  }).filter((f) => f.email !== "");
  return { filas };
}
```

`lib/correos/estadisticas.ts`:

```ts
import type { Envio, Evento } from "./tipos.ts";
export type Estadisticas = { destinatarios: number; aceptados: number; problema: number; pendientes: number; abrieron: number; clics: number; bajas: number;
  pctApertura: number; pctClic: number; porEnlace: { enlace: string; personas: number }[]; porHora: { hora: string; aperturas: number; clics: number }[];
  porEnvio: Record<string, { abrio: string | null; clic: string | null }> };
const horaMX = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:00`;
};
const sinUtm = (u: string) => { try { const x = new URL(u); [...x.searchParams.keys()].filter((k) => k.startsWith("utm_")).forEach((k) => x.searchParams.delete(k)); return x.toString().replace(/\?$/, ""); } catch { return u; } };
/** Números de una campaña. Sin pruebas; clics sospechosos fuera; un clic real también cuenta como apertura. */
export function estadisticas(envios: Envio[], eventos: Evento[]): Estadisticas {
  const reales = envios.filter((e) => !e.es_prueba), ids = new Set(reales.map((e) => e.id));
  const porEnvio: Estadisticas["porEnvio"] = Object.fromEntries(reales.map((e) => [e.id, { abrio: null, clic: null }]));
  const enlaces = new Map<string, Set<string>>(), horas = new Map<string, { aperturas: number; clics: number }>(), bajas = new Set<string>();
  for (const ev of [...eventos].sort((a, b) => a.creado_en.localeCompare(b.creado_en))) {
    if (!ids.has(ev.envio_id) || ev.sospechoso) continue;
    const p = porEnvio[ev.envio_id], h = horas.get(horaMX(ev.creado_en)) ?? { aperturas: 0, clics: 0 };
    if (ev.tipo === "baja") { bajas.add(ev.envio_id); continue; }
    if (!p.abrio) { p.abrio = ev.creado_en; h.aperturas++; }
    if (ev.tipo === "clic") {
      if (!p.clic) { p.clic = ev.creado_en; h.clics++; }
      const k = sinUtm(ev.enlace ?? ""); enlaces.set(k, (enlaces.get(k) ?? new Set()).add(ev.envio_id));
    }
    horas.set(horaMX(ev.creado_en), h);
  }
  const aceptados = reales.filter((e) => e.estado === "aceptado").length, valores = Object.values(porEnvio);
  const abrieron = valores.filter((v) => v.abrio).length, clics = valores.filter((v) => v.clic).length;
  return {
    destinatarios: reales.length, aceptados, problema: reales.filter((e) => e.estado === "problema").length,
    pendientes: reales.filter((e) => e.estado === "pendiente" || e.estado === "procesando").length,
    abrieron, clics, bajas: bajas.size, pctApertura: aceptados ? abrieron / aceptados : 0, pctClic: aceptados ? clics / aceptados : 0,
    porEnlace: [...enlaces].map(([enlace, s]) => ({ enlace, personas: s.size })).sort((a, b) => b.personas - a.personas),
    porHora: [...horas].map(([hora, v]) => ({ hora, ...v })).filter((h) => h.aperturas || h.clics).sort((a, b) => a.hora.localeCompare(b.hora)),
    porEnvio,
  };
}
```

- [ ] **Step 4: Ver que pasan**

Run: `node --experimental-strip-types --test lib/correos/*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/correos package.json
git commit -m "feat(correos): preparar HTML, destino de clics, limpieza, CSV y estadísticas"
```

---

### Task 5: Rutas para n8n (`siguiente`, `resultado`) y rutas públicas

**Files:**
- Create: `app/api/correos/siguiente/route.ts`, `app/api/correos/resultado/route.ts`, `lib/correos/llave.ts`, `lib/correos/llave.test.ts`
- Modify: `lib/rutasPublicas.ts`, `lib/rutasPublicas.test.ts`, `package.json`

**Interfaces:**
- Consumes: `correo_tomar_lote`, `correo_registrar_resultado` (service_role), `prepararCorreo`, `crearClienteAdmin`.
- Produces: `llaveValida(recibida: string | null, esperada: string | undefined): boolean`; `esRebote(detalle: string | null): boolean`; JSON `siguiente` → `[{ envio_id, para, asunto, html, texto }]`.

- [ ] **Step 1: Pruebas que fallan**

`lib/correos/llave.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { esRebote, llaveValida } from "./llave.ts";
test("llave: exacta, sin espacios sobrantes y nunca vacía", () => {
  assert.equal(llaveValida(" abc ", "abc\n"), true);
  assert.equal(llaveValida("abc", "abd"), false);
  assert.equal(llaveValida(null, "abc"), false);
  assert.equal(llaveValida("", ""), false);
  assert.equal(llaveValida("x", undefined), false);
});
test("rebote: solo respuestas SMTP 5xx de destinatario", () => {
  assert.equal(esRebote("550 5.1.1 user unknown"), true);
  assert.equal(esRebote("Can't send mail - all recipients were rejected: 553 mailbox"), true);
  assert.equal(esRebote("421 try again later"), false);
  assert.equal(esRebote("Connection timeout"), false);
  assert.equal(esRebote(null), false);
});
```

En `lib/rutasPublicas.test.ts` agrega:

```ts
test("correos: seguimiento, n8n y baja sin sesión; la sección no", () => {
  for (const r of ["/api/correos/siguiente", "/api/correos/resultado", "/api/correos/a/tok", "/api/correos/c/tok", "/baja/tok"]) assert.equal(rutaSinSesion(r), true, r);
  for (const r of ["/correos", "/correos/contactos", "/bajas"]) assert.equal(rutaSinSesion(r), false, r);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `node --experimental-strip-types --test lib/correos/llave.test.ts lib/rutasPublicas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementación**

`lib/correos/llave.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
/** Compara la llave de n8n sin filtrar su largo por tiempo; ignora espacios pegados al copiar en Vercel. */
export function llaveValida(recibida: string | null, esperada: string | undefined): boolean {
  const a = Buffer.from((recibida ?? "").trim()), b = Buffer.from((esperada ?? "").trim());
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
/** El servidor rechazó la dirección (5xx): el contacto se marca con rebote. */
export const esRebote = (detalle: string | null) => /\b5[0-9]{2}\b/.test(detalle ?? "");
```

`lib/rutasPublicas.ts`: agrega `"/api/correos/"` y `"/baja/"` a `CON_PREFIJO` y actualiza el comentario («…las de correos (n8n con x-api-key; píxel, clic y baja públicos por token)…»).

`app/api/correos/siguiente/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin, urlInvitacion } from "@/lib/supabase/admin";
import { llaveValida } from "@/lib/correos/llave";
import { prepararCorreo } from "@/lib/correos/preparar";

export const dynamic = "force-dynamic";

/** n8n pide el siguiente lote (máx. 8). Body opcional { lote }. Header x-api-key = CORREOS_API_KEY. */
export async function POST(req: NextRequest) {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.CORREOS_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let lote = 8;
  try { const b = await req.json(); if (Number.isInteger(b?.lote)) lote = b.lote; } catch { /* sin cuerpo: 8 */ }
  const base = new URL(urlInvitacion()).origin;
  const { data, error } = await crearClienteAdmin().rpc("correo_tomar_lote", { p_lote: lote });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filas = (data ?? []) as { envio_id: string; token: string; para: string; asunto: string; html: string }[];
  return NextResponse.json(filas.map((f) => ({ envio_id: f.envio_id, para: f.para, asunto: f.asunto, ...prepararCorreo(f.html, f.token, base, f.asunto) })));
}
```

`app/api/correos/resultado/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { esRebote, llaveValida } from "@/lib/correos/llave";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** n8n reporta cómo le fue a un correo: { envio_id, aceptado, message_id?, detalle? }. */
export async function POST(req: NextRequest) {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.CORREOS_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let b: { envio_id?: unknown; aceptado?: unknown; message_id?: unknown; detalle?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "El cuerpo no es JSON válido." }, { status: 400 }); }
  if (typeof b.envio_id !== "string" || !UUID.test(b.envio_id) || typeof b.aceptado !== "boolean") return NextResponse.json({ error: "Falta envio_id o aceptado." }, { status: 400 });
  const detalle = typeof b.detalle === "string" ? b.detalle : null;
  const { error } = await crearClienteAdmin().rpc("correo_registrar_resultado", {
    p_envio: b.envio_id, p_aceptado: b.aceptado, p_message_id: typeof b.message_id === "string" ? b.message_id : null, p_detalle: detalle, p_rebote: !b.aceptado && esRebote(detalle),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

Agrega `lib/correos/llave.test.ts` a `scripts.test`.

- [ ] **Step 4: Pruebas y tipos**

Run: `node --experimental-strip-types --test lib/correos/llave.test.ts lib/rutasPublicas.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/api/correos/siguiente app/api/correos/resultado lib/correos/llave.ts lib/correos/llave.test.ts lib/rutasPublicas.ts lib/rutasPublicas.test.ts package.json
git commit -m "feat(correos): rutas para que n8n pida lotes y reporte resultados"
```

---

### Task 6: Píxel, clic y página de baja

**Files:**
- Create: `app/api/correos/a/[token]/route.ts`, `app/api/correos/c/[token]/route.ts`, `app/baja/[token]/page.tsx`, `app/baja/[token]/acciones.ts`, `app/baja/baja.module.css`
- Test: `tests/correosSeguimiento.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `correo_registrar_evento`, `correo_baja_por_token`, `destinoClic`, `dominiosExtra`, `slug`.
- Produces: `GIF_1x1: Buffer` exportado desde la ruta del píxel no es necesario fuera; la prueba revisa el código fuente.

- [ ] **Step 1: Prueba que falla** (`tests/correosSeguimiento.test.mjs`, revisa el código como `tests/n8nCumplimiento.test.mjs` revisa el flujo)

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('seguimiento: píxel sin caché, clic con destino validado y baja con botón',()=>{
 const a=leer('app/api/correos/a/[token]/route.ts'),c=leer('app/api/correos/c/[token]/route.ts'),p=leer('app/baja/[token]/page.tsx'),x=leer('app/baja/[token]/acciones.ts');
 assert.match(a,/image\/gif/);assert.match(a,/no-store/);assert.match(a,/correo_registrar_evento/);
 assert.match(c,/destinoClic\(/);assert.match(c,/status:\s*302/);assert.doesNotMatch(c,/redirect\(u\)/);
 assert.doesNotMatch(p,/correo_baja_por_token/,'abrir la página no debe dar de baja');
 assert.match(p,/<form action=\{darDeBaja\}/);assert.match(x,/correo_baja_por_token/);
});
```

Agrégala a `scripts.test`.

- [ ] **Step 2: Ver que falla**

Run: `node --test tests/correosSeguimiento.test.mjs`
Expected: FAIL (`ENOENT`).

- [ ] **Step 3: Implementación**

`app/api/correos/a/[token]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Píxel de apertura. Siempre responde la imagen; si el token no existe no registra nada. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (/^[0-9a-f]{64}$/.test(token)) {
    await crearClienteAdmin().rpc("correo_registrar_evento", { p_token: token, p_tipo: "apertura", p_enlace: null, p_agente: req.headers.get("user-agent") });
  }
  return new NextResponse(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, max-age=0" } });
}
```

`app/api/correos/c/[token]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { destinoClic, dominiosExtra } from "@/lib/correos/destino";
import { slug } from "@/lib/correos/tipos";

export const dynamic = "force-dynamic";

/** Clic: registra y redirige solo a dominios permitidos (si no, a dodopizza.mx). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = req.nextUrl.searchParams.get("u");
  let campana = "correo";
  if (/^[0-9a-f]{64}$/.test(token)) {
    const previo = destinoClic(u, "correo", dominiosExtra());
    const { data } = await crearClienteAdmin().rpc("correo_registrar_evento", { p_token: token, p_tipo: "clic", p_enlace: previo, p_agente: req.headers.get("user-agent") });
    if (data?.campana_nombre) campana = slug(String(data.campana_nombre));
  }
  return NextResponse.redirect(destinoClic(u, campana, dominiosExtra()), { status: 302 });
}
```

`app/baja/[token]/acciones.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export async function darDeBaja(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (!/^[0-9a-f]{64}$/.test(token)) redirect(`/baja/${encodeURIComponent(token)}?estado=invalido`);
  const { data } = await crearClienteAdmin().rpc("correo_baja_por_token", { p_token: token });
  redirect(`/baja/${token}?estado=${data ? "listo" : "invalido"}`);
}
```

`app/baja/[token]/page.tsx`:

```tsx
import styles from "../baja.module.css";
import { darDeBaja } from "./acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Darse de baja · Dodo Pizza", robots: { index: false } };

/** Pública. Abrirla no da de baja (los antivirus abren enlaces): hay que pulsar el botón. */
export default async function Baja({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ estado?: string }> }) {
  const { token } = await params, { estado } = await searchParams;
  return <main className={styles.pagina}><section className={styles.tarjeta}>
    <h1>Dodo Pizza</h1>
    {estado === "listo" ? <p>Listo. Ya no te mandaremos estos correos.</p>
      : estado === "invalido" ? <p>Este enlace no es válido. Si quieres darte de baja, responde a cualquiera de nuestros correos.</p>
      : <><p>¿Ya no quieres recibir nuestros correos?</p>
        <form action={darDeBaja}><input type="hidden" name="token" value={token} /><button type="submit" className={styles.boton}>Darme de baja</button></form></>}
  </section></main>;
}
```

`app/baja/baja.module.css`:

```css
.pagina{min-height:100dvh;display:grid;place-items:center;padding:16px;background:#ff4e00}
.tarjeta{max-width:420px;width:100%;background:#fff;border-radius:16px;padding:32px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif}
.tarjeta h1{margin:0 0 16px;color:#ff4e00}
.boton{margin-top:16px;padding:12px 20px;border:2px solid #231f20;background:#ffeba5;font-weight:700;font-size:16px;cursor:pointer}
```

- [ ] **Step 4: Pruebas y tipos**

Run: `node --test tests/correosSeguimiento.test.mjs && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/correos/a app/api/correos/c app/baja tests/correosSeguimiento.test.mjs package.json
git commit -m "feat(correos): píxel de apertura, redirección de clics y página de baja"
```

---

### Task 7: Sección Correos: lista de campañas, crear y editar

**Files:**
- Create: `app/correos/layout.tsx`, `app/correos/page.tsx`, `app/correos/datos.ts`, `app/correos/acciones.ts`, `app/correos/FormCampana.tsx`, `app/correos/nueva/page.tsx`, `app/correos/[id]/editar/page.tsx`, `app/correos/correos.module.css`, `app/correos/error.tsx`, `app/correos/loading.tsx`
- Test: `tests/correosVista.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `puedeVerCorreos`, `puedeEditarCorreos`, `obtenerPerfil`, `volver`, `limpiarHtml`, RPC de la tarea 2, `Campana`, `NOMBRE_ESTADO`.
- Produces: `datos.ts`: `leerCampanas(sb): Promise<Campana[]>`, `leerCampana(sb, id): Promise<Campana | null>`, `esperandoN8n(sb): Promise<boolean>`, `leerEtiquetas(sb): Promise<string[]>`, `mensajeDe(error)`; `acciones.ts`: `guardarCampana(fd)`, `cambiarEstado(fd)`, `mandarPrueba(fd)`.

- [ ] **Step 1: Prueba que falla** (`tests/correosVista.cjs`, estilo de `tests/pagosVista.cjs`: revisa el código)

```js
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const leer=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('correos vista: permisos, vista previa aislada y acciones por RPC',()=>{
 const layout=leer('app/correos/layout.tsx'),acc=leer('app/correos/acciones.ts'),form=leer('app/correos/FormCampana.tsx');
 assert.match(layout,/puedeVerCorreos\(perfil\.rol\)/);
 assert.match(acc,/puedeEditarCorreos/);assert.match(acc,/limpiarHtml\(/);
 for(const r of ['correo_guardar_campana','correo_cambiar_estado','correo_mandar_prueba'])assert.match(acc,new RegExp(r));
 assert.match(form,/<iframe[^>]*sandbox=""/);assert.match(form,/accept="\.html,text\/html"/);
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test tests/correosVista.cjs`
Expected: FAIL (`ENOENT`).

- [ ] **Step 3: Implementación**

`app/correos/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerCorreos } from "@/lib/roles";
export const dynamic = "force-dynamic";
/** Marketing y admin hacen todo; corporativo consulta. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerCorreos(perfil.rol)) redirect("/");
  return <Marco perfil={perfil} titulo="Correos" detalle="Campañas, contactos y estadísticas">{children}</Marco>;
}
```

`app/correos/datos.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campana, Envio, Evento } from "@/lib/correos/tipos";
export function mensajeDe(error: { code?: string; message: string }): string {
  return error.code === "P0001" ? error.message : "No se pudo completar la operación. Intenta de nuevo.";
}
const COLS = "id,nombre,asunto,html,etiqueta,programada_para,estado,iniciada_en,terminada_en,creado_en";
export async function leerCampanas(sb: SupabaseClient): Promise<Campana[]> {
  const { data, error } = await sb.from("correo_campanas").select(COLS).order("creado_en", { ascending: false }).limit(200);
  if (error) throw new Error(error.message); return (data ?? []) as Campana[];
}
export async function leerCampana(sb: SupabaseClient, id: string): Promise<Campana | null> {
  const { data } = await sb.from("correo_campanas").select(COLS).eq("id", id).maybeSingle(); return (data as Campana) ?? null;
}
/** n8n no ha pedido correos en 10 min (o nunca). */
export async function esperandoN8n(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb.from("correo_estado_n8n").select("ultima_consulta").eq("id", 1).maybeSingle();
  const u = data?.ultima_consulta ? Date.parse(data.ultima_consulta) : 0; return Date.now() - u > 10 * 60_000;
}
export async function leerEtiquetas(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.from("correo_contactos").select("etiquetas").eq("estado", "activo").limit(20000);
  return [...new Set((data ?? []).flatMap((r) => r.etiquetas as string[]))].sort();
}
export async function leerEnviosYEventos(sb: SupabaseClient, campana: string): Promise<{ envios: Envio[]; eventos: Evento[] }> {
  const { data: envios, error } = await sb.from("correo_envios").select("id,email,es_prueba,estado,enviado_en,detalle").eq("campana_id", campana).limit(50000);
  if (error) throw new Error(error.message);
  const ids = (envios ?? []).map((e) => e.id); const eventos: Evento[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await sb.from("correo_eventos").select("envio_id,tipo,enlace,sospechoso,creado_en").in("envio_id", ids.slice(i, i + 500)).limit(100000);
    eventos.push(...((data ?? []) as Evento[]));
  }
  return { envios: (envios ?? []) as Envio[], eventos };
}
```

`app/correos/acciones.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { limpiarHtml } from "@/lib/correos/html";
import { volver } from "../compras/servidor";
import { mensajeDe } from "./datos";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
async function cliente(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCorreos(perfil.rol)) volver(ruta, "error", "Solo marketing o administración puede hacer esto.");
  return supabase;
}
/** "2026-11-07T12:00" (hora de México del input datetime-local) → ISO con -06:00. */
const isoMX = (local: string) => (local ? `${local}:00-06:00` : null);

export async function guardarCampana(fd: FormData) {
  const id = texto(fd, "id") || null, ruta = id ? `/correos/${id}/editar` : "/correos/nueva";
  const sb = await cliente(ruta);
  const archivo = fd.get("archivo");
  let html = texto(fd, "html");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > 500_000) volver(ruta, "error", "El archivo HTML pesa más de 500 KB.");
    html = (await archivo.text()).trim();
  }
  const limpio = limpiarHtml(html);
  const { data, error } = await sb.rpc("correo_guardar_campana", { p: { id, nombre: texto(fd, "nombre"), asunto: texto(fd, "asunto"), html: limpio.html, etiqueta: texto(fd, "etiqueta") || null } });
  if (error) volver(ruta, "error", mensajeDe(error));
  revalidatePath("/correos", "layout");
  volver(`/correos/${data}/editar`, "ok", limpio.quitados ? `Guardada. Se quitaron ${limpio.quitados} partes con scripts que los correos bloquean.` : "Guardada.");
}

export async function cambiarEstado(fd: FormData) {
  const id = texto(fd, "id"), accionTxt = texto(fd, "accion"), ruta = texto(fd, "volver_a") || `/correos/${id}`;
  const sb = await cliente(ruta);
  const cuando = accionTxt === "programar" && texto(fd, "cuando") === "fecha" ? isoMX(texto(fd, "fecha")) : null;
  if (accionTxt === "programar" && texto(fd, "cuando") === "fecha" && !cuando) volver(ruta, "error", "Elige fecha y hora.");
  const { error } = await sb.rpc("correo_cambiar_estado", { p_id: id, p_accion: accionTxt, p_cuando: cuando });
  if (error) volver(ruta, "error", mensajeDe(error));
  revalidatePath("/correos", "layout");
  const msg: Record<string, string> = { programar: "Programada.", borrador: "Regresó a borrador.", cancelar: "Cancelada.", detener: "Detenida.", reanudar: "Reanudada.", reintentar: "Los que tenían problema vuelven a la cola." };
  volver(accionTxt === "programar" ? `/correos/${id}` : ruta, "ok", msg[accionTxt] ?? "Listo.");
}

export async function mandarPrueba(fd: FormData) {
  const id = texto(fd, "id"), ruta = `/correos/${id}/editar`;
  const sb = await cliente(ruta);
  const correos = texto(fd, "correos").split(/[,;\s]+/).filter(Boolean);
  const { data, error } = await sb.rpc("correo_mandar_prueba", { p_id: id, p_correos: correos });
  if (error) volver(ruta, "error", mensajeDe(error));
  volver(ruta, "ok", `Prueba en camino a ${data} correo${data === 1 ? "" : "s"}; llega en menos de un minuto.`);
}
```

`app/correos/FormCampana.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { Campana } from "@/lib/correos/tipos";
import styles from "./correos.module.css";
import { cambiarEstado, guardarCampana, mandarPrueba } from "./acciones";

export function FormCampana({ campana, etiquetas, conteos }: { campana: Campana | null; etiquetas: string[]; conteos: Record<string, number> }) {
  const [html, setHtml] = useState(campana?.html ?? "");
  const [etiqueta, setEtiqueta] = useState(campana?.etiqueta ?? "");
  const [cuando, setCuando] = useState("ahora");
  return <div className={styles.columnas}>
    <form action={guardarCampana} className={styles.panel}>
      {campana && <input type="hidden" name="id" value={campana.id} />}
      <label>Nombre interno<input name="nombre" required maxLength={120} defaultValue={campana?.nombre} /></label>
      <label>Asunto<input name="asunto" required maxLength={150} defaultValue={campana?.asunto} /></label>
      <label>Archivo HTML de Canva<input type="file" name="archivo" accept=".html,text/html" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setHtml(await f.text()); }} /></label>
      <label>O pega el HTML<textarea name="html" rows={8} value={html} onChange={(e) => setHtml(e.target.value)} /></label>
      <label>A quién va<select name="etiqueta" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
        <option value="">Toda la base ({conteos[""] ?? 0})</option>
        {etiquetas.map((t) => <option key={t} value={t}>{t} ({conteos[t] ?? 0})</option>)}
      </select></label>
      <button type="submit" className="boton">Guardar</button>
    </form>
    <div className={styles.panel}>
      <h2>Vista previa</h2>
      <iframe title="Vista previa del correo" sandbox="" srcDoc={html} className={styles.previa} />
      {campana && <>
        <form action={mandarPrueba} className={styles.fila}>
          <input type="hidden" name="id" value={campana.id} />
          <label>Mandar prueba a (hasta 5, separados por coma)<input name="correos" required placeholder="tu@dodopizza.mx" /></label>
          <button type="submit" className="boton">Mandar prueba</button>
        </form>
        {campana.estado === "borrador" && <form action={cambiarEstado} className={styles.fila}>
          <input type="hidden" name="id" value={campana.id} /><input type="hidden" name="accion" value="programar" />
          <input type="hidden" name="volver_a" value={`/correos/${campana.id}/editar`} />
          <fieldset><legend>Cuándo</legend>
            <label><input type="radio" name="cuando" value="ahora" checked={cuando === "ahora"} onChange={() => setCuando("ahora")} /> Enviar ahora</label>
            <label><input type="radio" name="cuando" value="fecha" checked={cuando === "fecha"} onChange={() => setCuando("fecha")} /> Fecha y hora (México)</label>
            {cuando === "fecha" && <input type="datetime-local" name="fecha" required />}
          </fieldset>
          <button type="submit" className="boton">Programar envío</button>
        </form>}
      </>}
    </div>
  </div>;
}
```

`app/correos/nueva/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { redirect } from "next/navigation";
import { FormCampana } from "../FormCampana";
import { leerEtiquetas } from "../datos";

export default async function Nueva({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCorreos(perfil.rol)) redirect("/correos");
  const sp = await searchParams, etiquetas = await leerEtiquetas(supabase);
  const conteos: Record<string, number> = {};
  for (const t of ["", ...etiquetas]) conteos[t] = Number((await supabase.rpc("correo_contar_destinatarios", { p_etiqueta: t || null })).data ?? 0);
  return <>{sp.error && <Aviso tipo="error">{sp.error}</Aviso>}<h1>Nueva campaña</h1><FormCampana campana={null} etiquetas={etiquetas} conteos={conteos} /></>;
}
```

`app/correos/[id]/editar/page.tsx`: igual que `nueva/page.tsx`, pero recibe `params: Promise<{ id: string }>`, lee `leerCampana(supabase, id)`, hace `notFound()` si no existe o `redirect(`/correos/${id}`)` si su estado no es `borrador` ni `programada`, muestra `sp.ok` con `<Aviso tipo="ok">`, el título `Editar «{campana.nombre}»` y, si está `programada`, dos formularios con `cambiarEstado` (`accion` = `borrador` y `cancelar`).

Antes de escribir los avisos, revisa la firma real: `grep -n "export function Aviso" -A3 components/Aviso.tsx` y usa sus props tal cual (si no recibe `tipo`, usa la que tenga).

`app/correos/page.tsx`:

```tsx
import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { NOMBRE_ESTADO } from "@/lib/correos/tipos";
import { estadisticas } from "@/lib/correos/estadisticas";
import { fechaHoraMX } from "./formato";
import styles from "./correos.module.css";
import { esperandoN8n, leerCampanas, leerEnviosYEventos } from "./datos";

export default async function Campanas() {
  const { supabase, perfil } = await obtenerPerfil();
  const [campanas, sinN8n] = await Promise.all([leerCampanas(supabase), esperandoN8n(supabase)]);
  const enviadas = await Promise.all(campanas.filter((c) => c.estado === "enviada").slice(0, 20).map(async (c) => {
    const { envios, eventos } = await leerEnviosYEventos(supabase, c.id); return [c.id, estadisticas(envios, eventos)] as const;
  }));
  const stats = Object.fromEntries(enviadas);
  return <>
    <header className={styles.cabecera}><h1>Campañas</h1>{puedeEditarCorreos(perfil.rol) && <Link className="boton" href="/correos/nueva">Nueva campaña</Link>}</header>
    {!campanas.length && <p>Aún no hay campañas.</p>}
    <div className={styles.tarjetas}>{campanas.map((c) => {
      const s = stats[c.id], espera = sinN8n && (c.estado === "enviando" || (c.estado === "programada" && c.programada_para && Date.parse(c.programada_para) < Date.now()));
      return <Link key={c.id} href={c.estado === "borrador" ? `/correos/${c.id}/editar` : `/correos/${c.id}`} className={styles.tarjeta}>
        <span className={styles[c.estado]}>{NOMBRE_ESTADO[c.estado]}</span>
        <strong>{c.nombre}</strong><span>{c.asunto}</span>
        <small>{c.programada_para ? fechaHoraMX(c.programada_para) : "Sin programar"}</small>
        {s && <small>{Math.round(s.pctApertura * 100)} % aperturas · {Math.round(s.pctClic * 100)} % clics</small>}
        {espera && <small className={styles.alerta}>Esperando a n8n</small>}
      </Link>;
    })}</div>
  </>;
}
```

Crea `app/correos/formato.ts`:

```ts
export const fechaHoraMX = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
```

`app/correos/correos.module.css`:

```css
.cabecera{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.tarjetas{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.tarjeta{display:flex;flex-direction:column;gap:4px;padding:16px;border:1px solid var(--borde,#ddd);border-radius:12px;color:inherit;text-decoration:none;background:var(--superficie,#fff)}
.alerta{color:#b42318;font-weight:600}
.borrador,.programada,.enviando,.detenida,.enviada,.cancelada{align-self:flex-start;font-size:12px;padding:2px 8px;border-radius:999px;background:#eee}
.enviando{background:#fff4d6}.enviada{background:#dcfae6}.detenida,.cancelada{background:#fee4e2}
.columnas{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
@media (max-width:900px){.columnas{grid-template-columns:1fr}}
.panel{display:flex;flex-direction:column;gap:12px}
.panel label{display:flex;flex-direction:column;gap:4px}
.fila{display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid var(--borde,#ddd)}
.previa{width:100%;height:640px;border:1px solid var(--borde,#ddd);border-radius:8px;background:#fff}
.numeros{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.numeros div{padding:12px;border-radius:12px;background:var(--superficie,#fff);border:1px solid var(--borde,#ddd)}
.numeros strong{display:block;font-size:24px}
```

`app/correos/error.tsx` y `loading.tsx`: copia los de `app/tareas/` cambiando el texto a «Correos».

Agrega `tests/correosVista.cjs` a `scripts.test`.

- [ ] **Step 4: Pruebas, tipos y vista en el navegador**

Run: `node --test tests/correosVista.cjs && npx tsc --noEmit`
Expected: PASS.
Después: `npm run dev`, entrar como admin a `/correos/nueva`, subir un HTML de Canva y ver la vista previa (sin migración local la lista falla al leer: eso se prueba en la tarea 10).

- [ ] **Step 5: Commit**

```bash
git add app/correos tests/correosVista.cjs package.json
git commit -m "feat(correos): lista de campañas, crear, editar, prueba y programar"
```

---

### Task 8: Estadísticas de la campaña y CSV

**Files:**
- Create: `app/correos/[id]/page.tsx`, `app/correos/[id]/csv/route.ts`, `lib/correos/csvSalida.ts`, `lib/correos/csvSalida.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `leerCampana`, `leerEnviosYEventos`, `esperandoN8n`, `estadisticas`, `cambiarEstado`, `fechaHoraMX`.
- Produces: `csvDestinatarios(envios: Envio[], porEnvio: Estadisticas["porEnvio"]): string`.

- [ ] **Step 1: Prueba que falla**

`lib/correos/csvSalida.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { csvDestinatarios } from "./csvSalida.ts";
test("csv salida: BOM, encabezados, comillas y sin pruebas", () => {
  const c = csvDestinatarios(
    [{ id: "a", email: "a@m.com", es_prueba: false, estado: "aceptado", enviado_en: "2026-11-07T18:00:00Z", detalle: 'dijo "ok"' }, { id: "p", email: "p@m.com", es_prueba: true, estado: "aceptado", enviado_en: null, detalle: null }],
    { a: { abrio: "2026-11-07T18:05:00Z", clic: null } });
  assert.equal(c, '﻿correo,estado,enviado,abrio,clic,detalle\r\na@m.com,aceptado,2026-11-07T18:00:00Z,2026-11-07T18:05:00Z,,"dijo ""ok"""\r\n');
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --experimental-strip-types --test lib/correos/csvSalida.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementación**

`lib/correos/csvSalida.ts`:

```ts
import type { Envio } from "./tipos.ts";
import type { Estadisticas } from "./estadisticas.ts";
const celda = (v: string | null) => { const s = v ?? ""; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function csvDestinatarios(envios: Envio[], porEnvio: Estadisticas["porEnvio"]): string {
  const filas = envios.filter((e) => !e.es_prueba).map((e) => [e.email, e.estado, e.enviado_en, porEnvio[e.id]?.abrio ?? null, porEnvio[e.id]?.clic ?? null, e.detalle].map(celda).join(","));
  return "﻿" + ["correo,estado,enviado,abrio,clic,detalle", ...filas].join("\r\n") + "\r\n";
}
```

`app/correos/[id]/csv/route.ts`:

```ts
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerCorreos } from "@/lib/roles";
import { estadisticas } from "@/lib/correos/estadisticas";
import { csvDestinatarios } from "@/lib/correos/csvSalida";
import { slug } from "@/lib/correos/tipos";
import { leerCampana, leerEnviosYEventos } from "../../datos";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCorreos(perfil.rol)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const c = await leerCampana(supabase, id); if (!c) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const { envios, eventos } = await leerEnviosYEventos(supabase, id);
  return new NextResponse(csvDestinatarios(envios, estadisticas(envios, eventos).porEnvio), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slug(c.nombre)}.csv"` },
  });
}
```

`app/correos/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { estadisticas } from "@/lib/correos/estadisticas";
import { NOMBRE_ESTADO } from "@/lib/correos/tipos";
import { cambiarEstado } from "../acciones";
import { esperandoN8n, leerCampana, leerEnviosYEventos } from "../datos";
import { fechaHoraMX } from "../formato";
import styles from "../correos.module.css";

const pct = (n: number) => `${Math.round(n * 1000) / 10} %`;
function Boton({ id, accion, texto }: { id: string; accion: string; texto: string }) {
  return <form action={cambiarEstado}><input type="hidden" name="id" value={id} /><input type="hidden" name="accion" value={accion} /><button type="submit" className="boton">{texto}</button></form>;
}

export default async function Campana({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const { id } = await params, sp = await searchParams, { supabase, perfil } = await obtenerPerfil();
  const c = await leerCampana(supabase, id); if (!c) notFound();
  const [{ envios, eventos }, sinN8n] = await Promise.all([leerEnviosYEventos(supabase, id), esperandoN8n(supabase)]);
  const s = estadisticas(envios, eventos), editar = puedeEditarCorreos(perfil.rol);
  const q = (sp.q ?? "").toLowerCase(), lista = envios.filter((e) => !e.es_prueba && e.email.includes(q)).slice(0, 500);
  return <>
    {sp.error && <p className={styles.alerta}>{sp.error}</p>}{sp.ok && <p>{sp.ok}</p>}
    <header className={styles.cabecera}><div><span className={styles[c.estado]}>{NOMBRE_ESTADO[c.estado]}</span><h1>{c.nombre}</h1><p>{c.asunto}</p>
      <small>{c.programada_para && `Programada: ${fechaHoraMX(c.programada_para)}`}{c.terminada_en && ` · Terminó: ${fechaHoraMX(c.terminada_en)}`}</small></div>
      {editar && <div className={styles.fila}>
        {(c.estado === "borrador" || c.estado === "programada") && <Link className="boton" href={`/correos/${c.id}/editar`}>Editar</Link>}
        {c.estado === "enviando" && <Boton id={c.id} accion="detener" texto="Detener" />}
        {c.estado === "detenida" && <Boton id={c.id} accion="reanudar" texto="Reanudar" />}
        {s.problema > 0 && c.estado !== "cancelada" && <Boton id={c.id} accion="reintentar" texto={`Reintentar ${s.problema} con problema`} />}
      </div>}
    </header>
    {sinN8n && (c.estado === "enviando" || c.estado === "programada") && <p className={styles.alerta}>Esperando a n8n: no ha pedido correos en más de 10 minutos.</p>}
    <section className={styles.numeros}>
      <div><strong>{s.destinatarios}</strong>destinatarios</div><div><strong>{s.aceptados}</strong>aceptados</div>
      <div><strong>{s.problema}</strong>con problema</div><div><strong>{s.pendientes}</strong>pendientes</div>
      <div><strong>{pct(s.pctApertura)}</strong>{s.abrieron} abrieron</div><div><strong>{pct(s.pctClic)}</strong>{s.clics} dieron clic</div>
      <div><strong>{s.bajas}</strong>bajas</div>
    </section>
    <p><small>Las aperturas son orientativas: Apple Mail las adelanta y quien bloquea imágenes no cuenta. Los clics de antivirus (primeros 10 s) no se cuentan.</small></p>
    {s.porEnlace.length > 0 && <section><h2>Clics por enlace</h2><ul>{s.porEnlace.map((e) => <li key={e.enlace}>{e.enlace}: {e.personas}</li>)}</ul></section>}
    {s.porHora.length > 0 && <section><h2>Actividad por hora</h2><ul>{s.porHora.map((h) => <li key={h.hora}>{h.hora}: {h.aperturas} aperturas · {h.clics} clics</li>)}</ul></section>}
    <section><header className={styles.cabecera}><h2>Destinatarios</h2><a className="boton" href={`/correos/${c.id}/csv`}>Descargar CSV</a></header>
      <form><input name="q" defaultValue={sp.q} placeholder="Buscar correo" /></form>
      <div className={styles.tarjetas}>{lista.map((e) => <div key={e.id} className={styles.tarjeta}>
        <strong>{e.email}</strong><span>{e.estado}</span>
        <small>{s.porEnvio[e.id]?.abrio ? `Abrió ${fechaHoraMX(s.porEnvio[e.id].abrio!)}` : "Sin apertura"}{s.porEnvio[e.id]?.clic && ` · Clic ${fechaHoraMX(s.porEnvio[e.id].clic!)}`}</small>
        {e.estado === "problema" && <small className={styles.alerta}>{e.detalle}</small>}
      </div>)}</div>
    </section>
    <section><h2>Correo enviado</h2><iframe title="Correo" sandbox="" srcDoc={c.html} className={styles.previa} /></section>
  </>;
}
```

Agrega `lib/correos/csvSalida.test.ts` a `scripts.test`.

- [ ] **Step 4: Pruebas y tipos**

Run: `node --experimental-strip-types --test lib/correos/csvSalida.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/correos/[id]" lib/correos/csvSalida.ts lib/correos/csvSalida.test.ts package.json
git commit -m "feat(correos): estadísticas de campaña y descarga de destinatarios"
```

---

### Task 9: Contactos e importación de CSV

**Files:**
- Create: `app/correos/contactos/page.tsx`, `app/correos/contactos/acciones.ts`
- Modify: `tests/correosVista.cjs`

**Interfaces:**
- Consumes: `leerCsvContactos`, RPC `correo_guardar_contacto`, `correo_importar_contactos`, `correo_baja_manual`, `puedeEditarCorreos`, `volver`, `mensajeDe`.
- Produces: `importarCsv(fd)` (previa con `confirmar=0`, guarda con `confirmar=1`), `guardarContacto(fd)`, `bajaManual(fd)`.

- [ ] **Step 1: Prueba que falla** (agregar a `tests/correosVista.cjs`)

```js
test('contactos: solo editores, previa antes de importar y CSV leído en el servidor',()=>{
 const p=leer('app/correos/contactos/page.tsx'),a=leer('app/correos/contactos/acciones.ts');
 assert.match(p,/puedeEditarCorreos\(perfil\.rol\)/);
 assert.match(a,/leerCsvContactos\(/);assert.match(a,/correo_importar_contactos/);assert.match(a,/p_confirmar/);
 assert.match(a,/correo_baja_manual/);
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test tests/correosVista.cjs`
Expected: FAIL.

- [ ] **Step 3: Implementación**

`app/correos/contactos/acciones.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { leerCsvContactos } from "@/lib/correos/csv";
import { volver } from "../../compras/servidor";
import { mensajeDe } from "../datos";

const R = "/correos/contactos";
const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
async function cliente() {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCorreos(perfil.rol)) volver("/correos", "error", "Solo marketing o administración puede hacer esto.");
  return supabase;
}

/** El componente Importar lee el archivo en el navegador y manda su texto en `contenido` (previa y confirmación). */
export async function importarCsv(fd: FormData) {
  const sb = await cliente();
  const confirmar = texto(fd, "confirmar") === "1", contenido = texto(fd, "contenido");
  if (contenido.length > 5_000_000) volver(R, "error", "El archivo pesa más de 5 MB.");
  const { filas, error: e } = leerCsvContactos(contenido);
  if (e) volver(R, "error", e);
  const etiquetaExtra = texto(fd, "etiqueta").toLowerCase();
  const conEtiqueta = filas.map((f) => ({ ...f, etiquetas: etiquetaExtra ? [...new Set([...f.etiquetas, etiquetaExtra])] : f.etiquetas }));
  const origen = texto(fd, "origen") || "CSV";
  const { data, error } = await sb.rpc("correo_importar_contactos", { p_filas: conEtiqueta, p_origen: origen, p_confirmar: confirmar });
  if (error) volver(R, "error", mensajeDe(error));
  const r = data as { nuevos: number; existentes: number; bajas: number; invalidos: number };
  const resumen = `${r.nuevos} nuevos, ${r.existentes} ya existían (se suman etiquetas), ${r.bajas} dados de baja (no se reactivan), ${r.invalidos} inválidos.`;
  if (confirmar) { revalidatePath("/correos", "layout"); volver(R, "ok", `Importado: ${resumen}`); }
  // Previa: se reenvía el contenido para confirmar sin volver a subir el archivo.
  volver(`${R}?previa=${encodeURIComponent(resumen)}&origen=${encodeURIComponent(origen)}&etiqueta=${encodeURIComponent(etiquetaExtra)}`, "ok", "Revisa el resumen y confirma.");
}

export async function guardarContacto(fd: FormData) {
  const sb = await cliente();
  const { error } = await sb.rpc("correo_guardar_contacto", { p: { id: texto(fd, "id") || null, email: texto(fd, "email"), nombre: texto(fd, "nombre"), etiquetas: texto(fd, "etiquetas").split(/[;,]/).map((x) => x.trim()).filter(Boolean) } });
  if (error) volver(R, "error", mensajeDe(error));
  revalidatePath(R); volver(R, "ok", "Contacto guardado.");
}

export async function bajaManual(fd: FormData) {
  const sb = await cliente();
  const { error } = await sb.rpc("correo_baja_manual", { p_id: texto(fd, "id") });
  if (error) volver(R, "error", mensajeDe(error));
  revalidatePath(R); volver(R, "ok", "Contacto dado de baja.");
}
```

La previa no puede pasar el archivo por la URL: el componente cliente `Importar` lee el archivo con `file.text()`, lo guarda en `sessionStorage` y lo manda en un `<textarea name="contenido">` oculto, tanto al revisar como al confirmar.

`app/correos/contactos/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import styles from "../correos.module.css";
import { bajaManual, guardarContacto } from "./acciones";
import { Importar } from "./Importar";

type Contacto = { id: string; email: string; nombre: string | null; etiquetas: string[]; estado: string; origen: string | null };

export default async function Contactos({ searchParams }: { searchParams: Promise<{ q?: string; etiqueta?: string; estado?: string; ok?: string; error?: string; previa?: string; origen?: string }> }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCorreos(perfil.rol)) redirect("/correos");
  const sp = await searchParams;
  let q = supabase.from("correo_contactos").select("id,email,nombre,etiquetas,estado,origen").order("email").limit(300);
  if (sp.q) q = q.or(`email.ilike.%${sp.q.replace(/[%,()]/g, "")}%,nombre.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);
  if (sp.estado) q = q.eq("estado", sp.estado);
  if (sp.etiqueta) q = q.contains("etiquetas", [sp.etiqueta]);
  const [{ data }, { count }] = await Promise.all([q, supabase.from("correo_contactos").select("id", { count: "exact", head: true }).eq("estado", "activo")]);
  const contactos = (data ?? []) as Contacto[];
  return <>
    {sp.error && <p className={styles.alerta}>{sp.error}</p>}{sp.ok && <p>{sp.ok}</p>}
    <header className={styles.cabecera}><h1>Contactos</h1><span>{count ?? 0} activos</span></header>
    <Importar previa={sp.previa ?? null} origen={sp.origen ?? ""} etiqueta={sp.etiqueta ?? ""} />
    <form className={styles.fila} action={guardarContacto}>
      <h2>Agregar contacto</h2>
      <label>Correo<input name="email" type="email" required /></label><label>Nombre<input name="nombre" /></label>
      <label>Etiquetas (separadas por coma)<input name="etiquetas" /></label><button className="boton" type="submit">Guardar</button>
    </form>
    <form className={styles.fila}><input name="q" defaultValue={sp.q} placeholder="Buscar correo o nombre" />
      <select name="estado" defaultValue={sp.estado ?? ""}><option value="">Todos</option><option value="activo">Activos</option><option value="baja">Dados de baja</option><option value="rebote">Con rebote</option></select>
      <button className="boton" type="submit">Filtrar</button></form>
    <div className={styles.tarjetas}>{contactos.map((c) => <div key={c.id} className={styles.tarjeta}>
      <strong>{c.email}</strong>{c.nombre && <span>{c.nombre}</span>}
      <small>{c.estado}{c.etiquetas.length ? ` · ${c.etiquetas.join(", ")}` : ""}{c.origen ? ` · ${c.origen}` : ""}</small>
      {c.estado === "activo" && <form action={bajaManual}><input type="hidden" name="id" value={c.id} /><button type="submit">Dar de baja</button></form>}
    </div>)}</div>
  </>;
}
```

`app/correos/contactos/Importar.tsx`:

```tsx
"use client";
import { useState } from "react";
import styles from "../correos.module.css";
import { importarCsv } from "./acciones";

/** Sube el CSV, muestra la previa del servidor y confirma con el mismo contenido. */
export function Importar({ previa, origen, etiqueta }: { previa: string | null; origen: string; etiqueta: string }) {
  const [contenido, setContenido] = useState(() => (typeof window !== "undefined" ? sessionStorage.getItem("correos-csv") ?? "" : ""));
  const [nombre, setNombre] = useState(origen);
  return <section className={styles.fila}>
    <h2>Importar CSV</h2>
    <p><small>Columnas: correo (obligatoria), nombre, etiquetas. Los dados de baja no se reactivan.</small></p>
    <form action={importarCsv} className={styles.fila}>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const t = await f.text(); setContenido(t); setNombre(f.name); try { sessionStorage.setItem("correos-csv", t); } catch {} }} />
      <textarea name="contenido" value={contenido} readOnly hidden /><input type="hidden" name="origen" value={nombre} />
      <label>Agregar esta etiqueta a todos (opcional)<input name="etiqueta" defaultValue={etiqueta} /></label>
      <input type="hidden" name="confirmar" value="0" />
      <button className="boton" type="submit" disabled={!contenido}>Revisar</button>
    </form>
    {previa && <form action={importarCsv} className={styles.fila}>
      <p>{previa}</p>
      <textarea name="contenido" value={contenido} readOnly hidden /><input type="hidden" name="origen" value={nombre} />
      <input type="hidden" name="etiqueta" value={etiqueta} /><input type="hidden" name="confirmar" value="1" />
      <button className="boton" type="submit" disabled={!contenido}>Confirmar importación</button>
    </form>}
  </section>;
}
```

- [ ] **Step 4: Pruebas y tipos**

Run: `node --test tests/correosVista.cjs && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/correos/contactos tests/correosVista.cjs
git commit -m "feat(correos): contactos, alta manual, bajas e importación de CSV con previa"
```

---

### Task 10: Flujo de n8n «Correos dodo-money»

**Files:**
- Create: `scripts/n8n/flujo-correos.mjs`, `docs/n8n/correos-dodo-money.json`, `tests/n8nCorreos.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `POST /api/correos/siguiente` → `[{envio_id, para, asunto, html, texto}]`; `POST /api/correos/resultado`.
- Produces: el JSON del flujo y un script que lo sube (crea inactivo o actualiza conservando credenciales).

- [ ] **Step 1: Prueba que falla** (`tests/n8nCorreos.test.mjs`)

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const wf=JSON.parse(readFileSync(new URL('../docs/n8n/correos-dodo-money.json',import.meta.url),'utf8')),txt=JSON.stringify(wf);
const N=Object.fromEntries(wf.nodes.map(n=>[n.name,n]));
test('n8n correos: cada minuto, lote 8, SMTP sin reintento, pausa 5 s y sin secretos',()=>{
 assert.equal(N['Cada minuto'].parameters.rule.interval[0].field,'minutes');
 assert.match(JSON.stringify(N['Pedir lote'].parameters),/\/api\/correos\/siguiente/);
 assert.match(JSON.stringify(N['Pedir lote'].parameters),/"lote":8|lote\\":8/);
 const smtp=N['Enviar correo'];
 assert.equal(smtp.type,'n8n-nodes-base.emailSend');assert.notEqual(smtp.retryOnFail,true);assert.equal(smtp.onError,'continueErrorOutput');
 assert.equal(smtp.parameters.fromEmail,'Dodo Pizza México <hola@dodopizza.mx>');
 assert.equal(N['Pausa'].parameters.amount,5);
 assert.match(JSON.stringify(N['Reportar'].parameters),/\/api\/correos\/resultado/);
 assert.doesNotMatch(txt,/x-api-key"\s*:\s*"[^"{=]/i,'la llave va en una credencial, no en el flujo');
 assert.equal(wf.settings.timezone,'America/Mexico_City');
});
```

Agrégala a `scripts.test`.

- [ ] **Step 2: Ver que falla**

Run: `node --test tests/n8nCorreos.test.mjs`
Expected: FAIL (`ENOENT`).

- [ ] **Step 3: Implementación**

`scripts/n8n/flujo-correos.mjs`:

```js
// Genera el flujo "Correos dodo-money" de n8n y lo sube (crea inactivo o actualiza).
//   node scripts/n8n/flujo-correos.mjs --archivo docs/n8n/correos-dodo-money.json   # solo escribe el JSON
//   node --env-file=scripts/n8n/.env scripts/n8n/flujo-correos.mjs                    # además lo sube a N8N_URL
// Cada minuto pide a la app hasta 8 correos ya armados, los manda uno por uno por SMTP (hola@dodopizza.mx) con 5 s
// entre cada uno y reporta el resultado. En n8n hay que elegir la credencial Header Auth (x-api-key = CORREOS_API_KEY)
// en "Pedir lote" y "Reportar", y la credencial SMTP "SMTP account" en "Enviar correo"; luego activarlo.
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const NOMBRE = "Correos dodo-money";
const APP = "https://dodo-money-j31t.vercel.app";
const SMTP = { id: "PIYhrRSVazBc0OGo", name: "SMTP account" }; // la de las campañas de apertura y Go Big
const http = (name, ruta, cuerpo, pos) => ({ id: randomUUID(), name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos,
  parameters: { method: "POST", url: APP + ruta, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendBody: true, specifyBody: "json", jsonBody: cuerpo, options: { timeout: 30000 } } });
const clasificar = `const ok = !$json.error && Array.isArray($json.accepted) && $json.accepted.map(String).map(x=>x.toLowerCase()).includes(String($('Uno por uno').item.json.para).toLowerCase());
const detalle = ok ? null : String($json.error?.message ?? $json.error ?? $json.response ?? 'Resultado incierto').slice(0, 1500);
return { json: { envio_id: $('Uno por uno').item.json.envio_id, aceptado: ok, message_id: $json.messageId ?? null, detalle } };`;
const flujo = {
  name: NOMBRE,
  nodes: [
    { id: randomUUID(), name: "Cada minuto", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 1 }] } } },
    http("Pedir lote", "/api/correos/siguiente", '={"lote":8}', [220, 0]),
    { id: randomUUID(), name: "Uno por uno", type: "n8n-nodes-base.splitInBatches", typeVersion: 3, position: [440, 0], parameters: { batchSize: 1, options: {} } },
    { id: randomUUID(), name: "Enviar correo", type: "n8n-nodes-base.emailSend", typeVersion: 2.1, position: [660, 0], onError: "continueErrorOutput", credentials: { smtp: SMTP },
      parameters: { fromEmail: "Dodo Pizza México <hola@dodopizza.mx>", toEmail: "={{ $json.para }}", subject: "={{ $json.asunto }}", emailFormat: "both", text: "={{ $json.texto }}", html: "={{ $json.html }}",
        options: { appendAttribution: false, replyTo: "hola@dodopizza.mx" } } },
    { id: randomUUID(), name: "Clasificar", type: "n8n-nodes-base.code", typeVersion: 2, position: [880, 0], parameters: { mode: "runOnceForEachItem", jsCode: clasificar } },
    http("Reportar", "/api/correos/resultado", "={{ JSON.stringify($json) }}", [1100, 0]),
    { id: randomUUID(), name: "Pausa", type: "n8n-nodes-base.wait", typeVersion: 1.1, position: [1320, 0], parameters: { resume: "timeInterval", amount: 5, unit: "seconds" } },
  ],
  connections: {
    "Cada minuto": { main: [[{ node: "Pedir lote", type: "main", index: 0 }]] },
    "Pedir lote": { main: [[{ node: "Uno por uno", type: "main", index: 0 }]] },
    "Uno por uno": { main: [[], [{ node: "Enviar correo", type: "main", index: 0 }]] },
    "Enviar correo": { main: [[{ node: "Clasificar", type: "main", index: 0 }], [{ node: "Clasificar", type: "main", index: 0 }]] },
    "Clasificar": { main: [[{ node: "Reportar", type: "main", index: 0 }]] },
    "Reportar": { main: [[{ node: "Pausa", type: "main", index: 0 }]] },
    "Pausa": { main: [[{ node: "Uno por uno", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1", timezone: "America/Mexico_City", saveDataSuccessExecution: "none", saveDataErrorExecution: "all" },
};

const i = process.argv.indexOf("--archivo");
if (i > 0) { writeFileSync(process.argv[i + 1], JSON.stringify(flujo, null, 2) + "\n"); console.log(`Escrito ${process.argv[i + 1]}`); process.exit(0); }
const url = (process.env.N8N_URL ?? "").replace(/\/+$/, ""), key = process.env.N8N_API_KEY;
if (!url || !key) { console.error("Configura N8N_URL y N8N_API_KEY en scripts/n8n/.env"); process.exit(1); }
const n8n = async (metodo, ruta, cuerpo) => {
  const r = await fetch(url + "/api/v1" + ruta, { method: metodo, headers: { "X-N8N-API-KEY": key, "content-type": "application/json" }, body: cuerpo && JSON.stringify(cuerpo) });
  const t = await r.text(); if (!r.ok) throw Error(`${metodo} ${ruta}: ${r.status} ${t.slice(0, 400)}`); return t ? JSON.parse(t) : null;
};
const existente = (await n8n("GET", "/workflows?limit=250")).data.find((w) => w.name === NOMBRE);
if (existente) {
  const actual = await n8n("GET", `/workflows/${existente.id}`);
  for (const n of flujo.nodes) { const previo = actual.nodes.find((x) => x.name === n.name && x.type === n.type); if (previo?.credentials) n.credentials = previo.credentials; }
  await n8n("PUT", `/workflows/${existente.id}`, flujo); console.log(`Actualizado ${NOMBRE} (${existente.id}).`);
} else { const w = await n8n("POST", "/workflows", flujo); console.log(`Creado ${NOMBRE} (${w.id}), inactivo.`); }
```

Genera el JSON:

Run: `node scripts/n8n/flujo-correos.mjs --archivo docs/n8n/correos-dodo-money.json`
Expected: `Escrito docs/n8n/correos-dodo-money.json`.

- [ ] **Step 4: Ver que pasa**

Run: `node --test tests/n8nCorreos.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/n8n/flujo-correos.mjs docs/n8n/correos-dodo-money.json tests/n8nCorreos.test.mjs package.json
git commit -m "feat(correos): flujo de n8n que manda los lotes por SMTP"
```

---

### Task 11: Verificación completa, entrega y spec

**Files:**
- Modify: `docs/superpowers/specs/2026-11-05-correos-marketing-design.md` (sección 8)
- Create: `docs/correos-marketing.md` (cómo se usa y cómo se instala)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Corrida completa local**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: todas las pruebas PASS, sin errores de tipos y build correcto.

- [ ] **Step 2: Actualizar el spec (sección 8)**

Reemplaza el texto de la sección 8 por:

```markdown
## 8. Datos iniciales

Los 249 contactos de la apertura se exportan de la tabla de n8n `Dodo_Apertura_2026_10_22` a CSV y se cargan con
**Importar CSV** de la propia sección, con la etiqueta `apertura-2026-10-22`. Así los correos de clientes no quedan en
el repositorio. Las campañas pasadas no se migran.
```

- [ ] **Step 3: Guía de instalación** (`docs/correos-marketing.md`)

```markdown
# Correos de marketing

## Instalación (una vez)
1. Sebastián corre `supabase/migrations/20261106120000_correos_marketing.sql` en producción y comparte el resultado.
2. Vercel: `CORREOS_API_KEY` (valor largo aleatorio) y, si se necesitan, `CORREOS_DOMINIOS_EXTRA` (p. ej. `instagram.com,wa.me`). Redeploy.
3. n8n: credencial *Header Auth* «dodo-money correos» con nombre `x-api-key` y el mismo valor.
   `node --env-file=scripts/n8n/.env scripts/n8n/flujo-correos.mjs`, elegir la credencial en «Pedir lote» y «Reportar», y activar.
4. Exportar los 249 contactos de la tabla de n8n `Dodo_Apertura_2026_10_22` (columna email) a CSV e importarlos en
   Correos → Contactos con la etiqueta `apertura-2026-10-22`.
5. Invitar a marketing con el puesto **Marketing**.
6. Apagar en n8n «Dodo Pizza · Go Big 30 oct · CAMPAÑA 249 · 12:00». No apagar «Imagen combos (sucursal)».

## Uso
Nueva campaña → subir HTML de Canva → Mandar prueba → elegir a quién y cuándo → Programar envío.
Las estadísticas se ven al abrir la campaña. Las aperturas son orientativas; los clics son confiables.

## Si algo falla
- «Esperando a n8n»: revisar que el flujo «Correos dodo-money» esté activo y que la llave coincida.
- Envíos «con problema»: el detalle trae la respuesta del servidor de correo; «Reintentar» solo los vuelve a la cola si el contacto sigue activo.
```

- [ ] **Step 4: Commit y PR**

```bash
git add docs/superpowers/specs/2026-11-05-correos-marketing-design.md docs/correos-marketing.md
git commit -m "docs(correos): guía de instalación y carga de contactos por CSV"
git push -u origin feat/correos-marketing
```

Abre el PR hacia `main` con `gh pr create` (descripción: resumen, migración a correr por Sebastián, variables nuevas, pasos de n8n). Revisa el diff completo y espera «Historial válido» y «Pruebas y tipos».

- [ ] **Step 5: Prueba extremo a extremo (después de que Sebastián corra la migración y con la vista previa de Vercel)**

1. Importar un CSV con `scervera@dodopizza.mx` y etiqueta `prueba-interna`.
2. Crear campaña con el HTML de Go Big, mandar prueba a `scervera@dodopizza.mx`: llega en < 1 min con `[PRUEBA]`.
3. Programar «Enviar ahora» a la etiqueta `prueba-interna`: la campaña pasa a Enviando y luego Enviada; 1 aceptado.
4. Abrir el correo y dar clic en «ORDENA AQUÍ»: la campaña muestra 1 apertura, 1 clic y el enlace con UTM.
5. Pulsar «date de baja aquí» y confirmar: el contacto queda «baja» y la campaña muestra 1 baja.
6. Programar otra campaña a la misma etiqueta: «No hay contactos activos para esta campaña».

Solo con los seis puntos bien se marca el PR listo para integrar.
```

---

## Self-Review

- **Cobertura del spec:** pantallas 3.1 (Task 7), 3.2 (Task 7), 3.3 (Task 8), 3.4 (Task 9); datos 4.1 (Task 1), 4.2–4.3 (Task 2); envío 5.1–5.3 (Tasks 2, 3, 5, 4), 5.4 (Task 10); seguimiento 6.1–6.3 (Tasks 3, 6); fallas 7 (Tasks 3, 7, 8); datos iniciales 8 (Task 11, cambio documentado); pruebas 9 (todas); entrega 10 (Task 11). Fuera de alcance 11: no se implementa.
- **Placeholders:** el bloque `<invitaciones>` de la Task 1 exige copiar funciones existentes con cambios exactos indicados; es el único paso que depende de leer código actual y dice qué leer y qué cambiar.
- **Consistencia de nombres:** `prepararCorreo`, `destinoClic`, `dominiosExtra`, `limpiarHtml`, `leerCsvContactos`, `estadisticas`, `csvDestinatarios`, `llaveValida`, `esRebote`, `slug`, `fechaHoraMX`; RPC `correo_*` con los mismos parámetros en SQL, pruebas y rutas.
- **Review Focus:** (1) Task 4 `preparar.test.ts` (comillas simples y `&amp;`); (2) Task 3 reserva con `skip locked` y prueba de lotes sin repetir; (3) Task 3 «baja entre armado y envío» y `reintentar` solo activos; (4) Task 4 `csv.test.ts` (BOM, `;`, mayúsculas, espacios); (5) Task 2 «programar valida fecha, lista y estados».

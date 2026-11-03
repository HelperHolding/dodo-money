# Ajustes del P&L con nota — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin captura ajustes con nota (tope % de venta neta o monto) por sucursal, mes y renglón de gasto; el P&L muestra Real · Ajuste · Ajustado sin tocar el real, el PDF se imprime con las columnas elegidas y el Excel trae ambas.

**Architecture:** Tabla `pl_ajustes` con dos RPC de admin. Una función pura (`lib/finanzas/ajustes.ts`) convierte los ajustes vigentes de una sucursal en *deltas* por renglón y una lista explicada; la carga (`app/finanzas/datos.ts`) aplica los deltas a una copia de la entrada y vuelve a correr `calcularPL`, así los totales, % y metas del ajustado salen del mismo cálculo que el real. El consolidado suma los deltas de cada sucursal.

**Tech Stack:** Next.js App Router (server components, server actions), Supabase (Postgres, RLS, RPC `security definer`), PGlite para probar SQL, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-02-pl-ajustes-design.md`

## Global Constraints

- Flujo de `AGENTS.md`: rama `feat/pl-ajustes` → PR a `main`; nada directo a `main`; sin commits vacíos; sin `--no-verify`.
- La migración y su prueba se entregan a Sebastián; el formulario de captura no se publica (merge) hasta que él reporte `PRUEBAS OK` en producción.
- Renglones ajustables (mismo `check` que `pl_metas`): `alimento, merma, nomina_cocina, nomina_gerencia, repartidores, agregadores, marketing_agregadores, marketing, renta, servicios, mantenimiento, consumibles_equipo, regalias, otros, oficina`.
- `tipo`: `tope_pct` (fracción 0 < v ≤ 1; 5 % = 0.05) | `monto` (pesos con signo, ≠ 0, dos decimales).
- `nota` 10–500 caracteres; `motivo_anulacion` 5–500; nunca se borra; a lo más un ajuste activo por (sucursal, mes, renglón).
- El real no cambia. En pantalla, Meta y Diferencia comparan contra el real; "De dónde sale", "Por cuentas" y "Comparativo" son siempre reales.
- Captura solo con sucursal elegida, vista de mes y rol admin.
- Módulos de `lib/` importan otros módulos de `lib/` solo con `import type` (las pruebas los cargan con node directo). Las pruebas importan con extensión `.ts`.
- PDF: una sola letra y un solo tamaño (PR #104). El formato de asesores no tiene PDF hoy: en asesores, los ajustes van en pantalla y Excel.
- Textos de la interfaz en español; código con el estilo del archivo que se toca.

## Review Focus

1. **Semana que cruza dos meses**: un monto se prorratea por los días de su mes que entran; si los dos meses tienen tope en el mismo renglón vale el del mes con más días (empate: el posterior). → prueba en Task 2.
2. **Periodo sin venta neta (0)** con un tope: el gasto no se borra; el ajuste se lista "sin efecto". → prueba en Task 2.
3. **Doble envío del formulario** (misma solicitud): devuelve el mismo id, no duplica; con otros datos se rechaza. → prueba SQL en Task 1.
4. **Consolidado con ajuste de Oficina central en una sucursal**: el consolidado lleva el delta en `oficina` y el EBITDA ajustado = EBITDA real + suma de ajustes. → prueba en Task 2.
5. **Ruta de regreso manipulada** en el formulario (`volver=https://…` o `//otro`): se regresa a `/finanzas`. → prueba de `rutaVolver` en Task 2.

---

### Task 1: Migración `pl_ajustes`, prueba SQL y arnés PGlite

**Files:**
- Create: `supabase/migrations/20261102200000_pl_ajustes.sql`
- Create: `supabase/pruebas/20261102200000_pl_ajustes.sql`
- Create: `tests/plAjustes.test.mjs`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: tabla `public.pl_ajustes(id, sucursal_id, mes, renglon, tipo, valor, nota, creado_por, creado_en, anulado_por, anulado_en, motivo_anulacion)`; RPC `guardar_ajuste_pl(p_solicitud uuid, p_sucursal uuid, p_mes date, p_renglon text, p_tipo text, p_valor numeric, p_nota text) returns uuid`; RPC `anular_ajuste_pl(p_id uuid, p_motivo text) returns void`. Mensajes de error que las pruebas y la interfaz esperan: `Solo administración…`, `Escribe la nota…`, `El tope…`, `El monto…`, `El mes…`, `Renglón…`, `La solicitud ya se utilizó…`, `Ya hay un ajuste vigente…`, `Escribe el motivo…`, `El ajuste no existe o ya está anulado.`

- [ ] **Step 1: Escribir la prueba SQL reversible**

`supabase/pruebas/20261102200000_pl_ajustes.sql`:

```sql
-- Ejecutar completo después de 20261102200000_pl_ajustes.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Usa un admin activo y una sucursal; captura en enero 2099 para no tocar meses reales.
do $$
declare a uuid; s uuid; k uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid(); ok boolean; x public.pl_ajustes; m date:=date '2099-01-01';
begin
 select p.id into a from public.perfiles p where p.activo and p.rol::text='admin' and not p.debe_cambiar_contrasena limit 1;
 select id into s from public.sucursales order by nombre limit 1;
 if a is null or s is null then raise exception 'FALTAN DATOS: un admin activo y una sucursal.';end if;

 -- 1. Sin sesión de admin: rechazado.
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','tope_pct',0.05,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'Solo administración%'; end;
 if not ok then raise exception 'FALLÓ: capturó sin ser admin';end if;
 ok:=false; begin perform public.anular_ajuste_pl(gen_random_uuid(),'motivo de prueba'); exception when others then ok:=sqlerrm like 'Solo administración%'; end;
 if not ok then raise exception 'FALLÓ: anuló sin ser admin';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

 -- 2. Validaciones.
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','tope_pct',0.05,'corta'); exception when others then ok:=sqlerrm like 'Escribe la nota%'; end;
 if not ok then raise exception 'FALLÓ: nota corta';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','tope_pct',1.5,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'El tope%'; end;
 if not ok then raise exception 'FALLÓ: tope mayor a 100 %%';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','monto',0,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'El monto%'; end;
 if not ok then raise exception 'FALLÓ: monto cero';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','monto',10.555,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'El monto%'; end;
 if not ok then raise exception 'FALLÓ: monto con tres decimales';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,date '2099-01-15','marketing','tope_pct',0.05,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'El mes%'; end;
 if not ok then raise exception 'FALLÓ: mes que no es día 1';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'venta_neta','monto',-10,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'Renglón%'; end;
 if not ok then raise exception 'FALLÓ: renglón que no es gasto';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','otro',1,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'Tipo%'; end;
 if not ok then raise exception 'FALLÓ: tipo inválido';end if;

 -- 3. Captura e idempotencia.
 if public.guardar_ajuste_pl(k,s,m,'marketing','tope_pct',0.05,'  Inauguración: solo el 5  ')<>k then raise exception 'FALLÓ: no devolvió la solicitud';end if;
 select * into x from public.pl_ajustes where id=k;
 if x.creado_por<>a or x.nota<>'Inauguración: solo el 5' or x.valor<>0.05 or x.anulado_en is not null then raise exception 'FALLÓ: datos guardados';end if;
 if public.guardar_ajuste_pl(k,s,m,'marketing','tope_pct',0.05,'Inauguración: solo el 5')<>k then raise exception 'FALLÓ: idempotencia';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(k,s,m,'marketing','tope_pct',0.06,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'La solicitud ya se utilizó%'; end;
 if not ok then raise exception 'FALLÓ: solicitud reutilizada con otros datos';end if;

 -- 4. Uno vigente por sucursal, mes y renglón.
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','monto',-1000,'Otro ajuste del mismo renglón'); exception when others then ok:=sqlerrm like 'Ya hay un ajuste vigente%'; end;
 if not ok then raise exception 'FALLÓ: dos ajustes vigentes en el mismo renglón';end if;

 -- 5. Anular con motivo; el anulado se conserva y se puede capturar otro.
 ok:=false; begin perform public.anular_ajuste_pl(k,'no'); exception when others then ok:=sqlerrm like 'Escribe el motivo%'; end;
 if not ok then raise exception 'FALLÓ: motivo corto';end if;
 perform public.anular_ajuste_pl(k,'Se cambia a monto fijo');
 ok:=false; begin perform public.anular_ajuste_pl(k,'Otra vez'); exception when others then ok:=sqlerrm like 'El ajuste no existe o ya está anulado%'; end;
 if not ok then raise exception 'FALLÓ: anuló dos veces';end if;
 if public.guardar_ajuste_pl(k2,s,m,'marketing','monto',-16000,'Inauguración: monto fijo')<>k2 then raise exception 'FALLÓ: captura después de anular';end if;
 if (select count(*) from public.pl_ajustes where sucursal_id=s and mes=m and renglon='marketing')<>2 then raise exception 'FALLÓ: el anulado no se conservó';end if;
 if (select motivo_anulacion from public.pl_ajustes where id=k)<>'Se cambia a monto fijo' then raise exception 'FALLÓ: motivo de anulación';end if;

 -- 6. Sin escritura directa para la app.
 if has_table_privilege('authenticated','public.pl_ajustes','insert') or has_table_privilege('authenticated','public.pl_ajustes','update')
  or has_table_privilege('authenticated','public.pl_ajustes','delete') then raise exception 'FALLÓ: escritura directa permitida';end if;

 raise exception 'PRUEBAS OK';
end $$;
```

- [ ] **Step 2: Escribir el arnés PGlite**

`tests/plAjustes.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261102200000_pl_ajustes.sql');
const pruebas=load('supabase/pruebas/20261102200000_pl_ajustes.sql');

// Lo mínimo de Supabase y de 0025 (ve_finanzas, edita_finanzas) que usa la migración; los CHECK y enums copian los reales.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum('cajero','encargado','gerente','admin','corporativo');
 create table perfiles(id uuid primary key,activo boolean not null default true,rol rol_usuario,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles(id,rol) values('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000c1','corporativo');
 create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function ve_finanzas() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text in ('admin','corporativo'),false)$$;
 create function edita_finanzas() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text='admin',false)$$;
 create table sucursales(id uuid primary key,nombre text);insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Centro');`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;};
const como=(db,sub)=>db.query(`select set_config('request.jwt.claims','{"sub":"${sub}","role":"authenticated"}',false)`);
const SUC='00000000-0000-0000-0000-0000000000e1';

test('ajustes del P&L: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('ajustes del P&L: solo lectura para la app y RPC solo para autenticados',async()=>{
 const db=await nueva();
 try{
  for(const p of ['insert','update','delete'])
   assert.equal((await db.query(`select has_table_privilege('authenticated','pl_ajustes','${p}') ok`)).rows[0].ok,false,p);
  assert.equal((await db.query(`select has_table_privilege('authenticated','pl_ajustes','select') ok`)).rows[0].ok,true);
  for(const f of ['guardar_ajuste_pl(uuid,uuid,date,text,text,numeric,text)','anular_ajuste_pl(uuid,text)']){
   assert.equal((await db.query(`select has_function_privilege('anon','${f}','execute') ok`)).rows[0].ok,false,f);
   assert.equal((await db.query(`select has_function_privilege('authenticated','${f}','execute') ok`)).rows[0].ok,true,f);
  }
 }finally{await db.close();}
});

test('ajustes del P&L: corporativo lee pero no captura ni anula',async()=>{
 const db=await nueva();
 try{
  await como(db,'00000000-0000-0000-0000-0000000000a1');
  const id=(await db.query("select public.guardar_ajuste_pl(gen_random_uuid(),$1::uuid,date '2026-10-01','marketing','tope_pct',0.05,'Inauguración: solo el 5') id",[SUC])).rows[0].id;
  await como(db,'00000000-0000-0000-0000-0000000000c1');
  await assert.rejects(db.query("select public.guardar_ajuste_pl(gen_random_uuid(),$1::uuid,date '2026-10-01','renta','monto',-10,'Nota de corporativo')",[SUC]),/Solo administración/);
  await assert.rejects(db.query("select public.anular_ajuste_pl($1::uuid,'motivo de prueba')",[id]),/Solo administración/);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int n from public.pl_ajustes')).rows[0].n,1);
 }finally{await db.close();}
});

test('ajustes del P&L: el mes empieza en octubre 2026',async()=>{
 const db=await nueva();
 try{
  await como(db,'00000000-0000-0000-0000-0000000000a1');
  await assert.rejects(db.query("select public.guardar_ajuste_pl(gen_random_uuid(),$1::uuid,date '2026-09-01','marketing','tope_pct',0.05,'Inauguración: solo el 5')",[SUC]),/El mes/);
 }finally{await db.close();}
});
```

- [ ] **Step 3: Agregar la prueba al script `test` y verla fallar**

```bash
node -e "const f='package.json',p=require('./'+f);p.scripts.test=p.scripts.test.replace('--test ','--test tests/plAjustes.test.mjs ');require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
node --test tests/plAjustes.test.mjs
```

Expected: FAIL con `ENOENT … 20261102200000_pl_ajustes.sql`.

- [ ] **Step 4: Escribir la migración**

`supabase/migrations/20261102200000_pl_ajustes.sql`:

```sql
-- Ajustes del P&L con nota: una capa sobre el real (tope % de la venta neta o monto en pesos) por sucursal, mes y renglón de gasto.
-- El real no cambia. Admin captura y anula por RPC; admin y corporativo leen. Nunca se borra. Requiere 0025 (ve_finanzas, edita_finanzas).
create table public.pl_ajustes (
  id uuid primary key,
  sucursal_id uuid not null references public.sucursales(id),
  mes date not null check (extract(day from mes) = 1 and mes >= date '2026-10-01'),
  renglon text not null check (renglon in ('alimento', 'merma', 'nomina_cocina', 'nomina_gerencia', 'repartidores', 'agregadores',
    'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'regalias', 'otros', 'oficina')),
  tipo text not null check (tipo in ('tope_pct', 'monto')),
  valor numeric(14,4) not null check ((tipo = 'tope_pct' and valor > 0 and valor <= 1)
    or (tipo = 'monto' and valor <> 0 and valor = round(valor, 2) and abs(valor) < 100000000)),
  nota text not null check (nota = trim(nota) and length(nota) between 10 and 500),
  creado_por uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now(),
  anulado_por uuid references public.perfiles(id),
  anulado_en timestamptz,
  motivo_anulacion text check (motivo_anulacion is null or length(trim(motivo_anulacion)) between 5 and 500),
  check ((anulado_en is null) = (anulado_por is null) and (anulado_en is null) = (motivo_anulacion is null))
);
create unique index pl_ajustes_un_vigente on public.pl_ajustes (sucursal_id, mes, renglon) where anulado_en is null;

alter table public.pl_ajustes enable row level security;
create policy ver_pl_ajustes on public.pl_ajustes for select using (public.ve_finanzas());
revoke all on public.pl_ajustes from public, anon, authenticated;
grant select on public.pl_ajustes to authenticated;

create function public.guardar_ajuste_pl(p_solicitud uuid, p_sucursal uuid, p_mes date, p_renglon text, p_tipo text, p_valor numeric, p_nota text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare x public.pl_ajustes; v_nota text := trim(p_nota);
begin
  if not coalesce(public.edita_finanzas(), false) then raise exception 'Solo administración captura ajustes del P&L.'; end if;
  if p_solicitud is null then raise exception 'Falta el id de la solicitud.'; end if;
  select * into x from public.pl_ajustes where id = p_solicitud;
  if found then
    if x.sucursal_id = p_sucursal and x.mes = p_mes and x.renglon = p_renglon and x.tipo = p_tipo and x.valor = p_valor and x.nota = v_nota
      then return x.id; end if;
    raise exception 'La solicitud ya se utilizó con otros datos.';
  end if;
  if v_nota is null or length(v_nota) not between 10 and 500 then raise exception 'Escribe la nota del ajuste (10 a 500 caracteres).'; end if;
  if p_tipo is null or p_tipo not in ('tope_pct', 'monto') then raise exception 'Tipo de ajuste inválido.'; end if;
  if p_tipo = 'tope_pct' and (p_valor is null or p_valor <= 0 or p_valor > 1) then raise exception 'El tope debe ser mayor a 0 %% y hasta 100 %%.'; end if;
  if p_tipo = 'monto' and (p_valor is null or p_valor = 0 or p_valor <> round(p_valor, 2) or abs(p_valor) >= 100000000)
    then raise exception 'El monto debe ser distinto de cero, con hasta dos decimales.'; end if;
  if p_mes is null or extract(day from p_mes) <> 1 or p_mes < date '2026-10-01' then raise exception 'El mes debe ser el día 1, desde octubre 2026.'; end if;
  if p_renglon is null or p_renglon not in ('alimento', 'merma', 'nomina_cocina', 'nomina_gerencia', 'repartidores', 'agregadores',
    'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'regalias', 'otros', 'oficina')
    then raise exception 'Renglón inválido: solo renglones de gasto.'; end if;
  if not exists (select 1 from public.sucursales where id = p_sucursal) then raise exception 'Sucursal inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_sucursal::text || '|' || p_mes::text || '|' || p_renglon, 0));
  if exists (select 1 from public.pl_ajustes where sucursal_id = p_sucursal and mes = p_mes and renglon = p_renglon and anulado_en is null)
    then raise exception 'Ya hay un ajuste vigente en ese renglón y mes; anúlalo para capturar otro.'; end if;
  insert into public.pl_ajustes (id, sucursal_id, mes, renglon, tipo, valor, nota, creado_por)
  values (p_solicitud, p_sucursal, p_mes, p_renglon, p_tipo, p_valor, v_nota, auth.uid());
  return p_solicitud;
end $$;

create function public.anular_ajuste_pl(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.edita_finanzas(), false) then raise exception 'Solo administración anula ajustes del P&L.'; end if;
  if p_motivo is null or length(trim(p_motivo)) not between 5 and 500 then raise exception 'Escribe el motivo (5 a 500 caracteres).'; end if;
  update public.pl_ajustes set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo)
  where id = p_id and anulado_en is null;
  if not found then raise exception 'El ajuste no existe o ya está anulado.'; end if;
end $$;

revoke all on function public.guardar_ajuste_pl(uuid, uuid, date, text, text, numeric, text), public.anular_ajuste_pl(uuid, text) from public, anon;
grant execute on function public.guardar_ajuste_pl(uuid, uuid, date, text, text, numeric, text), public.anular_ajuste_pl(uuid, text) to authenticated;
```

- [ ] **Step 5: Correr las pruebas**

Run: `node --test tests/plAjustes.test.mjs`
Expected: 4 pruebas PASS. Si una falla por un mensaje, corrige la migración (no la prueba) salvo que el mensaje de la prueba contradiga la lista de Interfaces.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261102200000_pl_ajustes.sql supabase/pruebas/20261102200000_pl_ajustes.sql tests/plAjustes.test.mjs package.json
git commit -m "feat(pl): tabla pl_ajustes con RPC de captura y anulación"
```

---

### Task 2: Cálculo puro de ajustes

**Files:**
- Create: `lib/finanzas/ajustes.ts`
- Create: `lib/finanzas/ajustes.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `FilaPL`, `EntradaPL`, `calcularPL`, `sumarEntradas`, `entradaVacia` de `lib/finanzas/pl.ts`; `MesDelRango` de `lib/finanzas/periodo.ts` (`{ mes: "2026-10"; dias; diasMes; fraccion; fin }`).
- Produces:
  - `RENGLONES_AJUSTABLES` (readonly tuple), `type RenglonAjustable`, `type TipoAjuste = "tope_pct" | "monto"`
  - `type AjusteVigente = { id: string; sucursalId: string; mes: string /* "2026-10-01" */; renglon: RenglonAjustable; tipo: TipoAjuste; valor: number; nota: string }`
  - `type AjusteAplicado = AjusteVigente & { nombre: string; real: number; ajuste: number; ajustado: number; regla: string; sinEfecto: boolean }`
  - `type AjustePL = AjusteAplicado & { sucursal: string }`
  - `type Deltas = Partial<Record<RenglonAjustable, number>>`
  - `esAjustable(clave: string): clave is RenglonAjustable`
  - `aplicarAjustes(filas: readonly FilaPL[], entrada: EntradaPL, ajustes: readonly AjusteVigente[], meses: readonly MesDelRango[]): { deltas: Deltas; lista: AjusteAplicado[] }`
  - `conDeltas(e: EntradaPL, d: Deltas): EntradaPL`
  - `sumarDeltas(ds: readonly Deltas[]): Deltas`
  - `lineaAjuste(a: AjustePL, conSucursal: boolean): string`
  - `rutaVolver(valor: unknown): string`

- [ ] **Step 1: Escribir las pruebas**

`lib/finanzas/ajustes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarAjustes, conDeltas, lineaAjuste, RENGLONES_AJUSTABLES, rutaVolver, sumarDeltas, type AjusteVigente } from "./ajustes.ts";
import { calcularPL, entradaVacia, sumarEntradas, type EntradaPL } from "./pl.ts";

const ctx = (v: number) => ({ ventaNeta: v, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
const OCT = [{ mes: "2026-10", dias: 31, diasMes: 31, fraccion: 1, fin: "2026-10-31" }];
const aj = (x: Partial<AjusteVigente>): AjusteVigente =>
  ({ id: "a1", sucursalId: "s1", mes: "2026-10-01", renglon: "marketing", tipo: "tope_pct", valor: 0.05, nota: "Inauguración: solo el 5 %", ...x });
const filasDe = (e: EntradaPL) => calcularPL(e, [], ctx(e.ventaNeta));
const monto = (e: EntradaPL, clave: string) => filasDe(e).find((f) => f.clave === clave)!.monto;
const E: EntradaPL = { ...entradaVacia(), ventaNeta: 356560.09, gastos: { marketing: 34067.74, renta: 90000 } };

test("tope 5 % de marketing: el ejemplo de la inauguración", () => {
  const r = aplicarAjustes(filasDe(E), E, [aj({})], OCT);
  assert.deepEqual(r.deltas, { marketing: -16239.74 });
  assert.equal(r.lista.length, 1);
  const [a] = r.lista;
  assert.equal(a.nombre, "Marketing");
  assert.equal(a.real, 34067.74);
  assert.equal(a.ajustado, 17828);
  assert.equal(a.ajuste, -16239.74);
  assert.equal(a.sinEfecto, false);
  assert.equal(a.regla, "Tope 5 % de la venta neta = $17,828.00");
});

test("tope sin efecto: el real ya es menor al tope", () => {
  const e = { ...E, gastos: { marketing: 10000 } };
  const r = aplicarAjustes(filasDe(e), e, [aj({})], OCT);
  assert.deepEqual(r.deltas, {});
  assert.equal(r.lista[0].ajuste, 0);
  assert.equal(r.lista[0].ajustado, 10000);
  assert.equal(r.lista[0].sinEfecto, true);
});

test("monto negativo: limpia renta triplicada", () => {
  const r = aplicarAjustes(filasDe(E), E, [aj({ renglon: "renta", tipo: "monto", valor: -60000 })], OCT);
  assert.deepEqual(r.deltas, { renta: -60000 });
  assert.equal(r.lista[0].ajustado, 30000);
  assert.equal(r.lista[0].regla, "Monto -$60,000.00");
});

test("semana que cruza meses: montos proporcionales y vale el tope del mes con más días", () => {
  const meses = [
    { mes: "2026-10", dias: 3, diasMes: 31, fraccion: 3 / 31, fin: "2026-10-31" },
    { mes: "2026-11", dias: 4, diasMes: 30, fraccion: 4 / 30, fin: "2026-11-30" },
  ];
  const e = { ...entradaVacia(), ventaNeta: 100000, gastos: { renta: 50000, marketing: 20000 } };
  const r = aplicarAjustes(filasDe(e), e, [
    aj({ id: "r1", renglon: "renta", tipo: "monto", valor: -31000 }),
    aj({ id: "r2", renglon: "renta", tipo: "monto", valor: -30000, mes: "2026-11-01" }),
    aj({ id: "m1", valor: 0.02 }),
    aj({ id: "m2", valor: 0.1, mes: "2026-11-01" }),
    aj({ id: "fuera", renglon: "servicios", tipo: "monto", valor: -5000, mes: "2026-12-01" }),
  ], meses);
  assert.deepEqual(r.deltas, { renta: -7000, marketing: -10000 });
  assert.equal(r.lista.find((a) => a.id === "r1")!.regla, "Monto -$31,000.00 × 3/31");
  assert.equal(r.lista.find((a) => a.id === "m1")!.sinEfecto, true);
  assert.equal(r.lista.find((a) => a.id === "m2")!.ajustado, 10000);
  assert.equal(r.lista.some((a) => a.id === "fuera"), false);
});

test("sin venta neta, el tope no borra el gasto", () => {
  const e = { ...entradaVacia(), ventaNeta: 0, gastos: { marketing: 5000 } };
  const r = aplicarAjustes(filasDe(e), e, [aj({})], OCT);
  assert.deepEqual(r.deltas, {});
  assert.equal(r.lista[0].sinEfecto, true);
  assert.match(r.lista[0].regla, /sin venta neta/);
});

test("varios ajustes en una sucursal: totales iguales a recalcular con los montos ajustados", () => {
  const r = aplicarAjustes(filasDe(E), E, [aj({}), aj({ id: "a2", renglon: "renta", tipo: "monto", valor: -60000 })], OCT);
  const ajustada = filasDe(conDeltas(E, r.deltas));
  const manual = filasDe({ ...E, gastos: { marketing: 17828, renta: 30000 } });
  for (const clave of ["margen_bruto", "ebitda_tienda", "ebitda"]) {
    assert.equal(ajustada.find((f) => f.clave === clave)!.monto, manual.find((f) => f.clave === clave)!.monto, clave);
  }
  assert.equal(monto(conDeltas(E, r.deltas), "ebitda"), Math.round((monto(E, "ebitda")! + 16239.74 + 60000) * 100) / 100);
  assert.deepEqual(r.lista.map((a) => a.renglon), ["marketing", "renta"]);
});

test("cada renglón ajustable mueve solo su renglón; merma pendiente cuenta como cero", () => {
  const e = { ...entradaVacia(), ventaNeta: 1000 };
  const base = filasDe(e);
  for (const r of RENGLONES_AJUSTABLES) {
    const filas = filasDe(conDeltas(e, { [r]: 1 }));
    for (const f of filas) {
      if (f.tipo === "total" || f.tipo === "detalle") continue;
      const antes = base.find((x) => x.clave === f.clave)!.monto ?? 0;
      assert.equal((f.monto ?? 0) - antes, f.clave === r ? 1 : 0, `${r} → ${f.clave}`);
    }
    assert.equal(filas.find((f) => f.clave === "ebitda")!.monto, -1, r);
  }
  assert.equal(conDeltas({ ...e, merma: null }, { merma: -5 }).merma, -5);
  assert.equal(conDeltas({ ...e, merma: null }, {}).merma, null);
});

test("consolidado: suma los deltas de cada sucursal, incluida oficina", () => {
  const a = { ...entradaVacia(), ventaNeta: 100000, gastos: { marketing: 9000 }, oficina: 5000 };
  const b = { ...entradaVacia(), ventaNeta: 200000, gastos: { marketing: 4000 }, oficina: 10000 };
  const ra = aplicarAjustes(filasDe(a), a, [aj({}), aj({ id: "o", renglon: "oficina", tipo: "monto", valor: -2000 })], OCT);
  const rb = aplicarAjustes(filasDe(b), b, [aj({ sucursalId: "s2" })], OCT);
  const total = sumarDeltas([ra.deltas, rb.deltas]);
  assert.deepEqual(total, { marketing: -4000, oficina: -2000 });
  const consolidado = sumarEntradas([a, b]);
  assert.equal(monto(conDeltas(consolidado, total), "ebitda"), Math.round((monto(consolidado, "ebitda")! + 6000) * 100) / 100);
  assert.equal(monto(conDeltas(consolidado, total), "oficina"), 13000);
});

test("lineaAjuste: una línea con sucursal, regla, real, ajustado y nota", () => {
  const [a] = aplicarAjustes(filasDe(E), E, [aj({})], OCT).lista;
  assert.equal(lineaAjuste({ ...a, sucursal: "Dodo Centro" }, true),
    "Dodo Centro · Marketing · Tope 5 % de la venta neta = $17,828.00 · real $34,067.74 → ajustado $17,828.00 (-$16,239.74) · Inauguración: solo el 5 %");
  assert.equal(lineaAjuste({ ...a, sucursal: "Dodo Centro" }, false).startsWith("Marketing · "), true);
});

test("rutaVolver: solo regresa a /finanzas", () => {
  assert.equal(rutaVolver("/finanzas?mes=2026-10&sucursal=x&vista=meta"), "/finanzas?mes=2026-10&sucursal=x&vista=meta");
  assert.equal(rutaVolver("https://otro.com/finanzas?x"), "/finanzas");
  assert.equal(rutaVolver("//otro.com/finanzas?x"), "/finanzas");
  assert.equal(rutaVolver("/finanzas/../otro?x"), "/finanzas");
  assert.equal(rutaVolver(null), "/finanzas");
});
```

- [ ] **Step 2: Agregar al script `test` y verlas fallar**

```bash
node -e "const f='package.json',p=require('./'+f);p.scripts.test=p.scripts.test.replace('--test ','--test lib/finanzas/ajustes.test.ts ');require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
node --experimental-strip-types --test lib/finanzas/ajustes.test.ts
```

Expected: FAIL con `Cannot find module …/ajustes.ts`.

- [ ] **Step 3: Implementar**

`lib/finanzas/ajustes.ts`:

```ts
/** Ajustes del P&L con nota: una capa sobre el real. Aquí solo se calcula cuánto mueve cada ajuste; el real no cambia. */
import type { CuentaGasto } from "./cuentas";
import type { MesDelRango } from "./periodo";
import type { EntradaPL, FilaPL } from "./pl";

export const RENGLONES_AJUSTABLES = [
  "alimento", "merma", "nomina_cocina", "nomina_gerencia", "repartidores", "agregadores", "marketing_agregadores", "marketing",
  "renta", "servicios", "mantenimiento", "consumibles_equipo", "regalias", "otros", "oficina",
] as const;
export type RenglonAjustable = (typeof RENGLONES_AJUSTABLES)[number];
export type TipoAjuste = "tope_pct" | "monto";
/** Un ajuste sin anular de `pl_ajustes`; `mes` es el día 1 ("2026-10-01") y el tope es una fracción (5 % = 0.05). */
export type AjusteVigente = { id: string; sucursalId: string; mes: string; renglon: RenglonAjustable; tipo: TipoAjuste; valor: number; nota: string };
/** Lo que movió el ajuste en el periodo: `real` es el renglón antes del ajuste y `ajuste` = `ajustado` − `real`. */
export type AjusteAplicado = AjusteVigente & { nombre: string; real: number; ajuste: number; ajustado: number; regla: string; sinEfecto: boolean };
export type AjustePL = AjusteAplicado & { sucursal: string };
export type Deltas = Partial<Record<RenglonAjustable, number>>;

const centavos = (n: number) => Math.round(n * 100) / 100;
const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const pctTexto = (v: number) => `${(v * 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`;
/** Renglones que salen de `entrada.gastos`; los demás tienen su propio campo en la entrada. */
const DE_GASTOS: readonly RenglonAjustable[] = ["repartidores", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "otros"];

export const esAjustable = (clave: string): clave is RenglonAjustable => (RENGLONES_AJUSTABLES as readonly string[]).includes(clave);

/**
 * Deltas por renglón y la lista explicada de una sucursal en un periodo. Primero los montos, proporcionales a los días de su mes
 * que entran; luego el tope sobre lo que queda. En una semana que cruza meses vale el tope del mes con más días en ella (empate: el posterior).
 */
export function aplicarAjustes(filas: readonly FilaPL[], entrada: EntradaPL, ajustes: readonly AjusteVigente[], meses: readonly MesDelRango[]) {
  const fila = new Map(filas.map((f) => [f.clave as string, f]));
  const mesDe = new Map(meses.map((m) => [`${m.mes}-01`, m]));
  const delPeriodo = ajustes.filter((a) => mesDe.has(a.mes));
  const deltas: Deltas = {};
  const lista: AjusteAplicado[] = [];
  const actual = (r: RenglonAjustable) => centavos((fila.get(r)?.monto ?? 0) + (deltas[r] ?? 0));
  const anotar = (a: AjusteVigente, real: number, ajustado: number, regla: string) => {
    const ajuste = centavos(ajustado - real);
    if (ajuste) deltas[a.renglon] = centavos((deltas[a.renglon] ?? 0) + ajuste);
    lista.push({ ...a, nombre: fila.get(a.renglon)?.nombre ?? a.renglon, real, ajuste, ajustado: centavos(ajustado), regla, sinEfecto: ajuste === 0 });
  };

  for (const a of delPeriodo) if (a.tipo === "monto") {
    const m = mesDe.get(a.mes)!;
    const real = actual(a.renglon);
    anotar(a, real, real + a.valor * m.fraccion, `Monto ${mxn.format(a.valor)}${m.fraccion < 1 ? ` × ${m.dias}/${m.diasMes}` : ""}`);
  }
  const dias = (a: AjusteVigente) => mesDe.get(a.mes)!.dias;
  const tope = new Map<RenglonAjustable, AjusteVigente>();
  for (const a of delPeriodo) if (a.tipo === "tope_pct") {
    const otro = tope.get(a.renglon);
    if (!otro || dias(a) > dias(otro) || (dias(a) === dias(otro) && a.mes > otro.mes)) tope.set(a.renglon, a);
  }
  for (const a of delPeriodo) if (a.tipo === "tope_pct") {
    const real = actual(a.renglon);
    if (tope.get(a.renglon) !== a) anotar(a, real, real, `Tope ${pctTexto(a.valor)}: en este periodo vale el tope de ${tope.get(a.renglon)!.mes.slice(0, 7)}`);
    else if (entrada.ventaNeta <= 0) anotar(a, real, real, `Tope ${pctTexto(a.valor)} de la venta neta: sin venta neta en el periodo`);
    else {
      const limite = centavos(a.valor * entrada.ventaNeta);
      anotar(a, real, Math.min(real, limite), `Tope ${pctTexto(a.valor)} de la venta neta = ${mxn.format(limite)}`);
    }
  }
  const orden = (r: RenglonAjustable) => RENGLONES_AJUSTABLES.indexOf(r);
  lista.sort((x, y) => orden(x.renglon) - orden(y.renglon) || x.mes.localeCompare(y.mes));
  return { deltas, lista };
}

/** La entrada con los deltas sumados a los campos que alimentan cada renglón; `calcularPL` sobre ella da el P&L ajustado. */
export function conDeltas(e: EntradaPL, d: Deltas): EntradaPL {
  const mas = (n: number, r: RenglonAjustable) => (d[r] ? centavos(n + d[r]!) : n);
  const gastos = { ...e.gastos };
  for (const r of DE_GASTOS) if (d[r]) gastos[r as CuentaGasto] = centavos((gastos[r as CuentaGasto] ?? 0) + d[r]!);
  return {
    ...e, gastos,
    alimento: mas(e.alimento, "alimento"),
    merma: d.merma ? centavos((e.merma ?? 0) + d.merma) : e.merma,
    nomina: { cocina: mas(e.nomina.cocina, "nomina_cocina"), gerencia: mas(e.nomina.gerencia, "nomina_gerencia") },
    agregadores: mas(e.agregadores, "agregadores"), regalias: mas(e.regalias, "regalias"), oficina: mas(e.oficina, "oficina"),
  };
}

export function sumarDeltas(ds: readonly Deltas[]): Deltas {
  const t: Deltas = {};
  for (const d of ds) for (const [r, v] of Object.entries(d) as [RenglonAjustable, number][]) t[r] = centavos((t[r] ?? 0) + v);
  return t;
}

/** Un ajuste en una línea (pie del PDF). */
export const lineaAjuste = (a: AjustePL, conSucursal: boolean) =>
  `${conSucursal ? `${a.sucursal} · ` : ""}${a.nombre} · ${a.regla} · real ${mxn.format(a.real)} → ajustado ${mxn.format(a.ajustado)}` +
  `${a.sinEfecto ? " (sin efecto)" : ` (${mxn.format(a.ajuste)})`} · ${a.nota}`;

/** A dónde regresa el formulario de ajustes: solo al P&L de /finanzas. */
export function rutaVolver(valor: unknown): string {
  const v = typeof valor === "string" ? valor : "";
  return /^\/finanzas\?[^\\]*$/.test(v) && !v.includes("..") && !v.includes("//") ? v : "/finanzas";
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --experimental-strip-types --test lib/finanzas/ajustes.test.ts`
Expected: 10 PASS. Si `Intl` da otro signo de menos que `-`, ajusta las pruebas al que da `Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })` (es el mismo formato que `pesos()` en pantalla).

- [ ] **Step 5: Commit**

```bash
git add lib/finanzas/ajustes.ts lib/finanzas/ajustes.test.ts package.json
git commit -m "feat(pl): cálculo de ajustes por tope o monto"
```

---

### Task 3: Cargar y aplicar los ajustes en los datos del P&L

**Files:**
- Modify: `app/finanzas/datos.ts` (tipo `SucursalPL`, `datosPL`, `vistaPL`, `plConHistoria`, `plAsesores`)

**Interfaces:**
- Consumes: Task 2 (`aplicarAjustes`, `conDeltas`, `sumarDeltas`, `AjusteVigente`, `AjustePL`); `mesesDelRango` de `lib/finanzas/periodo`.
- Produces:
  - `SucursalPL.ajustes: AjusteVigente[]`
  - `vistaPL(...)` devuelve además `ajustado: { entrada: EntradaPL; filas: FilaPL[]; lista: AjustePL[] } | null` (null si no hay ajustes en el periodo).
  - `plConHistoria(...)` devuelve además `anteriorAjustado: ReadonlyMap<string, number | null> | null` y `acumuladoAjustado: ReadonlyMap<string, number | null>`.
  - `plAsesores(...)` devuelve además `formatoAjustado: FormatoAsesores | null`.

- [ ] **Step 1: Cargar `pl_ajustes` en `datosPL`**

En el `Promise.all` de `datosPL` agrega como **último** elemento (no cambia los índices existentes):

```ts
    supabase.from("pl_ajustes").select("id, sucursal_id, mes, renglon, tipo, valor, nota").is("anulado_en", null).in("mes", primerosDeMes)
      .returns<{ id: string; sucursal_id: string; mes: string; renglon: string; tipo: string; valor: number | string; nota: string }[]>(),
```

Toma su resultado del arreglo `res` por su índice (el último) junto a los demás, y conviértelo:

```ts
  const ajustesPL: AjusteVigente[] = (res[res.length - 1].data ?? []).flatMap((a) => esAjustable(a.renglon) && (a.tipo === "tope_pct" || a.tipo === "monto")
    ? [{ id: a.id, sucursalId: a.sucursal_id, mes: a.mes, renglon: a.renglon, tipo: a.tipo, valor: Number(a.valor), nota: a.nota }] : []);
```

Si `res` está tipado como tupla y `res[res.length - 1]` no compila, desestructura el último elemento con un nombre (`resAjustes`) en lugar de usar el índice. Confirma que `primerError(res)` lo incluye.

Agrega `ajustes: AjusteVigente[]` a `SucursalPL` y en el objeto que se arma por sucursal (el `return { id: s.id, nombre: s.nombre, entrada, ctx: …, metas: …, avisos }`):

```ts
      ajustes: ajustesPL.filter((a) => a.sucursalId === s.id),
```

Imports nuevos al inicio de `datos.ts`:

```ts
import { aplicarAjustes, conDeltas, esAjustable, sumarDeltas, type AjustePL, type AjusteVigente } from "@/lib/finanzas/ajustes";
```

y `mesesDelRango` en el import existente de `@/lib/finanzas/periodo` (agrégalo si no está).

- [ ] **Step 2: Calcular el ajustado en `vistaPL`**

Reemplaza `vistaPL` completa:

```ts
/** Ajustes de una sucursal en el periodo: los deltas sobre su entrada y la lista con el nombre de la sucursal. */
function ajustesDe(d: DatosPeriodo, s: SucursalPL) {
  const r = aplicarAjustes(calcularPL(s.entrada, s.metas, s.ctx), s.entrada, s.ajustes, mesesDelRango(d.rango.desde, d.rango.hasta));
  return { deltas: r.deltas, lista: r.lista.map((a): AjustePL => ({ ...a, sucursal: s.nombre })) };
}

/** P&L de una sucursal (o consolidado si no hay o no existe) en un periodo ya cargado; `ajustado` solo si hay ajustes en el periodo. */
export function vistaPL(d: DatosPeriodo, sucursalId: string | undefined) {
  const suc = d.porSucursal.find((s) => s.id === sucursalId) ?? null;
  if (suc) {
    const filas = calcularPL(suc.entrada, suc.metas, suc.ctx);
    const a = ajustesDe(d, suc);
    const entradaAj = conDeltas(suc.entrada, a.deltas);
    return {
      suc, titulo: suc.nombre, entrada: suc.entrada, filas, avisos: [...avisosSinCapturar(filas), ...suc.avisos],
      ajustado: a.lista.length ? { entrada: entradaAj, filas: calcularPL(entradaAj, suc.metas, suc.ctx), lista: a.lista } : null,
    };
  }
  // En el consolidado, los costos fijos sin capturar se avisan por sucursal (ahí es donde falta capturarlos).
  const porSucursal = d.porSucursal.flatMap((s) =>
    [...avisosSinCapturar(calcularPL(s.entrada, s.metas, s.ctx)), ...s.avisos].map((a) => `${s.nombre}: ${a}`));
  const metas = sumarMetas(d.porSucursal);
  const ajs = d.porSucursal.map((s) => ajustesDe(d, s));
  const lista = ajs.flatMap((a) => a.lista);
  const entradaAj = conDeltas(d.consolidado.entrada, sumarDeltas(ajs.map((a) => a.deltas)));
  return {
    suc: null, titulo: "Consolidado", entrada: d.consolidado.entrada,
    filas: calcularPL(d.consolidado.entrada, metas, d.consolidado.ctx),
    avisos: [...d.avisosOficina, ...porSucursal],
    ajustado: lista.length ? { entrada: entradaAj, filas: calcularPL(entradaAj, metas, d.consolidado.ctx), lista } : null,
  };
}
```

- [ ] **Step 3: Comparaciones ajustadas en `plConHistoria`**

Reemplaza el cuerpo después del `Promise.all`:

```ts
  const vista = vistaPL(d, sucursalId);
  const pctDe = (filas: FilaPL[]) => new Map(filas.map((f) => [f.clave, f.pct]));
  const sinMetas = (e: EntradaPL) => calcularPL(e, [], { ventaNeta: e.ventaNeta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
  const vPrevio = previo ? vistaPL(previo, sucursalId) : null;
  const vMeses = meses.map((m) => vistaPL(m!, sucursalId));
  const acum = sumarEntradas(vMeses.map((v) => v.entrada));
  const acumAj = sumarEntradas(vMeses.map((v) => v.ajustado?.entrada ?? v.entrada));
  return {
    datos: d, ...vista,
    anterior: vPrevio ? pctDe(vPrevio.filas) : null,
    acumulado: pctDe(sinMetas(acum)),
    /** Para el PDF "ajustado": las mismas comparaciones con los ajustes de cada periodo. */
    anteriorAjustado: vPrevio ? pctDe(vPrevio.ajustado?.filas ?? vPrevio.filas) : null,
    acumuladoAjustado: pctDe(sinMetas(acumAj)),
    columnas: COLUMNAS[p.tipo],
    detalleDe: (renglon: string) => (vista.suc ? d.detalle.get(`${vista.suc.id}|${renglon}`) ?? [] : []),
    memoDetalle: (cuenta: "insumos" | "inversiones") => (vista.suc ? d.detalle.get(`${vista.suc.id}|memo_${cuenta}`) ?? [] : []),
  };
```

(Confirma que `EntradaPL` ya está importado en `datos.ts`; si no, agrégalo al import de tipos de `@/lib/finanzas/pl`.)

- [ ] **Step 4: Formato de asesores ajustado en `plAsesores`**

```ts
  let formato: FormatoAsesores | null = null, formatoAjustado: FormatoAsesores | null = null, error: string | null = null;
  try {
    formato = formatoAsesores(vista.entrada, vista.filas);
    if (vista.ajustado) formatoAjustado = formatoAsesores(vista.ajustado.entrada, vista.ajustado.filas);
  } catch (e) { console.error(e); error = e instanceof Error ? e.message : String(e); }
```

y en el `return`: `return { datos: d, ...vista, formato, formatoAjustado, error, detalleDe };`

- [ ] **Step 5: Tipos y pruebas**

Run: `npm run typecheck` y `npm test`
Expected: sin errores de tipos; todas las pruebas PASS (las pantallas todavía no usan `ajustado`, así que nada cambia a la vista).

- [ ] **Step 6: Commit**

```bash
git add app/finanzas/datos.ts
git commit -m "feat(pl): cargar ajustes y calcular el P&L ajustado"
```

---

### Task 4: Excel con columnas ajustadas y hoja "Ajustes"

**Files:**
- Modify: `lib/finanzas/excel.ts` (`hojaPL`, nueva `hojaAjustes`)
- Modify: `lib/finanzas/excelAsesores.ts` (`hojaAsesores`)
- Modify: `app/reporte/pl/excel/route.ts`
- Test: `lib/finanzas/excel.test.ts`, `lib/finanzas/excelAsesores.test.ts`

**Interfaces:**
- Consumes: Task 2 (`AjustePL`), Task 3 (`r.meta.ajustado`, `r.asesores.ajustado`, `r.asesores.formatoAjustado`).
- Produces:
  - `hojaPL(r & { ajustado?: readonly FilaPL[] | null }, pre)`: con `ajustado`, después de "% de venta" van "Ajuste", "Ajustado", "% ajustado".
  - `hojaAjustes(r: { titulo: string; periodo: string; generado: string; lista: readonly AjustePL[] }): HojaXlsx[]` → `[]` si la lista está vacía.
  - `hojaAsesores(r & { ajustado?: FormatoAsesores | null })`: con `ajustado`, columnas "Ajustado" y "<base> ajustado".

- [ ] **Step 1: Pruebas que fallan**

Al final de `lib/finanzas/excel.test.ts` (agrega `hojaAjustes` al import de `./excel.ts`):

```ts
test("hojaPL con ajustado: Ajuste, Ajustado y % ajustado junto al real", () => {
  const e = { ...entradaVacia(), ventaNeta: 356560.09, gastos: { marketing: 34067.74 } };
  const filas = calcularPL(e, [], ctx(e.ventaNeta));
  const ajustado = calcularPL({ ...e, gastos: { marketing: 17828 } }, [], ctx(e.ventaNeta));
  const [h] = hojaPL({ titulo: "Centro", periodo: "Octubre 2026", generado: "S", filas, entrada: e, anterior: null,
    acumulado: new Map(), columnas: { anterior: "Mes anterior %", acumulado: "Acumulado del año %" }, ajustado }, PRESENTACION);
  assert.deepEqual(h.filas[4], ["Renglón", "Real", "% de venta", "Ajuste", "Ajustado", "% ajustado", "Meta", "Meta %", "Diferencia", "Mes anterior %", "Acumulado del año %"]);
  const m = h.filas.find((f) => f[0] === "Marketing")!;
  assert.deepEqual(m.slice(1, 6), [{ valor: 34067.74, formato: "contable" }, { valor: 0.0955, formato: "porcentaje" },
    { valor: -16239.74, formato: "contable" }, { valor: 17828, formato: "contable" }, { valor: 0.05, formato: "porcentaje" }]);
  assert.equal(h.anchos!.length, 11);
});

test("hojaPL sin ajustado: igual que siempre", () => {
  const e = { ...entradaVacia(), ventaNeta: 1000 };
  const [h] = hojaPL({ titulo: "C", periodo: "P", generado: "S", filas: calcularPL(e, [], ctx(1000)), entrada: e, anterior: null,
    acumulado: new Map(), columnas: { anterior: "A", acumulado: "B" }, ajustado: null }, PRESENTACION);
  assert.equal(h.filas[4].length, 8);
});

test("hojaAjustes: una fila por ajuste con su regla y nota; vacía si no hay", () => {
  assert.deepEqual(hojaAjustes({ titulo: "C", periodo: "P", generado: "S", lista: [] }), []);
  const [h] = hojaAjustes({ titulo: "Consolidado", periodo: "Octubre 2026", generado: "S", lista: [{
    id: "a", sucursalId: "s", sucursal: "Centro", mes: "2026-10-01", renglon: "marketing", tipo: "tope_pct", valor: 0.05, nota: "Inauguración: solo el 5 %",
    nombre: "Marketing", real: 34067.74, ajuste: -16239.74, ajustado: 17828, regla: "Tope 5 % de la venta neta = $17,828.00", sinEfecto: false,
  }] });
  assert.equal(h.nombre, "Ajustes");
  assert.deepEqual(h.filas[4], ["Sucursal", "Mes", "Renglón", "Regla", "Real", "Ajuste", "Ajustado", "Nota"]);
  assert.deepEqual(h.filas[5], ["Centro", "2026-10", "Marketing", "Tope 5 % de la venta neta = $17,828.00",
    { valor: 34067.74, formato: "contable" }, { valor: -16239.74, formato: "contable" }, { valor: 17828, formato: "contable" }, "Inauguración: solo el 5 %"]);
});
```

Al final de `lib/finanzas/excelAsesores.test.ts` (usa los datos/imports que ya tiene ese archivo para armar un `FormatoAsesores`; si ahí se llama `formato`, reutilízalo):

```ts
test("hojaAsesores con ajustado: columnas Ajustado y % ajustado por renglón", () => {
  const base = formatoAsesores(E, calcularPL(E, [], ctx(E.ventaNeta)));
  const ajustado = { ...base, renglones: base.renglones.map((r) => ({ ...r, monto: r.monto === null ? null : r.monto - 1, pct: r.pct })) };
  const [h] = hojaAsesores({ titulo: "C", periodo: "P", generado: "S", formato: base, ajustado, secciones: SECCIONES_ASESORES, avisos: [] });
  assert.equal(h.filas[4].length, 5);
  assert.equal(h.filas[4][3], "Ajustado");
  const i = h.filas.findIndex((f) => f[0] === base.renglones[0].nombre);
  assert.deepEqual(h.filas[i][3], base.renglones[0].monto === null ? "Pendiente" : { valor: base.renglones[0].monto - 1, formato: "contable" });
  assert.equal(h.anchos!.length, 5);
});
```

(Si `excelAsesores.test.ts` no tiene `E`, `ctx`, `formatoAsesores` o `calcularPL`, copia los de `lib/finanzas/formatoAsesores.test.ts`.)

Run: `node --experimental-strip-types --test lib/finanzas/excel.test.ts lib/finanzas/excelAsesores.test.ts`
Expected: FAIL (`hojaAjustes` no existe; encabezados de 8 columnas).

- [ ] **Step 2: Implementar `hojaPL` y `hojaAjustes`**

En `lib/finanzas/excel.ts`, agrega `import type { AjustePL } from "./ajustes";` y reemplaza `hojaPL`:

```ts
/** Hoja "Contra meta": real, %, (ajuste y ajustado si hay ajustes), meta, diferencia contra el real y las dos comparaciones. */
export function hojaPL(r: {
  titulo: string; periodo: string; generado: string; filas: FilaPL[]; entrada: EntradaPL;
  anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
  columnas: { anterior: string; acumulado: string };
  ajustado?: readonly FilaPL[] | null;
}, pre: Presentacion): HojaXlsx[] {
  const aj = r.ajustado ? new Map(r.ajustado.map((f) => [f.clave, f])) : null;
  const arriba = encabezado(`P&L · ${r.titulo}`, r.periodo, r.generado,
    ["Renglón", "Real", "% de venta", ...(aj ? ["Ajuste", "Ajustado", "% ajustado"] : []), "Meta", "Meta %", "Diferencia", r.columnas.anterior, r.columnas.acumulado]);
  const de = new Map(r.filas.map((f) => [f.clave, f]));
  const cuerpo = porSecciones(pre, (clave) => {
    const f = de.get(clave);
    if (!f) return null;
    const a = aj?.get(clave);
    const ajuste = a && a.monto !== null && f.monto !== null ? Math.round((a.monto - f.monto) * 100) / 100 : null;
    return [
      f.nombre, f.monto === null ? "Sin dato" : contable(f.monto), pct(f.pct),
      ...(aj ? [ajuste ? contable(ajuste) : null, contable(a?.monto ?? f.monto), pct(a?.pct ?? f.pct)] : []),
      contable(f.meta), pct(f.metaPct), f.sinCapturar ? "Sin capturar" : contable(f.diferencia),
      r.anterior ? pct(r.anterior.get(f.clave)) : null, pct(r.acumulado.get(f.clave)),
    ];
  }, {
    venta: [["Descuentos (informativo)", contable(r.entrada.descuentos)]],
    memo: [["Compras de insumos", contable(r.entrada.memos.insumos)], ["Inversiones", contable(r.entrada.memos.inversiones)]],
  }, arriba.length);
  return [{ nombre: "Contra meta", filas: [...arriba, ...cuerpo.filas], negritas: [0, 4], estilos: cuerpo.estilos,
    anchos: [32, 16, 12, ...(aj ? [16, 16, 12] : []), 16, 12, 16, 18, 18] }];
}

/** Hoja "Ajustes": cada ajuste del periodo con su regla, real, ajuste, ajustado y nota. Sin ajustes no hay hoja. */
export function hojaAjustes(r: { titulo: string; periodo: string; generado: string; lista: readonly AjustePL[] }): HojaXlsx[] {
  if (!r.lista.length) return [];
  const filas: Celda[][] = [
    [`Ajustes del P&L · ${r.titulo}`], [`${r.periodo} · el real no cambia; el ajustado aplica estos ajustes`], [`Generado por ${r.generado}`], [],
    ["Sucursal", "Mes", "Renglón", "Regla", "Real", "Ajuste", "Ajustado", "Nota"],
    ...r.lista.map((a): Celda[] => [a.sucursal, a.mes.slice(0, 7), a.nombre, a.regla, contable(a.real), contable(a.ajuste), contable(a.ajustado), a.nota]),
  ];
  return [{ nombre: "Ajustes", filas, negritas: [0, 4], anchos: [24, 10, 28, 44, 16, 16, 16, 60] }];
}
```

- [ ] **Step 3: Implementar `hojaAsesores` con ajustado**

En `lib/finanzas/excelAsesores.ts`, agrega al tipo de `r`: `/** Formato con los ajustes del periodo: columnas Ajustado y su %. */ ajustado?: FormatoAsesores | null;` y cambia:

```ts
  const aj = r.ajustado ? new Map(r.ajustado.renglones.map((x) => [x.clave, x])) : null;
```

el encabezado a `["Renglón", "Monto", base, ...(aj ? ["Ajustado", `${base} ajustado`] : [])]`, el `filas.push` del renglón a:

```ts
      const y = aj?.get(x.clave);
      filas.push([
        x.pendiente && x.monto !== null ? `${x.nombre} (provisional)` : x.nombre,
        x.monto === null ? "Pendiente" : { valor: x.monto, formato: "contable" }, x.pct === null ? null : { valor: x.pct, formato: "porcentaje" },
        ...(aj ? [y?.monto == null ? "Pendiente" : { valor: y.monto, formato: "contable" as const }, y?.pct == null ? null : { valor: y.pct, formato: "porcentaje" as const }] : []),
      ]);
```

y `anchos: aj ? [40, 18, 18, 18, 18] : [40, 18, 18]`.

- [ ] **Step 4: Pasar los ajustes en la ruta del Excel**

En `app/reporte/pl/excel/route.ts`, agrega `hojaAjustes` al import de `@/lib/finanzas/excel` y cambia el arreglo de hojas:

```ts
  const archivo = escribirXlsx(ases?.formato
    ? [
      ...hojaAsesores({ titulo: r.titulo, periodo, generado, formato: ases.formato, ajustado: ases.formatoAjustado, secciones: SECCIONES_ASESORES, avisos: ases.avisos }),
      ...hojaAjustes({ titulo: r.titulo, periodo, generado, lista: ases.ajustado?.lista ?? [] }),
    ]
    : [
      ...hojasCuentas({ ...r.cuentas!, generado }),
      ...hojaPL({
        titulo: r.titulo, periodo, generado, filas: r.meta!.filas, entrada: r.meta!.entrada,
        anterior: r.meta!.anterior, acumulado: r.meta!.acumulado, columnas: r.meta!.columnas, ajustado: r.meta!.ajustado?.filas ?? null,
      }, PRESENTACION),
      ...hojaAjustes({ titulo: r.titulo, periodo, generado, lista: r.meta!.ajustado?.lista ?? [] }),
      ...hojaComparativo({ titulo: r.titulo, periodo: r.comp!.periodoTitulo, generado, columnas: r.comp!.columnas, total: r.comp!.total }, PRESENTACION),
    ]);
```

- [ ] **Step 5: Pruebas y tipos**

Run: `node --experimental-strip-types --test lib/finanzas/excel.test.ts lib/finanzas/excelAsesores.test.ts && npm run typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add lib/finanzas/excel.ts lib/finanzas/excelAsesores.ts lib/finanzas/excel.test.ts lib/finanzas/excelAsesores.test.ts app/reporte/pl/excel/route.ts
git commit -m "feat(pl): Excel con real y ajustado y hoja de ajustes"
```

---

### Task 5: Pantalla — columnas Ajuste/Ajustado y lista de ajustes

**Files:**
- Modify: `app/finanzas/TablaPL.tsx`
- Modify: `app/finanzas/TablaAsesores.tsx`
- Create: `app/finanzas/ListaAjustes.tsx`
- Modify: `app/finanzas/page.tsx`

**Interfaces:**
- Consumes: Task 3 (`meta.ajustado`, `ases.ajustado`, `ases.formatoAjustado`), Task 2 (`AjustePL`, `lineaAjuste`). Requiere el `TablaPL` de PR #104 (prop `impresa`).
- Produces (los dos archivos agregan `import type { ReactNode } from "react";`):
  - `TablaPL` props nuevas: `ajustado?: readonly FilaPL[] | null`, `sinHistoria?: boolean`, `rotuloMonto?: string` (default `"Real"`), `captura?: (f: FilaPL) => ReactNode`.
  - `TablaAsesores` prop nueva: `ajustado?: FormatoAsesores | null`.
  - `ListaAjustes({ lista: readonly AjustePL[]; conSucursal: boolean; impresa?: boolean; anular?: (a: AjustePL) => ReactNode })`.

- [ ] **Step 1: Traer PR #104 a la rama**

Run: `gh pr view 104 --repo HelperHolding/dodo-money --json state -q .state`
Si es `MERGED`: `git fetch origin && git merge origin/main` (resuelve el conflicto del script `test` de `package.json` tomando el de `main` y volviendo a agregar `lib/finanzas/ajustes.test.ts` y `tests/plAjustes.test.mjs` con el one-liner de las Tasks 1 y 2). Si sigue `OPEN`: **detente y reporta** que esta tarea necesita PR #104 integrado; no mezcles su rama aquí.
Después: `npm test` → PASS.

- [ ] **Step 2: `TablaPL` con columnas ajustadas**

En `app/finanzas/TablaPL.tsx` (versión de PR #104): agrega a la firma y al tipo de props:

```ts
export function TablaPL({ r, columnas, impresa = false, ajustado = null, sinHistoria = false, rotuloMonto = "Real", captura }: {
  …lo que ya tiene…
  /** Filas del P&L ajustado (misma sucursal y periodo): agrega Ajuste, Ajustado y su %. Meta y Diferencia siguen contra el real. */
  ajustado?: readonly FilaPL[] | null;
  /** PDF con real y ajustado: sin las dos comparaciones para que quepa. */
  sinHistoria?: boolean;
  /** Encabezado de la columna del monto ("Ajustado" en el PDF ajustado). */
  rotuloMonto?: string;
  /** Admin, sucursal y mes: lo que va bajo el nombre del renglón (el formulario "Ajustar"). */
  captura?: (f: FilaPL) => ReactNode;
}) {
```

Después de `const de = …`:

```ts
  const aj = ajustado ? new Map(ajustado.map((f) => [f.clave, f])) : null;
  const columnasTotal = 5 + (aj ? 3 : 0) + (sinHistoria ? 0 : 2);
```

En `renglon`: dentro de `celda-pila`, después del `desplegable`, agrega `{captura?.(f)}`. Cambia `data-label="Real"` por `data-label={rotuloMonto}`. Después de la celda `%` inserta:

```tsx
        {aj && (() => {
          const a = aj.get(f.clave);
          const ajuste = a && a.monto !== null && f.monto !== null ? Math.round((a.monto - f.monto) * 100) / 100 : 0;
          return <>
            <td data-label="Ajuste" className="monto">{ajuste ? <Importe n={ajuste} /> : "—"}</td>
            <td data-label="Ajustado" className="monto"><Importe n={a?.monto ?? f.monto} /></td>
            <td data-label="% ajustado" className="monto">{porcentaje(a?.pct ?? f.pct)}</td>
          </>;
        })()}
```

Envuelve las dos celdas de comparación en `{!sinHistoria && <>…</>}`. En `informativo`: `data-label={rotuloMonto}` y `colSpan={columnasTotal - 2}`. En el `thead`:

```tsx
            <tr>
              <th>Renglón</th><th className="monto">{rotuloMonto}</th><th className="monto">%</th>
              {aj && <><th className="monto">Ajuste</th><th className="monto">Ajustado</th><th className="monto">% aj.</th></>}
              <th className="monto" title="En pesos para los costos fijos; en % de la venta para los demás">Meta</th><th className="monto">Dif.</th>
              {!sinHistoria && <><th className="monto" title={columnas.anterior}>{columnas.anteriorCorto}</th><th className="monto" title={columnas.acumulado}>{columnas.acumuladoCorto}</th></>}
            </tr>
```

Los dos `colSpan={7}` de las barras de sección pasan a `colSpan={columnasTotal}`. Agrega a la clase de la tabla impresa `${aj ? " tabla-pl-ambas" : ""}` (la usa la Task 7).

- [ ] **Step 3: `ListaAjustes`**

`app/finanzas/ListaAjustes.tsx`:

```tsx
import { pesos } from "@/lib/formato";
import type { ReactNode } from "react";
import { lineaAjuste, type AjustePL } from "@/lib/finanzas/ajustes";

/** "Ajustes del periodo": en pantalla una tabla con la nota (y "Anular" para admin); en el PDF, una línea por ajuste. */
export function ListaAjustes({ lista, conSucursal, impresa = false, anular }: {
  lista: readonly AjustePL[]; conSucursal: boolean; impresa?: boolean; anular?: (a: AjustePL) => ReactNode;
}) {
  if (!lista.length) return null;
  if (impresa) return (
    <section className="seccion pl-ajustes-impresos">
      <p className="saldo-nota"><strong>Ajustes del periodo</strong> (el real no cambia)</p>
      {lista.map((a) => <p key={a.id} className="saldo-nota">{lineaAjuste(a, conSucursal)}</p>)}
    </section>
  );
  return (
    <section className="seccion">
      <h2>Ajustes del periodo</h2>
      <p className="saldo-nota">El real no cambia: Ajuste y Ajustado muestran el P&L sin estos montos. Meta y Diferencia comparan contra el real.</p>
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas">
          <thead><tr>
            {conSucursal && <th>Sucursal</th>}<th>Renglón</th><th>Regla</th><th className="monto">Real</th><th className="monto">Ajuste</th><th className="monto">Ajustado</th><th>Nota</th>{anular && <th />}
          </tr></thead>
          <tbody>{lista.map((a) => (
            <tr key={a.id}>
              {conSucursal && <td data-label="Sucursal">{a.sucursal}</td>}
              <td data-label="Renglón">{a.nombre}</td>
              <td data-label="Regla">{a.regla}{a.sinEfecto && " (sin efecto)"}</td>
              <td data-label="Real" className="monto">{pesos(a.real)}</td>
              <td data-label="Ajuste" className="monto">{a.sinEfecto ? "—" : pesos(a.ajuste)}</td>
              <td data-label="Ajustado" className="monto">{pesos(a.ajustado)}</td>
              <td data-label="Nota">{a.nota}</td>
              {anular && <td data-label="">{anular(a)}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `TablaAsesores` con ajustado**

En `app/finanzas/TablaAsesores.tsx` agrega la prop `ajustado = null` (`ajustado?: FormatoAsesores | null`), `const aj = ajustado ? new Map(ajustado.renglones.map((x) => [x.clave, x])) : null;`, y en `renglon` después de la celda del %:

```tsx
      {aj && <>
        <td data-label="Ajustado" className="monto">{aj.get(r.clave)?.monto == null ? "Pendiente" : <Importe n={aj.get(r.clave)!.monto} />}</td>
        <td data-label={`${base} ajustado`} className="monto">{porcentaje(aj.get(r.clave)?.pct ?? null)}</td>
      </>}
```

En el `thead` agrega `{aj && <><th className="monto">Ajustado</th><th className="monto">% aj.</th></>}` y cambia `colSpan={3}` por `colSpan={aj ? 5 : 3}`.

- [ ] **Step 5: Conectar en `app/finanzas/page.tsx`**

- En Contra meta: `<TablaPL r={meta} columnas={meta.columnas} ajustado={meta.ajustado?.filas ?? null} />` y debajo `{meta.ajustado && <ListaAjustes lista={meta.ajustado.lista} conSucursal={!meta.suc} />}`.
- En Formato asesores: `<TablaAsesores formato={ases.formato} ajustado={ases.formatoAjustado} detalleDe={ases.detalleDe} />` y debajo `{ases.ajustado && <ListaAjustes lista={ases.ajustado.lista} conSucursal={!ases.suc} />}`.

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npm test`
Expected: PASS. Sin la migración en la base local no hay ajustes: la tabla debe verse igual que hoy (mismas 7 columnas).

- [ ] **Step 7: Commit**

```bash
git add app/finanzas/TablaPL.tsx app/finanzas/TablaAsesores.tsx app/finanzas/ListaAjustes.tsx app/finanzas/page.tsx package.json
git commit -m "feat(pl): columnas Ajuste y Ajustado y lista de ajustes en pantalla"
```

---

### Task 6: Captura y anulación (admin, sucursal y mes)

**Files:**
- Create: `app/finanzas/ajustes/acciones.ts`
- Create: `app/finanzas/FormAjuste.tsx`
- Modify: `app/finanzas/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 1 (RPC y mensajes), Task 2 (`esAjustable`, `rutaVolver`), Task 5 (`captura`, `anular`).
- Produces: server actions `guardarAjustePL(fd: FormData)` y `anularAjustePL(fd: FormData)`; campos del formulario `solicitud, sucursal_id, mes, renglon, tipo, valor, nota, volver` y `id, motivo, volver`.

- [ ] **Step 1: Server actions**

`app/finanzas/ajustes/acciones.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { rutaVolver } from "@/lib/finanzas/ajustes";
import { clienteFinanzas, volver } from "../servidor";

const recalcular = () => { revalidatePath("/finanzas", "layout"); revalidatePath("/reporte/pl", "layout"); };

/** Captura un ajuste: el tope llega en % (5 → 0.05) y el monto en pesos con signo. */
export async function guardarAjustePL(fd: FormData) {
  const destino = rutaVolver(fd.get("volver"));
  const supabase = await clienteFinanzas(destino);
  const tipo = String(fd.get("tipo") ?? "");
  const texto = String(fd.get("valor") ?? "").trim().replace(/[$\s,]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(texto)) volver(destino, "error", "Escribe el valor con números y hasta dos decimales.");
  const n = Number(texto);
  const { error } = await supabase.rpc("guardar_ajuste_pl", {
    p_solicitud: fd.get("solicitud"), p_sucursal: fd.get("sucursal_id"), p_mes: fd.get("mes"), p_renglon: fd.get("renglon"),
    p_tipo: tipo, p_valor: tipo === "tope_pct" ? Math.round(n * 100) / 10000 : n, p_nota: fd.get("nota"),
  });
  if (!error) recalcular();
  volver(destino, error ? "error" : "ok", error?.message ?? "Ajuste guardado: el P&L muestra Real y Ajustado.");
}

export async function anularAjustePL(fd: FormData) {
  const destino = rutaVolver(fd.get("volver"));
  const supabase = await clienteFinanzas(destino);
  const { error } = await supabase.rpc("anular_ajuste_pl", { p_id: fd.get("id"), p_motivo: fd.get("motivo") });
  if (!error) recalcular();
  volver(destino, error ? "error" : "ok", error?.message ?? "Ajuste anulado.");
}
```

(La coma se quita como separador de miles: "16,000" → 16000. El decimal es punto.)

- [ ] **Step 2: Formulario con vista previa**

`app/finanzas/FormAjuste.tsx`:

```tsx
"use client";
import { useState } from "react";
import { pesos } from "@/lib/formato";
import { guardarAjustePL } from "./ajustes/acciones";

const centavos = (n: number) => Math.round(n * 100) / 100;

/** "Ajustar" bajo un renglón de gasto: tope % de la venta neta o monto, nota obligatoria y vista previa del ajustado. */
export function FormAjuste({ sucursal, mes, renglon, real, ventaNeta, volverA }: {
  sucursal: string; mes: string; renglon: string; real: number; ventaNeta: number; volverA: string;
}) {
  const [tipo, setTipo] = useState<"tope_pct" | "monto">("tope_pct");
  const [valor, setValor] = useState("");
  const [solicitud] = useState(() => crypto.randomUUID());
  const n = Number(valor.replace(/[$\s,]/g, ""));
  const ajustado = valor.trim() === "" || !Number.isFinite(n) ? null
    : tipo === "tope_pct" ? (ventaNeta > 0 ? Math.min(real, centavos((n / 100) * ventaNeta)) : real) : centavos(real + n);
  return (
    <details className="pl-ajustar">
      <summary className="saldo-nota">Ajustar</summary>
      <form action={guardarAjustePL} className="pl-ajustar-form">
        <input type="hidden" name="solicitud" value={solicitud} />
        <input type="hidden" name="sucursal_id" value={sucursal} />
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="renglon" value={renglon} />
        <input type="hidden" name="volver" value={volverA} />
        <label>Tipo
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "tope_pct" | "monto")}>
            <option value="tope_pct">Tope % de la venta neta</option>
            <option value="monto">Monto en pesos (negativo limpia)</option>
          </select>
        </label>
        <label>{tipo === "tope_pct" ? "Tope (%)" : "Monto ($)"}
          <input name="valor" inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === "tope_pct" ? "5" : "-16000"} />
        </label>
        <label>Nota
          <textarea name="nota" required minLength={10} maxLength={500} rows={2} placeholder="Por qué se ajusta (se imprime en el reporte)" />
        </label>
        <p className="saldo-nota">
          {ajustado === null ? `Real ${pesos(real)}` : `Real ${pesos(real)} → ajustado ${pesos(ajustado)} (${pesos(centavos(ajustado - real))})`}
        </p>
        <button className="boton boton-compacto" type="submit">Guardar ajuste</button>
      </form>
    </details>
  );
}
```

- [ ] **Step 3: Conectar captura, anulación y avisos en `page.tsx`**

- `Filtros` agrega `ok?: string; error?: string`.
- `const { supabase, perfil } = await obtenerPerfil();` y `const admin = puedeEditarFinanzas(perfil.rol);` (import de `@/lib/roles`).
- Muestra `<Aviso ok={q.ok} error={q.error} />` (import `{ Aviso }` de `@/components/Aviso`) justo debajo del encabezado de la página.
- Antes del `return`:

```tsx
  const volverA = `/finanzas?${filtro}`;
  const conAjuste = new Set(meta?.ajustado?.lista.map((a) => a.renglon) ?? []);
  const captura = admin && meta?.suc && p.tipo === "mes" && !p.vacio
    ? (f: FilaPL) => esAjustable(f.clave) && !conAjuste.has(f.clave) && (
      <FormAjuste sucursal={meta.suc!.id} mes={`${p.clave}-01`} renglon={f.clave} real={f.monto ?? 0} ventaNeta={meta.entrada.ventaNeta} volverA={volverA} />)
    : undefined;
  const anular = admin ? (a: AjustePL) => (
    <details className="pl-ajustar">
      <summary className="saldo-nota">Anular</summary>
      <form action={anularAjustePL} className="pl-ajustar-form">
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="volver" value={volverA} />
        <label>Motivo<input name="motivo" required minLength={5} maxLength={500} /></label>
        <button className="boton boton-secundario boton-compacto" type="submit">Anular ajuste</button>
      </form>
    </details>
  ) : undefined;
```

- Pasa `captura={captura}` a la `TablaPL` de Contra meta y `anular={anular}` a las dos `ListaAjustes`.
- Imports: `FormAjuste` de `./FormAjuste`, `anularAjustePL` de `./ajustes/acciones`, `esAjustable, type AjustePL` de `@/lib/finanzas/ajustes`, `type FilaPL` de `@/lib/finanzas/pl`.
- En `ConInfo` de Contra meta, agrega al texto: "Con sucursal y mes, admin puede ajustar un renglón de gasto con nota; el real no cambia."

- [ ] **Step 4: Estilos**

Al final de `app/globals.css`:

```css
/* Ajustes del P&L: "Ajustar"/"Anular" plegables bajo el renglón, formulario compacto. */
.pl-ajustar summary { cursor: pointer; }
.pl-ajustar-form { display: grid; gap: 6px; margin-top: 6px; max-width: 360px; }
.pl-ajustar-form label { display: grid; gap: 2px; font-size: 13px; }
@media print { .pl-ajustar { display: none; } }
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS y build sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/finanzas/ajustes/acciones.ts app/finanzas/FormAjuste.tsx app/finanzas/page.tsx app/globals.css
git commit -m "feat(pl): capturar y anular ajustes con nota desde el P&L"
```

---

### Task 7: PDF con columnas elegidas

**Files:**
- Modify: `app/reporte/pl/page.tsx`
- Modify: `app/finanzas/reporte-datos.ts` (`FiltrosPL`)
- Modify: `app/finanzas/page.tsx` (selector junto al botón PDF)
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 3 (`ajustado`, `anteriorAjustado`, `acumuladoAjustado`), Task 5 (`TablaPL` props, `ListaAjustes impresa`).
- Produces: parámetro `columnas=real|ajustado|ambas` en `/reporte/pl`.

- [ ] **Step 1: Parámetro y tabla del PDF**

`FiltrosPL` agrega `columnas?: string`. En `app/reporte/pl/page.tsx` (versión de PR #104), después de `const r = …`:

```ts
  const aj = r.meta?.ajustado ?? null;
  /** Sin ajustes en el periodo, siempre el real. */
  const modo = aj && (q.columnas === "ajustado" || q.columnas === "ambas") ? q.columnas : "real";
  const rotulo = modo === "ajustado" ? " · cifras ajustadas" : modo === "ambas" ? " · real y ajustado" : "";
```

Agrega `${rotulo}` al final del `detalle` del encabezado en el caso de mes/semana (no en comparativo). Reemplaza `<TablaPL r={r.meta} columnas={r.meta.columnas} impresa />` por:

```tsx
        <>
          {modo === "ajustado"
            ? <TablaPL r={{ ...r.meta, filas: aj!.filas, entrada: aj!.entrada, anterior: r.meta.anteriorAjustado, acumulado: r.meta.acumuladoAjustado }}
                columnas={r.meta.columnas} impresa rotuloMonto="Ajustado" />
            : <TablaPL r={r.meta} columnas={r.meta.columnas} impresa ajustado={modo === "ambas" ? aj!.filas : null} sinHistoria={modo === "ambas"} />}
          {modo !== "real" && <ListaAjustes lista={aj!.lista} conSucursal={!r.meta.suc} impresa />}
        </>
```

(Import `ListaAjustes` de `@/app/finanzas/ListaAjustes`.)

- [ ] **Step 2: Anchos de la tabla con real y ajustado**

En `app/globals.css`, después del bloque "P&L en PDF (mes o semana)" de PR #104:

```css
/* PDF con real y ajustado: ocho columnas (sin las dos comparaciones). */
.tabla-pl.tabla-pl-impresa.tabla-pl-ambas thead th:nth-child(1) { width: 26%; }
.tabla-pl.tabla-pl-impresa.tabla-pl-ambas thead th:nth-child(2),
.tabla-pl.tabla-pl-impresa.tabla-pl-ambas thead th:nth-child(4),
.tabla-pl.tabla-pl-impresa.tabla-pl-ambas thead th:nth-child(5),
.tabla-pl.tabla-pl-impresa.tabla-pl-ambas thead th:nth-child(7) { width: 12%; }
.tabla-pl.tabla-pl-impresa.tabla-pl-ambas thead th:nth-child(3),
.tabla-pl.tabla-pl-impresa.tabla-pl-ambas thead th:nth-child(6) { width: 6%; }
.tabla-pl.tabla-pl-impresa.tabla-pl-ambas thead th:nth-child(8) { width: 14%; }
.reporte-pl .pl-ajustes-impresos { gap: 0; }
```

- [ ] **Step 3: Selector junto al botón PDF**

En `app/finanzas/page.tsx`, reemplaza el `Link` del PDF por:

```tsx
          {meta?.ajustado ? (
            <form action="/reporte/pl" method="get" target="_blank" className="pl-pdf-columnas">
              {[...new URLSearchParams(filtro)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <select name="columnas" defaultValue="ambas" aria-label="Columnas del PDF">
                <option value="ambas">Real y ajustado</option><option value="real">Solo real</option><option value="ajustado">Solo ajustado</option>
              </select>
              <button className="boton boton-secundario boton-compacto" type="submit"><Icono nombre="documento" />PDF</button>
            </form>
          ) : !asesores && <Link className="boton boton-secundario boton-compacto" href={`/reporte/pl?${filtro}`} target="_blank"><Icono nombre="documento" />{cuentas?"PDF operativo":"PDF"}</Link>}
```

y en `app/globals.css`: `.pl-pdf-columnas { display: inline-flex; gap: 6px; align-items: center; }`.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS. `/reporte/pl?…&columnas=ambas` sin ajustes en el periodo se ve igual que el PDF de hoy.

- [ ] **Step 5: Commit**

```bash
git add app/reporte/pl/page.tsx app/finanzas/reporte-datos.ts app/finanzas/page.tsx app/globals.css
git commit -m "feat(pl): PDF del P&L con columnas real, ajustado o ambas"
```

---

### Task 8: Entrega de la migración y prueba en la vista previa

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo PASS.

- [ ] **Step 2: Entregar a Sebastián**

Abrir el PR y pasarle, en este orden, el contenido de `supabase/migrations/20261102200000_pl_ajustes.sql` y de `supabase/pruebas/20261102200000_pl_ajustes.sql` para el SQL Editor del proyecto de producción. Esperado: la prueba termina en `ERROR: P0001: PRUEBAS OK`. No integrar el PR antes de ese resultado.

- [ ] **Step 3: Probar en la vista previa de Vercel** (con la migración ya en producción)

Con un admin, en Finanzas → P&L → Contra meta, octubre 2026, la sucursal de la inauguración:
1. "Ajustar" en Marketing → tope 5, nota → guardar. Esperado: aviso verde; columnas Ajuste/Ajustado; Marketing ajustado = 5 % de la venta neta; EBITDA ajustado = EBITDA real + lo limpiado; lista con la nota.
2. Consolidado: las mismas columnas y la lista con el nombre de la sucursal.
3. PDF con "Real y ajustado", "Solo real" y "Solo ajustado": una hoja carta, una sola letra, la lista al pie en los dos primeros.
4. Excel: columnas Ajuste/Ajustado y hoja "Ajustes".
5. Formato asesores: columnas Ajustado y lista.
6. Semana que toca octubre: columnas presentes; sin "Ajustar".
7. "Anular" con motivo: el renglón vuelve a ofrecer "Ajustar".

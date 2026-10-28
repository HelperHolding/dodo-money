# Compromisos recurrentes — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar de alta por sucursal la renta, fumigación, basura y trampas de grasa como reglas recurrentes que salen como *previstos* en el calendario de pagos, se ligan a su factura y registran si el servicio se hizo.

**Architecture:** La regla vive en `compromisos`; las fechas futuras las calcula la función SQL `fechas_compromiso` (única fuente de la regla) y solo se guarda una fila en `compromiso_fechas` cuando alguien actúa sobre esa fecha. `compromisos_en_rango` junta ambas cosas para las pantallas. La app (Next.js, server actions) agrega Compras → Pagos → Compromisos fijos y pinta los previstos en `CalendarioPagos`.

**Tech Stack:** Next.js 15 (App Router, server actions), Supabase/Postgres (RLS + funciones `security definer`), TypeScript, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-28-compromisos-recurrentes-design.md`

## Global Constraints

- Todo en una rama (`feat/compromisos-recurrentes`) y por PR a `main` en `HelperHolding/dodo-money`; nunca commit ni push directo a `main`, sin commits vacíos, sin `--no-verify` (AGENTS.md).
- La migración y su prueba SQL las corre Sebastián en el SQL Editor de Supabase; no se fusiona el PR antes de su "PRUEBAS OK".
- Migración: `supabase/migrations/20261028180000_compromisos_recurrentes.sql`. Prueba: `supabase/pruebas/20261028180000_compromisos_recurrentes.sql` (termina con `raise exception 'PRUEBAS OK'` para revertir).
- Funciones SQL: `language plpgsql security definer set search_path=''`, todo con prefijo `public.`, escritura solo vía funciones que llaman `public.exigir_admin_compras()`. Lectura: RLS `public.ve_compras()`.
- Las funciones con prefijo `ligar_` no pueden tener `UPDATE`/`DELETE` sin `WHERE` (lo revisa `lib/dodois/migraciones.test.ts`).
- En `lib/` los imports de valores entre módulos no llevan extensión `.ts` y las pruebas sí (`./x.ts`); por eso `lib/compras/compromisos.ts` solo importa **tipos**.
- Textos de UI en español de México; pantallas con **tarjetas**, nada de tablas anchas.
- Conceptos exactos: `renta`, `fumigacion`, `basura`, `trampas_grasa`, `otro`. Frecuencia: `unidad` `mes` (con `dia_mes` 1–31) o `semana`, `cada` 1–12.
- Fechas `YYYY-MM-DD`; "hoy" con `hoyCalendarioMX()` en la app y `public.hoy_mx()` en SQL.
- Cada prueba nueva de Node se agrega al script `test` de `package.json` (la lista es explícita).

## Review Focus

1. **Día 29–31 en meses cortos** — "renta el 31" debe caer el 28/29 de febrero y el 30 de abril, nunca saltarse el mes. (Prueba SQL en Task 1 y de texto en Task 4.)
2. **Factura sustituida** — un gasto sin CFDI ligado que después se sustituye por el CFDI debe seguir ligado (al CFDI), no volver a "previsto" ni contarse doble. (Trigger y prueba en Task 2.)
3. **Factura cancelada** — una fecha ligada a una factura cancelada vuelve a ser *previsto*/*vencido*, no "pagada". (Prueba Node en Task 4.)
4. **Filtro de sucursal "oficina" y de proveedor en Pagos** — los previstos respetan los mismos filtros que las facturas; con "oficina" no sale ningún previsto. (Prueba Node en Task 4 de `filtrarPrevistos`.)
5. **Fin del compromiso antes de fechas ya trabajadas** — poner `fin` antes de una fecha con factura/servicio se rechaza en lugar de dejar huérfanos. (Prueba SQL en Task 1.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261028180000_compromisos_recurrentes.sql` | Tablas, RLS, regla de fechas, alta/edición, acciones por fecha, trigger de sustitución, evidencias |
| `supabase/pruebas/20261028180000_compromisos_recurrentes.sql` | Prueba SQL que corre Sebastián |
| `lib/compras/compromisos.ts` (+ `.test.ts`) | Lógica pura: textos, estados, avisos, previstos, lectura del formulario |
| `lib/compras/diasPago.ts` | Exporta `sumarDias` (ya existe, hoy privado) |
| `app/compras/pagos/compromisos/acciones.ts` | Server actions |
| `app/compras/pagos/compromisos/datos.ts` | Lecturas compartidas por las páginas |
| `app/compras/pagos/compromisos/FormCompromiso.tsx` | Formulario cliente de alta/edición |
| `app/compras/pagos/compromisos/page.tsx` | Lista por sucursal |
| `app/compras/pagos/compromisos/nuevo/page.tsx`, `[id]/editar/page.tsx` | Alta y edición |
| `app/compras/pagos/compromisos/[id]/page.tsx` | Detalle con fechas y acciones |
| `app/compras/pagos/compromisos/[id]/FechaCompromiso.tsx` | Tarjeta de una fecha |
| `app/compras/pagos/compromisos/evidencia/[id]/route.ts` | Descarga de evidencia |
| `app/compras/pagos/CalendarioPagos.tsx`, `page.tsx` | Previstos y avisos en Pagos |
| `app/compras/facturas/nueva/page.tsx`, `FormGastoManual.tsx`, `app/compras/facturas/acciones.ts` | Gasto sin CFDI desde un compromiso |
| `lib/migas.ts` (+ test) | Migas de las páginas nuevas |

---

### Task 1: Tablas, regla de fechas y alta/edición (SQL)

**Files:**
- Create: `supabase/migrations/20261028180000_compromisos_recurrentes.sql`
- Create: `supabase/pruebas/20261028180000_compromisos_recurrentes.sql`

**Interfaces:**
- Produces: tablas `public.compromisos`, `public.compromiso_fechas`, `public.compromiso_historial`; funciones `public.fechas_compromiso(p_compromiso uuid,p_desde date,p_hasta date) returns setof date`, `public.compromisos_en_rango(p_desde date,p_hasta date) returns table(compromiso_id uuid,vence date,fecha_id uuid,factura_id uuid,factura_estado text,factura_saldo numeric,omitida_motivo text,servicio text,servicio_fecha date,servicio_nota text,revision integer)`, `public.guardar_compromiso(p_id uuid,p_revision integer,p_datos jsonb) returns uuid`.
- `compromiso_fechas.revision` empieza en **0**; una fecha sin fila se reporta con revisión 0. Las acciones reciben la revisión que vio la pantalla.

- [ ] **Step 1: Escribir la prueba SQL (falla: aún no hay funciones)**

`supabase/pruebas/20261028180000_compromisos_recurrentes.sql`:

```sql
-- Ejecutar completo después de 20261028180000_compromisos_recurrentes.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;f record;otra uuid;c uuid;c2 uuid;c3 uuid;fechas date[];ok boolean;n integer;
begin
  select id into a from public.perfiles where activo and rol::text='admin' limit 1;
  select id,proveedor_id,sucursal_id into f from public.facturas x where tipo='ingreso' and estado<>'cancelada' and sucursal_id is not null limit 1;
  select id into otra from public.facturas where tipo='ingreso' and estado<>'cancelada' and proveedor_id<>f.proveedor_id limit 1;
  if a is null or f.id is null or otra is null then raise exception 'FALTAN DATOS: admin y dos facturas vigentes de proveedores distintos.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 1. Mensual el día 31: cae en el último día de los meses cortos (febrero bisiesto incluido).
  c:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','45000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','31','inicio','2027-01-31','fin','','requiere_servicio','false'));
  select array_agg(d order by d) into fechas from public.fechas_compromiso(c,'2027-01-01','2027-04-30') d;
  if fechas is distinct from array['2027-01-31','2027-02-28','2027-03-31','2027-04-30']::date[] then raise exception 'FALLÓ: día 31 mensual %',fechas;end if;
  select array_agg(d order by d) into fechas from public.fechas_compromiso(c,'2028-02-01','2028-02-29') d;
  if fechas is distinct from array['2028-02-29']::date[] then raise exception 'FALLÓ: febrero bisiesto %',fechas;end if;
  if exists(select 1 from public.fechas_compromiso(c,'2026-01-01','2027-01-30')) then raise exception 'FALLÓ: fechas antes del inicio';end if;

  -- 2. Cada 2 meses el día 15 desde el 20 de enero: el 15 de enero ya pasó, empieza en marzo.
  c2:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','fumigacion','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','1200.50','forma_pago','efectivo','unidad','mes','cada','2','dia_mes','15','inicio','2027-01-20','fin','','requiere_servicio','true'));
  select array_agg(d order by d) into fechas from public.fechas_compromiso(c2,'2027-01-01','2027-06-30') d;
  if fechas is distinct from array['2027-03-15','2027-05-15']::date[] then raise exception 'FALLÓ: cada 2 meses %',fechas;end if;

  -- 3. Cada 2 semanas con fecha de fin.
  c3:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','trampas_grasa','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','800','forma_pago','transferencia','unidad','semana','cada','2','dia_mes','','inicio','2027-01-05','fin','2027-02-10','requiere_servicio','true'));
  select array_agg(d order by d) into fechas from public.fechas_compromiso(c3,'2027-01-01','2027-12-31') d;
  if fechas is distinct from array['2027-01-05','2027-01-19','2027-02-02']::date[] then raise exception 'FALLÓ: cada 2 semanas %',fechas;end if;

  -- 4. "Otro" sin descripción: rechazado.
  begin perform public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','otro','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','10','forma_pago','efectivo','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: otro sin descripción';end if;

  -- 5. Editar monto: sube la revisión. Revisión vieja: rechazada.
  perform public.guardar_compromiso(c,1,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','47000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','31','inicio','2027-01-31','fin','','requiere_servicio','false'));
  if (select revision from public.compromisos where id=c)<>2 or (select monto_estimado from public.compromisos where id=c)<>47000 then raise exception 'FALLÓ: edición de monto';end if;
  begin perform public.guardar_compromiso(c,1,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','48000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','31','inicio','2027-01-31','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: revisión vieja aceptada';end if;

  -- 6. Cambiar la frecuencia de un compromiso existente: rechazado.
  begin perform public.guardar_compromiso(c,2,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','47000','forma_pago','transferencia','unidad','mes','cada','2','dia_mes','31','inicio','2027-01-31','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cambio de frecuencia aceptado';end if;

  -- 7. compromisos_en_rango: fechas calculadas sin filas guardadas, revisión 0.
  select count(*) into n from public.compromisos_en_rango('2027-01-01','2027-02-28') r where r.compromiso_id=c and r.fecha_id is null and r.revision=0 and r.servicio='pendiente';
  if n<>2 then raise exception 'FALLÓ: compromisos_en_rango devolvió % fechas',n;end if;
  begin perform public.compromisos_en_rango('2027-01-01','2030-01-01');ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: rango demasiado largo aceptado';end if;

  -- (Task 2 y Task 3 agregan sus bloques aquí, antes de PRUEBAS OK.)

  raise exception 'PRUEBAS OK';
end $$;
```

- [ ] **Step 2: Escribir la migración (tablas + funciones de Task 1)**

`supabase/migrations/20261028180000_compromisos_recurrentes.sql`:

```sql
-- Compromisos recurrentes por sucursal (renta, fumigación, basura, trampas de grasa): previstos en el calendario de
-- pagos, ligados a su factura y con comprobación del servicio. Las fechas futuras se calculan de la regla
-- (fechas_compromiso); solo se guarda una fecha cuando alguien actúa sobre ella.
begin;
create table public.compromisos (
 id uuid primary key default gen_random_uuid(),
 sucursal_id uuid not null references public.sucursales(id),
 concepto text not null check(concepto in ('renta','fumigacion','basura','trampas_grasa','otro')),
 descripcion text check(length(descripcion)<=300),
 proveedor_id uuid not null references public.proveedores(id),
 monto_estimado numeric(16,2) not null check(monto_estimado>0 and monto_estimado<1e12),
 forma_pago public.forma_pago not null,
 unidad text not null check(unidad in ('mes','semana')),
 cada smallint not null check(cada between 1 and 12),
 dia_mes smallint check(dia_mes between 1 and 31),
 inicio date not null, fin date,
 requiere_servicio boolean not null,
 revision integer not null default 1,
 creado_por uuid not null default auth.uid() references public.perfiles(id),
 creado_en timestamptz not null default now(),
 check((unidad='mes')=(dia_mes is not null)),
 check(fin is null or fin>=inicio),
 check(concepto<>'otro' or length(trim(coalesce(descripcion,'')))>=3)
);
create index compromisos_sucursal on public.compromisos(sucursal_id);
create table public.compromiso_fechas (
 id uuid primary key default gen_random_uuid(),
 compromiso_id uuid not null references public.compromisos(id),
 vence date not null,
 factura_id uuid unique references public.facturas(id),
 omitida_motivo text check(omitida_motivo is null or length(trim(omitida_motivo)) between 5 and 1000),
 servicio text not null default 'pendiente' check(servicio in ('pendiente','realizado','no_realizado')),
 servicio_fecha date,
 servicio_nota text check(servicio_nota is null or length(trim(servicio_nota)) between 5 and 2000),
 revision integer not null default 0,
 unique(compromiso_id,vence),
 check(factura_id is null or omitida_motivo is null),
 check(servicio='pendiente' or servicio_nota is not null),
 check(servicio<>'realizado' or servicio_fecha is not null)
);
create table public.compromiso_historial (
 id bigint generated always as identity primary key,
 compromiso_id uuid not null references public.compromisos(id),
 evento text not null, anterior jsonb not null, nuevo jsonb not null,
 usuario_id uuid not null references public.perfiles(id), fecha timestamptz not null default now()
);
create index compromiso_historial_compromiso on public.compromiso_historial(compromiso_id,fecha);
alter table public.compromisos enable row level security;
alter table public.compromiso_fechas enable row level security;
alter table public.compromiso_historial enable row level security;
create policy ver_compromisos on public.compromisos for select using(public.ve_compras());
create policy ver_compromiso_fechas on public.compromiso_fechas for select using(public.ve_compras());
create policy ver_compromiso_historial on public.compromiso_historial for select using(public.ve_compras());
revoke all on public.compromisos,public.compromiso_fechas,public.compromiso_historial from public,anon,authenticated;
grant select on public.compromisos,public.compromiso_fechas,public.compromiso_historial to authenticated;

-- Única fuente de la regla. Mensual: el día dia_mes de cada `cada` meses desde el mes de inicio (si el mes es más
-- corto, su último día); se omiten las fechas antes del inicio. Semanal: cada `cada` semanas desde el inicio.
create function public.fechas_compromiso(p_compromiso uuid,p_desde date,p_hasta date) returns setof date
language sql stable set search_path='' as $$
 select v.vence from public.compromisos c
 cross join lateral generate_series(0,greatest(0,case when c.unidad='mes'
   then ((extract(year from p_hasta)-extract(year from c.inicio))*12+extract(month from p_hasta)-extract(month from c.inicio))::int/c.cada
   else (p_hasta-c.inicio)/(7*c.cada) end)) k
 cross join lateral (select case when c.unidad='mes' then
   (date_trunc('month',c.inicio::timestamp)+make_interval(months=>(k*c.cada)::int))::date
   +(least(c.dia_mes::int,extract(day from date_trunc('month',c.inicio::timestamp)+make_interval(months=>(k*c.cada)::int)+interval '1 month - 1 day')::int)-1)
  else c.inicio+(k*7*c.cada)::int end as vence) v
 where c.id=p_compromiso and v.vence>=c.inicio and (c.fin is null or v.vence<=c.fin) and v.vence between p_desde and p_hasta
 order by v.vence
$$;

-- Lo que leen las pantallas: cada fecha calculada con lo guardado de ella (factura, omisión, servicio).
create function public.compromisos_en_rango(p_desde date,p_hasta date)
returns table(compromiso_id uuid,vence date,fecha_id uuid,factura_id uuid,factura_estado text,factura_saldo numeric,omitida_motivo text,servicio text,servicio_fecha date,servicio_nota text,revision integer)
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
begin
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>800 then raise exception 'Rango de fechas inválido.';end if;
 return query
 select c.id,v.d,f.id,f.factura_id,fs.estado::text,fs.saldo,f.omitida_motivo,coalesce(f.servicio,'pendiente'),f.servicio_fecha,f.servicio_nota,coalesce(f.revision,0)
 from public.compromisos c
 cross join lateral public.fechas_compromiso(c.id,p_desde,p_hasta) v(d)
 left join public.compromiso_fechas f on f.compromiso_id=c.id and f.vence=v.d
 left join public.facturas_saldo fs on fs.id=f.factura_id
 order by v.d,c.id;
end $$;

create function public.guardar_compromiso(p_id uuid,p_revision integer,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.compromisos;n public.compromisos;v_fin date;
begin
 perform public.exigir_admin_compras();
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('sucursal_id','concepto','descripcion','proveedor_id','monto_estimado','forma_pago','unidad','cada','dia_mes','inicio','fin','requiere_servicio')) then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>1000) then raise exception 'Texto demasiado largo.';end if;
 v_fin:=nullif(p_datos->>'fin','')::date;
 if p_id is null then
  insert into public.compromisos(sucursal_id,concepto,descripcion,proveedor_id,monto_estimado,forma_pago,unidad,cada,dia_mes,inicio,fin,requiere_servicio)
  values((p_datos->>'sucursal_id')::uuid,p_datos->>'concepto',nullif(trim(p_datos->>'descripcion'),''),(p_datos->>'proveedor_id')::uuid,(p_datos->>'monto_estimado')::numeric,
   (p_datos->>'forma_pago')::public.forma_pago,p_datos->>'unidad',(p_datos->>'cada')::smallint,nullif(p_datos->>'dia_mes','')::smallint,(p_datos->>'inicio')::date,v_fin,
   coalesce((p_datos->>'requiere_servicio')::boolean,false)) returning * into n;
 else
  select * into a from public.compromisos where id=p_id for update;
  if not found then raise exception 'Compromiso inexistente.';end if;
  if a.revision is distinct from p_revision then raise exception 'El compromiso cambió. Recarga antes de guardar.';end if;
  if (p_datos->>'sucursal_id')::uuid is distinct from a.sucursal_id or p_datos->>'concepto' is distinct from a.concepto or p_datos->>'unidad' is distinct from a.unidad
   or (p_datos->>'cada')::smallint is distinct from a.cada or nullif(p_datos->>'dia_mes','')::smallint is distinct from a.dia_mes or (p_datos->>'inicio')::date is distinct from a.inicio then
   raise exception 'Sucursal, concepto, frecuencia, día e inicio no cambian. Ponle fin a este compromiso y crea otro.';
  end if;
  if v_fin is not null and exists(select 1 from public.compromiso_fechas where compromiso_id=p_id and vence>v_fin) then raise exception 'Hay fechas con factura, servicio u omisión después del fin.';end if;
  update public.compromisos set descripcion=nullif(trim(p_datos->>'descripcion'),''),proveedor_id=(p_datos->>'proveedor_id')::uuid,monto_estimado=(p_datos->>'monto_estimado')::numeric,
   forma_pago=(p_datos->>'forma_pago')::public.forma_pago,fin=v_fin,requiere_servicio=coalesce((p_datos->>'requiere_servicio')::boolean,false),revision=revision+1
   where id=p_id returning * into n;
 end if;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(n.id,case when p_id is null then 'Alta' else 'Actualización' end,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
 return n.id;
end $$;

revoke all on function public.fechas_compromiso(uuid,date,date),public.compromisos_en_rango(date,date),public.guardar_compromiso(uuid,integer,jsonb) from public,anon;
grant execute on function public.fechas_compromiso(uuid,date,date),public.compromisos_en_rango(date,date),public.guardar_compromiso(uuid,integer,jsonb) to authenticated;
commit;
```

- [ ] **Step 3: Revisión estática**

No hay Postgres local: revisar a mano que cada caso de la prueba SQL salga de la función como está escrita (en particular `fechas_compromiso` con `inicio=2027-01-20`, `dia_mes=15`, `cada=2`: k=0 → 15-ene < inicio, se omite; k=1 → 15-mar; k=2 → 15-may). Verificar que todo lleva `public.` y que no queda ningún `UPDATE` sin `WHERE`. `date_trunc` recibe `inicio::timestamp` (sin zona horaria) para que el cálculo no dependa de la zona de la sesión.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261028180000_compromisos_recurrentes.sql supabase/pruebas/20261028180000_compromisos_recurrentes.sql
git commit -m "feat(compras): tablas y regla de compromisos recurrentes"
```

---

### Task 2: Acciones por fecha y sustitución de gastos (SQL)

**Files:**
- Modify: `supabase/migrations/20261028180000_compromisos_recurrentes.sql` (antes del `commit;` final)
- Modify: `supabase/pruebas/20261028180000_compromisos_recurrentes.sql` (antes de `raise exception 'PRUEBAS OK'`)

**Interfaces:**
- Consumes: tablas y `fechas_compromiso` de Task 1.
- Produces: `public.ligar_factura_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_factura uuid) returns void` (`p_factura` null = quitar), `public.comprobar_servicio_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_estado text,p_fecha date,p_nota text) returns void`, `public.omitir_fecha_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_motivo text) returns void` (`p_motivo` vacío = quitar omisión). Interna: `public.fila_fecha_compromiso(p_compromiso uuid,p_vence date) returns public.compromiso_fechas`.

- [ ] **Step 1: Agregar los casos a la prueba SQL** (antes de `raise exception 'PRUEBAS OK'`)

```sql
  -- 8. Ligar la factura del mismo proveedor y sucursal: crea la fila con revisión 1.
  perform public.ligar_factura_compromiso(c,'2027-01-31',0,f.id);
  if not exists(select 1 from public.compromiso_fechas where compromiso_id=c and vence='2027-01-31' and factura_id=f.id and revision=1) then raise exception 'FALLÓ: ligar factura';end if;
  -- 9. Factura de otro proveedor: rechazada.
  begin perform public.ligar_factura_compromiso(c,'2027-02-28',0,otra);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: factura de otro proveedor aceptada';end if;
  -- 10. La misma factura en otra fecha: rechazada.
  begin perform public.ligar_factura_compromiso(c,'2027-02-28',0,f.id);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: factura ligada dos veces';end if;
  -- 11. Fecha que no sale de la regla: rechazada.
  begin perform public.ligar_factura_compromiso(c,'2027-02-15',0,f.id);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: fecha fuera de la regla aceptada';end if;
  -- 12. Revisión vieja: rechazada.
  begin perform public.ligar_factura_compromiso(c,'2027-01-31',0,null);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: revisión vieja de fecha aceptada';end if;
  -- 13. Omitir una fecha con factura: rechazado. Omitir otra con motivo: queda.
  begin perform public.omitir_fecha_compromiso(c,'2027-01-31',1,'Mes de gracia');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: omitir fecha con factura';end if;
  perform public.omitir_fecha_compromiso(c,'2027-02-28',0,'Mes de gracia por remodelación');
  if not exists(select 1 from public.compromiso_fechas where compromiso_id=c and vence='2027-02-28' and omitida_motivo is not null) then raise exception 'FALLÓ: omitir fecha';end if;
  -- 14. Poner fin antes de una fecha trabajada: rechazado.
  begin perform public.guardar_compromiso(c,2,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','47000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','31','inicio','2027-01-31','fin','2027-02-01','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: fin antes de una fecha trabajada';end if;
  -- 15. Servicio: no aplica a la renta; en fumigación pide nota y no acepta fecha futura.
  begin perform public.comprobar_servicio_compromiso(c,'2027-03-31',0,'realizado',public.hoy_mx(),'Se pagó la renta');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: servicio en compromiso sin servicio';end if;
  begin perform public.comprobar_servicio_compromiso(c2,'2027-03-15',0,'realizado',public.hoy_mx()+1,'Fumigación general');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: servicio en fecha futura';end if;
  begin perform public.comprobar_servicio_compromiso(c2,'2027-03-15',0,'realizado',public.hoy_mx(),'');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: servicio sin nota';end if;
  perform public.comprobar_servicio_compromiso(c2,'2027-03-15',0,'realizado',public.hoy_mx(),'Fumigación general, cocina y bodega');
  if not exists(select 1 from public.compromiso_fechas where compromiso_id=c2 and vence='2027-03-15' and servicio='realizado') then raise exception 'FALLÓ: comprobar servicio';end if;
  -- 16. Sustitución: si el gasto ligado se sustituye, la liga pasa a la factura que lo sustituye.
  update public.facturas set estado='cancelada',sustituido_por=otra where id=f.id;
  if not exists(select 1 from public.compromiso_fechas where compromiso_id=c and vence='2027-01-31' and factura_id=otra) then raise exception 'FALLÓ: la liga no siguió la sustitución';end if;
  -- 17. Sin permiso de Compras: rechazado.
  select id into a from public.perfiles where activo and rol::text not in ('admin') limit 1;
  if a is not null then
    perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
    begin perform public.omitir_fecha_compromiso(c,'2027-03-31',0,'Sin permiso de compras');ok:=true;exception when others then ok:=false;end;
    if ok then raise exception 'FALLÓ: usuario sin Compras pudo omitir';end if;
  end if;
```

- [ ] **Step 2: Agregar las funciones a la migración** (antes del `commit;` final)

```sql
-- Fila de una fecha (la crea si aún no existe), bloqueada. Rechaza fechas que no salen de la regla.
create function public.fila_fecha_compromiso(p_compromiso uuid,p_vence date) returns public.compromiso_fechas
language plpgsql security definer set search_path='' as $$
declare r public.compromiso_fechas;
begin
 if not exists(select 1 from public.fechas_compromiso(p_compromiso,p_vence,p_vence)) then raise exception 'Esa fecha no corresponde al compromiso.';end if;
 insert into public.compromiso_fechas(compromiso_id,vence) values(p_compromiso,p_vence) on conflict(compromiso_id,vence) do nothing;
 select * into r from public.compromiso_fechas where compromiso_id=p_compromiso and vence=p_vence for update;
 return r;
end $$;

create function public.ligar_factura_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_factura uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.compromisos;r public.compromiso_fechas;n public.compromiso_fechas;f public.facturas;
begin
 perform public.exigir_admin_compras();
 select * into c from public.compromisos where id=p_compromiso for update;
 if not found then raise exception 'Compromiso inexistente.';end if;
 r:=public.fila_fecha_compromiso(p_compromiso,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if p_factura is not null then
  if r.omitida_motivo is not null then raise exception 'La fecha está omitida. Quita la omisión antes de ligar la factura.';end if;
  select * into f from public.facturas where id=p_factura for update;
  if not found or f.tipo<>'ingreso' or f.estado='cancelada' then raise exception 'Elige una factura vigente.';end if;
  if f.proveedor_id<>c.proveedor_id or f.sucursal_id is distinct from c.sucursal_id then raise exception 'La factura debe ser del mismo proveedor y sucursal del compromiso.';end if;
  if exists(select 1 from public.compromiso_fechas where factura_id=p_factura and id<>r.id) then raise exception 'Esa factura ya está ligada a otra fecha.';end if;
 end if;
 update public.compromiso_fechas set factura_id=p_factura,revision=revision+1 where id=r.id returning * into n;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(p_compromiso,case when p_factura is null then 'Factura quitada' else 'Factura ligada' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create function public.comprobar_servicio_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_estado text,p_fecha date,p_nota text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.compromisos;r public.compromiso_fechas;n public.compromiso_fechas;
begin
 perform public.exigir_admin_compras();
 select * into c from public.compromisos where id=p_compromiso for update;
 if not found then raise exception 'Compromiso inexistente.';end if;
 if not c.requiere_servicio then raise exception 'Este compromiso no lleva comprobación de servicio.';end if;
 if p_estado is null or p_estado not in ('pendiente','realizado','no_realizado') then raise exception 'Estado de servicio inválido.';end if;
 if p_estado='realizado' and (p_fecha is null or p_fecha>public.hoy_mx()) then raise exception 'Indica cuándo se hizo el servicio; no puede ser una fecha futura.';end if;
 if p_estado<>'pendiente' and length(trim(coalesce(p_nota,'')))<5 then raise exception 'Escribe qué se hizo o por qué no se hizo (al menos 5 letras).';end if;
 r:=public.fila_fecha_compromiso(p_compromiso,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if r.omitida_motivo is not null then raise exception 'La fecha está omitida.';end if;
 update public.compromiso_fechas set servicio=p_estado,servicio_fecha=case when p_estado='realizado' then p_fecha end,
  servicio_nota=case when p_estado='pendiente' then null else trim(p_nota) end,revision=revision+1 where id=r.id returning * into n;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(p_compromiso,'Servicio',to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create function public.omitir_fecha_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.compromiso_fechas;n public.compromiso_fechas;
begin
 perform public.exigir_admin_compras();
 if not exists(select 1 from public.compromisos where id=p_compromiso) then raise exception 'Compromiso inexistente.';end if;
 if nullif(trim(coalesce(p_motivo,'')),'') is not null and length(trim(p_motivo))<5 then raise exception 'Escribe el motivo (al menos 5 letras).';end if;
 r:=public.fila_fecha_compromiso(p_compromiso,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if r.factura_id is not null then raise exception 'La fecha ya tiene factura. Quítala antes de omitirla.';end if;
 update public.compromiso_fechas set omitida_motivo=nullif(trim(coalesce(p_motivo,'')),''),revision=revision+1 where id=r.id returning * into n;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(p_compromiso,case when n.omitida_motivo is null then 'Omisión quitada' else 'Fecha omitida' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

-- Cuando un gasto sin CFDI ligado se sustituye por su CFDI, la liga pasa al CFDI (si el CFDI no está ligado ya).
create function public.compromiso_sigue_sustitucion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.compromiso_fechas set factura_id=new.sustituido_por,revision=revision+1
  where factura_id=new.id and not exists(select 1 from public.compromiso_fechas x where x.factura_id=new.sustituido_por);
 return new;
end $$;
create trigger compromiso_sustitucion after update of sustituido_por on public.facturas
 for each row when (new.sustituido_por is not null and old.sustituido_por is distinct from new.sustituido_por)
 execute function public.compromiso_sigue_sustitucion();

revoke all on function public.fila_fecha_compromiso(uuid,date),public.compromiso_sigue_sustitucion() from public,anon,authenticated;
revoke all on function public.ligar_factura_compromiso(uuid,date,integer,uuid),public.comprobar_servicio_compromiso(uuid,date,integer,text,date,text),public.omitir_fecha_compromiso(uuid,date,integer,text) from public,anon;
grant execute on function public.ligar_factura_compromiso(uuid,date,integer,uuid),public.comprobar_servicio_compromiso(uuid,date,integer,text,date,text),public.omitir_fecha_compromiso(uuid,date,integer,text) to authenticated;
```

- [ ] **Step 3: Correr la prueba que revisa `ligar_` sin WHERE**

Run: `node --experimental-strip-types --test lib/dodois/migraciones.test.ts`
Expected: PASS (la nueva `ligar_factura_compromiso` solo tiene `UPDATE ... where id=r.id`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261028180000_compromisos_recurrentes.sql supabase/pruebas/20261028180000_compromisos_recurrentes.sql
git commit -m "feat(compras): ligar factura, comprobar servicio y omitir fechas de compromisos"
```

---

### Task 3: Evidencia del servicio (SQL)

Nota de diseño: el spec proponía reutilizar `compra_adjuntos`, pero esa tabla exige un solo dueño entre orden y factura y su confirmación escribe en `compra_notas` con esos dueños. Una tabla propia, con el mismo patrón de preparar → subir → confirmar, evita tocar ese flujo. El bucket `adjuntos-compras` sí se reutiliza.

**Files:**
- Modify: migración y prueba SQL (mismos lugares que Task 2)

**Interfaces:**
- Produces: tabla `public.compromiso_evidencias(id, fecha_id, nombre, ruta, mime, bytes, sha256, usuario_id, creado_en, confirmado_en)`; `public.preparar_evidencia_compromiso(p_id uuid,p_compromiso uuid,p_vence date,p_nombre text,p_extension text,p_mime text,p_bytes integer,p_sha256 text) returns jsonb` → `{ruta, disponible}`; `public.confirmar_evidencia_compromiso(p_id uuid) returns void`. Ruta: `compromiso/<fecha_id>/<id>.<ext>`. Formatos: pdf, jpg, png, webp.

- [ ] **Step 1: Agregar casos a la prueba SQL** (antes de `raise exception 'PRUEBAS OK'`, y **antes** del caso 17 que cambia de usuario: colócalo después del caso 15)

```sql
  -- 15b. Evidencia: formato que no coincide, rechazado; confirmar sin archivo subido, rechazado.
  begin perform public.preparar_evidencia_compromiso(gen_random_uuid(),c2,'2027-03-15','foto.jpg','jpg','application/pdf',1000,repeat('a',64));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: evidencia con formato que no coincide';end if;
  declare e uuid:=gen_random_uuid();j jsonb;
  begin
    j:=public.preparar_evidencia_compromiso(e,c2,'2027-03-15','foto.jpg','jpg','image/jpeg',1000,repeat('a',64));
    if j->>'ruta' not like 'compromiso/%/'||e::text||'.jpg' or (j->>'disponible')::boolean then raise exception 'FALLÓ: ruta de evidencia %',j;end if;
    begin perform public.confirmar_evidencia_compromiso(e);ok:=true;exception when others then ok:=false;end;
    if ok then raise exception 'FALLÓ: evidencia confirmada sin archivo';end if;
  end;
```

- [ ] **Step 2: Agregar a la migración** (antes del `commit;` final)

```sql
create table public.compromiso_evidencias (
 id uuid primary key, fecha_id uuid not null references public.compromiso_fechas(id),
 nombre text not null check(length(nombre) between 1 and 200), ruta text not null unique,
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes between 1 and 4194304), sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 usuario_id uuid not null references public.perfiles(id), creado_en timestamptz not null default now(), confirmado_en timestamptz
);
create index compromiso_evidencias_fecha on public.compromiso_evidencias(fecha_id,creado_en);
alter table public.compromiso_evidencias enable row level security;
revoke all on public.compromiso_evidencias from public,anon,authenticated;
grant select on public.compromiso_evidencias to authenticated;
create policy ver_compromiso_evidencias on public.compromiso_evidencias for select to authenticated using(public.ve_compras() and (confirmado_en is not null or usuario_id=auth.uid() and public.edita_compras()));
create policy compromiso_evidencias_lectura on storage.objects for select to authenticated using(bucket_id='adjuntos-compras' and public.ve_compras() and exists(select 1 from public.compromiso_evidencias e where e.ruta=name));
create policy compromiso_evidencias_subir on storage.objects for insert to authenticated with check(bucket_id='adjuntos-compras' and public.edita_compras() and exists(select 1 from public.compromiso_evidencias e where e.ruta=name and e.usuario_id=auth.uid() and e.confirmado_en is null and e.creado_en>now()-interval '1 day'));

create function public.preparar_evidencia_compromiso(p_id uuid,p_compromiso uuid,p_vence date,p_nombre text,p_extension text,p_mime text,p_bytes integer,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.compromiso_fechas;v public.compromiso_evidencias;ruta_nueva text;mime_esperado text;
begin
 perform public.exigir_admin_compras();
 if p_id is null or p_nombre is null or length(trim(p_nombre)) not between 1 and 200 or p_nombre~'[[:cntrl:]/\\]' or p_bytes is null or p_bytes not between 1 and 4194304 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' then raise exception 'Datos de archivo inválidos.';end if;
 mime_esperado:=case p_extension when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' end;
 if mime_esperado is null or p_mime is distinct from mime_esperado then raise exception 'La evidencia debe ser PDF o foto.';end if;
 if not exists(select 1 from public.compromisos where id=p_compromiso and requiere_servicio) then raise exception 'Este compromiso no lleva comprobación de servicio.';end if;
 r:=public.fila_fecha_compromiso(p_compromiso,p_vence);
 perform pg_advisory_xact_lock(hashtextextended('evidencia-compromiso:'||p_id::text,0));
 ruta_nueva:='compromiso/'||r.id::text||'/'||p_id::text||'.'||p_extension;
 select * into v from public.compromiso_evidencias where id=p_id;
 if found then
  if v.usuario_id<>auth.uid() or v.ruta<>ruta_nueva or v.sha256<>p_sha256 or v.bytes<>p_bytes then raise exception 'Esta solicitud ya corresponde a otro archivo.';end if;
 else
  insert into public.compromiso_evidencias(id,fecha_id,nombre,ruta,mime,bytes,sha256,usuario_id) values(p_id,r.id,trim(p_nombre),ruta_nueva,p_mime,p_bytes,p_sha256,auth.uid()) returning * into v;
 end if;
 return jsonb_build_object('ruta',v.ruta,'disponible',v.confirmado_en is not null);
end $$;

create function public.confirmar_evidencia_compromiso(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.compromiso_evidencias;
begin
 perform public.exigir_admin_compras();
 select * into v from public.compromiso_evidencias where id=p_id for update;
 if not found or v.usuario_id<>auth.uid() then raise exception 'Evidencia no encontrada.';end if;
 if v.confirmado_en is not null then return;end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='adjuntos-compras' and o.name=v.ruta and (o.metadata->>'size')::bigint=v.bytes and o.metadata->>'mimetype'=v.mime) then raise exception 'El archivo no está subido o no coincide con la reserva.';end if;
 update public.compromiso_evidencias set confirmado_en=now() where id=p_id;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id)
  select f.compromiso_id,'Evidencia','{}'::jsonb,jsonb_build_object('nombre',v.nombre,'fecha',f.vence),auth.uid() from public.compromiso_fechas f where f.id=v.fecha_id;
end $$;
revoke all on function public.preparar_evidencia_compromiso(uuid,uuid,date,text,text,text,integer,text),public.confirmar_evidencia_compromiso(uuid) from public,anon;
grant execute on function public.preparar_evidencia_compromiso(uuid,uuid,date,text,text,text,integer,text),public.confirmar_evidencia_compromiso(uuid) to authenticated;
```

- [ ] **Step 3: Revisión estática** — el `declare … begin … end;` anidado del caso 15b es válido dentro del `do $$`; todo con `public.`; `storage.objects` con prefijo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261028180000_compromisos_recurrentes.sql supabase/pruebas/20261028180000_compromisos_recurrentes.sql
git commit -m "feat(compras): evidencia del servicio de compromisos"
```

---

### Task 4: Lógica pura `lib/compras/compromisos.ts`

**Files:**
- Create: `lib/compras/compromisos.ts`, `lib/compras/compromisos.test.ts`
- Modify: `lib/compras/diasPago.ts:4` (exportar `sumarDias`), `package.json` (script `test`: agregar `lib/compras/compromisos.test.ts` después de `lib/compras/diasPago.test.ts`)

**Interfaces:**
- Produces (exactos):
  - `type Concepto`, `CONCEPTOS: Record<Concepto,string>`, `REQUIERE_SERVICIO: Record<Concepto,boolean>`
  - `type Compromiso`, `type FechaCompromiso` (columnas de `compromisos` y de `compromisos_en_rango`)
  - `type EstadoPago = "previsto"|"vencido"|"por_pagar"|"pagada"|"omitida"`, `ESTADO_PAGO: Record<EstadoPago,{texto:string;tono:string}>`
  - `textoFrecuencia(r:{unidad;cada;dia_mes;inicio}): string`
  - `tituloCompromiso(c:{concepto;descripcion}, sucursal:string): string`
  - `estadoPago(f:FechaCompromiso, hoy:string): EstadoPago`
  - `servicioSinComprobar(f:FechaCompromiso, requiere:boolean, hoy:string): boolean`
  - `avisosCompromisos(fechas, requiere:(id:string)=>boolean, hoy): {vencidosSinFactura:number; serviciosSinComprobar:number}`
  - `type Previsto = {compromisoId:string; vence:string; fechaPago:string; monto:number; titulo:string; vencido:boolean}`
  - `previstosPorDia(fechas, datos:ReadonlyMap<string,{monto:number;titulo:string}>, hoy, fechaDePago:(vence:string)=>string): Record<string,Previsto[]>`
  - `filtrarPrevistos<T extends {sucursal_id:string;proveedor_id:string}>(compromisos:T[], filtros:{sucursal:string;proveedor:string}): T[]`
  - `leerCompromiso(campo:(c:string)=>string): {datos:Record<string,string>} | {error:string}`

- [ ] **Step 1: Escribir las pruebas**

`lib/compras/compromisos.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisosCompromisos, estadoPago, filtrarPrevistos, leerCompromiso, previstosPorDia, servicioSinComprobar, textoFrecuencia, tituloCompromiso, type FechaCompromiso } from "./compromisos.ts";

const fecha = (x: Partial<FechaCompromiso> = {}): FechaCompromiso => ({
  compromiso_id: "c1", vence: "2026-11-01", fecha_id: null, factura_id: null, factura_estado: null, factura_saldo: null,
  omitida_motivo: null, servicio: "pendiente", servicio_fecha: null, servicio_nota: null, revision: 0, ...x,
});

test("texto de la frecuencia", () => {
  assert.equal(textoFrecuencia({ unidad: "mes", cada: 1, dia_mes: 1, inicio: "2026-11-01" }), "Cada mes, día 1");
  assert.equal(textoFrecuencia({ unidad: "mes", cada: 2, dia_mes: 31, inicio: "2026-11-01" }), "Cada 2 meses, día 31 (o el último del mes)");
  assert.equal(textoFrecuencia({ unidad: "semana", cada: 1, dia_mes: null, inicio: "2026-11-03" }), "Cada semana, los martes");
  assert.equal(textoFrecuencia({ unidad: "semana", cada: 2, dia_mes: null, inicio: "2026-11-07" }), "Cada 2 semanas, los sábados");
});

test("título: concepto o descripción de 'otro', con sucursal", () => {
  assert.equal(tituloCompromiso({ concepto: "renta", descripcion: null }, "Zapopan"), "Renta · Zapopan");
  assert.equal(tituloCompromiso({ concepto: "otro", descripcion: "Alarma" }, "Zapopan"), "Alarma · Zapopan");
});

test("estado del pago de una fecha", () => {
  assert.equal(estadoPago(fecha(), "2026-10-28"), "previsto");
  assert.equal(estadoPago(fecha({ vence: "2026-10-01" }), "2026-10-28"), "vencido");
  assert.equal(estadoPago(fecha({ factura_id: "f", factura_estado: "parcial" }), "2026-10-28"), "por_pagar");
  assert.equal(estadoPago(fecha({ factura_id: "f", factura_estado: "pagada" }), "2026-10-28"), "pagada");
  assert.equal(estadoPago(fecha({ omitida_motivo: "Mes de gracia" }), "2026-10-28"), "omitida");
  // Factura cancelada: la fecha vuelve a quedar sin factura.
  assert.equal(estadoPago(fecha({ vence: "2026-10-01", factura_id: "f", factura_estado: "cancelada" }), "2026-10-28"), "vencido");
});

test("servicio sin comprobar: solo si lo requiere, ya venció, no está omitida y sigue pendiente", () => {
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-10-01" }), true, "2026-10-28"), true);
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-10-01" }), false, "2026-10-28"), false);
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-11-01" }), true, "2026-10-28"), false);
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-10-01", servicio: "realizado" }), true, "2026-10-28"), false);
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-10-01", omitida_motivo: "x x x x x" }), true, "2026-10-28"), false);
});

test("avisos", () => {
  const fs = [fecha({ vence: "2026-10-01" }), fecha({ vence: "2026-10-05", compromiso_id: "c2" }), fecha({ vence: "2026-12-01" })];
  assert.deepEqual(avisosCompromisos(fs, (id) => id === "c2", "2026-10-28"), { vencidosSinFactura: 2, serviciosSinComprobar: 1 });
});

test("previstos por día de pago: sin factura vigente ni omisión", () => {
  const fs = [
    fecha({ vence: "2026-11-01" }),
    fecha({ vence: "2026-12-01", factura_id: "f", factura_estado: "por_pagar" }),
    fecha({ vence: "2027-01-01", omitida_motivo: "Mes de gracia" }),
    fecha({ vence: "2026-10-01" }),
  ];
  const datos = new Map([["c1", { monto: 45000, titulo: "Renta · Zapopan" }]]);
  const r = previstosPorDia(fs, datos, "2026-10-28", (v) => (v === "2026-11-01" ? "2026-10-30" : v));
  assert.deepEqual(Object.keys(r).sort(), ["2026-10-01", "2026-10-30"]);
  assert.deepEqual(r["2026-10-30"], [{ compromisoId: "c1", vence: "2026-11-01", fechaPago: "2026-10-30", monto: 45000, titulo: "Renta · Zapopan", vencido: false }]);
  assert.equal(r["2026-10-01"][0].vencido, true);
});

test("filtros de Pagos: sucursal, proveedor y oficina", () => {
  const cs = [{ id: "a", sucursal_id: "s1", proveedor_id: "p1" }, { id: "b", sucursal_id: "s2", proveedor_id: "p2" }];
  assert.deepEqual(filtrarPrevistos(cs, { sucursal: "", proveedor: "" }).map((c) => c.id), ["a", "b"]);
  assert.deepEqual(filtrarPrevistos(cs, { sucursal: "s2", proveedor: "" }).map((c) => c.id), ["b"]);
  assert.deepEqual(filtrarPrevistos(cs, { sucursal: "", proveedor: "p1" }).map((c) => c.id), ["a"]);
  assert.deepEqual(filtrarPrevistos(cs, { sucursal: "oficina", proveedor: "" }), []);
});

test("leer el formulario", () => {
  const base: Record<string, string> = { sucursal_id: "s1", concepto: "renta", descripcion: "", proveedor_id: "p1", monto_estimado: "$45,000.50", forma_pago: "transferencia", unidad: "mes", cada: "1", dia_mes: "31", inicio: "2026-11-30", fin: "", requiere_servicio: "" };
  const leer = (x: Record<string, string>) => leerCompromiso((c) => x[c] ?? "");
  assert.deepEqual(leer(base), { datos: { ...base, monto_estimado: "45000.50", requiere_servicio: "false" } });
  assert.deepEqual(leer({ ...base, unidad: "semana" }), { datos: { ...base, monto_estimado: "45000.50", unidad: "semana", dia_mes: "", requiere_servicio: "false" } });
  assert.equal((leer({ ...base, requiere_servicio: "si" }) as { datos: Record<string, string> }).datos.requiere_servicio, "true");
  assert.deepEqual(leer({ ...base, monto_estimado: "0" }), { error: "Escribe el monto estimado (mayor a cero)." });
  assert.deepEqual(leer({ ...base, concepto: "otro" }), { error: "Describe el compromiso (al menos 3 letras)." });
  assert.deepEqual(leer({ ...base, dia_mes: "32" }), { error: "El día del mes va del 1 al 31." });
  assert.deepEqual(leer({ ...base, cada: "13" }), { error: "La frecuencia va de 1 a 12." });
  assert.deepEqual(leer({ ...base, fin: "2026-11-01" }), { error: "El fin no puede ser antes del inicio." });
  assert.deepEqual(leer({ ...base, proveedor_id: "" }), { error: "Elige sucursal y proveedor." });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --experimental-strip-types --test lib/compras/compromisos.test.ts`
Expected: FAIL (`Cannot find module ... compromisos.ts`).

- [ ] **Step 3: Implementar**

En `lib/compras/diasPago.ts` cambia `const sumarDias =` por `export const sumarDias =`.

`lib/compras/compromisos.ts`:

```ts
/** Compromisos recurrentes por sucursal (renta, fumigación, basura, trampas de grasa). Fechas YYYY-MM-DD. */
import type { FormaPago } from "./proveedores";

export type Concepto = "renta" | "fumigacion" | "basura" | "trampas_grasa" | "otro";
export const CONCEPTOS: Record<Concepto, string> = { renta: "Renta", fumigacion: "Fumigación", basura: "Recolección de basura", trampas_grasa: "Limpieza de trampas de grasa", otro: "Otro" };
/** Valor inicial de la casilla en el formulario: los servicios se comprueban; la renta no. */
export const REQUIERE_SERVICIO: Record<Concepto, boolean> = { renta: false, fumigacion: true, basura: true, trampas_grasa: true, otro: false };

export type Compromiso = {
  id: string; sucursal_id: string; concepto: Concepto; descripcion: string | null; proveedor_id: string; monto_estimado: number;
  forma_pago: FormaPago; unidad: "mes" | "semana"; cada: number; dia_mes: number | null; inicio: string; fin: string | null;
  requiere_servicio: boolean; revision: number;
};
/** Una fila de `compromisos_en_rango`: la fecha calculada y lo guardado de ella. */
export type FechaCompromiso = {
  compromiso_id: string; vence: string; fecha_id: string | null; factura_id: string | null;
  factura_estado: "por_pagar" | "parcial" | "pagada" | "cancelada" | null; factura_saldo: number | null;
  omitida_motivo: string | null; servicio: "pendiente" | "realizado" | "no_realizado"; servicio_fecha: string | null;
  servicio_nota: string | null; revision: number;
};
export type EstadoPago = "previsto" | "vencido" | "por_pagar" | "pagada" | "omitida";
export const ESTADO_PAGO: Record<EstadoPago, { texto: string; tono: string }> = {
  previsto: { texto: "Previsto", tono: "info" }, vencido: { texto: "Vencido sin factura", tono: "peligro" },
  por_pagar: { texto: "Con factura por pagar", tono: "aviso" }, pagada: { texto: "Pagada", tono: "exito" }, omitida: { texto: "Omitida", tono: "gris" },
};
export const ESTADO_SERVICIO: Record<FechaCompromiso["servicio"], string> = { pendiente: "Servicio pendiente", realizado: "Servicio realizado", no_realizado: "Servicio no realizado" };

const LOS_DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

export function textoFrecuencia(r: { unidad: "mes" | "semana"; cada: number; dia_mes: number | null; inicio: string }): string {
  if (r.unidad === "mes") {
    const d = r.dia_mes ?? 1;
    return `${r.cada === 1 ? "Cada mes" : `Cada ${r.cada} meses`}, día ${d}${d > 28 ? " (o el último del mes)" : ""}`;
  }
  return `${r.cada === 1 ? "Cada semana" : `Cada ${r.cada} semanas`}, los ${LOS_DIAS[new Date(`${r.inicio}T00:00:00Z`).getUTCDay()]}`;
}

export const tituloCompromiso = (c: { concepto: Concepto; descripcion: string | null }, sucursal: string) =>
  `${c.concepto === "otro" && c.descripcion ? c.descripcion : CONCEPTOS[c.concepto]} · ${sucursal}`;

/** Una factura cancelada no cuenta: la fecha vuelve a estar sin factura. */
const conFactura = (f: FechaCompromiso) => !!f.factura_id && !!f.factura_estado && f.factura_estado !== "cancelada";

export function estadoPago(f: FechaCompromiso, hoy: string): EstadoPago {
  if (f.omitida_motivo) return "omitida";
  if (conFactura(f)) return f.factura_estado === "pagada" ? "pagada" : "por_pagar";
  return f.vence < hoy ? "vencido" : "previsto";
}

export const servicioSinComprobar = (f: FechaCompromiso, requiere: boolean, hoy: string) =>
  requiere && !f.omitida_motivo && f.servicio === "pendiente" && f.vence < hoy;

export function avisosCompromisos(fechas: readonly FechaCompromiso[], requiere: (id: string) => boolean, hoy: string) {
  return {
    vencidosSinFactura: fechas.filter((f) => estadoPago(f, hoy) === "vencido").length,
    serviciosSinComprobar: fechas.filter((f) => servicioSinComprobar(f, requiere(f.compromiso_id), hoy)).length,
  };
}

export type Previsto = { compromisoId: string; vence: string; fechaPago: string; monto: number; titulo: string; vencido: boolean };

/** Lo que aún no tiene factura vigente ni está omitido, agrupado por día de pago (igual que una factura). */
export function previstosPorDia(fechas: readonly FechaCompromiso[], datos: ReadonlyMap<string, { monto: number; titulo: string }>, hoy: string, fechaDePago: (vence: string) => string): Record<string, Previsto[]> {
  const r: Record<string, Previsto[]> = {};
  for (const f of fechas) {
    const estado = estadoPago(f, hoy), d = datos.get(f.compromiso_id);
    if (!d || (estado !== "previsto" && estado !== "vencido")) continue;
    const fechaPago = fechaDePago(f.vence);
    (r[fechaPago] ??= []).push({ compromisoId: f.compromiso_id, vence: f.vence, fechaPago, monto: d.monto, titulo: d.titulo, vencido: estado === "vencido" });
  }
  return r;
}

/** Mismos filtros que las facturas en Pagos. Un compromiso siempre es de una sucursal: "oficina" no muestra ninguno. */
export const filtrarPrevistos = <T extends { sucursal_id: string; proveedor_id: string }>(cs: T[], f: { sucursal: string; proveedor: string }) =>
  cs.filter((c) => (!f.sucursal || c.sucursal_id === f.sucursal) && (!f.proveedor || c.proveedor_id === f.proveedor));

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMAS = ["transferencia", "efectivo", "tarjeta", "cheque"];

/** Valida el formulario y arma `p_datos` de `guardar_compromiso`. */
export function leerCompromiso(campo: (c: string) => string): { datos: Record<string, string> } | { error: string } {
  const v = (c: string) => campo(c).trim();
  const concepto = v("concepto"), unidad = v("unidad"), monto = v("monto_estimado").replace(/[$,\s]/g, "");
  if (!v("sucursal_id") || !v("proveedor_id")) return { error: "Elige sucursal y proveedor." };
  if (!(concepto in CONCEPTOS)) return { error: "Elige el concepto." };
  if (concepto === "otro" && v("descripcion").length < 3) return { error: "Describe el compromiso (al menos 3 letras)." };
  if (!/^\d+(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0) return { error: "Escribe el monto estimado (mayor a cero)." };
  if (!FORMAS.includes(v("forma_pago"))) return { error: "Elige la forma de pago prevista." };
  if (unidad !== "mes" && unidad !== "semana") return { error: "Elige si se repite por meses o por semanas." };
  const cada = Number(v("cada"));
  if (!Number.isInteger(cada) || cada < 1 || cada > 12) return { error: "La frecuencia va de 1 a 12." };
  const dia = Number(v("dia_mes"));
  if (unidad === "mes" && (!Number.isInteger(dia) || dia < 1 || dia > 31)) return { error: "El día del mes va del 1 al 31." };
  if (!FECHA.test(v("inicio"))) return { error: "Indica la fecha de inicio." };
  if (v("fin") && (!FECHA.test(v("fin")) || v("fin") < v("inicio"))) return { error: "El fin no puede ser antes del inicio." };
  return { datos: {
    sucursal_id: v("sucursal_id"), concepto, descripcion: v("descripcion"), proveedor_id: v("proveedor_id"), monto_estimado: monto,
    forma_pago: v("forma_pago"), unidad, cada: String(cada), dia_mes: unidad === "mes" ? String(dia) : "", inicio: v("inicio"), fin: v("fin"),
    requiere_servicio: v("requiere_servicio") === "si" ? "true" : "false",
  } };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --experimental-strip-types --test lib/compras/compromisos.test.ts lib/compras/diasPago.test.ts`
Expected: PASS. Si la prueba de `leerCompromiso` con `base` falla por el orden de llaves, `deepEqual` no depende del orden; revisa valores.

- [ ] **Step 5: Agregar al script `test` y correr todo**

En `package.json`, en `"test"`, después de `lib/compras/diasPago.test.ts` agrega ` lib/compras/compromisos.test.ts`.
Run: `npm test` → Expected: PASS. Run: `npm run typecheck` → Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/compras/compromisos.ts lib/compras/compromisos.test.ts lib/compras/diasPago.ts package.json
git commit -m "feat(compras): lógica de compromisos recurrentes"
```

---

### Task 5: Lista, alta y edición de compromisos

**Files:**
- Create: `app/compras/pagos/compromisos/datos.ts`, `acciones.ts`, `FormCompromiso.tsx`, `page.tsx`, `nuevo/page.tsx`, `[id]/editar/page.tsx`
- Modify: `lib/migas.ts` (entradas antes de `"/compras/pagos/:id"`), `lib/migas.test.ts`

**Interfaces:**
- Consumes: `guardar_compromiso`, `compromisos_en_rango` (Task 1); todo lo de Task 4; `clienteAdmin`, `volver` de `app/compras/servidor.ts`.
- Produces: `leerOpciones(supabase)`, `leerFechas(supabase, desde, hasta)`, `type CompromisoConNombres` en `datos.ts`; server action `guardarCompromiso(fd: FormData)` en `acciones.ts` (Task 6 agrega más acciones al mismo archivo).

- [ ] **Step 1: Prueba de migas (falla)**

En `lib/migas.test.ts`, junto a "programar pagos queda bajo Pagos":

```ts
test("compromisos fijos quedan bajo Pagos", () => {
  assert.equal(texto(migas("/compras/pagos/compromisos", admin)), "Compras › Pagos(/compras/pagos) › Compromisos fijos");
  assert.equal(texto(migas("/compras/pagos/compromisos/nuevo", admin)), "Compras › Pagos(/compras/pagos) › Compromisos fijos(/compras/pagos/compromisos) › Nuevo compromiso");
});
```

Run: `node --experimental-strip-types --test lib/migas.test.ts` → Expected: FAIL (hoy sale "Pago"). Si el formato esperado de la segunda línea no coincide con el de otras rutas anidadas (por ejemplo `/compras/ordenes/:id/comparar`), ajústalo al que ya usa ese test para rutas de tres niveles.

- [ ] **Step 2: Migas**

En `lib/migas.ts`, **antes** de `{ patron: "/compras/pagos/:id", texto: "Pago" }`:

```ts
  { patron: "/compras/pagos/compromisos", texto: "Compromisos fijos" },
  { patron: "/compras/pagos/compromisos/nuevo", texto: "Nuevo compromiso" },
  { patron: "/compras/pagos/compromisos/:id", texto: "Compromiso" },
  { patron: "/compras/pagos/compromisos/:id/editar", texto: "Editar" },
```

Run: `node --experimental-strip-types --test lib/migas.test.ts` → Expected: PASS.

- [ ] **Step 3: `datos.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Compromiso, FechaCompromiso } from "@/lib/compras/compromisos";

export type CompromisoConNombres = Compromiso & { sucursales: { nombre: string } | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null };
export const proveedorDe = (c: CompromisoConNombres) => c.proveedores?.nombre_comercial ?? c.proveedores?.razon_social ?? "Proveedor";
export const sucursalDe = (c: CompromisoConNombres) => c.sucursales?.nombre ?? "Sucursal";

export async function leerCompromisos(supabase: SupabaseClient, id?: string): Promise<CompromisoConNombres[]> {
  let q = supabase.from("compromisos").select("*, sucursales(nombre), proveedores(razon_social, nombre_comercial)").order("inicio").order("id");
  if (id) q = q.eq("id", id);
  const { data, error } = await q.returns<CompromisoConNombres[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ ...c, monto_estimado: Number(c.monto_estimado) }));
}

export async function leerFechas(supabase: SupabaseClient, desde: string, hasta: string): Promise<FechaCompromiso[]> {
  const { data, error } = await supabase.rpc("compromisos_en_rango", { p_desde: desde, p_hasta: hasta }).returns<FechaCompromiso[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({ ...f, factura_saldo: f.factura_saldo === null ? null : Number(f.factura_saldo) }));
}

export async function leerOpciones(supabase: SupabaseClient) {
  const [{ data: sucursales }, { data: proveedores }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
  ]);
  return { sucursales: sucursales ?? [], proveedores: (proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre_comercial ?? p.razon_social })) };
}
```

- [ ] **Step 4: `acciones.ts` (guardar)**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { leerCompromiso } from "@/lib/compras/compromisos";
import { clienteAdmin, volver } from "../../servidor";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();

export async function guardarCompromiso(fd: FormData) {
  const id = texto(fd, "id");
  const ruta = id ? `/compras/pagos/compromisos/${id}/editar` : "/compras/pagos/compromisos/nuevo";
  const supabase = await clienteAdmin(ruta);
  const r = leerCompromiso((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const { data, error } = await supabase.rpc("guardar_compromiso", { p_id: id || null, p_revision: Number(texto(fd, "revision") || 0), p_datos: r.datos });
  if (error) return volver(ruta, "error", error.message);
  revalidatePath("/compras/pagos", "layout");
  volver(`/compras/pagos/compromisos/${data}`, "ok", "Compromiso guardado.");
}
```

- [ ] **Step 5: `FormCompromiso.tsx`**

```tsx
"use client";
import { useState } from "react";
import { CONCEPTOS, REQUIERE_SERVICIO, type Compromiso, type Concepto } from "@/lib/compras/compromisos";
import { NOMBRE_FORMA_PAGO } from "@/lib/compras/proveedores";
import { guardarCompromiso } from "./acciones";

type Opcion = { id: string; nombre: string };

/** Alta o edición. En edición, sucursal, concepto, frecuencia, día e inicio se muestran pero no cambian. */
export function FormCompromiso({ c, sucursales, proveedores, hoy, sucursalInicial }: { c?: Compromiso; sucursales: Opcion[]; proveedores: Opcion[]; hoy: string; sucursalInicial?: string }) {
  const [concepto, setConcepto] = useState<Concepto>(c?.concepto ?? "renta");
  const [unidad, setUnidad] = useState(c?.unidad ?? "mes");
  const [requiere, setRequiere] = useState(c?.requiere_servicio ?? REQUIERE_SERVICIO.renta);
  const fijo = !!c;
  return (
    <form action={guardarCompromiso} className="formulario seccion">
      {c && <><input type="hidden" name="id" value={c.id} /><input type="hidden" name="revision" value={c.revision} /></>}
      {fijo && <p className="saldo-nota">Sucursal, concepto, frecuencia, día e inicio no cambian. Para cambiarlos, ponle fin a este compromiso y crea otro.</p>}
      <div className="rejilla">
        <label className="campo">Sucursal
          <select name="sucursal_id" defaultValue={c?.sucursal_id ?? sucursalInicial ?? ""} required disabled={fijo}>
            <option value="">Elige…</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {fijo && <input type="hidden" name="sucursal_id" value={c.sucursal_id} />}
        </label>
        <label className="campo">Concepto
          <select name="concepto" value={concepto} disabled={fijo} onChange={(e) => { const v = e.target.value as Concepto; setConcepto(v); setRequiere(REQUIERE_SERVICIO[v]); }}>
            {Object.entries(CONCEPTOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {fijo && <input type="hidden" name="concepto" value={concepto} />}
        </label>
        <label className="campo">Descripción{concepto === "otro" ? "" : " (opcional)"}<input name="descripcion" defaultValue={c?.descripcion ?? ""} maxLength={300} required={concepto === "otro"} placeholder="Ej. contrato con folio, área, notas" /></label>
        <label className="campo">Proveedor
          <select name="proveedor_id" defaultValue={c?.proveedor_id ?? ""} required>
            <option value="">Elige…</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Monto estimado (MXN, con IVA)<input name="monto_estimado" inputMode="decimal" defaultValue={c ? String(c.monto_estimado) : ""} required /></label>
        <label className="campo">Forma de pago prevista
          <select name="forma_pago" defaultValue={c?.forma_pago ?? "transferencia"}>
            {Object.entries(NOMBRE_FORMA_PAGO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label className="campo">Se repite
          <select name="unidad" value={unidad} disabled={fijo} onChange={(e) => setUnidad(e.target.value as "mes" | "semana")}>
            <option value="mes">Por meses</option><option value="semana">Por semanas</option>
          </select>
          {fijo && <input type="hidden" name="unidad" value={unidad} />}
        </label>
        <label className="campo">Cada cuántos {unidad === "mes" ? "meses" : "semanas"}<input name="cada" type="number" min={1} max={12} defaultValue={c?.cada ?? 1} required readOnly={fijo} /></label>
        {unidad === "mes" && <label className="campo">Día del mes<input name="dia_mes" type="number" min={1} max={31} defaultValue={c?.dia_mes ?? 1} required readOnly={fijo} /><small>Si el mes es más corto, el último día.</small></label>}
        <label className="campo">Desde<input name="inicio" type="date" defaultValue={c?.inicio ?? hoy} required readOnly={fijo} /></label>
        <label className="campo">Hasta (opcional)<input name="fin" type="date" defaultValue={c?.fin ?? ""} /><small>Cuando termina el contrato.</small></label>
      </div>
      <label className="campo-casilla"><input type="checkbox" name="requiere_servicio" value="si" checked={requiere} onChange={(e) => setRequiere(e.target.checked)} /> Comprobar que el servicio se hizo (fecha, nota y foto)</label>
      <button className="boton" type="submit">Guardar compromiso</button>
    </form>
  );
}
```

Verifica que `NOMBRE_FORMA_PAGO` se exporta de `lib/compras/proveedores.ts` (lo usa `app/compras/pagos/page.tsx`) y que la clase `campo-casilla` existe en `app/globals.css`; si no existe, usa la clase de casilla que use `app/compras/facturas/empresa` para los días de pago.

- [ ] **Step 6: `nuevo/page.tsx` y `[id]/editar/page.tsx`**

`app/compras/pagos/compromisos/nuevo/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerOpciones } from "../datos";
import { FormCompromiso } from "../FormCompromiso";

export default async function NuevoCompromiso({ searchParams }: { searchParams: Promise<{ error?: string; sucursal?: string }> }) {
  const { error, sucursal } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/pagos/compromisos");
  const opciones = await leerOpciones(supabase);
  return <>
    <EncabezadoPagina titulo="Nuevo compromiso" descripcion="Algo que se paga sí o sí cada cierto tiempo: renta, fumigación, basura, trampas de grasa." />
    <Aviso error={error} />
    <FormCompromiso {...opciones} hoy={hoyCalendarioMX()} sucursalInicial={sucursal} />
  </>;
}
```

`app/compras/pagos/compromisos/[id]/editar/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerCompromisos, leerOpciones, sucursalDe } from "../../datos";
import { FormCompromiso } from "../../FormCompromiso";
import { tituloCompromiso } from "@/lib/compras/compromisos";

export default async function EditarCompromiso({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect(`/compras/pagos/compromisos/${id}`);
  const [[c], opciones] = await Promise.all([leerCompromisos(supabase, id), leerOpciones(supabase)]);
  if (!c) notFound();
  return <>
    <EncabezadoPagina titulo={`Editar ${tituloCompromiso(c, sucursalDe(c))}`} descripcion="Los cambios aplican a las fechas que aún no tienen factura." />
    <Aviso error={error} />
    <FormCompromiso c={c} {...opciones} hoy={hoyCalendarioMX()} />
  </>;
}
```

- [ ] **Step 7: Lista `page.tsx` (tarjetas por sucursal)**

```tsx
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { sumarDias } from "@/lib/compras/diasPago";
import { CONCEPTOS, ESTADO_PAGO, avisosCompromisos, estadoPago, servicioSinComprobar, textoFrecuencia, tituloCompromiso } from "@/lib/compras/compromisos";
import { leerCompromisos, leerFechas, proveedorDe, sucursalDe } from "./datos";

export default async function Compromisos({ searchParams }: { searchParams: Promise<{ sucursal?: string; concepto?: string; ok?: string; error?: string }> }) {
  const { sucursal = "", concepto = "", ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyCalendarioMX();
  let todos, fechas;
  try { [todos, fechas] = await Promise.all([leerCompromisos(supabase), leerFechas(supabase, sumarDias(hoy, -365), sumarDias(hoy, 365))]); }
  catch { return <p className="aviso aviso-error">No se pudieron consultar los compromisos. Revisa que la migración 20261028180000 esté aplicada.</p>; }
  const lista = todos.filter((c) => (!sucursal || c.sucursal_id === sucursal) && (!concepto || c.concepto === concepto));
  const ids = new Set(lista.map((c) => c.id));
  const delFiltro = fechas.filter((f) => ids.has(f.compromiso_id));
  const requiere = new Map(lista.map((c) => [c.id, c.requiere_servicio]));
  const avisos = avisosCompromisos(delFiltro, (id) => requiere.get(id) ?? false, hoy);
  const sucursales = [...new Map(todos.map((c) => [c.sucursal_id, sucursalDe(c)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const grupos = sucursales.map(([id, nombre]) => ({ id, nombre, cs: lista.filter((c) => c.sucursal_id === id) })).filter((g) => g.cs.length);
  const edita = puedeEditarCompras(perfil.rol);
  return <>
    <EncabezadoPagina titulo="Compromisos fijos" descripcion="Lo que se paga sí o sí cada cierto tiempo, por sucursal. Sale como previsto en el calendario de pagos hasta que llega su factura."
      acciones={edita && <Link className="boton" href={`/compras/pagos/compromisos/nuevo${sucursal ? `?sucursal=${sucursal}` : ""}`}><Icono nombre="mas" />Nuevo compromiso</Link>} />
    <Aviso ok={ok} error={error} />
    {avisos.vencidosSinFactura > 0 && <p className="aviso aviso-error">{avisos.vencidosSinFactura} pagos fijos vencidos sin factura.</p>}
    {avisos.serviciosSinComprobar > 0 && <p className="aviso aviso-error">{avisos.serviciosSinComprobar} servicios sin comprobar.</p>}
    <form method="get" className="rejilla">
      <label className="campo">Sucursal<select name="sucursal" defaultValue={sucursal}><option value="">Todas</option>{sucursales.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
      <label className="campo">Concepto<select name="concepto" defaultValue={concepto}><option value="">Todos</option>{Object.entries(CONCEPTOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      <button className="boton boton-secundario" type="submit">Filtrar</button>
    </form>
    {!grupos.length ? <EstadoVacio titulo="Sin compromisos" descripcion="Da de alta la renta, la fumigación, la basura o las trampas de grasa de cada sucursal." /> : grupos.map((g) => (
      <section key={g.id} className="seccion"><h2>{g.nombre}</h2><div className="tarjetas">
        {g.cs.map((c) => {
          const propias = fechas.filter((f) => f.compromiso_id === c.id);
          const proxima = propias.find((f) => f.vence >= hoy && estadoPago(f, hoy) !== "omitida");
          const alerta = propias.some((f) => estadoPago(f, hoy) === "vencido" || servicioSinComprobar(f, c.requiere_servicio, hoy));
          return <article key={c.id} className="tarjeta" data-alerta={alerta ? "si" : undefined}>
            <div className="tarjeta-encabezado"><div><h3><Link href={`/compras/pagos/compromisos/${c.id}`}>{tituloCompromiso(c, g.nombre)}</Link></h3><p>{proveedorDe(c)}</p></div><strong>{pesos(c.monto_estimado)}</strong></div>
            <dl className="tarjeta-datos">
              <dt>Frecuencia</dt><dd>{textoFrecuencia(c)}{c.fin ? ` · hasta ${fechaTexto(c.fin)}` : ""}</dd>
              <dt>Próxima</dt><dd>{proxima ? <>{fechaTexto(proxima.vence)} · <span className="insignia" data-tono={ESTADO_PAGO[estadoPago(proxima, hoy)].tono}>{ESTADO_PAGO[estadoPago(proxima, hoy)].texto}</span></> : "Sin fechas próximas"}</dd>
            </dl>
            {alerta && <p className="factura-tarjeta-estados"><span className="insignia" data-tono="peligro">Tiene pendientes vencidos</span></p>}
          </article>;
        })}
      </div></section>
    ))}
  </>;
}
```

Revisa la firma real de `EstadoVacio` (`components/EstadoVacio.tsx`) y de `EncabezadoPagina` (`acciones` acepta `ReactNode`); ajusta las props si se llaman distinto.

- [ ] **Step 8: Typecheck y pruebas**

Run: `npm run typecheck` → Expected: sin errores. Run: `npm test` → Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/compras/pagos/compromisos lib/migas.ts lib/migas.test.ts
git commit -m "feat(compras): lista, alta y edición de compromisos fijos"
```

---

### Task 6: Detalle con fechas, factura, servicio, omisión y evidencia

**Files:**
- Create: `app/compras/pagos/compromisos/[id]/page.tsx`, `app/compras/pagos/compromisos/[id]/FechaCompromiso.tsx`, `app/compras/pagos/compromisos/evidencia/[id]/route.ts`
- Modify: `app/compras/pagos/compromisos/acciones.ts`

**Interfaces:**
- Consumes: `ligar_factura_compromiso`, `comprobar_servicio_compromiso`, `omitir_fecha_compromiso` (Task 2); `preparar_evidencia_compromiso`, `confirmar_evidencia_compromiso` (Task 3); `datos.ts` (Task 5); `validarAdjunto`, `MAX_ADJUNTO` de `lib/compras/adjuntos.ts` (devuelve `{nombre, extension, mime}`).
- Produces: server actions `ligarFactura`, `comprobarServicio`, `omitirFecha`, `subirEvidencia` (todas `(fd: FormData) => Promise<void>`; campos comunes `compromiso_id`, `vence`, `revision`).

- [ ] **Step 1: Acciones** (agregar a `acciones.ts`; agrega `import { createHash } from "node:crypto";` y `import { MAX_ADJUNTO, validarAdjunto } from "@/lib/compras/adjuntos";` arriba)

```ts
const rutaDe = (fd: FormData) => `/compras/pagos/compromisos/${texto(fd, "compromiso_id")}#fecha-${texto(fd, "vence")}`;
const base = (fd: FormData) => ({ p_compromiso: texto(fd, "compromiso_id"), p_vence: texto(fd, "vence"), p_revision: Number(texto(fd, "revision") || 0) });
const hecho = (fd: FormData, msg: string) => { revalidatePath("/compras/pagos", "layout"); volver(rutaDe(fd), "ok", msg); };

export async function ligarFactura(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("ligar_factura_compromiso", { ...base(fd), p_factura: texto(fd, "factura_id") || null });
  if (error) return volver(rutaDe(fd), "error", error.message);
  hecho(fd, texto(fd, "factura_id") ? "Factura ligada. Ya no se cuenta como previsto." : "Factura quitada de la fecha.");
}

export async function comprobarServicio(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("comprobar_servicio_compromiso", { ...base(fd), p_estado: texto(fd, "servicio"), p_fecha: texto(fd, "servicio_fecha") || null, p_nota: texto(fd, "servicio_nota") });
  if (error) return volver(rutaDe(fd), "error", error.message);
  hecho(fd, "Servicio actualizado.");
}

export async function omitirFecha(fd: FormData) {
  const supabase = await clienteAdmin(rutaDe(fd));
  const { error } = await supabase.rpc("omitir_fecha_compromiso", { ...base(fd), p_motivo: texto(fd, "motivo") });
  if (error) return volver(rutaDe(fd), "error", error.message);
  hecho(fd, texto(fd, "motivo") ? "Fecha omitida." : "Omisión quitada.");
}

export async function subirEvidencia(fd: FormData) {
  const ruta = rutaDe(fd), supabase = await clienteAdmin(ruta);
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || !archivo.size || archivo.size > MAX_ADJUNTO) return volver(ruta, "error", "Elige una foto o PDF de hasta 4 MB.");
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let formato: ReturnType<typeof validarAdjunto>;
  try { formato = validarAdjunto(archivo.name, bytes); } catch (e) { return volver(ruta, "error", e instanceof Error ? e.message : "Archivo inválido."); }
  const sha = createHash("sha256").update(bytes).digest("hex"), solicitud = texto(fd, "solicitud");
  const { data, error } = await supabase.rpc("preparar_evidencia_compromiso", { p_id: solicitud, p_compromiso: texto(fd, "compromiso_id"), p_vence: texto(fd, "vence"), p_nombre: formato.nombre, p_extension: formato.extension, p_mime: formato.mime, p_bytes: bytes.length, p_sha256: sha });
  if (error) return volver(ruta, "error", error.message);
  const ev = data as { ruta: string; disponible: boolean };
  if (!ev.disponible) {
    const subido = await supabase.storage.from("adjuntos-compras").upload(ev.ruta, bytes, { contentType: formato.mime, upsert: false });
    if (subido.error) {
      // Reintento tras una respuesta perdida: si ya está el mismo archivo, se confirma.
      const previo = await supabase.storage.from("adjuntos-compras").download(ev.ruta);
      if (previo.error || !previo.data || createHash("sha256").update(new Uint8Array(await previo.data.arrayBuffer())).digest("hex") !== sha) return volver(ruta, "error", "No se pudo subir el archivo. Vuelve a intentarlo.");
    }
    const { error: e2 } = await supabase.rpc("confirmar_evidencia_compromiso", { p_id: solicitud });
    if (e2) return volver(ruta, "error", "El archivo se subió pero no se pudo confirmar. Vuelve a intentarlo.");
  }
  hecho(fd, "Evidencia guardada.");
}
```

Antes de escribir, confirma en `lib/compras/adjuntos.ts` que `validarAdjunto` acepta pdf/jpg/png/webp y devuelve `extension` en minúsculas (`jpg`, no `jpeg`). Si devuelve además xlsx/docx, `preparar_evidencia_compromiso` los rechaza con "La evidencia debe ser PDF o foto.", que es lo deseado.

- [ ] **Step 2: Ruta de descarga** `app/compras/pagos/compromisos/evidencia/[id]/route.ts`

```ts
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerCompras } from "@/lib/roles";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const { data: e } = await supabase.from("compromiso_evidencias").select("ruta,nombre,mime").eq("id", id).not("confirmado_en", "is", null).maybeSingle<{ ruta: string; nombre: string; mime: string }>();
  if (!e) return new Response("Evidencia no encontrada", { status: 404 });
  const { data, error } = await supabase.storage.from("adjuntos-compras").download(e.ruta);
  if (error || !data) return new Response("No se pudo descargar la evidencia", { status: 404 });
  const nombre = encodeURIComponent(e.nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(await data.arrayBuffer(), { headers: { "Content-Type": e.mime, "Content-Disposition": `inline; filename*=UTF-8''${nombre}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
```

- [ ] **Step 3: Tarjeta de una fecha** `app/compras/pagos/compromisos/[id]/FechaCompromiso.tsx` (componente de servidor)

```tsx
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ESTADO_PAGO, ESTADO_SERVICIO, estadoPago, servicioSinComprobar, type FechaCompromiso } from "@/lib/compras/compromisos";
import { fechaTexto, pesos } from "@/lib/formato";
import { comprobarServicio, ligarFactura, omitirFecha, subirEvidencia } from "../acciones";

type Factura = { id: string; nombre: string; saldo: number };
type Evidencia = { id: string; nombre: string };

export function TarjetaFecha({ f, compromiso, fechaPago, hoy, edita, requiere, facturas, evidencias, nuevaFactura }: {
  f: FechaCompromiso; compromiso: string; fechaPago: string; hoy: string; edita: boolean; requiere: boolean;
  facturas: Factura[]; evidencias: Evidencia[]; nuevaFactura: string;
}) {
  const estado = estadoPago(f, hoy), ocultos = <><input type="hidden" name="compromiso_id" value={compromiso} /><input type="hidden" name="vence" value={f.vence} /><input type="hidden" name="revision" value={f.revision} /></>;
  const sinComprobar = servicioSinComprobar(f, requiere, hoy);
  return (
    <article id={`fecha-${f.vence}`} className="tarjeta" data-alerta={estado === "vencido" || sinComprobar ? "si" : undefined}>
      <div className="tarjeta-encabezado"><div><h3>Vence {fechaTexto(f.vence)}</h3><p>Día de pago: {fechaTexto(fechaPago)}</p></div>
        <span className="insignia" data-tono={ESTADO_PAGO[estado].tono}>{ESTADO_PAGO[estado].texto}</span></div>
      <dl className="tarjeta-datos">
        {f.factura_id && estado !== "previsto" && estado !== "vencido" && <><dt>Factura</dt><dd><Link href={`/compras/facturas/${f.factura_id}`}>Ver factura</Link>{f.factura_saldo ? ` · saldo ${pesos(f.factura_saldo)}` : ""}</dd></>}
        {f.omitida_motivo && <><dt>Motivo</dt><dd className="texto-libre">{f.omitida_motivo}</dd></>}
        {requiere && <><dt>Servicio</dt><dd>{sinComprobar ? <span className="insignia" data-tono="peligro">Sin comprobar</span> : ESTADO_SERVICIO[f.servicio]}{f.servicio_fecha ? ` · ${fechaTexto(f.servicio_fecha)}` : ""}{f.servicio_nota ? <span className="texto-libre"> — {f.servicio_nota}</span> : null}</dd></>}
        {evidencias.length > 0 && <><dt>Evidencia</dt><dd>{evidencias.map((e) => <Link key={e.id} href={`/compras/pagos/compromisos/evidencia/${e.id}`} target="_blank">{e.nombre}</Link>)}</dd></>}
      </dl>
      {edita && <>
        {estado !== "omitida" && <details><summary>{f.factura_id && (estado === "por_pagar" || estado === "pagada") ? "Cambiar o quitar factura" : "Ligar factura"}</summary>
          <form action={ligarFactura} className="formulario">{ocultos}
            <label className="campo">Factura del proveedor en esta sucursal<select name="factura_id" defaultValue=""><option value="">Ninguna (quitar)</option>{facturas.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {pesos(x.saldo)}</option>)}</select></label>
            <button className="boton" type="submit">Guardar</button>
          </form>
          <p className="saldo-nota">¿No hay factura? <Link href={nuevaFactura}>Capturar gasto sin CFDI</Link> y se liga solo.</p>
        </details>}
        {requiere && estado !== "omitida" && <details><summary>Comprobar servicio</summary>
          <form action={comprobarServicio} className="formulario">{ocultos}
            <label className="campo">¿Se hizo?<select name="servicio" defaultValue={f.servicio}><option value="realizado">Sí, se hizo</option><option value="no_realizado">No se hizo</option><option value="pendiente">Pendiente</option></select></label>
            <label className="campo">Fecha en que se hizo<input type="date" name="servicio_fecha" max={hoy} defaultValue={f.servicio_fecha ?? hoy} /></label>
            <label className="campo">Qué se hizo o por qué no<textarea name="servicio_nota" maxLength={2000} defaultValue={f.servicio_nota ?? ""} /></label>
            <button className="boton" type="submit">Guardar</button>
          </form>
          {f.servicio !== "pendiente" && <form action={subirEvidencia} className="formulario">{ocultos}<input type="hidden" name="solicitud" value={randomUUID()} />
            <label className="campo">Foto o PDF de evidencia<input type="file" name="archivo" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
            <button className="boton boton-secundario" type="submit">Subir evidencia</button>
          </form>}
        </details>}
        {!(f.factura_id && (estado === "por_pagar" || estado === "pagada")) && <details><summary>{estado === "omitida" ? "Quitar omisión" : "Omitir esta fecha"}</summary>
          <form action={omitirFecha} className="formulario">{ocultos}
            {estado === "omitida" ? <input type="hidden" name="motivo" value="" /> : <label className="campo">Motivo<textarea name="motivo" minLength={5} maxLength={1000} required placeholder="Ej. mes de gracia, no hubo servicio por remodelación" /></label>}
            <button className="boton boton-secundario" type="submit">{estado === "omitida" ? "Quitar omisión" : "Omitir"}</button>
          </form>
        </details>}
      </>}
    </article>
  );
}
```

Nota: en `ligar_factura_compromiso` una factura cancelada sigue en `factura_id`; para re-ligar se elige otra factura o "Ninguna". La subida de evidencia se ofrece solo después de marcar el servicio (realizado/no realizado), así `preparar_evidencia_compromiso` siempre encuentra la fila.

- [ ] **Step 4: Página de detalle** `app/compras/pagos/compromisos/[id]/page.tsx`

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { nombreFactura } from "@/lib/compras/facturas";
import { NOMBRE_FORMA_PAGO } from "@/lib/compras/proveedores";
import { diaDePagoSugerido, sumarDias } from "@/lib/compras/diasPago";
import { textoFrecuencia, tituloCompromiso } from "@/lib/compras/compromisos";
import { diasDePago } from "../../../servidor";
import { leerCompromisos, leerFechas, proveedorDe, sucursalDe } from "../datos";
import { TarjetaFecha } from "./FechaCompromiso";

export default async function DetalleCompromiso({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyCalendarioMX();
  const [[c], todas, dias] = await Promise.all([leerCompromisos(supabase, id), leerFechas(supabase, sumarDias(hoy, -92), sumarDias(hoy, 365)), diasDePago(supabase)]);
  if (!c) notFound();
  const fechas = todas.filter((f) => f.compromiso_id === id);
  const [{ data: candidatas }, { data: ligadas }, { data: evidencias }, { data: historial }] = await Promise.all([
    supabase.from("facturas_saldo").select("id, serie, folio, uuid, uuid_manual, saldo").eq("tipo", "ingreso").neq("estado", "cancelada")
      .eq("proveedor_id", c.proveedor_id).eq("sucursal_id", c.sucursal_id).order("fecha_emision", { ascending: false }).limit(50)
      .returns<{ id: string; serie: string | null; folio: string | null; uuid: string | null; uuid_manual: string | null; saldo: number }[]>(),
    supabase.from("compromiso_fechas").select("factura_id").not("factura_id", "is", null).returns<{ factura_id: string }[]>(),
    supabase.from("compromiso_evidencias").select("id, nombre, fecha_id").in("fecha_id", fechas.map((f) => f.fecha_id).filter((x): x is string => !!x)).not("confirmado_en", "is", null).returns<{ id: string; nombre: string; fecha_id: string }[]>(),
    supabase.from("compromiso_historial").select("id, evento, fecha").eq("compromiso_id", id).order("fecha", { ascending: false }).limit(20).returns<{ id: number; evento: string; fecha: string }[]>(),
  ]);
  const usadas = new Set((ligadas ?? []).map((l) => l.factura_id));
  const facturas = (candidatas ?? []).filter((x) => !usadas.has(x.id)).map((x) => ({ id: x.id, nombre: nombreFactura(x), saldo: Number(x.saldo) }));
  const edita = puedeEditarCompras(perfil.rol), sucursal = sucursalDe(c);
  const nuevaFactura = (vence: string) => `/compras/facturas/nueva?${new URLSearchParams({ proveedor: c.proveedor_id, sucursal: c.sucursal_id, compromiso: c.id, vence })}`;
  return <>
    <EncabezadoPagina titulo={tituloCompromiso(c, sucursal)} descripcion={`${proveedorDe(c)} · ${pesos(c.monto_estimado)} · ${textoFrecuencia(c)}`}
      acciones={edita && <Link className="boton boton-secundario" href={`/compras/pagos/compromisos/${id}/editar`}>Editar o ponerle fin</Link>} />
    <Aviso ok={ok} error={error} />
    <section className="seccion"><dl className="tarjeta-datos">
      <dt>Forma de pago prevista</dt><dd>{NOMBRE_FORMA_PAGO[c.forma_pago]}</dd>
      <dt>Vigencia</dt><dd>Desde {fechaTexto(c.inicio)}{c.fin ? ` hasta ${fechaTexto(c.fin)}` : ", sin fecha de fin"}</dd>
      <dt>Servicio</dt><dd>{c.requiere_servicio ? "Se comprueba cada fecha" : "No lleva comprobación"}</dd>
      {c.descripcion && <><dt>Notas</dt><dd className="texto-libre">{c.descripcion}</dd></>}
    </dl></section>
    <section className="seccion"><h2>Fechas</h2><p className="saldo-nota">Últimos 3 meses y próximos 12.</p>
      {!fechas.length ? <p>No hay fechas en este periodo.</p> : <div className="tarjetas">{fechas.map((f) =>
        <TarjetaFecha key={f.vence} f={f} compromiso={id} fechaPago={diaDePagoSugerido(f.vence, hoy, dias)} hoy={hoy} edita={edita} requiere={c.requiere_servicio}
          facturas={facturas} evidencias={(evidencias ?? []).filter((e) => e.fecha_id === f.fecha_id)} nuevaFactura={nuevaFactura(f.vence)} />)}</div>}
    </section>
    {!!historial?.length && <section className="seccion"><h2>Historial</h2><ul>{historial.map((h) => <li key={h.id}>{h.evento} · {fechaTexto(h.fecha.slice(0, 10))}</li>)}</ul></section>}
  </>;
}
```

Verifica: `nombreFactura` de `lib/compras/facturas.ts` acepta `{serie, folio, uuid, uuid_manual}` (la usa `app/compras/pagos/page.tsx` con esas columnas; si pide otras, agrégalas al `select`); `facturas_saldo` tiene `fecha_emision` (si no, ordena por `vence_el`). La ruta de `diasDePago` es `app/compras/servidor.ts`: desde `app/compras/pagos/compromisos/[id]/page.tsx` son tres niveles (`../../../servidor`).

- [ ] **Step 5: Typecheck y pruebas**

Run: `npm run typecheck` → Expected: sin errores. Run: `npm test` → Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/compras/pagos/compromisos
git commit -m "feat(compras): detalle de compromiso con factura, servicio, omisión y evidencia"
```

---

### Task 7: Previstos y avisos en el calendario de pagos

**Files:**
- Modify: `app/compras/pagos/CalendarioPagos.tsx`, `app/compras/pagos/page.tsx`

**Interfaces:**
- Consumes: `previstosPorDia`, `filtrarPrevistos`, `avisosCompromisos`, `tituloCompromiso`, `type Previsto` (Task 4); `leerCompromisos`, `leerFechas`, `sucursalDe` (Task 5).
- Produces: `CalendarioPagos` acepta `previstos?: Record<string, Previsto[]>` (por omisión `{}`).

- [ ] **Step 1: `CalendarioPagos.tsx`**

1. Import: `import type { Previsto } from "@/lib/compras/compromisos";` y `import Link from "next/link";`.
2. Firma: agrega `previstos = {}` a las props desestructuradas y `previstos?: Record<string, Previsto[]>` al tipo.
3. Después de `const lista = …` agrega:

```tsx
  const previstosLista = dia ? previstos[dia] ?? [] : verRango ? Object.entries(previstos).filter(([d]) => d >= rango.desde && d <= rango.hasta).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, ps]) => ps) : [];
```

4. Dentro del `map` de días, reemplaza el cálculo de `total`/`vencidas` y el `aria-label`/`data-vacio` por:

```tsx
          const facturas = porDia[d] ?? [], ps = previstos[d] ?? [];
          const total = facturas.reduce((s, f) => s + f.saldo, 0) + ps.reduce((s, p) => s + p.monto, 0);
          const vencidas = facturas.some((f) => f.vencida) || ps.some((p) => p.vencido);
          const hay = facturas.length + ps.length > 0;
```

y usa `hay` donde hoy dice `facturas.length` (en `data-vacio`, el `aria-label` y el texto `pesosCortos(total)`). Agrega al `aria-label` `${ps.length ? `, ${ps.length} previstos` : ""}` y al botón `data-previsto={ps.length ? "si" : undefined}`.

5. En `calendario-pie`, cambia la condición de vacío a `!lista.length && !previstosLista.length` y, antes de `<TablaFacturasPago filas={lista}/>`, pinta los previstos:

```tsx
          <>
            {previstosLista.length > 0 && <div className="tarjetas">{previstosLista.map((p) => (
              <article key={`${p.compromisoId}-${p.vence}`} className="tarjeta" data-alerta={p.vencido ? "si" : undefined}>
                <div className="tarjeta-encabezado"><div><h3><Link href={`/compras/pagos/compromisos/${p.compromisoId}#fecha-${p.vence}`}>{p.titulo}</Link></h3>
                  <p>Vence {fechaTexto(p.vence)} · sin factura todavía</p></div><strong>{pesos(p.monto)}</strong></div>
                <span className="insignia" data-tono={p.vencido ? "peligro" : "info"}>{p.vencido ? "Previsto vencido" : "Previsto"}</span>
              </article>))}</div>}
            {lista.length > 0 && <TablaFacturasPago filas={lista}/>}
          </>
```

6. En `app/globals.css`, junto a las reglas de `.calendario-dia`, agrega una marca discreta para los días con previstos:

```css
.calendario-dia[data-previsto="si"] .calendario-venta { text-decoration: underline dotted; }
```

- [ ] **Step 2: `page.tsx` de Pagos**

1. Imports: `import { avisosCompromisos, filtrarPrevistos, previstosPorDia, tituloCompromiso } from "@/lib/compras/compromisos";`, `import { sumarDias } from "@/lib/compras/diasPago";` (agrégalo al import existente de `diasPago`), `import { leerCompromisos, leerFechas, sucursalDe } from "./compromisos/datos";`.
2. Después de `const dias = await diasDePago(supabase);`:

```tsx
  // Compromisos fijos: lo que aún no tiene factura sale como previsto. Si la migración no está, Pagos sigue igual.
  const [compromisos, fechasCompromiso] = await Promise.all([leerCompromisos(supabase), leerFechas(supabase, sumarDias(hoy, -365), sumarDias(hoy, 365))]).catch(() => [[], []] as [Awaited<ReturnType<typeof leerCompromisos>>, Awaited<ReturnType<typeof leerFechas>>]);
  const compromisosVisibles = filtrarPrevistos(compromisos, { sucursal, proveedor });
  const idsCompromiso = new Set(compromisosVisibles.map((c) => c.id));
  const fechasVisibles = fechasCompromiso.filter((f) => idsCompromiso.has(f.compromiso_id));
  const previstos = previstosPorDia(fechasVisibles, new Map(compromisosVisibles.map((c) => [c.id, { monto: c.monto_estimado, titulo: tituloCompromiso(c, sucursalDe(c)) }])), hoy, (v) => diaDePagoSugerido(v, hoy, dias));
  const requiereServicio = new Map(compromisosVisibles.map((c) => [c.id, c.requiere_servicio]));
  const avisosFijos = avisosCompromisos(fechasVisibles, (id) => requiereServicio.get(id) ?? false, hoy);
```

3. En `acciones` del encabezado, junto a "Programar pagos": `<Link className="boton boton-secundario" href="/compras/pagos/compromisos"><Icono nombre="calendario" />Compromisos fijos</Link>`.
4. Justo antes de `<CalendarioPagos …/>`:

```tsx
      {(avisosFijos.vencidosSinFactura > 0 || avisosFijos.serviciosSinComprobar > 0) && <p className="aviso aviso-error">
        <Link href="/compras/pagos/compromisos">{[avisosFijos.vencidosSinFactura ? `${avisosFijos.vencidosSinFactura} pagos fijos vencidos sin factura` : "", avisosFijos.serviciosSinComprobar ? `${avisosFijos.serviciosSinComprobar} servicios sin comprobar` : ""].filter(Boolean).join(" · ")}</Link></p>}
```

5. Pasa `previstos={previstos}` a `<CalendarioPagos …/>`.

La exportación a Tesorería y los indicadores de arriba (`resumenPagos`) **no** cambian: solo incluyen facturas.

- [ ] **Step 3: Typecheck y pruebas**

Run: `npm run typecheck` → Expected: sin errores. Run: `npm test` → Expected: PASS (incluye `tests/pagosVista.cjs`; si una prueba de vista compara el HTML del calendario, actualízala para la nueva prop opcional sin cambiar su intención).

- [ ] **Step 4: Commit**

```bash
git add app/compras/pagos/CalendarioPagos.tsx app/compras/pagos/page.tsx app/globals.css
git commit -m "feat(compras): previstos de compromisos en el calendario de pagos"
```

---

### Task 8: Gasto sin CFDI desde un compromiso

**Files:**
- Modify: `app/compras/facturas/nueva/page.tsx`, `app/compras/facturas/nueva/FormGastoManual.tsx`, `app/compras/facturas/acciones.ts:164-193`

**Interfaces:**
- Consumes: `ligar_factura_compromiso` (Task 2). La URL trae `proveedor`, `sucursal`, `compromiso`, `vence`.
- Produces: `FormGastoManual` acepta `inicial?: { proveedor: string; sucursal: string; compromiso: string; vence: string; revision: number }`.

- [ ] **Step 1: Página**

En `nueva/page.tsx`, el tipo de `searchParams` pasa a `{ error?: string; proveedor?: string; sucursal?: string; compromiso?: string; vence?: string }`. Si vienen `compromiso` y `vence`, lee la revisión de esa fecha:

```tsx
  const { error, proveedor, sucursal, compromiso, vence } = await searchParams;
  let inicial: { proveedor: string; sucursal: string; compromiso: string; vence: string; revision: number } | undefined;
  if (proveedor && sucursal && compromiso && vence) {
    const { data } = await supabase.from("compromiso_fechas").select("revision").eq("compromiso_id", compromiso).eq("vence", vence).maybeSingle<{ revision: number }>();
    inicial = { proveedor, sucursal, compromiso, vence, revision: data?.revision ?? 0 };
  }
```

y pasa `inicial={inicial}` a `<FormGastoManual …/>`. Si hay `inicial`, la descripción del encabezado agrega: " Al guardarlo se liga al compromiso del {fechaTexto(vence)}." (importa `fechaTexto` de `@/lib/formato`).

- [ ] **Step 2: Formulario**

En `FormGastoManual.tsx`:
1. Props: agrega `inicial` al tipo y a la desestructuración.
2. Estados iniciales con lo del compromiso (y la cuenta del proveedor en el primer renglón):

```tsx
  const pInicial = proveedores.find((x) => x.id === inicial?.proveedor);
  const [proveedor, setProveedor] = useState(pInicial?.id ?? "");
  const [sucursal, setSucursal] = useState(inicial?.sucursal ?? "oficina");
```

y cambia el estado inicial de `renglones` a `[{ descripcion: "", importe: "", cuenta: pInicial?.cuenta_pl ?? "" }]`. El periodo `cubre` arranca en el mes de hoy como ya hace; con proveedor inicial, inicialízalo con `periodoCubre(hoy, pInicial.cubre_meses, pInicial.cubre_inicio)` (mismo cálculo que `recalcular`) usando un inicializador perezoso:

```tsx
  const [cubre, setCubre] = useState(() => { const c = periodoCubre(hoy, pInicial?.cubre_meses ?? 1, pInicial?.cubre_inicio ?? "emision"); return { desde: c.desde.slice(0, 7), hasta: c.hasta.slice(0, 7) }; });
```

3. Dentro del `<form>`, si hay `inicial`: `<input type="hidden" name="compromiso_id" value={inicial.compromiso} /><input type="hidden" name="compromiso_vence" value={inicial.vence} /><input type="hidden" name="compromiso_revision" value={inicial.revision} />`.

- [ ] **Step 3: Acción**

En `registrarGastoManual`, después del bloque del periodo y antes de `revalidatePath("/compras", "layout")`:

```ts
  // Capturado desde un compromiso fijo: se liga a su fecha para que deje de contarse como previsto.
  const compromiso = texto(fd, "compromiso_id");
  if (compromiso) {
    const { error: errorLiga } = await supabase.rpc("ligar_factura_compromiso", { p_compromiso: compromiso, p_vence: texto(fd, "compromiso_vence"), p_revision: Number(texto(fd, "compromiso_revision") || 0), p_factura: id });
    aviso += errorLiga ? ` No se ligó al compromiso (${errorLiga.message}); lígalo desde Compromisos fijos.` : " Quedó ligado al compromiso.";
  }
```

(`aviso` ya es `let` en esa función; `texto` ya existe en el archivo.)

- [ ] **Step 4: Typecheck y pruebas**

Run: `npm run typecheck` → Expected: sin errores. Run: `npm test` → Expected: PASS (incluye `lib/compras/gastoManual.test.ts`, que no cambia).

- [ ] **Step 5: Commit**

```bash
git add app/compras/facturas/nueva/page.tsx app/compras/facturas/nueva/FormGastoManual.tsx app/compras/facturas/acciones.ts
git commit -m "feat(compras): gasto sin CFDI ligado a un compromiso"
```

---

### Task 9: Verificación, PR y entrega del SQL

**Files:** ninguno nuevo.

- [ ] **Step 1: Todo verde**

Run: `npm test`, `npm run typecheck`, `npm run build` → Expected: los tres sin errores.

- [ ] **Step 2: Vista previa**

Sin la migración en la base, las pantallas nuevas muestran el aviso de "migración no aplicada" y Pagos sigue igual (sin previstos). Verifica eso en la vista previa (computadora y celular, 375 px): `/compras/pagos` carga sin errores en consola, y `/compras/pagos/compromisos` muestra el aviso. El recorrido completo con datos se verifica después de que Sebastián corra la migración.

- [ ] **Step 3: Subir la rama y abrir el PR**

```bash
git push -u origin feat/compromisos-recurrentes
"/c/Program Files/GitHub CLI/gh.exe" pr create --repo HelperHolding/dodo-money --base main --title "Compromisos fijos: renta, fumigación, basura y trampas de grasa" --body-file <archivo con resumen, pasos SQL y checklist>
```

El cuerpo del PR lista: qué hace, la migración y la prueba SQL a correr en orden, y que no se fusiona sin "PRUEBAS OK". Termina con la línea de atribución de Claude Code.

- [ ] **Step 4: Entregar a Sebastián**

Pedirle que corra en el SQL Editor, en orden: `supabase/migrations/20261028180000_compromisos_recurrentes.sql` y luego `supabase/pruebas/20261028180000_compromisos_recurrentes.sql` (debe terminar en el error "PRUEBAS OK"). Esperar su resultado y que pasen `Historial válido` y `Pruebas y tipos` en el PR antes de fusionar.

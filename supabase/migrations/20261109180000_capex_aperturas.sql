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

commit;

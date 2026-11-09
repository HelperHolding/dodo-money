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

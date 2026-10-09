-- Reparación para instalaciones donde 0051 ya fue aplicada.
begin;
create or replace function public.preparar_borrador_nomina(p_sucursal uuid,p_mes date,p_fuente text,p_empleados jsonb,p_avisos jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare nuevo uuid;prev uuid;e jsonb;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración prepara nómina.';end if;
 if p_mes is null or extract(day from p_mes)<>1 or p_mes<date '2020-01-01' or p_mes>date '2100-12-01' or length(trim(coalesce(p_fuente,''))) not between 5 and 1000 then raise exception 'Revisa mes y fuente.';end if;
 if p_empleados is null or jsonb_typeof(p_empleados)<>'array' or p_avisos is null or jsonb_typeof(p_avisos)<>'array' then raise exception 'Revisa el borrador.';end if;
 if jsonb_array_length(p_empleados) not between 1 and 100 or jsonb_array_length(p_avisos)>300 then raise exception 'Agrega de 1 a 100 empleados.';end if;
 for e in select value from jsonb_array_elements(p_empleados) loop
  if not exists(select 1 from public.personal p join public.personal_versiones v on v.personal_id=p.id where p.id=(e->>'personal_id')::uuid and v.id=(e->>'version_id')::uuid and p.sucursal_id is not distinct from p_sucursal) then raise exception 'El empleado no corresponde a este lugar.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_empleados) as empleado(valor) group by empleado.valor->>'personal_id' having count(*)>1) then raise exception 'Hay empleados repetidos.';end if;
 select id into prev from public.nomina_reales where sucursal_id is not distinct from p_sucursal and mes=p_mes and anulada_en is null;
 insert into public.nomina_borradores(sucursal_id,mes,fuente,empleados,avisos,previa,creado_por) values(p_sucursal,p_mes,trim(p_fuente),p_empleados,p_avisos,prev,auth.uid()) returning id into nuevo;
 return nuevo;
end $$;

create or replace function public.confirmar_borrador_nomina(p_id uuid,p_empleados jsonb,p_fuente text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.nomina_borradores;n uuid;e jsonb;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración confirma nómina.';end if;
 select * into r from public.nomina_borradores where id=p_id for update;
 if not found then raise exception 'No existe el borrador.';end if;
 if r.confirmada_id is not null then raise exception 'El borrador ya fue confirmado.';end if;
 if p_empleados is null or jsonb_typeof(p_empleados)<>'array' then raise exception 'Revisa los empleados del borrador.';end if;
 if jsonb_array_length(p_empleados)<>jsonb_array_length(r.empleados) then raise exception 'Revisa todos los empleados del borrador.';end if;
 for e in select value from jsonb_array_elements(p_empleados) loop
  if not exists(select 1 from jsonb_array_elements(r.empleados)d where d->>'personal_id'=e->>'personal_id' and d->>'version_id'=e->>'version_id') then raise exception 'Revisa los empleados del borrador.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_empleados) as empleado(valor) group by empleado.valor->>'personal_id' having count(*)>1) then raise exception 'Hay empleados repetidos.';end if;
 n:=public.guardar_nomina_real(r.sucursal_id,r.mes,p_fuente,p_empleados,r.previa);
 update public.nomina_borradores set confirmada_id=n where id=p_id;
 return n;
end $$;
commit;

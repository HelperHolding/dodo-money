-- Colores del calendario de aperturas: uno por etapa (P1–P7) y uno por categoría del plano.
-- Valen para todos los proyectos. Si un grupo no tiene color guardado, la app usa su color predeterminado.
begin;
create table public.apertura_colores (
 agrupacion text not null check(agrupacion in ('etapa','categoria')),
 clave text not null,
 color text not null check(color ~ '^#[0-9a-f]{6}$'),
 actualizado_por uuid references public.perfiles(id),
 actualizado_en timestamptz not null default now(),
 primary key(agrupacion,clave),
 check((agrupacion='etapa' and clave in ('P1','P2','P3','P4','P5','P6','P7'))
  or (agrupacion='categoria' and clave in ('equipo_cocina','mobiliario','camara_fria','puertas','zoclos','pisos','acabados','paneles','contactos','salidas_cable','baja_tension','iluminacion','plafones','sanitarios','senaletica_interior','senaletica_fachada','sin')))
);
alter table public.apertura_colores enable row level security;
create policy ver_apertura_colores on public.apertura_colores for select using(public.ve_compras());
revoke all on public.apertura_colores from public,anon,authenticated;
grant select on public.apertura_colores to authenticated;

-- Guardar o quitar (p_color vacío = volver al predeterminado). Solo administración.
create function public.guardar_color_apertura(p_agrupacion text,p_clave text,p_color text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.edita_compras() then raise exception 'Solo administración puede cambiar los colores.';end if;
 if nullif(trim(p_color),'') is null then
  delete from public.apertura_colores where agrupacion=p_agrupacion and clave=p_clave;
  return;
 end if;
 insert into public.apertura_colores(agrupacion,clave,color,actualizado_por) values(p_agrupacion,p_clave,lower(trim(p_color)),auth.uid())
 on conflict(agrupacion,clave) do update set color=excluded.color,actualizado_por=excluded.actualizado_por,actualizado_en=now();
end $$;
revoke all on function public.guardar_color_apertura(text,text,text) from public,anon;
grant execute on function public.guardar_color_apertura(text,text,text) to authenticated;
commit;

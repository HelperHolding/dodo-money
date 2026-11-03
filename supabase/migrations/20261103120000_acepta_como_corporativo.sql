-- Un admin con la bandera acepta_como_corporativo puede recibir en corporativo (salidas y recolecciones) sin cambiar de puesto.
-- Nadie recibe lo que él mismo registró o recogió: la custodia sigue pasando por tres personas distintas.
begin;
set local lock_timeout='5s';
alter table public.perfiles add column acepta_como_corporativo boolean not null default false;

create function public.puede_recibir_en_corporativo() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.mi_rol()::text='corporativo'
  or (public.mi_rol()::text='admin' and exists(select 1 from public.perfiles where id=auth.uid() and acepta_como_corporativo)),false)
$$;
revoke all on function public.puede_recibir_en_corporativo() from public,anon;
grant execute on function public.puede_recibir_en_corporativo() to authenticated;

create or replace function public.recibir_en_corporativo(p_id uuid, p_aceptar boolean, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m movimientos;
begin
  if not public.puede_recibir_en_corporativo() then raise exception 'Solo corporativo recibe el efectivo'; end if;
  select * into m from movimientos where id = p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if m.tipo <> 'salida_corporativo' then raise exception 'Solo las salidas a corporativo se reciben aquí'; end if;
  if m.estado = 'pendiente' then raise exception 'Esta salida todavía no la recoge un admin'; end if;
  if m.estado = 'rechazado' then raise exception 'Esta salida se rechazó en la sucursal'; end if;
  if m.recepcion is not null then raise exception 'Esta salida ya se recibió en corporativo'; end if;
  if auth.uid() in (m.registrado_por, m.confirmado_por) then raise exception 'Quien registró o recogió la salida no puede recibirla en corporativo'; end if;
  if not p_aceptar and coalesce(trim(p_nota), '') = '' then raise exception 'Escribe el motivo del rechazo'; end if;

  update movimientos
     set recepcion = case when p_aceptar then 'aceptada' else 'rechazada' end,
         recibido_por = auth.uid(),
         recibido_en = now(),
         nota_recepcion = nullif(trim(p_nota), '')
   where id = p_id;
end $$;

create or replace function public.recibir_recoleccion(p_id uuid,p_contado numeric,p_nota text) returns void language plpgsql security definer set search_path=public as $$
declare r public.recolecciones_corporativo;m public.movimientos;
begin
 if not public.puede_recibir_en_corporativo() then raise exception 'Solo corporativo recibe la entrega.';end if;
 select * into m from public.movimientos where id=p_id for update;
 select * into r from public.recolecciones_corporativo where id=p_id for update;
 if not found then raise exception 'Recolección no encontrada.';end if;
 if r.recibido_en is not null then
  if r.recibido_por=auth.uid() and r.contado_corporativo=p_contado and coalesce(r.nota_recepcion,'')=trim(coalesce(p_nota,'')) then return;end if;
  raise exception 'Esta recolección ya se recibió.';
 end if;
 if auth.uid() in (m.registrado_por,m.confirmado_por) then raise exception 'Quien registró o recogió la entrega no puede recibirla en corporativo.';end if;
 if p_contado is null or p_contado<0 or p_contado>=1e10 or p_contado<>round(p_contado,2) or length(coalesce(p_nota,''))>1000 or (p_contado<>m.monto and length(trim(coalesce(p_nota,'')))<5) then raise exception 'Revisa el efectivo contado y explica cualquier diferencia.';end if;
 update public.recolecciones_corporativo set contado_corporativo=p_contado,recibido_por=auth.uid(),recibido_en=now(),nota_recepcion=trim(coalesce(p_nota,'')) where id=p_id;
 perform public.recibir_en_corporativo(p_id,p_contado=m.monto,p_nota);
end $$;
commit;

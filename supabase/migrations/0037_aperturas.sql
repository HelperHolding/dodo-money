begin;
create table public.apertura_proyectos (
 id uuid primary key default gen_random_uuid(), sucursal_id uuid not null unique references public.sucursales(id),
 responsable text not null check(length(trim(responsable)) between 1 and 200),
 objetivo_desde date not null, objetivo_hasta date not null check(objetivo_hasta>=objetivo_desde),
 presupuesto numeric(16,2) check(presupuesto>=0 and presupuesto<1e12),revision integer not null default 1
);
create table public.apertura_items (
 id uuid primary key default gen_random_uuid(), proyecto_id uuid not null references public.apertura_proyectos(id),
 clave text not null, tipo text not null check(tipo in ('actividad','equipo','referencia','tecnico')),
 etapa text not null check(etapa in ('P1','P2','P3','P4','P5','P6','P7')),
 nombre text not null, fuente text not null, original jsonb not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','por_validar','en_curso','bloqueado','completado','no_aplica','por_cotizar','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado')),
 responsable text, inicio date, fin date, cantidad numeric(16,4) check(cantidad>0 and cantidad<1e8),
 recibido numeric(16,4) not null default 0 check(recibido>=0 and recibido<1e8),
 precio numeric(16,4) check(precio>=0 and precio<1e9), evidencia text, notas text,
 orden_id uuid references public.ordenes_compra(id), factura_id uuid references public.facturas(id),
 revision integer not null default 1, actualizado_en timestamptz not null default now(),
 unique(proyecto_id,clave),check(fin is null or inicio is null or fin>=inicio)
);
create table public.apertura_historial (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.apertura_items(id),
 anterior jsonb not null, nuevo jsonb not null, usuario_id uuid not null references public.perfiles(id), fecha timestamptz not null default now()
);
create table public.apertura_proyecto_historial (
 id uuid primary key default gen_random_uuid(),proyecto_id uuid not null references public.apertura_proyectos(id),
 anterior jsonb not null,nuevo jsonb not null,usuario_id uuid not null references public.perfiles(id),fecha timestamptz not null default now()
);
alter table public.apertura_proyectos enable row level security;
alter table public.apertura_items enable row level security;
alter table public.apertura_historial enable row level security;
alter table public.apertura_proyecto_historial enable row level security;
create policy ver_aperturas on public.apertura_proyectos for select using(public.ve_compras());
create policy ver_apertura_items on public.apertura_items for select using(public.ve_compras());
create policy ver_apertura_historial on public.apertura_historial for select using(public.ve_compras());
create policy ver_apertura_proyecto_historial on public.apertura_proyecto_historial for select using(public.ve_compras());
revoke all on public.apertura_proyectos,public.apertura_items,public.apertura_historial from public,anon,authenticated;
grant select on public.apertura_proyectos,public.apertura_items,public.apertura_historial to authenticated;
revoke all on public.apertura_proyecto_historial from public,anon,authenticated;
grant select on public.apertura_proyecto_historial to authenticated;
create function public.actualizar_apertura_item(p_item uuid,p_revision integer,p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare antes public.apertura_items;despues public.apertura_items;s uuid;v_estado text;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede editar aperturas.';end if;
 select * into antes from public.apertura_items where id=p_item for update;
 if not found then raise exception 'El registro no existe.';end if;
 if antes.revision is distinct from p_revision then raise exception 'El registro cambió. Recarga antes de guardar.';end if;
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('estado','responsable','inicio','fin','cantidad','recibido','precio','evidencia','notas','orden_id','factura_id')) then raise exception 'Datos de apertura inválidos.';end if;
 v_estado:=p_datos->>'estado';
 if v_estado is null or (antes.tipo in ('actividad','tecnico') and v_estado not in ('pendiente','por_validar','en_curso','bloqueado','completado','no_aplica'))
 or (antes.tipo in ('equipo','referencia') and v_estado not in ('por_validar','por_cotizar','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado','bloqueado','no_aplica')) then raise exception 'Estado inválido para este registro.';end if;
 if length(coalesce(p_datos->>'responsable',''))>200 or length(coalesce(p_datos->>'evidencia',''))>4000 or length(coalesce(p_datos->>'notas',''))>4000 then raise exception 'Texto demasiado largo.';end if;
 if v_estado in ('completado','verificado','no_aplica') and length(trim(coalesce(p_datos->>'evidencia','')))<5 then raise exception 'Registra evidencia o el motivo de no aplicar.';end if;
 select sucursal_id into s from public.apertura_proyectos where id=antes.proyecto_id;
 if nullif(p_datos->>'orden_id','') is not null and not exists(select 1 from public.ordenes_compra where id=(p_datos->>'orden_id')::uuid and sucursal_id=s) then raise exception 'La orden debe pertenecer a la sucursal del proyecto.';end if;
 if nullif(p_datos->>'factura_id','') is not null and not exists(select 1 from public.facturas where id=(p_datos->>'factura_id')::uuid and sucursal_id=s) then raise exception 'La factura debe pertenecer a la sucursal del proyecto.';end if;
 update public.apertura_items set estado=v_estado, responsable=nullif(trim(p_datos->>'responsable'),''),inicio=nullif(p_datos->>'inicio','')::date,fin=nullif(p_datos->>'fin','')::date,
 cantidad=nullif(p_datos->>'cantidad','')::numeric,recibido=coalesce(nullif(p_datos->>'recibido','')::numeric,0),precio=nullif(p_datos->>'precio','')::numeric,
 evidencia=nullif(trim(p_datos->>'evidencia'),''),notas=nullif(trim(p_datos->>'notas'),''),orden_id=nullif(p_datos->>'orden_id','')::uuid,factura_id=nullif(p_datos->>'factura_id','')::uuid,
 revision=revision+1,actualizado_en=now() where id=p_item returning * into despues;
 if v_estado in ('recibido','instalado','verificado') and (despues.cantidad is null or despues.recibido<despues.cantidad) then raise exception 'Confirma la cantidad necesaria y la recepción completa.';end if;
 if v_estado='recibido_parcial' and (despues.cantidad is null or despues.recibido<=0 or despues.recibido>=despues.cantidad) then raise exception 'La recepción parcial debe ser mayor que cero y menor a la cantidad necesaria.';end if;
 insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id) values(p_item,to_jsonb(antes),to_jsonb(despues),auth.uid());
end $$;
revoke all on function public.actualizar_apertura_item(uuid,integer,jsonb) from public,anon;
grant execute on function public.actualizar_apertura_item(uuid,integer,jsonb) to authenticated;
create function public.agregar_apertura_item(p_proyecto uuid,p_tipo text,p_etapa text,p_nombre text) returns uuid
language plpgsql security definer set search_path='' as $$
declare resultado uuid;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede editar aperturas.';end if;
 if p_nombre is null or length(trim(p_nombre)) not between 1 and 500 or p_tipo is null or p_tipo not in ('actividad','equipo','tecnico') or p_etapa is null or p_etapa not in ('P1','P2','P3','P4','P5','P6','P7') then raise exception 'Datos del nuevo registro inválidos.';end if;
 insert into public.apertura_items(proyecto_id,clave,tipo,etapa,nombre,fuente,original,estado)
 values(p_proyecto,'MAN-'||gen_random_uuid()::text,p_tipo,p_etapa,trim(p_nombre),'Alta manual','{}'::jsonb,case when p_tipo='equipo' then 'por_cotizar' else 'pendiente' end) returning id into resultado;
 insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id) select resultado,'{}'::jsonb,to_jsonb(i),auth.uid() from public.apertura_items i where id=resultado;
 return resultado;
end $$;
revoke all on function public.agregar_apertura_item(uuid,text,text,text) from public,anon;
grant execute on function public.agregar_apertura_item(uuid,text,text,text) to authenticated;
create function public.actualizar_apertura_proyecto(p_proyecto uuid,p_revision integer,p_responsable text,p_desde date,p_hasta date,p_presupuesto numeric) returns void
language plpgsql security definer set search_path='' as $$
declare antes public.apertura_proyectos;despues public.apertura_proyectos;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede editar aperturas.';end if;
 select * into antes from public.apertura_proyectos where id=p_proyecto for update;
 if not found then raise exception 'El proyecto no existe.';end if;
 if antes.revision is distinct from p_revision then raise exception 'El proyecto cambió. Recarga antes de guardar.';end if;
 if p_responsable is null or length(trim(p_responsable)) not between 1 and 200 or p_desde is null or p_hasta is null or p_desde>p_hasta then raise exception 'Responsable o fechas inválidos.';end if;
 update public.apertura_proyectos set responsable=trim(p_responsable),objetivo_desde=p_desde,objetivo_hasta=p_hasta,presupuesto=p_presupuesto,revision=revision+1 where id=p_proyecto returning * into despues;
 insert into public.apertura_proyecto_historial(proyecto_id,anterior,nuevo,usuario_id) values(p_proyecto,to_jsonb(antes),to_jsonb(despues),auth.uid());
end $$;
revoke all on function public.actualizar_apertura_proyecto(uuid,integer,text,date,date,numeric) from public,anon;
grant execute on function public.actualizar_apertura_proyecto(uuid,integer,text,date,date,numeric) to authenticated;
commit;

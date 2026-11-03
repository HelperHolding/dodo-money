-- Actividades y validaciones técnicas también pueden ir dentro de una categoría del plano (por ejemplo, "Instalar luminarias" en Iluminación).
-- Quita la restricción de 20261102120000 que limitaba la categoría al equipo y las compras. Mismas funciones, sin ese candado.
begin;
alter table public.apertura_items drop constraint if exists apertura_items_categoria_compra;
create or replace function public.actualizar_apertura_item(p_item uuid,p_revision integer,p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare antes public.apertura_items;despues public.apertura_items;s uuid;v_estado text;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede editar aperturas.';end if;
 select * into antes from public.apertura_items where id=p_item for update;
 if not found then raise exception 'El registro no existe.';end if;
 if antes.revision is distinct from p_revision then raise exception 'El registro cambió. Recarga antes de guardar.';end if;
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('estado','responsable','inicio','fin','cantidad','recibido','precio','evidencia','notas','orden_id','factura_id','categoria')) then raise exception 'Datos de apertura inválidos.';end if;
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
 categoria=case when p_datos?'categoria' then nullif(p_datos->>'categoria','') else categoria end,
 revision=revision+1,actualizado_en=now() where id=p_item returning * into despues;
 if v_estado in ('recibido','instalado','verificado') and (despues.cantidad is null or despues.recibido<despues.cantidad) then raise exception 'Confirma la cantidad necesaria y la recepción completa.';end if;
 if v_estado='recibido_parcial' and (despues.cantidad is null or despues.recibido<=0 or despues.recibido>=despues.cantidad) then raise exception 'La recepción parcial debe ser mayor que cero y menor a la cantidad necesaria.';end if;
 insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id) values(p_item,to_jsonb(antes),to_jsonb(despues),auth.uid());
end $$;
create or replace function public.agregar_apertura_item(p_proyecto uuid,p_tipo text,p_etapa text,p_nombre text,p_categoria text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare resultado uuid;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede editar aperturas.';end if;
 if p_nombre is null or length(trim(p_nombre)) not between 1 and 500 or p_tipo is null or p_tipo not in ('actividad','equipo','tecnico') or p_etapa is null or p_etapa not in ('P1','P2','P3','P4','P5','P6','P7') then raise exception 'Datos del nuevo registro inválidos.';end if;
 insert into public.apertura_items(proyecto_id,clave,tipo,etapa,nombre,fuente,original,estado,categoria)
 values(p_proyecto,'MAN-'||gen_random_uuid()::text,p_tipo,p_etapa,trim(p_nombre),'Alta manual','{}'::jsonb,case when p_tipo='equipo' then 'por_cotizar' else 'pendiente' end,nullif(p_categoria,'')) returning id into resultado;
 insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id) select resultado,'{}'::jsonb,to_jsonb(i),auth.uid() from public.apertura_items i where id=resultado;
 return resultado;
end $$;
revoke all on function public.agregar_apertura_item(uuid,text,text,text,text) from public,anon;
grant execute on function public.agregar_apertura_item(uuid,text,text,text,text) to authenticated;
commit;

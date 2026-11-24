-- Pendientes alineados con el Gantt de aperturas.
-- 1) Cuando todos los pendientes manuales de una tarea del Gantt quedan en «Hecho» (los cancelados no cuentan),
--    la tarea (actividad o validación técnica) se marca completada, con evidencia y su historial.
--    Reabrir un pendiente no regresa la tarea: el avance no se borra solo.
-- 2) El texto del documento de un pendiente ligado a una tarea del Gantt lleva su etapa (P1–P7), para verlo
--    alineado con el Gantt en la sección de pendientes. Se actualizan los ya creados.
begin;
set local lock_timeout='5s';

create or replace function public.completar_apertura_por_pendientes() returns trigger
language plpgsql security definer set search_path='' as $$
declare antes public.apertura_items;despues public.apertura_items;quien text;
begin
 -- Mientras quede un pendiente manual abierto de la misma tarea, no se completa.
 if exists(select 1 from public.tareas t where t.apertura_item_id=new.apertura_item_id and t.origen='manual' and t.estado::text not in ('hecho','cancelada')) then
  return new;
 end if;
 select * into antes from public.apertura_items where id=new.apertura_item_id for update;
 -- Equipo y referencias se cierran con recepción e instalación, no con un pendiente.
 if not found or antes.tipo not in ('actividad','tecnico') or antes.estado in ('completado','no_aplica') then return new;end if;
 select nombre into quien from public.perfiles where id=auth.uid();
 update public.apertura_items set estado='completado',
  evidencia=left(coalesce(nullif(trim(evidencia),'')||E'\n','')||'Pendiente DODO-'||new.numero||' hecho'
   ||coalesce(' por '||nullif(trim(quien),''),'')||' el '||to_char(now() at time zone 'America/Mexico_City','DD/MM/YYYY')||'.',4000),
  revision=revision+1,actualizado_en=now()
 where id=antes.id returning * into despues;
 insert into public.apertura_historial(item_id,anterior,nuevo,usuario_id)
  values(antes.id,to_jsonb(antes),to_jsonb(despues),coalesce(auth.uid(),new.creado_por,new.asignado_a));
 return new;
end $$;
revoke all on function public.completar_apertura_por_pendientes() from public,anon,authenticated;

drop trigger if exists tareas_completan_apertura on public.tareas;
create trigger tareas_completan_apertura after update of estado on public.tareas for each row
 when (new.estado::text='hecho' and old.estado::text<>'hecho' and new.apertura_item_id is not null and new.origen='manual')
 execute function public.completar_apertura_por_pendientes();

-- Mismos nombres que ETAPAS en lib/aperturas.ts.
create or replace function public.etapa_apertura_texto(p_etapa text) returns text
language sql immutable set search_path='' as $$
 select p_etapa||' '||case p_etapa when 'P1' then 'Local y alcance' when 'P2' then 'Proyecto y validación técnica'
  when 'P3' then 'Permisos y contratación' when 'P4' then 'Compras y abastecimiento' when 'P5' then 'Obra e instalaciones'
  when 'P6' then 'Montaje y pruebas' when 'P7' then 'Preparación y apertura' else '' end
$$;

create or replace function public.documento_tarea(p_tipo text,p_id uuid)
returns table(texto text,sucursal_id uuid,ruta text,anulado boolean)
language sql stable security definer set search_path='' as $$
 select 'Orden '||o.folio||' · '||coalesce(p.nombre_comercial,p.razon_social),o.sucursal_id,'/compras/ordenes/'||o.id,o.estado::text='cancelada'
  from public.ordenes_compra o join public.proveedores p on p.id=o.proveedor_id where p_tipo='orden' and o.id=p_id
 union all
 select 'Factura '||coalesce(nullif(concat_ws('-',f.serie,f.folio),''),left(f.uuid,8))||' · '||f.nombre_emisor,f.sucursal_id,'/compras/facturas/'||f.id,f.estado::text='cancelada'
  from public.facturas f where p_tipo='factura' and f.id=p_id
 union all
 select 'Venta '||s.nombre||' · '||to_char(v.fecha,'DD/MM/YYYY'),v.sucursal_id,'/ventas/conciliacion?mes='||to_char(v.fecha,'YYYY-MM')||'&sucursal='||v.sucursal_id,false
  from public.ventas_dia v join public.sucursales s on s.id=v.sucursal_id where p_tipo='ventas_dia' and v.id=p_id
 union all
 select 'Apertura '||s.nombre,a.sucursal_id,'/aperturas/'||a.id,false
  from public.apertura_proyectos a join public.sucursales s on s.id=a.sucursal_id where p_tipo='apertura_proyecto' and a.id=p_id
 union all
 select 'Apertura '||s.nombre||' · '||public.etapa_apertura_texto(i.etapa)||' · '||i.clave||' '||i.nombre,a.sucursal_id,'/aperturas/'||a.id||'/items/'||i.id,false
  from public.apertura_items i join public.apertura_proyectos a on a.id=i.proyecto_id join public.sucursales s on s.id=a.sucursal_id
  where p_tipo='apertura_item' and i.id=p_id
$$;

-- Los pendientes ya ligados a una tarea del Gantt toman el texto con etapa.
update public.tareas t set documento_texto=coalesce((select d.texto from public.documento_tarea('apertura_item',t.apertura_item_id) d),t.documento_texto)
 where t.apertura_item_id is not null;

commit;

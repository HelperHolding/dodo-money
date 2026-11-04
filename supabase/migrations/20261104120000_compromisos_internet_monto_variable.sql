-- Compromisos de internet y teléfono, y compromisos de monto variable (luz, agua, teléfono por consumo).
-- Internet y teléfono no comprueban servicio, pero salen en el calendario de cumplimiento: se cumplen al ligar su factura.
-- Monto variable: no guarda importe ni impuestos; en Pagos sale como previsto en $0 y se paga lo que diga la factura.
begin;
do $$
declare n text;
begin
 select conname into n from pg_constraint where conrelid='public.compromisos'::regclass and contype='c' and pg_get_constraintdef(oid) like '%fumigacion%';
 if n is null then raise exception 'No se encontró el check de concepto de compromisos.';end if;
 execute format('alter table public.compromisos drop constraint %I',n);
end $$;
alter table public.compromisos
 add constraint compromisos_concepto check(concepto in ('renta','fumigacion','basura','trampas_grasa','internet','telefono','otro')),
 add column monto_variable boolean not null default false,
 alter column monto_estimado drop not null,
 add constraint compromisos_monto_variable check(monto_variable or monto_estimado is not null);

create or replace function public.guardar_compromiso(p_id uuid,p_revision integer,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.compromisos;n public.compromisos;v_fin date;v_iva numeric;v_ret_iva text;v_ret_isr text;v_variable boolean;v_monto numeric;
begin
 perform public.exigir_admin_compras();
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('sucursal_id','concepto','descripcion','proveedor_id','monto_estimado','forma_pago','unidad','cada','dia_mes','inicio','fin','requiere_servicio','iva','ret_iva','ret_isr','monto_variable')) then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>1000) then raise exception 'Texto demasiado largo.';end if;
 v_fin:=nullif(p_datos->>'fin','')::date;
 -- Sin las llaves de impuestos (formularios anteriores): sin IVA ni retenciones.
 v_iva:=coalesce(nullif(p_datos->>'iva','')::numeric,0);v_ret_iva:=coalesce(nullif(p_datos->>'ret_iva',''),'ninguna');v_ret_isr:=coalesce(nullif(p_datos->>'ret_isr',''),'ninguna');
 -- Monto variable: sin importe ni impuestos (se paga lo que diga cada factura).
 v_variable:=coalesce(nullif(p_datos->>'monto_variable','')::boolean,false);v_monto:=nullif(p_datos->>'monto_estimado','')::numeric;
 if v_variable then v_monto:=null;v_iva:=0;v_ret_iva:='ninguna';v_ret_isr:='ninguna';
 elsif v_monto is null then raise exception 'Escribe el monto estimado o marca que el monto cambia cada periodo.';end if;
 if p_id is null then
  insert into public.compromisos(sucursal_id,concepto,descripcion,proveedor_id,monto_estimado,forma_pago,unidad,cada,dia_mes,inicio,fin,requiere_servicio,iva,ret_iva,ret_isr,monto_variable)
  values((p_datos->>'sucursal_id')::uuid,p_datos->>'concepto',nullif(trim(p_datos->>'descripcion'),''),(p_datos->>'proveedor_id')::uuid,v_monto,
   (p_datos->>'forma_pago')::public.forma_pago,p_datos->>'unidad',(p_datos->>'cada')::smallint,nullif(p_datos->>'dia_mes','')::smallint,(p_datos->>'inicio')::date,v_fin,
   coalesce((p_datos->>'requiere_servicio')::boolean,false),v_iva,v_ret_iva,v_ret_isr,v_variable) returning * into n;
 else
  select * into a from public.compromisos where id=p_id for update;
  if not found then raise exception 'Compromiso inexistente.';end if;
  if a.revision is distinct from p_revision then raise exception 'El compromiso cambió. Recarga antes de guardar.';end if;
  if (p_datos->>'sucursal_id')::uuid is distinct from a.sucursal_id or p_datos->>'concepto' is distinct from a.concepto or p_datos->>'unidad' is distinct from a.unidad
   or (p_datos->>'cada')::smallint is distinct from a.cada or nullif(p_datos->>'dia_mes','')::smallint is distinct from a.dia_mes or (p_datos->>'inicio')::date is distinct from a.inicio then
   raise exception 'Sucursal, concepto, frecuencia, día e inicio no cambian. Ponle fin a este compromiso y crea otro.';
  end if;
  -- Solo cuentan las fechas con algo guardado; una fila que quedó vacía (factura quitada, omisión quitada) no estorba.
  if v_fin is not null and exists(select 1 from public.compromiso_fechas where compromiso_id=p_id and vence>v_fin
   and (factura_id is not null or omitida_motivo is not null or servicio<>'pendiente')) then raise exception 'Hay fechas con factura, servicio u omisión después del fin.';end if;
  update public.compromisos set descripcion=nullif(trim(p_datos->>'descripcion'),''),proveedor_id=(p_datos->>'proveedor_id')::uuid,monto_estimado=v_monto,
   forma_pago=(p_datos->>'forma_pago')::public.forma_pago,fin=v_fin,requiere_servicio=coalesce((p_datos->>'requiere_servicio')::boolean,false),
   iva=v_iva,ret_iva=v_ret_iva,ret_isr=v_ret_isr,monto_variable=v_variable,revision=revision+1
   where id=p_id returning * into n;
 end if;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(n.id,case when p_id is null then 'Alta' else 'Actualización' end,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
 return n.id;
end $$;

-- Lo que leen el calendario, las alertas y los avisos: los tres orígenes con un estado común.
-- Compromisos: los que comprueban servicio (fumigación, basura, trampas) y, sin servicio, internet y teléfono (se cumplen
-- al ligar su factura). La renta se queda en Pagos.
create or replace function public.cumplimiento_en_rango(p_desde date,p_hasta date,p_hoy date)
returns table(origen text,referencia_id uuid,fecha_id uuid,revision integer,titulo text,detalle text,tipo text,sucursal_id uuid,razon_social_rfc text,ambito text,
 vence date,fecha date,frecuencia text,estado text,falta_evidencia boolean,falta_factura boolean,factura_id uuid,ruta text)
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
begin
 if p_desde is null or p_hasta is null or p_hoy is null or p_hasta<p_desde or p_hasta-p_desde>800 then raise exception 'Rango de fechas inválido.';end if;
 return query
 select 'obligacion'::text,o.id,f.id,coalesce(f.revision,0),o.nombre,coalesce(o.autoridad,''),o.tipo,o.sucursal_id,o.razon_social_rfc,coalesce(s.nombre,rs.razon_social),
  v.d,case when f.estado='cumplida' then f.cumplida_fecha else v.d end,o.frecuencia,
  case when f.estado='omitida' then 'omitida'
   when f.estado='cumplida' and o.con_pago and (f.factura_id is null or fs.estado::text='cancelada') then 'cumplida_sin_factura'
   when f.estado='cumplida' then 'cumplida'
   when v.d<p_hoy then 'vencida'
   when v.d-p_hoy<=(public.dias_aviso_cumplimiento(o.frecuencia))[1] then 'por_vencer'
   else 'pendiente' end,
  false,
  o.con_pago and coalesce(f.estado,'pendiente')<>'omitida' and (f.factura_id is null or fs.estado::text='cancelada'),
  f.factura_id,'/cumplimiento/'||o.id||'#fecha-'||v.d
 from public.cumplimiento_obligaciones o
 cross join lateral public.fechas_cumplimiento(o.id,p_desde,p_hasta) v(d)
 left join public.cumplimiento_fechas f on f.obligacion_id=o.id and f.vence=v.d
 left join public.facturas_saldo fs on fs.id=f.factura_id
 left join public.sucursales s on s.id=o.sucursal_id
 left join public.razones_sociales rs on rs.rfc=o.razon_social_rfc
 union all
 select 'compromiso',c.id,r.fecha_id,r.revision,
  case when c.concepto='otro' and c.descripcion is not null then c.descripcion
   else case c.concepto when 'fumigacion' then 'Fumigación' when 'basura' then 'Recolección de basura' when 'trampas_grasa' then 'Limpieza de trampas de grasa' when 'renta' then 'Renta'
    when 'internet' then 'Internet' when 'telefono' then 'Teléfono' else 'Otro' end end,
  'Compromiso fijo',c.concepto,c.sucursal_id,null::text,s.nombre,r.vence,
  case when c.requiere_servicio and r.servicio='realizado' then r.servicio_fecha else r.vence end,q.frecuencia,
  case when c.requiere_servicio then
   case when r.omitida_motivo is not null or r.servicio='no_realizado' then 'omitida'
    when r.servicio='realizado' and (r.factura_id is null or r.factura_estado='cancelada') then 'cumplida_sin_factura'
    when r.servicio='realizado' then 'cumplida'
    when r.vence<p_hoy then 'vencida'
    when r.vence-p_hoy<=(public.dias_aviso_cumplimiento(q.frecuencia))[1] then 'por_vencer'
    else 'pendiente' end
  -- Sin servicio (internet, teléfono): se cumple con su factura vigente.
  else
   case when r.omitida_motivo is not null then 'omitida'
    when r.factura_id is not null and r.factura_estado is distinct from 'cancelada' then 'cumplida'
    when r.vence<p_hoy then 'vencida'
    when r.vence-p_hoy<=(public.dias_aviso_cumplimiento(q.frecuencia))[1] then 'por_vencer'
    else 'pendiente' end end,
  c.requiere_servicio and r.servicio='realizado' and not exists(select 1 from public.compromiso_evidencias e where e.fecha_id=r.fecha_id and e.confirmado_en is not null),
  r.omitida_motivo is null and r.servicio<>'no_realizado' and (r.factura_id is null or r.factura_estado='cancelada'),
  r.factura_id,'/compras/pagos/compromisos/'||c.id||'#fecha-'||r.vence
 from public.compromisos_en_rango(p_desde,p_hasta) r
 join public.compromisos c on c.id=r.compromiso_id
 cross join lateral (select case when c.unidad='semana' then case when c.cada=1 then 'semanal' else 'quincenal' end
  when c.cada=1 then 'mensual' when c.cada<12 then 'bimestral' else 'anual' end) q(frecuencia)
 left join public.sucursales s on s.id=c.sucursal_id
 where c.requiere_servicio or c.concepto in ('internet','telefono')
 union all
 select 'mantenimiento',m.id,null::uuid,m.revision,a.nombre,m.tarea,m.tipo,a.sucursal_id,null::text,s.nombre,m.programado,
  case when m.estado='completado' then m.realizado else m.programado end,null::text,
  case when m.estado='anulado' then 'omitida' when m.estado='completado' then 'cumplida'
   when m.programado<p_hoy then 'vencida'
   when m.programado-p_hoy<=(public.dias_aviso_cumplimiento('mensual'))[1] then 'por_vencer'
   else 'pendiente' end,
  false,false,null::uuid,'/activos/'||a.id||'#servicio-'||m.id
 from public.activo_mantenimientos m
 join public.activos a on a.id=m.activo_id
 left join public.sucursales s on s.id=a.sucursal_id
 where (case when m.estado='completado' then m.realizado else m.programado end) between p_desde and p_hasta;
end $$;
commit;

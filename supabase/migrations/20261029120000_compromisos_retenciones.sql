-- Impuestos de cada compromiso (como en el gasto sin CFDI): monto_estimado es el subtotal; IVA, retención de IVA y de ISR
-- dan el total a pagar del previsto. Los compromisos existentes quedan sin IVA ni retenciones (pagan su monto tal cual).
begin;
alter table public.compromisos
 add column iva numeric(4,2) not null default 0 check(iva in (0,0.16)),
 add column ret_iva text not null default 'ninguna' check(ret_iva in ('ninguna','dos_tercios')),
 add column ret_isr text not null default 'ninguna' check(ret_isr in ('ninguna','diez','resico')),
 add constraint compromisos_ret_iva_con_iva check(ret_iva='ninguna' or iva>0);

create or replace function public.guardar_compromiso(p_id uuid,p_revision integer,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.compromisos;n public.compromisos;v_fin date;v_iva numeric;v_ret_iva text;v_ret_isr text;
begin
 perform public.exigir_admin_compras();
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('sucursal_id','concepto','descripcion','proveedor_id','monto_estimado','forma_pago','unidad','cada','dia_mes','inicio','fin','requiere_servicio','iva','ret_iva','ret_isr')) then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>1000) then raise exception 'Texto demasiado largo.';end if;
 v_fin:=nullif(p_datos->>'fin','')::date;
 -- Sin las llaves de impuestos (formularios anteriores): sin IVA ni retenciones.
 v_iva:=coalesce(nullif(p_datos->>'iva','')::numeric,0);v_ret_iva:=coalesce(nullif(p_datos->>'ret_iva',''),'ninguna');v_ret_isr:=coalesce(nullif(p_datos->>'ret_isr',''),'ninguna');
 if p_id is null then
  insert into public.compromisos(sucursal_id,concepto,descripcion,proveedor_id,monto_estimado,forma_pago,unidad,cada,dia_mes,inicio,fin,requiere_servicio,iva,ret_iva,ret_isr)
  values((p_datos->>'sucursal_id')::uuid,p_datos->>'concepto',nullif(trim(p_datos->>'descripcion'),''),(p_datos->>'proveedor_id')::uuid,(p_datos->>'monto_estimado')::numeric,
   (p_datos->>'forma_pago')::public.forma_pago,p_datos->>'unidad',(p_datos->>'cada')::smallint,nullif(p_datos->>'dia_mes','')::smallint,(p_datos->>'inicio')::date,v_fin,
   coalesce((p_datos->>'requiere_servicio')::boolean,false),v_iva,v_ret_iva,v_ret_isr) returning * into n;
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
  update public.compromisos set descripcion=nullif(trim(p_datos->>'descripcion'),''),proveedor_id=(p_datos->>'proveedor_id')::uuid,monto_estimado=(p_datos->>'monto_estimado')::numeric,
   forma_pago=(p_datos->>'forma_pago')::public.forma_pago,fin=v_fin,requiere_servicio=coalesce((p_datos->>'requiere_servicio')::boolean,false),
   iva=v_iva,ret_iva=v_ret_iva,ret_isr=v_ret_isr,revision=revision+1
   where id=p_id returning * into n;
 end if;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(n.id,case when p_id is null then 'Alta' else 'Actualización' end,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
 return n.id;
end $$;
commit;

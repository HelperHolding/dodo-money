-- Usa la misma autorización de sucursales que Compras (0068).
-- La principal activa ya opera en sucursales sin filas adicionales de relación.
-- No crea autorizaciones, cambia compañías ni elimina la validación de pertenencia.
begin;
set local lock_timeout='5s';
create or replace function contabilidad_privada.asignar(p_id uuid,p_clave text,p_anterior uuid,p_huella text,p_rfc text,p_codigo text,p_motivo text,p_confirmar boolean)
returns uuid language plpgsql security definer set search_path='' as $asignacion$
declare v_sol jsonb;v_previa public.contabilidad_asignaciones;v_actual public.contabilidad_asignaciones;
 v_mov public.contabilidad_movimientos;v_cuenta public.contabilidad_catalogo;v_nombre text;
begin
 if auth.uid() is null or not exists(select 1 from public.perfiles p where p.id=auth.uid() and p.rol::text='admin' and p.activo and not p.debe_cambiar_contrasena) then raise exception 'Solo administración asigna cuentas.';end if;
 if p_id is null or p_clave is null or p_huella is null or p_rfc is null or p_confirmar is distinct from true or coalesce(length(trim(p_motivo)),0) not between 12 and 1000 then raise exception 'Revisa la equivalencia y confirma con un motivo específico.';end if;
 v_sol:=jsonb_build_array(p_clave,p_anterior,p_huella,p_rfc,p_codigo,p_motivo,p_confirmar);
 perform pg_advisory_xact_lock(hashtextextended('contabilidad-solicitud:'||p_id,0));
 select * into v_previa from public.contabilidad_asignaciones a where a.id=p_id;
 if found then
  if v_previa.autor<>auth.uid() or v_previa.solicitud is distinct from v_sol then raise exception 'Solicitud ya utilizada con otros datos.';end if;
  return v_previa.id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('contabilidad-clave:'||p_clave,0));
 -- Bloquear la fuente antes de releer la vista (incluye cabecera y conceptos).
 if p_clave like 'concepto:%' then
  perform 1 from public.facturas f join public.factura_conceptos c on c.factura_id=f.id where c.id::text=substring(p_clave from 10) for update of f;
  perform 1 from public.factura_conceptos c where c.id::text=substring(p_clave from 10) for update;
 elsif p_clave like 'factura:%' then
  perform 1 from public.facturas f where f.id::text=substring(p_clave from 9) for update;
 elsif p_clave like 'gasto:%' then
  perform 1 from public.gastos_caja_chica g where g.id::text=substring(p_clave from 7) for update;
 elsif p_clave like 'ajuste:%' then
  perform 1 from public.gastos_mes g where g.id::text=substring(p_clave from 8) for update;
 else raise exception 'Origen no permitido.';end if;
 select * into v_mov from public.contabilidad_movimientos m where m.clave=p_clave;
 if not found or v_mov.huella is distinct from p_huella then raise exception 'El documento cambió o ya no está vigente; revisa nuevamente.';end if;
 select * into v_actual from public.contabilidad_asignaciones a where a.clave=p_clave order by a.revision desc limit 1;
 if v_actual.id is distinct from p_anterior then raise exception 'La asignación cambió; vuelve a revisar.';end if;
 if v_mov.rfc is not null and v_mov.rfc<>p_rfc then raise exception 'Conserva la razón social del documento.';end if;
 if not exists(select 1 from public.razones_sociales r where r.rfc=p_rfc and r.activa) or
 (v_mov.sucursal_id is not null and not public.razon_admite_sucursal(p_rfc,v_mov.sucursal_id)) then raise exception 'Razón social % o sucursal % no autorizada para %.',p_rfc,coalesce(v_mov.sucursal_id::text,'Oficina'),p_clave;end if;
 if p_codigo is not null then
  select * into v_cuenta from public.contabilidad_catalogo c where c.rfc=p_rfc and c.codigo=p_codigo;
  if not found or not v_cuenta.capturable then raise exception 'Elige una cuenta capturable de esta razón social.';end if;
  -- Proteger memo y oficina: no convertir compras en gasto ni oficina en sucursal.
  if (v_mov.categoria='insumos' and p_codigo not like '502-%') or
   (v_mov.categoria='inversiones' and p_codigo not similar to '(15[0-9]|17[0-9])-%') or
   (coalesce(v_mov.categoria,'otros') not in ('insumos','inversiones') and
    ((v_mov.sucursal_id is null and p_codigo not like '603-%') or (v_mov.sucursal_id is not null and p_codigo not like '602-%'))) then raise exception 'La cuenta cruza memo, gasto de tienda u oficina. Revisa primero la categoría del origen.';end if;
 end if;
 if v_actual.id is not null and v_actual.codigo is not distinct from p_codigo and v_actual.rfc=p_rfc and v_actual.huella=p_huella then return v_actual.id;end if;
 select p.nombre into v_nombre from public.perfiles p where p.id=auth.uid();
 insert into public.contabilidad_asignaciones(id,clave,revision,rfc,codigo,anterior,huella,origen,motivo,solicitud,autor,autor_nombre)
 values(p_id,p_clave,coalesce(v_actual.revision,0)+1,p_rfc,p_codigo,v_actual.id,p_huella,to_jsonb(v_mov),trim(p_motivo),v_sol,auth.uid(),v_nombre);
 return p_id;
end $asignacion$;
revoke all on function contabilidad_privada.asignar(uuid,text,uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function contabilidad_privada.asignar(uuid,text,uuid,text,text,text,text,boolean) to authenticated;
commit;

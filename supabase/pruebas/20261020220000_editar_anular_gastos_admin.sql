-- Reversible: el mensaje PRUEBAS OK deshace todos los datos del ensayo.
do $pruebas$
declare a uuid;u uuid;s uuid;g uuid;i uuid;e uuid;sol uuid:=gen_random_uuid();borrar uuid:=gen_random_uuid();d jsonb;
 saldo0 numeric;saldo1 numeric;foto text;v bigint;cierres jsonb;disponible jsonb;exceso numeric;
begin
 select p.id,p.sucursal_id into a,s from public.perfiles p where p.activo and not p.debe_cambiar_contrasena and p.rol::text='admin'
 and p.sucursal_id is not null and exists(select 1 from public.cajas c where c.sucursal_id=p.sucursal_id and c.tipo='caja_chica') limit 1;
 select id into u from public.perfiles where activo and not debe_cambiar_contrasena and rol::text in ('gerente','encargado','operacion') limit 1;
 if a is null or u is null then raise exception 'FALTAN DATOS: admin con sucursal/caja chica y otro usuario operativo activo.';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 select saldo into saldo0 from public.saldos_cajas where sucursal_id=s and tipo='caja_chica';
 select jsonb_agg(to_jsonb(c) order by c.id) into cierres from public.cierres_dia c where c.sucursal_id=s;
 foto:=s::text||'/ensayo-gasto.jpg';
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,origen,cuenta_pl,foto_path,registrado_por)
 values(s,public.hoy_mx(),'Ensayo gasto admin',200,'nota','caja_chica','otros',foto,a) returning id into g;
 d:=jsonb_build_object('fecha',public.hoy_mx(),'concepto','Concepto corregido','proveedor','Proveedor ensayo','monto',140,'comprobante','nota','origen','caja_chica','cuenta_pl','consumibles_equipo','uuid_cfdi',null,'pagado_por',null);
 execute 'set local role authenticated';
 perform public.editar_anular_gasto_admin(sol,g,1,'editar',d,'Corrección de captura de prueba');
 perform public.editar_anular_gasto_admin(sol,g,1,'editar',d,'Corrección de captura de prueba');
 if not exists(select 1 from public.gastos_caja_chica where id=g and monto=140 and version=2 and foto_path=foto) then raise exception 'FALLÓ: edición, versión o comprobante.';end if;
 if (select count(*) from public.gastos_historial where id=sol)<>1 then raise exception 'FALLÓ: historial duplicado.';end if;
 disponible:=public.disponibilidad_boveda(s);
 exceso:=greatest(1,(disponible->>'saldo')::numeric-(disponible->>'fondo')::numeric-(disponible->>'reservado')::numeric-(disponible->>'salidas')::numeric+50);
 begin
  perform public.editar_anular_gasto_admin(gen_random_uuid(),g,2,'editar',d||jsonb_build_object('origen','boveda','monto',exceso),'Prueba de fondo protegido');raise exception 'FALLÓ: usa fondo reservado.';
 exception when raise_exception then if sqlerrm not like '%fondo o efectivo reservado%' then raise;end if;end;
 begin
  perform public.editar_anular_gasto_admin(gen_random_uuid(),g,1,'editar',d,'Versión antigua protegida');raise exception 'FALLÓ: sobrescritura.';
 exception when raise_exception then if sqlerrm not like '%cambió%' then raise;end if;end;
 begin
  perform public.editar_anular_gasto_admin(gen_random_uuid(),g,2,'eliminar','{}','');raise exception 'FALLÓ: sin motivo.';
 exception when raise_exception then if sqlerrm not like '%motivo%' then raise;end if;end;
 begin
  update public.gastos_caja_chica set monto=1 where id=g;raise exception 'FALLÓ: escritura directa.';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin
  perform public.editar_anular_gasto_admin(gen_random_uuid(),g,2,'eliminar','{}','Prueba de autorización');raise exception 'FALLÓ: otro rol elimina.';
 exception when raise_exception then if sqlerrm not like '%Solo administración%' then raise;end if;end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.editar_anular_gasto_admin(borrar,g,2,'eliminar','{}','Captura equivocada de prueba');
 perform public.editar_anular_gasto_admin(borrar,g,2,'eliminar','{}','Captura equivocada de prueba');
 if not exists(select 1 from public.gastos_caja_chica where id=g and anulado_en is not null and anulado_por=a and monto=140 and foto_path=foto) then raise exception 'FALLÓ: eliminación conserva registro y comprobante.';end if;
 select saldo into saldo1 from public.saldos_cajas where sucursal_id=s and tipo='caja_chica';
 if saldo1 is distinct from saldo0 then raise exception 'FALLÓ: saldo o doble devolución.';end if;
 if exists(select 1 from public.gastos_caja_chica where id=g and anulado_en is null) then raise exception 'FALLÓ: eliminado cuenta como activo en P&L.';end if;
 execute 'reset role';
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,origen,cuenta_pl,registrado_por,informativo,motivo_informativo,referencia_informativa,informado_por,informado_en,respaldo_informativo)
 values(s,public.hoy_mx()-1,'Ensayo informativo',75,'nota','caja_chica','otros',a,true,'Cuadrado en corte de prueba',gen_random_uuid()::text,a,now(),foto) returning id into i;
 execute 'set local role authenticated';
 perform public.editar_anular_gasto_admin(gen_random_uuid(),i,1,'eliminar','{}','Informativo duplicado de prueba');
 select saldo into saldo1 from public.saldos_cajas where sucursal_id=s and tipo='caja_chica';
 if saldo1 is distinct from saldo0 then raise exception 'FALLÓ: devolución ficticia de informativo.';end if;
 execute 'reset role';
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,origen,cuenta_pl,registrado_por,repuesto_por,repuesto_en,pagado_por)
 values(s,public.hoy_mx(),'Ensayo reembolso',50,'nota','empleado','otros',a,a,now(),a) returning id into e;
 execute 'set local role authenticated';
 begin
  perform public.editar_anular_gasto_admin(gen_random_uuid(),e,1,'eliminar','{}','Prueba reembolso protegido');raise exception 'FALLÓ: reembolso duplicado.';
 exception when raise_exception then if sqlerrm not like '%reposición o reembolso%' then raise;end if;end;
 execute 'reset role';
 if (select jsonb_agg(to_jsonb(c) order by c.id) from public.cierres_dia c where c.sucursal_id=s) is distinct from cierres then raise exception 'FALLÓ: cierre anterior modificado.';end if;
 if has_function_privilege('anon','public.editar_anular_gasto_admin(uuid,uuid,bigint,text,jsonb,text)','execute') then raise exception 'FALLÓ: anónimo ejecuta.';end if;
 raise exception 'PRUEBAS OK — gastos solo admin · edición con versión · eliminación con motivo · saldo sin doble devolución · informativo sin devolución ficticia · fondo y reservas protegidos · excluido del P&L activo · historial único · comprobante conservado · reembolso protegido · cierres intactos · otros roles sin cambios · sin escritura directa · anónimo sin ejecución';
end
$pruebas$;

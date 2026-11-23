-- Reversible: el mensaje PRUEBAS OK deshace todos los datos del ensayo.
do $pruebas$
declare a uuid;u uuid;s uuid;otra uuid;g uuid;i uuid;sol uuid:=gen_random_uuid();foto text;saldo0 numeric;saldo1 numeric;
begin
 select p.id,p.sucursal_id into a,s from public.perfiles p where p.activo and not p.debe_cambiar_contrasena and p.rol::text='admin'
 and p.sucursal_id is not null and exists(select 1 from public.cajas c where c.sucursal_id=p.sucursal_id and c.tipo='caja_chica') limit 1;
 select id into u from public.perfiles where activo and not debe_cambiar_contrasena and rol::text in ('gerente','encargado','operacion') limit 1;
 select id into otra from public.sucursales where id<>s limit 1;
 if a is null or u is null or otra is null then raise exception 'FALTAN DATOS: admin con sucursal/caja chica, otro usuario operativo y otra sucursal.';end if;
 foto:=s::text||'/ensayo-foto-despues.jpg';
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,origen,cuenta_pl,registrado_por)
 values(s,public.hoy_mx(),'Ensayo gasto sin foto',120,'nota','caja_chica','otros',a) returning id into g;
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,origen,cuenta_pl,registrado_por,informativo,motivo_informativo,referencia_informativa,informado_por,informado_en,respaldo_informativo)
 values(s,public.hoy_mx()-1,'Ensayo informativo sin foto',80,'nota','caja_chica','otros',a,true,'Cuadrado en corte de prueba',gen_random_uuid()::text,a,now(),s::text||'/respaldo-ensayo.jpg') returning id into i;
 select saldo into saldo0 from public.saldos_cajas where sucursal_id=s and tipo='caja_chica';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin
  perform public.agregar_foto_gasto_admin(gen_random_uuid(),g,1,foto);raise exception 'FALLÓ: otro rol agrega foto.';
 exception when raise_exception then if sqlerrm not like '%Solo administración%' then raise;end if;end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin
  perform public.agregar_foto_gasto_admin(gen_random_uuid(),g,1,otra::text||'/ajena.jpg');raise exception 'FALLÓ: foto de otra sucursal.';
 exception when raise_exception then if sqlerrm not like '%sucursal del gasto%' then raise;end if;end;
 perform public.agregar_foto_gasto_admin(sol,g,1,foto);
 perform public.agregar_foto_gasto_admin(sol,g,1,foto);
 if not exists(select 1 from public.gastos_caja_chica where id=g and foto_path=foto and version=2 and monto=120 and origen='caja_chica' and not informativo and anulado_en is null) then raise exception 'FALLÓ: foto, versión o importe.';end if;
 if (select count(*) from public.gastos_historial where gasto_id=g and accion='agregar_foto')<>1 then raise exception 'FALLÓ: historial duplicado o ausente.';end if;
 begin
  perform public.agregar_foto_gasto_admin(gen_random_uuid(),g,2,s::text||'/otra.jpg');raise exception 'FALLÓ: reemplaza foto existente.';
 exception when raise_exception then if sqlerrm not like '%ya tiene foto%' then raise;end if;end;
 begin
  perform public.agregar_foto_gasto_admin(gen_random_uuid(),i,7,foto);raise exception 'FALLÓ: versión antigua.';
 exception when raise_exception then if sqlerrm not like '%cambió%' then raise;end if;end;
 perform public.agregar_foto_gasto_admin(gen_random_uuid(),i,1,foto);
 if not exists(select 1 from public.gastos_caja_chica where id=i and foto_path=foto and informativo and monto=80) then raise exception 'FALLÓ: informativo sin foto.';end if;
 begin
  update public.gastos_caja_chica set foto_path=null where id=g;raise exception 'FALLÓ: escritura directa.';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
 select saldo into saldo1 from public.saldos_cajas where sucursal_id=s and tipo='caja_chica';
 if saldo1 is distinct from saldo0 then raise exception 'FALLÓ: el saldo cambió al agregar la foto.';end if;
 if has_function_privilege('anon','public.agregar_foto_gasto_admin(uuid,uuid,bigint,text)','execute') then raise exception 'FALLÓ: anónimo ejecuta.';end if;
 raise exception 'PRUEBAS OK — foto agregada sin mover saldo · importe y origen intactos · informativo admitido · historial único · solo admin · no reemplaza foto existente · versión protegida · foto de la misma sucursal · sin escritura directa · anónimo sin ejecución';
end
$pruebas$;

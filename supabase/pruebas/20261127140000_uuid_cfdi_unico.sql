-- Ensayo reversible de HD-19 con datos reales: PRUEBAS OK revierte todo el bloque.
do $$
declare f public.facturas;s uuid;p uuid;g uuid;c record;
begin
 select * into f from public.facturas where uuid is not null order by creado_en desc limit 1;
 select id into s from public.sucursales order by nombre limit 1;
 select id into p from public.perfiles where activo order by nombre limit 1;
 if f.id is null or s is null or p is null then raise exception 'FALTAN DATOS: una factura con UUID, una sucursal y un perfil activo.';end if;

 -- buscar_uuid_cfdi la encuentra aunque llegue en minúsculas y con espacios; excluyéndola, no hay nada.
 select * into c from public.buscar_uuid_cfdi(' '||lower(f.uuid)||' ') where registro_id=f.id;
 if not found or c.origen<>'factura' or c.liga<>'/compras/facturas/'||f.id or c.creado_en<>f.creado_en then raise exception 'FALLÓ: buscar_uuid_cfdi no encontró la factura %',f.id;end if;
 if exists(select 1 from public.buscar_uuid_cfdi(f.uuid,f.id)) then raise exception 'FALLÓ: buscar_uuid_cfdi no excluye el registro editado';end if;

 -- Un gasto de caja chica con el UUID de la factura, en minúsculas, se rechaza con el aviso.
 begin
  insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,uuid_cfdi,registrado_por,cuenta_pl)
  values(s,public.hoy_mx(),'Ensayo HD-19',1,'cfdi',lower(f.uuid),p,'otros') returning id into g;
  raise exception 'FALLÓ: se registró un gasto con el UUID de la factura %',f.id;
 exception when others then
  if sqlerrm not like 'Este UUID ya se subió%' then raise exception 'FALLÓ: mensaje inesperado: %',sqlerrm;end if;
 end;

 -- Un gasto con UUID nuevo sí entra, y otro gasto con ese mismo UUID ya no.
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,uuid_cfdi,registrado_por,cuenta_pl)
 values(s,public.hoy_mx(),'Ensayo HD-19',1,'cfdi','00000000-0000-4000-8000-00000000d019',p,'otros') returning id into g;
 begin
  insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,uuid_cfdi,registrado_por,cuenta_pl)
  values(s,public.hoy_mx(),'Ensayo HD-19',1,'cfdi',' 00000000-0000-4000-8000-00000000D019',p,'otros');
  raise exception 'FALLÓ: se registró dos veces el UUID de un gasto';
 exception when others then
  if sqlerrm not like 'Este UUID ya se subió%' then raise exception 'FALLÓ: mensaje inesperado: %',sqlerrm;end if;
 end;
 if not exists(select 1 from public.buscar_uuid_cfdi('00000000-0000-4000-8000-00000000D019') where origen='gasto' and registro_id=g and liga='/caja-chica#gasto-'||g) then raise exception 'FALLÓ: buscar_uuid_cfdi no encontró el gasto';end if;

 if has_function_privilege('anon','public.buscar_uuid_cfdi(text,uuid)','execute') then raise exception 'FALLÓ: anónimo ejecuta buscar_uuid_cfdi';end if;
 raise exception 'PRUEBAS OK — buscar_uuid_cfdi encuentra la factura % · mayúsculas y espacios · gasto con UUID de factura rechazado · gasto repetido rechazado · anónimo sin ejecución',f.id;
end $$;

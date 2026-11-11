-- Ejecutar completo después de 20261111120000_rappi_fin_varias_tiendas.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Comprueba: una sucursal importa reportes de dos tiendas y ambos quedan activos; un reporte nuevo de una tienda sustituye
-- solo a la versión de esa tienda; una tienda ya ligada a otra sucursal sigue rechazada.
begin;
do $prueba$
declare a uuid;rp text;s uuid:=gen_random_uuid();otra uuid:=gen_random_uuid();t1 uuid:=gen_random_uuid();t2 uuid:=gen_random_uuid();t1b uuid:=gen_random_uuid();
 fuente text:=encode(decode('504b030400','hex'),'base64');fuente2 text:=encode(decode('504b030401','hex'),'base64');
 m jsonb;
 rep jsonb;
begin
 select id into a from public.perfiles where rol::text='admin' and activo limit 1;
 select rfc into rp from public.razones_sociales where activa and principal;
 if a is null or rp is null then raise exception 'FALTAN DATOS: un admin activo y la razón social principal activa.';end if;
 insert into public.sucursales(id,nombre) values(s,'ENSAYO RAPPI TIENDAS '||s),(otra,'ENSAYO RAPPI OTRA '||otra);
 m:=jsonb_build_object('fila',3,'fecha','2026-01-01','orden','99999001','tienda','99999000','lote','99999100','tipo','ORDEN','estado','finished','bruta',116,'aliado',0,'dar',0,'compensacion',0,'cancelacion',0,'comision',-20.88,'creditoDar',0,'ivaComision',-3.3408,'creditoDarIva',0,'retencionIva',-8,'retencionIsr',-2.5,'neto',81.2792);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 -- Tienda 99999000 (normal) y 99999009 (Turbo) en la misma sucursal y periodo.
 rep:=jsonb_build_object('desde','2026-01-01','hasta','2026-01-01','tienda','99999000','movimientos',jsonb_build_array(m),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb);
 if public.importar_rappi_financiero(t1,s,rp,'normal.xlsx',fuente,rep,'{}','Prueba tienda normal')<>t1 then raise exception 'FALLÓ: no importó la tienda normal';end if;
 rep:=jsonb_build_object('desde','2026-01-01','hasta','2026-01-01','tienda','99999009','movimientos',jsonb_build_array(m||jsonb_build_object('tienda','99999009','orden','99999002')),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb);
 if public.importar_rappi_financiero(t2,s,rp,'turbo.xlsx',fuente,rep,'{}','Prueba tienda Turbo')<>t2 then raise exception 'FALLÓ: no importó la segunda tienda';end if;
 -- Nueva versión de la tienda normal: solo pide sustituir la suya.
 rep:=jsonb_build_object('desde','2026-01-01','hasta','2026-01-01','tienda','99999000','movimientos',jsonb_build_array(m||jsonb_build_object('orden','99999003')),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb);
 begin perform public.importar_rappi_financiero(gen_random_uuid(),s,rp,'normal2.xlsx',fuente2,rep,array[t1,t2],'Prueba que sustituiría ambas');raise exception 'FALLÓ: aceptó sustituir la versión de otra tienda';
 exception when others then if sqlerrm not like '%Los reportes activos cambiaron%' then raise exception 'FALLÓ: sustituir de más dio "%"',sqlerrm; end if; end;
 if public.importar_rappi_financiero(t1b,s,rp,'normal2.xlsx',fuente2,rep,array[t1],'Prueba nueva versión tienda normal')<>t1b then raise exception 'FALLÓ: no importó la nueva versión';end if;
 -- La tienda Turbo no puede pasar a otra sucursal.
 rep:=jsonb_build_object('desde','2026-01-02','hasta','2026-01-02','tienda','99999009','movimientos',jsonb_build_array(m||jsonb_build_object('tienda','99999009','orden','99999004','fecha','2026-01-02')),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb);
 begin perform public.importar_rappi_financiero(gen_random_uuid(),otra,rp,'turbo-otra.xlsx',fuente,rep,'{}','Prueba tienda en otra sucursal');raise exception 'FALLÓ: la tienda cambió de sucursal';
 exception when others then if sqlerrm not like '%otra sucursal financiera%' then raise exception 'FALLÓ: otra sucursal dio "%"',sqlerrm; end if; end;
 reset role;
 if (select sustituida_por from public.rappi_fin_importaciones where id=t1) is distinct from t1b then raise exception 'FALLÓ: la versión anterior de la tienda normal no quedó sustituida';end if;
 if (select sustituida_en from public.rappi_fin_importaciones where id=t2) is not null then raise exception 'FALLÓ: se sustituyó la tienda Turbo';end if;
 raise exception 'PRUEBAS OK';
end;
$prueba$;
rollback;

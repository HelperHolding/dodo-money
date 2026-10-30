-- Ejecutar completo después de 20261030120000_rappi_fin_razon_principal.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Comprueba: la razón principal importa para una sucursal sin liga explícita; otra razón activa sin liga sigue rechazada.
begin;
do $prueba$
declare a uuid;rp text;otra text;s uuid:=gen_random_uuid();sol uuid:=gen_random_uuid();m jsonb;rep jsonb;fuente text:=encode(decode('504b030400','hex'),'base64');
begin
 select id into a from public.perfiles where rol::text='admin' and activo limit 1;
 select rfc into rp from public.razones_sociales where activa and principal;
 select rfc into otra from public.razones_sociales where activa and not principal order by rfc limit 1;
 if a is null or rp is null then raise exception 'FALTAN DATOS: un admin activo y la razón social principal activa.';end if;
 insert into public.sucursales(id,nombre) values(s,'ENSAYO RAZON PRINCIPAL '||sol);
 if exists(select 1 from public.razon_social_sucursales x where x.sucursal_id=s) then raise exception 'FALLÓ: la sucursal de ensayo ya tiene liga';end if;
 m:=jsonb_build_object('fila',3,'fecha','2026-01-01','orden','99999001','tienda','99999000','lote','99999100','tipo','ORDEN','estado','pending_review','bruta',116,'aliado',0,'dar',0,'compensacion',0,'cancelacion',0,'comision',-20.88,'creditoDar',0,'ivaComision',-3.3408,'creditoDarIva',0,'retencionIva',-8,'retencionIsr',-2.5,'neto',81.2792);
 rep:=jsonb_build_object('desde','2026-01-01','hasta','2026-01-01','tienda','99999000','movimientos',jsonb_build_array(m),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 if otra is not null then
  begin perform public.importar_rappi_financiero(gen_random_uuid(),s,otra,'otra.xlsx',fuente,rep,'{}','Prueba de razón social sin liga');raise exception 'FALLÓ: otra razón sin liga importó';
  exception when others then if sqlerrm not like '%no autorizada%' then raise; end if; end;
 end if;
 if public.importar_rappi_financiero(sol,s,rp,'principal.xlsx',fuente,rep,'{}','Prueba de razón social principal')<>sol then raise exception 'FALLÓ: la razón principal no importó';end if;
 reset role;
 if not exists(select 1 from public.rappi_fin_importaciones x where x.id=sol and x.sucursal_id=s and x.rfc=rp) then raise exception 'FALLÓ: no quedó la importación de la razón principal';end if;
 if exists(select 1 from public.razon_social_sucursales x where x.sucursal_id=s) then raise exception 'FALLÓ: se creó una liga de sucursal';end if;
 raise exception 'PRUEBAS OK';
end;
$prueba$;
rollback;

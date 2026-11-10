-- Ejecutar completo después de 20261110120000_rappi_fin_retroactivos.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Comprueba: una orden y su ajuste retroactivo (comisión devuelta, DAR revertido y retención sobre el DAR) se importan juntos;
-- se rechazan el ajuste con venta, con signo de cargo, sobre una compensación, repetido o con marca inválida, y una comisión
-- a favor sin la marca.
begin;
do $prueba$
declare a uuid;rp text;s uuid:=gen_random_uuid();sol uuid:=gen_random_uuid();fuente text:=encode(decode('504b030400','hex'),'base64');
 base jsonb;orig_a jsonb;retro_a jsonb;orig_b jsonb;retro_b jsonb;malo jsonb;caso record;
begin
 select id into a from public.perfiles where rol::text='admin' and activo limit 1;
 select rfc into rp from public.razones_sociales where activa and principal;
 if a is null or rp is null then raise exception 'FALTAN DATOS: un admin activo y la razón social principal activa.';end if;
 insert into public.sucursales(id,nombre) values(s,'ENSAYO RAPPI RETROACTIVO '||sol);
 base:=jsonb_build_object('fila',3,'fecha','2026-01-01','tienda','99999000','tipo','ORDEN','estado','finished','bruta',0,'aliado',0,'dar',0,'compensacion',0,'cancelacion',0,'comision',0,'creditoDar',0,'ivaComision',0,'creditoDarIva',0,'retencionIva',0,'retencionIsr',0);
 -- Orden A sin DAR y su devolución de comisión.
 orig_a:=base||jsonb_build_object('orden','99999001','lote','99999100','bruta',116,'comision',-20.88,'ivaComision',-3.3408,'retencionIva',-8,'retencionIsr',-2.5,'neto',81.2792);
 retro_a:=base||jsonb_build_object('fila',5,'orden','99999001','lote','99999200','comision',20.88,'ivaComision',3.3408,'neto',24.2208,'retroactivo',true,'loteOriginal','99999100');
 -- Orden B con DAR: el ajuste revierte DAR y créditos y retiene sobre los 100 del DAR.
 orig_b:=base||jsonb_build_object('fila',4,'orden','99999002','lote','99999100','bruta',216,'dar',-100,'comision',-20.88,'creditoDar',86.2069,'ivaComision',-3.3408,'creditoDarIva',13.7931,'retencionIva',-8,'retencionIsr',-2.5,'neto',181.2792);
 retro_b:=base||jsonb_build_object('fila',6,'orden','99999002','lote','99999200','dar',100,'comision',20.88,'creditoDar',-86.2069,'ivaComision',3.3408,'creditoDarIva',-13.7931,'retencionIva',-6.896552,'retencionIsr',-2.155172,'neto',15.169076,'retroactivo',true,'loteOriginal','99999100');
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 for caso in select * from (values
  ('con venta',retro_a||jsonb_build_object('bruta',10,'neto',34.2208),'Signo del ajuste'),
  ('signo de cargo',retro_a||jsonb_build_object('comision',-20.88,'neto',-17.5392),'Signo del ajuste'),
  ('retención a favor',retro_a||jsonb_build_object('retencionIva',1,'neto',25.2208),'Signo del ajuste'),
  ('marca falsa',retro_a||jsonb_build_object('retroactivo',false),'Marca retroactiva'),
  ('paidlot raro',retro_a||jsonb_build_object('loteOriginal','x1'),'Paidlot retroactivo'),
  ('compensación',retro_a||jsonb_build_object('tipo','COMPENSACIÓN','comision',0,'ivaComision',0,'compensacion',-5,'neto',-5),'Solo una orden'),
  ('sin marca',(retro_a-'retroactivo'-'loteOriginal')||jsonb_build_object('orden','99999003'),'Signo financiero')
 ) t(nombre,mov,error) loop
  malo:=jsonb_build_object('desde','2026-01-01','hasta','2026-01-01','tienda','99999000','movimientos',jsonb_build_array(orig_a,caso.mov),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb);
  begin perform public.importar_rappi_financiero(gen_random_uuid(),s,rp,'malo.xlsx',fuente,malo,'{}','Prueba de ajuste retroactivo inválido');raise exception 'FALLÓ: se aceptó el ajuste %',caso.nombre;
  exception when others then if sqlerrm not like '%'||caso.error||'%' then raise exception 'FALLÓ: % dio "%"',caso.nombre,sqlerrm; end if; end;
 end loop;
 malo:=jsonb_build_object('desde','2026-01-01','hasta','2026-01-01','tienda','99999000','movimientos',jsonb_build_array(orig_a,retro_a,retro_a||jsonb_build_object('fila',9)),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb);
 begin perform public.importar_rappi_financiero(gen_random_uuid(),s,rp,'doble.xlsx',fuente,malo,'{}','Prueba de ajuste retroactivo repetido');raise exception 'FALLÓ: se aceptó un ajuste repetido';
 exception when others then if sqlerrm not like '%duplicado%' then raise exception 'FALLÓ: repetido dio "%"',sqlerrm; end if; end;
 if public.importar_rappi_financiero(sol,s,rp,'octubre.xlsx',fuente,jsonb_build_object('desde','2026-01-01','hasta','2026-01-01','tienda','99999000','movimientos',jsonb_build_array(orig_a,orig_b,retro_a,retro_b),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb),'{}','Prueba de ajustes retroactivos válidos')<>sol then raise exception 'FALLÓ: no importó la orden con su ajuste retroactivo';end if;
 reset role;
 if (select jsonb_array_length(reporte->'movimientos') from public.rappi_fin_importaciones where id=sol) is distinct from 4 then raise exception 'FALLÓ: no quedaron los cuatro movimientos';end if;
 raise exception 'PRUEBAS OK';
end;
$prueba$;
rollback;

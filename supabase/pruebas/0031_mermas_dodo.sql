-- Ejecutar después de 0031. PRUEBAS OK es un ERROR intencional: revierte todos los datos de prueba.
do $$
declare a uuid; c uuid; s uuid; dias jsonb; filas jsonb; resultado jsonb; prueba jsonb;
begin
  select id into a from perfiles where activo and rol::text='admin' limit 1;
  select id into c from perfiles where activo and rol::text='corporativo' limit 1;
  select id into s from sucursales limit 1;
  if a is null or c is null or s is null then raise exception 'FALTAN DATOS: admin, corporativo y sucursal.'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  dias:=jsonb_build_array(jsonb_build_object('sucursal_id',s,'fecha',hoy_mx()-1),jsonb_build_object('sucursal_id',s,'fecha',hoy_mx()));
  filas:=jsonb_build_array(jsonb_build_object('sucursal_id',s,'fecha',hoy_mx(),'tipo','insumo','clave','PRUEBA','nombre','Queso','unidad','Kg','categoria','Ingrediente','cantidad',2,'costo',10,'sin_costo',false));
  resultado:=importar_mermas_dodo('prueba.xlsx',repeat('a',64),dias,filas);
  if (resultado->>'dias')::int<>2 or not exists(select 1 from mermas_dodo where sucursal_id=s and fecha=hoy_mx() and clave='PRUEBA' and costo=10) then raise exception 'FALLÓ: alta'; end if;
  perform importar_mermas_dodo('prueba.xlsx',repeat('b',64),dias,filas);
  if (select count(*) from mermas_dodo where sucursal_id=s and fecha=hoy_mx())<>1 then raise exception 'FALLÓ: duplicados'; end if;
  perform importar_mermas_dodo('vacío.xlsx',repeat('c',64),jsonb_build_array(jsonb_build_object('sucursal_id',s,'fecha',hoy_mx()-1)),'[]');
  if not exists(select 1 from mermas_dodo where sucursal_id=s and fecha=hoy_mx() and clave='PRUEBA') then raise exception 'FALLÓ: borró otro día'; end if;
  perform importar_mermas_dodo('vacío.xlsx',repeat('d',64),dias,'[]');
  if exists(select 1 from mermas_dodo where sucursal_id=s and fecha=hoy_mx()) then raise exception 'FALLÓ: no vació día'; end if;
  for prueba in select * from (values
    (jsonb_set(filas,'{0,costo}','-1')),
    (jsonb_set(filas,'{0,cantidad}','0')),
    (jsonb_set(filas,'{0,costo}','0.001')),
    (jsonb_set(filas,'{0,fecha}',to_jsonb((hoy_mx()-2)::text)))
  ) casos(f) loop
    begin perform importar_mermas_dodo('prueba.xlsx',repeat('a',64),dias,prueba);raise exception 'FALLÓ: aceptó renglón inválido';
    exception when others then if sqlerrm<>'Renglón inválido o fuera del periodo.' then raise; end if; end;
  end loop;
  begin perform importar_mermas_dodo('prueba.xlsx',repeat('a',64),jsonb_build_array(jsonb_build_object('sucursal_id',s,'fecha',hoy_mx()+1)),'[]');raise exception 'FALLÓ: fecha futura';
  exception when others then if sqlerrm<>'Sucursal o fecha inválida.' then raise; end if; end;
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  if not ve_finanzas() then raise exception 'FALLÓ: corporativo no consulta'; end if;
  begin perform importar_mermas_dodo('prueba.xlsx',repeat('a',64),dias,filas);raise exception 'FALLÓ: corporativo importó';
  exception when others then if sqlerrm<>'Solo el admin puede importar mermas.' then raise; end if; end;
  if has_table_privilege('authenticated','mermas_dodo','INSERT') or has_table_privilege('authenticated','mermas_dodo','UPDATE') or has_table_privilege('authenticated','mermas_dodo','DELETE')
    or has_table_privilege('authenticated','mermas_dodo_dias','INSERT') or has_table_privilege('authenticated','mermas_dodo_dias','UPDATE') or has_table_privilege('authenticated','mermas_dodo_dias','DELETE') then raise exception 'FALLÓ: escritura directa'; end if;
  raise exception 'PRUEBAS OK — importación admin · días vacíos · reimportación sin duplicados · conserva otros días · fechas y montos · corporativo solo consulta · sin escritura directa';
end $$;

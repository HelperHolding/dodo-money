-- ENSAYO reversible de supabase/correcciones/2026-11-17_reposicion_caja_chica_la_calma.sql.
-- Hace exactamente lo mismo y lo deshace con el mensaje PRUEBAS OK. No guarda nada.
do $pruebas$
declare
 v_lote constant text:='REPOSICION-LA-CALMA-20261117';
 v_s constant uuid:='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';
 v_esperado constant numeric:=8933.67;
 autor uuid; ultima timestamptz; corte timestamptz; pend uuid[]; n_pend int; v_monto numeric; otros int;
 c_origen uuid; c_destino uuid; v_id uuid;
begin
 if exists(select 1 from public.movimientos where sucursal_id=v_s and tipo='reposicion_caja_chica' and nota like v_lote||'%') then
  raise exception 'FALLÓ: % ya está aplicado; el ensayo no aplica.',v_lote;
 end if;
 select p.id into strict autor from public.perfiles p join auth.users u on u.id=p.id
 where lower(u.email)='scervera@dodopizza.mx' and p.rol::text='admin' and p.activo and not p.debe_cambiar_contrasena;
 select id into strict c_origen from public.cajas where sucursal_id=v_s and tipo='corporativo';
 select id into strict c_destino from public.cajas where sucursal_id=v_s and tipo='caja_chica';
 perform 1 from public.cajas where id=c_destino for update;
 select max(creado_en) into ultima from public.movimientos where sucursal_id=v_s and tipo='reposicion_caja_chica' and estado<>'rechazado';
 -- Los dos gastos que siguen sin reponerse.
 select array_agg(id),count(*),min(creado_en) into pend,n_pend,corte from public.gastos_caja_chica g
 where g.sucursal_id=v_s and g.origen='caja_chica' and not g.informativo and g.anulado_en is null and (ultima is null or g.creado_en>ultima)
  and ((g.fecha='2026-11-14' and g.monto=28.00 and g.proveedor ilike 'Purificadora%') or (g.fecha='2026-11-17' and g.monto=66.50 and g.concepto ilike 'Fabuloso%'));
 if n_pend<>2 then raise exception 'No se encontraron exactamente los gastos del 14/11 ($28.00) y 17/11 ($66.50) sin reponer (encontrados: %). Nada se guardó.',n_pend;end if;
 -- Nada más puede haberse capturado después de ellos; si no, la reposición lo dejaría fuera o dentro por error.
 select count(*) into otros from public.gastos_caja_chica g where g.sucursal_id=v_s and g.anulado_en is null and g.creado_en>=corte and g.id<>all(pend);
 if otros>0 then raise exception 'Hay % gasto(s) capturados después del gasto del 14/11. Revisa antes de reponer. Nada se guardó.',otros;end if;
 corte:=corte-interval '1 millisecond';
 select coalesce(sum(monto),0) into v_monto from public.gastos_caja_chica g
 where g.sucursal_id=v_s and g.origen='caja_chica' and not g.informativo and g.anulado_en is null and (ultima is null or g.creado_en>ultima) and g.creado_en<corte;
 if v_monto<>v_esperado then raise exception 'Los gastos ya repuestos suman $% y no $%. Nada se guardó.',v_monto,v_esperado;end if;
 insert into public.movimientos(sucursal_id,tipo,caja_origen_id,caja_destino_id,monto,nota,estado,registrado_por,creado_en)
 values(v_s,'reposicion_caja_chica',c_origen,c_destino,v_monto,
  v_lote||' · Reposición por gastos comprobados hasta antes del 14/11; quedan pendientes Garrafones 14/11 ($28.00) y Fabuloso 17/11 ($66.50).',
  'pendiente',autor,corte) returning id into v_id;
 -- Verificaciones del ensayo.
 if (select ultima_ok from (select max(creado_en)=corte as ultima_ok from public.movimientos where sucursal_id=v_s and tipo='reposicion_caja_chica' and estado<>'rechazado') x) is not true then raise exception 'FALLÓ: la reposición no quedó como la última.';end if;
 if (select coalesce(sum(monto),0) from public.gastos_caja_chica g where g.sucursal_id=v_s and g.origen='caja_chica' and not g.informativo and g.anulado_en is null and g.creado_en>corte)<>94.50 then raise exception 'FALLÓ: por reponer no quedó en $94.50.';end if;
 if (select count(*) from public.gastos_caja_chica g where g.sucursal_id=v_s and g.anulado_en is null and g.creado_en>corte)<>2 then raise exception 'FALLÓ: quedan más de dos gastos después de la reposición.';end if;
 if not exists(select 1 from public.movimientos where id=v_id and estado='pendiente' and confirmado_por is null and registrado_por=autor and monto=v_esperado) then raise exception 'FALLÓ: la reposición no quedó pendiente por $8,933.67.';end if;
 raise exception 'PRUEBAS OK — reposición de $% pendiente de confirmar · quedan por reponer solo 14/11 ($28.00) y 17/11 ($66.50) · nada se guardó',v_monto;
end
$pruebas$;

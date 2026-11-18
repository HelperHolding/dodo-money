-- APLICACIÓN. Ejecutar solo después de que el ensayo devuelva PRUEBAS OK.
-- Lote REPOSICION-LA-CALMA-20261117: corporativo ya repuso a la caja chica de La Calma todos los gastos
-- capturados desde la última reposición, menos el de Garrafones del 14/11 ($28.00) y el de Fabuloso del 17/11 ($66.50).
--  · Registra esa reposición (corporativo → caja chica) por $8,933.67, con hora justo antes de que se capturara el gasto del 14/11.
--  · Queda PENDIENTE: la confirma en Efectivo → Movimientos el gerente de La Calma u otro admin (quien registra no puede confirmar).
-- Efecto: en Gastos solo quedan por reponer el del 14 y el del 17 ($94.50). Al confirmarse, la caja chica sube $8,933.67.
-- Repetible: si la reposición ya existe, no hace nada.
do $aplicar$
declare
 v_lote constant text:='REPOSICION-LA-CALMA-20261117';
 v_s constant uuid:='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';
 v_esperado constant numeric:=8933.67;
 autor uuid; ultima timestamptz; corte timestamptz; pend uuid[]; n_pend int; v_monto numeric; otros int;
 c_origen uuid; c_destino uuid; v_id uuid;
begin
 if exists(select 1 from public.movimientos where sucursal_id=v_s and tipo='reposicion_caja_chica' and nota like v_lote||'%') then
  raise notice '% ya estaba aplicado. Nada cambió.',v_lote; return;
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
 raise notice '% OK · reposición % por $% pendiente de confirmar',v_lote,v_id,v_monto;
end
$aplicar$;
select 'REPOSICION LA CALMA OK' as resultado, m.monto, m.estado::text as estado, m.creado_en
from public.movimientos m where m.sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e' and m.tipo='reposicion_caja_chica' and m.nota like 'REPOSICION-LA-CALMA-20261117%';

-- Corrección 3 de la bóveda de Zapopan-1 La Calma (24/11). Correr completo en el SQL Editor de Supabase.
-- Lote BOVEDA-LA-CALMA-20261124: después de la recolección de $19,217 (folio 010) en la bóveda quedan en físico
-- $4,500 de fondo + $2,576 del efectivo del 23/11 = $7,076. La app dejaría $4,500.
--  · El efectivo del 23/11 fue $2,576, no $2,133.20: el arqueo de cierre del 23 pasa de $2,633.20 a $3,076.00
--    ($2,576 + $500 de fondo) y su retiro a la bóveda de $2,133.20 a $2,576.00. Faltante del turno: −$1,542.00.
--  · Los $2,133.20 restantes son sobrante de bóveda anterior al 23/11 sin explicar: se registran como ajuste de
--    conciliación (sube la bóveda), igual que los del 27/10 y 18/11. No crea venta, retiro ni gasto.
-- Efecto: la bóveda en la app pasa de $23,717.00 a $26,293.00; al recogerse la salida de $19,217 queda en $7,076.00.
-- Repetible: si el ajuste ya existe, no hace nada. Si algo no coincide, no guarda nada.
do $aplicar$
declare
 v_lote constant text:='BOVEDA-LA-CALMA-20261124';
 v_s constant uuid:='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';
 autor uuid; t public.turnos; a public.arqueos; r public.movimientos; v_antes numeric; n int;
begin
 if exists(select 1 from public.ajustes_boveda where solicitud=v_lote) then
  raise notice '% ya estaba aplicado. Nada cambió.',v_lote; return;
 end if;
 select p.id into strict autor from public.perfiles p join auth.users u on u.id=p.id
 where lower(u.email)='scervera@dodopizza.mx' and p.rol::text='admin' and p.activo;
 select * into strict t from public.turnos where sucursal_id=v_s and fecha='2026-11-23';
 select * into strict a from public.arqueos where turno_id=t.id and momento='cierre' and anulado_en is null;
 if a.total_contado<>2633.20 or a.ventas_efectivo<>4118.00 then
  raise exception 'El arqueo del 23 no está como lo dejaron las correcciones 1 y 2 (contado $%, venta $%). Nada se guardó.',a.total_contado,a.ventas_efectivo;
 end if;
 select * into strict r from public.movimientos where sucursal_id=v_s and tipo='retiro_boveda' and nota like 'ARQUEO-LA-CALMA-20261123%';
 if r.monto<>2133.20 or r.estado<>'confirmado' then raise exception 'El retiro de la corrección 1 no está en $2,133.20 confirmado. Nada se guardó.';end if;
 select count(*) into n from public.movimientos where sucursal_id=v_s and tipo='salida_corporativo' and estado='pendiente' and monto=19217.00;
 if n<>1 then raise exception 'No se encontró exactamente una salida por recoger de $19,217 (encontradas: %). Nada se guardó.',n;end if;
 select saldo into strict v_antes from public.saldos_cajas where sucursal_id=v_s and tipo='boveda';
 if v_antes<>23717.00 then raise exception 'La bóveda en la app tiene $% y no $23,717: algo cambió. Nada se guardó.',v_antes;end if;

 update public.arqueos set total_contado=3076.00 where id=a.id;
 update public.movimientos set monto=2576.00,
  nota=nota||' · '||v_lote||': el efectivo del 23/11 fue $2,576 (antes se registró $2,133.20).'
  where id=r.id;
 select saldo into strict v_antes from public.saldos_cajas where sucursal_id=v_s and tipo='boveda';
 if v_antes<>24159.80 then raise exception 'Tras corregir el retiro la bóveda quedó en $% y no $24,159.80. Nada se guardó.',v_antes;end if;
 insert into public.ajustes_boveda(sucursal_id,solicitud,importe,saldo_antes,saldo_despues,motivo,autor_id)
 values(v_s,v_lote,-2133.20,v_antes,v_antes+2133.20,
  'Sobrante de bóveda anterior al 23/11, sin causa identificada, autorizado por Sebastián el 24/11/2026. Conteo físico del 24/11: '
  ||'$19,217 de la recolección folio 010 + $4,500 de fondo + $2,576 del efectivo del 23/11 = $26,293 contra $24,159.80 en Dodo MX. '
  ||'El cierre del 22/11 se capturó con contado igual al esperado. No crea venta, retiro ni gasto.',autor);
 raise notice '% OK · arqueo 23 en $3,076, retiro en $2,576 y ajuste de +$2,133.20',v_lote;
end
$aplicar$;
select 'BOVEDA LA CALMA OK' as resultado,
 (select saldo from public.saldos_cajas where sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e' and tipo='boveda') as boveda_app,
 (select saldo from public.saldos_cajas where sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e' and tipo='boveda')-19217 as queda_tras_recoleccion,
 (select a.diferencia from public.arqueos a join public.turnos t on t.id=a.turno_id
   where t.sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e' and t.fecha='2026-11-23' and a.momento='cierre' and a.anulado_en is null) as diferencia_turno_23;

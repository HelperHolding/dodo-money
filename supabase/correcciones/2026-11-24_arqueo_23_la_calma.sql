-- Corrección del turno del lunes 23/11 en Zapopan-1 La Calma. Correr completo en el SQL Editor de Supabase.
-- Lote ARQUEO-LA-CALMA-20261123: el turno se cerró el 24/11 a las 9:08 con $0 contados, así que su efectivo
-- no pasó a la bóveda en la app. En físico la bóveda tenía $2,133.20 más que la app.
--  · El arqueo de cierre del 23 pasa de $0.00 a $2,633.20 ($2,133.20 que llegaron a la bóveda + $500 de fondo del cajero).
--  · Registra el retiro a la bóveda de $2,133.20 que la app hace sola al cerrar un turno (confirmado, con hora del cierre).
-- Efecto: la bóveda en la app pasa de $21,583.80 a $23,717.00 y ya se puede registrar la salida de $19,217
-- dejando $4,500. El arqueo del 23 queda con un faltante de $1,984.80 que hay que explicar.
-- Repetible: si el retiro ya existe, no hace nada. Si algo no coincide, no guarda nada.
do $aplicar$
declare
 v_lote constant text:='ARQUEO-LA-CALMA-20261123';
 v_s constant uuid:='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';
 v_contado constant numeric:=2633.20;
 v_retiro constant numeric:=2133.20;
 autor uuid; t public.turnos; a public.arqueos; fondo numeric; v_saldo numeric; c_venta uuid; c_boveda uuid; v_id uuid;
begin
 if exists(select 1 from public.movimientos where sucursal_id=v_s and tipo='retiro_boveda' and nota like v_lote||'%') then
  raise notice '% ya estaba aplicado. Nada cambió.',v_lote; return;
 end if;
 select p.id into strict autor from public.perfiles p join auth.users u on u.id=p.id
 where lower(u.email)='scervera@dodopizza.mx' and p.rol::text='admin' and p.activo;
 select * into strict t from public.turnos where sucursal_id=v_s and fecha='2026-11-23';
 if t.cerrado_en is null then raise exception 'El turno del 23 sigue abierto. Nada se guardó.';end if;
 select * into strict a from public.arqueos where turno_id=t.id and momento='cierre' and anulado_en is null;
 if a.total_contado<>0 then raise exception 'El arqueo de cierre del 23 ya no está en $0 (tiene $%). Nada se guardó.',a.total_contado;end if;
 if exists(select 1 from public.movimientos where turno_id=t.id and tipo='retiro_boveda' and estado<>'rechazado') then
  raise exception 'El turno del 23 ya tiene un retiro a la bóveda. Nada se guardó.';
 end if;
 select fondo_caja_venta into strict fondo from public.sucursales where id=v_s;
 if v_contado-fondo<>v_retiro then raise exception 'El fondo del cajero es $% y no $500. Nada se guardó.',fondo;end if;
 if exists(select 1 from public.cierres_dia where sucursal_id=v_s and fecha>='2026-11-23') then
  raise exception 'Ya hay un cierre del día del 23 o posterior. Nada se guardó.';
 end if;
 select saldo into strict v_saldo from public.saldos_cajas where sucursal_id=v_s and tipo='boveda';
 if v_saldo<>21583.80 then raise exception 'La bóveda en la app tiene $% y no $21,583.80: algo cambió. Nada se guardó.',v_saldo;end if;
 select id into strict c_venta from public.cajas where sucursal_id=v_s and tipo='venta';
 select id into strict c_boveda from public.cajas where sucursal_id=v_s and tipo='boveda';

 update public.arqueos set total_contado=v_contado where id=a.id;
 insert into public.movimientos(sucursal_id,turno_id,tipo,caja_origen_id,caja_destino_id,monto,nota,estado,registrado_por,creado_en,confirmado_en)
 values(v_s,t.id,'retiro_boveda',c_venta,c_boveda,v_retiro,
  v_lote||' · Corrección: el turno del 23/11 se cerró con $0 contados; el efectivo sí llegó a la bóveda (conteo físico del 24/11 antes de la salida).',
  'confirmado',autor,t.cerrado_en,t.cerrado_en) returning id into v_id;
 raise notice '% OK · arqueo del 23 en $% y retiro % por $%',v_lote,v_contado,v_id,v_retiro;
end
$aplicar$;
select 'ARQUEO LA CALMA OK' as resultado,
 (select saldo from public.saldos_cajas where sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e' and tipo='boveda') as boveda_app,
 (select a.total_contado from public.arqueos a join public.turnos t on t.id=a.turno_id
   where t.sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e' and t.fecha='2026-11-23' and a.momento='cierre' and a.anulado_en is null) as contado_23,
 (select a.diferencia from public.arqueos a join public.turnos t on t.id=a.turno_id
   where t.sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e' and t.fecha='2026-11-23' and a.momento='cierre' and a.anulado_en is null) as diferencia_turno_23;

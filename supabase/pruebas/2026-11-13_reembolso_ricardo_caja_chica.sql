-- ENSAYO. Corre el lote completo y lo deshace con ROLLBACK; no guarda nada. Debe devolver PRUEBAS OK.
-- Lote CUENTAS-PENDIENTES-4-20261113: el reembolso de $3,408.84 a Ricardo Villa (compras de Sam's del 3, 7 y 8 de noviembre) se pagó con efectivo de caja chica.
--  · Registra esas 3 compras como gastos de caja chica de La Calma (con la función de la app), en insumos y cuenta 502-01-000.
--  · Cancela la factura de reembolso "Sam's nov 2026 (2) - Ricardo Villa", que no tiene pagos.
-- Efecto en efectivo: la caja chica de La Calma baja $3,408.84, que es lo que salió de verdad del cajón.
-- Requiere que ya esté aplicado el lote 2 (CUENTAS-PENDIENTES-2-20261112).
begin;
set local lock_timeout='5s';
create temp table plan_lote4 on commit drop as select * from jsonb_to_recordset(
 $plan$[
 {
  "n": 127,
  "anterior": "ff49bf77-41cc-411f-9a3e-1e662c3dc5b6",
  "fecha": "2026-11-03",
  "concepto": "Queso Mozarella · reembolso a Ricardo Villa con caja chica",
  "proveedor": "Sam’s",
  "monto": 1202,
  "concepto_factura": 355,
  "motivo": "CUENTAS-PENDIENTES-4-20261113 aprobado por Sebastián el 13/11/2026 (n127): Compras nacionales. Compra de Sam's que Ricardo Villa pagó y se le reembolsó con efectivo de caja chica; insumo en memo."
 },
 {
  "n": 129,
  "anterior": "ef91f528-f300-42a8-944c-7fe92854b8b2",
  "fecha": "2026-11-07",
  "concepto": "Jamon · reembolso a Ricardo Villa con caja chica",
  "proveedor": "Sams",
  "monto": 1061.08,
  "concepto_factura": 356,
  "motivo": "CUENTAS-PENDIENTES-4-20261113 aprobado por Sebastián el 13/11/2026 (n129): Compras nacionales. Compra de Sam's que Ricardo Villa pagó y se le reembolsó con efectivo de caja chica; insumo en memo."
 },
 {
  "n": 130,
  "anterior": "f8b716b0-eee2-4001-b913-696e72d82eb3",
  "fecha": "2026-11-08",
  "concepto": "Jamon · reembolso a Ricardo Villa con caja chica",
  "proveedor": "Sams",
  "monto": 1145.76,
  "concepto_factura": 357,
  "motivo": "CUENTAS-PENDIENTES-4-20261113 aprobado por Sebastián el 13/11/2026 (n130): Compras nacionales. Compra de Sam's que Ricardo Villa pagó y se le reembolsó con efectivo de caja chica; insumo en memo."
 }
]$plan$::jsonb
) as x(n integer,anterior uuid,fecha date,concepto text,proveedor text,monto numeric,concepto_factura bigint,motivo text);

create or replace function pg_temp.aplicar_lote4() returns integer language plpgsql as $aplicar$
declare autor uuid; l record; g public.gastos_caja_chica; f public.facturas; nuevo uuid; sol uuid; m public.contabilidad_movimientos; a public.contabilidad_actual;
 cambios integer:=0; v_lote constant text:='CUENTAS-PENDIENTES-4-20261113'; v_factura constant uuid:='2226df0b-0924-4fd1-ba2f-26062d2d277a';
begin
 select p.id into strict autor from public.perfiles p join auth.users u on u.id=p.id
 where lower(u.email)='scervera@dodopizza.mx' and p.rol::text='admin' and p.activo and not p.debe_cambiar_contrasena;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',autor,'role','authenticated')::text,true);
 -- 1) Revisar todo antes de cambiar algo.
 select * into strict f from public.facturas where id=v_factura;
 if not (f.estado::text='cancelada' and f.motivo_cancelacion like v_lote||'%') then
  if f.estado::text<>'por_pagar' or f.total<>3408.84 or public.pagado_factura(v_factura)<>0 then
   raise exception 'La factura de reembolso de Ricardo ya no está por pagar sin pagos (estado %, total %). Nada se guardó.',f.estado,f.total;end if;
  if exists(select 1 from public.reservas_boveda r where r.factura_id=v_factura and r.anulado_en is null) then raise exception 'La factura tiene reserva de bóveda. Nada se guardó.';end if;
 end if;
 for l in select * from plan_lote4 order by n loop
  select * into g from public.gastos_caja_chica where id=l.anterior;
  if not found or g.anulado_en is null or not exists(select 1 from public.gastos_historial h where h.id=md5('CUENTAS-PENDIENTES-2-20261112'||'gasto:'||l.anterior::text)::uuid) then
   raise exception 'n%: el gasto original no está eliminado por el lote 2. Nada se guardó.',l.n;end if;
  if g.monto<>l.monto or g.fecha<>l.fecha or g.origen::text<>'empleado' or g.repuesto_en is not null then
   raise exception 'n%: el gasto original no coincide (importe %, fecha %, origen %). Nada se guardó.',l.n,g.monto,g.fecha,g.origen;end if;
  if not exists(select 1 from public.factura_conceptos c where c.id=l.concepto_factura and c.factura_id=v_factura and c.importe=l.monto) then
   raise exception 'n%: el concepto % de la factura no coincide. Nada se guardó.',l.n,l.concepto_factura;end if;
 end loop;
 -- 2) Registrar cada gasto como salido de caja chica, con la función de la app (cuenta inicial "otros": la app no deja capturar insumos).
 for l in select * from plan_lote4 order by n loop
  select * into g from public.gastos_caja_chica where id=l.anterior;
  sol:=md5(v_lote||'gasto'||l.anterior::text)::uuid;
  if not exists(select 1 from public.gastos_caja_chica x where x.solicitud_id=sol) then cambios:=cambios+1;end if;
  nuevo:=public.registrar_gasto_sucursal(jsonb_build_object('solicitud',sol,'sucursal',g.sucursal_id,'fecha',l.fecha,'concepto',l.concepto,
   'proveedor',l.proveedor,'monto',l.monto,'comprobante','nota','origen','caja_chica','cuenta_pl','otros','informativo',false));
  -- 3) Reclasificar a insumos con la corrección administrativa (deja historial).
  if not exists(select 1 from public.gastos_historial h where h.id=md5(v_lote||'insumos'||nuevo::text)::uuid) then
   select * into g from public.gastos_caja_chica where id=nuevo;
   perform public.editar_anular_gasto_admin(md5(v_lote||'insumos'||nuevo::text)::uuid,nuevo,g.version,'editar',jsonb_build_object('fecha',g.fecha,'monto',g.monto,'origen',g.origen,
    'comprobante',g.comprobante,'uuid_cfdi',g.uuid_cfdi,'concepto',g.concepto,'proveedor',g.proveedor,'pagado_por',g.pagado_por,'cuenta_pl','insumos'),l.motivo);
   cambios:=cambios+1;
  end if;
 end loop;
 -- 4) Cancelar la factura de reembolso: ya no se le debe nada a Ricardo.
 select * into f from public.facturas where id=v_factura;
 if f.estado::text<>'cancelada' then
  perform public.cancelar_factura(v_factura,v_lote||': el reembolso a Ricardo Villa se pagó con efectivo de caja chica; las 3 compras de Sam''s quedan como gastos de caja chica. Aprobado por Sebastián el 13/11/2026.');
  cambios:=cambios+1;
 end if;
 -- 5) Cuenta de cada gasto nuevo.
 for l in select * from plan_lote4 order by n loop
  select id into strict nuevo from public.gastos_caja_chica where solicitud_id=md5(v_lote||'gasto'||l.anterior::text)::uuid;
  select * into strict m from public.contabilidad_movimientos mv where mv.clave='gasto:'||nuevo::text;
  if m.categoria<>'insumos' then raise exception 'n%: la categoría quedó en %. Nada se guardó.',l.n,m.categoria;end if;
  select * into a from public.contabilidad_actual ac where ac.clave=m.clave;
  if a.codigo='502-01-000' and a.rfc='HCM260306B93' and a.huella=m.huella then continue;end if;
  perform public.asignar_cuenta_contable(md5(v_lote||'cuenta'||nuevo::text)::uuid,m.clave,a.id,m.huella,'HCM260306B93','502-01-000',l.motivo,true);
  cambios:=cambios+1;
 end loop;
 return cambios;
end $aplicar$;

create or replace function pg_temp.verificar_lote4() returns void language plpgsql as $verificar$
begin
 if (select count(*) from plan_lote4 l join public.gastos_caja_chica g on g.solicitud_id=md5('CUENTAS-PENDIENTES-4-20261113'||'gasto'||l.anterior::text)::uuid
   join public.contabilidad_movimientos m on m.clave='gasto:'||g.id::text join public.contabilidad_actual a on a.clave=m.clave
   where g.origen::text='caja_chica' and g.anulado_en is null and g.monto=l.monto and g.cuenta_pl='insumos' and a.codigo='502-01-000' and a.huella=m.huella)<>3
  then raise exception 'FALLÓ: los 3 gastos de caja chica no quedaron completos.';end if;
 if (select estado::text from public.facturas where id='2226df0b-0924-4fd1-ba2f-26062d2d277a')<>'cancelada' then raise exception 'FALLÓ: la factura de reembolso no quedó cancelada.';end if;
end $verificar$;
do $pruebas$
declare antes numeric; despues numeric; n1 integer; n2 integer; otros_antes jsonb; otros_despues jsonb;
begin
 antes:=(select saldo from public.saldos_cajas s join plan_lote4 l on true join public.gastos_caja_chica g on g.id=l.anterior where s.sucursal_id=g.sucursal_id and s.tipo::text='caja_chica' limit 1);
 otros_antes:=(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from public.gastos_caja_chica g);
 n1:=pg_temp.aplicar_lote4();
 if n1<>10 then raise exception 'FALLÓ: se esperaban 10 cambios (3 gastos, 3 reclasificaciones, 1 cancelación, 3 cuentas) y fueron %.',n1;end if;
 perform pg_temp.verificar_lote4();
 n2:=pg_temp.aplicar_lote4();
 if n2<>0 then raise exception 'FALLÓ: repetir el lote cambió % registros.',n2;end if;
 despues:=(select saldo from public.saldos_cajas s join plan_lote4 l on true join public.gastos_caja_chica g on g.id=l.anterior where s.sucursal_id=g.sucursal_id and s.tipo::text='caja_chica' limit 1);
 if antes-despues<>3408.84 then raise exception 'FALLÓ: la caja chica bajó % en lugar de 3408.84.',antes-despues;end if;
 otros_despues:=(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from public.gastos_caja_chica g where g.solicitud_id is null or g.solicitud_id not in (select md5('CUENTAS-PENDIENTES-4-20261113'||'gasto'||l.anterior::text)::uuid from plan_lote4 l));
 if otros_antes is distinct from otros_despues then raise exception 'FALLÓ: cambió otro gasto.';end if;
end $pruebas$;
select 'PRUEBAS OK — 3 gastos de caja chica en insumos 502-01-000 · factura de reembolso cancelada sin pagos · caja chica baja 3,408.84 · nada más cambia · repetir no duplica · ensayo reversible' as resultado;
rollback;

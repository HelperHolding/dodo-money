-- ENSAYO. Corre el lote completo y lo deshace con ROLLBACK; no guarda nada. Debe devolver una fila PRUEBAS OK.
-- Lote CUENTAS-PENDIENTES-2-20261112, aprobado por Sebastián el 12/11/2026:
--  · n65-68 Bolpack BGL6872: conceptos de insumos a consumibles y cuenta 602-54-000 Limpieza (Sitru).
--  · n128 mozzarella $940 y n131 azúcar $138: gastos de "otros" a insumos y cuenta 502-01-000 (Helper).
--  · Elimina duplicados: n79 Coca $3,164.50 de caja chica (ya pagada con ventas del 28/10 en la factura de Arca)
--    y n127/n129/n130 Sam's pagados por Ricardo Villa (ya están en su factura de reembolso por pagar).
-- Usa asignar_cuentas_conceptos, editar_anular_gasto_admin y asignar_cuenta_contable, como la app. No cambia importes ni pagos.
-- Al eliminar la Coca, la caja chica de La Calma vuelve a contar esos $3,164.50 como disponibles.
begin;
set local lock_timeout='5s';
create temp table plan_lote2 on commit drop as select * from jsonb_to_recordset(
 $plan$[
 {
  "n": 65,
  "accion": "concepto",
  "clave": "concepto:133",
  "id": "133",
  "version": null,
  "importe": 1174.6,
  "de": "insumos",
  "a": "consumibles_equipo",
  "origen": null,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n65): Limpieza. Producto de limpieza de Bolpack BGL6872 (septiembre) que estaba capturado como insumo; se pasa a consumibles y a Limpieza como las demás compras de Bolpack."
 },
 {
  "n": 66,
  "accion": "concepto",
  "clave": "concepto:134",
  "id": "134",
  "version": null,
  "importe": 172.5,
  "de": "insumos",
  "a": "consumibles_equipo",
  "origen": null,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n66): Limpieza. Producto de limpieza de Bolpack BGL6872 (septiembre) que estaba capturado como insumo; se pasa a consumibles y a Limpieza como las demás compras de Bolpack."
 },
 {
  "n": 67,
  "accion": "concepto",
  "clave": "concepto:135",
  "id": "135",
  "version": null,
  "importe": 55,
  "de": "insumos",
  "a": "consumibles_equipo",
  "origen": null,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n67): Limpieza. Producto de limpieza de Bolpack BGL6872 (septiembre) que estaba capturado como insumo; se pasa a consumibles y a Limpieza como las demás compras de Bolpack."
 },
 {
  "n": 68,
  "accion": "concepto",
  "clave": "concepto:136",
  "id": "136",
  "version": null,
  "importe": 55,
  "de": "insumos",
  "a": "consumibles_equipo",
  "origen": null,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n68): Limpieza. Producto de limpieza de Bolpack BGL6872 (septiembre) que estaba capturado como insumo; se pasa a consumibles y a Limpieza como las demás compras de Bolpack."
 },
 {
  "n": 128,
  "accion": "editar",
  "clave": "gasto:d495916c-2afc-4492-bdec-1cc101fecf83",
  "id": "d495916c-2afc-4492-bdec-1cc101fecf83",
  "version": 1,
  "importe": 940,
  "de": "otros",
  "a": "insumos",
  "origen": "caja_chica",
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n128): Compras nacionales. mozzarella de Sams capturado en \"otros\"; es insumo y se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 131,
  "accion": "editar",
  "clave": "gasto:81a898bf-86fd-4d30-941f-dfc20e595a2c",
  "id": "81a898bf-86fd-4d30-941f-dfc20e595a2c",
  "version": 1,
  "importe": 138,
  "de": "otros",
  "a": "insumos",
  "origen": "caja_chica",
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n131): Compras nacionales. azúcar de Seven capturado en \"otros\"; es insumo y se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 79,
  "accion": "eliminar",
  "clave": "gasto:c7fa7e39-ce68-4c77-b29b-b07ebc025a60",
  "id": "c7fa7e39-ce68-4c77-b29b-b07ebc025a60",
  "version": 2,
  "importe": 3164.5,
  "de": "insumos",
  "a": null,
  "origen": "caja_chica",
  "rfc": null,
  "codigo": null,
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n79): duplicado. La misma Coca ya está en la factura de Arca, ticket 6239604631, pagada con efectivo de ventas del 28/10/2026; este gasto de caja chica la repetía."
 },
 {
  "n": 127,
  "accion": "eliminar",
  "clave": "gasto:ff49bf77-41cc-411f-9a3e-1e662c3dc5b6",
  "id": "ff49bf77-41cc-411f-9a3e-1e662c3dc5b6",
  "version": 2,
  "importe": 1202,
  "de": "otros",
  "a": null,
  "origen": "empleado",
  "rfc": null,
  "codigo": null,
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n127): duplicado. La misma compra de Sam's está en la factura de reembolso \"Sam's nov 2026 (2) - Ricardo Villa\" (n92); se le paga una sola vez por esa factura."
 },
 {
  "n": 129,
  "accion": "eliminar",
  "clave": "gasto:ef91f528-f300-42a8-944c-7fe92854b8b2",
  "id": "ef91f528-f300-42a8-944c-7fe92854b8b2",
  "version": 2,
  "importe": 1061.08,
  "de": "otros",
  "a": null,
  "origen": "empleado",
  "rfc": null,
  "codigo": null,
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n129): duplicado. La misma compra de Sam's está en la factura de reembolso \"Sam's nov 2026 (2) - Ricardo Villa\" (n93); se le paga una sola vez por esa factura."
 },
 {
  "n": 130,
  "accion": "eliminar",
  "clave": "gasto:f8b716b0-eee2-4001-b913-696e72d82eb3",
  "id": "f8b716b0-eee2-4001-b913-696e72d82eb3",
  "version": 3,
  "importe": 1145.76,
  "de": "otros",
  "a": null,
  "origen": "empleado",
  "rfc": null,
  "codigo": null,
  "motivo": "CUENTAS-PENDIENTES-2-20261112 aprobado por Sebastián el 12/11/2026 (n130): duplicado. La misma compra de Sam's está en la factura de reembolso \"Sam's nov 2026 (2) - Ricardo Villa\" (n94); se le paga una sola vez por esa factura."
 }
]$plan$::jsonb
) as x(n integer,accion text,clave text,id text,version bigint,importe numeric,de text,a text,origen text,rfc text,codigo text,motivo text);

create or replace function pg_temp.aplicar_lote2() returns integer language plpgsql as $aplicar$
declare autor uuid; l record; c public.factura_conceptos; f public.facturas; g public.gastos_caja_chica;
 m public.contabilidad_movimientos; a public.contabilidad_actual; sol uuid; cambios integer:=0;
 v_lote constant text:='CUENTAS-PENDIENTES-2-20261112';
begin
 select p.id into strict autor from public.perfiles p join auth.users u on u.id=p.id
 where lower(u.email)='scervera@dodopizza.mx' and p.rol::text='admin' and p.activo and not p.debe_cambiar_contrasena;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',autor,'role','authenticated')::text,true);
 -- 1) Revisar TODO antes de cambiar algo.
 for l in select * from plan_lote2 order by n loop
  sol:=md5(v_lote||l.clave)::uuid;
  if l.accion='concepto' then
   select * into c from public.factura_conceptos where id::text=l.id;
   if not found then raise exception 'n%: el concepto ya no existe. Nada se guardó.',l.n;end if;
   select * into f from public.facturas where id=c.factura_id;
   if f.estado::text='cancelada' or f.sustituido_por is not null then raise exception 'n%: la factura ya no está vigente. Nada se guardó.',l.n;end if;
   if f.rfc_receptor<>l.rfc or c.importe<>l.importe or coalesce(c.cuenta_pl,f.cuenta_pl) not in (l.de,l.a) then
    raise exception 'n%: cambió el concepto (razón %, importe %, categoría %). Nada se guardó.',l.n,f.rfc_receptor,c.importe,coalesce(c.cuenta_pl,f.cuenta_pl);end if;
  else
   select * into g from public.gastos_caja_chica where id::text=l.id;
   if not found then raise exception 'n%: el gasto no existe. Nada se guardó.',l.n;end if;
   if exists(select 1 from public.gastos_historial h where h.id=sol) then continue;end if; -- ya aplicado por este lote
   if g.anulado_en is not null then raise exception 'n%: el gasto ya estaba eliminado por otra corrección. Nada se guardó.',l.n;end if;
   if g.version<>l.version or g.monto<>l.importe or g.cuenta_pl is distinct from l.de or g.origen::text<>l.origen then
    raise exception 'n%: el gasto cambió (versión %, importe %, categoría %, origen %). Nada se guardó.',l.n,g.version,g.monto,g.cuenta_pl,g.origen;end if;
  end if;
 end loop;
 -- 2) Cambios de origen con las funciones oficiales (dejan su propio historial).
 for l in select * from plan_lote2 order by n loop
  sol:=md5(v_lote||l.clave)::uuid;
  if l.accion='concepto' then
   select * into c from public.factura_conceptos where id::text=l.id;
   select * into f from public.facturas where id=c.factura_id;
   if coalesce(c.cuenta_pl,f.cuenta_pl)<>l.a then
    perform public.asignar_cuentas_conceptos(c.factura_id,jsonb_build_array(jsonb_build_object('id',c.id,'cuenta',l.a)));
    if not exists(select 1 from public.compra_notas cn where cn.factura_id=c.factura_id and cn.texto like v_lote||'%') then
     insert into public.compra_notas(factura_id,texto,usuario_id) values(c.factura_id,v_lote||': conceptos de limpieza pasan de insumos a consumibles (Limpieza 602-54-000), aprobado por Sebastián el 12/11/2026. Importes y pagos sin cambios.',autor);
    end if;
    cambios:=cambios+1;
   end if;
  elsif not exists(select 1 from public.gastos_historial h where h.id=sol) then
   select * into g from public.gastos_caja_chica where id::text=l.id;
   if l.accion='editar' then
    perform public.editar_anular_gasto_admin(sol,g.id,l.version,'editar',jsonb_build_object('fecha',g.fecha,'monto',g.monto,'origen',g.origen,
     'comprobante',g.comprobante,'uuid_cfdi',g.uuid_cfdi,'concepto',g.concepto,'proveedor',g.proveedor,'pagado_por',g.pagado_por,'cuenta_pl',l.a),l.motivo);
   else
    perform public.editar_anular_gasto_admin(sol,g.id,l.version,'eliminar','{}'::jsonb,l.motivo);
   end if;
   cambios:=cambios+1;
  end if;
 end loop;
 -- 3) Cuentas, con la huella ya corregida.
 for l in select * from plan_lote2 where codigo is not null order by n loop
  select * into strict m from public.contabilidad_movimientos mv where mv.clave=l.clave;
  if m.categoria<>l.a then raise exception 'n%: la categoría quedó en %. Nada se guardó.',l.n,m.categoria;end if;
  select * into a from public.contabilidad_actual ac where ac.clave=l.clave;
  if a.codigo is not null and (a.codigo<>l.codigo or a.rfc<>l.rfc) then raise exception 'n%: ya tiene otra cuenta (% %). Nada se guardó.',l.n,a.rfc,a.codigo;end if;
  if a.codigo is not distinct from l.codigo and a.rfc is not distinct from l.rfc and a.huella is not distinct from m.huella then continue;end if;
  perform public.asignar_cuenta_contable(md5(v_lote||'cuenta'||l.clave)::uuid,l.clave,a.id,m.huella,l.rfc,l.codigo,l.motivo,true);
  cambios:=cambios+1;
 end loop;
 return cambios;
end $aplicar$;

create or replace function pg_temp.verificar_lote2() returns void language plpgsql as $verificar$
begin
 if exists(select 1 from plan_lote2 p left join public.contabilidad_movimientos m on m.clave=p.clave left join public.contabilidad_actual a on a.clave=p.clave
  where p.codigo is not null and (a.codigo is distinct from p.codigo or a.rfc is distinct from p.rfc or a.huella is distinct from m.huella or m.categoria is distinct from p.a))
  then raise exception 'FALLÓ: alguna cuenta no quedó.';end if;
 if exists(select 1 from plan_lote2 p join public.gastos_caja_chica g on 'gasto:'||g.id::text=p.clave where p.accion='eliminar' and g.anulado_en is null)
  then raise exception 'FALLÓ: algún duplicado no quedó eliminado.';end if;
 if exists(select 1 from plan_lote2 p join public.contabilidad_movimientos m on m.clave=p.clave where p.accion='eliminar')
  then raise exception 'FALLÓ: un duplicado sigue en la lista contable.';end if;
end $verificar$;

do $pruebas$
declare antes jsonb; despues jsonb; n1 integer; n2 integer;
begin
 antes:=jsonb_build_array(
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.facturas t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id) filter (where t.id not in (133,134,135,136)),'[]') from public.factura_conceptos t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id) filter (where 'gasto:'||t.id::text not in (select clave from plan_lote2)),'[]') from public.gastos_caja_chica t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.pago_aplicaciones t));
 n1:=pg_temp.aplicar_lote2();
 if n1<>16 then raise exception 'FALLÓ: se esperaban 16 cambios (4 conceptos, 6 gastos, 6 cuentas) y fueron %.',n1;end if;
 perform pg_temp.verificar_lote2();
 n2:=pg_temp.aplicar_lote2();
 if n2<>0 then raise exception 'FALLÓ: repetir el lote volvió a cambiar % registros.',n2;end if;
 despues:=jsonb_build_array(
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.facturas t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id) filter (where t.id not in (133,134,135,136)),'[]') from public.factura_conceptos t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id) filter (where 'gasto:'||t.id::text not in (select clave from plan_lote2)),'[]') from public.gastos_caja_chica t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.pago_aplicaciones t));
 if antes is distinct from despues then raise exception 'FALLÓ: cambió algo fuera del lote (otra factura, concepto, gasto o pago).';end if;
end $pruebas$;
select 'PRUEBAS OK — 6 cuentas · 4 conceptos a Limpieza · 2 gastos a insumos · 4 duplicados eliminados · nada fuera del lote cambia · repetir no duplica · ensayo reversible' as resultado;
rollback;

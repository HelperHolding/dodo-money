-- ENSAYO. Aplica y deshace con ROLLBACK; no guarda nada. Debe devolver PRUEBAS OK.
-- Lote CUENTAS-PENDIENTES-3-20261113: depósito de garantía de CFE (n110, $3,404.00, Helper, La Calma) a 184-03-000 Otros depósitos en garantía.
-- Requiere ANTES la migración 20261113020000_cuentas_deposito_garantia.sql. No modifica facturas, gastos, pagos ni efectivo.
begin;
set local lock_timeout='5s';
create temp table plan_lote3 on commit drop as select * from jsonb_to_recordset(
 $plan$[
 {
  "n": 110,
  "clave": "concepto:281",
  "categoria": "inversiones",
  "importe": 3404,
  "rfc": "HCM260306B93",
  "codigo": "184-03-000",
  "motivo": "CUENTAS-PENDIENTES-3-20261113 aprobado por Sebastián el 12/11/2026 (n110): Otros depósitos en garantía. Depósito de garantía de CFE del servicio 444260803331 de La Calma; es un activo recuperable, no gasto."
 }
]$plan$::jsonb
) as x(n integer,clave text,categoria text,importe numeric,rfc text,codigo text,motivo text);

-- Aplica el plan. Solo inserta asignaciones por la función oficial; no modifica facturas, gastos, pagos ni efectivo.
create or replace function pg_temp.aplicar_lote3() returns integer language plpgsql as $aplicar$
declare autor uuid; linea record; m public.contabilidad_movimientos; a public.contabilidad_actual; sol uuid; nuevas integer:=0;
 v_lote constant text:='CUENTAS-PENDIENTES-3-20261113';
begin
 -- SQL Editor atribuye la operación al administrador que la aprobó.
 select p.id into strict autor from public.perfiles p join auth.users u on u.id=p.id
 where lower(u.email)='scervera@dodopizza.mx' and p.rol::text='admin' and p.activo and not p.debe_cambiar_contrasena;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',autor,'role','authenticated')::text,true);
 -- Primero se revisa TODO; si algo cambió desde la revisión, no se guarda nada.
 for linea in select * from plan_lote3 order by n loop
  select * into m from public.contabilidad_movimientos mv where mv.clave=linea.clave;
  if not found then raise exception 'n% (%): ya no está vigente (cancelado, anulado o borrado). Nada se guardó.',linea.n,linea.clave;end if;
  if coalesce(m.categoria,'(sin categoría)')<>linea.categoria or m.importe<>linea.importe then
   raise exception 'n% (%): cambió la categoría o el importe (% / %, se revisó % / %). Nada se guardó.',linea.n,linea.clave,m.categoria,m.importe,linea.categoria,linea.importe;end if;
  if m.rfc is not null and m.rfc<>linea.rfc then raise exception 'n% (%): la razón social del documento es %, el plan dice %. Nada se guardó.',linea.n,linea.clave,m.rfc,linea.rfc;end if;
  select * into a from public.contabilidad_actual ac where ac.clave=linea.clave;
  if a.codigo is not null and (a.codigo<>linea.codigo or a.rfc<>linea.rfc) and a.id is distinct from md5(v_lote||linea.clave||linea.codigo)::uuid then
   raise exception 'n% (%): ya tiene otra cuenta confirmada (% %). Nada se guardó.',linea.n,linea.clave,a.rfc,a.codigo;end if;
 end loop;
 for linea in select * from plan_lote3 order by n loop
  select * into strict m from public.contabilidad_movimientos mv where mv.clave=linea.clave;
  select * into a from public.contabilidad_actual ac where ac.clave=linea.clave;
  sol:=md5(v_lote||linea.clave||linea.codigo)::uuid;
  if a.codigo is not distinct from linea.codigo and a.rfc is not distinct from linea.rfc and a.huella is not distinct from m.huella then continue;end if;
  perform public.asignar_cuenta_contable(sol,linea.clave,a.id,m.huella,linea.rfc,linea.codigo,linea.motivo,true);
  nuevas:=nuevas+1;
 end loop;
 return nuevas;
end $aplicar$;

-- Comprobación: el depósito queda con su cuenta y razón social, y con la huella actual del documento.
create or replace function pg_temp.verificar_lote3() returns integer language plpgsql as $verificar$
declare faltan integer;
begin
 select count(*) into faltan from plan_lote3 p
 left join public.contabilidad_movimientos m on m.clave=p.clave
 left join public.contabilidad_actual a on a.clave=p.clave
 where a.codigo is distinct from p.codigo or a.rfc is distinct from p.rfc or a.huella is distinct from m.huella;
 if faltan>0 then raise exception 'FALLÓ: % registros no quedaron con su cuenta.',faltan;end if;
 return (select count(*) from plan_lote3);
end $verificar$;

do $pruebas$
declare n1 integer; n2 integer;
begin
 n1:=pg_temp.aplicar_lote3();
 if n1<>1 then raise exception 'FALLÓ: se esperaba 1 asignación y fueron %.',n1;end if;
 perform pg_temp.verificar_lote3();
 n2:=pg_temp.aplicar_lote3();
 if n2<>0 then raise exception 'FALLÓ: repetir duplicó la asignación.';end if;
end $pruebas$;
select 'PRUEBAS OK — depósito CFE en 184-03-000 · migración aplicada · sin cambios en facturas ni pagos · repetir no duplica · ensayo reversible' as resultado;
rollback;

-- Banca: conciliación documental de movimientos bancarios. No marca facturas pagadas ni crea ventas, pagos, saldos ni movimientos de caja.
begin;
set local lock_timeout='5s';
create table public.banca_conciliaciones (
 id uuid primary key,
 cuenta_id uuid not null references public.banca_cuentas(id),
 tipo text not null check(tipo in ('pago_proveedor','cobro_tarjeta','cobro_rappi','nomina','sin_documento')),
 concepto text not null check(concepto in ('cobranza_tarjeta','cobranza_rappi','deposito_efectivo','proveedores','nomina','imss_impuestos','renta','servicios','marketing','regalias','comisiones_bancarias','comisiones_cobro','otros_operacion','capex','apertura','prestamo_recibido','pago_capital','intereses','traspaso_interno')),
 nota text not null default '' check(length(nota)<=1000),
 monto_movimientos numeric(16,2) not null,
 monto_documentos numeric(16,2),
 diferencia numeric(16,2),
 solicitud jsonb not null,
 creado_por uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 anulada_por uuid references public.perfiles(id), anulada_en timestamptz, motivo_anulacion text,
 check((anulada_en is null)=(anulada_por is null)),
 check(anulada_en is null or length(trim(coalesce(motivo_anulacion,''))) between 5 and 1000),
 check(tipo<>'sin_documento' or length(trim(nota))>0),
 check(coalesce(diferencia,0)=0 or length(trim(nota))>0),
 check((monto_documentos is null)=(diferencia is null))
);
create index banca_conciliaciones_cuenta on public.banca_conciliaciones(cuenta_id,creado_en);
create table public.banca_conciliacion_movimientos (
 conciliacion_id uuid not null references public.banca_conciliaciones(id),
 movimiento_id uuid not null references public.banca_movimientos(id),
 activa boolean not null default true,
 primary key(conciliacion_id,movimiento_id)
);
create unique index banca_conciliacion_movimiento_activo on public.banca_conciliacion_movimientos(movimiento_id) where activa;
create table public.banca_conciliacion_documentos (
 id bigint generated always as identity primary key,
 conciliacion_id uuid not null references public.banca_conciliaciones(id),
 tipo_documento text not null check(tipo_documento in ('pago','venta_dia','rappi_lote','nomina_mes')),
 pago_id uuid references public.pagos(id),
 ventas_dia_id uuid references public.ventas_dia(id),
 rappi_importacion_id uuid references public.rappi_fin_importaciones(id),
 lote text check(lote is null or lote~'^\d{5,20}$'),
 nomina_real_id uuid references public.nomina_reales(id),
 monto numeric(16,2),
 activa boolean not null default true,
 check(num_nonnulls(pago_id,ventas_dia_id,rappi_importacion_id,nomina_real_id)=1),
 check((tipo_documento='pago')=(pago_id is not null)),
 check((tipo_documento='venta_dia')=(ventas_dia_id is not null)),
 check((tipo_documento='rappi_lote')=(rappi_importacion_id is not null)),
 check((tipo_documento='rappi_lote')=(lote is not null)),
 check((tipo_documento='nomina_mes')=(nomina_real_id is not null))
);
create index banca_conciliacion_documentos_conciliacion on public.banca_conciliacion_documentos(conciliacion_id);
create unique index banca_conciliacion_pago_activo on public.banca_conciliacion_documentos(pago_id) where activa and pago_id is not null;
create unique index banca_conciliacion_venta_activa on public.banca_conciliacion_documentos(ventas_dia_id) where activa and ventas_dia_id is not null;
create unique index banca_conciliacion_lote_activo on public.banca_conciliacion_documentos(lote) where activa and lote is not null;

alter table public.banca_conciliaciones enable row level security;
alter table public.banca_conciliacion_movimientos enable row level security;
alter table public.banca_conciliacion_documentos enable row level security;
revoke all on public.banca_conciliaciones,public.banca_conciliacion_movimientos,public.banca_conciliacion_documentos from public,anon,authenticated;
grant select on public.banca_conciliaciones,public.banca_conciliacion_movimientos,public.banca_conciliacion_documentos to authenticated;
create policy banca_conciliaciones_consulta on public.banca_conciliaciones for select to authenticated using(public.ve_compras());
create policy banca_conciliacion_movimientos_consulta on public.banca_conciliacion_movimientos for select to authenticated using(public.ve_compras());
create policy banca_conciliacion_documentos_consulta on public.banca_conciliacion_documentos for select to authenticated using(public.ve_compras());

create view public.banca_por_conciliar with(security_invoker=true) as
 select m.id,m.cuenta_id,m.fecha,m.fila_origen,m.descripcion,m.referencia,m.cargo,m.abono,m.saldo
 from public.banca_movimientos m
 where not exists(select 1 from public.banca_conciliacion_movimientos x where x.movimiento_id=m.id and x.activa);
revoke all on public.banca_por_conciliar from public,anon,authenticated;
grant select on public.banca_por_conciliar to authenticated;

create function public.conciliar_banca(p_solicitud uuid,p_movimientos uuid[],p_tipo text,p_concepto text,p_documentos jsonb,p_nota text)
returns uuid language plpgsql security definer set search_path='' as $$
<<conc>>
declare previa public.banca_conciliaciones; sol jsonb; docs jsonb:=coalesce(p_documentos,'[]'::jsonb); nota text:=trim(coalesce(p_nota,''));
 cuenta uuid; empresa text; n integer; cuentas integer; nabonos integer; ncargos integer; abonos numeric; cargos numeric;
 d jsonb; ndocs integer; tiposdoc text[]; monto numeric; k integer; montodocs numeric; dif numeric; fechas date[]; deposito date;
begin
 if public.mi_rol()::text is distinct from 'admin' then raise exception 'Solo administración concilia movimientos bancarios.';end if;
 if p_solicitud is null or coalesce(array_length(p_movimientos,1),0) not between 1 and 200 or jsonb_typeof(docs) is distinct from 'array' or jsonb_array_length(docs)>200 or length(nota)>1000 then
  raise exception 'Solicitud de conciliación inválida.';end if;
 sol:=jsonb_build_object('movimientos',(select jsonb_agg(x order by x) from unnest(p_movimientos) x),'tipo',p_tipo,'concepto',p_concepto,'documentos',docs,'nota',nota);
 perform pg_advisory_xact_lock(hashtextextended('banca-conciliacion:'||p_solicitud,0));
 select * into previa from public.banca_conciliaciones where id=p_solicitud;
 if found then
  if previa.creado_por<>auth.uid() or previa.solicitud is distinct from sol then raise exception 'La solicitud ya se utilizó con otros datos.';end if;
  return previa.id;
 end if;
 if (select count(distinct x) from unnest(p_movimientos) x)<>array_length(p_movimientos,1) then raise exception 'Hay movimientos repetidos en la solicitud.';end if;
 perform 1 from public.banca_movimientos m where m.id=any(p_movimientos) order by m.id for update;
 select count(*),count(distinct m.cuenta_id),min(m.cuenta_id::text)::uuid,count(*) filter(where m.abono>0),count(*) filter(where m.cargo>0),coalesce(sum(m.abono),0),coalesce(sum(m.cargo),0)
  into n,cuentas,cuenta,nabonos,ncargos,abonos,cargos from public.banca_movimientos m where m.id=any(p_movimientos);
 if n<>array_length(p_movimientos,1) then raise exception 'Algún movimiento no existe.';end if;
 if cuentas<>1 then raise exception 'Todos los movimientos deben ser de la misma cuenta.';end if;
 if exists(select 1 from public.banca_conciliacion_movimientos x where x.movimiento_id=any(p_movimientos) and x.activa) then
  raise exception 'Un movimiento ya está conciliado. Anula su conciliación antes de volver a conciliarlo.';end if;
 select c.rfc into empresa from public.banca_cuentas c where c.id=conc.cuenta;
 ndocs:=jsonb_array_length(docs);
 select coalesce(array_agg(distinct x->>'tipo'),'{}') into tiposdoc from jsonb_array_elements(docs) x;
 if p_tipo='pago_proveedor' then
  if nabonos>0 or ndocs=0 or tiposdoc<>array['pago'] then raise exception 'Un pago a proveedor concilia cargos con uno o más pagos.';end if;
 elsif p_tipo='cobro_tarjeta' then
  if nabonos<>1 or ndocs=0 or tiposdoc<>array['venta_dia'] then raise exception 'Un cobro con tarjeta concilia un depósito (y sus comisiones) con días de venta.';end if;
  if exists(select 1 from public.banca_movimientos m where m.id=any(p_movimientos) and m.cargo>0 and m.fecha<>(select m2.fecha from public.banca_movimientos m2 where m2.id=any(p_movimientos) and m2.abono>0)) then
   raise exception 'En un cobro con tarjeta, las comisiones deben ser del mismo día que el depósito.';end if;
 elsif p_tipo='cobro_rappi' then
  if ncargos>0 or ndocs=0 or tiposdoc<>array['rappi_lote'] then raise exception 'Un cobro de Rappi concilia depósitos con paidlots.';end if;
 elsif p_tipo='nomina' then
  if nabonos>0 or (ndocs>0 and tiposdoc<>array['nomina_mes']) then raise exception 'La nómina concilia cargos, opcionalmente con su nómina real.';end if;
 elsif p_tipo='sin_documento' then
  if ndocs>0 then raise exception 'Una conciliación sin documento no lleva documentos.';end if;
  if nota='' then raise exception 'Escribe una nota para conciliar sin documento.';end if;
 else raise exception 'Tipo de conciliación inválido.';end if;

 insert into public.banca_conciliaciones(id,cuenta_id,tipo,concepto,nota,monto_movimientos,solicitud,creado_por)
  values(p_solicitud,cuenta,p_tipo,p_concepto,nota,abonos-cargos,sol,auth.uid());
 begin
  insert into public.banca_conciliacion_movimientos(conciliacion_id,movimiento_id) select p_solicitud,x from unnest(p_movimientos) x;
  for d in select * from jsonb_array_elements(docs) loop
   if d->>'tipo'='pago' then
    select p.monto into monto from public.pagos p where p.id=(d->>'id')::uuid and p.anulado_en is null and p.forma='transferencia';
    if monto is null then raise exception 'El pago no existe, está anulado o no es transferencia.';end if;
    insert into public.banca_conciliacion_documentos(conciliacion_id,tipo_documento,pago_id,monto) values(p_solicitud,'pago',(d->>'id')::uuid,-monto);
   elsif d->>'tipo'='venta_dia' then
    select v.tarjeta into monto from public.ventas_dia v join public.razon_social_sucursales s on s.sucursal_id=v.sucursal_id and s.rfc=conc.empresa where v.id=(d->>'id')::uuid;
    if monto is null then raise exception 'El día de venta no existe o no es de la razón social de la cuenta.';end if;
    insert into public.banca_conciliacion_documentos(conciliacion_id,tipo_documento,ventas_dia_id,monto) values(p_solicitud,'venta_dia',(d->>'id')::uuid,monto);
   elsif d->>'tipo'='rappi_lote' then
    select coalesce(sum((m->>'neto')::numeric),0),count(*) into monto,k from public.rappi_fin_importaciones i cross join lateral jsonb_array_elements(i.reporte->'movimientos') m
     where i.id=(d->>'importacion')::uuid and i.sustituida_en is null and i.rfc=conc.empresa and m->>'lote'=d->>'lote';
    if k=0 then raise exception 'El paidlot no existe en un reporte vigente de la razón social de la cuenta.';end if;
    insert into public.banca_conciliacion_documentos(conciliacion_id,tipo_documento,rappi_importacion_id,lote,monto) values(p_solicitud,'rappi_lote',(d->>'importacion')::uuid,d->>'lote',round(monto,2));
   elsif d->>'tipo'='nomina_mes' then
    if not exists(select 1 from public.nomina_reales r where r.id=(d->>'id')::uuid and r.anulada_en is null) then raise exception 'La nómina real no existe o está anulada.';end if;
    insert into public.banca_conciliacion_documentos(conciliacion_id,tipo_documento,nomina_real_id) values(p_solicitud,'nomina_mes',(d->>'id')::uuid);
   else raise exception 'Tipo de documento inválido.';
   end if;
  end loop;
 exception when unique_violation then raise exception 'Un movimiento o documento ya está conciliado.';
 end;

 if p_tipo='cobro_tarjeta' then
  select array_agg(distinct v.fecha order by v.fecha) into fechas from public.banca_conciliacion_documentos x join public.ventas_dia v on v.id=x.ventas_dia_id where x.conciliacion_id=p_solicitud;
  select m.fecha into deposito from public.banca_movimientos m where m.id=any(p_movimientos) and m.abono>0;
  if array_length(fechas,1)>7 or fechas[array_length(fechas,1)]-fechas[1]>6 then raise exception 'Los días de venta deben caer en un lapso de hasta 7 días.';end if;
  if fechas[array_length(fechas,1)]>=deposito then raise exception 'Los días de venta deben ser anteriores al depósito.';end if;
 end if;

 select sum(x.monto),count(x.monto) into montodocs,k from public.banca_conciliacion_documentos x where x.conciliacion_id=p_solicitud;
 if k>0 then
  dif:=case when p_tipo='cobro_tarjeta' then abonos-montodocs else abonos-cargos-montodocs end;
  if round(dif,2)<>0 and nota='' then raise exception 'Hay una diferencia de %; escribe una nota para conciliar.',round(dif,2);end if;
  update public.banca_conciliaciones set monto_documentos=round(montodocs,2),diferencia=round(dif,2) where id=p_solicitud;
 end if;
 return p_solicitud;
end$$;

create function public.anular_conciliacion(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare motivo text:=trim(coalesce(p_motivo,''));
begin
 if public.mi_rol()::text is distinct from 'admin' then raise exception 'Solo administración anula conciliaciones.';end if;
 if length(motivo) not between 5 and 1000 then raise exception 'Escribe el motivo de la anulación (5 a 1,000 caracteres).';end if;
 perform 1 from public.banca_conciliaciones where id=p_id and anulada_en is null for update;
 if not found then raise exception 'La conciliación no existe o ya está anulada.';end if;
 update public.banca_conciliaciones set anulada_en=now(),anulada_por=auth.uid(),motivo_anulacion=motivo where id=p_id;
 update public.banca_conciliacion_movimientos set activa=false where conciliacion_id=p_id;
 update public.banca_conciliacion_documentos set activa=false where conciliacion_id=p_id;
end$$;

revoke all on function public.conciliar_banca(uuid,uuid[],text,text,jsonb,text),public.anular_conciliacion(uuid,text) from public,anon;
grant execute on function public.conciliar_banca(uuid,uuid[],text,text,jsonb,text),public.anular_conciliacion(uuid,text) to authenticated;
commit;

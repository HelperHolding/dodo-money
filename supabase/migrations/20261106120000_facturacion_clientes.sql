-- Autofacturación de tickets (spec 2026-11-05). El cliente factura desde /facturar; Facturapi sella y timbra con el CSD de Helper.
-- Las reglas de qué ticket se factura viven aquí. Solo el servidor (service_role) busca, reserva y confirma; la oficina consulta por RLS.
-- Requiere 0007 (pedidos), 0068 (razones_sociales) y 20261020180000 (sucursales.dodois_unit_id). No modifica datos existentes.
begin;
set local lock_timeout='5s';

-- Qué sucursales facturan y con qué emisor. Se fija por RFC: razon_social_sucursales liga Zapopan-1 a SITRU y el ticket dice Helper.
create table public.facturacion_sucursales(
 sucursal_id uuid primary key references public.sucursales(id),
 rfc_emisor text not null references public.razones_sociales(rfc)
);
insert into public.facturacion_sucursales(sucursal_id,rfc_emisor)
 select id,'HCM260306B93' from public.sucursales where dodois_unit_id='11f187558e757f53b0570d952420b810';

create table public.facturas_clientes(
 id uuid primary key default gen_random_uuid(),
 pedido_id text not null references public.pedidos(dodo_id),
 rfc_emisor text not null references public.razones_sociales(rfc),
 rfc text not null constraint facturas_clientes_rfc_check check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' and rfc not in ('XAXX010101000','XEXX010101000')),
 nombre text not null check(length(trim(nombre))>0),
 regimen_fiscal text not null check(regimen_fiscal ~ '^6[0-9]{2}$'),
 codigo_postal text not null check(codigo_postal ~ '^[0-9]{5}$'),
 uso_cfdi text not null constraint facturas_clientes_uso_cfdi_check check(uso_cfdi in ('G03','S01')),
 correo text not null check(correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
 forma_pago text not null constraint facturas_clientes_forma_pago_check check(forma_pago in ('01','04','28')),
 subtotal numeric(12,2),iva numeric(12,2),total numeric(12,2) not null check(total>0),
 estado text not null default 'en_proceso' check(estado in ('en_proceso','timbrada','cancelada','error')),
 facturapi_id text unique,uuid text unique,serie text,folio integer,error text,
 token_descarga uuid not null default gen_random_uuid(),
 creada timestamptz not null default now(),timbrada_en timestamptz,
 cancelada_en timestamptz,motivo_cancelacion text check(motivo_cancelacion in ('02','03')),cancelada_por uuid references public.perfiles(id),
 check(estado<>'timbrada' or (facturapi_id is not null and uuid is not null)),
 check(estado<>'cancelada' or (cancelada_en is not null and motivo_cancelacion is not null))
);
-- Un ticket, una factura: la fila en proceso o timbrada bloquea; error y cancelada liberan.
create unique index facturas_clientes_un_ticket on public.facturas_clientes(pedido_id) where estado in ('en_proceso','timbrada');
create index facturas_clientes_creada on public.facturas_clientes(creada);

create table public.facturacion_intentos(id bigint generated always as identity primary key,ip text not null,creado timestamptz not null default now());
create index facturacion_intentos_ip on public.facturacion_intentos(ip,creado);

-- "Hoy" en México (no UTC: el día 1 a las 00:30 de México todavía es el mes nuevo). facturacion_hoy va aparte para fijarla en pruebas.
create function public.facturacion_dia_mx(p timestamptz) returns date language sql immutable as $$select (p at time zone 'America/Mexico_City')::date$$;
create function public.facturacion_hoy() returns date language sql stable set search_path=public as $$select facturacion_dia_mx(now())$$;

-- Motivo por el que un pedido no se puede facturar, o null si sí.
create function public.facturacion_motivo(p public.pedidos) returns text language sql stable set search_path=public as $$
 select case
  when not exists(select 1 from facturacion_sucursales s where s.sucursal_id=p.sucursal_id) then 'sucursal'
  when date_trunc('month',p.fecha)<>date_trunc('month',facturacion_hoy()) or p.fecha>facturacion_hoy() then 'plazo'
  when p.estado<>'entregado' then 'cancelado'
  when p.tipo='personal' then 'personal'
  when p.agregador is not null then 'agregador'
  when p.pago='otro' then 'pago'
 end$$;

-- Nota: time ± interval da la vuelta a medianoche (00:01 - 3 min = 23:58) y el between no encuentra nada.
-- Dodo no vende entre 23:57 y 00:03, así que no se maneja.
create function public.facturacion_buscar_ticket(p_ip text,p_sucursal uuid,p_fecha date,p_hora time,p_total numeric)
returns table(resultado text,pedido_id text,fecha date,hora time,total numeric,pago text,productos jsonb,factura_id uuid,correo text)
language plpgsql security definer set search_path=public as $$
declare v_n int;v_p pedidos;v_f facturas_clientes;
begin
 if (select count(*) from facturacion_intentos i where i.ip=p_ip and i.creado>now()-interval '10 minutes')>=10 then
  return query select 'limite',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 insert into facturacion_intentos(ip) values(p_ip);
 delete from facturacion_intentos i where i.creado<now()-interval '1 day';
 if date_trunc('month',p_fecha)<>date_trunc('month',facturacion_hoy()) or p_fecha>facturacion_hoy() then
  return query select 'fuera_de_plazo',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 select count(*) into v_n from pedidos p where p.sucursal_id=p_sucursal and p.fecha=p_fecha and p.total=p_total
  and p.hora between p_hora-interval '3 minutes' and p_hora+interval '3 minutes';
 if v_n=0 then return query select 'no_encontrado',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 if v_n>1 then return query select 'varios',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 select * into v_p from pedidos p where p.sucursal_id=p_sucursal and p.fecha=p_fecha and p.total=p_total
  and p.hora between p_hora-interval '3 minutes' and p_hora+interval '3 minutes';
 if facturacion_motivo(v_p) is not null then
  return query select 'no_facturable',null::text,null::date,null::time,null::numeric,null::text,null::jsonb,null::uuid,null::text;return;end if;
 select * into v_f from facturas_clientes f where f.pedido_id=v_p.dodo_id and f.estado='timbrada';
 if found then return query select 'facturado',v_p.dodo_id,v_p.fecha,v_p.hora,v_p.total,v_p.pago,null::jsonb,v_f.id,
  left(split_part(v_f.correo,'@',1),2)||'***@'||split_part(v_f.correo,'@',2);return;end if;
 return query select 'ok',v_p.dodo_id,v_p.fecha,v_p.hora,v_p.total,v_p.pago,
  coalesce((select jsonb_agg(jsonb_build_object('nombre',x.nombre,'precio',x.precio) order by x.renglon) from pedido_productos x where x.pedido_id=v_p.dodo_id),'[]'::jsonb),
  null::uuid,null::text;
end$$;

create function public.facturacion_reservar(p_pedido text,p_datos jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_p pedidos;v_m text;v_f facturas_clientes;v_id uuid;
begin
 select * into v_p from pedidos where dodo_id=p_pedido for update;
 if not found then raise exception 'NO_FACTURABLE:no_encontrado';end if;
 v_m:=facturacion_motivo(v_p);
 if v_m is not null then raise exception 'NO_FACTURABLE:%',v_m;end if;
 select * into v_f from facturas_clientes where pedido_id=p_pedido and estado in ('en_proceso','timbrada');
 if found and v_f.estado='timbrada' then raise exception 'YA_FACTURADO';end if;
 if found then raise exception 'EN_PROCESO:%:%',v_f.id,floor(extract(epoch from v_f.creada))::bigint;end if;
 insert into facturas_clientes(pedido_id,rfc_emisor,rfc,nombre,regimen_fiscal,codigo_postal,uso_cfdi,correo,forma_pago,total)
  select p_pedido,s.rfc_emisor,p_datos->>'rfc',p_datos->>'nombre',p_datos->>'regimen_fiscal',p_datos->>'codigo_postal',
   p_datos->>'uso_cfdi',p_datos->>'correo',p_datos->>'forma_pago',v_p.total
  from facturacion_sucursales s where s.sucursal_id=v_p.sucursal_id
  returning id into v_id;
 return v_id;
end$$;

create function public.facturacion_confirmar(p_id uuid,p_facturapi_id text,p_uuid text,p_serie text,p_folio integer,p_subtotal numeric,p_iva numeric) returns void
language plpgsql security definer set search_path=public as $$
begin
 update facturas_clientes set estado='timbrada',facturapi_id=p_facturapi_id,uuid=upper(p_uuid),serie=p_serie,folio=p_folio,
  subtotal=p_subtotal,iva=p_iva,timbrada_en=now(),error=null where id=p_id and estado='en_proceso';
 if not found then raise exception 'La factura % no está en proceso.',p_id;end if;
end$$;

create function public.facturacion_liberar(p_id uuid,p_error text) returns void
language sql security definer set search_path=public as $$
 update facturas_clientes set estado='error',error=left(p_error,500) where id=p_id and estado='en_proceso'$$;

create function public.facturacion_para_descarga(p_id uuid,p_token uuid) returns text
language sql stable security definer set search_path=public as $$
 select facturapi_id from facturas_clientes where id=p_id and token_descarga=p_token and estado='timbrada'$$;

-- La oficina cancela en Facturapi y luego registra aquí (solo admin). Motivos sin sustitución: 02 errores sin relación, 03 operación no realizada.
create function public.facturacion_registrar_cancelacion(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if mi_rol() is distinct from 'admin' then raise exception 'Solo administración puede cancelar facturas.';end if;
 update facturas_clientes set estado='cancelada',cancelada_en=now(),motivo_cancelacion=p_motivo,cancelada_por=auth.uid()
  where id=p_id and estado='timbrada';
 if not found then raise exception 'La factura no está timbrada.';end if;
end$$;

alter table public.facturacion_sucursales enable row level security;
alter table public.facturas_clientes enable row level security;
alter table public.facturacion_intentos enable row level security;
revoke all on public.facturacion_sucursales,public.facturas_clientes,public.facturacion_intentos from public,anon,authenticated;
grant select on public.facturas_clientes,public.facturacion_sucursales to authenticated;
create policy ver_facturas_clientes on public.facturas_clientes for select using (mi_rol() in ('admin','corporativo'));
create policy ver_facturacion_sucursales on public.facturacion_sucursales for select using (mi_rol() in ('admin','corporativo'));

revoke all on function public.facturacion_dia_mx(timestamptz),public.facturacion_hoy(),public.facturacion_motivo(public.pedidos),
 public.facturacion_buscar_ticket(text,uuid,date,time,numeric),public.facturacion_reservar(text,jsonb),
 public.facturacion_confirmar(uuid,text,text,text,integer,numeric,numeric),public.facturacion_liberar(uuid,text),
 public.facturacion_para_descarga(uuid,uuid),public.facturacion_registrar_cancelacion(uuid,text) from public,anon,authenticated;
grant execute on function public.facturacion_buscar_ticket(text,uuid,date,time,numeric),public.facturacion_reservar(text,jsonb),
 public.facturacion_confirmar(uuid,text,text,text,integer,numeric,numeric),public.facturacion_liberar(uuid,text),
 public.facturacion_para_descarga(uuid,uuid) to service_role;
grant execute on function public.facturacion_registrar_cancelacion(uuid,text) to authenticated;

do $$begin
 if (select count(*) from public.facturacion_sucursales)<>1 then raise exception 'No se encontró la sucursal de Mariano Otero (dodois_unit_id 11f1…b810).';end if;
 if not exists(select 1 from public.razones_sociales where rfc='HCM260306B93' and activa) then raise exception 'Helper (HCM260306B93) no está activa en razones_sociales.';end if;
end $$;
commit;

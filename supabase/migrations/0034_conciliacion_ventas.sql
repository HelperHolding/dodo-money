begin;
create table ventas_conciliaciones (
 id uuid primary key default gen_random_uuid(), sucursal_id uuid not null references sucursales(id), fecha date not null,
 importacion_id uuid not null references importaciones_ventas(id), original jsonb not null,
 efectivo numeric(12,2) not null, tarjeta numeric(12,2) not null, en_linea numeric(12,2) not null,
 conciliar_productos boolean not null, motivo text not null check(length(trim(motivo)) between 10 and 1000),
 registrado_por uuid not null references perfiles(id), registrado_en timestamptz not null default now(),
 anulado_por uuid references perfiles(id), anulado_en timestamptz, motivo_anulacion text,
 check((anulado_en is null)=(anulado_por is null))
);
create unique index on ventas_conciliaciones(importacion_id) where anulado_en is null;
create index on ventas_conciliaciones(sucursal_id,fecha);
alter table ventas_conciliaciones enable row level security;
create policy leer_conciliaciones on ventas_conciliaciones for select using(ve_ventas(sucursal_id));
revoke all on ventas_conciliaciones from anon,authenticated;
grant select on ventas_conciliaciones to authenticated;
create view ventas_conciliaciones_vigentes with (security_invoker=true) as
 select c.* from ventas_conciliaciones c join ventas_dia v on v.importacion_id=c.importacion_id
 where c.anulado_en is null;
revoke all on ventas_conciliaciones_vigentes from anon,authenticated;
grant select on ventas_conciliaciones_vigentes to authenticated;

create function guardar_conciliacion_venta(p_importacion uuid,p_efectivo numeric,p_tarjeta numeric,p_en_linea numeric,p_conciliar_productos boolean,p_motivo text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v ventas_dia; n integer; cobrada numeric; bruta numeric; ag record; resultado uuid;
begin
 if not edita_finanzas() then raise exception 'Solo el admin concilia ventas.';end if;
 select * into v from ventas_dia where importacion_id=p_importacion for update;
 if not found then raise exception 'La importación cambió. Vuelve a consultar el día.';end if;
 if p_motivo is null or length(trim(p_motivo)) not between 10 and 1000 then raise exception 'Escribe el motivo (10 a 1000 caracteres).';end if;
 if p_conciliar_productos is null or p_efectivo is null or p_tarjeta is null or p_en_linea is null
 or not(p_efectivo>=0 and p_efectivo<1e10 and p_tarjeta>=0 and p_tarjeta<1e10 and p_en_linea>=0 and p_en_linea<1e10)
 or p_efectivo<>round(p_efectivo,2) or p_tarjeta<>round(p_tarjeta,2) or p_en_linea<>round(p_en_linea,2) then raise exception 'Montos inválidos.';end if;
 if p_efectivo+p_tarjeta+p_en_linea<>v.efectivo+v.tarjeta+v.en_linea then raise exception 'La corrección debe conservar la suma original de las formas de pago.';end if;
 select coalesce(tarjeta,0) tarjeta,coalesce(en_linea,0) en_linea into ag from ventas_dia_desglose where ventas_dia_id=v.id and tipo='agregador';
 if found and (p_tarjeta<ag.tarjeta or p_en_linea<ag.en_linea) then raise exception 'El ajuste no puede reducir los cobros por debajo del canal agregador.';end if;
 select count(*),coalesce(sum(importe),0),coalesce(sum(importe_sin_descuento),0) into n,cobrada,bruta from ventas_producto where sucursal_id=v.sucursal_id and fecha=v.fecha;
 if p_conciliar_productos and n=0 and v.total<>0 then raise exception 'Falta el detalle de productos; no se puede conciliar la venta bruta.';end if;
 if exists(select 1 from ventas_conciliaciones where importacion_id=p_importacion and anulado_en is null) then raise exception 'Este día ya está conciliado. Anula la conciliación antes de corregirla.';end if;
 insert into ventas_conciliaciones(sucursal_id,fecha,importacion_id,original,efectivo,tarjeta,en_linea,conciliar_productos,motivo,registrado_por)
 values(v.sucursal_id,v.fecha,v.importacion_id,jsonb_build_object('total',v.total,'iva',v.iva,'efectivo',v.efectivo,'tarjeta',v.tarjeta,'en_linea',v.en_linea,'suma_productos',cobrada,'bruta_productos',bruta,'productos',n),p_efectivo,p_tarjeta,p_en_linea,p_conciliar_productos,trim(p_motivo),auth.uid()) returning id into resultado;
 return resultado;
end $$;
create function anular_conciliacion_venta(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not edita_finanzas() then raise exception 'Solo el admin concilia ventas.';end if;
 if p_motivo is null or length(trim(p_motivo)) not between 10 and 1000 then raise exception 'Escribe el motivo (10 a 1000 caracteres).';end if;
 update ventas_conciliaciones set anulado_en=now(),anulado_por=auth.uid(),motivo_anulacion=trim(p_motivo) where id=p_id and anulado_en is null;
 if not found then raise exception 'La conciliación no existe o ya está anulada.';end if;
end $$;
revoke all on function guardar_conciliacion_venta(uuid,numeric,numeric,numeric,boolean,text),anular_conciliacion_venta(uuid,text) from public,anon;
grant execute on function guardar_conciliacion_venta(uuid,numeric,numeric,numeric,boolean,text),anular_conciliacion_venta(uuid,text) to authenticated;
commit;

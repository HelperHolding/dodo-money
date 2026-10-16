begin;
set local lock_timeout='5s';
alter table public.facturas add column uuid_manual text check(uuid_manual is null or uuid_manual ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$');
create unique index factura_uuid_manual_unico on public.facturas(uuid_manual) where uuid_manual is not null;
create table public.factura_uuid_manual_historial (
 id uuid primary key, factura_id uuid not null references public.facturas(id),anterior text,nuevo text,
 motivo text not null check(length(trim(motivo)) between 5 and 500),
 usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now()
);
alter table public.factura_uuid_manual_historial enable row level security;
create policy consultar_uuid_manual on public.factura_uuid_manual_historial for select using(public.ve_compras());
revoke all on public.factura_uuid_manual_historial from public,anon,authenticated;
grant select on public.factura_uuid_manual_historial to authenticated;
-- Serializa las capturas con los ingresos/conversiones XML para evitar duplicados entre ambos campos.
create function public.validar_uuid_manual_factura() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('facturas:uuid-manual',0));
 if new.uuid_manual is not null and new.uuid is not null and upper(new.uuid)<>new.uuid_manual then raise exception 'El UUID del XML no coincide con el capturado manualmente. Revisa y corrige el dato manual con motivo antes de convertir.';end if;
 if exists(select 1 from public.facturas x where x.id<>new.id and
 ((new.uuid_manual is not null and (x.uuid_manual=new.uuid_manual or upper(x.uuid)=new.uuid_manual)) or
 (new.uuid is not null and x.uuid_manual=upper(new.uuid)))) then
 raise exception 'Ese UUID ya pertenece a otro documento. Si corresponde a una prefactura, abre ese registro y usa Convertir con XML.';end if;
 return new;
end $$;
create trigger validar_uuid_manual before insert or update of uuid,uuid_manual on public.facturas for each row execute function public.validar_uuid_manual_factura();
revoke all on function public.validar_uuid_manual_factura() from public,anon,authenticated;
create function public.guardar_uuid_manual_factura(p_solicitud uuid,p_factura uuid,p_anterior text,p_uuid text,p_motivo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare f public.facturas;h public.factura_uuid_manual_historial;v text:=nullif(upper(trim(p_uuid)),'');
begin
 perform public.exigir_admin_compras();
 if p_solicitud is null or p_factura is null or coalesce(length(trim(p_motivo)),0) not between 5 and 500 then raise exception 'Escribe un motivo de 5 a 500 caracteres.';end if;
 if v is not null and v !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' then raise exception 'El UUID debe tener formato XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX.';end if;
 perform pg_advisory_xact_lock(hashtextextended('facturas:uuid-manual',0));
 select * into h from public.factura_uuid_manual_historial where id=p_solicitud;
 if found then
  if h.factura_id<>p_factura or h.anterior is distinct from nullif(p_anterior,'') or h.nuevo is distinct from v or h.motivo<>trim(p_motivo) or h.usuario_id<>auth.uid() then raise exception 'La solicitud ya corresponde a otros datos.';end if;
  return h.id;
 end if;
 select * into f from public.facturas where id=p_factura for update;
 if not found or f.origen<>'manual' or f.tipo<>'ingreso' or f.estado='cancelada' or f.sustituido_por is not null or f.xml_ruta is not null then raise exception 'Solo se captura el UUID manual en una prefactura vigente sin XML.';end if;
 if f.uuid_manual is distinct from nullif(p_anterior,'') then raise exception 'El UUID cambió desde que abriste la factura. Recarga antes de guardar.';end if;
 if f.uuid_manual is not distinct from v then raise exception 'El UUID no tiene cambios.';end if;
 update public.facturas set uuid_manual=v where id=f.id;
 insert into public.factura_uuid_manual_historial(id,factura_id,anterior,nuevo,motivo,usuario_id) values(p_solicitud,f.id,f.uuid_manual,v,trim(p_motivo),auth.uid());
 insert into public.compra_notas(factura_id,texto,usuario_id) values(f.id,'UUID manual: '||coalesce(f.uuid_manual,'Sin UUID')||' → '||coalesce(v,'Sin UUID')||'. XML pendiente. Motivo: '||trim(p_motivo),auth.uid());
 return p_solicitud;
end $$;
revoke all on function public.guardar_uuid_manual_factura(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.guardar_uuid_manual_factura(uuid,uuid,text,text,text) to authenticated;
-- CREATE VIEW fija las columnas de f.*: añadir la nueva sin alterar su orden ni los cálculos actuales.
do $$ declare definicion text;begin
 select pg_get_viewdef('public.facturas_saldo'::regclass,true) into definicion;
 definicion:=regexp_replace(definicion,';\s*$','');
 execute 'create or replace view public.facturas_saldo with(security_invoker=true) as select v.*, f.uuid_manual from ('||definicion||') v join public.facturas f on f.id=v.id';
end $$;
commit;

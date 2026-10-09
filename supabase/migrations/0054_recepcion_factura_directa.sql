begin;
create table public.factura_recepciones (
 id uuid primary key,factura_id uuid not null references public.facturas(id),fecha date not null,
 motivo text not null check(length(trim(motivo)) between 5 and 1000),
 renglones jsonb not null,usuario_id uuid not null default auth.uid() references public.perfiles(id),creado_en timestamptz not null default now(),
 anulada_en timestamptz,anulada_por uuid references public.perfiles(id),motivo_anulacion text,
 check((anulada_en is null and anulada_por is null and motivo_anulacion is null) or (anulada_en is not null and anulada_por is not null and length(trim(motivo_anulacion)) between 5 and 1000))
);
create index factura_recepciones_factura on public.factura_recepciones(factura_id);
alter table public.factura_recepciones enable row level security;
create policy consulta on public.factura_recepciones for select using(public.ve_compras());
revoke all on public.factura_recepciones from public,anon,authenticated;
grant select on public.factura_recepciones to authenticated;
create function public.recibir_factura_directa(p_id uuid,p_factura uuid,p_fecha date,p_motivo text,p_renglones jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare f public.facturas;previa public.factura_recepciones;x jsonb;c public.factura_conceptos;q numeric;recibido numeric;
begin
 perform public.exigir_admin_compras();
 if p_id is null or p_fecha is null or p_fecha>public.hoy_mx() or p_fecha<'2020-01-01' or length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Revisa fecha real y motivo.';end if;
 if p_renglones is null or jsonb_typeof(p_renglones)<>'array' or jsonb_array_length(p_renglones)=0 then raise exception 'Indica cantidades recibidas.';end if;
 perform pg_advisory_xact_lock(hashtextextended('recepcion-factura:'||p_id,0));
 select * into previa from factura_recepciones where id=p_id;
 if found then
 if previa.factura_id is distinct from p_factura or previa.fecha<>p_fecha or previa.motivo<>trim(p_motivo) or previa.renglones<>p_renglones or previa.usuario_id<>auth.uid() then raise exception 'Solicitud ya utilizada.';end if;
 return previa.id;end if;
 select * into f from facturas where id=p_factura for update;
 if f.id is null or f.tipo<>'ingreso' or f.estado='cancelada' then raise exception 'Factura no disponible para recibir.';end if;
 if exists(select 1 from factura_ordenes where factura_id=f.id) then raise exception 'Recibe desde la orden vinculada.';end if;
 if exists(select 1 from jsonb_array_elements(p_renglones) as j(v) group by v->>'id' having count(*)>1) then raise exception 'Conceptos repetidos.';end if;
 for x in select value from jsonb_array_elements(p_renglones) loop
 select * into c from factura_conceptos where id=(x->>'id')::bigint and factura_id=f.id;
 q:=(x->>'cantidad')::numeric;
 if c.id is null or q is null or q<=0 or q>=1e10 or q::text in ('NaN','Infinity','-Infinity') or q<>round(q,4) then raise exception 'Concepto o cantidad inválida.';end if;
 select coalesce(sum((j.v->>'cantidad')::numeric),0) into recibido from factura_recepciones r cross join lateral jsonb_array_elements(r.renglones) j(v) where r.factura_id=f.id and r.anulada_en is null and (j.v->>'id')::bigint=c.id;
 if q+recibido>c.cantidad then raise exception 'Cantidad supera pendiente para %.',c.descripcion;end if;
 end loop;
 insert into factura_recepciones(id,factura_id,fecha,motivo,renglones) values(p_id,f.id,p_fecha,trim(p_motivo),p_renglones);
 return p_id;
end $$;
create function public.anular_recepcion_factura(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
declare fid uuid;r public.factura_recepciones;
begin
 perform public.exigir_admin_compras();
 if length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Escribe motivo de anulación.';end if;
 select factura_id into fid from factura_recepciones where id=p_id;
 perform 1 from facturas where id=fid for update;
 select * into r from factura_recepciones where id=p_id for update;
 if r.id is null or r.anulada_en is not null then raise exception 'Recepción no disponible o ya anulada.';end if;
 update factura_recepciones set anulada_en=now(),anulada_por=auth.uid(),motivo_anulacion=trim(p_motivo) where id=p_id;
end $$;
-- Mismo bloqueo de factura para evitar mezclar fuentes o cambiar conceptos recibidos.
create function public.proteger_recepcion_directa() returns trigger language plpgsql security definer set search_path=public as $$
declare fid uuid;
begin
 if tg_table_name='factura_conceptos' and tg_op='UPDATE' then
 if new.factura_id is distinct from old.factura_id then raise exception 'Un concepto no cambia de factura.';end if;end if;
 if tg_table_name='facturas' then fid:=old.id;else fid:=coalesce(new.factura_id,old.factura_id);end if;
 perform 1 from facturas where id=fid for update;
 if exists(select 1 from factura_recepciones where factura_id=fid and anulada_en is null) then
 if tg_table_name='factura_ordenes' then raise exception 'Anula la recepción directa antes de vincular una orden.';end if;
 if tg_table_name='factura_conceptos' then
 if tg_op<>'UPDATE' then raise exception 'Anula la recepción antes de cambiar conceptos.';end if;
 if new.factura_id is distinct from old.factura_id or new.cantidad is distinct from old.cantidad then raise exception 'Anula la recepción antes de cambiar conceptos o cantidades.';end if;end if;
 if tg_table_name='facturas' then
 if new.estado='cancelada' or new.sucursal_id is distinct from old.sucursal_id then raise exception 'Anula la recepción antes de cancelar o cambiar la sucursal.';end if;end if;
 end if;
 return coalesce(new,old);
end $$;
create trigger recepcion_directa_ligas before insert or update on factura_ordenes for each row execute function proteger_recepcion_directa();
create trigger recepcion_directa_conceptos before insert or update or delete on factura_conceptos for each row execute function proteger_recepcion_directa();
create trigger recepcion_directa_factura before update on facturas for each row execute function proteger_recepcion_directa();
revoke all on function proteger_recepcion_directa() from public,anon,authenticated;
revoke all on function recibir_factura_directa(uuid,uuid,date,text,jsonb),anular_recepcion_factura(uuid,text) from public,anon;
grant execute on function recibir_factura_directa(uuid,uuid,date,text,jsonb),anular_recepcion_factura(uuid,text) to authenticated;
commit;

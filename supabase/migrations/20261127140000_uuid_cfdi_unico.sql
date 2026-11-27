begin;
set local lock_timeout='5s';
-- HD-19: un UUID de CFDI se sube una sola vez entre facturas (uuid del XML o uuid_manual) y gastos de caja chica.
-- Se compara sin espacios y en mayúsculas. La misma factura puede tener el mismo UUID en uuid y uuid_manual.
-- Un gasto eliminado (captura equivocada) no cuenta: su UUID se puede volver a capturar.

create function public.normalizar_uuid_cfdi(p text) returns text language sql immutable parallel safe set search_path='' as $$
 select nullif(upper(regexp_replace(p,'\s','','g')),'')
$$;

-- Registros que ya tienen el UUID, con lo necesario para avisar y ligar. Nada más: es security definer.
create function public.buscar_uuid_cfdi(p_uuid text,p_excluir uuid default null)
returns table(origen text,registro_id uuid,fecha date,sucursal text,usuario text,creado_en timestamptz,liga text)
language sql stable security definer set search_path='' as $$
 select 'factura'::text,f.id,f.fecha_emision,coalesce(s.nombre,'Oficina'),p.nombre,f.creado_en,'/compras/facturas/'||f.id
 from public.facturas f left join public.sucursales s on s.id=f.sucursal_id left join public.perfiles p on p.id=f.creado_por
 where public.normalizar_uuid_cfdi(p_uuid) is not null and f.id is distinct from p_excluir
  and (public.normalizar_uuid_cfdi(f.uuid)=public.normalizar_uuid_cfdi(p_uuid) or public.normalizar_uuid_cfdi(f.uuid_manual)=public.normalizar_uuid_cfdi(p_uuid))
 union all
 select 'gasto'::text,g.id,g.fecha,s.nombre,p.nombre,g.creado_en,'/caja-chica#gasto-'||g.id
 from public.gastos_caja_chica g left join public.sucursales s on s.id=g.sucursal_id left join public.perfiles p on p.id=g.registrado_por
 where public.normalizar_uuid_cfdi(p_uuid) is not null and g.id is distinct from p_excluir and g.anulado_en is null
  and public.normalizar_uuid_cfdi(g.uuid_cfdi)=public.normalizar_uuid_cfdi(p_uuid)
 order by 6,2
$$;
revoke all on function public.buscar_uuid_cfdi(text,uuid) from public,anon;
grant execute on function public.buscar_uuid_cfdi(text,uuid) to authenticated;

-- Trigger común: serializa por UUID y rechaza si otro registro ya lo tiene. La pista (hint) es la liga.
create function public.validar_uuid_cfdi_unico() returns trigger language plpgsql security definer set search_path='' as $$
declare nuevos text[];anteriores text[];u text;c record;
begin
 if tg_table_name='facturas' then
  nuevos:=array[public.normalizar_uuid_cfdi(new.uuid),public.normalizar_uuid_cfdi(new.uuid_manual)];
  if tg_op='UPDATE' then anteriores:=array[public.normalizar_uuid_cfdi(old.uuid),public.normalizar_uuid_cfdi(old.uuid_manual)];end if;
 else
  if new.anulado_en is not null then return new;end if;
  nuevos:=array[public.normalizar_uuid_cfdi(new.uuid_cfdi)];
  if tg_op='UPDATE' and old.anulado_en is null then anteriores:=array[public.normalizar_uuid_cfdi(old.uuid_cfdi)];end if;
 end if;
 -- Orden fijo de candados para no cruzarse con otra transacción que tome los mismos dos UUID.
 for u in select distinct x from unnest(nuevos) x where x is not null and x<>all(coalesce(array_remove(anteriores,null),'{}'::text[])) order by x loop
  perform pg_advisory_xact_lock(hashtext('uuid_cfdi:'||u));
  select * into c from public.buscar_uuid_cfdi(u,new.id) limit 1;
  if found then
   raise exception using errcode='23505',
    message=format('Este UUID ya se subió el %s por %s en %s (%s).',to_char(c.creado_en at time zone 'America/Mexico_City','DD/MM/YYYY'),
     coalesce(c.usuario,'usuario sin registro'),coalesce(c.sucursal,'Oficina'),case c.origen when 'factura' then 'factura' else 'gasto de caja chica' end),
    hint=c.liga;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.validar_uuid_cfdi_unico() from public,anon,authenticated;
-- El nombre ordena este trigger antes de validar_uuid_manual (0070): el aviso que llega a la pantalla es el de HD-19.
create trigger uuid_cfdi_unico before insert or update of uuid,uuid_manual on public.facturas
 for each row execute function public.validar_uuid_cfdi_unico();
create trigger uuid_cfdi_unico before insert or update of uuid_cfdi on public.gastos_caja_chica
 for each row execute function public.validar_uuid_cfdi_unico();

-- Antes del índice de respaldo: no debe haber UUID repetidos entre registros distintos.
do $$ declare lista text;begin
 select string_agg(u||' ('||n||' registros)',', ' order by u) into lista from (
  select u,count(distinct (origen,id)) n from (
   select 'factura' origen,id,public.normalizar_uuid_cfdi(uuid) u from public.facturas
   union all select 'factura',id,public.normalizar_uuid_cfdi(uuid_manual) from public.facturas
   union all select 'gasto',id,public.normalizar_uuid_cfdi(uuid_cfdi) from public.gastos_caja_chica where anulado_en is null
  ) t where u is not null group by u having count(distinct (origen,id))>1) d;
 if lista is not null then
  raise exception 'Hay UUID repetidos entre registros distintos; corrígelos antes de aplicar HD-19: %',lista;
 end if;
end $$;

-- Respaldo del trigger en facturas: el unique existente distingue mayúsculas; este no.
create unique index facturas_uuid_normalizado_unico on public.facturas(public.normalizar_uuid_cfdi(uuid)) where uuid is not null;
commit;

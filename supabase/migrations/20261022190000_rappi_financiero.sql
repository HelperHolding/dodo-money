-- Reporte financiero separado del historial operativo; conserva versiones y original privado.
begin;
set local lock_timeout='5s';
create table public.rappi_fin_importaciones (
 id uuid primary key, sucursal_id uuid not null references public.sucursales(id), rfc text not null references public.razones_sociales(rfc),
 tienda text not null check(tienda~'^\d{5,20}$'), desde date not null, hasta date not null, archivo text not null,
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'), reporte jsonb not null, solicitud jsonb not null,
 creado_por uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 sustituida_en timestamptz, sustituida_por uuid references public.rappi_fin_importaciones(id), motivo text not null,
 check(desde<=hasta), check(jsonb_typeof(reporte)='object'), check(length(motivo) between 12 and 1000),
 check((sustituida_en is null)=(sustituida_por is null))
);
create table public.rappi_fin_archivos (
 importacion_id uuid primary key references public.rappi_fin_importaciones(id),
 contenido bytea not null check(octet_length(contenido) between 1 and 2097152)
);
alter table public.rappi_fin_importaciones enable row level security;
alter table public.rappi_fin_archivos enable row level security;
revoke all on public.rappi_fin_importaciones,public.rappi_fin_archivos from public,anon,authenticated;
grant select on public.rappi_fin_importaciones,public.rappi_fin_archivos to authenticated;
create policy rappi_fin_consulta on public.rappi_fin_importaciones for select to authenticated using(public.ve_compras());
create policy rappi_fin_archivo on public.rappi_fin_archivos for select to authenticated using(public.ve_compras());

create function public.importar_rappi_financiero(p_id uuid,p_sucursal uuid,p_rfc text,p_archivo text,p_original text,p_reporte jsonb,p_previos uuid[],p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $fin$
<<carga>>
declare contenido bytea; sha text; sol jsonb; previa public.rappi_fin_importaciones; factura jsonb; esperado numeric;
 desde date; hasta date; tienda text; m jsonb; k text; n numeric; neto numeric; claves text[]:='{}'; clave text;
 ids uuid[]; actual uuid; u text; campos text[]:=array['bruta','aliado','dar','compensacion','cancelacion','comision','creditoDar','ivaComision','creditoDarIva','retencionIva','retencionIsr'];
begin
 if public.mi_rol()::text is distinct from 'admin' then raise exception 'Solo administración importa reportes financieros.';end if;
 if p_id is null or p_sucursal is null or p_previos is null or coalesce(length(p_archivo),0) not between 1 and 200 or p_archivo!~*'\.xlsx$' or coalesce(length(p_original),0) not between 1 and 2800000 or jsonb_typeof(p_reporte) is distinct from 'object' or coalesce(length(trim(p_motivo)),0) not between 12 and 1000 then raise exception 'Solicitud, respaldo o motivo inválidos.';end if;
 contenido:=decode(p_original,'base64');sha:=encode(sha256(contenido),'hex');
 if octet_length(contenido) not between 1 and 2097152 or substring(contenido from 1 for 4)<>decode('504b0304','hex') then raise exception 'Conserva el Excel original, hasta 2 MB.';end if;
 sol:=jsonb_build_object('sucursal',p_sucursal,'rfc',p_rfc,'archivo',p_archivo,'sha',sha,'reporte',p_reporte,'previos',p_previos,'motivo',p_motivo);
 perform pg_advisory_xact_lock(hashtextextended('rappi-fin-solicitud:'||p_id,0));
 select * into previa from public.rappi_fin_importaciones f where f.id=p_id;
 if found then
  if previa.creado_por<>auth.uid() or previa.solicitud is distinct from sol then raise exception 'Solicitud ya utilizada con otros datos.';end if;
  return previa.id;
 end if;
 if not exists(select 1 from public.razones_sociales e join public.razon_social_sucursales s on s.rfc=e.rfc where e.rfc=p_rfc and e.activa and s.sucursal_id=p_sucursal) then raise exception 'Razón social o sucursal no autorizada.';end if;
 desde:=(p_reporte->>'desde')::date;hasta:=(p_reporte->>'hasta')::date;tienda:=p_reporte->>'tienda';
 if desde is null or hasta is null or desde>hasta or hasta>(now() at time zone 'America/Mexico_City')::date or desde<'2020-01-01' or hasta-desde>366 or tienda is null or tienda!~'^\d{5,20}$' then raise exception 'Periodo o tienda inválidos.';end if;
 perform pg_advisory_xact_lock(hashtextextended('rappi-fin-importacion',0));
 if exists(select 1 from public.rappi_fin_importaciones f where (f.tienda=carga.tienda and f.sucursal_id<>p_sucursal) or (f.sucursal_id=p_sucursal and f.tienda<>carga.tienda)) then raise exception 'La tienda y la sucursal ya tienen otra asociación financiera.';end if;
 select * into previa from public.rappi_fin_importaciones f where f.sucursal_id=p_sucursal and f.sha256=sha and f.sustituida_en is null;
 if found then
  if previa.reporte is distinct from p_reporte or previa.rfc<>p_rfc then raise exception 'Archivo ya registrado con otros datos.';end if;
  return previa.id;
 end if;
 select coalesce(array_agg(f.id order by f.id),'{}'::uuid[]) into ids from public.rappi_fin_importaciones f where f.sucursal_id=p_sucursal and f.sustituida_en is null and f.desde<=carga.hasta and f.hasta>=carga.desde;
 if ids is distinct from (select coalesce(array_agg(x order by x),'{}'::uuid[]) from unnest(p_previos) x) then raise exception 'Los reportes activos cambiaron. Revisa nuevamente antes de confirmar.';end if;
 if exists(select 1 from public.rappi_fin_importaciones f where f.id=any(ids) and (f.desde<carga.desde or f.hasta>carga.hasta or f.rfc<>p_rfc)) then raise exception 'La nueva versión debe cubrir completos los reportes sustituidos y conservar la razón social.';end if;
 if jsonb_typeof(p_reporte->'movimientos') is distinct from 'array' or jsonb_array_length(p_reporte->'movimientos') not between 1 and 5000 then raise exception 'Se requieren de 1 a 5,000 movimientos.';end if;
 for m in select value from jsonb_array_elements(p_reporte->'movimientos') loop
  if coalesce(m->>'orden','')!~'^\d{5,20}$' or m->>'tienda' is distinct from tienda or (m->>'tipo') is null or m->>'tipo' not in ('ORDEN','COMPENSACIÓN') or (m->>'fecha') is null or (m->>'fecha')::date not between desde and hasta or (m->>'lote' is not null and m->>'lote'!~'^\d{5,20}$') or coalesce((m->>'fila')::integer,0)<3 then raise exception 'Movimiento financiero inválido.';end if;
  clave:=m->>'tipo'||'|'||(m->>'orden');
  if m->>'tipo'='ORDEN' and coalesce(m->>'estado','') not in ('pending_review','canceled','canceled_with_charge','finished','delivered') then raise exception 'Estado financiero desconocido.';end if;
  if clave=any(claves) then raise exception 'Movimiento financiero duplicado.';end if;claves:=array_append(claves,clave);
  neto:=0;
  foreach k in array campos loop
   if jsonb_typeof(m->k) is distinct from 'number' then raise exception 'Importe financiero ausente.';end if;
   n:=(m->>k)::numeric;
   if abs(n)>=1e12 or n<>round(n,6) then raise exception 'Precisión o importe inválidos.';end if;
   if (k in ('bruta','creditoDar','creditoDarIva') and n<0) or (k in ('aliado','dar','comision','ivaComision','retencionIva','retencionIsr') and n>0) then raise exception 'Signo financiero inválido.';end if;
   if m->>'tipo'='COMPENSACIÓN' and k<>'compensacion' and n<>0 then raise exception 'La compensación contiene otros conceptos.';end if;
   neto:=neto+n;
  end loop;
  if (m->>'neto') is null or abs(neto-(m->>'neto')::numeric)>.000001 or abs((m->>'dar')::numeric+(m->>'creditoDar')::numeric+(m->>'creditoDarIva')::numeric)>.005 or (m->>'bruta')::numeric+(m->>'aliado')::numeric+(m->>'dar')::numeric<-.005 then raise exception 'El neto o los créditos DAR no cuadran.';end if;
 end loop;
 if (select min((x->>'fecha')::date) from jsonb_array_elements(p_reporte->'movimientos') x)<>desde or (select max((x->>'fecha')::date) from jsonb_array_elements(p_reporte->'movimientos') x)<>hasta then raise exception 'La cobertura no coincide con el primer y último movimiento.';end if;
 if (select abs(sum((x->>'retencionIva')::numeric)/.08-sum((x->>'retencionIsr')::numeric)/.025) from jsonb_array_elements(p_reporte->'movimientos') x)>.02 then raise exception 'Las bases de retención no coinciden.';end if;
 if jsonb_typeof(p_reporte->'uuidsComision') is distinct from 'array' then raise exception 'Lista de CFDI inválida.';end if;
 for u in select jsonb_array_elements_text(p_reporte->'uuidsComision') loop
  if u!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then raise exception 'UUID de comisión inválido.';end if;
 end loop;
 if jsonb_typeof(p_reporte->'facturasComision') is distinct from 'array' then raise exception 'Detalle de CFDI de comisión inválido.';end if;
 if (select count(distinct x) from jsonb_array_elements_text(p_reporte->'uuidsComision') x)<>jsonb_array_length(p_reporte->'uuidsComision') then raise exception 'UUID de comisión duplicado.';end if;
 claves:='{}';
 for factura in select value from jsonb_array_elements(p_reporte->'facturasComision') loop
  if coalesce(factura->>'uuid','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or coalesce(factura->>'lote','')!~'^\d{5,20}$' or factura->>'lote'=any(claves) or not(p_reporte->'uuidsComision' ? (factura->>'uuid')) then raise exception 'CFDI duplicado o sin lote.';end if;
  claves:=array_append(claves,factura->>'lote');
  if exists(select 1 from public.rappi_fin_importaciones anterior cross join lateral jsonb_array_elements(anterior.reporte->'facturasComision') cfdi where anterior.sustituida_en is null and not(anterior.id=any(ids)) and cfdi->>'uuid'=factura->>'uuid' and (anterior.rfc<>p_rfc or anterior.sucursal_id<>p_sucursal or cfdi is distinct from factura)) then raise exception 'El UUID ya tiene otra asignación o importe en un reporte activo.';end if;
  if jsonb_typeof(factura->'subtotal') is distinct from 'number' or jsonb_typeof(factura->'iva') is distinct from 'number' or jsonb_typeof(factura->'total') is distinct from 'number' then raise exception 'Importes de CFDI inválidos.';end if;
  select greatest(0,-sum((x->>'comision')::numeric+(x->>'creditoDar')::numeric)) into esperado from jsonb_array_elements(p_reporte->'movimientos') x where x->>'lote'=factura->>'lote';
  if esperado is null or esperado<=0 or coalesce((factura->>'subtotal')::numeric,-1)<0 or coalesce((factura->>'iva')::numeric,-1)<0 or abs(esperado-(factura->>'subtotal')::numeric)>.03 or abs(round((factura->>'subtotal')::numeric*.16,2)-(factura->>'iva')::numeric)>.01 or round((factura->>'subtotal')::numeric+(factura->>'iva')::numeric,2) is distinct from (factura->>'total')::numeric then raise exception 'El CFDI no coincide con la comisión del lote.';end if;
 end loop;
 if cardinality(claves)<>jsonb_array_length(p_reporte->'uuidsComision') then raise exception 'Lista de CFDI no coincide.';end if;
 insert into public.rappi_fin_importaciones(id,sucursal_id,rfc,tienda,desde,hasta,archivo,sha256,reporte,solicitud,creado_por,motivo)
 values(p_id,p_sucursal,p_rfc,tienda,desde,hasta,p_archivo,sha,p_reporte,sol,auth.uid(),trim(p_motivo));
 insert into public.rappi_fin_archivos(importacion_id,contenido) values(p_id,contenido);
 update public.rappi_fin_importaciones f set sustituida_en=now(),sustituida_por=p_id where f.id=any(ids) and f.sustituida_en is null;
 return p_id;
end;
$fin$;
revoke all on function public.importar_rappi_financiero(uuid,uuid,text,text,text,jsonb,uuid[],text) from public,anon;
grant execute on function public.importar_rappi_financiero(uuid,uuid,text,text,text,jsonb,uuid[],text) to authenticated;
commit;

-- Sustituir el CFDI de una factura vigente por otro XML (el proveedor canceló y volvió a timbrar).
-- Se conserva el mismo factura_id: pagos, órdenes, recepciones, conceptos, cuentas, programación, reservas y adjuntos no cambian.
-- Cambian UUID, serie/folio, fecha, datos fiscales, XML (y PDF si se adjunta). El CFDI anterior queda completo en cfdi_sustituciones.
-- Requiere 0060, 0067, 0068 y 0070.
begin;
set local lock_timeout='5s';

create table public.cfdi_sustituciones (
 id uuid primary key,
 factura_id uuid not null references public.facturas(id),
 uuid_anterior text not null check(uuid_anterior ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'),
 uuid_nuevo text not null check(uuid_nuevo ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' and uuid_nuevo<>uuid_anterior),
 original jsonb not null,
 cfdi jsonb not null,
 motivo text not null check(length(trim(motivo)) between 5 and 500),
 xml_ruta text not null unique,
 bytes integer not null check(bytes between 1 and 4194304),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 pdf_ruta text unique,
 pdf_bytes integer check(pdf_bytes between 1 and 4194304),
 complementos_anteriores jsonb not null default '{}'::jsonb,
 usuario_id uuid not null references public.perfiles(id),
 creado_en timestamptz not null default now(),
 confirmado_en timestamptz,
 check((pdf_ruta is null)=(pdf_bytes is null))
);
create index cfdi_sustituciones_factura on public.cfdi_sustituciones(factura_id,creado_en);
-- Un UUID sustituido no vuelve a usarse ni se sustituye dos veces.
create unique index cfdi_sustitucion_uuid_anterior on public.cfdi_sustituciones(uuid_anterior) where confirmado_en is not null;
create unique index cfdi_sustitucion_uuid_nuevo on public.cfdi_sustituciones(uuid_nuevo) where confirmado_en is not null;
alter table public.cfdi_sustituciones enable row level security;
revoke all on public.cfdi_sustituciones from public,anon,authenticated;
grant select on public.cfdi_sustituciones to authenticated;
create policy sustituciones_consulta on public.cfdi_sustituciones for select to authenticated
 using(public.ve_compras() and (confirmado_en is not null or usuario_id=auth.uid() and public.edita_compras()));

-- Un CFDI ya sustituido no se registra de nuevo como factura (p. ej. si alguien vuelve a subir el XML viejo).
create function public.validar_uuid_sustituido() returns trigger language plpgsql security definer set search_path='' as $$
declare previa uuid;
begin
 if new.uuid is null then return new;end if;
 select s.factura_id into previa from public.cfdi_sustituciones s where s.uuid_anterior=upper(new.uuid) and s.confirmado_en is not null limit 1;
 if found then raise exception 'Ese CFDI fue sustituido por otro en la factura %. No se registra de nuevo.',previa;end if;
 return new;
end $$;
revoke all on function public.validar_uuid_sustituido() from public,anon,authenticated;
create trigger validar_uuid_sustituido before insert or update of uuid on public.facturas for each row execute function public.validar_uuid_sustituido();

-- Reglas compartidas por preparar y confirmar. Devuelve el resumen de complementos ligados al UUID actual.
create function public.validar_sustitucion_cfdi(f public.facturas,p_cfdi jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare proveedor public.proveedores;fiscal text:=upper(p_cfdi->>'uuid');rel jsonb:=coalesce(p_cfdi->'uuids_relacionados','[]'::jsonb);n integer;monto numeric;
begin
 if f.id is null or f.origen<>'cfdi' or f.tipo<>'ingreso' or f.estado='cancelada' or f.sustituido_por is not null or f.uuid is null then
  raise exception 'Solo se sustituye el CFDI de una factura de ingreso vigente.';end if;
 if fiscal is null or fiscal!~'^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' or p_cfdi->>'tipo' is distinct from 'ingreso' or p_cfdi->>'moneda' is distinct from 'MXN' or p_cfdi->>'version' is null or p_cfdi->>'version' not in ('3.3','4.0') then
  raise exception 'Se requiere CFDI de ingreso timbrado en MXN.';end if;
 if fiscal=upper(f.uuid) then raise exception 'El XML es el mismo CFDI que ya tiene la factura.';end if;
 if not public.razon_admite_sucursal(f.rfc_receptor,f.sucursal_id) then raise exception 'La razón social no corresponde a la sucursal de la factura.';end if;
 select * into proveedor from public.proveedores where id=f.proveedor_id;
 if upper(p_cfdi->>'rfc_receptor') is distinct from f.rfc_receptor or upper(p_cfdi->>'rfc_emisor') is distinct from proveedor.rfc then
  raise exception 'El RFC receptor o el proveedor no corresponde a la factura.';end if;
 if exists(select 1 from public.facturas x where x.uuid=fiscal or x.uuid_manual=fiscal) then raise exception 'Ese UUID ya está registrado en otra factura.';end if;
 if exists(select 1 from public.cfdi_sustituciones s where s.uuid_anterior=fiscal and s.confirmado_en is not null) then raise exception 'Ese UUID ya fue sustituido antes; no se vuelve a usar.';end if;
 if jsonb_typeof(rel)<>'array' then raise exception 'CFDI relacionados inválidos.';end if;
 if jsonb_array_length(rel)>0 and not exists(select 1 from jsonb_array_elements_text(rel) r where upper(r)=upper(f.uuid)) then
  raise exception 'El XML relaciona otros CFDI, no el UUID % de esta factura.',f.uuid;end if;
 if exists(select 1 from public.facturas n where n.tipo='egreso' and n.estado<>'cancelada' and n.uuid_relacionado=f.uuid) then
  raise exception 'Esta factura tiene notas de crédito ligadas a su UUID actual. Revísalas con el proveedor antes de sustituir el CFDI.';end if;
 if jsonb_typeof(p_cfdi->'conceptos') is distinct from 'array' or jsonb_array_length(p_cfdi->'conceptos')=0 then raise exception 'El CFDI no tiene conceptos.';end if;
 if (p_cfdi->>'fecha')::date is null or p_cfdi->>'metodo_pago' is null or p_cfdi->>'metodo_pago' not in ('PUE','PPD') then raise exception 'Revisa fecha y método fiscal de pago.';end if;
 if exists(select 1 from unnest(array['subtotal','descuento','iva','retenciones','retencion_iva','retencion_isr','total']) campo where p_cfdi->>campo is null or (p_cfdi->>campo)::numeric<0 or (p_cfdi->>campo)::numeric::text in ('NaN','Infinity','-Infinity')) then
  raise exception 'Importes fiscales inválidos.';end if;
 select count(distinct cf.complemento_id),coalesce(sum(cf.monto_pagado),0) into n,monto from public.complemento_facturas cf where cf.factura_uuid=upper(f.uuid);
 return jsonb_build_object('cantidad',n,'monto',monto);
end $$;
revoke all on function public.validar_sustitucion_cfdi(public.facturas,jsonb) from public,anon,authenticated;

create function public.preparar_sustitucion_cfdi(p_id uuid,p_factura uuid,p_cfdi jsonb,p_motivo text,p_bytes integer,p_sha256 text,p_pdf_bytes integer default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.facturas;v public.cfdi_sustituciones;comp jsonb;
begin
 perform public.exigir_admin_compras();
 if p_id is null or p_factura is null or p_cfdi is null or length(trim(coalesce(p_motivo,''))) not between 5 and 500 or p_bytes is null or p_bytes not between 1 and 4194304
  or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or (p_pdf_bytes is not null and p_pdf_bytes not between 1 and 4194304) then raise exception 'Revisa archivos y motivo.';end if;
 perform pg_advisory_xact_lock(hashtextextended('sustitucion-cfdi:'||p_id,0));
 select * into v from public.cfdi_sustituciones where id=p_id;
 if found then
  if v.usuario_id<>auth.uid() or v.factura_id<>p_factura or v.cfdi<>p_cfdi or v.sha256<>p_sha256 or v.bytes<>p_bytes or v.motivo<>trim(p_motivo) or v.pdf_bytes is distinct from p_pdf_bytes then
   raise exception 'Esta solicitud ya corresponde a otro XML.';end if;
  return jsonb_build_object('id',v.id,'ruta',v.xml_ruta,'ruta_pdf',v.pdf_ruta,'original',v.original,'pagado',public.pagado_factura(v.factura_id),'complementos',v.complementos_anteriores);
 end if;
 select * into f from public.facturas where id=p_factura for update;
 if not found then raise exception 'Factura no encontrada.';end if;
 comp:=public.validar_sustitucion_cfdi(f,p_cfdi);
 insert into public.cfdi_sustituciones(id,factura_id,uuid_anterior,uuid_nuevo,original,cfdi,motivo,xml_ruta,bytes,sha256,pdf_ruta,pdf_bytes,complementos_anteriores,usuario_id)
 values(p_id,f.id,upper(f.uuid),upper(p_cfdi->>'uuid'),to_jsonb(f),p_cfdi,trim(p_motivo),'sustituciones/'||f.id||'/'||p_id||'.xml',p_bytes,p_sha256,
  case when p_pdf_bytes is not null then 'sustituciones/'||f.id||'/'||p_id||'.pdf' end,p_pdf_bytes,comp,auth.uid()) returning * into v;
 return jsonb_build_object('id',v.id,'ruta',v.xml_ruta,'ruta_pdf',v.pdf_ruta,'original',v.original,'pagado',public.pagado_factura(v.factura_id),'complementos',v.complementos_anteriores);
end $$;

create function public.confirmar_sustitucion_cfdi(p_id uuid,p_aceptar_ajuste boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare v public.cfdi_sustituciones;f public.facturas;ajuste boolean;comp jsonb;
begin
 perform public.exigir_admin_compras();
 select * into v from public.cfdi_sustituciones where id=p_id for update;
 if not found or v.usuario_id<>auth.uid() then raise exception 'Sustitución no encontrada.';end if;
 if v.confirmado_en is not null then return v.factura_id;end if;
 if v.creado_en<now()-interval '1 day' then raise exception 'La vista previa expiró. Vuelve a cargar el XML.';end if;
 select * into f from public.facturas where id=v.factura_id for update;
 if to_jsonb(f) is distinct from v.original then raise exception 'La factura cambió después de la vista previa. Vuelve a revisar el XML.';end if;
 comp:=public.validar_sustitucion_cfdi(f,v.cfdi);
 if not exists(select 1 from storage.objects where bucket_id='facturas' and name=v.xml_ruta and (metadata->>'size')::bigint=v.bytes and metadata->>'mimetype'='application/xml') then
  raise exception 'El XML no está subido o no coincide con la reserva.';end if;
 if v.pdf_ruta is not null and not exists(select 1 from storage.objects where bucket_id='facturas' and name=v.pdf_ruta and (metadata->>'size')::bigint=v.pdf_bytes and metadata->>'mimetype'='application/pdf') then
  raise exception 'El PDF no está subido o no coincide con la reserva.';end if;
 ajuste:=exists(select 1 from unnest(array['subtotal','descuento','iva','retenciones','retencion_iva','retencion_isr','total']) campo where round((v.cfdi->>campo)::numeric,2) is distinct from (v.original->>campo)::numeric);
 if ajuste and p_aceptar_ajuste is distinct from true then raise exception 'Acepta corregir los importes con el XML como fuente de verdad.';end if;
 update public.facturas set uuid=upper(v.cfdi->>'uuid'),uuid_manual=null,serie=nullif(v.cfdi->>'serie',''),folio=nullif(v.cfdi->>'folio',''),fecha_emision=(v.cfdi->>'fecha')::date,
  rfc_emisor=upper(v.cfdi->>'rfc_emisor'),nombre_emisor=coalesce(v.cfdi->>'nombre_emisor',''),regimen_emisor=coalesce(v.cfdi->>'regimen_emisor',''),
  metodo_pago=v.cfdi->>'metodo_pago',forma_pago=nullif(v.cfdi->>'forma_pago',''),xml_ruta=v.xml_ruta,pdf_ruta=v.pdf_ruta,
  subtotal=round((v.cfdi->>'subtotal')::numeric,2),descuento=round((v.cfdi->>'descuento')::numeric,2),iva=round((v.cfdi->>'iva')::numeric,2),
  retenciones=round((v.cfdi->>'retenciones')::numeric,2),retencion_iva=round((v.cfdi->>'retencion_iva')::numeric,2),retencion_isr=round((v.cfdi->>'retencion_isr')::numeric,2),
  total=round((v.cfdi->>'total')::numeric,2)
 where id=f.id;
 perform public.actualizar_estado_factura(f.id);
 update public.cfdi_sustituciones set confirmado_en=now(),complementos_anteriores=comp where id=v.id;
 insert into public.compra_notas(factura_id,texto,usuario_id) values(f.id,
  'CFDI sustituido · Anterior: '||coalesce(f.serie,'')||coalesce(f.folio,'s/folio')||' · UUID '||upper(f.uuid)||
  ' → Nuevo: '||coalesce(v.cfdi->>'serie','')||coalesce(v.cfdi->>'folio','s/folio')||' · UUID '||upper(v.cfdi->>'uuid')||' · '||v.motivo||
  case when ajuste then ' · Importes corregidos con el XML. Total anterior: '||f.total||' · Total XML: '||round((v.cfdi->>'total')::numeric,2) else '' end||
  case when (comp->>'cantidad')::int>0 then ' · '||(comp->>'cantidad')||' complemento(s) de pago por '||(comp->>'monto')||' quedan ligados al UUID anterior; se requiere REP del UUID nuevo.' else '' end||
  ' · Pagos, órdenes y recepciones sin cambios. XML anterior conservado.',auth.uid());
 return f.id;
end $$;

revoke all on function public.preparar_sustitucion_cfdi(uuid,uuid,jsonb,text,integer,text,integer) from public,anon;
revoke all on function public.confirmar_sustitucion_cfdi(uuid,boolean) from public,anon;
grant execute on function public.preparar_sustitucion_cfdi(uuid,uuid,jsonb,text,integer,text,integer) to authenticated;
grant execute on function public.confirmar_sustitucion_cfdi(uuid,boolean) to authenticated;
commit;

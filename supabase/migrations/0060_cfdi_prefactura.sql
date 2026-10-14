begin;
set local lock_timeout='5s';
create table public.prefactura_conversiones (
 id uuid primary key,factura_id uuid not null references public.facturas(id),
 original jsonb not null,conceptos_originales jsonb not null,cfdi jsonb not null,
 motivo text not null check(length(trim(motivo)) between 5 and 500),
 xml_ruta text not null unique,bytes integer not null check(bytes between 1 and 4194304),
 sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),confirmado_en timestamptz
);
create unique index prefactura_conversion_confirmada on public.prefactura_conversiones(factura_id) where confirmado_en is not null;
alter table public.prefactura_conversiones enable row level security;
revoke all on public.prefactura_conversiones from public,anon,authenticated;
grant select on public.prefactura_conversiones to authenticated;
create policy conversiones_consulta on public.prefactura_conversiones for select to authenticated using(public.ve_compras() and (confirmado_en is not null or usuario_id=auth.uid() and public.edita_compras()));
create function public.preparar_cfdi_prefactura(p_id uuid,p_factura uuid,p_cfdi jsonb,p_motivo text,p_bytes integer,p_sha256 text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.facturas;v public.prefactura_conversiones;proveedor public.proveedores;receptor text;fiscal text;conceptos jsonb;
begin
 perform public.exigir_admin_compras();
 if p_id is null or p_factura is null or p_cfdi is null or length(trim(coalesce(p_motivo,''))) not between 5 and 500 or p_bytes is null or p_bytes not between 1 and 4194304 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' then raise exception 'Revisa archivo y motivo.';end if;
 perform pg_advisory_xact_lock(hashtextextended('conversion-prefactura:'||p_id,0));
 select * into v from public.prefactura_conversiones where id=p_id;
 if found then
  if v.usuario_id<>auth.uid() or v.factura_id<>p_factura or v.cfdi<>p_cfdi or v.sha256<>p_sha256 or v.bytes<>p_bytes or v.motivo<>trim(p_motivo) then raise exception 'Esta solicitud ya corresponde a otro XML.';end if;
  return jsonb_build_object('id',v.id,'ruta',v.xml_ruta,'cfdi',v.cfdi);
 end if;
 select * into f from public.facturas where id=p_factura for update;
 if not found or f.origen<>'manual' or f.tipo<>'ingreso' or f.estado='cancelada' or f.sustituido_por is not null then raise exception 'Solo una prefactura vigente se convierte a CFDI.';end if;
 fiscal:=upper(p_cfdi->>'uuid');
 if fiscal is null or fiscal!~'^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' or p_cfdi->>'tipo' is distinct from 'ingreso' or p_cfdi->>'moneda' is distinct from 'MXN' or p_cfdi->>'version' is null or p_cfdi->>'version' not in ('3.3','4.0') then raise exception 'Se requiere CFDI de ingreso timbrado en MXN.';end if;
 select rfc into receptor from public.empresa;
 select * into proveedor from public.proveedores where id=f.proveedor_id;
 if receptor is null or upper(p_cfdi->>'rfc_receptor') is distinct from receptor or upper(p_cfdi->>'rfc_emisor') is distinct from proveedor.rfc then raise exception 'El RFC receptor o el proveedor no corresponde a la prefactura.';end if;
 if exists(select 1 from public.facturas where uuid=fiscal) then raise exception 'Ese UUID ya está registrado. No se crea otra factura.';end if;
 if jsonb_typeof(p_cfdi->'conceptos') is distinct from 'array' or jsonb_array_length(p_cfdi->'conceptos')=0 then raise exception 'El CFDI no tiene conceptos.';end if;
 if (p_cfdi->>'fecha')::date is null or p_cfdi->>'metodo_pago' is null or p_cfdi->>'metodo_pago' not in ('PUE','PPD') then raise exception 'Revisa fecha y método fiscal de pago.';end if;
 -- Esta conversión no modifica importes ni asignaciones contables ya registradas.
 if round((p_cfdi->>'total')::numeric,2) is distinct from f.total or round((p_cfdi->>'subtotal')::numeric,2) is distinct from f.subtotal or round(coalesce((p_cfdi->>'descuento')::numeric,0),2) is distinct from f.descuento or round(coalesce((p_cfdi->>'iva')::numeric,0),2) is distinct from f.iva or round(coalesce((p_cfdi->>'retenciones')::numeric,0),2) is distinct from f.retenciones or round(coalesce((p_cfdi->>'retencion_iva')::numeric,0),2) is distinct from f.retencion_iva or round(coalesce((p_cfdi->>'retencion_isr')::numeric,0),2) is distinct from f.retencion_isr then raise exception 'Los importes del XML difieren de la prefactura. Revisa la diferencia antes de convertir; no se modificaron pagos ni saldos.';end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into conceptos from public.factura_conceptos c where factura_id=f.id;
 insert into public.prefactura_conversiones(id,factura_id,original,conceptos_originales,cfdi,motivo,xml_ruta,bytes,sha256,usuario_id)
 values(p_id,f.id,to_jsonb(f),conceptos,p_cfdi,trim(p_motivo),'prefacturas/'||f.id||'/'||p_id||'.xml',p_bytes,p_sha256,auth.uid()) returning * into v;
 return jsonb_build_object('id',v.id,'ruta',v.xml_ruta,'cfdi',v.cfdi);
end $$;
create function public.confirmar_cfdi_prefactura(p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v public.prefactura_conversiones;f public.facturas;conceptos jsonb;
begin
 perform public.exigir_admin_compras();
 select * into v from public.prefactura_conversiones where id=p_id for update;
 if not found or v.usuario_id<>auth.uid() then raise exception 'Conversión no encontrada.';end if;
 if v.confirmado_en is not null then return v.factura_id;end if;
 if v.creado_en<now()-interval '1 day' then raise exception 'La vista previa expiró. Vuelve a cargar el XML.';end if;
 select * into f from public.facturas where id=v.factura_id for update;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into conceptos from public.factura_conceptos c where factura_id=f.id;
 if to_jsonb(f) is distinct from v.original or conceptos is distinct from v.conceptos_originales then raise exception 'La prefactura cambió después de la vista previa. Vuelve a revisar el XML.';end if;
 if exists(select 1 from public.facturas where uuid=upper(v.cfdi->>'uuid')) then raise exception 'Ese UUID ya está registrado.';end if;
 if not exists(select 1 from storage.objects where bucket_id='facturas' and name=v.xml_ruta and (metadata->>'size')::bigint=v.bytes and metadata->>'mimetype'='application/xml') then raise exception 'El XML no está subido o no coincide con la reserva.';end if;
 update public.facturas set origen='cfdi',uuid=upper(v.cfdi->>'uuid'),serie=nullif(v.cfdi->>'serie',''),folio=nullif(v.cfdi->>'folio',''),fecha_emision=(v.cfdi->>'fecha')::date,
 rfc_emisor=upper(v.cfdi->>'rfc_emisor'),nombre_emisor=v.cfdi->>'nombre_emisor',regimen_emisor=v.cfdi->>'regimen_emisor',rfc_receptor=upper(v.cfdi->>'rfc_receptor'),metodo_pago=v.cfdi->>'metodo_pago',forma_pago=nullif(v.cfdi->>'forma_pago',''),xml_ruta=v.xml_ruta where id=f.id;
 update public.prefactura_conversiones set confirmado_en=now() where id=v.id;
 insert into public.compra_notas(factura_id,texto,usuario_id) values(f.id,'Prefactura convertida a factura CFDI · UUID '||upper(v.cfdi->>'uuid')||' · Referencia original: '||coalesce(f.folio,'')||' · '||v.motivo,auth.uid());
 return f.id;
end $$;
revoke all on function public.preparar_cfdi_prefactura(uuid,uuid,jsonb,text,integer,text),public.confirmar_cfdi_prefactura(uuid) from public,anon;
grant execute on function public.preparar_cfdi_prefactura(uuid,uuid,jsonb,text,integer,text),public.confirmar_cfdi_prefactura(uuid) to authenticated;
commit;

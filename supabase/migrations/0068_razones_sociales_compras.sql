-- Razones sociales del mismo grupo: mismos usuarios; no crea tenants independientes.
begin;
set local lock_timeout='5s';
create table public.razones_sociales (
 rfc text primary key check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
 razon_social text not null check(length(trim(razon_social))>0),
 regimen_fiscal text,codigo_postal text,domicilio text,correo_compras text,
 principal boolean not null default false,activa boolean not null default true,
 creado_en timestamptz not null default now()
);
create unique index razon_principal on public.razones_sociales(principal) where principal;
create table public.razon_social_sucursales (
 rfc text not null references public.razones_sociales(rfc),
 sucursal_id uuid not null references public.sucursales(id),primary key(rfc,sucursal_id)
);
create table public.razones_sociales_historial (
 id bigint generated always as identity primary key,rfc text not null references public.razones_sociales,
 datos jsonb not null,usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now()
);
insert into public.razones_sociales(rfc,razon_social,regimen_fiscal,codigo_postal,domicilio,correo_compras,principal)
 select rfc,razon_social,regimen_fiscal,codigo_postal,domicilio,correo_compras,true from public.empresa;
-- Alta confirmada por el usuario; no se inventan domicilio ni régimen fiscal.
insert into public.razones_sociales(rfc,razon_social) values('CMS230321FI8','COMERCIALIZADORA MASTER SITRU');
insert into public.razon_social_sucursales(rfc,sucursal_id)
 select 'CMS230321FI8',id from public.sucursales where nombre='Zapopan-1';
-- Diagnóstico del histórico: una prefactura del 06/10/2026 contiene G93, no B93.
-- Se conserva literalmente. Esta etiqueta NO afirma una razón social legal ni autoriza nuevas capturas.
insert into public.razones_sociales(rfc,razon_social,activa)
 select distinct f.rfc_receptor,'Receptor histórico pendiente de revisión · '||f.rfc_receptor,false
 from public.facturas f where f.rfc_receptor='HCM260306G93'
 and not exists(select 1 from public.razones_sociales e where e.rfc=f.rfc_receptor);

do $$begin
 if (select count(*) from public.razones_sociales where principal)<>1 then raise exception 'Configura la empresa principal antes de 0068.';end if;
 if (select count(*) from public.razon_social_sucursales where rfc='CMS230321FI8')<>1 then raise exception 'Se requiere una sola sucursal Zapopan-1.';end if;
 if exists(select 1 from public.facturas f where not exists(select 1 from public.razones_sociales e where e.rfc=f.rfc_receptor)) then raise exception 'Hay RFC históricos sin razón social; revisar antes de migrar.';end if;
end $$;
alter table public.razones_sociales enable row level security;
alter table public.razon_social_sucursales enable row level security;
alter table public.razones_sociales_historial enable row level security;
revoke all on public.razones_sociales,public.razon_social_sucursales,public.razones_sociales_historial from public,anon,authenticated;
grant select on public.razones_sociales,public.razon_social_sucursales,public.razones_sociales_historial to authenticated;
create policy razones_consulta on public.razones_sociales for select to authenticated using(public.ve_compras());
create policy razones_sucursales_consulta on public.razon_social_sucursales for select to authenticated using(public.ve_compras());
create policy razones_historial_consulta on public.razones_sociales_historial for select to authenticated using(public.ve_compras());
create function public.razon_admite_sucursal(p_rfc text,p_sucursal uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.razones_sociales e where e.rfc=p_rfc and e.activa and
 (e.principal or exists(select 1 from public.razon_social_sucursales s where s.rfc=e.rfc and s.sucursal_id=p_sucursal)))
$$;
revoke all on function public.razon_admite_sucursal(text,uuid) from public,anon,authenticated;
alter table public.ordenes_compra add column rfc_receptor text references public.razones_sociales(rfc);
update public.ordenes_compra set rfc_receptor=(select rfc from public.razones_sociales where principal);
alter table public.ordenes_compra alter column rfc_receptor set not null;
alter table public.facturas add constraint factura_razon_social foreign key(rfc_receptor) references public.razones_sociales(rfc);
alter table public.complementos_pago add column rfc_receptor text references public.razones_sociales(rfc);
update public.complementos_pago set rfc_receptor=(select rfc from public.razones_sociales where principal);
alter table public.complementos_pago alter column rfc_receptor set not null;

create function public.validar_razon_documento() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='ordenes_compra' and new.rfc_receptor is null then
  new.rfc_receptor:=(select rfc from public.razones_sociales where principal);
 end if;
 if tg_op='UPDATE' and new.rfc_receptor is distinct from old.rfc_receptor then
  raise exception 'La razón social de un documento registrado no se cambia.';
 end if;
 if tg_op='INSERT' or new.sucursal_id is distinct from old.sucursal_id then
  if not public.razon_admite_sucursal(new.rfc_receptor,new.sucursal_id) then raise exception 'La razón social no está activa o no corresponde a esta sucursal.';end if;
 end if;
 if tg_table_name='facturas' then
  if new.uuid_relacionado is not null and exists(select 1 from public.facturas f where f.uuid=new.uuid_relacionado and f.rfc_receptor<>new.rfc_receptor) then raise exception 'La nota de crédito corresponde a otra razón social.';end if;
  if new.uuid is not null and exists(select 1 from public.facturas f where f.uuid_relacionado=new.uuid and f.rfc_receptor<>new.rfc_receptor) then raise exception 'Existen notas de crédito de otra razón social para este UUID.';end if;
  if new.uuid is not null and exists(select 1 from public.complemento_facturas cf join public.complementos_pago c on c.id=cf.complemento_id where cf.factura_uuid=new.uuid and c.rfc_receptor<>new.rfc_receptor) then raise exception 'El complemento registrado corresponde a otra razón social.';end if;
 end if;
 return new;
end $$;
create trigger z_razon_documento before insert or update on public.ordenes_compra for each row execute function public.validar_razon_documento();
create trigger z_razon_documento before insert or update on public.facturas for each row execute function public.validar_razon_documento();
revoke all on function public.validar_razon_documento() from public,anon,authenticated;

create function public.validar_razon_vinculo() returns trigger
language plpgsql security definer set search_path='' as $$
declare receptor text;otro text;
begin
 if tg_table_name='factura_ordenes' then
  select rfc_receptor into receptor from public.facturas where id=new.factura_id;
  select rfc_receptor into otro from public.ordenes_compra where id=new.orden_id;
 elsif tg_table_name='complemento_facturas' then
  select rfc_receptor into receptor from public.complementos_pago where id=new.complemento_id;
  select rfc_receptor into otro from public.facturas where uuid=new.factura_uuid;
 end if;
 if otro is not null and receptor is distinct from otro then raise exception 'No se vinculan documentos de distintas razones sociales.';end if;
 return new;
end $$;
create trigger razon_vinculo before insert or update on public.factura_ordenes for each row execute function public.validar_razon_vinculo();
create trigger razon_vinculo before insert or update on public.complemento_facturas for each row execute function public.validar_razon_vinculo();
revoke all on function public.validar_razon_vinculo() from public,anon,authenticated;

-- La configuración principal continúa siendo compatible con días de pago y caja.
create function public.sincronizar_razon_principal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.rfc<>new.rfc then raise exception 'Agrega otra razón social; no reemplaces el RFC de la empresa principal.';end if;
 update public.razones_sociales set razon_social=new.razon_social,regimen_fiscal=new.regimen_fiscal,codigo_postal=new.codigo_postal,domicilio=new.domicilio,correo_compras=new.correo_compras where rfc=new.rfc and principal;
 return new;
end $$;
create trigger sincronizar_razon after update on public.empresa for each row execute function public.sincronizar_razon_principal();
revoke all on function public.sincronizar_razon_principal() from public,anon,authenticated;

create function public.registrar_razon_social(p_rfc text,p_nombre text,p_sucursales uuid[],p_motivo text) returns text
language plpgsql security definer set search_path='' as $$
declare receptor text:=upper(trim(p_rfc));e public.razones_sociales;
begin
 perform public.exigir_admin_compras();
 if receptor is null or receptor !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' or coalesce(length(trim(p_nombre)),0) not between 1 and 250 or coalesce(length(trim(p_motivo)),0) not between 5 and 500 or coalesce(cardinality(p_sucursales),0)=0 then raise exception 'Revisa RFC, razón social, sucursales y motivo (mínimo 5 caracteres).';end if;
 if exists(select 1 from unnest(p_sucursales) s where s is null or not exists(select 1 from public.sucursales x where x.id=s)) then raise exception 'Sucursal no válida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('razon-social:'||receptor,0));
 select * into e from public.razones_sociales where rfc=receptor;
 if found then
  if e.razon_social<>trim(p_nombre) or e.principal or not e.activa or exists((select sucursal_id from public.razon_social_sucursales where rfc=receptor except select unnest(p_sucursales)) union (select unnest(p_sucursales) except select sucursal_id from public.razon_social_sucursales where rfc=receptor)) then raise exception 'El RFC ya está registrado con otros datos; no se sobrescribió.';end if;
  return receptor;
 end if;
 insert into public.razones_sociales(rfc,razon_social) values(receptor,trim(p_nombre));
 insert into public.razon_social_sucursales select receptor,s from (select distinct unnest(p_sucursales) s) q;
 insert into public.razones_sociales_historial(rfc,datos,usuario_id) values(receptor,jsonb_build_object('evento','alta','nombre',trim(p_nombre),'sucursales',p_sucursales,'motivo',trim(p_motivo)),auth.uid());
 return receptor;
end $$;
revoke all on function public.registrar_razon_social(text,text,uuid[],text) from public,anon;
grant execute on function public.registrar_razon_social(text,text,uuid[],text) to authenticated;


create or replace function registrar_factura(p_cfdi jsonb, p_alta_proveedor boolean, p_xml text, p_pdf text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e public.razones_sociales; v_prov proveedores; v_id uuid; v_previa facturas; v_fecha date := (p_cfdi->>'fecha')::date;
  v_metodo text := nullif(p_cfdi->>'metodo_pago', '');
begin
  perform exigir_admin_compras();
  select * into e from public.razones_sociales where rfc=upper(p_cfdi->>'rfc_receptor') and activa;
  if not found then raise exception 'El RFC receptor no está registrado como razón social activa del grupo.'; end if;
  if upper(p_cfdi->>'rfc_receptor') <> e.rfc then
    raise exception 'La factura es para el RFC %, no para % (%).', p_cfdi->>'rfc_receptor', e.razon_social, e.rfc;
  end if;
  select * into v_previa from facturas where uuid = upper(p_cfdi->>'uuid');
  if found then
    raise exception 'Esta factura ya se registró el % (folio %).', to_char(v_previa.creado_en at time zone 'America/Mexico_City', 'DD/MM/YYYY'), coalesce(v_previa.serie || '-', '') || coalesce(v_previa.folio, v_previa.uuid);
  end if;
  if coalesce(p_cfdi->>'moneda', 'MXN') <> 'MXN' then raise exception 'Solo se registran facturas en pesos (MXN).'; end if;

  select * into v_prov from proveedores where rfc = upper(p_cfdi->>'rfc_emisor');
  if not found then
    if not p_alta_proveedor then raise exception 'El proveedor con RFC % no está en la cartera.', p_cfdi->>'rfc_emisor'; end if;
    insert into proveedores (razon_social, rfc, regimen_fiscal)
    values (coalesce(nullif(trim(p_cfdi->>'nombre_emisor'), ''), upper(p_cfdi->>'rfc_emisor')), upper(p_cfdi->>'rfc_emisor'),
            case when p_cfdi->>'regimen_emisor' ~ '^6[0-9]{2}$' then p_cfdi->>'regimen_emisor' else '601' end)
    returning * into v_prov;
  end if;

  insert into facturas (uuid, serie, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, metodo_pago, forma_pago,
                        subtotal, descuento, iva, retenciones, retencion_iva, retencion_isr, total, proveedor_id, sucursal_id, uuid_relacionado, vence_el, xml_ruta, pdf_ruta, estado)
  values (upper(p_cfdi->>'uuid'), nullif(p_cfdi->>'serie', ''), nullif(p_cfdi->>'folio', ''), (p_cfdi->>'tipo')::tipo_factura, v_fecha,
          upper(p_cfdi->>'rfc_emisor'), coalesce(p_cfdi->>'nombre_emisor', ''), coalesce(p_cfdi->>'regimen_emisor', ''), upper(p_cfdi->>'rfc_receptor'),
          v_metodo, nullif(p_cfdi->>'forma_pago', ''),
          (p_cfdi->>'subtotal')::numeric, coalesce((p_cfdi->>'descuento')::numeric, 0), coalesce((p_cfdi->>'iva')::numeric, 0),
          coalesce((p_cfdi->>'retenciones')::numeric, 0), coalesce((p_cfdi->>'retencion_iva')::numeric, 0), coalesce((p_cfdi->>'retencion_isr')::numeric, 0),
          (p_cfdi->>'total')::numeric, v_prov.id, case when not e.principal and (select count(*) from public.razon_social_sucursales where rfc=e.rfc)=1 then (select sucursal_id from public.razon_social_sucursales where rfc=e.rfc limit 1) else v_prov.sucursal_id end, nullif(upper(p_cfdi->>'uuid_relacionado'), ''),
          case when v_metodo = 'PUE' then v_fecha else v_fecha + v_prov.dias_credito end, p_xml, nullif(p_pdf, ''),
          case when p_cfdi->>'tipo' = 'egreso' then 'pagada'::estado_factura else 'por_pagar'::estado_factura end)
  returning id into v_id;

  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe)
  select v_id, c.descripcion, c.cantidad, coalesce(c.unidad, ''), c.valor_unitario, c.importe
    from jsonb_to_recordset(coalesce(p_cfdi->'conceptos', '[]'::jsonb))
         c(descripcion text, cantidad numeric, unidad text, valor_unitario numeric, importe numeric);
  return v_id;
end $$;

create or replace function registrar_gasto_manual(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare e public.razones_sociales; v_prov proveedores; v_id uuid; v_fecha date := (p->>'fecha')::date; v_sub numeric; v_total numeric;
begin
  perform exigir_admin_compras();
  select * into e from public.razones_sociales where rfc=coalesce(nullif(upper(trim(p->>'rfc_receptor')),''),(select rfc from public.razones_sociales where principal)) and activa;
  if not found then raise exception 'Configura primero el RFC de la empresa (Compras → Facturas → Datos de la empresa).'; end if;
  select * into v_prov from proveedores where id = (p->>'proveedor_id')::uuid;
  if not found then raise exception 'Proveedor no encontrado'; end if;
  if coalesce(trim(p->>'folio'), '') = '' then raise exception 'Escribe la referencia (folio de la prefactura o del recibo).'; end if;
  if v_fecha is null or v_fecha > hoy_mx() then raise exception 'La fecha no puede ser futura.'; end if;
  if jsonb_array_length(coalesce(p->'renglones', '[]'::jsonb)) = 0 then raise exception 'Agrega al menos un renglón.'; end if;
  select coalesce(sum(r.importe), 0) into v_sub from jsonb_to_recordset(p->'renglones') r(importe numeric);
  if v_sub <= 0 or abs(v_sub - (p->>'subtotal')::numeric) > 0.005 then raise exception 'El subtotal no cuadra con los renglones.'; end if;
  v_total := round((p->>'subtotal')::numeric + (p->>'iva')::numeric - (p->>'retencion_iva')::numeric - (p->>'retencion_isr')::numeric, 2);
  if abs(v_total - (p->>'total')::numeric) > 0.005 then raise exception 'El total no cuadra con el IVA y las retenciones.'; end if;

  insert into facturas (origen, uuid, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor,
                        subtotal, descuento, iva, retenciones, retencion_iva, retencion_isr, total, proveedor_id, sucursal_id, vence_el, xml_ruta, pdf_ruta, estado)
  values ('manual', null, trim(p->>'folio'), 'ingreso', v_fecha, v_prov.rfc, v_prov.razon_social, v_prov.regimen_fiscal, e.rfc,
          round(v_sub, 2), 0, round((p->>'iva')::numeric, 2),
          round((p->>'retencion_iva')::numeric + (p->>'retencion_isr')::numeric, 2), round((p->>'retencion_iva')::numeric, 2), round((p->>'retencion_isr')::numeric, 2),
          v_total, v_prov.id, nullif(p->>'sucursal_id', '')::uuid,
          coalesce(nullif(p->>'vence_el', '')::date, v_fecha + v_prov.dias_credito), null, nullif(p->>'adjunto', ''), 'por_pagar')
  returning id into v_id;

  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe, cuenta_pl)
  select v_id, trim(r.descripcion), 1, '', round(r.importe, 2), round(r.importe, 2), nullif(r.cuenta_pl, '')
    from jsonb_to_recordset(p->'renglones') r(descripcion text, importe numeric, cuenta_pl text);
  return v_id;
end $$;

create or replace function registrar_complemento(p_complemento jsonb, p_xml text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e public.razones_sociales; v_id uuid; v_previo complementos_pago;
begin
  perform exigir_admin_compras();
  select * into e from public.razones_sociales where rfc=upper(p_complemento->>'rfc_receptor') and activa;
  if not found then raise exception 'Configura primero el RFC de la empresa.'; end if;
  if upper(p_complemento->>'rfc_receptor') <> e.rfc then
    raise exception 'El complemento es para el RFC %, no para % (%).', p_complemento->>'rfc_receptor', e.razon_social, e.rfc;
  end if;
  select * into v_previo from complementos_pago where uuid = upper(p_complemento->>'uuid');
  if found then raise exception 'Este complemento ya se registró el %.', to_char(v_previo.creado_en at time zone 'America/Mexico_City', 'DD/MM/YYYY'); end if;
  insert into complementos_pago (uuid, fecha, rfc_emisor, nombre_emisor, proveedor_id, monto, xml_ruta, rfc_receptor)
  values (upper(p_complemento->>'uuid'), (p_complemento->>'fecha')::date, upper(p_complemento->>'rfc_emisor'), coalesce(p_complemento->>'nombre_emisor', ''),
          (select id from proveedores where rfc = upper(p_complemento->>'rfc_emisor')), coalesce((p_complemento->>'monto')::numeric, 0), p_xml, e.rfc)
  returning id into v_id;
  insert into complemento_facturas (complemento_id, factura_uuid, monto_pagado, parcialidad)
  select v_id, upper(d.uuid), coalesce(d.monto_pagado, 0), d.parcialidad
    from jsonb_to_recordset(coalesce(p_complemento->'documentos', '[]'::jsonb)) d(uuid text, monto_pagado numeric, parcialidad integer);
  return v_id;
end $$;

create or replace function public.preparar_cfdi_prefactura(p_id uuid,p_factura uuid,p_cfdi jsonb,p_motivo text,p_bytes integer,p_sha256 text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.facturas;v public.prefactura_conversiones;proveedor public.proveedores;receptor text;fiscal text;conceptos jsonb;
begin
 perform public.exigir_admin_compras();
 if p_id is null or p_factura is null or p_cfdi is null or length(trim(coalesce(p_motivo,''))) not between 5 and 500 or p_bytes is null or p_bytes not between 1 and 4194304 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' then raise exception 'Revisa archivo y motivo.';end if;
 perform pg_advisory_xact_lock(hashtextextended('conversion-prefactura:'||p_id,0));
 select * into v from public.prefactura_conversiones where id=p_id;
 if found then
  if v.usuario_id<>auth.uid() or v.factura_id<>p_factura or v.cfdi<>p_cfdi or v.sha256<>p_sha256 or v.bytes<>p_bytes or v.motivo<>trim(p_motivo) then raise exception 'Esta solicitud ya corresponde a otro XML.';end if;
  return jsonb_build_object('id',v.id,'ruta',v.xml_ruta,'cfdi',v.cfdi,'original',v.original,'pagado',public.pagado_factura(v.factura_id));
 end if;
 select * into f from public.facturas where id=p_factura for update;
 if not found or f.origen<>'manual' or f.tipo<>'ingreso' or f.estado='cancelada' or f.sustituido_por is not null then raise exception 'Solo una prefactura vigente se convierte a CFDI.';end if;
 fiscal:=upper(p_cfdi->>'uuid');
 if fiscal is null or fiscal!~'^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' or p_cfdi->>'tipo' is distinct from 'ingreso' or p_cfdi->>'moneda' is distinct from 'MXN' or p_cfdi->>'version' is null or p_cfdi->>'version' not in ('3.3','4.0') then raise exception 'Se requiere CFDI de ingreso timbrado en MXN.';end if;
 receptor:=f.rfc_receptor;
 if not public.razon_admite_sucursal(receptor,f.sucursal_id) then raise exception 'La razón social no corresponde a la sucursal de la prefactura.';end if;
 select * into proveedor from public.proveedores where id=f.proveedor_id;
 if receptor is null or upper(p_cfdi->>'rfc_receptor') is distinct from receptor or upper(p_cfdi->>'rfc_emisor') is distinct from proveedor.rfc then raise exception 'El RFC receptor o el proveedor no corresponde a la prefactura.';end if;
 if exists(select 1 from public.facturas where uuid=fiscal) then raise exception 'Ese UUID ya está registrado. No se crea otra factura.';end if;
 if jsonb_typeof(p_cfdi->'conceptos') is distinct from 'array' or jsonb_array_length(p_cfdi->'conceptos')=0 then raise exception 'El CFDI no tiene conceptos.';end if;
 if (p_cfdi->>'fecha')::date is null or p_cfdi->>'metodo_pago' is null or p_cfdi->>'metodo_pago' not in ('PUE','PPD') then raise exception 'Revisa fecha y método fiscal de pago.';end if;
 if exists(select 1 from unnest(array['subtotal','descuento','iva','retenciones','retencion_iva','retencion_isr','total']) campo where p_cfdi->>campo is null or (p_cfdi->>campo)::numeric<0 or (p_cfdi->>campo)::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'Importes fiscales inválidos.';end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into conceptos from public.factura_conceptos c where factura_id=f.id;
 insert into public.prefactura_conversiones(id,factura_id,original,conceptos_originales,cfdi,motivo,xml_ruta,bytes,sha256,usuario_id)
 values(p_id,f.id,to_jsonb(f),conceptos,p_cfdi,trim(p_motivo),'prefacturas/'||f.id||'/'||p_id||'.xml',p_bytes,p_sha256,auth.uid()) returning * into v;
 return jsonb_build_object('id',v.id,'ruta',v.xml_ruta,'cfdi',v.cfdi,'original',v.original,'pagado',public.pagado_factura(v.factura_id));
end $$;

create or replace function public.facturar_orden(p_orden uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.ordenes_compra;v uuid;n integer;s numeric;i numeric;r jsonb;cuenta text;
begin
 perform public.exigir_admin_compras();
 select * into o from public.ordenes_compra where id=p_orden for update;
 if not found then raise exception 'Orden no encontrada.';end if;
 if o.estado not in ('confirmada','cerrada') then raise exception 'Confirma la orden antes de facturar.';end if;
 select count(*),(array_agg(f.id order by f.creado_en,f.id))[1] into n,v from public.factura_ordenes fo join public.facturas f on f.id=fo.factura_id where fo.orden_id=o.id and f.tipo='ingreso' and f.estado<>'cancelada';
 if n=1 then return v;end if;
 if n>1 then raise exception 'La orden ya tiene varias facturas. Abre la que quieres pagar.';end if;
 if o.estado<>'confirmada' then raise exception 'La orden cerrada no tiene factura vigente. Revisa sus documentos.';end if;
 select p.cuenta_pl into cuenta from public.proveedores p where p.id=o.proveedor_id;
 select coalesce(sum(round(cantidad*precio,2)),0),coalesce(sum(round(round(cantidad*precio,2)*case when tasa_iva='16' then .16 else 0 end,2)),0),jsonb_agg(jsonb_build_object('descripcion',descripcion,'importe',round(cantidad*precio,2),'cuenta_pl',cuenta) order by creado_en,id) into s,i,r from public.orden_renglones where orden_id=o.id;
 if s<=0 or r is null then raise exception 'La orden no tiene renglones con importe.';end if;
 if exists(select 1 from public.orden_renglones where orden_id=o.id and precio<=0) then raise exception 'La orden tiene renglones sin precio. Revisa la orden antes de facturar.';end if;
 v:=public.registrar_gasto_manual(jsonb_build_object('rfc_receptor',o.rfc_receptor,'proveedor_id',o.proveedor_id,'sucursal_id',o.sucursal_id,'folio','Prefactura '||o.folio,'fecha',public.hoy_mx(),'subtotal',s,'iva',i,'retencion_iva',0,'retencion_isr',0,'total',s+i,'renglones',r));
 -- Conservar cantidades y precios unitarios, no solamente el importe de cada concepto.
 delete from public.factura_conceptos where factura_id=v;
 insert into public.factura_conceptos(factura_id,descripcion,cantidad,unidad,valor_unitario,importe,cuenta_pl)
 select v,r.descripcion,r.cantidad,a.unidad,r.precio,round(r.cantidad*r.precio,2),cuenta from public.orden_renglones r join public.articulos a on a.id=r.articulo_id where r.orden_id=o.id order by r.creado_en,r.id;
 perform public.ligar_factura_ordenes(v,array[o.id]);
 return v;
end $$;

create or replace function copiar_orden(p_id uuid, p_proveedor uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra; v_nueva uuid;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada') then raise exception 'Solo se copia una cotización'; end if;
  if p_proveedor = o.proveedor_id then raise exception 'Esa cotización ya es de ese proveedor'; end if;
  if not coalesce((select activo from proveedores where id = p_proveedor), false) then raise exception 'Elige un proveedor activo'; end if;
  insert into ordenes_compra (proveedor_id, sucursal_id, grupo_id, notas, rfc_receptor) values (p_proveedor, o.sucursal_id, o.grupo_id, o.notas,o.rfc_receptor)
  returning id into v_nueva;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva)
  select v_nueva, r.articulo_id, r.descripcion, r.cantidad,
         coalesce((select pp.precio from precios_proveedor pp where pp.proveedor_id = p_proveedor and pp.articulo_id = r.articulo_id), 0),
         r.tasa_iva
    from orden_renglones r where r.orden_id = p_id order by r.creado_en, r.id;
  insert into orden_historial (orden_id, evento, nota) values (v_nueva, 'copiada', 'Alternativa de ' || o.folio);
  return v_nueva;
end $$;

create or replace function sustituir_factura_manual(p_cfdi uuid, p_manual uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c facturas; m facturas; v_cuentas integer; v_cuenta text; v_sin boolean;
begin
  perform exigir_admin_compras();
  select * into c from facturas where id = p_cfdi for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  select * into m from facturas where id = p_manual for update;
  if not found then raise exception 'Gasto sin CFDI no encontrado'; end if;
  if c.origen <> 'cfdi' or c.tipo <> 'ingreso' or c.estado = 'cancelada' then raise exception 'Solo una factura con CFDI vigente sustituye a un gasto sin CFDI.'; end if;
  if m.origen <> 'manual' then raise exception 'Solo se sustituye un gasto sin CFDI.'; end if;
  if m.estado = 'cancelada' then raise exception 'Ese gasto sin CFDI ya está cancelado o sustituido.'; end if;
  if m.rfc_receptor is distinct from c.rfc_receptor then raise exception 'No se sustituyen documentos de distintas razones sociales.';end if;
  if m.proveedor_id <> c.proveedor_id then raise exception 'El CFDI es de otro proveedor.'; end if;
  if pagado_factura(p_manual) > saldo_factura(p_cfdi) + 0.005 then
    raise exception 'Lo pagado al gasto (%) pasa el saldo del CFDI (%).', pagado_factura(p_manual), saldo_factura(p_cfdi);
  end if;

  -- Si un mismo pago ya estaba aplicado a los dos, se suma en el CFDI.
  update pago_aplicaciones a set monto = a.monto + b.monto
    from pago_aplicaciones b where a.factura_id = p_cfdi and b.factura_id = p_manual and a.pago_id = b.pago_id;
  delete from pago_aplicaciones b
   where b.factura_id = p_manual and exists (select 1 from pago_aplicaciones a where a.factura_id = p_cfdi and a.pago_id = b.pago_id);
  update pago_aplicaciones set factura_id = p_cfdi where factura_id = p_manual;

  -- Las órdenes ligadas al gasto pasan al CFDI (siguen facturadas).
  insert into factura_ordenes (factura_id, orden_id) select p_cfdi, orden_id from factura_ordenes where factura_id = p_manual on conflict do nothing;
  delete from factura_ordenes where factura_id = p_manual;

  -- Manda la sucursal elegida en el gasto: la del CFDI pudo venir de la sucursal por omisión del proveedor.
  update facturas set sucursal_id = m.sucursal_id where id = p_cfdi;
  -- Y el periodo que cubre: el gasto se capturó con el que realmente cubre (la prefactura de la renta de octubre).
  update facturas set cubre_desde = m.cubre_desde, cubre_hasta = m.cubre_hasta where id = p_cfdi;

  -- Cuenta efectiva de cada renglón del gasto (la suya o la de la factura). Si todos tienen la misma, la toma el CFDI;
  -- si hay varias o alguno sin cuenta, se asignan a mano.
  select count(distinct coalesce(fc.cuenta_pl, m.cuenta_pl)), min(coalesce(fc.cuenta_pl, m.cuenta_pl)), bool_or(coalesce(fc.cuenta_pl, m.cuenta_pl) is null)
    into v_cuentas, v_cuenta, v_sin from factura_conceptos fc where fc.factura_id = p_manual;
  if v_cuentas = 0 then v_cuentas := case when m.cuenta_pl is null then 0 else 1 end; v_cuenta := m.cuenta_pl; v_sin := m.cuenta_pl is null; end if;
  if v_cuentas = 1 and not coalesce(v_sin, false) then
    update factura_conceptos set cuenta_pl = v_cuenta where factura_id = p_cfdi and cuenta_pl is null;
    update facturas set cuenta_pl = v_cuenta where id = p_cfdi;
  end if;

  update facturas set estado = 'cancelada', sustituido_por = p_cfdi, cancelada_por = auth.uid(), cancelada_en = now(),
         motivo_cancelacion = 'Sustituido por CFDI ' || coalesce(c.serie || '-', '') || coalesce(c.folio, c.uuid)
   where id = p_manual;
  perform actualizar_estado_factura(p_cfdi);
  return jsonb_build_object('faltan_cuentas', v_cuentas > 1 or coalesce(v_sin, false),
                            'sucursal_cambio', c.sucursal_id is distinct from m.sucursal_id);
end $$;

commit;

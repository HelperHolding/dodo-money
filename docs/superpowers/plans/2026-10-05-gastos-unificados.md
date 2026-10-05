# Gastos unificados en Compras — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar de alta cualquier gasto con proveedor en Compras, con XML o sin XML, con cuenta del P&L por renglón; el CFDI que llega después sustituye al gasto sin CFDI; "Gastos del mes" desaparece.

**Architecture:** Un gasto sin CFDI es una fila más de `facturas` (`origen = 'manual'`, sin UUID ni XML), así hereda saldo, pagos, vencimiento, listas y P&L. La cuenta del P&L baja a `factura_conceptos`; el P&L reparte cada factura entre sus conceptos (`partesFactura`). Funciones con reglas en la base: `registrar_gasto_manual`, `asignar_cuentas_conceptos`, `sustituir_factura_manual`. El cálculo de impuestos del gasto sin CFDI vive en `lib/compras/gastoManual.ts` (puro, con pruebas) y se usa en el formulario y en la acción.

**Tech Stack:** Next.js 15, React 19, TypeScript estricto, Supabase (Postgres + RLS + Storage), `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-10-05-gastos-unificados-design.md`

## Global Constraints

- IVA 16 % o 0 %; retención de IVA "dos tercios" = IVA × 2/3; retención de ISR 10 % del subtotal; todo a centavos (`Math.round(n * 100) / 100`). Total = subtotal + IVA − retenciones.
- Un gasto sin CFDI **siempre lleva referencia** (se guarda en `folio`): así todas las pantallas que muestran `serie + folio` lo nombran sin UUID.
- La sucursal por omisión del proveedor solo se aplica a un **CFDI de ingreso sin destino**; el gasto sin CFDI guarda la sucursal elegida (también "Oficina").
- Permisos: admin captura, asigna y sustituye (`exigir_admin_compras`); corporativo solo consulta.
- Adjunto del gasto sin CFDI: PDF o imagen, máximo 4 MB, en el bucket `facturas` bajo `manual/`.
- Los módulos de `lib/` se importan entre sí solo como tipos; archivos en CRLF; reemplazos con función; pruebas nuevas al script `test`.

## Review Focus

1. **Sustitución con pagos**: un pago ya aplicado al gasto sin CFDI y también al CFDI (mismo pago) se suma sin romper `unique (pago_id, factura_id)`; el estado del CFDI se recalcula (Tarea 1).
2. **Pantallas que daban por hecho el UUID** (`uuid.slice`): con un gasto sin CFDI no truenan (Tarea 2 `nombreFactura` y Tarea 7).
3. **P&L sin doble conteo**: el gasto sin CFDI sustituido queda cancelado; "Gastos del mes" ya no se lee (Tarea 4).
4. **Factura de muchos conceptos** (insumos con 50 renglones): el detalle del P&L agrupa por cuenta, no un renglón por concepto (Tarea 4).
5. **Descuento del CFDI** repartido entre conceptos y renglón sin cuenta que cae a la de la factura (Tarea 4).

---

### Task 1: Migración 0026 y su prueba

**Files:**
- Create: `supabase/migrations/0026_gastos_unificados.sql`, `supabase/pruebas/0026_gastos_unificados.sql`

**Interfaces:**
- Produces: `facturas.origen` (`cfdi`|`manual`), `facturas.sustituido_por`, `facturas.retencion_iva`, `facturas.retencion_isr`; `factura_conceptos.cuenta_pl`; `proveedores.sucursal_id`; `registrar_gasto_manual(p jsonb) returns uuid`; `asignar_cuentas_conceptos(p_factura uuid, p_cuentas jsonb)`; `sustituir_factura_manual(p_cfdi uuid, p_manual uuid) returns boolean` (true = el gasto tenía varias cuentas y faltan por asignar en los conceptos del CFDI); `registrar_factura` guarda `retencion_iva`/`retencion_isr` del JSON.

- [ ] **Step 1: Migración**

```sql
-- Gastos unificados en Compras: una factura puede ser sin CFDI (prefactura, recibo); cuenta del P&L por concepto;
-- retenciones por tipo; sucursal por omisión del proveedor; el CFDI que llega sustituye al gasto sin CFDI.
-- "Gastos del mes" deja de usarse (la tabla se conserva). Requiere 0001–0025.

alter table facturas add column origen text not null default 'cfdi' check (origen in ('cfdi', 'manual'));
alter table facturas add column sustituido_por uuid references facturas(id);
alter table facturas add column retencion_iva numeric(14,2) not null default 0;
alter table facturas add column retencion_isr numeric(14,2) not null default 0;
alter table facturas alter column uuid drop not null, alter column xml_ruta drop not null;
alter table facturas add constraint facturas_cfdi_completo check (origen = 'manual' or (uuid is not null and xml_ruta is not null));
alter table facturas add constraint facturas_manual_con_referencia check (origen = 'cfdi' or coalesce(trim(folio), '') <> '');

alter table factura_conceptos add column cuenta_pl text check (cuenta_pl in
  ('repartidores', 'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'otros', 'insumos', 'inversiones'));
alter table proveedores add column sucursal_id uuid references sucursales(id);

-- La vista se rehace para traer las columnas nuevas.
drop view facturas_saldo;
create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo, neto_factura(f.id) as neto, pagado_factura(f.id) as pagado, falta_complemento(f.id) as falta_complemento
  from facturas f;

-- Herencias al dar de alta: la nota de crédito toma cuenta y sucursal de su factura; la cuenta, la del proveedor;
-- un CFDI de ingreso sin destino toma la sucursal por omisión del proveedor (el gasto sin CFDI trae la suya elegida).
create or replace function heredar_cuenta_factura() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cuenta text; v_sucursal uuid;
begin
  if new.tipo = 'egreso' and new.uuid_relacionado is not null then
    select cuenta_pl, sucursal_id into v_cuenta, v_sucursal from facturas where uuid = new.uuid_relacionado and tipo = 'ingreso';
    if found then
      new.cuenta_pl := coalesce(new.cuenta_pl, v_cuenta);
      new.sucursal_id := coalesce(new.sucursal_id, v_sucursal);
    end if;
  end if;
  if new.cuenta_pl is null then select cuenta_pl into new.cuenta_pl from proveedores where id = new.proveedor_id; end if;
  if new.origen = 'cfdi' and new.tipo = 'ingreso' and new.sucursal_id is null then
    select sucursal_id into new.sucursal_id from proveedores where id = new.proveedor_id;
  end if;
  return new;
end $$;

-- registrar_factura: igual que en 0013, más las retenciones por tipo que ya trae el JSON del XML.
create or replace function registrar_factura(p_cfdi jsonb, p_alta_proveedor boolean, p_xml text, p_pdf text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e empresa; v_prov proveedores; v_id uuid; v_previa facturas; v_fecha date := (p_cfdi->>'fecha')::date;
  v_metodo text := nullif(p_cfdi->>'metodo_pago', '');
begin
  perform exigir_admin_compras();
  select * into e from empresa;
  if not found then raise exception 'Configura primero el RFC de la empresa (Compras → Facturas → Datos de la empresa).'; end if;
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
                        subtotal, descuento, iva, retenciones, retencion_iva, retencion_isr, total, proveedor_id, uuid_relacionado, vence_el, xml_ruta, pdf_ruta, estado)
  values (upper(p_cfdi->>'uuid'), nullif(p_cfdi->>'serie', ''), nullif(p_cfdi->>'folio', ''), (p_cfdi->>'tipo')::tipo_factura, v_fecha,
          upper(p_cfdi->>'rfc_emisor'), coalesce(p_cfdi->>'nombre_emisor', ''), coalesce(p_cfdi->>'regimen_emisor', ''), upper(p_cfdi->>'rfc_receptor'),
          v_metodo, nullif(p_cfdi->>'forma_pago', ''),
          (p_cfdi->>'subtotal')::numeric, coalesce((p_cfdi->>'descuento')::numeric, 0), coalesce((p_cfdi->>'iva')::numeric, 0),
          coalesce((p_cfdi->>'retenciones')::numeric, 0), coalesce((p_cfdi->>'retencion_iva')::numeric, 0), coalesce((p_cfdi->>'retencion_isr')::numeric, 0),
          (p_cfdi->>'total')::numeric, v_prov.id, nullif(upper(p_cfdi->>'uuid_relacionado'), ''),
          case when v_metodo = 'PUE' then v_fecha else v_fecha + v_prov.dias_credito end, p_xml, nullif(p_pdf, ''),
          case when p_cfdi->>'tipo' = 'egreso' then 'pagada'::estado_factura else 'por_pagar'::estado_factura end)
  returning id into v_id;

  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe)
  select v_id, c.descripcion, c.cantidad, coalesce(c.unidad, ''), c.valor_unitario, c.importe
    from jsonb_to_recordset(coalesce(p_cfdi->'conceptos', '[]'::jsonb))
         c(descripcion text, cantidad numeric, unidad text, valor_unitario numeric, importe numeric);
  return v_id;
end $$;

-- Gasto sin CFDI. p: {proveedor_id, sucursal_id|null, fecha, vence_el|null, folio, adjunto|null,
--   renglones: [{descripcion, importe, cuenta_pl|null}], subtotal, iva, retencion_iva, retencion_isr, total}.
create or replace function registrar_gasto_manual(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare e empresa; v_prov proveedores; v_id uuid; v_fecha date := (p->>'fecha')::date; v_sub numeric; v_total numeric;
begin
  perform exigir_admin_compras();
  select * into e from empresa;
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

-- Cuenta del P&L de cada concepto ("" = la de la factura). p_cuentas: [{id, cuenta}].
create or replace function asignar_cuentas_conceptos(p_factura uuid, p_cuentas jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if not exists (select 1 from facturas where id = p_factura and estado <> 'cancelada') then raise exception 'Factura no encontrada o cancelada'; end if;
  update factura_conceptos c set cuenta_pl = nullif(x.cuenta, '')
    from jsonb_to_recordset(coalesce(p_cuentas, '[]'::jsonb)) x(id bigint, cuenta text)
   where c.id = x.id and c.factura_id = p_factura;
end $$;

-- El CFDI que llega sustituye al gasto sin CFDI: los pagos pasan al CFDI y el gasto queda cancelado.
-- Devuelve true si el gasto tenía varias cuentas (los conceptos del CFDI sin cuenta hay que asignarlos a mano).
create or replace function sustituir_factura_manual(p_cfdi uuid, p_manual uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare c facturas; m facturas; v_cuentas integer; v_cuenta text;
begin
  perform exigir_admin_compras();
  select * into c from facturas where id = p_cfdi for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  select * into m from facturas where id = p_manual for update;
  if not found then raise exception 'Gasto sin CFDI no encontrado'; end if;
  if c.origen <> 'cfdi' or c.tipo <> 'ingreso' or c.estado = 'cancelada' then raise exception 'Solo una factura con CFDI vigente sustituye a un gasto sin CFDI.'; end if;
  if m.origen <> 'manual' then raise exception 'Solo se sustituye un gasto sin CFDI.'; end if;
  if m.estado = 'cancelada' then raise exception 'Ese gasto sin CFDI ya está cancelado o sustituido.'; end if;
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

  update facturas set sucursal_id = coalesce(c.sucursal_id, m.sucursal_id) where id = p_cfdi;
  select count(distinct cuenta_pl), min(cuenta_pl) into v_cuentas, v_cuenta from factura_conceptos where factura_id = p_manual and cuenta_pl is not null;
  if v_cuentas = 1 then update factura_conceptos set cuenta_pl = v_cuenta where factura_id = p_cfdi and cuenta_pl is null; end if;

  update facturas set estado = 'cancelada', sustituido_por = p_cfdi, cancelada_por = auth.uid(), cancelada_en = now(),
         motivo_cancelacion = 'Sustituido por CFDI ' || coalesce(c.serie || '-', '') || coalesce(c.folio, c.uuid)
   where id = p_manual;
  perform actualizar_estado_factura(p_cfdi);
  return v_cuentas > 1;
end $$;

revoke execute on function registrar_gasto_manual(jsonb), asignar_cuentas_conceptos(uuid, jsonb), sustituir_factura_manual(uuid, uuid) from public, anon;
grant execute on function registrar_gasto_manual(jsonb), asignar_cuentas_conceptos(uuid, jsonb), sustituir_factura_manual(uuid, uuid) to authenticated;
```

- [ ] **Step 2: Prueba SQL**

```sql
-- Pruebas de la migración 0026 (gastos unificados). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un usuario activo con sucursal, un usuario corporativo activo y los datos de la empresa.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_suc uuid; v_prov uuid; v_otro uuid; v_manual uuid; v_cfdi uuid; v_pago uuid; v_faltan boolean; v_n numeric;
  v_ok text[] := '{}';
begin
  select id, sucursal_id into v_a, v_suc from perfiles where activo and sucursal_id is not null limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesita un usuario activo con sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;
  if not exists (select 1 from empresa) then raise exception 'FALTAN DATOS: configura los datos de la empresa.'; end if;

  insert into proveedores (razon_social, rfc, regimen_fiscal, cuenta_pl, sucursal_id, dias_credito)
  values ('Arrendador Prueba', 'PEPJ800101AB1', '606', 'renta', v_suc, 5) returning id into v_prov;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Otro Prueba', 'OTRO800101AB1', '601') returning id into v_otro;

  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  -- Alta de la prefactura de renta + agua.
  v_manual := registrar_gasto_manual(jsonb_build_object(
    'proveedor_id', v_prov, 'sucursal_id', v_suc, 'fecha', current_date - 1, 'vence_el', null, 'folio', 'Prefactura renta', 'adjunto', null,
    'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'Renta', 'importe', 30000, 'cuenta_pl', 'renta'),
                                   jsonb_build_object('descripcion', 'Agua', 'importe', 1200, 'cuenta_pl', 'servicios')),
    'subtotal', 31200, 'iva', 4992, 'retencion_iva', 3328, 'retencion_isr', 3120, 'total', 29744));
  if (select origen from facturas where id = v_manual) <> 'manual' or (select uuid from facturas where id = v_manual) is not null then raise exception 'FALLÓ: debía quedar como gasto sin CFDI'; end if;
  if (select total from facturas where id = v_manual) <> 29744 or (select retenciones from facturas where id = v_manual) <> 6448 then raise exception 'FALLÓ: total y retenciones'; end if;
  if (select saldo from facturas_saldo where id = v_manual) <> 29744 then raise exception 'FALLÓ: saldo del gasto sin CFDI'; end if;
  if (select vence_el from facturas where id = v_manual) <> current_date - 1 + 5 then raise exception 'FALLÓ: vencimiento por días de crédito'; end if;
  if (select string_agg(cuenta_pl, ',' order by importe desc) from factura_conceptos where factura_id = v_manual) <> 'renta,servicios' then raise exception 'FALLÓ: cuenta por renglón'; end if;
  v_ok := array_append(v_ok, 'alta de gasto sin CFDI con cuenta por renglón');

  begin
    perform registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', current_date, 'folio', ' ',
      'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'importe', 10)), 'subtotal', 10, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 10));
    raise exception 'FALLÓ: sin referencia no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe la referencia%' then raise exception 'FALLÓ: mensaje inesperado (referencia): %', sqlerrm; end if;
  end;
  begin
    perform registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', current_date, 'folio', 'X',
      'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'importe', 10)), 'subtotal', 10, 'iva', 1.6, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 99));
    raise exception 'FALLÓ: un total que no cuadra no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'El total no cuadra%' then raise exception 'FALLÓ: mensaje inesperado (total): %', sqlerrm; end if;
  end;
  begin
    insert into facturas (tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el)
    values ('ingreso', current_date, 'X', 'X', '601', 'X', 1, 1, v_prov, current_date);
    raise exception 'FALLÓ: un CFDI sin UUID ni XML no debe pasar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%facturas_cfdi_completo%' then raise exception 'FALLÓ: mensaje inesperado (check): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'reglas del alta (referencia, total, CFDI completo)');

  -- Pago de una parte del gasto sin CFDI.
  v_pago := registrar_pago(v_prov, current_date - 1, 10000, 'transferencia', null, 'prueba', null,
    jsonb_build_array(jsonb_build_object('factura_id', v_manual, 'monto', 10000)));
  if (select estado::text from facturas where id = v_manual) <> 'parcial' then raise exception 'FALLÓ: el gasto sin CFDI se paga como factura'; end if;

  -- Llega el CFDI (sin destino: toma la sucursal del proveedor) con dos conceptos sin cuenta.
  insert into facturas (uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, iva, retenciones, total, proveedor_id, vence_el, xml_ruta)
  values ('PRUEBA-0026-CFDI', 'ingreso', current_date, 'PEPJ800101AB1', 'Arrendador Prueba', '606', (select rfc from empresa), 31200, 4992, 6448, 29744, v_prov, current_date + 5, 'prueba.xml')
  returning id into v_cfdi;
  if (select sucursal_id from facturas where id = v_cfdi) is distinct from v_suc then raise exception 'FALLÓ: el CFDI toma la sucursal por omisión del proveedor'; end if;
  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe)
  values (v_cfdi, 'Renta', 1, '', 30000, 30000), (v_cfdi, 'Agua', 1, '', 1200, 1200);
  v_ok := array_append(v_ok, 'el CFDI toma la sucursal por omisión del proveedor');

  -- Corporativo no sustituye.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform sustituir_factura_manual(v_cfdi, v_manual);
    raise exception 'FALLÓ: corporativo no debe sustituir';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  v_faltan := sustituir_factura_manual(v_cfdi, v_manual);
  if not v_faltan then raise exception 'FALLÓ: con dos cuentas debía avisar que faltan cuentas por concepto'; end if;
  if (select estado::text from facturas where id = v_manual) <> 'cancelada' or (select sustituido_por from facturas where id = v_manual) <> v_cfdi then raise exception 'FALLÓ: el gasto queda cancelado y ligado'; end if;
  if pagado_factura(v_cfdi) <> 10000 or (select estado::text from facturas where id = v_cfdi) <> 'parcial' then raise exception 'FALLÓ: el pago pasa al CFDI y recalcula su estado'; end if;
  if exists (select 1 from pago_aplicaciones where factura_id = v_manual) then raise exception 'FALLÓ: no deben quedar aplicaciones en el gasto'; end if;
  v_ok := array_append(v_ok, 'la sustitución pasa los pagos y cancela el gasto');

  begin
    perform sustituir_factura_manual(v_cfdi, v_manual);
    raise exception 'FALLÓ: no se sustituye dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Ese gasto sin CFDI ya está%' then raise exception 'FALLÓ: mensaje inesperado (doble): %', sqlerrm; end if;
  end;
  v_manual := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_otro, 'sucursal_id', null, 'fecha', current_date, 'folio', 'Otro',
    'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'importe', 10, 'cuenta_pl', 'otros')), 'subtotal', 10, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 10));
  begin
    perform sustituir_factura_manual(v_cfdi, v_manual);
    raise exception 'FALLÓ: un CFDI no sustituye a otro proveedor';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'El CFDI es de otro proveedor%' then raise exception 'FALLÓ: mensaje inesperado (proveedor): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no se sustituye dos veces ni entre proveedores');

  perform asignar_cuentas_conceptos(v_cfdi, (select jsonb_agg(jsonb_build_object('id', id, 'cuenta', case when descripcion = 'Renta' then 'renta' else 'servicios' end)) from factura_conceptos where factura_id = v_cfdi));
  if (select count(*) from factura_conceptos where factura_id = v_cfdi and cuenta_pl is not null) <> 2 then raise exception 'FALLÓ: cuentas por concepto del CFDI'; end if;
  v_ok := array_append(v_ok, 'cuentas por concepto');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0026_gastos_unificados.sql supabase/pruebas/0026_gastos_unificados.sql
git commit -m "feat(compras): migración 0026 de gastos unificados (sin CFDI, cuenta por concepto, sustitución)"
```

Expected: Sebastián corre la migración y la prueba y responde "PRUEBAS OK" (antes de fusionar).

---

### Task 2: Cálculo del gasto sin CFDI y nombre de una factura

**Files:**
- Create: `lib/compras/gastoManual.ts`, `lib/compras/gastoManual.test.ts`
- Modify: `lib/compras/facturas.ts` (+ `nombreFactura`), `lib/compras/facturas.test.ts`, `package.json`

**Interfaces:**
- Produces:
  - `type Impuestos = { iva: 0 | 0.16; retIva: "ninguna" | "dos_tercios"; retIsr: "ninguna" | "diez" }`
  - `calcularGasto(renglones: readonly { importe: number }[], imp: Impuestos) → { subtotal; iva; retencion_iva; retencion_isr; retenciones; total }`
  - `type GastoManual = { proveedor_id; sucursal_id: string | null; fecha; vence_el: string | null; folio; renglones: { descripcion; importe; cuenta_pl: string | null }[]; subtotal; iva; retencion_iva; retencion_isr; total }`
  - `leerGastoManual(valor: (c) => string, lista: (c) => string[], cuentas: readonly string[], hoy: string): { datos: GastoManual } | { error: string }`
  - `IMPUESTOS_ARRENDAMIENTO: Impuestos` (16 %, 2/3, 10 %)
  - `nombreFactura(f: { serie: string | null; folio: string | null; uuid: string | null }): string`

- [ ] **Step 1: Pruebas** — `lib/compras/gastoManual.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularGasto, IMPUESTOS_ARRENDAMIENTO, leerGastoManual } from "./gastoManual.ts";

const CUENTAS = ["renta", "servicios", "otros"];

test("calcularGasto: renta + agua de persona física (16 %, 2/3 de IVA, 10 % de ISR)", () => {
  assert.deepEqual(calcularGasto([{ importe: 30000 }, { importe: 1200 }], IMPUESTOS_ARRENDAMIENTO),
    { subtotal: 31200, iva: 4992, retencion_iva: 3328, retencion_isr: 3120, retenciones: 6448, total: 29744 });
  assert.deepEqual(calcularGasto([{ importe: 1000.25 }, { importe: 0.1 }, { importe: 0.2 }], { iva: 0, retIva: "ninguna", retIsr: "ninguna" }),
    { subtotal: 1000.55, iva: 0, retencion_iva: 0, retencion_isr: 0, retenciones: 0, total: 1000.55 });
  assert.equal(calcularGasto([{ importe: 100 }], { iva: 0.16, retIva: "dos_tercios", retIsr: "ninguna" }).retencion_iva, 10.67);
});

const form = (o: Record<string, string>, renglones: string[][]) => ({
  valor: (c: string) => o[c] ?? "",
  lista: (c: string) => renglones.map((r) => r[{ renglon_descripcion: 0, renglon_importe: 1, renglon_cuenta: 2 }[c] ?? 0] ?? ""),
});
const BASE = { proveedor_id: "11111111-1111-1111-1111-111111111111", sucursal_id: "22222222-2222-2222-2222-222222222222", fecha: "2026-10-01", folio: " Prefactura 10 ", iva: "16", ret_iva: "dos_tercios", ret_isr: "diez" };

test("leerGastoManual: datos completos, renglones vacíos se ignoran, Oficina = sin sucursal", () => {
  const f = form(BASE, [["Renta", "30,000", "renta"], ["Agua", "1200", "servicios"], ["", "", ""]]);
  const r = leerGastoManual(f.valor, f.lista, CUENTAS, "2026-10-05");
  assert.ok("datos" in r);
  assert.deepEqual(r.datos, {
    proveedor_id: BASE.proveedor_id, sucursal_id: BASE.sucursal_id, fecha: "2026-10-01", vence_el: null, folio: "Prefactura 10",
    renglones: [{ descripcion: "Renta", importe: 30000, cuenta_pl: "renta" }, { descripcion: "Agua", importe: 1200, cuenta_pl: "servicios" }],
    subtotal: 31200, iva: 4992, retencion_iva: 3328, retencion_isr: 3120, total: 29744,
  });
  const o = form({ ...BASE, sucursal_id: "oficina" }, [["Luz", "500", ""]]);
  const r2 = leerGastoManual(o.valor, o.lista, CUENTAS, "2026-10-05");
  assert.ok("datos" in r2);
  assert.equal(r2.datos.sucursal_id, null);
  assert.equal(r2.datos.renglones[0].cuenta_pl, null);
});

test("leerGastoManual: errores claros", () => {
  const caso = (o: Record<string, string>, renglones: string[][]) => { const f = form({ ...BASE, ...o }, renglones); return leerGastoManual(f.valor, f.lista, CUENTAS, "2026-10-05"); };
  const ok = [["Renta", "100", "renta"]];
  assert.deepEqual(caso({ proveedor_id: "" }, ok), { error: "Elige el proveedor." });
  assert.deepEqual(caso({ folio: "  " }, ok), { error: "Escribe la referencia (folio de la prefactura o del recibo)." });
  assert.deepEqual(caso({ fecha: "2026-10-06" }, ok), { error: "La fecha no puede ser futura." });
  assert.deepEqual(caso({ vence_el: "2026-09-30" }, ok), { error: "El vencimiento no puede ser antes de la fecha." });
  assert.deepEqual(caso({}, []), { error: "Agrega al menos un renglón con descripción e importe." });
  assert.deepEqual(caso({}, [["Renta", "", "renta"]]), { error: "Renglón 1: escribe un importe mayor a cero." });
  assert.deepEqual(caso({}, [["", "100", "renta"]]), { error: "Renglón 1: escribe la descripción." });
  assert.deepEqual(caso({}, [["Renta", "100", "comida"]]), { error: "Renglón 1: elige una cuenta del P&L de la lista." });
  assert.deepEqual(caso({ iva: "0", ret_iva: "dos_tercios" }, ok), { error: "La retención de IVA necesita IVA del 16 %." });
});
```

En `lib/compras/facturas.test.ts` (importar `nombreFactura`):

```ts
test("nombreFactura: serie y folio; sin folio, el principio del UUID; nunca truena sin UUID", () => {
  assert.equal(nombreFactura({ serie: "A", folio: "12", uuid: "ABCDEF12-0000" }), "A12");
  assert.equal(nombreFactura({ serie: null, folio: null, uuid: "ABCDEF12-0000" }), "ABCDEF12");
  assert.equal(nombreFactura({ serie: null, folio: "Prefactura renta", uuid: null }), "Prefactura renta");
  assert.equal(nombreFactura({ serie: null, folio: null, uuid: null }), "");
});
```

Run: `npm test` (con `lib/compras/gastoManual.test.ts` en el script) → Expected: FAIL (módulo y función no existen).

- [ ] **Step 2: Implementar** — `lib/compras/gastoManual.ts`:

```ts
/** Gasto sin CFDI (prefactura, recibo): renglones con su cuenta del P&L, IVA y retenciones. */
export type Impuestos = { iva: 0 | 0.16; retIva: "ninguna" | "dos_tercios"; retIsr: "ninguna" | "diez" };
export const IMPUESTOS_ARRENDAMIENTO: Impuestos = { iva: 0.16, retIva: "dos_tercios", retIsr: "diez" };

export type GastoManual = {
  proveedor_id: string; sucursal_id: string | null; fecha: string; vence_el: string | null; folio: string;
  renglones: { descripcion: string; importe: number; cuenta_pl: string | null }[];
  subtotal: number; iva: number; retencion_iva: number; retencion_isr: number; total: number;
};

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Subtotal, IVA, retenciones (2/3 del IVA; 10 % de ISR) y total = subtotal + IVA − retenciones. */
export function calcularGasto(renglones: readonly { importe: number }[], imp: Impuestos) {
  const subtotal = centavos(renglones.reduce((t, r) => t + (Number(r.importe) || 0), 0));
  const iva = centavos(subtotal * imp.iva);
  const retencion_iva = imp.retIva === "dos_tercios" ? centavos((iva * 2) / 3) : 0;
  const retencion_isr = imp.retIsr === "diez" ? centavos(subtotal * 0.1) : 0;
  const retenciones = centavos(retencion_iva + retencion_isr);
  return { subtotal, iva, retencion_iva, retencion_isr, retenciones, total: centavos(subtotal + iva - retenciones) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const numero = (t: string) => Number(t.replace(/[$,\s]/g, ""));

/** Lee el formulario "Agregar sin CFDI". `lista(c)` da los valores repetidos de cada renglón; `cuentas` son las cuentas válidas del P&L. */
export function leerGastoManual(valor: (c: string) => string, lista: (c: string) => string[], cuentas: readonly string[], hoy: string):
  { datos: GastoManual } | { error: string } {
  const proveedor_id = valor("proveedor_id").trim();
  if (!UUID.test(proveedor_id)) return { error: "Elige el proveedor." };
  const folio = valor("folio").trim();
  if (!folio) return { error: "Escribe la referencia (folio de la prefactura o del recibo)." };
  const fecha = valor("fecha").trim();
  if (!FECHA.test(fecha)) return { error: "Elige la fecha." };
  if (fecha > hoy) return { error: "La fecha no puede ser futura." };
  const vence = valor("vence_el").trim();
  if (vence && !FECHA.test(vence)) return { error: "Revisa el vencimiento." };
  if (vence && vence < fecha) return { error: "El vencimiento no puede ser antes de la fecha." };
  const suc = valor("sucursal_id").trim();
  if (suc !== "oficina" && !UUID.test(suc)) return { error: "Elige la sucursal (u Oficina)." };

  const descripciones = lista("renglon_descripcion"), importes = lista("renglon_importe"), cuentasRenglon = lista("renglon_cuenta");
  const renglones: GastoManual["renglones"] = [];
  for (let i = 0; i < descripciones.length; i++) {
    const descripcion = (descripciones[i] ?? "").trim(), texto = (importes[i] ?? "").trim(), cuenta = (cuentasRenglon[i] ?? "").trim();
    if (!descripcion && !texto) continue;
    const n = renglones.length + 1;
    if (!descripcion) return { error: `Renglón ${n}: escribe la descripción.` };
    const importe = numero(texto);
    if (!texto || !Number.isFinite(importe) || importe <= 0) return { error: `Renglón ${n}: escribe un importe mayor a cero.` };
    if (cuenta && !cuentas.includes(cuenta)) return { error: `Renglón ${n}: elige una cuenta del P&L de la lista.` };
    renglones.push({ descripcion, importe: centavos(importe), cuenta_pl: cuenta || null });
  }
  if (!renglones.length) return { error: "Agrega al menos un renglón con descripción e importe." };

  const iva = valor("iva") === "0" ? 0 : 0.16;
  const retIva = valor("ret_iva") === "dos_tercios" ? "dos_tercios" : "ninguna";
  const retIsr = valor("ret_isr") === "diez" ? "diez" : "ninguna";
  if (retIva === "dos_tercios" && iva === 0) return { error: "La retención de IVA necesita IVA del 16 %." };
  const t = calcularGasto(renglones, { iva, retIva, retIsr });
  return {
    datos: {
      proveedor_id, sucursal_id: suc === "oficina" ? null : suc, fecha, vence_el: vence || null, folio, renglones,
      subtotal: t.subtotal, iva: t.iva, retencion_iva: t.retencion_iva, retencion_isr: t.retencion_isr, total: t.total,
    },
  };
}
```

En `lib/compras/facturas.ts`:

```ts
/** Cómo se nombra una factura en listas: serie + folio, o el principio del UUID (un gasto sin CFDI siempre trae folio). */
export const nombreFactura = (f: { serie: string | null; folio: string | null; uuid: string | null }) =>
  `${f.serie ?? ""}${f.folio ?? f.uuid?.slice(0, 8) ?? ""}`;
```

Run: `npm test` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/compras package.json
git commit -m "feat(compras): cálculo del gasto sin CFDI y nombre de factura sin UUID"
```

---

### Task 3: Retenciones por tipo del XML; sucursal por omisión del proveedor

**Files:**
- Modify: `lib/compras/cfdi.ts`, `lib/compras/cfdi.test.ts`
- Modify: `lib/compras/proveedores.ts`, `lib/compras/proveedores.test.ts`, `app/compras/FormProveedor.tsx`, `app/compras/proveedores/nuevo/page.tsx`, `app/compras/proveedores/[id]/page.tsx`

**Interfaces:**
- Produces: `Cfdi.retencion_iva`, `Cfdi.retencion_isr` (las del comprobante: `Retencion` sin `Base`, Impuesto 002 / 001); `DatosProveedor.sucursal_id: string | null`; `FormProveedor({ id?, inicial?, sucursales })`.

- [ ] **Step 1: Pruebas**

En `lib/compras/cfdi.test.ts`, en la prueba "ingreso CFDI 4.0…" agregar `retencion_iva: 0, retencion_isr: 0,` después de `retenciones: 0,`, y agregar:

```ts
test("retenciones del comprobante por tipo (ISR 001, IVA 002); las de los conceptos no se suman", () => {
  const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-10-01T10:00:00" SubTotal="31200" Moneda="MXN" Total="29744" TipoDeComprobante="I" MetodoPago="PUE">
  <cfdi:Emisor Rfc="PEPJ800101AB1" Nombre="JUAN PEREZ" RegimenFiscal="606"/><cfdi:Receptor Rfc="DPM010203XY9"/>
  <cfdi:Conceptos>
    <cfdi:Concepto Cantidad="1" ClaveUnidad="E48" Descripcion="Renta" ValorUnitario="30000" Importe="30000"><cfdi:Impuestos><cfdi:Retenciones><cfdi:Retencion Base="30000" Impuesto="001" TipoFactor="Tasa" TasaOCuota="0.100000" Importe="3000"/></cfdi:Retenciones></cfdi:Impuestos></cfdi:Concepto>
    <cfdi:Concepto Cantidad="1" ClaveUnidad="E48" Descripcion="Agua" ValorUnitario="1200" Importe="1200"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosRetenidos="6448" TotalImpuestosTrasladados="4992"><cfdi:Retenciones><cfdi:Retencion Impuesto="001" Importe="3120"/><cfdi:Retencion Impuesto="002" Importe="3328"/></cfdi:Retenciones></cfdi:Impuestos>
  ${TFD("12345678-1234-1234-1234-123456789012")}
</cfdi:Comprobante>`;
  const r = leerCfdi(xml);
  assert.ok("cfdi" in r);
  assert.deepEqual([r.cfdi.retenciones, r.cfdi.retencion_isr, r.cfdi.retencion_iva], [6448, 3120, 3328]);
});
```

En `lib/compras/proveedores.test.ts`: en la prueba "proveedor mínimo" agregar `sucursal_id: null,` al final del objeto esperado, y:

```ts
test("sucursal por omisión del proveedor: opcional y de la lista", () => {
  const r = leerProveedor(campos({ ...base, sucursal_id: "22222222-2222-2222-2222-222222222222" }));
  assert.ok("datos" in r);
  assert.equal(r.datos.sucursal_id, "22222222-2222-2222-2222-222222222222");
  assert.deepEqual(leerProveedor(campos({ ...base, sucursal_id: "Zapopan" })), { error: "Elige la sucursal de la lista." });
});
```

(La prueba "la ficha del proveedor trae todos los campos que guarda el formulario" fallará hasta agregar `sucursal_id` al select de la ficha.)

Run: `npm test` → Expected: FAIL.

- [ ] **Step 2: Implementar**

`lib/compras/cfdi.ts`: en el tipo `Cfdi`, después de `retenciones: number;` agregar `/** Retenciones del comprobante por impuesto (002 IVA, 001 ISR). */ retencion_iva: number; retencion_isr: number;`. En `leerCfdi`, antes del `return`:

```ts
  // Retenciones del comprobante por impuesto: las de los conceptos (traen Base) no se cuentan.
  const retencionesComprobante = etiquetas(texto.replace(bloqueConceptos, ""), "Retencion").filter((t) => atributo(t, "Base") === null);
  const retenido = (impuesto: string) => Math.round(retencionesComprobante.filter((t) => atributo(t, "Impuesto") === impuesto).reduce((s, t) => s + monto(t, "Importe"), 0) * 100) / 100;
```

y en el objeto, después de `retenciones: …,`: `retencion_iva: retenido("002"), retencion_isr: retenido("001"),`.

`lib/compras/proveedores.ts`: en `DatosProveedor` agregar `/** Sucursal a la que se cargan sus facturas cuando el XML no trae destino. */ sucursal_id: string | null;`; en `leerProveedor`, junto a `cuenta_pl`:

```ts
  const sucursal_id = opcional(valor("sucursal_id"));
  if (sucursal_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sucursal_id)) return { error: "Elige la sucursal de la lista." };
```

y `sucursal_id` en `datos`.

`app/compras/FormProveedor.tsx`: nueva prop `sucursales: { id: string; nombre: string }[]` y, junto a la cuenta del P&L:

```tsx
        <div className="campo">
          <label htmlFor="sucursal_id">Sucursal por omisión</label>
          <select id="sucursal_id" name="sucursal_id" defaultValue={v("sucursal_id")}>
            <option value="">Ninguna (Oficina)</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <small>Sus facturas se cargan aquí si no se elige otra.</small>
        </div>
```

`app/compras/proveedores/nuevo/page.tsx` y `app/compras/proveedores/[id]/page.tsx`: consultar `supabase.from("sucursales").select("id, nombre").order("nombre")` y pasar `sucursales={…}` a `FormProveedor`. En la ficha agregar `sucursal_id` al select y mostrar `<dt>Sucursal por omisión</dt><dd>{nombre de la sucursal o "Ninguna (Oficina)"}</dd>`.

Run: `npm test` → Expected: PASS; `node node_modules/typescript/bin/tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/compras app/compras
git commit -m "feat(compras): retenciones de IVA e ISR del XML; sucursal por omisión del proveedor"
```

---

### Task 4: P&L por concepto y adiós a "Gastos del mes"

**Files:**
- Modify: `lib/finanzas/gastos.ts`, `lib/finanzas/gastos.test.ts`, `app/finanzas/datos.ts`, `lib/roles.ts`, `lib/roles.test.ts`
- Delete: `app/finanzas/gastos/` (página y acciones)

**Interfaces:**
- Produces: `partesFactura(f, fraccion = 1): { cuenta: string | null; monto: number; concepto: string | null }[]`; `facturasAGastos` reparte por conceptos cuando la factura los trae (`conceptos?: { descripcion?: string; importe: number; cuenta_pl: string | null }[]`).

- [ ] **Step 1: Pruebas** — en `lib/finanzas/gastos.test.ts` (importar `partesFactura`):

```ts
const c2 = (n: number) => Math.round(n * 100) / 100;

test("partesFactura: por concepto con su cuenta; sin cuenta, la de la factura; descuento repartido", () => {
  const renta = { tipo: "ingreso" as const, estado: "por_pagar", subtotal: 31200, descuento: 0, cuenta_pl: "renta",
    conceptos: [{ descripcion: "Renta", importe: 30000, cuenta_pl: "renta" }, { descripcion: "Agua", importe: 1200, cuenta_pl: "servicios" }] };
  assert.deepEqual(partesFactura(renta).map((p) => [p.cuenta, c2(p.monto)]), [["renta", 30000], ["servicios", 1200]]);
  assert.deepEqual(partesFactura(renta, 7 / 31).map((p) => c2(p.monto)), [6774.19, 270.97]);
  const conDescuento = { tipo: "ingreso" as const, estado: "pagada", subtotal: 1000, descuento: 100, cuenta_pl: "otros",
    conceptos: [{ importe: 600, cuenta_pl: "insumos" }, { importe: 400, cuenta_pl: null }] };
  assert.deepEqual(partesFactura(conDescuento).map((p) => [p.cuenta, c2(p.monto)]), [["insumos", 540], ["otros", 360]]);
  assert.deepEqual(partesFactura({ ...renta, tipo: "egreso", conceptos: [] }), [{ cuenta: "renta", monto: -31200, concepto: null }]);
  assert.deepEqual(partesFactura({ ...renta, estado: "cancelada" }), []);
});

test("facturasAGastos reparte por conceptos", () => {
  const r = facturasAGastos([{ tipo: "ingreso", estado: "por_pagar", subtotal: 31200, descuento: 0, cuenta_pl: "renta",
    conceptos: [{ importe: 30000, cuenta_pl: "renta" }, { importe: 1200, cuenta_pl: "servicios" }] }]);
  assert.deepEqual(r, { gastos: { renta: 30000, servicios: 1200 }, sinCuenta: 0, memos: { insumos: 0, inversiones: 0 } });
});
```

En `lib/roles.test.ts`, la lista del grupo Finanzas queda `["/finanzas", "/finanzas/nomina", "/finanzas/parametros"]`.

Run: `npm test` → Expected: FAIL.

- [ ] **Step 2: Implementar** — `lib/finanzas/gastos.ts`: reemplazar `facturasAGastos` por:

```ts
type FacturaGasto = {
  tipo: "ingreso" | "egreso"; estado: string; subtotal: number; descuento: number; cuenta_pl: string | null; fecha_emision?: string;
  conceptos?: readonly { descripcion?: string; importe: number; cuenta_pl: string | null }[];
};

/**
 * Partes de una factura en el P&L, sin IVA y con signo (las notas de crédito restan): una por concepto, con su cuenta o la
 * de la factura, repartiendo subtotal − descuento en proporción al importe; sin conceptos, la factura completa. Canceladas: nada.
 */
export function partesFactura(f: FacturaGasto, fraccion = 1): { cuenta: string | null; monto: number; concepto: string | null }[] {
  if (f.estado === "cancelada") return [];
  const base = (Number(f.subtotal) - Number(f.descuento)) * (f.tipo === "egreso" ? -1 : 1) * fraccion;
  const conceptos = (f.conceptos ?? []).filter((c) => Number(c.importe) > 0);
  const suma = conceptos.reduce((t, c) => t + Number(c.importe), 0);
  if (!conceptos.length || suma <= 0) return [{ cuenta: f.cuenta_pl, monto: base, concepto: null }];
  return conceptos.map((c) => ({ cuenta: c.cuenta_pl ?? f.cuenta_pl, monto: (base * Number(c.importe)) / suma, concepto: c.descripcion ?? null }));
}

/** Facturas → gasto por cuenta (por concepto cuando los trae). Con `fraccionDe`, cada una por la parte de su mes que entra en el periodo. */
export function facturasAGastos(facturas: readonly FacturaGasto[], fraccionDe?: (fecha: string) => number) {
  const gastos: Partial<Record<CuentaGasto, number>> = {};
  let sinCuenta = 0;
  const memos = { insumos: 0, inversiones: 0 };
  for (const f of facturas) {
    for (const p of partesFactura(f, fraccionDe ? fraccionDe(f.fecha_emision ?? "") : 1)) {
      if (p.cuenta === "insumos" || p.cuenta === "inversiones") memos[p.cuenta] = centavos(memos[p.cuenta] + p.monto);
      else if (p.cuenta && GASTO.includes(p.cuenta)) gastos[p.cuenta as CuentaGasto] = centavos((gastos[p.cuenta as CuentaGasto] ?? 0) + p.monto);
      else sinCuenta = centavos(sinCuenta + p.monto);
    }
  }
  return { gastos, sinCuenta, memos };
}
```

`app/finanzas/datos.ts`:
1. Quitar la consulta de `gastos_mes` del primer `Promise.all` y renumerar: `metas = res[4].data ?? []`.
2. En la consulta de facturas, agregar `origen, factura_conceptos(descripcion, importe, cuenta_pl)` al select y al tipo `FacturaPL` (`origen: "cfdi" | "manual"; factura_conceptos: { descripcion: string; importe: number; cuenta_pl: string | null }[]`); después de cargarlas: `const facturas = facturasLeidas.map((x) => ({ ...x, conceptos: x.factura_conceptos }));`.
3. Reemplazar el ciclo que anota cada factura por:

```ts
    for (const x of facturasSuc) {
      const porCuenta = new Map<string | null, number>();
      for (const p of partesFactura(x, fraccionDe(x.fecha_emision))) porCuenta.set(p.cuenta, (porCuenta.get(p.cuenta) ?? 0) + p.monto);
      const completo = (Number(x.subtotal) - Number(x.descuento)) * (x.tipo === "egreso" ? -1 : 1);
      const nombre = x.tipo === "egreso" ? "Nota de crédito" : x.origen === "manual" ? "Gasto sin CFDI" : "Factura";
      for (const [cuenta, monto] of porCuenta) {
        anotar(s.id, renglonDe(cuenta),
          `${nombre} ${x.serie ?? ""}${x.folio ?? ""} · ${x.nombre_emisor} · ${x.fecha_emision}${porCuenta.size > 1 ? " · parte" : ""}${proporcion(x.fecha_emision, completo)}${cuenta ? "" : " · sin cuenta"}`,
          monto);
      }
    }
```

   y el aviso: `const sinCuenta = facturasSuc.filter((x) => partesFactura(x).some((p) => !p.cuenta)).length;` (igual para `sinCuentaOf` con `facturasOf`).
4. Quitar todo lo de `gastosMes`: el bloque `manual` (y su `anotar`), `sumarGastos(f.gastos, caja.gastos, manual)` → `sumarGastos(f.gastos, caja.gastos)`, y `manualOf` en oficina (`oficina = centavos(… + nOf.cocina + nOf.gerencia)`). Importar `partesFactura`.

`lib/roles.ts`: quitar `{ href: "/finanzas/gastos", texto: "Gastos del mes" }`. Borrar `app/finanzas/gastos/`.

Run: `npm test` → PASS; `rm -rf .next && node node_modules/typescript/bin/tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add -A lib app
git commit -m "feat(finanzas): P&L por concepto de factura; se quita Gastos del mes"
```

---

### Task 5: Alta "Agregar sin CFDI"

**Files:**
- Create: `app/compras/facturas/nueva/page.tsx`, `app/compras/facturas/nueva/FormGastoManual.tsx`
- Modify: `app/compras/facturas/acciones.ts` (+ `registrarGastoManual`)

**Interfaces:**
- Consumes: `calcularGasto`, `leerGastoManual`, `IMPUESTOS_ARRENDAMIENTO` (Tarea 2); `registrar_gasto_manual` (Tarea 1); `CUENTAS_GASTO`, `CUENTAS_MEMO`, `NOMBRE_CUENTA`.

- [ ] **Step 1: Acción** en `app/compras/facturas/acciones.ts` (importar `leerGastoManual, type GastoManual` de `@/lib/compras/gastoManual`, `CUENTAS_GASTO, CUENTAS_MEMO` de `@/lib/finanzas/cuentas`, `hoyCalendarioMX` de `@/lib/formato`):

```ts
const MAX_ADJUNTO = 4 * 1024 * 1024;
const EXTENSION: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

/** Gasto sin CFDI (prefactura, recibo): se guarda como factura "Sin CFDI" con sus renglones y su adjunto. */
export async function registrarGastoManual(fd: FormData) {
  const ruta = "/compras/facturas/nueva";
  const supabase = await clienteAdmin(ruta);
  const r = leerGastoManual((c) => String(fd.get(c) ?? ""), (c) => fd.getAll(c).map(String), [...CUENTAS_GASTO, ...CUENTAS_MEMO], hoyCalendarioMX());
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: GastoManual };
  let adjunto: string | null = null;
  const archivo = fd.get("adjunto");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_ADJUNTO) volver(ruta, "error", "El adjunto pesa más de 4 MB.");
    const ext = EXTENSION[archivo.type];
    if (!ext) volver(ruta, "error", "El adjunto debe ser PDF o foto.");
    adjunto = `manual/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(adjunto, archivo, { contentType: archivo.type, upsert: false });
    if (error) volver(ruta, "error", `No se pudo subir el adjunto: ${error.message}`);
  }
  const { data: id, error } = await supabase.rpc("registrar_gasto_manual", { p: { ...datos, adjunto } });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(`/compras/facturas/${id}`, "ok", "Gasto sin CFDI registrado. Cuando llegue el CFDI, súbelo y elige qué gasto sustituye.");
}
```

(`BUCKET` ya existe en ese archivo; si no, `const BUCKET = "facturas";`.)

- [ ] **Step 2: Formulario** — `app/compras/facturas/nueva/FormGastoManual.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { CampoArchivo } from "@/components/CampoArchivo";
import { calcularGasto, IMPUESTOS_ARRENDAMIENTO, type Impuestos } from "@/lib/compras/gastoManual";
import { pesos } from "@/lib/formato";
import { registrarGastoManual } from "../acciones";

type Proveedor = { id: string; nombre: string; sucursal_id: string | null; cuenta_pl: string | null };
type Renglon = { descripcion: string; importe: string; cuenta: string };

/** Alta de un gasto sin CFDI: renglones con su cuenta, IVA y retenciones con el total a la vista. */
export function FormGastoManual({ proveedores, sucursales, cuentas, hoy }: {
  proveedores: Proveedor[]; sucursales: { id: string; nombre: string }[]; cuentas: { clave: string; nombre: string }[]; hoy: string;
}) {
  const [proveedor, setProveedor] = useState("");
  const [sucursal, setSucursal] = useState("oficina");
  const [renglones, setRenglones] = useState<Renglon[]>([{ descripcion: "", importe: "", cuenta: "" }]);
  const [imp, setImp] = useState<Impuestos>({ iva: 0.16, retIva: "ninguna", retIsr: "ninguna" });
  const t = calcularGasto(renglones.map((r) => ({ importe: Number(r.importe.replace(/[$,\s]/g, "")) || 0 })), imp);
  const cambiarRenglon = (i: number, campo: keyof Renglon, valor: string) =>
    setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));
  const elegirProveedor = (id: string) => {
    setProveedor(id);
    const p = proveedores.find((x) => x.id === id);
    if (!p) return;
    setSucursal(p.sucursal_id ?? "oficina");
    setRenglones((rs) => rs.map((r) => (r.cuenta ? r : { ...r, cuenta: p.cuenta_pl ?? "" })));
  };

  return (
    <form action={registrarGastoManual} className="formulario seccion">
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="proveedor_id">Proveedor</label>
          <select id="proveedor_id" name="proveedor_id" value={proveedor} onChange={(e) => elegirProveedor(e.target.value)} required>
            <option value="">Elige…</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="sucursal_id">Sucursal</label>
          <select id="sucursal_id" name="sucursal_id" value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            <option value="oficina">Oficina</option>
          </select>
        </div>
        <div className="campo"><label htmlFor="folio">Referencia</label><input id="folio" name="folio" required placeholder="Ej. Prefactura renta octubre" /></div>
        <div className="campo"><label htmlFor="fecha">Fecha</label><input id="fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} required /></div>
        <div className="campo"><label htmlFor="vence_el">Vence (opcional)</label><input id="vence_el" name="vence_el" type="date" /><small>Si no, la fecha + días de crédito del proveedor.</small></div>
      </div>

      <h2>Renglones</h2>
      {renglones.map((r, i) => (
        <div key={i} className="rejilla">
          <div className="campo"><label htmlFor={`d${i}`}>Descripción</label><input id={`d${i}`} name="renglon_descripcion" value={r.descripcion} onChange={(e) => cambiarRenglon(i, "descripcion", e.target.value)} placeholder="Ej. Renta" /></div>
          <div className="campo"><label htmlFor={`i${i}`}>Importe sin IVA</label><input id={`i${i}`} name="renglon_importe" inputMode="decimal" value={r.importe} onChange={(e) => cambiarRenglon(i, "importe", e.target.value)} /></div>
          <div className="campo">
            <label htmlFor={`c${i}`}>Cuenta del P&L</label>
            <select id={`c${i}`} name="renglon_cuenta" value={r.cuenta} onChange={(e) => cambiarRenglon(i, "cuenta", e.target.value)}>
              <option value="">La del proveedor</option>
              {cuentas.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
      ))}
      <div className="acciones">
        <button type="button" className="boton boton-secundario" onClick={() => setRenglones((rs) => [...rs, { descripcion: "", importe: "", cuenta: proveedores.find((p) => p.id === proveedor)?.cuenta_pl ?? "" }])}>Agregar renglón</button>
        {renglones.length > 1 && <button type="button" className="boton boton-secundario" onClick={() => setRenglones((rs) => rs.slice(0, -1))}>Quitar el último</button>}
      </div>

      <h2>Impuestos</h2>
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="iva">IVA</label>
          <select id="iva" name="iva" value={imp.iva === 0 ? "0" : "16"} onChange={(e) => setImp({ ...imp, iva: e.target.value === "0" ? 0 : 0.16, retIva: e.target.value === "0" ? "ninguna" : imp.retIva })}>
            <option value="16">16 %</option><option value="0">0 % / exento</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="ret_iva">Retención de IVA</label>
          <select id="ret_iva" name="ret_iva" value={imp.retIva} onChange={(e) => setImp({ ...imp, retIva: e.target.value as Impuestos["retIva"] })}>
            <option value="ninguna">Ninguna</option><option value="dos_tercios">2/3 del IVA</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="ret_isr">Retención de ISR</label>
          <select id="ret_isr" name="ret_isr" value={imp.retIsr} onChange={(e) => setImp({ ...imp, retIsr: e.target.value as Impuestos["retIsr"] })}>
            <option value="ninguna">Ninguna</option><option value="diez">10 %</option>
          </select>
        </div>
      </div>
      <div className="acciones"><button type="button" className="boton boton-secundario" onClick={() => setImp(IMPUESTOS_ARRENDAMIENTO)}>Persona física, arrendamiento</button></div>

      <dl className="tarjeta-datos">
        <dt>Subtotal</dt><dd>{pesos(t.subtotal)}</dd>
        <dt>IVA</dt><dd>{pesos(t.iva)}</dd>
        {t.retencion_iva > 0 && <><dt>Retención de IVA</dt><dd>− {pesos(t.retencion_iva)}</dd></>}
        {t.retencion_isr > 0 && <><dt>Retención de ISR</dt><dd>− {pesos(t.retencion_isr)}</dd></>}
        <dt>Total a pagar al proveedor</dt><dd><strong>{pesos(t.total)}</strong></dd>
        {t.retenciones > 0 && <><dt>A enterar al SAT</dt><dd>{pesos(t.retenciones)}</dd></>}
      </dl>
      <CampoArchivo id="adjunto" name="adjunto" etiqueta="Prefactura o recibo (PDF o foto, opcional)" accept="application/pdf,image/*" />
      <BotonEnviar>Guardar gasto sin CFDI</BotonEnviar>
    </form>
  );
}
```

- [ ] **Step 3: Página** — `app/compras/facturas/nueva/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { CUENTAS_GASTO, CUENTAS_MEMO, NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { FormGastoManual } from "./FormGastoManual";

/** Gasto con proveedor que aún no tiene CFDI: prefactura, recibo o pago sin factura. */
export default async function NuevoGastoManual({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/facturas");
  const [{ data: proveedores }, { data: sucursales }] = await Promise.all([
    supabase.from("proveedores").select("id, razon_social, nombre_comercial, sucursal_id, cuenta_pl").eq("activo", true).order("razon_social")
      .returns<{ id: string; razon_social: string; nombre_comercial: string | null; sucursal_id: string | null; cuenta_pl: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  return (
    <>
      <div className="encabezado">
        <p><Link href="/compras/facturas">← Facturas</Link></p>
        <h1>Agregar gasto sin CFDI</h1>
        <p>Para una prefactura, un recibo o un pago sin factura. Se paga en Pagos y entra al P&L con la cuenta de cada renglón. Cuando llegue el CFDI, súbelo y elige qué gasto sustituye.</p>
      </div>
      <Aviso error={error} />
      <FormGastoManual hoy={hoyCalendarioMX()} sucursales={sucursales ?? []}
        proveedores={(proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre_comercial ?? p.razon_social, sucursal_id: p.sucursal_id, cuenta_pl: p.cuenta_pl }))}
        cuentas={[...CUENTAS_GASTO, ...CUENTAS_MEMO].map((c) => ({ clave: c, nombre: NOMBRE_CUENTA[c] }))} />
    </>
  );
}
```

- [ ] **Step 4: Verificar** — `tsc` sin errores; `npm test` PASS.

- [ ] **Step 5: Commit**

```bash
git add app/compras/facturas
git commit -m "feat(compras): agregar gasto sin CFDI con renglones, IVA y retenciones"
```

---

### Task 6: Facturas: lista, detalle con cuentas por concepto y sustitución

**Files:**
- Modify: `app/compras/facturas/page.tsx`, `app/compras/facturas/[id]/page.tsx`, `app/compras/facturas/acciones.ts`
- Modify: `app/compras/ordenes/[id]/page.tsx`, `app/compras/pagos/nuevo/page.tsx`, `app/compras/pagos/page.tsx`, `app/compras/pagos/[id]/page.tsx` (usar `nombreFactura`)

**Interfaces:**
- Consumes: `nombreFactura` (Tarea 2); `asignar_cuentas_conceptos`, `sustituir_factura_manual` (Tarea 1).
- Produces: acciones `guardarCuentasConceptos(fd)`, `sustituirGastoManual(fd)`.

- [ ] **Step 1: Acciones** (en `app/compras/facturas/acciones.ts`, importar `pesos`):

```ts
export async function guardarCuentasConceptos(fd: FormData) {
  const ids = fd.getAll("concepto_id").map(String), cuentas = fd.getAll("concepto_cuenta").map(String);
  await llamarFactura(fd, "asignar_cuentas_conceptos",
    { p_factura: texto(fd, "id"), p_cuentas: ids.map((id, i) => ({ id: Number(id), cuenta: cuentas[i] ?? "" })) }, "Cuentas guardadas.");
}

/** El CFDI sustituye al gasto sin CFDI elegido: sus pagos pasan al CFDI; avisa si los totales difieren por más de $1. */
export async function sustituirGastoManual(fd: FormData) {
  const id = texto(fd, "id"), manual = texto(fd, "manual_id");
  const supabase = await clienteAdmin(rutaFactura(id));
  if (!manual) volver(rutaFactura(id), "error", "Elige el gasto sin CFDI que sustituye.");
  const { data: totales } = await supabase.from("facturas").select("id, total").in("id", [id, manual]).returns<{ id: string; total: number }[]>();
  const { data: faltan, error } = await supabase.rpc("sustituir_factura_manual", { p_cfdi: id, p_manual: manual });
  if (error) volver(rutaFactura(id), "error", error.message);
  const t = new Map((totales ?? []).map((x) => [x.id, Number(x.total)]));
  const diferencia = Math.abs((t.get(id) ?? 0) - (t.get(manual) ?? 0));
  revalidatePath("/compras", "layout");
  volver(rutaFactura(id), "ok", `Sustituyó al gasto sin CFDI; sus pagos pasaron a esta factura.`
    + `${diferencia > 1 ? ` Ojo: los totales difieren por ${pesos(diferencia)}.` : ""}`
    + `${faltan ? " Asigna la cuenta de cada concepto (el gasto tenía varias)." : ""}`);
}
```

- [ ] **Step 2: Detalle** (`app/compras/facturas/[id]/page.tsx`):
1. Tipo `Factura`: `uuid: string | null; xml_ruta: string | null; origen: "cfdi" | "manual"; sustituido_por: string | null;` y agregarlos al select. `Concepto` gana `cuenta_pl: string | null` (y el select de conceptos).
2. Encabezado: `· UUID {f.uuid}` → `{f.origen === "manual" ? " · Sin CFDI" : ` · UUID ${f.uuid}`}`.
3. Relacionadas: `.eq("uuid_relacionado", f.uuid ?? "")`.
4. Botón del XML solo si hay `urlXml`; el del PDF dice "Ver adjunto" cuando `f.origen === "manual"`.
5. Cargar también (en el `Promise.all`):

```ts
    f.origen === "cfdi" && f.tipo === "ingreso"
      ? supabase.from("facturas").select("id, folio, fecha_emision, total").eq("proveedor_id", f.proveedor_id).eq("origen", "manual").neq("estado", "cancelada")
        .order("fecha_emision").returns<{ id: string; folio: string; fecha_emision: string; total: number }[]>()
      : Promise.resolve({ data: [] as { id: string; folio: string; fecha_emision: string; total: number }[] }),
    supabase.from("facturas").select("id, folio").eq("sustituido_por", f.id).returns<{ id: string; folio: string }[]>(),
```

   (`sinCfdi` y `sustituye`.)
6. Reemplazar el `Plegable` de conceptos por:

```tsx
      <Plegable id="t-conceptos" titulo={f.origen === "manual" ? "Renglones" : "Conceptos del XML"} resumen={`${conceptos?.length ?? 0}`}>
        {edita && (conceptos ?? []).length > 0 ? (
          <form action={guardarCuentasConceptos} className="formulario">
            <input type="hidden" name="id" value={f.id} />
            <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
              {(conceptos ?? []).map((c) => (
                <li key={c.id} className="fila">
                  <div className="fila-nombre"><strong>{c.descripcion}</strong><small>{c.cantidad} {c.unidad} · {pesos(c.valor_unitario)}</small></div>
                  <div className="fila-datos">
                    <span>{pesos(c.importe)}</span>
                    <span>
                      <input type="hidden" name="concepto_id" value={c.id} />
                      <select name="concepto_cuenta" defaultValue={c.cuenta_pl ?? ""} aria-label={`Cuenta del P&L de ${c.descripcion}`}>
                        <option value="">La de la factura</option>
                        {[...CUENTAS_GASTO, ...CUENTAS_MEMO].map((k) => <option key={k} value={k}>{NOMBRE_CUENTA[k]}</option>)}
                      </select>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <BotonEnviar className="boton boton-secundario">Guardar cuentas</BotonEnviar>
          </form>
        ) : (
          <dl className="tarjeta-datos">
            {(conceptos ?? []).map((c) => <Fragment key={c.id}><dt>{c.cantidad} {c.unidad}</dt><dd>{c.descripcion} · {pesos(c.importe)} · {c.cuenta_pl && esCuentaPl(c.cuenta_pl) ? NOMBRE_CUENTA[c.cuenta_pl] : "cuenta de la factura"}</dd></Fragment>)}
          </dl>
        )}
        {/* el bloque existente de "Renglones de las órdenes" sigue igual */}
      </Plegable>
```

7. Sustitución, antes de "Acciones":

```tsx
      {(sustituye ?? []).length > 0 && (
        <p className="aviso">Sustituye a: {(sustituye ?? []).map((x) => <Link key={x.id} href={`/compras/facturas/${x.id}`}>{x.folio}</Link>)}</p>
      )}
      {f.sustituido_por && <p className="aviso">Sustituido por <Link href={`/compras/facturas/${f.sustituido_por}`}>su CFDI</Link>.</p>}
      {edita && (sinCfdi ?? []).length > 0 && (
        <section className="seccion">
          <h2>¿Sustituye a un gasto sin CFDI?</h2>
          <form action={sustituirGastoManual} className="formulario">
            <input type="hidden" name="id" value={f.id} />
            <div className="campo">
              <label htmlFor="manual_id">Gasto sin CFDI de este proveedor (este CFDI: {pesos(f.total)})</label>
              <select id="manual_id" name="manual_id" required defaultValue="">
                <option value="" disabled>Elige…</option>
                {(sinCfdi ?? []).map((m) => <option key={m.id} value={m.id}>{m.folio} · {fechaTexto(m.fecha_emision)} · {pesos(m.total)}</option>)}
              </select>
              <small>Sus pagos pasan a esta factura y el gasto sin CFDI queda cancelado; así no se cuenta doble.</small>
            </div>
            <BotonEnviar className="boton boton-secundario" confirmar="¿Sustituir ese gasto sin CFDI con esta factura?">Sustituir</BotonEnviar>
          </form>
        </section>
      )}
```

- [ ] **Step 3: Lista** (`app/compras/facturas/page.tsx`): tipo `uuid: string | null; origen: "cfdi" | "manual"`; select `origen`; opción `<option value="sin_cfdi">Sin CFDI</option>` en "Ver", con filtro `ver === "sin_cfdi" ? f.origen === "manual" && f.estado !== "cancelada"`; título con `nombreFactura(f)` y, si `f.origen === "manual"`, " · Sin CFDI" en `tarjeta-estado`; junto a "Subir facturas", `<Link className="boton boton-secundario" href="/compras/facturas/nueva">Agregar sin CFDI</Link>`; `uuids` ignora nulos.

- [ ] **Step 4: `nombreFactura` en las demás pantallas** — reemplazar `x.serie ?? ""}{x.folio ?? x.uuid.slice(0, 8)` (y equivalentes en `ordenes/[id]`, `pagos/nuevo`, `pagos/page`, `pagos/[id]`) por `nombreFactura(x)`, con `uuid: string | null` en sus tipos.

- [ ] **Step 5: Verificar** — `rm -rf .next`, `tsc` sin errores, `npm test` PASS, `grep -rn "uuid.slice" app` sin resultados.

- [ ] **Step 6: Commit**

```bash
git add app/compras
git commit -m "feat(compras): cuentas por concepto, sustitución por CFDI y gastos sin CFDI en las listas"
```

---

### Task 7: Vista previa

- [ ] **Step 1:** página temporal `app/login/prueba-gasto/page.tsx` que renderice `FormGastoManual` con proveedores y sucursales de ejemplo (sin acción real: es solo para ver el formulario).
- [ ] **Step 2:** en el preview a 1280 px y 375 px: elegir proveedor (sucursal y cuenta por omisión se llenan), dos renglones 30,000 y 1,200, botón "Persona física, arrendamiento" → total $29,744.00 y "A enterar al SAT" $6,448.00; sin scroll horizontal.
- [ ] **Step 3:** borrar la página temporal, `rm -rf .next`, `tsc` y `npm test` en verde, `git status` limpio.

---

## Cierre

- [ ] Revisión final de la rama (modelo más capaz) con el Review Focus. **Después de `review-package`, volver a la rama (`git checkout feat/gastos-unificados`) antes de cualquier arreglo.**
- [ ] Pedir a Sebastián correr `0026_gastos_unificados.sql` y su prueba → "PRUEBAS OK"; fusionar; copiar archivos; borrar la rama.
- [ ] Recordarle: capturar la prefactura de renta en Compras → "Agregar sin CFDI" (los renglones de Gastos del mes dejan de contar).

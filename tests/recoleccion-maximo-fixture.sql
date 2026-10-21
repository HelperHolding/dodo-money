-- Entorno aislado de pruebas: no ejecutar en la base de producción.
create table public.cierres_dia(id uuid, sucursal_id uuid, fecha date, boveda_inicial numeric, boveda_contado numeric);
create table public.recoleccion_cierres(cierre_id uuid, liberado_en timestamptz);
create table public.pagos(id uuid, referencia text, nota_boveda text, comprobante_ruta text, anulado_en timestamptz, origen_fondos text, forma text, fecha date, monto numeric);
create table public.pagos_boveda_eventos(id uuid,pago_id uuid,fecha_operativa date,creado_en timestamptz,tipo text,importe numeric,sucursal_id uuid);
create table public.pagos_ventas_eventos(like public.pagos_boveda_eventos);
create table public.pago_aplicaciones(pago_id uuid,factura_id uuid,monto numeric);
create table public.facturas(id uuid,folio text,uuid text,origen text,sucursal_id uuid);
create table public.factura_ordenes(factura_id uuid,orden_id uuid);
create table public.ordenes_compra(id uuid,folio text);
create function public.mi_rol() returns text language sql as $$select 'admin'::text$$;
create function public.ve_todas_las_sucursales() returns boolean language sql as $$select true$$;
create function public.mi_sucursal() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
create function public.hoy_mx() returns date language sql as $$select current_date$$;
create function public.disponibilidad_boveda(uuid) returns jsonb language sql as $$select current_setting('test.disponibilidad')::jsonb$$;
insert into public.cierres_dia values('00000000-0000-0000-0000-000000000002',public.mi_sucursal(),current_date,26868.26,26868.26);

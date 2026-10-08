-- Orden confirmada → documento pagable sin CFDI. Requiere 0039; 0040 es independiente.
begin;
create function public.facturar_orden(p_orden uuid) returns uuid
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
 v:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',o.proveedor_id,'sucursal_id',o.sucursal_id,'folio','Prefactura '||o.folio,'fecha',public.hoy_mx(),'subtotal',s,'iva',i,'retencion_iva',0,'retencion_isr',0,'total',s+i,'renglones',r));
 -- Conservar cantidades y precios unitarios, no solamente el importe de cada concepto.
 delete from public.factura_conceptos where factura_id=v;
 insert into public.factura_conceptos(factura_id,descripcion,cantidad,unidad,valor_unitario,importe,cuenta_pl)
 select v,r.descripcion,r.cantidad,a.unidad,r.precio,round(r.cantidad*r.precio,2),cuenta from public.orden_renglones r join public.articulos a on a.id=r.articulo_id where r.orden_id=o.id order by r.creado_en,r.id;
 perform public.ligar_factura_ordenes(v,array[o.id]);
 return v;
end $$;
revoke all on function public.facturar_orden(uuid) from public,anon;
grant execute on function public.facturar_orden(uuid) to authenticated;
commit;

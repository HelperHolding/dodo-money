-- Conector de Grok: el registro de llamadas acepta las herramientas de compras y pagos (por_pagar, pagos, compras y
-- ordenes). Requiere 20261120120000_grok_mcp_bi_tiempos.sql. Se corre antes de publicar las herramientas.
begin;
alter table public.mcp_llamadas drop constraint mcp_llamadas_herramienta_check;
alter table public.mcp_llamadas add constraint mcp_llamadas_herramienta_check
 check (herramienta in ('sucursales','ventas','productos','bi','tiempos','por_pagar','pagos','compras','ordenes','cortes','costos','manuales','pl'));
commit;

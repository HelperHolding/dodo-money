-- Conector de Grok: el registro de llamadas acepta la nueva herramienta productos (venta por producto).
-- Requiere 20261119120000_grok_mcp.sql. Se corre antes de publicar la herramienta.
begin;
alter table public.mcp_llamadas drop constraint mcp_llamadas_herramienta_check;
alter table public.mcp_llamadas add constraint mcp_llamadas_herramienta_check
 check (herramienta in ('sucursales','ventas','productos','cortes','costos','manuales','pl'));
commit;

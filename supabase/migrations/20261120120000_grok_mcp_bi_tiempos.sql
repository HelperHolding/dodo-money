-- Conector de Grok: el registro de llamadas acepta las herramientas bi (análisis de venta con comparación) y tiempos
-- (tiempos de servicio). Requiere 20261119190000_grok_mcp_productos.sql. Se corre antes de publicar las herramientas.
begin;
alter table public.mcp_llamadas drop constraint mcp_llamadas_herramienta_check;
alter table public.mcp_llamadas add constraint mcp_llamadas_herramienta_check
 check (herramienta in ('sucursales','ventas','productos','bi','tiempos','cortes','costos','manuales','pl'));
commit;

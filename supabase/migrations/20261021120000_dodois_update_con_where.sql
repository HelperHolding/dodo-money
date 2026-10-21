-- La API de Supabase (PostgREST) carga safeupdate y rechaza un UPDATE sin WHERE ("UPDATE requires a WHERE clause").
-- dodois_guardar_tokens y dodois_marcar_error actualizaban la fila única de dodois_conexion sin WHERE: desde la app
-- fallaban (en el SQL Editor no), el token renovado se perdía y la conexión no se marcaba para reconectar.
-- Requiere 20261020180000_sincronizacion_dodois.sql.

create or replace function dodois_guardar_tokens(p_refresh text, p_access text, p_expira timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  perform dodois_secreto('dodois_refresh_token', p_refresh);
  perform dodois_secreto('dodois_access_token', p_access);
  update dodois_conexion set access_expira = p_expira, renovando_hasta = null, estado = 'conectada', ultimo_error = null where id;
end $$;

create or replace function dodois_marcar_error(p_mensaje text, p_reconectar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  update dodois_conexion set ultimo_error = left(p_mensaje, 500), renovando_hasta = null,
    estado = case when p_reconectar then 'requiere_reconectar' else estado end
   where id;
end $$;

-- Pruebas de 20261021120000: guardar tokens y marcar error funcionan con safeupdate activo (como en la API de Supabase).
-- Córrelas completas en Supabase → SQL Editor después de la migración. Necesitan la conexión de Dodo IS creada.
--   · "PRUEBAS OK — …" → todo bien (no deja cambios).   · "FALLÓ: …" → dice qué no se cumplió.
-- safeupdate no se puede cargar aquí (solo lo carga la API); que ninguna función haga UPDATE/DELETE sin WHERE lo revisa
-- lib/dodois/migraciones.test.ts.

begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  if not exists (select 1 from dodois_conexion) then raise exception 'FALTAN DATOS: Dodo IS no está conectado.'; end if;
  perform dodois_marcar_error('prueba', true);
  if (select estado from dodois_conexion) <> 'requiere_reconectar' or (select ultimo_error from dodois_conexion) <> 'prueba' then
    raise exception 'FALLÓ: marcar error deja la conexión para reconectar con su mensaje';
  end if;
  perform dodois_guardar_tokens('prueba-r', 'prueba-a', now() + interval '1 day');
  if (select estado from dodois_conexion) <> 'conectada' or (select ultimo_error from dodois_conexion) is not null
     or (select refresh from dodois_tokens()) <> 'prueba-r' then
    raise exception 'FALLÓ: guardar tokens deja la conexión lista con el token nuevo';
  end if;
  raise exception 'PRUEBAS OK — marcar error y guardar tokens con safeupdate';
end $$;
rollback;

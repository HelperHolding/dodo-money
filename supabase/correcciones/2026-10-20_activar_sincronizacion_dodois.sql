-- Activa la sincronización automática de ventas con Dodo IS. Córrelo en Supabase → SQL Editor DESPUÉS de:
--   1) la migración 20261020180000_sincronizacion_dodois.sql y su prueba (PRUEBAS OK);
--   2) desplegar la app y conectar Dodo IS en Ventas → Dodo IS.
-- Paso A crea la clave compartida y la muestra UNA vez: cópiala a Vercel como DODOIS_CRON_SECRET (no la pegues en chats).

-- A. Clave compartida y dirección de la app (en el Vault).
select dodois_secreto('dodois_cron_secret', encode(extensions.gen_random_bytes(32), 'hex')) as id_clave;
select decrypted_secret as copia_esto_a_vercel_DODOIS_CRON_SECRET from vault.decrypted_secrets where name = 'dodois_cron_secret';
select dodois_secreto('dodois_sync_url', 'https://dodo-money-j31t.vercel.app/api/dodois/sincronizar') as id_url;

-- B. Tareas (UTC): cada 15 min de 16:00 a 05:59 (10:00–23:59 en CDMX) y a las 09:00 (3:00 en CDMX) el día anterior.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname in ('dodois-ventas-15min', 'dodois-ventas-noche');
select cron.schedule('dodois-ventas-15min', '*/15 0-5,16-23 * * *', $$ select dodois_disparar('cron') $$);
select cron.schedule('dodois-ventas-noche', '0 9 * * *', $$ select dodois_disparar('noche') $$);

-- C. Revisión: deben salir las dos tareas.
select jobname, schedule, active from cron.job where jobname like 'dodois-%' order by jobname;

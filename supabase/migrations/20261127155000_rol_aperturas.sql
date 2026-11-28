-- Puesto nuevo «aperturas» (HD-27): solo necesita la sección Aperturas.
-- Va en su propia migración: el valor nuevo del enum no se usa en esta transacción; siempre se compara mi_rol()::text.
begin;
set local lock_timeout = '5s';
alter type public.rol_usuario add value if not exists 'aperturas';
commit;

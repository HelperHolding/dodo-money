-- Cambio de contraseña obligatorio la primera vez. El admin deja la marca al dar de alta con una contraseña
-- temporal; la app manda a /cuenta hasta que la persona la cambia, y entonces la marca se quita sola.
-- Requiere 0001–0008. Los usuarios que ya existen quedan sin la marca.

alter table perfiles add column if not exists debe_cambiar_contrasena boolean not null default false;

-- Cada quien quita solo su propia marca (los perfiles no se editan directamente).
create or replace function contrasena_cambiada() returns void
language sql security definer set search_path = public as $$
  update perfiles set debe_cambiar_contrasena = false where id = auth.uid();
$$;

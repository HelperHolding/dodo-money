-- El puesto base "cajero" pasa a llamarse "operacion" (cocina y caja, sin abrir turno). Mismos permisos.
-- Los perfiles y las listas del turno que lo tenían se actualizan solos: el puesto se guarda como valor del enum.
-- Requiere 0001–0007.
alter type rol_usuario rename value 'cajero' to 'operacion';

-- Sucursal inicial y sus cajas. Ajusta los montos de los fondos antes de correrlo.
with s as (
  insert into sucursales (nombre, fondo_caja_venta, fondo_cambios, fondo_caja_chica, limite_retiro)
  values ('Zapopan-1', 1500, 2000, 3000, 3000)
  returning id
)
insert into cajas (sucursal_id, tipo, nombre, saldo_inicial)
select s.id, c.tipo::tipo_caja, c.nombre, c.saldo_inicial
from s, (values
  ('venta',      'Caja de venta',     0),
  ('cambios',    'Fondo de cambios',  2000),
  ('boveda',     'Bóveda',            0),
  ('caja_chica', 'Caja chica',        3000),
  ('banco',      'Banco',             0)
) as c(tipo, nombre, saldo_inicial);

-- Después de crear cada usuario en Authentication → Users, dale su perfil:
-- insert into perfiles (id, nombre, rol, sucursal_id)
-- values ('<uuid del usuario>', 'Nombre Apellido', 'gerente',
--         (select id from sucursales where nombre = 'Zapopan-1'));

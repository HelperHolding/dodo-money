-- Fondos fijos del efectivo por sucursal:
--   · cajón de venta: cada turno arranca con 500 (antes 1,500); al cerrar, todo lo vendido en efectivo pasa a la bóveda.
--   · bóveda: después de la salida a corporativo se queda con 4,500; de esos, 3,000 son el fondo de emergencia
--     y 1,500 sirven para dar el fondo de los cajones.
-- Los turnos que ya arrancaron con 1,500 no cambian: el esperado de cada turno sale de sus propios movimientos.
-- Requiere 0001–0018.

alter table sucursales
  add column fondo_boveda     numeric(12,2) not null default 4500 check (fondo_boveda >= 0),
  add column fondo_emergencia numeric(12,2) not null default 3000 check (fondo_emergencia >= 0),
  add constraint emergencia_dentro_de_boveda check (fondo_emergencia <= fondo_boveda);

update sucursales set fondo_caja_venta = 500;

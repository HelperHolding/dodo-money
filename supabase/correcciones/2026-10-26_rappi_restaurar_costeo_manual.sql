-- La recarga del 2/10 al 26/10 desde el Portal Aliados reescribió los renglones de cada orden y los ligó al producto
-- genérico por su texto. Cinco renglones tenían costeo manual por orden ("Rappi interno · … · combo confirmado" y
-- "costeo individual"), ligados a SKUs propios (1000031–1000035). Se regresan a esos productos.
-- Solo se actualiza si el renglón sigue en el producto genérico que dejó la recarga.
begin;

update rappi_lineas l set producto_id = v.manual
from (values
  ('2479394899', 1, 32, 231),
  ('2481029893', 1, 56, 233),
  ('2481137909', 1, 112, 230),
  ('2481221053', 1, 75, 234),
  ('2481872252', 1, 87, 232)
) as v(rappi_id, linea, generico, manual)
where l.rappi_id = v.rappi_id and l.linea = v.linea and l.producto_id = v.generico;

-- Después: los 5 renglones en su producto de costeo manual, ligado a costo.
select l.rappi_id, l.linea, l.producto_id, p.nombre, p.dodo_id
from rappi_lineas l join rappi_productos p on p.id = l.producto_id
where (l.rappi_id, l.linea) in (('2479394899', 1), ('2481029893', 1), ('2481137909', 1), ('2481221053', 1), ('2481872252', 1))
order by l.rappi_id;

commit;

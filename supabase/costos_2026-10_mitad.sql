-- "Mitad y mitad Grande" (dodo_id 1000016): se vende como la suma de media de cada sabor; su costo, igual.
-- Dodo IS la reporta como un solo producto sin los sabores, así que se usa el promedio simple del costo Grande
-- de los 22 sabores del menú (receta + periférico, costos vigentes desde el 2026-10-01): $66.89.
-- Rango de los sabores: $41.01 (Cheddar Cremoso) a $91.05 (Dodo Supreme).
-- Se puede correr más de una vez. Requiere costos_2026-10.sql.

begin;

update productos_venta set categoria = 'pizza', tamano = 'grande'
 where dodo_id = 1000016 and (categoria is null or tamano is null);

insert into costos_producto (dodo_id, costo, vigente_desde, fuente, nota)
values (1000016, 66.89, date '2026-10-01', 'Excel MENU DODO FINAL (pestaña Costo)',
        'Mitad y mitad: promedio simple del costo Grande de los 22 sabores (media + media)')
on conflict (dodo_id, vigente_desde) do update set costo = excluded.costo, fuente = excluded.fuente, nota = excluded.nota;

commit;

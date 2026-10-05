-- Costos del menú (Excel "MENU DODO FINAL", pestaña Costo), vigentes desde el 2026-10-01.
-- Costo = costo de receta + periférico (1 % del precio de venta: sobres de cátsup, servilletas, chile en polvo).
-- Bebidas y dips no llevan periférico. Las variantes "T" llevan el costo de su tamaño; Boneless = Chicken pieces.
-- Los combos no se cargan: Dodo IS los registra como sus piezas por separado. "Mitad y mitad Grande" queda sin costo.
-- Los costos anteriores se conservan (las ventas antes del 1 de octubre se siguen costeando con ellos).
-- Se puede correr más de una vez: si ya hay costo con esa fecha, lo actualiza.
-- Requiere 0006.

begin;

-- Categoría y tamaño de los productos que no los tenían.
update productos_venta p set categoria = v.categoria::categoria_producto, tamano = coalesce(p.tamano, v.tamano)
  from (values
    (1000021, 'pizza', 'grande'),
    (1000001, 'pizza', 'pequeno'),
    (178, 'pizza', 'grande'),
    (179, 'pizza', 'grande'),
    (163, 'pizza', 'mediano'),
    (1000002, 'pizza', 'pequeno'),
    (209, 'snack', 'mediano'),
    (172, 'pizza', 'grande'),
    (1000003, 'pizza', 'mediano'),
    (1000008, 'pizza', 'pequeno'),
    (1000004, 'pizza', 'grande'),
    (60, 'pizza', 'grande'),
    (1000026, 'pizza', 'mediano'),
    (56, 'pizza', 'pequeno'),
    (129, 'pizza', 'grande'),
    (127, 'pizza', 'mediano'),
    (1000005, 'pizza', 'pequeno'),
    (103, 'pizza', 'grande'),
    (101, 'pizza', 'mediano'),
    (100, 'pizza', 'pequeno'),
    (1000022, 'bebida', null),
    (1000027, 'bebida', null),
    (1000014, 'bebida', null),
    (1000015, 'bebida', null),
    (188, 'pizza', 'mediano'),
    (1000018, 'otro', null),
    (248, 'otro', null),
    (247, 'otro', null),
    (232, 'otro', null),
    (123, 'pizza', 'grande'),
    (121, 'pizza', 'mediano'),
    (120, 'pizza', 'pequeno'),
    (90, 'pizza', 'grande'),
    (88, 'pizza', 'mediano'),
    (205, 'snack', null),
    (1000009, 'bebida', null),
    (1000019, 'bebida', null),
    (239, 'bebida', null),
    (35, 'pizza', 'grande'),
    (36, 'pizza', 'grande'),
    (34, 'pizza', 'mediano'),
    (32, 'pizza', 'pequeno'),
    (29, 'pizza', 'grande'),
    (28, 'pizza', 'mediano'),
    (26, 'pizza', 'pequeno'),
    (198, 'snack', 'mediano'),
    (97, 'pizza', 'grande'),
    (94, 'pizza', 'mediano'),
    (95, 'pizza', 'mediano'),
    (93, 'pizza', 'pequeno'),
    (39, 'pizza', 'pequeno'),
    (1000023, 'pizza', 'grande'),
    (107, 'pizza', 'pequeno'),
    (82, 'pizza', 'grande'),
    (1000006, 'pizza', 'pequeno'),
    (135, 'pizza', 'grande'),
    (136, 'pizza', 'grande'),
    (133, 'pizza', 'mediano'),
    (1000007, 'pizza', 'pequeno'),
    (53, 'pizza', 'grande'),
    (51, 'pizza', 'mediano'),
    (50, 'pizza', 'pequeno'),
    (68, 'pizza', 'grande'),
    (1000020, 'pizza', 'grande'),
    (1000010, 'pizza', 'pequeno'),
    (1000024, 'postre', null),
    (1000011, 'postre', null),
    (1000017, 'postre', null),
    (213, 'postre', null),
    (1000012, 'bebida', null),
    (1000013, 'bebida', null),
    (233, 'bebida', null),
    (1000025, 'bebida', null),
    (116, 'pizza', 'mediano'),
    (114, 'pizza', 'pequeno'),
    (184, 'pizza', 'grande'),
    (185, 'pizza', 'grande'),
    (182, 'pizza', 'mediano'),
    (181, 'pizza', 'pequeno')
  ) as v(dodo_id, categoria, tamano)
 where p.dodo_id = v.dodo_id and (p.categoria is null or p.tamano is null);

insert into costos_producto (dodo_id, costo, vigente_desde, fuente, nota)
select v.dodo_id, v.costo, date '2026-10-01', 'Excel MENU DODO FINAL (pestaña Costo)', v.nota
  from (values
  (208, 68.50, 'Wings M: receta 66.65 + periférico 1.85'), -- Alitas Buffalo 10 uds
  (1000021, 66.11, 'Bacorn BBQ G: receta 63.72 + periférico 2.39'), -- Bacorn BBQ Grande
  (145, 49.30, 'Bacorn BBQ M: receta 47.31 + periférico 1.99'), -- Bacorn BBQ Mediano
  (1000001, 36.72, 'Bacorn BBQ P: receta 35.33 + periférico 1.39'), -- Bacorn BBQ Pequeño
  (178, 69.81, 'Bacorn Buffalo G: receta 67.42 + periférico 2.39'), -- Bacorn Buffalo Grande
  (179, 69.81, 'Bacorn Buffalo G: receta 67.42 + periférico 2.39'), -- Bacorn Buffalo Grande T
  (176, 48.77, 'Bacorn Buffalo M: receta 46.78 + periférico 1.99'), -- Bacorn Buffalo Mediano
  (165, 77.48, 'BBQ Carne Supreme G: receta 74.79 + periférico 2.69'), -- BBQ Carne Supreme Grande
  (163, 56.99, 'BBQ Carne Supreme M: receta 54.70 + periférico 2.29'), -- BBQ Carne Supreme Mediano
  (1000002, 40.40, 'BBQ Carne Supreme P: receta 38.85 + periférico 1.55'), -- BBQ Carne Supreme Pequeño
  (209, 51.35, 'Chicken pieces M: receta 49.60 + periférico 1.75'), -- Boneless Medium
  (171, 78.84, 'Carbonara G: receta 76.15 + periférico 2.69'), -- Carbonara Grande
  (172, 78.84, 'Carbonara G: receta 76.15 + periférico 2.69'), -- Carbonara Grande T
  (1000003, 57.26, 'Carbonara M: receta 54.97 + periférico 2.29'), -- Carbonara Mediano
  (1000008, 50.08, 'Carbonara P: receta 48.53 + periférico 1.55'), -- Carbonara Pequeño
  (1000004, 41.01, 'Cheesy Cheddar G: receta 39.02 + periférico 1.99'), -- Cheddar Cremoso Grande
  (60, 41.01, 'Cheesy Cheddar G: receta 39.02 + periférico 1.99'), -- Cheddar Cremoso Grande T
  (1000026, 32.97, 'Cheesy Cheddar M: receta 31.28 + periférico 1.69'), -- Cheddar Cremoso Mediano
  (56, 34.09, 'Cheesy Cheddar P: receta 32.90 + periférico 1.19'), -- Cheddar Cremoso Pequeño
  (129, 67.52, 'Cheeseburger G: receta 64.83 + periférico 2.69'), -- Cheeseburger Grande
  (127, 50.44, 'Cheeseburger M: receta 48.15 + periférico 2.29'), -- Cheeseburger Mediano
  (1000005, 35.84, 'Cheeseburger P: receta 34.29 + periférico 1.55'), -- Cheeseburger Pequeño
  (103, 71.40, 'Chimichurri Bacon G: receta 68.71 + periférico 2.69'), -- Chimichurri Bacon Grande
  (101, 53.36, 'Chimichurri Bacon M: receta 51.07 + periférico 2.29'), -- Chimichurri Bacon Mediano
  (100, 38.89, 'Chimichurri Bacon P: receta 37.34 + periférico 1.55'), -- Chimichurri Bacon Pequeño
  (1000022, 19.46, 'Coca Cola Light (600ml -2L) M: receta 19.46 + periférico 0.00'), -- Coca Light 0,6 L
  (1000027, 37.38, 'Coca Cola Light (600ml -2L) G: receta 37.38 + periférico 0.00'), -- Coca Light 2 L
  (1000014, 19.46, 'Coca Cola Zero (600ml -2L) M: receta 19.46 + periférico 0.00'), -- Coca Zero 0,6 L
  (1000015, 35.63, 'Coca Cola Zero (600ml -2L) G: receta 35.63 + periférico 0.00'), -- Coca Zero 2 L
  (156, 19.46, 'Coca Cola (600ml -2L) M: receta 19.46 + periférico 0.00'), -- Coca-Cola 0,6 L
  (157, 37.38, 'Coca Cola (600ml -2L) G: receta 37.38 + periférico 0.00'), -- Coca-Cola 2 L
  (188, 44.71, 'Crema champiñonas M: receta 42.72 + periférico 1.99'), -- Crema champiñonas Mediano
  (187, 50.69, 'Crema champiñonas P: receta 49.30 + periférico 1.39'), -- Crema champiñonas Pequeño
  (1000018, 3.92, 'BBQ M: receta 3.92 + periférico 0.00'), -- Dip BBQ Dip
  (248, 4.44, 'Buffalo M: receta 4.44 + periférico 0.00'), -- Dip Buffalo Dip
  (247, 6.32, 'Mango habanero M: receta 6.32 + periférico 0.00'), -- Dip Mango Habanero Dip
  (232, 6.87, 'Ranch M: receta 6.87 + periférico 0.00'), -- Dip Ranch Dip
  (123, 63.15, 'Doble Pepperoni G: receta 60.46 + periférico 2.69'), -- Doble Pepperoni Grande
  (121, 49.18, 'Doble Pepperoni M: receta 46.89 + periférico 2.29'), -- Doble Pepperoni Mediano
  (120, 36.63, 'Doble Pepperoni P: receta 35.08 + periférico 1.55'), -- Doble Pepperoni Pequeño
  (90, 91.05, 'Dodo Supreme G: receta 88.36 + periférico 2.69'), -- Dodo Supreme Grande
  (88, 64.27, 'Dodo Supreme M: receta 61.98 + periférico 2.29'), -- Dodo Supreme Mediano
  (87, 47.88, 'Dodo Supreme P: receta 46.33 + periférico 1.55'), -- Dodo Supreme Pequeño
  (205, 23.77, 'Dodster Buffalo M: receta 22.92 + periférico 0.85'), -- Dodster Buffalo 1 pza
  (202, 25.72, 'Dodster cheesy spicy M: receta 24.87 + periférico 0.85'), -- Dodster cheesy spicy 1 pza
  (204, 23.64, 'Dodster Chimichurri M: receta 22.79 + periférico 0.85'), -- Dodster chimichurri 1 pza
  (161, 27.00, 'Dodster classic M: receta 26.15 + periférico 0.85'), -- Dodster Classico 1 pza
  (1000009, 15.96, 'Fanta (600ml-2.5L) M: receta 15.96 + periférico 0.00'), -- Fanta 0,6 L
  (1000019, 31.25, 'Fanta (600ml-2.5L) G: receta 31.25 + periférico 0.00'), -- Fanta 2 L
  (239, 21.25, 'Fuze Tea (600ml) M: receta 21.25 + periférico 0.00'), -- Fuze tea 0,6 L
  (35, 66.41, 'Hawaii G: receta 64.02 + periférico 2.39'), -- Hawaiana Grande
  (36, 66.41, 'Hawaii G: receta 64.02 + periférico 2.39'), -- Hawaiana Grande T
  (33, 51.84, 'Hawaii M: receta 49.85 + periférico 1.99'), -- Hawaiana Mediano
  (34, 51.84, 'Hawaii M: receta 49.85 + periférico 1.99'), -- Hawaiana Mediano T
  (32, 39.39, 'Hawaii P: receta 38.00 + periférico 1.39'), -- Hawaiana Pequeño
  (73, 58.51, 'Jamon y champiñonas G: receta 56.52 + periférico 1.99'), -- Jamón y champiñones Grande
  (71, 43.28, 'Jamon y champiñonas M: receta 41.59 + periférico 1.69'), -- Jamón y champiñones Mediano
  (70, 34.65, 'Jamon y champiñonas P: receta 33.46 + periférico 1.19'), -- Jamón y champiñones Pequeño
  (29, 49.03, 'Margherita G: receta 47.04 + periférico 1.99'), -- Margarita Grande
  (27, 37.26, 'Margherita M: receta 35.57 + periférico 1.69'), -- Margarita Mediano
  (28, 37.26, 'Margherita M: receta 35.57 + periférico 1.69'), -- Margarita Mediano T
  (26, 29.10, 'Margherita P: receta 27.91 + periférico 1.19'), -- Margarita Pequeño
  (199, 22.83, 'Fries G: receta 22.34 + periférico 0.49'), -- Papas francesas Grande
  (198, 14.42, 'Fries M: receta 14.03 + periférico 0.39'), -- Papas francesas Medium
  (201, 20.45, 'Wedges G: receta 19.96 + periférico 0.49'), -- Papas Gajo Grande
  (200, 13.23, 'Wedges M: receta 12.84 + periférico 0.39'), -- Papas Gajo Medium
  (42, 53.30, 'Pepperoni G: receta 51.71 + periférico 1.59'), -- Pepperoni Grande
  (43, 53.30, 'Pepperoni G: receta 51.71 + periférico 1.59'), -- Pepperoni Grande T
  (96, 52.82, 'Pepperoni Mango G: receta 50.43 + periférico 2.39'), -- Pepperoni Mango Grande
  (97, 52.82, 'Pepperoni Mango G: receta 50.43 + periférico 2.39'), -- Pepperoni Mango Grande T
  (94, 40.72, 'Pepperoni Mango M: receta 38.73 + periférico 1.99'), -- Pepperoni Mango Mediano
  (95, 40.72, 'Pepperoni Mango M: receta 38.73 + periférico 1.99'), -- Pepperoni Mango Mediano T
  (93, 28.81, 'Pepperoni Mango P: receta 27.42 + periférico 1.39'), -- Pepperoni Mango Pequeño
  (40, 41.13, 'Pepperoni M: receta 39.84 + periférico 1.29'), -- Pepperoni Mediano
  (39, 30.98, 'Pepperoni P: receta 30.03 + periférico 0.95'), -- Pepperoni Pequeño
  (1000023, 69.98, 'Pollo BBQ G: receta 67.59 + periférico 2.39'), -- Pollo BBQ Grande
  (108, 52.44, 'Pollo BBQ M: receta 50.45 + periférico 1.99'), -- Pollo BBQ Mediano
  (107, 37.54, 'Pollo BBQ P: receta 36.15 + periférico 1.39'), -- Pollo BBQ Pequeño
  (82, 79.36, 'Pollo hawai supreme G: receta 76.67 + periférico 2.69'), -- Pollo hawai supreme Grande
  (80, 59.81, 'Pollo hawai supreme M: receta 57.52 + periférico 2.29'), -- Pollo hawai supreme Mediano
  (1000006, 44.39, 'Pollo hawai supreme P: receta 42.84 + periférico 1.55'), -- Pollo hawai supreme Pequeño
  (135, 70.46, 'Pollo Ranch G: receta 68.07 + periférico 2.39'), -- Pollo Ranch Grande
  (136, 70.46, 'Pollo Ranch G: receta 68.07 + periférico 2.39'), -- Pollo Ranch Grande T
  (133, 52.19, 'Pollo Ranch M: receta 50.20 + periférico 1.99'), -- Pollo Ranch Mediano
  (1000007, 54.56, 'Pollo Ranch P: receta 53.17 + periférico 1.39'), -- Pollo Ranch Pequeño
  (53, 69.43, 'Quatro estaciones G: receta 67.04 + periférico 2.39'), -- Quatro estaciones Grande
  (51, 56.56, 'Quatro estaciones M: receta 54.57 + periférico 1.99'), -- Quatro estaciones Mediano
  (50, 49.47, 'Quatro estaciones P: receta 48.08 + periférico 1.39'), -- Quatro estaciones Pequeño
  (67, 54.18, '4 quesos G: receta 51.79 + periférico 2.39'), -- Quatro quesos Grande
  (68, 54.18, '4 quesos G: receta 51.79 + periférico 2.39'), -- Quatro quesos Grande T
  (65, 48.20, '4 quesos M: receta 46.21 + periférico 1.99'), -- Quatro quesos Mediano
  (64, 42.90, '4 quesos P: receta 41.51 + periférico 1.39'), -- Quatro quesos Pequeño
  (1000020, 61.33, 'Spicy Ranch G: receta 58.94 + periférico 2.39'), -- Ranch Picante Grande
  (139, 46.46, 'Spicy Ranch M: receta 44.47 + periférico 1.99'), -- Ranch Picante Mediano
  (1000010, 49.17, 'Spicy Ranch P: receta 47.78 + periférico 1.39'), -- Ranch Picante Pequeño
  (1000024, 16.72, 'Apple rolls G: receta 15.87 + periférico 0.85'), -- Rolls con manzana 16
  (1000011, 14.40, 'Apple rolls M: receta 13.85 + periférico 0.55'), -- Rolls con manzana 8
  (1000017, 21.81, 'Rolls con Piña G: receta 20.96 + periférico 0.85'), -- Rolls con piña 16
  (213, 14.14, 'Rolls con Piña M: receta 13.59 + periférico 0.55'), -- Rolls con piña 8
  (1000012, 15.96, 'Sidral Mundet (600ml-2.5L) M: receta 15.96 + periférico 0.00'), -- Sidral mundet 0,6 L
  (1000013, 31.25, 'Sidral Mundet (600ml-2.5L) G: receta 31.25 + periférico 0.00'), -- Sidral mundet 2 L
  (233, 15.96, 'Sprite (600ml-2.5L) M: receta 15.96 + periférico 0.00'), -- Sprite 0,6 L
  (1000025, 31.25, 'Sprite (600ml-2.5L) G: receta 31.25 + periférico 0.00'), -- Sprite 2 L
  (117, 84.19, 'Tres carnes G: receta 81.80 + periférico 2.39'), -- Tres Carnes Grande
  (115, 55.07, 'Tres carnes M: receta 53.08 + periférico 1.99'), -- Tres Carnes Mediano
  (116, 55.07, 'Tres carnes M: receta 53.08 + periférico 1.99'), -- Tres Carnes Mediano T
  (114, 39.94, 'Tres carnes P: receta 38.55 + periférico 1.39'), -- Tres Carnes Pequeño
  (184, 76.13, 'Verduras y champiñonas G: receta 73.74 + periférico 2.39'), -- Verduras y Champiñones Grande
  (185, 76.13, 'Verduras y champiñonas G: receta 73.74 + periférico 2.39'), -- Verduras y Champiñones Grande T
  (182, 55.81, 'Verduras y champiñonas M: receta 53.82 + periférico 1.99'), -- Verduras y Champiñones Mediano
  (181, 39.31, 'Verduras y champiñonas P: receta 37.92 + periférico 1.39') -- Verduras y Champiñones Pequeño
  ) as v(dodo_id, costo, nota)
on conflict (dodo_id, vigente_desde) do update set costo = excluded.costo, fuente = excluded.fuente, nota = excluded.nota;

commit;

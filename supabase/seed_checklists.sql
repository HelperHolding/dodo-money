-- Datos iniciales de checklists. Se puede volver a correr: no duplica nada.

-- Norma de precalentamiento de masa (hoja "Dough warming"): bolas por hora según la temperatura del área.
insert into normas_masa (hora, bolas_25, bolas_30, bolas_35) values
  (10, 2, 1, 1), (11, 2, 1, 1), (12, 2, 2, 2), (13, 4, 2, 2), (14, 2, 1, 1), (15, 2, 1, 1), (16, 2, 1, 1),
  (17, 2, 1, 1), (18, 4, 3, 3), (19, 4, 3, 3), (20, 2, 1, 1), (21, 2, 1, 1), (22, 2, 1, 1)
on conflict (hora) do update set bolas_25 = excluded.bolas_25, bolas_30 = excluded.bolas_30, bolas_35 = excluded.bolas_35;

-- Recorridos de supervisor (hojas "Supervisor morning / evening ESP", sección de inspección).
insert into checklists (clave, nombre, horas, roles) values
  ('recorrido_manana', 'Recorrido de supervisor · Mañana', '{12,13,14,15,16,17}', '{encargado,gerente,admin}'),
  ('recorrido_tarde',  'Recorrido de supervisor · Tarde',  '{18,19,20,21,22,23}', '{encargado,gerente,admin}')
on conflict (clave) do nothing;

insert into checklist_puntos (checklist_id, orden, texto, detalle_por_hora)
select c.id, p.orden, p.texto,
       case when p.orden = 7 then
         case c.clave
           when 'recorrido_manana' then '{"12":"Línea de ingredientes","13":"Línea de ingredientes","14":"Línea de ingredientes","15":"Nevera de preparaciones","16":"Línea de ingredientes","17":"Cámara congeladora"}'::jsonb
           else '{"18":"Línea de ingredientes","19":"Línea de ingredientes","20":"Línea de ingredientes","21":"Nevera de preparaciones","22":"Línea de ingredientes","23":"Cámara congeladora"}'::jsonb
         end
       end
from checklists c
cross join (values
  (1, 'La cocina está limpia.'),
  (2, 'Se han comprobado el FEFO y las fechas de caducidad. No hay productos caducados.'),
  (3, 'La cantidad de masa precalentada corresponde al plan.'),
  (4, 'Las preparaciones se hacen según los estándares y normas.'),
  (5, 'Las zonas de entrada están limpias.'),
  (6, 'Las vitrinas se reponen según los estándares.'),
  (7, 'Se revisan las fechas de caducidad de los ingredientes en congeladores, neveras y zonas de almacenamiento.')
) as p(orden, texto)
where c.clave in ('recorrido_manana', 'recorrido_tarde')
on conflict (checklist_id, orden) do nothing;

-- Productos de merma: forecast de Dodo IS (24.09.2026) más categorías genéricas para arrancar.
insert into productos_merma (categoria, nombre, unidad, orden) values
  ('Salsas', 'Salsa para pizza', 'kg', 10),
  ('Salsas', 'Mango habanero', 'kg', 20),
  ('Salsas', 'Salsa BBQ', 'kg', 30),
  ('Salsas', 'Búfalo', 'kg', 40),
  ('Salsas', 'Chimichurri', 'kg', 50),
  ('Salsas', 'Leche condensada', 'kg', 60),
  ('Salsas', 'Aderezo Ranch', 'kg', 70),
  ('Otros', 'Orégano', 'kg', 80),
  ('Otros', 'Ajo', 'kg', 90),
  ('Otros', 'Tortilla', 'pieza', 100),
  ('Otros', 'Canela', 'kg', 110),
  ('Otros', 'Aceite', 'kg', 120),
  ('Otros', 'Levadura', 'kg', 130),
  ('Otros', 'Sal', 'kg', 140),
  ('Otros', 'Azúcar', 'kg', 150),
  ('Entrantes', 'Papas francesas', 'kg', 160),
  ('Entrantes', 'Alitas', 'kg', 170),
  ('Entrantes', 'Boneless', 'kg', 180),
  ('Entrantes', 'Papas Gajo Medium', 'pieza', 190),
  ('Verduras', 'Perejil', 'kg', 200),
  ('Verduras', 'Cebolla morada', 'kg', 210),
  ('Verduras', 'Pimiento verde', 'kg', 220),
  ('Verduras', 'Jitomate', 'kg', 230),
  ('Verduras', 'Champiñones', 'kg', 240),
  ('Productos en conserva', 'Piña', 'kg', 250),
  ('Productos en conserva', 'Elote', 'kg', 260),
  ('Productos en conserva', 'Jalapeño', 'kg', 270),
  ('Queso', 'Queso de cabra', 'kg', 280),
  ('Queso', 'Mozzarella', 'kg', 290),
  ('Queso', 'Parmesano', 'kg', 300),
  ('Queso', 'Cheddar', 'l', 310),
  ('Carne', 'Jamón de pavo', 'kg', 320),
  ('Carne', 'Pepperoni', 'pieza', 330),
  ('Carne', 'Pollo', 'kg', 340),
  ('Carne', 'Tocino', 'kg', 350),
  ('Carne', 'Carne molida', 'kg', 360),
  ('Masa', 'Masa', 'bola', 370),
  ('Productos terminados', 'Pizza', 'pieza', 380),
  ('Productos terminados', 'Entrante preparado', 'pieza', 390),
  ('Bebidas', 'Refresco', 'pieza', 400),
  ('Bebidas', 'Agua', 'pieza', 410),
  ('Postres', 'Postre', 'pieza', 420),
  ('Empaques', 'Caja de pizza', 'pieza', 430),
  ('Empaques', 'Caja de entrante', 'pieza', 440),
  ('Empaques', 'Bolsa', 'pieza', 450),
  ('Empaques', 'Vaso', 'pieza', 460)
on conflict (nombre) do nothing;

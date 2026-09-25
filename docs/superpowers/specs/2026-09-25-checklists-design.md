# Checklists digitales: mermas, temperatura de masa y recorrido de supervisor

Fecha: 2026-09-25 · Estado: diseño aprobado en conversación, pendiente de revisión escrita

## Objetivo

Reemplazar el papel de tres registros del archivo `MX Checklists (base).xlsx` dentro de la app de control de efectivo:

| Registro | Hoja del Excel | Cómo se usa hoy |
|---|---|---|
| Mermas | *Write-offs* | Se anota cada merma cuando ocurre; al final del día el encargado de turno la pasa a Dodo IS. |
| Temperatura de masa | *Dough warming* | Cada hora se sacan bolas según la norma y se toma su temperatura. |
| Recorrido de supervisor | *Supervisor morning / evening ESP* (sección "Inspección de la pizzería") | Cada hora el encargado recorre la sucursal y revisa 7 puntos. |

**Éxito:** estos tres registros dejan de hacerse en papel, y el gerente ve por día qué horas faltaron, qué lecturas salieron de norma y si las mermas se cerraron y capturaron en Dodo IS.

**Fuera de alcance:** apertura, cambio y cierre de turno del checklist de encargado, tareas semanales, limpieza, cold shop, hot shop, sala, baños, amasado y limpieza profunda. El esquema de puntos de checklist (ver Recorrido) queda listo para agregarlos después.

## Decisiones tomadas

1. **Firma del empleado en mermas:** el empleado escribe su nombre en cada merma; el encargado cierra la lista del día con su usuario. El personal operativo no tiene usuario.
2. **Dispositivo:** tablet fija en sucursal y celular. Cada registro queda a nombre del usuario con sesión abierta.
3. **Temperatura de masa en norma:** de 12 a 22 °C, inclusive.
4. **Norma de bolas por hora:** igual para todas las sucursales.
5. **Producto de merma:** lista fija (catálogo), igual que en Dodo IS. Se carga con los productos del forecast de Dodo IS (ver Mermas).
6. **Arquitectura mixta:** mermas y masa con tablas propias; recorrido con un esquema genérico de checklist de puntos sí/no.
7. **Horario:** la hora del registro la fija el servidor (Ciudad de México). Una franja horaria se puede registrar desde su inicio hasta **10 minutos después de que termina**.

## Reglas generales

- Nada se edita ni se borra (sin políticas de `update`/`delete`), igual que en efectivo.
- Cada registro guarda `registrado_por` (default `auth.uid()`) y `creado_en` (default `now()`).
- Seguridad por renglón: cada quien ve y registra solo su sucursal (`mi_sucursal()`); `admin` ve todas. Se reutilizan `mi_sucursal()` y `mi_rol()` de la migración 0001.
- Las reglas se aplican en la base de datos (triggers/constraints); la pantalla las repite solo para dar mensajes claros.

### Franjas horarias y tolerancia

- Una franja se identifica por `fecha` (fecha de Ciudad de México en que empieza) y `hora` (0–23, hora de inicio).
- La franja `(fecha, h)` está abierta de `fecha h:00` a `fecha (h+1):10`, hora de Ciudad de México (UTC−6 fijo, igual que `lib/formato.ts`). La franja de las 23:00 cierra a las 00:10 del día siguiente y sigue perteneciendo a `fecha`.
- Entre `h:00` y `h:10` hay dos franjas abiertas (la anterior y la actual); la pantalla deja elegir entre ellas. Fuera de esa ventana solo existe la actual.
- Una función SQL `franja_abierta(fecha date, hora int) returns boolean` valida esto con `now()`; los triggers de inserción la usan. Mensaje: *"La hora de las HH:00 cerró a las HH+1:10."*
- Una franja sin registro cuya ventana ya cerró se muestra como **no registrada**.

## Modelo de datos (migración `0002_checklists.sql`)

### Mermas

```
productos_merma  id uuid pk, categoria text not null, nombre text unique not null, unidad text not null,
                 orden int not null, activo bool default true
                 -- global; sin políticas de insert: solo admin por SQL Editor

motivo_merma     enum ('caducidad', 'empaque_danado', 'mal_estado', 'error_humano')

mermas           id uuid pk, sucursal_id → sucursales, fecha date not null,
                 producto_id → productos_merma, cantidad numeric(10,3) > 0,
                 motivo motivo_merma, empleado text not null (trim ≠ ''),
                 registrado_por → perfiles default auth.uid(), creado_en timestamptz default now()

cierres_merma    id uuid pk, sucursal_id, fecha, capturado_dodo bool not null,
                 cerrado_por → perfiles default auth.uid(), cerrado_en default now(),
                 unique (sucursal_id, fecha)
```

- `fecha` de la merma se fija en el trigger con la fecha actual de Ciudad de México (no la elige el usuario).
- Trigger en `mermas`: rechaza si existe `cierres_merma` para `(sucursal_id, fecha)` → *"Las mermas de hoy ya se cerraron."*; rechaza producto inactivo.
- Política de insert en `cierres_merma`: `mi_rol() in ('encargado','gerente','admin')`, sucursal propia, `capturado_dodo = true` (la casilla es obligatoria para cerrar).
- Se puede cerrar un día con cero mermas.

Catálogo inicial (del forecast de productos de Dodo IS, 24.09.2026; en pantalla se agrupa por categoría):

| Categoría | Productos (unidad) |
|---|---|
| Salsas | Salsa para pizza, Mango habanero, Salsa BBQ, Búfalo, Chimichurri, Leche condensada, Aderezo Ranch (kg) |
| Otros | Orégano, Ajo (kg) · Tortilla (pieza) · Canela, Aceite, Levadura, Sal, Azúcar (kg) |
| Entrantes | Papas francesas, Alitas, Boneless (kg) · Papas Gajo Medium (pieza) |
| Verduras | Perejil, Cebolla morada, Pimiento verde, Jitomate, Champiñones (kg) |
| Productos en conserva | Piña, Elote, Jalapeño (kg) |
| Queso | Queso de cabra, Mozzarella, Parmesano (kg) · Cheddar (l) |
| Carne | Jamón de pavo (kg) · Pepperoni (pieza) · Pollo, Tocino, Carne molida (kg) |
| Masa | Masa (bola) |
| Productos terminados | Pizza, Entrante preparado (pieza) |
| Bebidas | Refresco, Agua (pieza) |
| Postres | Postre (pieza) |
| Empaques | Caja de pizza, Caja de entrante, Bolsa, Vaso (pieza) |

Las últimas cinco categorías no vienen en el forecast; son genéricas para arrancar y se afinan con los nombres de Dodo IS.

Motivos en pantalla: Caducidad · Empaque dañado · Producto en mal estado · Error humano (de la hoja: *expiration date, damaged packaging, spoilage, human error*).

### Temperatura de masa

```
normas_masa      hora int pk (10..22), bolas_25 int, bolas_30 int, bolas_35 int   -- global

lecturas_masa    id uuid pk, sucursal_id, fecha date, hora int,
                 temp_area int check (temp_area in (25, 30, 35)),
                 bolas int >= 0, temperatura numeric(4,1),
                 en_norma bool generated (temperatura between 12 and 22),
                 comentario text,
                 registrado_por, creado_en,
                 unique (sucursal_id, fecha, hora)
```

- Franjas de masa: inicio 10:00 a 22:00 (13 franjas, "10:00 – 11:00" … "22:00 – 23:00").
- Trigger: exige `franja_abierta(fecha, hora)` y que `hora` exista en `normas_masa`; exige `comentario` no vacío si `temperatura` está fuera de 12–22 o `bolas` ≠ la norma de `temp_area` → *"Escribe qué pasó: …"*.
- Duplicado → *"Ya se registró la masa de las HH:00."*
- Norma inicial (hoja *Dough warming*):

| Hora | 25 °C | 30 °C | 35 °C |
|---|---|---|---|
| 10 | 2 | 1 | 1 |
| 11 | 2 | 1 | 1 |
| 12 | 2 | 2 | 2 |
| 13 | 4 | 2 | 2 |
| 14 | 2 | 1 | 1 |
| 15 | 2 | 1 | 1 |
| 16 | 2 | 1 | 1 |
| 17 | 2 | 1 | 1 |
| 18 | 4 | 3 | 3 |
| 19 | 4 | 3 | 3 |
| 20 | 2 | 1 | 1 |
| 21 | 2 | 1 | 1 |
| 22 | 2 | 1 | 1 |

### Recorrido de supervisor (esquema reutilizable)

```
checklists            id uuid pk, clave text unique, nombre text, horas int[] not null,
                      roles rol_usuario[] not null           -- quién puede llenarlo

checklist_puntos      id uuid pk, checklist_id, orden int, texto text,
                      detalle_por_hora jsonb                 -- {"15": "Nevera de preparaciones", ...}
                      unique (checklist_id, orden)

recorridos            id uuid pk, sucursal_id, checklist_id, fecha, hora,
                      registrado_por, creado_en,
                      unique (sucursal_id, checklist_id, fecha, hora)

recorrido_respuestas  recorrido_id → recorridos, punto_id → checklist_puntos,
                      cumple bool not null, comentario text,
                      check (cumple or coalesce(trim(comentario), '') <> ''),
                      primary key (recorrido_id, punto_id)
```

- El recorrido y sus respuestas se guardan juntos con una función `registrar_recorrido(p_checklist uuid, p_fecha date, p_hora int, p_respuestas jsonb)` (`security definer`) que valida: rol permitido, `hora = any(horas)`, `franja_abierta`, que vengan respuestas para **todos** los puntos del checklist, y comentario en cada "no cumple". Sin políticas de insert directo en estas dos tablas.
- Datos iniciales:
  - `recorrido_manana` — "Recorrido de supervisor · Mañana", horas 12–17, roles encargado/gerente/admin.
  - `recorrido_tarde` — "Recorrido de supervisor · Tarde", horas 18–23, mismos roles.
  - Puntos (ambos checklists):
    1. La cocina está limpia.
    2. Se han comprobado el FEFO y las fechas de caducidad. No hay productos caducados.
    3. La cantidad de masa precalentada corresponde al plan.
    4. Las preparaciones se hacen según los estándares y normas.
    5. Las zonas de entrada están limpias.
    6. Las vitrinas se reponen según los estándares.
    7. Se revisan las fechas de caducidad de los ingredientes en congeladores, neveras y zonas de almacenamiento.
  - `detalle_por_hora` del punto 7: mañana `12, 13, 14, 16` → Línea de ingredientes, `15` → Nevera de preparaciones, `17` → Cámara congeladora; tarde `18, 19, 20, 22` → Línea de ingredientes, `21` → Nevera de preparaciones, `23` → Cámara congeladora.

## Permisos

| Acción | Cajero | Encargado | Gerente | Admin |
|---|:-:|:-:|:-:|:-:|
| Registrar merma | ✅ | ✅ | ✅ | ✅ |
| Cerrar mermas del día | ❌ | ✅ | ✅ | ✅ |
| Registrar temperatura de masa | ✅ | ✅ | ✅ | ✅ |
| Registrar recorrido de supervisor | ❌ | ✅ | ✅ | ✅ |
| Ver día e historial | ✅ | ✅ | ✅ | ✅ (todas) |

## Pantallas

Una entrada nueva en `components/Nav.tsx`: **Checklists** → `/checklists`. Código en `app/(app)/checklists/`, siguiendo el patrón existente (páginas de servidor con `obtenerContexto()`, server actions que redirigen con `?ok=` / `?error=` y el componente `Aviso`).

1. **Resumen** (`/checklists`, `?fecha=` para días anteriores): rejilla de franjas de masa (10–22) y de recorrido (12–23) con estado ✅ en norma/cumple todo · ⚠️ fuera de norma o algún "no cumple" · ⏳ abierta ahora · ❌ no registrada · vacío = aún no empieza; tarjeta de mermas con conteo y estado de cierre. Enlaces a las tres pantallas.
2. **Mermas** (`/checklists/mermas`): formulario (producto, cantidad con la unidad visible, motivo, nombre del empleado); tabla del día (hora, producto, cantidad, motivo, empleado, sesión); totales por producto y unidad; botón "Cerrar mermas del día" con casilla obligatoria "Ya las capturé en Dodo IS" (solo encargado+). Día cerrado: formulario oculto y aviso con quién y a qué hora cerró.
3. **Temperatura de masa** (`/checklists/masa`): franja(s) abierta(s) y su norma para 25/30/35 °C; formulario (temperatura del área, bolas, temperatura de la masa, comentario) que marca el comentario como obligatorio cuando la lectura sale de norma (componente cliente, como `FormArqueo`); tabla del día.
4. **Recorrido** (`/checklists/recorrido`): elige el checklist por la franja abierta; 7 puntos con botones grandes Cumple / No cumple y comentario al marcar No cumple; equipo del punto 7 para la hora; recorridos del día. Cajero ve el historial pero no el formulario.

## Errores

- Mensajes de la base de datos (`raise exception`) se muestran tal cual en el aviso rojo; están escritos en español para el usuario.
- Duplicados (`23505`) se traducen a "Ya se registró … de las HH:00".
- Validaciones de formulario (cantidad, número, campos vacíos) se revisan también en la server action antes de llamar a Supabase.

## Pruebas y verificación

- No hay framework de pruebas en el repo ni Node en la máquina de desarrollo actual; se verifica con el build de Vercel.
- `supabase/pruebas/0002_checklists.sql`: consultas para comprobar en SQL Editor que las reglas rechazan lo indebido (fuera de franja, sin comentario, día cerrado, rol no permitido, respuestas incompletas).
- Guion manual en el README: lectura en norma; lectura fuera de norma sin comentario (rechazo); recorrido fuera de tolerancia (rechazo); cajero intenta recorrido (rechazo); cerrar mermas y agregar otra (rechazo).

## Arranque

1. Correr `supabase/migrations/0002_checklists.sql` en SQL Editor (no modifica tablas de 0001).
2. Correr `supabase/seed_checklists.sql`: norma de masa, checklists de recorrido y catálogo de productos del forecast.
3. Para agregar productos: `insert` con categoría, nombre, unidad y orden; para quitarlos: `activo = false`, no borrar.

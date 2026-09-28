# Checklists de zonas, turno, amasado, limpieza profunda y objetivos

Fecha: 2026-09-29 · Estado: diseño aprobado en conversación, pendiente de revisión escrita

## Objetivo

Digitalizar las hojas del archivo `MX Checklists (base).xlsx` que faltaron en la primera etapa (mermas, masa y recorrido ya existen):

| Hoja del Excel | En la app |
|---|---|
| Supervisor morning / evening ESP (apertura, cambio, durante, cierre, tareas semanales) | Listas del encargado mañana y tarde + tareas semanales |
| Cleanliness ESP | Limpieza: apertura, ronda de la hora, cierre |
| Cold shop ESP | Preparaciones: apertura, cierre |
| Hot shop ESP | Zona caliente: apertura, durante (mañana y tarde), ronda de la hora, cierre |
| Checkout and dining area ESP | Caja y sala: apertura, ronda de la hora, cierre |
| Toilet cleanliness ESP | Baño: ronda de la hora |
| Dough mixing, production ESP | Amasado de masa (lotes con números) |
| Deep cleaning schedule | Limpieza profunda (calendario de 14 días) |
| Shift goals | Objetivos del turno |

**Éxito:** estas hojas dejan de hacerse en papel; el encargado ve qué falta y qué está por revisar; el resumen y la vista de corporativo muestran lo incompleto.

**Fuera de alcance:** usuarios para el personal de cocina (se evaluará después), hojas "(247)" y ocultas, bloqueo del cierre de caja por checklists.

## Decisiones tomadas

1. Se digitalizan las 9 hojas.
2. **Firma:** quien hace la tarea escribe su **nombre** (sesión del encargado abierta en la tablet); el encargado, gerente o admin marca **Revisado** por bloque.
3. **Ronda de la hora:** una sola pantalla con todas las zonas que tocan en esa hora; cada zona se guarda por separado cuando está completa.
4. **No frenan nada:** las listas no bloquean arqueos ni cierre del día; lo incompleto se ve en rojo.
5. **Arquitectura:** se amplía el esquema de checklists existente (checklist + puntos) con momentos y frecuencia; amasado, limpieza profunda y objetivos tienen tabla propia.

## Reglas generales

- Nada se edita ni se borra (sin políticas de update/delete). Un bloque guardado queda como está; si algo se corrige después, se explica en el comentario del siguiente bloque.
- Cada sucursal ve lo suyo; `ve_todas_las_sucursales()` (admin, corporativo) ve todo; corporativo no escribe (sin sucursal → las inserciones fallan; las funciones lo rechazan explícitamente).
- Día = día operativo (`dia_operativo()`, cambio a las 4:00).
- Rondas de la hora: franja `h:00`–`(h+1):10` con `validar_franja()` (0002).
- Listas por turno y tareas semanales: solo el día operativo en curso (no se registran días pasados ni futuros).

## Modelo de datos (migración `0005_checklists_zonas.sql`)

### Ampliación del esquema de checklists

```
momento_checklist  enum ('apertura', 'cambio', 'durante_manana', 'durante_tarde', 'cierre', 'hora', 'semanal')

checklists          + en_ronda boolean not null default false     -- aparece en la Ronda de la hora
                    + orden int not null default 0                -- orden en la rejilla y en la ronda
                    horas int[] (existente) = horas de sus puntos 'hora'; '{}' si no tiene
                    roles rol_usuario[] (existente) = quién registra

checklist_puntos    + momento momento_checklist not null default 'hora'
                    + dia_semana int check (dia_semana between 1 and 7)   -- solo 'semanal' (1 = lunes)
                    unique (checklist_id, orden) se mantiene (orden global dentro del checklist)
```

Los dos recorridos existentes quedan igual (`momento = 'hora'`, `en_ronda = false`, siguen con `recorridos` / `registrar_recorrido`).

### Registros de bloques

```
registros_checklist   id, sucursal_id, checklist_id, fecha date, momento momento_checklist,
                      hora int (solo 'hora'), empleado text not null check (trim(empleado) <> ''),
                      registrado_por default auth.uid(), creado_en,
                      revisado_por references perfiles, revisado_en timestamptz
                      unique index (sucursal_id, checklist_id, fecha, momento, coalesce(hora, -1))

registro_respuestas   registro_id, punto_id, cumple boolean not null, comentario text,
                      check (cumple or coalesce(trim(comentario), '') <> ''), primary key (registro_id, punto_id)
```

- Inserción solo por `registrar_checklist(p_checklist uuid, p_momento momento_checklist, p_fecha date, p_hora int, p_empleado text, p_respuestas jsonb) returns uuid` (`security definer`).
  - `p_fecha` y `p_hora` solo cuentan en 'hora' (la fecha de la franja, como en `franjasAbiertas`: la hora 23 registrada a las 00:05 lleva la fecha del día anterior). En los demás momentos se ignoran y la fecha es `dia_operativo()`.
  - Valida, en orden: corporativo → "Corporativo solo puede consultar."; sin sucursal; rol en `roles`; empleado no vacío → "Escribe quién hizo la lista."; el checklist tiene puntos de ese momento (y, en 'semanal', del día de la semana de hoy); en 'hora' `p_hora = any(horas)`; respuestas para todos esos puntos; comentario en cada "no cumple"; en 'hora' `validar_franja(p_fecha, p_hora)`.
  - Duplicado → 23505 ("Esta lista ya se registró hoy." / "Ya se registró … de las HH:00").
- Firma: `p_empleado` es texto libre; `registrado_por` = sesión.

### Revisión

`revisar(p_tipo text, p_id uuid)` (`security definer`): `p_tipo in ('checklist', 'amasado', 'limpieza')`; rol `encargado`/`gerente`/`admin` (corporativo rechazado); misma sucursal; no revisado antes → "Ya estaba revisado."; pone `revisado_por = auth.uid()`, `revisado_en = now()`.

### Amasado

```
lotes_amasado   id, sucursal_id, fecha default dia_operativo(), inicio time, fin time,
                temp_area int check in (25, 30, 35), plan_bolas int >= 0, bolas_resultado int >= 0,
                temp_sala, temp_harina, temp_agua, temp_masa numeric(4,1) check between -5 and 60,
                g_agua, g_sal, g_azucar, g_aceite, g_harina, g_levadura numeric(8,1) >= 0,
                minutos_amasado numeric(4,1) > 0,
                empleado text not null (trim <> ''), comentario text,
                registrado_por, creado_en, revisado_por, revisado_en
```

- Rangos (hoja "Dough mixing, production ESP"): sala 16–26 °C, harina 16–26 °C, agua 9–20 °C, **masa 24–26 °C**. Trigger: fecha = día operativo; si alguna temperatura está fuera de rango, `comentario` obligatorio → "Escribe qué pasó: la masa está a 28 °C, fuera de 24 a 26 °C." (primera temperatura fuera de rango en ese orden: masa, sala, harina, agua).
- Referencia en pantalla: tiempo de amasado lento 3 min / rápido 5 min; reposo en cruces 60 min.
- Inserción: cualquier rol con sucursal.

### Limpieza profunda

```
areas_limpieza_profunda  semana int (1|2), dia_semana int (1..7), area text, primary key (semana, dia_semana)
limpiezas_profundas      id, sucursal_id, fecha default dia_operativo(), area text, empleado text not null,
                         registrado_por, creado_en, revisado_por, revisado_en, unique (sucursal_id, fecha)
```

- Semana del ciclo: semana ISO impar = 1, par = 2 (`extract(week)`); al cambiar de año puede repetirse la semana 1 (aceptado). Función `area_limpieza_profunda(fecha date) returns text`; trigger fija `fecha = dia_operativo()` y `area`.

| Día | Semana 1 | Semana 2 |
|---|---|---|
| Lunes | Horno (parte de arriba) | Horno (parte de abajo) |
| Martes | Lavavajillas y zona de lavado | Lavavajillas y zona de lavado |
| Miércoles | Cocina | Sala |
| Jueves | Cuarto del personal | Baño |
| Viernes | Fregadero de fregonas y almacén | Congelador |
| Sábado | Zona de empaque y nevera de bebidas | Entrada |
| Domingo | Cámara fría | Zona de caja |

### Objetivos del turno

```
objetivos_turno  id, sucursal_id, fecha default dia_operativo(), turno text check in ('manana', 'tarde'),
                 empleado text not null, objetivo text not null (trim <> ''), registrado_por, creado_en
```

Inserción: `encargado`/`gerente`/`admin` de la sucursal.

### Permisos

| Acción | Cajero | Encargado | Gerente | Admin | Corporativo |
|---|:-:|:-:|:-:|:-:|:-:|
| Ronda de la hora, listas de zona, amasado, limpieza profunda | ✅ | ✅ | ✅ | ✅ | ❌ |
| Listas del encargado, tareas semanales, objetivos | ❌ | ✅ | ✅ | ✅ | ❌ |
| Revisado | ❌ | ✅ | ✅ | ✅ | ❌ |
| Ver | Su sucursal | Su sucursal | Su sucursal | Todas | Todas |

Lectura: políticas `select` con `sucursal_id = mi_sucursal() or ve_todas_las_sucursales()` (respuestas vía su registro). Catálogo (`areas_limpieza_profunda`) legible por todos.

## Catálogo de checklists (datos iniciales, `seed_checklists_zonas.sql`)

| clave | Nombre | en_ronda | horas | roles | Momentos (número de puntos) |
|---|---|:-:|---|---|---|
| encargado_manana | Encargado · Mañana | no | — | encargado, gerente, admin | apertura (13), cambio (6), durante_manana (5) |
| encargado_tarde | Encargado · Tarde | no | — | encargado, gerente, admin | cambio (5), durante_tarde (5), cierre (14) |
| tareas_semanales | Tareas semanales | no | — | encargado, gerente, admin | semanal (10: lun 3, mar 3, mié 2, jue 2) |
| limpieza | Limpieza | sí | 8–23 | cajero, encargado, gerente, admin | apertura (6), hora (7), cierre (9) |
| preparaciones | Zona de preparaciones | no | — | cajero, encargado, gerente, admin | apertura (3), cierre (1) |
| zona_caliente | Zona caliente | sí | 8–23 | cajero, encargado, gerente, admin | apertura (4), durante_manana (3), durante_tarde (3), hora (5), cierre (6) |
| caja_sala | Caja y sala | sí | 8–23 | cajero, encargado, gerente, admin | apertura (5), hora (8), cierre (7) |
| bano | Baño | sí | 11–23 | cajero, encargado, gerente, admin | hora (3) |

Textos: tal como en las hojas ESP, con estas adaptaciones:

- Encargado tarde, cierre: "Zona de caja y sala: terminal de la caja, menú digital están encendidos" → **apagados** (en el Excel dice "encendidos" en el cierre; es un error de copia).
- Encargado tarde, cierre: "Se preparan los checklists para el nuevo día y se imprimen las normas de precalentamiento de la masa" → "Se revisa que los checklists del día estén completos en la app."
- Encargado tarde, "Tareas entregadas por el encargado del turno de mañana": no es un punto; se escribe en el comentario del bloque de cambio si hace falta.
- Limpieza, apertura: "Se llena un recipiente para desinfectar cuchillos" y "Se enciende el lavavajillas" son puntos normales (la hora queda registrada al guardar).
- Zona caliente, hora: "Se revisa el etiquetado" se divide en tres puntos (línea de ingredientes, nevera, congelador).
- Baño: la hoja solo tiene las firmas por hora; puntos propuestos: "El baño está limpio: lavabo, inodoro, espejo y suelo.", "Hay papel higiénico, jabón y toallas de papel.", "El cubo de basura no está lleno."

El listado completo de puntos por checklist y momento va en el seed.

## Pantallas

Barra de accesos dentro de Checklists: Resumen · Ronda de la hora · Listas del turno · Masa · Recorrido · Amasado · Mermas · Limpieza profunda · Objetivos.

1. **Ronda de la hora** (`/checklists/ronda`): franja(s) abierta(s); un bloque por checklist `en_ronda` que tenga esa hora (orden por `orden`): puntos Cumple / No cumple, "¿Quién revisó?" y comentario en "no cumple". "Guardar ronda" guarda cada bloque completo por separado (uno a uno por `registrar_checklist`); los incompletos no se envían; el aviso dice cuáles se guardaron. Bloques ya guardados: ✓, nombre, hora y botón **Revisado** (encargado+) o "Revisado por … a las …".
2. **Listas del turno** (`/checklists/turno`): rejilla filas = checklists con momentos distintos de 'hora' (orden), columnas = Apertura, Cambio, Durante (mañana/tarde), Cierre, Semanal; casilla = Pendiente / Hecho / Revisado / — (no aplica). Tocar una casilla abre `?lista=<clave>&momento=<m>`: puntos, nombre, Guardar; si ya está, se ve lo registrado y Revisado. Cajero no ve los formularios de las listas del encargado.
3. **Amasado** (`/checklists/amasado`): formulario de lote con rangos visibles y temperatura fuera de rango en rojo (componente cliente, comentario obligatorio); tabla de lotes del día con Revisado.
4. **Limpieza profunda** (`/checklists/limpieza-profunda`): "Hoy toca: <día> · <área>"; nombre y Guardar; Revisado; últimos 14 días.
5. **Objetivos del turno** (`/checklists/objetivos`): turno, empleado, objetivo; lista del día.
6. **Resumen** (ampliado): casillas por hora de cada zona de la ronda (Listo / Revisar / Ahora / Falta, como masa); rejilla de listas del turno; amasado (lotes, fuera de rango); limpieza profunda (hecha, revisada); contador "Por revisar".
7. **Corporativo**: en la tarjeta, Checklists suma "Rondas x/y", "Listas del turno x/y" y "Limpieza profunda sí/no". Alertas nuevas: `rondas` (horas ya cerradas sin registro o con "no cumple"), `listas` (listas del turno incompletas cuando el día terminó), `amasado` (lote fuera de rango), `limpieza` (sin registro cuando el día terminó).

## Verificación

- `npm test`: área de limpieza profunda por fecha (semanas impar/par, cambio de año, día operativo antes de las 4:00), horas de cada zona en la ronda, rangos del amasado y motivo del comentario, estado de casillas de la rejilla, alertas nuevas de corporativo.
- `supabase/pruebas/0005_checklists_zonas.sql` (termina en `PRUEBAS OK — …`): permisos por rol (cajero no registra listas del encargado ni revisa), corporativo rechazado, nombre obligatorio, comentario en "no cumple", respuestas completas, duplicados, ronda fuera de hora, amasado fuera de rango sin comentario, limpieza profunda con área correcta, revisar dos veces.
- Typecheck, build, revisión independiente final.

## Arranque

1. `supabase/migrations/0005_checklists_zonas.sql`
2. `supabase/seed_checklists_zonas.sql`
3. `supabase/pruebas/0005_checklists_zonas.sql` → `PRUEBAS OK — …`
4. Fusionar a `main`.

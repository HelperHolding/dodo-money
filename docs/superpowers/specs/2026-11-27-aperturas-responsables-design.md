# Aperturas: responsables únicos, acceso por responsable, nombres editables, bitácora y división (HD-17, HD-27, HD-18) — diseño

Fecha: 2026-11-27 · Tickets: HD-17, HD-27 y HD-18 (puntos 1, 2, 3 y 5) de Julio · Responsable: Sebastián

## Objetivo

Que cada actividad o partida de apertura tenga **un solo responsable** tomado de un catálogo, y que **cada responsable vea y edite solo lo suyo**, aunque no sea administración. Además, que Julio pueda corregir nombres y descripciones sin perder el historial, dar de alta tareas completas en un paso, llevar una bitácora diaria, dividir tareas generales y ver el avance de cada apertura desde el inicio.

## Situación actual (López Mateos, 27-nov)

- `apertura_items.responsable` es texto libre. Valores con su número de registros:

  | Responsable | Registros |
  |---|---|
  | Julio Verdeja | 378 |
  | Diego Michel | 171 |
  | Ricardo Villa | 152 |
  | José Villa | 38 |
  | Sebastián Cervera | 20 |
  | Diego Barreto | 9 |
  | César | 7 |
  | César (360°) | 7 |
  | Equipo marketing | 7 |
  | Adrian Flores | 3 |
  | Gaby Landeros | 3 |
  | Halim Simon | 1 |
  | Julio Veredeja | 1 |
  | Renata | 1 |
  | Diego Barreto (CFE) / Julio Verdeja (UVIE) | 1 |
  | Sebas (TI) / César | 1 |
  | (vacío) | 1 |

- Diego Michel, José Villa, Diego Barreto y Gaby Landeros no tienen usuario en Dodo MX.
- Aperturas solo lo ven admin y corporativo:
  - `app/aperturas/layout.tsx` usa `puedeVerCompras`;
  - RLS `ver_apertura_items` usa `ve_compras()`;
  - solo admin edita (`edita_compras()`).
- Las ediciones de una partida van por `actualizar_apertura_item(p_item, p_revision, p_datos)` y quedan en `apertura_historial` (anterior y nuevo en jsonb).
- El nombre no se puede cambiar. La descripción solo existe dentro de `original` (jsonb) y no es editable.

## Decisiones tomadas

- **Catálogo de responsables** (`apertura_responsables`):
  - una fila por persona, con `perfil_id` si es usuario de Dodo MX, o `externo=true` para los que no tienen usuario (César, Equipo marketing);
  - `apertura_items.responsable_id` apunta al catálogo y es un solo responsable por registro;
  - `apertura_items.responsable` (texto) se conserva sincronizado con el nombre del catálogo mediante un trigger, para no romper las pantallas que ya lo leen.
- **Acceso:**
  - **Admin:** ve y edita todo. **Corporativo:** ve todo y no edita. Esto no cambia.
  - **Rol nuevo `aperturas`:** para quien solo necesita Aperturas. En el menú solo ve Aperturas, y su inicio lleva a Aperturas.
  - **Cualquier usuario activo responsable** de al menos un registro, de cualquier rol, ve las aperturas donde tiene algo asignado, pero solo con **sus** registros: lista, ficha, calendario, plano y fotos de esos registros.
  - **Ese responsable edita** de lo suyo: estado, inicio y fin, notas, evidencia y bitácora, además de la foto real si existe (HD-16).
  - **Ese responsable no ve** precios, importes, presupuesto ni presupuesto vivo, CAPEX, órdenes de compra, facturas, cotización ni historial de la apertura completa.
  - **Ese responsable no edita** nombre, descripción, responsable, categoría, cantidad, precio, orden ni factura.
  - Todo esto se hace cumplir en la base con RLS y en las funciones, no solo en la pantalla.
- **Nombre y descripción editables** por admin. El código (`clave`) no cambia y cada cambio queda en `apertura_historial`.
- **Alta en un solo paso:** nombre, descripción, tipo, etapa, categoría, responsable, inicio y fin.
- **Bitácora diaria** por registro: fecha, % de avance opcional, estatus en texto corto, comentario y quién.
- **Dividir** un registro (solo admin) en 2 a 10 registros nuevos:
  - la original queda `no_aplica` con evidencia «Dividida en T-xxx, T-yyy»;
  - las nuevas guardan `origen_id` y muestran «Viene de T-008».
- **Barra de avance** en la lista de Aperturas, con `avanceApertura` (HD-12).

## Datos (migración `supabase/migrations/20261127160000_aperturas_responsables.sql`)

1. **Rol nuevo.** `alter type public.rol_usuario add value if not exists 'aperturas';` va en un bloque aparte, porque `add value` no se puede usar en la misma transacción en la que se usa el valor. Sigue el patrón de `20261109120000_correos_marketing.sql`.
2. **Tabla `apertura_responsables`:**

   | Columna | Tipo y reglas |
   |---|---|
   | id | uuid pk |
   | nombre | text, 1–80, unique ignorando mayúsculas y espacios (`lower(btrim(nombre))`) |
   | perfil_id | uuid null, unique, fk `perfiles` |
   | externo | boolean not null default false |
   | activo | boolean not null default true |

   - `check(externo = (perfil_id is null))`.
   - RLS: select para `authenticated`, porque el catálogo es solo nombres. Escriben las funciones de admin.
3. **Columnas nuevas en `apertura_items`:**
   - `responsable_id uuid null`, fk `apertura_responsables`;
   - `descripcion text null`, de hasta 4000 caracteres;
   - `origen_id uuid null`, fk `apertura_items`.
4. **Tabla `apertura_bitacora`:**
   - id, item_id (fk on delete cascade), fecha (date, default hoy MX), avance (int null, 0–100), estatus (text null, hasta 80), comentario (text, 1–2000), usuario_id y creado_en;
   - select si el usuario ve el registro; alta por función.
5. **Funciones de acceso (`security definer set search_path=''`):**
   - `public.mi_responsable_id()`: el id de `apertura_responsables` donde `perfil_id = auth.uid()` y `activo`.
   - `public.ve_item_apertura(p_item uuid)`: `ve_compras()`, o que el `responsable_id` del registro sea `mi_responsable_id()`.
   - `public.ve_proyecto_apertura(p_proyecto uuid)`: `ve_compras()`, o que el proyecto tenga algún registro con `responsable_id = mi_responsable_id()`.
6. **RLS:**
   - `apertura_items`: select con `ve_item_apertura(id)`;
   - `apertura_proyectos`: select con `ve_proyecto_apertura(id)`;
   - `apertura_historial`: select con `ve_item_apertura(item_id)`;
   - `apertura_plano_marcas` y `apertura_item_dodo`: select con `ve_item_apertura(item_id)`;
   - `apertura_planos`: select con `ve_proyecto_apertura(proyecto_id)`.
   - Los buckets de planos y fotos admiten lectura con `ve_proyecto_apertura` del folder.
   - **Las políticas de admin y corporativo siguen igual.**
   - Revisa todas las tablas `apertura_*` y cualquier vista o función que las lea con `security definer` (calendario, Gantt, `pendientesGantt`, tareas ligadas, `soporte_tickets_parecidos`), para que ninguna exponga registros ajenos.
   - Precios: `apertura_items` tiene `precio`, `orden_id` y `factura_id`. Como RLS no oculta columnas, las pantallas de un responsable no los piden ni los muestran. Además, `actualizar_apertura_item` rechaza esos campos si no es `edita_compras()`. Exponerlos por la API a un responsable es un riesgo aceptado: solo es la partida asignada a esa persona.
7. **`actualizar_apertura_item`** (se reemplaza):
   - acepta `nombre` y `descripcion` (solo admin) y `responsable_id` (solo admin);
   - para quien no es admin pero es responsable del registro, solo permite `estado`, `inicio`, `fin`, `notas` y `evidencia`;
   - conserva la revisión y el historial (`anterior` y `nuevo` incluyen `nombre` y `descripcion` cuando cambian).
8. **Funciones nuevas:**
   - **`agregar_apertura_item`** extendida, o una nueva `crear_apertura_item_completo`, que da de alta en un paso. Solo admin.
   - **`agregar_bitacora_apertura(p_item, p_fecha, p_avance, p_estatus, p_comentario)`:** admin o responsable del registro.
   - **`dividir_apertura_item(p_item uuid, p_partes jsonb)`:** solo admin.
     - Recibe de 2 a 10 partes `{nombre, descripcion, responsable_id, inicio, fin}`.
     - Crea los registros nuevos con el mismo proyecto, tipo, etapa y categoría, sus claves siguientes (por el mismo mecanismo que `agregar_apertura_item`) y `origen_id`.
     - Marca la original `no_aplica` con la evidencia y deja historial.
     - Devuelve las claves nuevas.
   - **`guardar_responsable_apertura(p_id, p_nombre, p_perfil, p_externo, p_activo)`:** solo admin. Hace alta o edición del catálogo.
9. **Sincronización:** un trigger en `apertura_items` pone `responsable` igual al `nombre` del catálogo cuando cambia `responsable_id`. Cuando cambia el nombre en el catálogo, se actualiza `responsable` de sus registros, con `where`.

## Limpieza de responsables (script aparte, lo corre Sebastián)

`supabase/correcciones/2026-11-27_responsables_aperturas.sql`:

1. **Revisión, solo lectura:** cada texto distinto de `responsable` con su conteo y el responsable propuesto.
2. **Aplicación** con equivalencias explícitas en un `values (...)` editable:

   | Texto actual | Responsable | Notas |
   |---|---|---|
   | Julio Verdeja, Julio Veredeja | Julio Verdeja (usuario) | |
   | Diego Michel | Diego Michel | Externo por ahora; se liga a su usuario cuando se le cree |
   | Ricardo Villa | Ricardo Villa (usuario) | |
   | José Villa | José Villa | Externo por ahora |
   | Sebastián Cervera | Sebastián Cervera (usuario) | |
   | Diego Barreto, «Diego Barreto (CFE) / Julio Verdeja (UVIE)» | Diego Barreto | El segundo texto deja en notas «UVIE: Julio Verdeja» |
   | César, César (360°), «Sebas (TI) / César» | César (externo) | El último deja en notas «TI: Sebastián» |
   | Equipo marketing | Equipo marketing (externo) | |
   | Adrian Flores | Adrian Flores (usuario) | |
   | Gaby Landeros | Gaby Landeros | Externo por ahora |
   | Halim Simon | Halim Simon (usuario) | |
   | Renata | Renata Perez (usuario) | |

   - Los usuarios se buscan por nombre exacto en `perfiles`. Si no hay coincidencia única, el script aborta y dice cuál falta.
   - Los registros sin responsable se quedan sin responsable.
   - Termina verificando que ningún registro con texto quedó sin `responsable_id`. El conteo esperado es editable, igual que en la corrección de IVA (HD-10).
3. **Ligar un externo a su usuario cuando se cree**, por ejemplo Diego Michel: en la pantalla del catálogo, admin elige su usuario, y sus registros quedan visibles para él sin mover nada.

## Pantallas

- **Menú y entrada:**
  - `puedeVerAperturas(rol)` deja entrar a admin, corporativo, `aperturas` y a cualquier rol que tenga registros asignados. Esto último lo resuelve el layout consultando `mi_responsable_id()` y si hay alguno.
  - El enlace «Aperturas» aparece con la misma regla.
  - El rol `aperturas` ve solo Aperturas y Tareas, si su rol ya permitía Tareas; si no, solo Aperturas.
  - Se agrega a `NOMBRE_ROL` y a las invitaciones como «Aperturas».
- **Lista de aperturas** (`app/aperturas/page.tsx`): solo las visibles, cada una con la **barra de avance** (`avanceApertura`), las fechas y los días que faltan.
- **Detalle de la apertura, para un responsable que no es admin ni corporativo:**
  - solo sus registros (RLS lo garantiza);
  - pestañas Checklist, Calendario, Actividades/Equipo (solo lo suyo) y Plano (solo sus marcas);
  - sin presupuesto, CAPEX, cotización ni cronograma de compras;
  - un aviso «Ves solo los registros a tu nombre»;
  - los KPIs de avance se calculan solo con sus registros y se rotulan «Tu avance».
- **Ficha del registro:**
  - admin: campos «Nombre» y «Descripción» editables;
  - «Responsable»: un selector del catálogo, con opción «+ Nuevo externo» solo para admin;
  - el responsable ve y edita solo estado, fechas, notas y evidencia, sin precio, orden ni factura;
  - sección **Bitácora** con las entradas más recientes primero y un formulario para agregar;
  - «Viene de T-008» o «Dividida en …» con ligas;
  - botón **Dividir** (admin), que abre una ventana con 2 a 10 filas de nombre, responsable, inicio y fin.
- **Alta en un paso:** «Agregar actividad, equipo o validación» pide nombre, descripción, tipo, etapa, categoría, responsable (selector), inicio y fin.
- **Calendario y filtros:** agrupan por `responsable_id`, con el nombre del catálogo. El filtro de responsable usa el catálogo y desaparecen los duplicados.
- **Catálogo de responsables** (`/aperturas/responsables`, solo admin): lista, alta de externos, ligar a usuario y activar o desactivar.

## Pruebas

- **PGlite de la migración:**
  - un responsable con rol de sucursal ve solo sus registros y sus proyectos, y no ve los de otro;
  - corporativo ve todo y no edita; admin ve y edita todo;
  - el rol `aperturas` sin registros no ve nada;
  - el responsable solo puede cambiar estado, fechas, notas y evidencia: cambiar el precio o el nombre se rechaza;
  - el historial guarda el cambio de nombre;
  - la bitácora la agrega el responsable o admin, y la rechaza un tercero;
  - dividir crea N registros con claves nuevas, deja la original en `no_aplica` y valida de 2 a 10 partes;
  - el trigger de `responsable` sincroniza al cambiar el catálogo;
  - el catálogo rechaza nombres duplicados ignorando mayúsculas;
  - los buckets y las tablas de plano y fotos respetan la visibilidad;
  - ningún update o delete va sin `where`.
- **PGlite del script de limpieza:** las equivalencias, el aborto si falta un usuario y el conteo.
- **Unitarias** de lo puro: menú por rol, `puedeVerAperturas` y la barra de avance.
- **De cableado:**
  - las pantallas de responsable no piden `precio`, `orden_id` ni `factura_id`;
  - la ficha tiene Nombre, Descripción, Bitácora y Dividir;
  - la lista tiene la barra de avance.
- **Script `supabase/pruebas/…`** que termina en «PRUEBAS OK», con datos reales y revertido.

## Fuera de alcance

- Horarios y visitas recurrentes (HD-20).
- «Mis tareas» por sucursal (HD-25).
- Correo diario (HD-26).
- Crear los usuarios de Diego Michel, José Villa, Diego Barreto y Gaby: lo hace Sebastián con las invitaciones.
- Responsables múltiples por registro.

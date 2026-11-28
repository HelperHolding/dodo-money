# Aperturas: responsables, acceso por responsable, nombres, bitácora y división (HD-17/27/18) — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un catálogo de responsables con un responsable por registro y acceso restringido para cada responsable (solo lo suyo, sin dinero). También: nombre y descripción editables con historial, alta en un paso, bitácora, dividir registros y barra de avance.

**Architecture:**
- Una migración agrega el rol `aperturas`, el catálogo, las columnas, la bitácora y funciones de acceso `security definer`.
- RLS de las tablas `apertura_*` basada en `ve_item_apertura` y `ve_proyecto_apertura`.
- `actualizar_apertura_item` acota los campos por rol.
- La app decide la vista según si el usuario es responsable o tiene acceso completo.
- Un script aparte limpia los nombres existentes.

**Tech Stack:** Next.js 15.5, Supabase (Postgres, RLS, Storage), PGlite, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-27-aperturas-responsables-design.md`

## Global Constraints

- **Rama y commits.**
  - Rama `feat/aperturas-responsables` en `C:\Users\sebcm\Downloads\dodo-control-efectivo\wt-help-desk`.
  - PR hacia `main`; nunca commits a `main` ni push.
  - Los commits terminan con `Co-Authored-By: <tu modelo> <noreply@anthropic.com>`.
- **Acceso completo:**
  - `ve_compras()` (admin o corporativo) ve todo;
  - `edita_compras()` (admin) edita todo;
  - en la app, `puedeVerCompras` y `puedeEditarCompras`.
- **Acceso de responsable:**
  - cualquier perfil activo (por `mi_rol()`, que excluye inactivos y a quien debe cambiar contraseña) cuyo `apertura_responsables.perfil_id = auth.uid()` y `activo`;
  - ve solo los registros con su `responsable_id`;
  - edita solo `estado`, `inicio`, `fin`, `notas`, `evidencia` y la bitácora de esos registros;
  - nunca ve en pantalla `precio`, importes, `orden_id`, `factura_id`, presupuesto, CAPEX ni cotización.
- **SQL.**
  - Todo `update`/`delete` lleva `where`.
  - Funciones `security definer set search_path=''` con nombres `public.` calificados.
  - Migración en `begin; set local lock_timeout='5s'; … commit;`.
  - El `alter type … add value 'aperturas'` va en su propia migración previa (`20261127155000_rol_aperturas.sql`), porque el valor nuevo no puede usarse en la misma transacción.
  - Las políticas de admin y corporativo no se debilitan.
- **Historial.** Cada cambio en un registro queda en `apertura_historial` con `anterior` y `nuevo`.
- **Estilo.**
  - Pastel de la paleta Dodo, estilo Akton.
  - En celular, tarjetas.
  - Textos en español de México.
- **Pruebas.**
  - Cada archivo de prueba nuevo va en el script `test` de `package.json`.
  - Los stubs de PGlite copian las definiciones reales (`mi_rol`, `ve_compras`, `edita_compras`, enums y CHECK).
  - Los imports `.ts` en `lib/` llevan `// @ts-expect-error Node strip-types requiere extensión explícita.`

## Review Focus

1. **Fuga entre responsables.** Un responsable no ve registros, historial, marcas de plano, fotos ni bitácora de otro, ni por RLS ni por funciones `security definer` existentes que lean `apertura_*` (calendario, Gantt, tareas ligadas, `soporte_tickets_parecidos`, `cargarPresupuestoVivo`). Corresponde a las tareas 2 y 5.
2. **Escalada de edición.** Un responsable no puede cambiar precio, cantidad, nombre, responsable, orden ni factura llamando a la RPC directamente (Task 2).
3. **Admin y corporativo sin cambios.** Siguen viendo y editando como antes. Hay que correr las pruebas existentes de aperturas (Task 2).
4. **Rol `aperturas` sin registros.** No ve ninguna apertura y no se rompe al entrar (tareas 2 y 4).
5. **Dividir.** Es atómico: o se crean todas las partes o ninguna, y la original queda `no_aplica` con su evidencia (Task 2).

---

### Task 1: Rol, catálogo, columnas y sincronización

**Files:**
- Create: `supabase/migrations/20261127155000_rol_aperturas.sql`. Solo contiene `alter type public.rol_usuario add value if not exists 'aperturas';`. Revisa cómo lo hizo `20261109120000_correos_marketing.sql` con `marketing`.
- Create: `supabase/migrations/20261127160000_aperturas_responsables.sql`, con la parte de esquema:
  - tabla `apertura_responsables` según el spec, incluidos `unique(lower(btrim(nombre)))`, `perfil_id` único y `check(externo=(perfil_id is null))`; RLS con select para `authenticated`; sin DML directo;
  - columnas en `apertura_items`: `responsable_id`, `descripcion` y `origen_id`, con sus checks;
  - tabla `apertura_bitacora`. Sus políticas van en la Task 2;
  - `mi_responsable_id()`;
  - trigger de sincronización `responsable` ← nombre del catálogo, en `apertura_items` (al cambiar `responsable_id`) y en `apertura_responsables` (al cambiar `nombre`, con `update … where responsable_id = new.id`);
  - `guardar_responsable_apertura(p_id uuid, p_nombre text, p_perfil uuid, p_externo boolean, p_activo boolean) returns uuid`, solo `edita_compras()`.
- Create: `tests/aperturasResponsables.test.mjs`, que carga 0037 y las migraciones de aperturas que necesites, más las dos nuevas.
- Modify: `package.json`.

- [ ] **Step 1: Prueba que falla.**
  - el catálogo rechaza duplicados ignorando mayúsculas y espacios;
  - el check de externo contra perfil;
  - solo admin guarda en el catálogo;
  - el trigger sincroniza `responsable` al asignar `responsable_id` y al renombrar en el catálogo;
  - `mi_responsable_id()` devuelve el del usuario activo y null si está inactivo;
  - el rol `aperturas` existe en el enum.
- [ ] **Step 2: Run, que falle.**
- [ ] **Step 3: Implementa.**
- [ ] **Step 4: Run.** PASS. Luego `npm test` (resumen) y `npm run -s typecheck`.
- [ ] **Step 5: Commit** — `feat(aperturas): catálogo de responsables y rol aperturas (HD-27)`

---

### Task 2: Acceso por responsable, edición acotada, bitácora, alta completa y división

**Files:**
- Modify: `supabase/migrations/20261127160000_aperturas_responsables.sql`. Se agrega al final de la misma migración de la Task 1, porque todavía no se ha corrido en producción.
  - `ve_item_apertura(p_item)` y `ve_proyecto_apertura(p_proyecto)` según el spec.
  - Reemplaza las políticas de select de `apertura_items`, `apertura_proyectos`, `apertura_historial`, `apertura_planos`, `apertura_plano_marcas` y `apertura_item_dodo` por las del spec, y crea las de `apertura_bitacora`.
  - Lectura de los buckets `aperturas-planos` y `aperturas-fotos` con `ve_proyecto_apertura` del folder.
  - Haz `grep -rn "apertura_" supabase/migrations` para hallar **toda** función `security definer` que lea esas tablas. Ajusta las que expondrían registros ajenos a un responsable, o confirma con una prueba que exigen `ve_compras`/`edita_compras`.
  - `actualizar_apertura_item` (reemplaza la última versión; búscala):
    - admin puede cambiar todo, incluidos `nombre` (1–300 caracteres), `descripcion` y `responsable_id`;
    - un responsable que no es admin solo puede cambiar `estado`, `inicio`, `fin`, `notas` y `evidencia` de sus registros. Cualquier otra clave en `p_datos` lanza «Solo administración puede cambiar …»;
    - conserva la revisión, las validaciones actuales de estado y evidencia, y el historial.
  - `crear_apertura_item_completo(p_proyecto, p_tipo, p_etapa, p_categoria, p_nombre, p_descripcion, p_responsable, p_inicio, p_fin) returns uuid`, solo admin. Usa el mismo generador de clave que `agregar_apertura_item`.
  - `agregar_bitacora_apertura(p_item, p_fecha, p_avance, p_estatus, p_comentario) returns uuid`, para admin o el responsable del registro.
  - `dividir_apertura_item(p_item uuid, p_partes jsonb) returns text[]`, solo admin.
    - Acepta de 2 a 10 partes.
    - Es atómica.
    - Las partes nuevas llevan `origen_id`.
    - La original queda `no_aplica` con la evidencia «Dividida en …» y su historial.
- Modify: `tests/aperturasResponsables.test.mjs`. Cubre todos los casos de PGlite del spec:
  - visibilidad por rol y responsable, incluido el rol `aperturas` sin registros;
  - edición acotada: el responsable que intenta cambiar `precio` o `nombre` recibe error;
  - historial con nombre;
  - bitácora con permisos;
  - división atómica (una parte inválida no crea nada) y validación de 2 a 10 partes;
  - buckets y tablas de plano y fotos;
  - funciones `security definer` revisadas;
  - ningún update o delete sin `where`.
- Create: `supabase/pruebas/20261127160000_aperturas_responsables.sql`. Corre en producción y termina en «PRUEBAS OK».
  - Toma una apertura real y un admin.
  - Crea un responsable externo de prueba; crea un registro completo asignado a él; agrega una bitácora; divide el registro en 2 y verifica las claves y que la original queda `no_aplica`; renombra en el catálogo y verifica la sincronización.
  - Si existe un perfil activo no admin y no corporativo, pruébalo como responsable: ve solo su registro y no puede cambiar el precio.
- Modify: `package.json`, si cambias los archivos de prueba.

- [ ] **Step 1: Prueba que falla.** - [ ] **Step 2: Run.** - [ ] **Step 3: Implementa.**
- [ ] **Step 4: Run.** Corre la prueba nueva **y todas las pruebas existentes de aperturas, planos y fotos** (`tests/aperturas*.test.mjs`, `tests/aperturasPlanos.test.mjs`, `tests/aperturasFotos.test.mjs`), más `npm test` (resumen) y `npm run -s typecheck`.
- [ ] **Step 5: Commit** — `feat(aperturas): acceso por responsable, edición acotada, bitácora y división (HD-27, HD-17, HD-18)`

---

### Task 3: Script de limpieza de responsables

**Files:**
- Create: `supabase/correcciones/2026-11-27_responsables_aperturas.sql`, según la sección «Limpieza» del spec:
  - **Bloque 1, solo lectura:** conteo por texto con la propuesta de equivalencia.
  - **Bloque 2:** `begin; do $$ … $$; commit;`.
    - Las equivalencias van en un `values` editable.
    - Usuarios por `perfiles.nombre` exacto y activo. Si falta alguno, aborta y nombra cuál.
    - Crea en el catálogo los externos que falten: Diego Michel, José Villa, Diego Barreto, Gaby Landeros, César y Equipo marketing.
    - Asigna `responsable_id`.
    - Para los 2 textos compuestos, agrega a `notas` «UVIE: Julio Verdeja» y «TI: Sebastián», respectivamente.
    - Lleva `v_esperado integer := 0;`, editable, y aborta si es 0 o si no coincide con los registros con texto.
    - Al final verifica que ningún registro con `responsable` no vacío quedó sin `responsable_id`.
- Create: `tests/correccionResponsablesAperturas.test.mjs`, con PGlite:
  - equivalencias aplicadas, incluidos los compuestos;
  - aborto si falta un usuario;
  - aborto con esperado 0 o distinto;
  - idempotencia: una segunda corrida no duplica el catálogo.
- Modify: `package.json`.

- [ ] Steps: prueba que falla → implementa → run → commit `feat(aperturas): limpieza de responsables existentes (HD-27)`

---

### Task 4: Roles, menú y entrada a Aperturas

**Files:**
- Modify: `lib/roles.ts`.
  - `NOMBRE_ROL.aperturas = "Aperturas"`.
  - `puedeVerAperturasCompleto(rol)` = `puedeVerCompras(rol)`.
  - `menuLateral(rol, opciones?: { responsableApertura?: boolean })` muestra el enlace Aperturas si es completo, si el rol es `aperturas` o si es responsable.
  - El rol `aperturas` solo ve Inicio→Aperturas.
  - `accesosRapidos('aperturas')`.
  - Revisa cada lugar que llama a `menuLateral` y pásale la opción.
- Modify: `app/aperturas/layout.tsx`. Deja entrar si `puedeVerCompras`, si el rol es `aperturas` o si `mi_responsable_id()` no es null.
- **Inicio:** el rol `aperturas` aterriza en `/aperturas`. Revisa `app/(app)/page.tsx` o el inicio actual y su redirección por rol.
- **Invitaciones y administración de usuarios:** el rol `aperturas` aparece en el selector, con su descripción «Solo ve sus actividades de apertura». Revisa `app/administracion/usuarios` y las RPC de 0057/0058, que validan roles; si validan contra una lista, agrégalo en la migración de la Task 1 o 2.
- Modify: `lib/roles.test.ts` y las pruebas de menú que haya.

- [ ] Steps: prueba que falla → implementa → `npm test`, typecheck y build → commit `feat(aperturas): rol aperturas en menú, entrada e invitaciones (HD-27)`

---

### Task 5: Lista, detalle por responsable, alta en un paso y calendario

**Files:**
- Modify: `app/aperturas/page.tsx`. Lista las aperturas visibles con la **barra de avance** (`avanceApertura` de `lib/aperturas.ts`), las fechas y los días que faltan. Para un responsable, el avance es «Tu avance» y se calcula sobre sus registros.
- Modify: `app/aperturas/[id]/page.tsx`. Con `completo = puedeVerCompras(rol)`:
  - **Si no es completo:**
    - no carga ni muestra presupuesto, CAPEX, cotización, cronograma de compras, historial del proyecto ni `ImportarDodo`;
    - las consultas de items no seleccionan `precio`, `orden_id` ni `factura_id`; usa una lista de columnas segura;
    - muestra el aviso «Ves solo los registros a tu nombre»;
    - los KPIs se rotulan «Tu avance»;
    - las pestañas Checklist, Calendario, Actividades/Equipo y Plano quedan disponibles; Cotización no.
  - Revisa cada componente hijo que recibe items (ListaConceptos, Checklist, Calendario, Gantt, PlanoApertura) para que no pinte precio, OC ni factura cuando no es completo.
- **Alta en un paso:** el formulario «Agregar actividad, equipo o validación» pide nombre, descripción, tipo, etapa, categoría, responsable (selector del catálogo), inicio y fin, y llama a `crear_apertura_item_completo`. Solo admin.
- **Calendario y filtros de responsable:** usan `responsable_id` y el nombre del catálogo, con agrupación única. Revisa `lib/aperturasCalendario.ts` (`sugerenciasResponsable`) y `app/aperturas/Calendario.tsx`.
- Create: `tests/aperturasResponsablesVista.test.mjs`, de cableado:
  - la vista no completa no pide `precio`, `orden_id` ni `factura_id`;
  - la lista usa `avanceApertura`;
  - el alta llama a `crear_apertura_item_completo`;
  - el calendario agrupa por `responsable_id`.
- Modify: `package.json`.

- [ ] Steps: prueba que falla → implementa → `npm test`, typecheck y build → commit `feat(aperturas): vista por responsable, alta en un paso, avance y calendario (HD-27, HD-18)`

---

### Task 6: Ficha del registro y catálogo de responsables

**Files:**
- Modify: `app/aperturas/[id]/items/[item]/page.tsx` y `app/aperturas/acciones.ts`.
  - **Admin:**
    - campos «Nombre» y «Descripción»;
    - «Responsable» como selector del catálogo, más «+ Nuevo externo», que abre una ventana pequeña y llama a `guardar_responsable_apertura`;
    - botón **Dividir**, que abre una ventana con 2 a 10 filas (nombre, responsable, inicio y fin) y llama a `dividir_apertura_item`; al terminar redirige a la apertura con el aviso «Dividida en …».
  - **Responsable, no completo:**
    - solo estado, inicio, fin, notas y evidencia;
    - sin precio, importe, cantidad editable, orden, factura, «Origen y especificaciones» con precios, ni activo.
  - **Bitácora:** lista (las más recientes primero; fecha, avance, estatus, comentario y quién) y un formulario para admin o el responsable.
  - Ligas «Viene de {clave}» y «Dividida en …».
  - El historial muestra los cambios de nombre.
- Create: `app/aperturas/responsables/page.tsx` y sus acciones. Solo admin. Lista el catálogo con nombre, usuario ligado o «Externo», registros asignados y activo; permite agregar externos, ligar a un usuario (selector de perfiles activos sin ligar) y activar o desactivar. Agrega el enlace desde la lista de Aperturas, solo para admin.
- Modify: `tests/aperturasResponsablesVista.test.mjs`:
  - la ficha tiene Nombre, Descripción, Bitácora y Dividir;
  - la vista de responsable no muestra precio, OC ni factura;
  - la página del catálogo exige `puedeEditarCompras`.

- [ ] Steps: prueba que falla → implementa → `npm test`, typecheck y build → commit `feat(aperturas): ficha con nombre, bitácora y división; catálogo de responsables (HD-17, HD-18, HD-27)`

---

### Task 7: Verificación completa

- [ ] `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`: fail 0.
- [ ] `npm run -s typecheck && npm run -s build`: sin errores.

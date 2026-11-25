# Aperturas: plano con colores por etapa (HD-14) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pestaña «Plano» en cada apertura con hojas (equipo y obra), cada partida ubicada a mano una vez y coloreada por su etapa, con ficha, leyenda, filtros, zoom e impresión.

**Architecture:** Dos tablas (`apertura_planos`, `apertura_plano_marcas`), un bucket privado y RPCs `security definer`. Para los colores se reusan las funciones de puntos de HD-12. El navegador convierte el PDF a PNG con `pdfjs-dist` y sube directo al bucket; las políticas de Storage hacen cumplir los permisos. La vista es un componente cliente con las marcas posicionadas en %.

**Tech Stack:** Next.js 15.5, Supabase (Postgres, Storage, RLS), `pdfjs-dist` (dependencia nueva), PGlite, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-aperturas-plano-design.md`

## Global Constraints

- **Rama y commits.** Rama `feat/aperturas-plano` en el worktree `C:\Users\sebcm\Downloads\dodo-control-efectivo\wt-help-desk`; PR hacia `main`, nunca commits a `main` ni push. Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Permisos.** Ver: `ve_compras()`. Escribir: `edita_compras()`; en la app, `puedeEditarCompras(perfil.rol)`.
- **SQL.** Todo `update`/`delete` lleva `where`. Las funciones son `security definer set search_path=''`, con nombres `public.` calificados.
- **Marcas.** Coordenadas en fracción [0, 1] del ancho y el alto de la imagen. A lo más una marca por (hoja, partida). La partida y la hoja deben ser del mismo proyecto.
- **Colores.** Equipo/referencia por `puntosItem`: 0 gris, 0.25 amarillo, 0.5 azul, 0.75 morado, 1 verde. Actividad/técnico: 0 gris, 1/3 amarillo, 2/3 azul, 1 verde. `alerta` (contorno rojo) si `bloqueado` o vencido (fecha `fin ?? inicio` < hoy y `marcaItem !== 'listo'`). `porValidar` si el estado es `por_validar`. `noAplica` si es `no_aplica`.
- **Estilo.** Pastel de la paleta Dodo, nada llamativo. Los colores de las marcas usan las variables CSS existentes, o tonos pastel nuevos definidos en `app/globals.css`. Funciona en celular.
- **Bucket.** `aperturas-planos`, privado, 25 MB, tipos `application/pdf`, `image/png` e `image/jpeg`. Rutas `{proyecto_id}/{uuid}.{pdf|png|jpg}`.
- **Pruebas.** Cada archivo de prueba nuevo se agrega al script `test` de `package.json`. Los imports entre archivos de `lib/` que se prueban con node usan extensión `.ts` relativa con `// @ts-expect-error Node strip-types requiere extensión explícita.`

## Review Focus

1. **Seguridad de escritura.** Un usuario sin `edita_compras` no puede subir archivos, colocar marcas ni crear hojas, ni por RPC ni directo en Storage (Task 1).
2. **Marcas entre proyectos.** Una marca no puede ligar una partida de otro proyecto (Task 1).
3. **Reemplazar la hoja.** Subir una versión nueva conserva las marcas y exige la revisión vigente (Task 1).
4. **Clic con zoom.** Un clic con zoom ≠ 100 % debe guardar la coordenada correcta (Task 2, `aCoordenada`).
5. **Partidas no ubicadas.** No deben aparecer en la leyenda como si estuvieran en el plano. La leyenda cuenta solo las marcas de la hoja (Task 2).

---

### Task 1: Migración, bucket y pruebas PGlite

**Files:**
- Create: `supabase/migrations/20261125130000_aperturas_planos.sql`
- Create: `supabase/pruebas/20261125130000_aperturas_planos.sql`
- Create: `tests/aperturasPlanos.test.mjs`
- Modify: `package.json`

**Interfaces producidas:**
- Las tablas, el bucket y las funciones del spec, sección «Datos»:
  - `guardar_apertura_plano(p_proyecto uuid, p_hoja text, p_nombre text, p_version date, p_archivo text, p_imagen text, p_ancho integer, p_alto integer, p_revision integer) returns uuid`. Con `p_revision` null crea la hoja; si ya existe, exige `p_revision` igual a la revisión vigente y la incrementa.
  - `colocar_apertura_marca(p_plano uuid, p_item uuid, p_x numeric, p_y numeric) returns void`
  - `quitar_apertura_marca(p_plano uuid, p_item uuid) returns void`
  - `borrar_apertura_plano(p_plano uuid) returns table(archivo text, imagen text)`. Devuelve las rutas para que la app borre los archivos.

- [ ] **Step 1: Lee la base.**
  - Lee `supabase/migrations/0037_aperturas.sql`, sobre todo `ve_compras`/`edita_compras` y las políticas.
  - Lee el bloque del bucket `soporte` en `supabase/migrations/20261123120000_soporte.sql`, que es el patrón de bucket y políticas.
  - Lee cómo `tests/aperturasPorCerrar.test.mjs` y `tests/soporte.test.mjs` arman PGlite, incluido el stub de `storage`.

- [ ] **Step 2: Escribe la prueba que falla** (`tests/aperturasPlanos.test.mjs`). Debe verificar:
  1. Un admin crea la hoja «E01» y la lee; un usuario de operación no puede crearla («Solo administración…» o el mensaje que uses).
  2. `colocar_apertura_marca`:
     - inserta y luego actualiza (upsert);
     - rechaza x o y fuera de [0, 1];
     - rechaza una partida de otro proyecto.
  3. Al reemplazar la hoja con la revisión vigente se conservan las marcas y la revisión sube; con una revisión vieja se rechaza.
  4. `quitar_apertura_marca` y `borrar_apertura_plano`:
     - borrar la hoja borra sus marcas en cascada;
     - `borrar_apertura_plano` devuelve las rutas.
  5. RLS: `authenticated` no tiene insert, update ni delete directo en las dos tablas, y el select respeta `ve_compras()`.
  6. Bucket y políticas:
     - el bucket es privado y tiene su límite de tamaño y tipos;
     - el admin sube a `{proyecto}/x.png` y la operación no;
     - una ruta fuera de `{proyecto_id}/` se rechaza en `guardar_apertura_plano`.
  7. Ningún `update` ni `delete` va sin `where` (regex, como `tests/soporte.test.mjs`).
  8. El script de `supabase/pruebas` termina en «PRUEBAS OK».

- [ ] **Step 3: Run to verify it fails.**
- [ ] **Step 4: Escribe la migración** dentro de `begin; set local lock_timeout='5s'; … commit;`, siguiendo el spec.
- [ ] **Step 5: Escribe** `supabase/pruebas/20261125130000_aperturas_planos.sql`.
  - Es un bloque `do $$` que toma un admin activo sin cambio de contraseña pendiente y la primera apertura con una partida.
  - Crea la hoja «PRUEBA» con rutas `{proyecto}/…`, coloca una marca, reemplaza la hoja con la revisión vigente y verifica que la marca sigue.
  - Termina en `raise exception 'PRUEBAS OK'`.
- [ ] **Step 6: Agrega** la prueba al script `test` y corre `node --experimental-strip-types --test tests/aperturasPlanos.test.mjs`. Expected: PASS.
- [ ] **Step 7: Commit** — `feat(aperturas): tablas, bucket y funciones de planos por hoja (HD-14)`

---

### Task 2: Lógica pura del plano

**Files:**
- Create: `lib/aperturas/plano.ts`
- Create: `lib/aperturas/plano.test.ts`
- Modify: `package.json`

**Interfaces producidas** (de `lib/aperturas/plano.ts`):
- `type ColorMarca = 'gris'|'amarillo'|'azul'|'morado'|'verde'`
- `colorMarca(i: Pick<ItemApertura,'tipo'|'estado'|'inicio'|'fin'>, hoy: string): { color: ColorMarca; alerta: boolean; porValidar: boolean; noAplica: boolean }`
- `necesitaAtencion(i, hoy): boolean`: color gris o alerta o porValidar, y no noAplica.
- `conteoColores(items, hoy): Record<ColorMarca, number>`: excluye `no_aplica`.
- `aCoordenada(px: number, py: number, anchoMostrado: number, altoMostrado: number): { x: number; y: number }`: fracción recortada a [0, 1] y redondeada a 4 decimales. El llamador le pasa la posición del clic relativa a la imagen ya escalada.
- `ETIQUETA_COLOR: Record<ColorMarca, string>`: gris «Sin iniciar», amarillo «Cotizado», azul «Comprado / en curso», morado «Entregado», verde «Instalado / listo».

- [ ] **Step 1: Escribe la prueba que falla.** Debe cubrir:
  - colores de equipo en todos los estados;
  - actividad `en_curso` amarillo, `por_cerrar` azul y `completado` verde;
  - alerta por `bloqueado` y por vencido (y no si ya está listo);
  - `porValidar` y `noAplica`;
  - `necesitaAtencion`;
  - `conteoColores` excluye `no_aplica`;
  - `aCoordenada`: con zoom el resultado es la fracción correcta, recortada en los bordes y con 4 decimales.

  Importa `puntosItem` y `marcaItem` de `../aperturas.ts`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implementa** (corto: usa `puntosItem` y `marcaItem`).
- [ ] **Step 4: Run.** `node --experimental-strip-types --test lib/aperturas/plano.test.ts && npm run -s typecheck`
- [ ] **Step 5: Commit** — `feat(aperturas): colores por etapa y coordenadas del plano (HD-14)`

---

### Task 3: Pestaña «Plano»: subir, ver, ubicar, ficha

**Files** (léelos antes de cambiar):
- Modify: `app/aperturas/AktonProyecto.tsx`. Agrega `['plano','Plano']` a `VISTAS`.
- Modify: `app/aperturas/[id]/page.tsx`. Agrega `'plano'` a las vistas válidas. Con `vista==='plano'`:
  - carga las hojas del proyecto (`apertura_planos`, ordenadas por `hoja`) y la hoja activa (`?hoja=`, por defecto la primera);
  - carga sus marcas;
  - pide una URL firmada de 1 h para la imagen;
  - pinta `<PlanoApertura>`.
- Create: `app/aperturas/plano/PlanoApertura.tsx` (cliente):
  - **Pestañas de hojas.** Con edición, el botón «Agregar hoja» abre `SubirPlano`.
  - **Encabezado.** «{hoja} · {nombre} · versión {dd/mm/aaaa}» y el botón «Reemplazar archivo» (con edición).
  - **Marco del plano.** Desplazable, con zoom de 50 % a 400 % (botones − / + / 100 %). La imagen va con ancho = `ancho×zoom` y las marcas en posición absoluta `left: x%`, `top: y%`. El círculo de la marca mide 18 px y no se escala con el zoom. Lleva:
    - el color de `colorMarca`;
    - contorno rojo si hay `alerta`;
    - «?» si está `porValidar`;
    - tachado y atenuado si es `noAplica`;
    - `title` con la clave y el nombre.
  - **Leyenda.** Los 5 colores con su conteo (`conteoColores` de las partidas que tienen marca en la hoja). Al dar clic en un color se resaltan solo esos y se atenúan los demás; al volver a dar clic se quita el resalte.
  - **Filtros.** Casilla «Necesita mi atención» (`necesitaAtencion`) y selector de responsable (los distintos `responsable` de las partidas marcadas). Las marcas que no pasan el filtro se ocultan.
  - **Ficha al dar clic** (panel lateral o `<dialog>`, consistente con el checklist):
    - datos: nombre, clave, `nombreEstado`, cantidad/recibido, precio, responsable, fecha, notas;
    - ligas a `/compras/ordenes/{orden_id}`, a `/compras/facturas/{factura_id}` y a la ficha `/aperturas/{id}/items/{item}`;
    - con edición, el botón «Cambiar etapa» abre la ventana de cambio de estado del checklist. Extráela de `ChecklistEditable.tsx` a un componente compartido, por ejemplo `app/aperturas/VentanaEstado.tsx`, sin cambiar su comportamiento, y úsala en los dos lugares. Al guardar, el color se actualiza sin recargar.
  - **Modo «Ubicar»** (solo con edición):
    - un panel lista las partidas del proyecto que aún no tienen marca en la hoja (`equipo`, `referencia` y las que tienen `categoria`), con búsqueda por clave o nombre;
    - se elige una y el clic en la imagen llama a `colocar_apertura_marca` con `aCoordenada`;
    - las marcas existentes se arrastran (pointer events; al soltar se guarda la posición) y se quitan con «Quitar del plano» en la ficha;
    - fuera de este modo, las marcas no se arrastran.
  - **Botón «Imprimir / PDF»** (`window.print()`). El CSS `@media print` oculta todo menos la hoja, sus marcas y la leyenda, a ancho de página.
- Create: `app/aperturas/plano/SubirPlano.tsx` (cliente):
  - campos: hoja (clave), nombre, fecha de versión (hoy por defecto) y archivo (PDF, PNG o JPG, ≤ 25 MB);
  - si es PDF, carga `pdfjs-dist` de forma dinámica (`await import('pdfjs-dist')`), configura su worker según la documentación de la versión instalada y dibuja la página 1 en un canvas con escala para un ancho de ~3000 px como máximo; obtiene el PNG (`canvas.toBlob`);
  - sube el original y la imagen directo al bucket con el cliente de Supabase del navegador. Busca el helper existente, por ejemplo `lib/supabase/client.ts`. Si no hay cliente de navegador, súbelos con una acción de servidor y avisa si pasan de 5 MB (el límite de `next.config`). Repórtalo.
  - las rutas son `{proyecto}/{uuid}.pdf` y `{proyecto}/{uuid}.png`;
  - luego llama a la acción de servidor `guardarPlano`, que llama a `guardar_apertura_plano` con el ancho y el alto de la imagen;
  - si falla la RPC, borra los archivos recién subidos.
- Create: `app/aperturas/plano/acciones.ts` (`"use server"`):
  - `guardarPlano`;
  - `colocarMarca` y `quitarMarca`, que responden `{error}` o `{ok}` sin redirigir, como `cambiarEstado.ts`;
  - `borrarPlano`, que borra las filas y luego los archivos.
  - Todas validan `puedeEditarCompras`.
- Modify: `package.json`. Agrega `pdfjs-dist` (versión estable reciente compatible con el navegador). Corre `npm install` y confirma que `npm run build` compila.
- Modify: `app/globals.css`. Estilos del plano (marco, marcas pastel, leyenda, panel) y `@media print`.
- Create: `tests/aperturasPlanoVista.test.mjs`, con pruebas por lectura de fuente:
  - `VISTAS` incluye `'plano'` y la página pinta `<PlanoApertura` con `vista==='plano'`;
  - `PlanoApertura` usa `colorMarca(`, `conteoColores(`, `necesitaAtencion(`, `aCoordenada(`, `colocarMarca` y `window.print()`;
  - `SubirPlano` usa `import('pdfjs-dist')` y la ruta `${proyecto}/`;
  - `ChecklistEditable` y `PlanoApertura` usan el mismo componente de ventana de estado;
  - las acciones validan `puedeEditarCompras`.
- Modify: `package.json`. Agrega la prueba al script `test`.

- [ ] **Step 1: Escribe la prueba de cableado y verifica que falla.**
- [ ] **Step 2: Implementa.**
- [ ] **Step 3: Run.** `node --experimental-strip-types --test tests/aperturasPlanoVista.test.mjs tests/aperturasEtapasVista.test.mjs && npm run -s typecheck && npm run -s build 2>&1 | grep -E "aperturas|Failed|rror"`. Expected: PASS y build sin errores.
- [ ] **Step 4: Commit** — `feat(aperturas): pestaña Plano con hojas, marcas por etapa, ficha, ubicar e impresión (HD-14)`

---

### Task 4: Verificación completa

- [ ] `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`: fail 0.
- [ ] `npm run -s typecheck && npm run -s build`: sin errores.
- [ ] Commit de correcciones si hubo.

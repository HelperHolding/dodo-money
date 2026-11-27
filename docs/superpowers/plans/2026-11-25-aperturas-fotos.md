# Aperturas: foto y ficha Dodo de cada equipo (HD-16) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada partida de equipo con su foto del proyecto, tomada de las matrices de Dodo, y su foto real, visibles en la lista, la ficha y el plano. También una solicitud de cotización imprimible con foto.

**Architecture:**
- Una tabla `apertura_item_dodo`, un bucket privado y dos RPC `security definer`.
- El navegador lee los .xlsx de las matrices con `fflate`, cruza cada código con `apertura_items.original.codigo`, reduce las fotos con canvas y las sube directo al bucket. Una acción de servidor registra el resultado.
- El modelo, los kW y la cantidad se siguen leyendo de `original`.

**Tech Stack:** Next.js 15.5, Supabase (Postgres, Storage, RLS), `fflate` 0.8.2 (dependencia nueva), PGlite, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-aperturas-fotos-design.md`

## Global Constraints

- **Rama y commits.**
  - Rama `feat/aperturas-fotos` en el worktree `C:\Users\sebcm\Downloads\dodo-control-efectivo\wt-help-desk`; PR hacia `main`.
  - Nunca commits a `main` ni push.
  - Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Permisos.** Ver: `ve_compras()`. Escribir: `edita_compras()`; en la app, `puedeEditarCompras(perfil.rol)`.
- **SQL.**
  - Todo `update`/`delete` lleva `where`.
  - Las funciones son `security definer set search_path=''`, con nombres `public.` calificados.
  - La migración va en `begin; set local lock_timeout='5s'; … commit;`.
- **Bucket.**
  - `aperturas-fotos`, privado, 5 MB, tipos `image/png`, `image/jpeg` e `image/webp`.
  - Rutas `{proyecto_id}/{uuid}.{png|jpg|webp}`.
  - Mismo patrón de políticas que `aperturas-planos` en `supabase/migrations/20261125130000_aperturas_planos.sql`.
- **Código Dodo.** El de cada partida es `apertura_items.original.codigo` (texto; «-» o vacío = sin código). Para normalizar: quitar espacios, cambiar la «С» cirílica (U+0421) por «C» latina y pasar a mayúsculas.
- **Matriz por prefijo:**

  | Prefijo | Matriz |
  |---|---|
  | `D.` | `digital` |
  | `F`, `FN.`, `FOK.` | `mobiliario` |
  | `N.` | `neutral` |
  | `E.` | `proceso` |
  | `INV.` | `herramientas` |
  | otro | `null` |

- **Foto mostrada.** La real si existe; si no, la del proyecto; si no hay ninguna, un cuadro gris vacío.
- **Estilo.**
  - Pastel de la paleta Dodo, nada llamativo.
  - Funciona en celular.
  - Textos en español de México.
- **Pruebas.**
  - Cada archivo de prueba nuevo se agrega al script `test` de `package.json`.
  - Los imports entre archivos de `lib/` probados con node usan extensión `.ts` con `// @ts-expect-error Node strip-types requiere extensión explícita.`

## Review Focus

1. **Reimportar no borra la foto real.** El importador nunca toca `foto_real`, aunque la partida ya tenga fila (Task 1).
2. **Escritura sin permiso.** Un usuario sin `edita_compras` no sube fotos ni importa, ni por RPC ni directo en Storage (Task 1).
3. **Partida de otro proyecto.** `importar_apertura_dodo` rechaza un `item_id` que no sea del proyecto (Task 1).
4. **Ancla de imagen en otra columna o en el encabezado.** La foto de un código es solo la anclada en la columna «Picture/Фотография» de su mismo renglón. Una imagen en otra columna, o en el renglón del encabezado, no se liga (Task 2).
5. **Códigos con espacios o «С» cirílica.** `"С .50.0-01"` y `"C.50.0-01"` deben coincidir (Task 2).

---

### Task 1: Migración, bucket y pruebas PGlite

**Files:**
- Create: `supabase/migrations/20261125140000_aperturas_fotos.sql`
- Create: `supabase/pruebas/20261125140000_aperturas_fotos.sql`
- Create: `tests/aperturasFotos.test.mjs`
- Modify: `package.json`

**Interfaces producidas** (detalle en el spec, sección «Datos»):
- Tabla `public.apertura_item_dodo`:
  - `item_id uuid pk references apertura_items(id) on delete cascade`;
  - `proyecto_id uuid not null references apertura_proyectos(id)`;
  - `codigo text check(length<=60)`;
  - `matriz text check(matriz in ('digital','mobiliario','neutral','proceso','herramientas'))`;
  - `matriz_url text check(matriz_url ~ '^https://docs\.google\.com/' and length<=500)`;
  - `sustituto text check(length<=2000)`;
  - `foto_proyecto text`, `foto_real text`;
  - `foto_real_por uuid`, `foto_real_en timestamptz`;
  - `importado_en timestamptz not null default now()`.
- `importar_apertura_dodo(p_proyecto uuid, p_filas jsonb) returns table(ligadas integer, con_foto integer, fotos_anteriores text[])`:
  - cada fila es `{item_id, codigo, matriz, matriz_url, sustituto, foto}`, y son a lo más 400;
  - cada partida debe ser del proyecto;
  - hace upsert por `item_id` sin tocar `foto_real*`;
  - `foto` null conserva la `foto_proyecto` anterior;
  - si `foto` viene, debe empezar con `{p_proyecto}/` y existir en `storage.objects` del bucket;
  - `fotos_anteriores` son las `foto_proyecto` reemplazadas por otra distinta.
- `guardar_foto_real(p_item uuid, p_ruta text) returns text`:
  - devuelve la ruta anterior, o null;
  - con `p_ruta` null quita la foto;
  - si no existe la fila, la crea con `proyecto_id` de la partida;
  - pone `foto_real_por=auth.uid()` y `foto_real_en=now()`;
  - valida ruta y existencia igual que arriba.
- Bucket `aperturas-fotos` y políticas `fotos_leer`, `fotos_subir` y `fotos_borrar` sobre `storage.objects`.

- [ ] **Step 1: Lee la base.**
  - `supabase/migrations/20261125130000_aperturas_planos.sql`, que es el patrón completo de tablas, RPC y bucket.
  - `tests/aperturasPlanos.test.mjs`, que tiene los stubs de PGlite (auth, storage, perfiles, `ve_compras`/`edita_compras`) y carga `0037_aperturas.sql` y `supabase/cargas/0037_dodo_2.sql`.
  - `supabase/pruebas/20261125130000_aperturas_planos.sql`.
- [ ] **Step 2: Escribe la prueba que falla** en `tests/aperturasFotos.test.mjs`, copiando el `BASE` y `preparar` de `aperturasPlanos.test.mjs` y agregando la nueva migración. Debe verificar:
  1. **Importación:**
     - el admin importa 2 filas, una con foto y otra sin foto, y recibe `ligadas=2, con_foto=1`;
     - operación y corporativo reciben un error «Solo administración…».
  2. **Datos inválidos:**
     - un `item_id` de otro proyecto se rechaza;
     - más de 400 filas se rechazan;
     - una `foto` fuera de `{proyecto}/` o que no existe en el bucket se rechaza;
     - una `matriz_url` que no es de `docs.google.com` se rechaza.
  3. **Reimportar:**
     - conserva `foto_real`;
     - `foto: null` conserva la `foto_proyecto`;
     - una foto distinta reemplaza la anterior y la devuelve en `fotos_anteriores`.
  4. **`guardar_foto_real`:**
     - crea la fila si no existía;
     - reemplaza y devuelve la ruta anterior;
     - con null la quita;
     - nunca cambia `foto_proyecto`.
  5. **RLS:** `authenticated` no tiene DML directo y el select respeta `ve_compras()`.
  6. **Bucket:**
     - privado, 5 MB y tipos correctos;
     - el admin sube a `{proyecto}/{uuid}.jpg` y la operación no;
     - una ruta con proyecto inexistente se rechaza.
  7. Borrar la partida borra su fila en cascada.
  8. Ningún `update`/`delete` va sin `where` (regex, como en `aperturasPlanos.test.mjs`).
  9. El script de `supabase/pruebas` termina en «PRUEBAS OK».
- [ ] **Step 3: Run to verify it fails.** `node --experimental-strip-types --test tests/aperturasFotos.test.mjs`
- [ ] **Step 4: Escribe la migración** siguiendo el spec y las interfaces.
- [ ] **Step 5: Escribe** `supabase/pruebas/20261125140000_aperturas_fotos.sql`.
  - Es un bloque `do $$`:
    - toma un admin activo sin cambio de contraseña pendiente y dos partidas `equipo` del mismo proyecto;
    - inserta 3 objetos en `storage.objects` del bucket;
    - importa las dos partidas, una con foto;
    - pone una foto real;
    - reimporta con otra foto del proyecto;
    - verifica que la foto real sigue y que la foto anterior vino en `fotos_anteriores`.
  - Termina en `raise exception 'PRUEBAS OK — …'`.
- [ ] **Step 6: Agrega** la prueba al script `test` y córrela. Expected: PASS.
- [ ] **Step 7: Commit** — `feat(aperturas): tabla, bucket y funciones de fotos Dodo por partida (HD-16)`

---

### Task 2: Lectura de matrices (lógica pura)

**Files:**
- Create: `lib/aperturas/matrizDodo.ts`
- Create: `lib/aperturas/matrizDodo.test.ts`
- Modify: `package.json`. Agrega `"fflate": "0.8.2"` a `dependencies`, corre `npm install` y agrega la prueba al script `test`.

**Interfaces producidas:**
- `normalizarCodigo(c: string): string`
- `matrizDeCodigo(c: string): 'digital'|'mobiliario'|'neutral'|'proceso'|'herramientas'|null`
- `codigoDeItem(original: Record<string, unknown>): string|null`: el `codigo` normalizado; null si no es texto, está vacío o es «-».
- `type EntradaMatriz = { foto: string|null; sustituto: string|null; hoja: string }`. `foto` es la ruta interna del zip, por ejemplo `xl/media/image12.png`.
- `leerMatriz(archivos: Record<string, Uint8Array>): { entradas: Map<string, EntradaMatriz>; hojasSinCodigo: string[] }`
  - `archivos` es el resultado de `unzipSync` de fflate.
  - Lee `xl/workbook.xml` y `xl/_rels/workbook.xml.rels` (nombre de hoja → archivo), `xl/sharedStrings.xml` (texto de `<si>`, uniendo sus `<t>`) y cada hoja.
  - En cada hoja busca, entre los primeros 10 renglones, el encabezado:
    - **código:** columna cuyo texto contiene «Article No», «Item #» o «Артикул»;
    - **foto:** columna que contiene «Picture» o «Фотография»/«Изображение»;
    - **sustituto (opcional):** columna que contiene «замен» o «substitut».
  - Una hoja sin columna de código va a `hojasSinCodigo`.
  - El drawing de la hoja sale de `xl/worksheets/_rels/sheetN.xml.rels` (Target `../drawings/drawingM.xml`). Sus imágenes vienen de `xl/drawings/_rels/drawingM.xml.rels` (rId → `../media/x`).
  - Por cada `oneCellAnchor` o `twoCellAnchor`, el ancla es `xdr:from` (`col`, `row` en base 0) y la imagen es el `r:embed` del `a:blip`.
  - Una imagen se liga al código del renglón `row+1` solo si `col` es la columna de foto y el renglón está después del encabezado.
  - Si un código aparece varias veces, gana la primera entrada con foto; si ninguna tiene foto, la primera.

- [ ] **Step 1: Escribe la prueba que falla** (`lib/aperturas/matrizDodo.test.ts`). Arma un .xlsx mínimo en memoria con `zipSync` de fflate: workbook con 2 hojas, sharedStrings, drawings y rels.
  - **Hoja 1:** encabezado en el renglón 1 (`Артикул\nArticle No.` | `Фотография\nPicture` | `Наличие согласованной замены`).
    - Renglón 3: `D.15.2-01` con imagen anclada en col 1, row 2, y sustituto «Samsung QM32C».
    - Renglón 4: `С .50.0-01` (С cirílica y espacio) con imagen.
    - Renglón 5: `E.40.0-01` con una imagen anclada en la **col 3**, que no es la de foto. Debe quedar `foto: null`.
    - Una imagen anclada en el renglón del encabezado no se liga.
  - **Hoja 2:** sin columna de código, va a `hojasSinCodigo`.
  - Verifica también:
    - `normalizarCodigo('С .50.0-01')==='C.50.0-01'`;
    - `matrizDeCodigo` para los 5 prefijos y para uno desconocido;
    - `codigoDeItem({codigo:'-'})===null`;
    - el duplicado: la primera entrada con foto gana.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implementa** con regex sobre el XML; no agregues un parser XML. Importa `strFromU8` de fflate para decodificar.
- [ ] **Step 4: Run.** `node --experimental-strip-types --test lib/aperturas/matrizDodo.test.ts && npm run -s typecheck`
- [ ] **Step 5: Prueba con las matrices reales** (no se commitea).
  - Corre un script en el scratchpad que lea `C:\Users\sebcm\Downloads\Цифровое оборудование_матрица _ Digital equipment.xlsx` y `…\Матрица мебели _ Furniture (ред. 19.11.2026).xlsx` con `unzipSync` y `leerMatriz`.
  - Verifica que `D.15.2-01` y `FN.DXB.00_DC.1.1.1` tengan foto.
  - Reporta cuántas entradas con foto hay por archivo.
- [ ] **Step 6: Commit** — `feat(aperturas): lectura de fotos y sustitutos de las matrices de Dodo (HD-16)`

---

### Task 3: Importador, foto real y acciones

**Files** (lee antes `app/aperturas/plano/SubirPlano.tsx` y `app/aperturas/plano/acciones.ts`, que son el patrón de subida directa y acciones):
- Create: `app/aperturas/fotos/acciones.ts` (`"use server"`). Responden `{error}` o `{ok,…}` sin redirigir, y todas validan `puedeEditarCompras`.
  - `importarDodo(proyecto: string, filas: FilaImportar[]): Promise<{error:string}|{ok:true; ligadas:number; conFoto:number; aviso?:string}>`
    - llama a la RPC;
    - borra del bucket las `fotos_anteriores`;
    - hace `revalidatePath`.
  - `guardarFotoReal(proyecto: string, item: string, ruta: string|null)`: llama a la RPC y borra la ruta anterior del bucket.
  - `urlsFotos(rutas: string[]): Promise<Record<string,string>>`: helper de servidor, no acción, para usar en páginas.
    - va en `app/aperturas/fotos/urls.ts`;
    - usa `createSignedUrls` de 1 h en lote;
    - si falla, devuelve `{}` y las fotos no se muestran, sin romper la página.
- Create: `app/aperturas/fotos/ImportarDodo.tsx` (cliente). Recibe `proyecto` y `partidas: {id, clave, nombre, codigo: string|null}[]`; los `codigo` ya vienen normalizados por `codigoDeItem` desde el servidor.
  - Botón «Importar de Dodo» que abre un `<dialog>`.
  - **Paso 1:** `<input type=file multiple accept=".xlsx">` y, por cada archivo elegido, un campo opcional «Liga de Google Sheets».
  - **Paso 2: «Procesar».**
    - Por archivo: `unzipSync(new Uint8Array(await f.arrayBuffer()))` con fflate cargado con `await import('fflate')` y `leerMatriz`.
    - Une las entradas: gana la primera matriz que tenga foto.
    - Por cada partida con código encontrado:
      - toma los bytes de la foto;
      - la dibuja en un canvas a 800 px de lado mayor como máximo (`createImageBitmap`);
      - la exporta como `image/jpeg` con calidad 0.85;
      - la sube a `{proyecto}/{crypto.randomUUID()}.jpg` con `clienteNavegador().storage.from('aperturas-fotos').upload`.
    - Hace 4 subidas en paralelo como máximo y muestra el progreso «Subiendo 23 de 88».
  - **Paso 3: Resumen.**
    - Muestra ligadas, con foto, y la lista «Sin foto en las matrices cargadas» con clave, nombre, código y la matriz que falta por prefijo.
    - «Guardar» llama a `importarDodo` en tandas de 400 con `matriz_url` = la liga del archivo donde se encontró, o null.
    - Si falla, borra las fotos recién subidas.
- Create: `app/aperturas/fotos/FotoReal.tsx` (cliente), para la ficha.
  - Botones «Subir foto real», «Cambiar» y «Quitar».
  - Acepta imagen ≤ 5 MB; la reduce a 1600 px y la sube como JPEG.
  - Llama a `guardarFotoReal`. Si la acción falla, borra la recién subida. Al terminar, `router.refresh()`.
- Modify: `app/aperturas/[id]/page.tsx`. Con `vista==='compras'` y `puedeEditarCompras`, pinta `<ImportarDodo>` arriba de la lista con las partidas `equipo`/`referencia` y su `codigoDeItem(i.original)`.
- Modify: `app/globals.css`. Estilos del diálogo y del resumen.
- Create: `tests/aperturasFotosVista.test.mjs`, con pruebas por lectura de fuente:
  - `ImportarDodo` usa `import('fflate')`, `leerMatriz(`, `aperturas-fotos` y `${proyecto}/`;
  - las acciones validan `puedeEditarCompras` y llaman a `importar_apertura_dodo` y `guardar_foto_real`;
  - `page.tsx` pinta `<ImportarDodo` solo con `puedeEditarCompras`.
- Modify: `package.json`. Agrega la prueba.

- [ ] **Step 1: Escribe la prueba de cableado y verifica que falla.**
- [ ] **Step 2: Implementa.**
- [ ] **Step 3: Run.** `node --experimental-strip-types --test tests/aperturasFotosVista.test.mjs && npm run -s typecheck && npm run -s build 2>&1 | grep -E "aperturas|Failed|rror"`. Expected: PASS y build sin errores.
- [ ] **Step 4: Commit** — `feat(aperturas): importador de fotos de Dodo y foto real (HD-16)`

---

### Task 4: Fotos en la lista, la ficha y el plano

**Files:**
- Modify: `app/aperturas/[id]/page.tsx`.
  - Con `vista==='compras'` o `vista==='plano'`, lee `apertura_item_dodo` del proyecto (select `item_id,codigo,matriz_url,sustituto,foto_proyecto,foto_real`). Si la tabla no existe o falla, sigue sin fotos.
  - Calcula la ruta mostrada por partida (real ?? proyecto) y pide las URL firmadas con `urlsFotos`, solo de las partidas visibles en compras o de las partidas con marca en la hoja activa del plano.
  - Pasa `fotos: Record<itemId, string>` a `ListaConceptos` y `PlanoApertura`.
- Modify: `app/aperturas/ListaConceptos.tsx`.
  - Prop opcional `fotos?: Record<string,string>`.
  - Si viene, la celda «Concepto» lleva a la izquierda una miniatura de 40×40 (`object-fit: contain`, fondo pastel, borde suave, `loading="lazy"`, `alt` = nombre), o el cuadro gris si no hay foto.
  - Sin la prop, la lista queda igual que hoy (otras vistas).
- Modify: `app/aperturas/[id]/items/[item]/page.tsx`. Si la partida es `equipo`/`referencia`, agrega antes de «Seguimiento» la sección «Foto»:
  - foto del proyecto y foto real lado a lado (máx. 320 px de alto), cada una con su rótulo, o «Sin foto»;
  - debajo, «Sustituto verificado por Dodo» y la liga «Abrir matriz de Dodo» (`target="_blank" rel="noreferrer"`) si existen;
  - con edición, `<FotoReal>`;
  - si la consulta falla, la sección no aparece.
- Modify: `app/aperturas/plano/PlanoApertura.tsx`. Prop opcional `fotos`; la ficha de la marca muestra la miniatura de 96 px arriba del nombre.
- Modify: `app/globals.css`. Estilos de miniatura, sección de foto y su versión para celular.
- Modify: `tests/aperturasFotosVista.test.mjs`. Agrega:
  - `ListaConceptos` pinta `<img` con `fotos[`;
  - la ficha usa `FotoReal` y `Abrir matriz de Dodo`;
  - `PlanoApertura` usa `fotos`;
  - `page.tsx` llama a `urlsFotos(`.

- [ ] **Step 1: Agrega las pruebas de cableado y verifica que fallan.**
- [ ] **Step 2: Implementa.**
- [ ] **Step 3: Run.** `node --experimental-strip-types --test tests/aperturasFotosVista.test.mjs tests/aperturasPlanoVista.test.mjs tests/aperturasEtapasVista.test.mjs && npm run -s typecheck && npm run -s build 2>&1 | grep -E "aperturas|Failed|rror"`
- [ ] **Step 4: Commit** — `feat(aperturas): fotos en Equipo y compras, ficha y plano (HD-16)`

---

### Task 5: Solicitud de cotización imprimible

**Files:**
- Modify: `app/aperturas/ListaConceptos.tsx`.
  - Prop opcional `cotizar?: string`, la URL base de la cotización.
  - Si viene, la tabla queda dentro de `<form method="get" action={cotizar}>`.
  - Cada renglón `equipo`/`referencia` lleva una casilla `<input type="checkbox" name="items" value={i.id}>` con `aria-label` «Incluir {clave}».
  - Arriba y abajo de la tabla va el botón «Solicitud de cotización» (`type="submit"`).
  - No usa JavaScript.
- Modify: `app/aperturas/[id]/page.tsx`. En `vista==='compras'` pasa `cotizar={`/aperturas/${id}/cotizacion`}`.
- Create: `app/aperturas/[id]/cotizacion/page.tsx` (servidor).
  - Lee `searchParams.items`, que puede venir como string o arreglo. Filtra los uuid válidos y toma 150 como máximo.
  - Consulta el proyecto, las partidas (`in('id', ids).eq('proyecto_id', id)`, ordenadas por clave) y `apertura_item_dodo`, y pide las URL firmadas de las fotos.
  - Sin partidas válidas muestra «Elige al menos una partida en Equipo y compras» con liga de regreso.
  - **Encabezado imprimible:** «Solicitud de cotización · {sucursal}», la fecha de hoy (`hoyCalendarioMX`, `fechaTexto`) y «Dodo Pizza México».
  - **Tabla con:**
    - #, foto (80 px) y clave;
    - concepto (`nombre`);
    - código, descripción o modelo, medidas y kW, desde `original.codigo`, `original.descripcion`, `original.medidas` y `original.potencia`; «—» si falta;
    - cantidad: `cantidad ?? original.cantidad`, con su unidad;
    - columnas vacías «Precio unitario» y «Tiempo de entrega».
  - Al pie: «Precios sin IVA. Indicar vigencia de la cotización y condiciones de pago.»
  - Botones «Imprimir / PDF» (`window.print()`, en un pequeño componente cliente) y «Volver».
  - Acceso: `ve_compras` por RLS; la página no exige edición.
- Modify: `app/globals.css`. `@media print` con `@page { size: letter landscape; margin: 10mm }`: oculta el menú, los botones y el resto de la app, y no parte renglones entre páginas (`break-inside: avoid`).
- Modify: `tests/aperturasFotosVista.test.mjs`. Agrega:
  - `ListaConceptos` usa `name="items"` y `method="get"`;
  - la página de cotización existe, limita a 150, usa `window.print` y pinta «Precio unitario» y «Tiempo de entrega»;
  - `globals.css` tiene `size: letter landscape`.

- [ ] **Step 1: Agrega las pruebas y verifica que fallan.**
- [ ] **Step 2: Implementa.**
- [ ] **Step 3: Run.** `node --experimental-strip-types --test tests/aperturasFotosVista.test.mjs && npm run -s typecheck && npm run -s build 2>&1 | grep -E "aperturas|Failed|rror"`
- [ ] **Step 4: Commit** — `feat(aperturas): solicitud de cotización imprimible con fotos (HD-16)`

---

### Task 6: Verificación completa

- [ ] `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`: fail 0.
- [ ] `npm run -s typecheck && npm run -s build`: sin errores.
- [ ] Commit de correcciones si hubo.

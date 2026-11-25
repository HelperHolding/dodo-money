# Aperturas: foto y ficha Dodo de cada equipo (HD-16) — diseño

Fecha: 2026-11-25 · Ticket: HD-16 (Julio, con sus aclaraciones del 25-nov) · Responsable: Sebastián

## Objetivo

Ver de un vistazo cómo es cada equipo sin abrir el PDF del proyecto ni la matriz de Dodo, y mandar a los proveedores solicitudes de cotización con foto.

## Hallazgos que fijan el diseño

- **La hoja E02 del set de planos** («Equipment schedule») trae, por número de plano:
  - nombre, descripción o modelo, potencia en kW, cantidad y código Dodo (por ejemplo `66 · Wall-mounted scales · Cas PB-30 · 0.01 · 1 · E.40.0-01`);
  - el número N del E02 es la partida `PL-0NN` (equipo 1–88), igual que en HD-14;
  - la tabla de mobiliario (1–11) es `PL-089`…`PL-099`;
  - en López Mateos hay 110 renglones y 88 traen código. Los demás traen `-`.
- **El prefijo del código dice en qué matriz está:**

  | Prefijo | Matriz |
  |---|---|
  | `D` | Digital equipment |
  | `F`, `FN`, `FOK` | Furniture |
  | `N` | Neutral equipment (IMF) |
  | `E` | Process equipment (IMF) |
  | `Inv` | Production tools (IMF) |

- **Las matrices descargadas como .xlsx traen las fotos** como imágenes ancladas a una celda (`xl/drawings/drawingN.xml`, `oneCellAnchor`/`twoCellAnchor` con `from.col` y `from.row`) dentro de `xl/media/`.
  - Cada hoja útil tiene un encabezado con una columna de código («Артикул / Article No.» o «Item #») y una columna «Picture» o «Фотография».
  - La foto de un código es la imagen anclada en la columna de foto del mismo renglón.
  - Comprobado en López Mateos: Digital coincide en 7 de 7 códigos y Furniture en 8 de 9.
- **Tamaño:** la matriz de mobiliario pesa unos 50 MB. Vercel acepta como máximo unos 4.5 MB por petición, así que los archivos no pueden pasar por el servidor de la app.

## Decisiones tomadas

- **Importador en el navegador** («Importar de Dodo», en cada apertura), para que sirva igual en Serviplaza, Belisario y Tec.
  - El navegador lee el PDF del set y los .xlsx de las matrices.
  - Solo se suben las fotos de los códigos que se usan, cada una de menos de 1 MB.
  - Los datos se guardan con una acción de servidor.
- **Dos fotos por partida:**
  - **del proyecto**: la de la matriz de Dodo, que reemplaza el importador;
  - **real**: la suben ustedes a mano (el sustituto que se compró o el equipo instalado). Nunca la toca el importador y no borra la del proyecto.
- **Solicitud de cotización imprimible:** se eligen partidas y sale una hoja con foto, código, modelo, medidas, kW y cantidad, y espacio para el precio del proveedor. Se usa «Imprimir / PDF» del navegador, igual que el plano.
- **Liga de la matriz por apertura.** Al importar se puede pegar la liga de Google Sheets de cada matriz, porque Julio indicó que cada apertura trae sus propias ligas.
- **Fuera de esta ronda:**
  - Excel con fotos;
  - descarga automática desde Google;
  - fotos para partidas sin código o que no sean PL.

## Datos (migración `supabase/migrations/20261125140000_aperturas_fotos.sql`)

**Tabla `apertura_item_dodo`** (una fila por partida, con los datos Dodo del proyecto)

| Columna | Tipo y reglas |
|---|---|
| item_id | uuid pk, fk `apertura_items` on delete cascade |
| proyecto_id | uuid fk `apertura_proyectos` (para RLS y consultas) |
| numero | integer null, > 0: el número de plano del E02 (null si la fila nació de una foto real) |
| codigo | text null, hasta 60 caracteres; null si el E02 trae «-» |
| descripcion | text null, hasta 2000 |
| potencia_kw | numeric null, ≥ 0 |
| cantidad_proyecto | numeric null, ≥ 0 |
| matriz | text null, uno de `digital`, `mobiliario`, `neutral`, `proceso`, `herramientas` |
| matriz_url | text null, `^https://docs\.google\.com/` y hasta 500 caracteres |
| sustituto | text null, hasta 2000: el sustituto verificado de la columna «Наличие согласованной замены» u homóloga |
| foto_proyecto | text null, ruta en el bucket |
| foto_real | text null, ruta en el bucket |
| foto_real_por | uuid null |
| foto_real_en | timestamptz null |
| importado_en | timestamptz not null default now() |

- El proyecto de la fila debe ser el de su partida. Lo garantizan las funciones.
- RLS: el select se permite con `ve_compras()`. `authenticated` no tiene DML directo.

**Funciones `security definer set search_path=''`**, todas con `edita_compras()`:
- `importar_apertura_dodo(p_proyecto uuid, p_filas jsonb)`: devuelve `(ligadas int, con_foto int, fotos_anteriores text[])`.
  - `p_filas` es un arreglo de objetos `{clave, numero, codigo, descripcion, potencia_kw, cantidad, matriz, matriz_url, sustituto, foto}`.
  - Cada `clave` debe ser una partida del proyecto.
  - Hace upsert por `item_id`.
  - Conserva `foto_real`.
  - Si viene `foto`, debe existir en el bucket y su ruta debe empezar con `{proyecto}/`.
  - Si `foto` es null, conserva la foto del proyecto que ya existía.
  - `fotos_anteriores` lleva las rutas reemplazadas para que la app las borre.
  - A lo más 400 filas por llamada.
- `guardar_foto_real(p_item uuid, p_ruta text)`:
  - pone o reemplaza la foto real;
  - si `p_ruta` es null, la quita;
  - crea la fila si no existía, solo con `item_id` y `proyecto_id`;
  - devuelve la ruta anterior.

**Bucket privado `aperturas-fotos`**
- Límite de 5 MB.
- Tipos permitidos: `image/png`, `image/jpeg`, `image/webp`.
- Rutas `{proyecto_id}/{uuid}.{png|jpg|webp}`.
- Políticas:
  - lectura: `ve_compras()`;
  - alta y borrado: `edita_compras()`, con la ruta validada por regex y que el proyecto exista. Es el mismo patrón que `aperturas-planos`.

**Pruebas**
- PGlite.
- Un script `supabase/pruebas/20261125140000_aperturas_fotos.sql` que termina en «PRUEBAS OK».
  - Importa dos filas.
  - Reimporta y comprueba que conserva la foto real.
  - Sube una foto real y comprueba que no se pierde la del proyecto.

## Código

**`lib/aperturas/dodoE02.ts`** (puro): `leerE02(paginas: TextoPagina[])` devuelve `FilaE02[]`.
- Recibe los textos con posición de las páginas.
- Busca las tablas con encabezado `№ … Code`, como en la extracción ya probada.
- Arma las filas con `numero`, `nombre`, `descripcion`, `potencia_kw`, `cantidad` y `codigo`, uniendo el texto de cada columna por renglón.
- Distingue la tabla de equipo de la de mobiliario: esta última es la que sigue al título «Furniture».
- `claveDe(fila)` devuelve `PL-0NN` para equipo, `PL-(88+N)` para mobiliario y `PL-100` para la cámara fría si aparece.

**`lib/aperturas/matrizDodo.ts`** (puro, sin dependencias de navegador):
- `matrizDeCodigo(codigo)`: el prefijo → matriz.
- `leerMatriz(archivos: Map<ruta, Uint8Array>)` devuelve un `Map<codigoNormalizado, {foto: ruta media | null, sustituto: string | null, hoja: string}>`.
  - Lee `workbook.xml`, `sharedStrings.xml`, cada hoja, sus `_rels` y su drawing.
  - Detecta las columnas de código, foto y sustituto por el texto del encabezado.
  - Liga cada imagen con el renglón de su ancla.
- `normalizarCodigo`: quita espacios, convierte la «С» cirílica en C y pasa a mayúsculas.

**`app/aperturas/fotos/ImportarDodo.tsx`** (cliente): ventana en tres pasos.
1. Elegir el PDF del set y uno o más .xlsx, y pegar las ligas opcionales de cada matriz.
2. Procesar en el navegador:
   - el PDF con `pdfjs-dist`, que ya es dependencia;
   - los .xlsx con `fflate`, una dependencia nueva de unos 30 KB que solo se carga en esta ventana;
   - las fotos se reducen a 800 px de lado mayor en un canvas y se suben como JPEG con el cliente de navegador (`lib/supabase/navegador.ts`).
3. Resumen: partidas ligadas, partidas con foto, códigos que no se encontraron en ninguna matriz y matrices que faltaron. Después se confirma y se llama a `importar_apertura_dodo`.

**`app/aperturas/fotos/acciones.ts`**:
- `importarDodo`: borra las fotos reemplazadas;
- `guardarFotoReal`: subida de la foto real desde la ficha. Se sube en el navegador y luego se guarda la ruta;
- `quitarFotoReal`.

**URLs firmadas.** Se piden en lote al servidor (1 h), solo para las partidas visibles.

**Dónde se ve:**
- **Equipo y compras** (`ListaConceptos`, vista `compras`): miniatura de 40 px a la izquierda del renglón. Muestra la foto real si existe; si no, la del proyecto; si no hay ninguna, un cuadro gris con el número del plano.
- **Ficha de la partida** (`app/aperturas/[id]/items/[item]/page.tsx`):
  - foto grande del proyecto y foto real lado a lado;
  - debajo, el código, la descripción o modelo, los kW, la cantidad del proyecto, el sustituto verificado y la liga «Abrir matriz de Dodo»;
  - con permiso, «Subir foto real», «Cambiar» y «Quitar».
- **Ficha del plano** (`PlanoApertura`): la misma miniatura y el código. `page.tsx` pasa los datos Dodo junto con los items.
- **Solicitud de cotización** (`app/aperturas/[id]/cotizacion/page.tsx`):
  - desde Equipo y compras, casillas por renglón y el botón «Solicitud de cotización»;
  - la página muestra el encabezado de la apertura, la fecha y una tabla con #, foto, clave, nombre, código, descripción o modelo, kW, cantidad y columnas vacías «Precio unitario» y «Tiempo de entrega»;
  - CSS de impresión carta horizontal y el botón «Imprimir / PDF»;
  - los ids van por query (`?items=…`, hasta 150).
- **Permisos:** ver es para quien ve aperturas (`ve_compras()`). Importar y subir fotos, para quien edita compras.

## Errores y casos borde

- **Archivo que no es set de planos o matriz.** El resumen dice «No encontré la tabla E02» o «Este .xlsx no tiene columna de código».
- **Código repetido en varias hojas de una matriz.** Gana la primera hoja que tenga foto.
- **Código del E02 sin foto en las matrices cargadas.** Se guardan los datos sin foto del proyecto y aparece en el resumen.
- **Reimportar con un set o matriz nuevos.** Actualiza los datos y la foto del proyecto, y nunca toca la foto real.
- **Falla la subida a medias.** No se llama a la función. Las fotos ya subidas quedan huérfanas y se borran en el mismo intento.

## Pruebas

**Unitarias:**
- `leerE02` con el texto real de la página 6 del set de López Mateos, guardado como fixture JSON con posiciones. Debe dar 88 equipos y 11 muebles; por ejemplo, 66 → E.40.0-01 y kW 0.01.
- `leerMatriz` con un .xlsx mínimo armado en la prueba: una hoja con encabezado, dos códigos, una imagen anclada y un sustituto.
- `normalizarCodigo` y `matrizDeCodigo`.

**De cableado (lectura de fuente):**
- La miniatura en `ListaConceptos`.
- La ficha con «Subir foto real».
- `PlanoApertura` muestra la foto.
- La página de cotización tiene CSS de impresión.

**SQL:** PGlite de la migración (permisos, rutas del bucket, conservar la foto real, límite de filas, que todo UPDATE tenga WHERE) y el script de pruebas.

## Fuera de alcance

- Excel de cotización con fotos.
- Descargar las matrices desde Google automáticamente.
- Fotos para referencias (REF), ESP de obra o actividades.
- Traducir las descripciones en ruso de las matrices. Se usa la descripción del E02, que viene en inglés.

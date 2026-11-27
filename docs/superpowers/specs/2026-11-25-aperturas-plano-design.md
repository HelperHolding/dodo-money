# Aperturas: plano de equipo y obra con colores por etapa (HD-14) — diseño

Fecha: 2026-11-25 · Ticket: HD-14 (Julio, con su aclaración del 24-nov) · Responsable: Sebastián

## Objetivo

Ver el plano de la apertura y saber de un vistazo en qué etapa va cada equipo o partida y cuáles necesitan atención, sin leer la lista de más de 600 renglones. Sirve igual para el plano de equipo (E01/E02) y para los planos de obra (E03 muros, E04 pisos, E05 acabados, E06/E06.1 contactos, E07 baja tensión, E08 plafones e iluminación, E09 hidráulico, E11 decorativos, E12 fachada).

## Decisiones tomadas

- **Planos por apertura, por hoja.** Cada apertura tiene varias hojas, identificadas por una clave libre (por ejemplo «E01», «E06.1») y un nombre. Se cambia de hoja con pestañas.
- **Archivo.** Se sube un PDF o una imagen (PNG/JPG). Si es PDF, el navegador dibuja la primera página como PNG de alta resolución (pdf.js) y se guardan los dos archivos. Subir una versión nueva reemplaza el archivo, guarda la fecha de la versión y conserva las marcas.
- **Ubicación manual, una sola vez.** El número de partida (PL-xxx) no es el número del plano, así que no hay forma automática segura de ligarlos. En el modo «Ubicar» se elige una partida y se da clic en el plano; las marcas se pueden arrastrar o quitar. Una partida tiene a lo más una marca por hoja.
- **Color por etapa** con los puntos de HD-12 (`puntosItem`):

  | Puntos | Color | Significado |
  |---|---|---|
  | 0 | gris | sin iniciar |
  | 0.25 | amarillo | cotizado |
  | 0.5 | azul | comprado |
  | 0.75 | morado | entregado |
  | 1 | verde | instalado / listo |

  **Actividades y validaciones técnicas** (por si se ubican en un plano de obra): 0 es gris, 1/3 amarillo, 2/3 azul y 1 verde.

  **Marcadores extra:**
  - contorno rojo si está `bloqueado` o vencido, con la misma regla de vencido que `indicadoresApertura`: fecha pasada y no lista;
  - ícono «?» si está `por_validar`;
  - tachado y atenuado si es `no_aplica`.
- **Ficha al dar clic:** nombre, clave, etapa (`nombreEstado`), cantidad/recibido, precio, responsable, fecha prevista, notas y ligas a la OC, la factura y la ficha del concepto. Quien puede editar compras cambia la etapa desde ahí con la misma ventana del checklist.
- **Leyenda** con el conteo por color de la hoja. Al dar clic en un color se resaltan solo esos y los demás se atenúan.
- **Filtros:** «Necesita mi atención» (gris, bloqueados, vencidos y por validar) y responsable. Proveedor y zona quedan fuera.
- **Celular:** botones de acercar y alejar (50 % a 400 %) y el plano se desplaza dentro de su marco. Las marcas conservan su tamaño en pantalla.
- **Imprimir:** un botón «Imprimir / PDF» usa la impresión del navegador, con CSS de impresión que deja solo la hoja, sus marcas y la leyenda.
- **Permisos:** ver el plano, quien ve aperturas (`ve_compras()`); subir, ubicar y cambiar etapa, quien edita compras (`edita_compras()`, `puedeEditarCompras`).

## Datos (migración `supabase/migrations/20261125130000_aperturas_planos.sql`)

**Tabla `apertura_planos`**

| Columna | Tipo y reglas |
|---|---|
| id | uuid pk |
| proyecto_id | fk `apertura_proyectos` |
| hoja | text, 1–20 caracteres, `^[A-Za-z0-9._-]+$` |
| nombre | text, 1–120 |
| version_fecha | date |
| archivo | text, ruta del original en el bucket |
| imagen | text, ruta del PNG o JPG que se muestra |
| ancho, alto | integer > 0, pixeles de la imagen |
| revision | integer ≥ 1 |
| creado_por | uuid |
| creado_en | timestamptz |
| actualizado_en | timestamptz |

- `unique(proyecto_id, hoja)`.

**Tabla `apertura_plano_marcas`**

| Columna | Tipo y reglas |
|---|---|
| plano_id | fk `apertura_planos`, on delete cascade |
| item_id | fk `apertura_items`, on delete cascade |
| x, y | numeric, `0 ≤ x,y ≤ 1`, fracción del ancho y del alto |
| actualizado_en | timestamptz |

- La llave primaria es `(plano_id, item_id)`.

**RLS y permisos**
- Las dos tablas tienen RLS: el select se permite con `ve_compras()`, y `authenticated` no tiene insert, update ni delete directo.

**Funciones `security definer set search_path=''`**, todas con `edita_compras()`:
- `guardar_apertura_plano(p_proyecto uuid, p_hoja text, p_nombre text, p_version date, p_archivo text, p_imagen text, p_ancho int, p_alto int, p_revision int)`:
  - Crea la hoja o reemplaza la existente con la misma clave. Para reemplazar exige la revisión vigente.
  - Devuelve el id.
  - Las rutas deben empezar con `{proyecto_id}/`.
- `colocar_apertura_marca(p_plano uuid, p_item uuid, p_x numeric, p_y numeric)`: upsert. Exige que el item sea del mismo proyecto que el plano y que x, y estén en [0, 1].
- `quitar_apertura_marca(p_plano uuid, p_item uuid)`: borra la marca.
- `borrar_apertura_plano(p_plano uuid)`: borra la hoja y sus marcas. Los archivos los borra la app después.

**Bucket privado `aperturas-planos`**
- Límite de 25 MB.
- Tipos permitidos: `application/pdf`, `image/png`, `image/jpeg`.
- Políticas:
  - lectura: `ve_compras()`;
  - alta y borrado: `edita_compras()`, con la ruta `{proyecto_id}/{uuid}.{pdf|png|jpg}`.

**Pruebas**
- PGlite.
- Un script `supabase/pruebas/20261125130000_aperturas_planos.sql` que termina en «PRUEBAS OK».

## Código

- **`lib/aperturas/plano.ts`** (puro):
  - `colorMarca(item, hoy)` devuelve `{color, alerta, porValidar, noAplica}`;
  - `conteoColores(items, hoy)`;
  - `necesitaAtencion(item, hoy)`;
  - `aCoordenada(clicX, clicY, ancho, alto, zoom)`, que da la fracción recortada a [0, 1].
- **`app/aperturas/plano/`**:
  - `SubirPlano.tsx` (cliente): elige el archivo y, si es PDF, lo convierte con `pdfjs-dist` a un PNG de 3000 px de ancho como máximo. Llama a una acción de servidor que sube los archivos y llama a `guardar_apertura_plano`.
  - `PlanoApertura.tsx` (cliente): muestra la imagen con las marcas en posición %, la leyenda, los filtros, el zoom, la ficha y el modo Ubicar.
  - `acciones.ts`: subir/reemplazar, colocar, quitar y borrar.
- **Imagen.** Se pide con URL firmada de 1 h desde el servidor.
- **Nueva vista `?vista=plano`** en las pestañas del proyecto («Plano»), con las hojas en pestañas internas.
- **La ventana de cambio de estado del checklist** se extrae a un componente compartido para reusarla en el plano.

## Fuera de alcance

- Detectar números y posiciones automáticamente del PDF.
- Filtros por proveedor y por zona.
- Fotos (HD-16).
- Exportar a PDF desde el servidor.
- Planos de otras aperturas distintas de las que se suban.

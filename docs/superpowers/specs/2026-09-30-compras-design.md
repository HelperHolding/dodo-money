# Compras: proveedores, cotizaciones, órdenes, facturas y pagos — diseño

Fecha: 2026-09-30 · Estado: aprobado por secciones en el chat, pendiente revisión del documento.

## Para qué

Tener en un solo lugar a los proveedores y todo lo que se les cotiza, pide, recibe, factura y paga, para **calendarizar los pagos**, no pagar tarde y no pagar dos veces. El flujo sigue el de Compras de Odoo:

**Cotización → Orden de compra → Recepción → Factura → Pago**

## Quién

| Puesto | Qué hace en Compras |
|---|---|
| Admin (Julio, Sebastián) | Todo: proveedores, artículos, cotizaciones, órdenes, recepciones de Dodo IS, facturas, pagos |
| Corporativo (Halim, Ernesto) | Consulta todo, no edita (igual que en el resto de la app) |
| Gerente / encargado | Solo confirma lo recibido de los renglones **no consumibles** de órdenes de su sucursal |
| Operación | Nada |

Lo decide la base de datos (RLS y funciones `security definer`), no solo la pantalla.

## Fuera de alcance

Inventario y almacenes; contabilidad y pólizas; conciliación bancaria; consulta de estatus de CFDI en el SAT; aprobación de pagos en dos pasos; envío de correos o recordatorios desde la app; monedas distintas a MXN. Todo se puede agregar después.

## Fases (un spec, cuatro entregas)

Cada fase es una rama con su migración, su prueba SQL (`PRUEBAS OK`) y se publica en main por separado.

1. **Proveedores y artículos** — migración 0011.
2. **Cotización → orden de compra y recepción** — migración 0012.
3. **Facturas (XML) y cotejo** — migración 0013.
4. **Pagos, abonos, complementos y calendario** — migración 0014.

---

## 1. Proveedores y catálogo de artículos

### Datos

**`proveedores`**
- `razon_social` (obligatorio), `nombre_comercial`, `rfc` (obligatorio, **único**, en mayúsculas, 12 o 13 caracteres), `regimen_fiscal` (clave SAT de 3 dígitos; catálogo en `lib/compras/sat.ts`).
- Contacto: `contacto_nombre`, `telefono`, `correo`.
- Pago: `banco`, `clabe` (18 dígitos, validada con su dígito verificador), `cuenta`, `dias_credito` (entero ≥ 0; 0 = contado), `forma_pago_habitual` (`transferencia | efectivo | tarjeta | cheque`).
- `categorias` (arreglo de `consumible | activo_fijo | servicio | otro`), `notas`, `activo` (default true), `creado_en`, `creado_por`.
- Nunca se borra; se desactiva.

**`articulos`**
- `nombre` (obligatorio), `unidad` (texto: kg, pza, caja, servicio…), `tipo` (`consumible | activo_fijo | servicio | otro`), `tasa_iva` (`16 | 0 | exento`, default 16), `dodo_insumo_id` (texto, solo consumibles, único cuando existe), `activo`.

**`precios_proveedor`** (último precio por proveedor y artículo)
- `proveedor_id`, `articulo_id`, `precio` (sin IVA), `fecha`, `orden_id` de donde salió. Llave única (`proveedor_id`, `articulo_id`). Se actualiza **solo** al confirmar una orden (fase 2).

### Pantallas (`/compras`)
- **Proveedores**: tarjetas con buscador (razón social, nombre comercial, RFC) y filtro por categoría. Ficha con datos; en fases posteriores muestra saldo por pagar y últimas órdenes.
- **Alta/edición de proveedor**: formulario corto; RFC y CLABE validados en la pantalla y en la base.
- **Artículos**: tarjetas por tipo; plegable con precios por proveedor.
- **Carga inicial de proveedores desde Excel**: plantilla con las columnas del proveedor; valida cada renglón y muestra qué renglones fallaron sin guardar ninguno si hay errores.

### Navegación
- Nuevo enlace **Compras** en el encabezado para admin y corporativo (`lib/roles.ts`: `puedeVerCompras`, `puedeEditarCompras`).
- Gerente/encargado no ven `/compras`; ven sus recepciones pendientes en su sucursal (fase 2).

---

## 2. Cotización → orden de compra

### Datos

**`ordenes_compra`**
- `folio` (consecutivo `OC-0001`, secuencia), `proveedor_id`, `sucursal_id` (destino; `null` = Oficina), `estado` (`borrador | enviada | confirmada | cerrada | cancelada`), `grupo_id` (cotizaciones alternativas comparten grupo), `notas`, `motivo_cierre_cancelacion`, fechas y usuario de cada cambio de estado (`creado_*`, `enviada_*`, `confirmada_*`, `cerrada_*`, `cancelada_*`).
- Calculados (vista `ordenes_compra_resumen`): subtotal, IVA, total, `avance_recepcion` (`nada | parcial | completa`), `avance_facturacion` (`nada | parcial | completa`).

**`orden_renglones`**
- `orden_id`, `articulo_id`, `descripcion` (copia del nombre del artículo, editable en borrador), `cantidad` (> 0), `precio` (sin IVA, ≥ 0), `tasa_iva` (copia del artículo).

**`orden_historial`**: `orden_id`, `evento`, `usuario`, `en`, `nota`. Se llena con un trigger en cada cambio de estado.

### Estados y reglas
- **Borrador**: todo editable. Al elegir artículo, la pantalla propone el último precio de ese proveedor.
- **Enviada**: se pidió precio al proveedor; se capturan los precios que respondió (renglones siguen editables). Se genera un **PDF** de la cotización para compartir (ruta que devuelve HTML imprimible; "Guardar como PDF" del navegador).
- **Confirmada = orden de compra**: renglones fijos (trigger rechaza cambios); se actualiza `precios_proveedor`; la sucursal la ve. Las demás órdenes del mismo `grupo_id` que sigan en borrador/enviada se **cancelan solas** con motivo "Se eligió OC-00xx".
- **Cerrada**: automática cuando recepción y facturación están completas; o manual por el admin con motivo (lo pendiente ya no llegará).
- **Cancelada**: desde borrador, enviada o confirmada **sin nada recibido**; con motivo. No se borra.
- Solo proveedores y artículos activos. Solo el admin cambia estados (función `cambiar_estado_orden`).

### Cotizaciones alternativas
- "Pedir a otro proveedor" copia los renglones a una orden nueva en borrador con el mismo `grupo_id`.
- **Comparar**: una tarjeta por proveedor con total y precio por renglón; se resalta el más barato por renglón y en total. Nada de tabla ancha.

### Pantallas
- **Compras → Órdenes**: tarjetas con folio, proveedor, sucursal, total, estado y los dos avances; filtros por estado, proveedor y sucursal.
- **Detalle**: encabezado, renglones en tarjetas, avances, historial, botones según estado.
- **Comparar cotizaciones** del grupo.

---

## 3. Recepción

Dos caminos según el tipo de artículo del renglón; una orden puede tener de los dos.

### A) Consumibles: desde Dodo IS

**`recepciones_dodo`**
- `sucursal_id`, `dodo_insumo_id`, `material` (nombre en Dodo IS), `unidad`, `fecha`, `cantidad`, `precio`, `archivo` (nombre del Excel), `importado_en`, `importado_por`.
- `orden_renglon_id` (liga; `null` = sin orden), `clasificacion` (`orden | sin_orden | traspaso | pendiente`).

**Importación** (Compras → Recepciones Dodo IS): el admin sube el *Incoming supplies*. Lector en `lib/compras/incomingSupplies.ts`:
- Hojas: la primera es "All stores" (se ignora); cada hoja siguiente es una sucursal (nombre = `sucursales.nombre`; si no existe, error claro).
- Fila 6 = encabezado: `ID | Materials | UOM | Price | Qty. | Price | (vacía) | dd.mm.yyyy…`. Filas de sección sin ID (p. ej. "Ingredient") se saltan.
- Por cada insumo y cada columna de día con cantidad: una recepción (`precio` = columna D, precio unitario).
- Reemplaza días completos de esa sucursal ya importados (mismo patrón que Datos brutos).

**Liga automática** (función `ligar_recepciones_dodo`, corre al importar):
- Candidatos: renglones de órdenes **confirmadas** de la misma sucursal cuyo artículo tiene ese `dodo_insumo_id`, con fecha de recepción entre la confirmación de la orden y **7 días después**, y con cantidad pendiente.
- Si hay varias, la orden confirmada más antigua primero; una recepción se liga a un solo renglón.
- Sin candidato → `pendiente` en la bandeja **Recepciones sin orden**, donde el admin la liga a mano, la marca `sin_orden` o `traspaso` (no se coteja).
- Diferencia de precio contra la orden → marca en ámbar.
- Cuando llegue la API de Dodo IS (proveedor y número de factura), la liga será directa; este mecanismo queda para casos raros.

### B) Activos fijos, servicios y otros: en la app

**`recepciones_app`**
- `orden_renglon_id`, `cantidad` (servicio: 1 = realizado), `fecha`, `foto` (ruta en storage, opcional), `recibido_por`, `recibido_en`, `anulada_por`, `anulada_en`, `motivo_anulacion`.
- Gerente/encargado de la **sucursal destino** capturan (función `recibir_renglon`); solo renglones no consumibles de órdenes confirmadas. Parcial permitido. No se edita; el admin anula con motivo.
- Aparece como tarjeta "Por recibir" en Inicio de la sucursal.

### Avance
- Por renglón: (recibido Dodo IS ligado + recibido app no anulado) ÷ pedido.
- Por orden: `nada | parcial | completa`. Recibir **más** de lo pedido se acepta y se marca en ámbar.

### Archivos
- Bucket privado nuevo **`compras`**. Carpetas: `recepciones/<sucursal_id>/…`, `facturas/<proveedor_id>/…`, `pagos/…`.
- Lectura: admin y corporativo todo; gerente/encargado solo `recepciones/<su sucursal>/`. Escritura: admin todo; gerente/encargado solo `recepciones/<su sucursal>/`.

---

## 4. Facturas (XML del CFDI)

### Datos

**`facturas`**
- `uuid` (**único**), `serie`, `folio`, `tipo` (`ingreso | egreso`), `fecha_emision`, `rfc_emisor`, `nombre_emisor`, `regimen_emisor`, `rfc_receptor`, `metodo_pago` (`PUE | PPD`), `forma_pago` (clave SAT), `moneda`, `subtotal`, `descuento`, `iva`, `retenciones`, `total`.
- `proveedor_id`, `sucursal_id` (carga; `null` = Oficina), `uuid_relacionado` (egreso → factura que corrige), `vence_el` (editable), `pago_programado_el` (fase 4), `estado` (`por_pagar | parcial | pagada | cancelada`), `revisada` (bool) + `revision_nota`, `xml_ruta`, `pdf_ruta`, `motivo_cancelacion`, `creado_*`.
- Saldo calculado (vista `facturas_saldo`): total − notas de crédito ligadas − pagos aplicados no anulados.

**`factura_conceptos`**: `factura_id`, `descripcion`, `cantidad`, `unidad`, `valor_unitario`, `importe`.

**`factura_ordenes`**: `factura_id`, `orden_id` (una factura puede cubrir varias órdenes y una orden varias facturas).

**`empresa`** (una fila): `rfc`, `razon_social` — se configura una vez; contra ella se valida el receptor.

### Captura
- El admin sube uno o varios XML (+ PDF opcional). Lector puro en `lib/compras/cfdi.ts`, **sin dependencias nuevas** (el XML del CFDI se lee atributo por atributo del nodo `Comprobante`, `Emisor`, `Receptor`, `Conceptos`, `Impuestos` y `CfdiRelacionados`; soporta CFDI 4.0 y 3.3).
- Validaciones (en el lector y otra vez en la base):
  - UUID repetido → rechazo: "Esta factura ya se registró el dd/mm (OC-00xx)".
  - RFC receptor ≠ empresa → rechazo.
  - RFC emisor: si existe en la cartera se liga; si no, propone **alta del proveedor** con razón social, RFC y régimen del XML.
  - Régimen del XML ≠ régimen del proveedor → aviso, no bloquea.
  - Moneda ≠ MXN → rechazo.
  - XML mal formado, sin `TimbreFiscalDigital`, o versión distinta de 3.3/4.0 → mensaje claro, no se guarda nada.
  - Tipo `P` (complemento de pago) se reconoce y se manda al flujo de complementos (fase 4). Tipos `T`/`N` → rechazo.
- Vencimiento: `fecha_emision + dias_credito` del proveedor; PUE sugiere vence hoy. Editable.

### Ligar a la orden
- Tras subirla, la app sugiere órdenes confirmadas del proveedor con saldo por facturar; el admin elige una o varias, o la deja como **factura sin orden** eligiendo sucursal u Oficina.

### Cotejo de tres vías (`lib/compras/cotejo.ts`)
- Por **totales** de las órdenes ligadas, tolerancia **±$1.00**:
  - `recibido_valor` = Σ (cantidad recibida × precio de la orden × (1 + IVA)).
  - `ordenado_total` = total de las órdenes.
  - `facturado` = total de las facturas ligadas a esas órdenes (menos notas de crédito).
- Resultado: 🟢 `cuadra` (facturado ≈ recibido_valor) · 🟡 `facturado_de_mas` (facturado > recibido_valor) · 🟡 `precio_distinto` (recibido completo pero facturado ≠ ordenado) · 🔴 `nada_recibido`.
- Conceptos del XML al lado de los renglones de la orden, solo para revisión visual.
- Factura sin orden: no hay cotejo (se muestra "Sin orden").
- Amarilla o roja: se puede programar, pero **registrar un pago exige `revisada = true`** con nota.

### Notas de crédito
- CFDI tipo **E** se liga por `uuid_relacionado` a la factura que corrige y resta de su saldo. Si la factura relacionada no existe aún, queda pendiente de ligar y se avisa.

### Estados
- `por_pagar → parcial → pagada`; `cancelada` con motivo (nunca se borra; no se puede cancelar con pagos no anulados). "Vencida" es marca calculada: `vence_el < hoy` y saldo > 0.

---

## 5. Pagos, abonos y calendario

### Datos

**`pagos`**: `proveedor_id`, `fecha`, `monto` (> 0), `forma` (`transferencia | efectivo | tarjeta | cheque`), `cuenta_origen` (texto), `referencia`, `comprobante_ruta`, `creado_*`, `anulado_por`, `anulado_en`, `motivo_anulacion`.

**`pago_aplicaciones`**: `pago_id`, `factura_id`, `monto` (> 0).

**`complementos_pago`**: `uuid` (único), `fecha`, `rfc_emisor`, `xml_ruta`; y `complemento_facturas` (`complemento_id`, `factura_id`, `monto_pagado`, `parcialidad`), leídos del nodo `pago20:Pagos`.

### Registrar un pago (función `registrar_pago`, una transacción)
- Admin elige proveedor → facturas con saldo, la que vence antes primero.
- Escribe el monto; `lib/compras/pagos.ts` (`repartirPago`) lo reparte por vencimiento; ajustable a mano.
- Reglas: cada aplicación ≤ saldo de su factura; Σ aplicaciones = monto; todas las facturas del mismo proveedor; facturas no canceladas; si el cotejo no es 🟢, `revisada = true`.
- El estado de cada factura se recalcula (`parcial` / `pagada`).
- **Anular** (función `anular_pago`): con motivo; devuelve saldos; nunca se borra.

### Complemento de pago
- Pagos aplicados a facturas **PPD** quedan con marca **"Falta complemento"** hasta que se sube el XML tipo P que las cubre (liga por UUID de la factura en el complemento). No bloquea nada.

### Programar
- `facturas.pago_programado_el` opcional; si no hay, el calendario usa `vence_el`.

### Calendario (Compras → Pagos)
- Indicadores arriba: **Vencido** (rojo), **Esta semana**, **Próximos 30 días**, **Pagado este mes**.
- **Mes** como el calendario de ventas: total por pagar en cada día; rojo si hay vencidas; al tocar un día, sus facturas en tarjetas.
- **Por pagar**: Vencidas / Esta semana / Después, con botón "Registrar pago" por tarjeta.
- Filtros: proveedor, sucursal, "Falta complemento".
- **Corporativo**: tarjeta con vencido y lo que vence esta semana (solo consulta).

---

## Seguridad (todas las fases)
- RLS en todas las tablas nuevas: lectura para admin y corporativo; escritura solo admin, salvo `recepciones_app` (gerente/encargado de la sucursal destino vía `recibir_renglon`) y lectura de gerente/encargado de las órdenes confirmadas de su sucursal y sus renglones (sin precios en la pantalla de sucursal).
- Cambios de estado y operaciones con varias tablas solo por funciones `security definer` que revisan `mi_rol()`; corporativo recibe `SOLO_CONSULTA`.
- Nada se borra: se cancela, anula o desactiva con motivo y usuario.

## Pruebas
- **SQL por fase** (`supabase/pruebas/0011…0014`, terminan en `PRUEBAS OK`):
  - 0011: RFC único y válido, CLABE válida, corporativo no escribe, operación no ve.
  - 0012: transiciones válidas e inválidas, renglones fijos al confirmar, cancelar alternativas del grupo, precio_proveedor actualizado, liga automática de recepciones Dodo IS (ventana de 7 días, la más antigua primero), gerente recibe solo su sucursal y solo no consumibles.
  - 0013: UUID repetido, receptor incorrecto, nota de crédito resta saldo, no cancelar con pagos.
  - 0014: aplicación > saldo rechazada, Σ ≠ monto rechazada, proveedor mezclado rechazado, sin revisar rechazado, anular devuelve saldo, marca de complemento.
- **Node** (`lib/compras/*.test.ts`, agregados a `npm test`): `cfdi` (con XML reales de ejemplo: ingreso PUE, ingreso PPD, egreso, complemento P; sin datos personales innecesarios), `incomingSupplies` (con el archivo del 22 al 28/09), `cotejo`, `pagos.repartirPago`, validación de RFC y CLABE.

## Pendiente de Sebastián
- 1–2 XML reales de proveedores (factura normal y, si hay, PPD o nota de crédito) para las pruebas del lector.
- RFC y razón social de la empresa receptora.

# Compromisos recurrentes: renta, fumigación, basura y trampas de grasa (diseño)

**Fecha:** 2026-10-28 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Programar por adelantado lo que **sí o sí** se paga en cada sucursal (renta, fumigación, recolección de basura,
limpieza de trampas de grasa y otros fijos) para dos cosas:

1. **Flujo de dinero:** ver en el calendario de pagos lo que va a salir cada día y mes, aunque todavía no llegue la
   factura.
2. **Control del servicio:** saber si la fumigación o la limpieza de trampas sí se hizo, con evidencia.

**Éxito:** el admin da de alta "Renta Zapopan · $45,000 · día 1 de cada mes" una sola vez; desde ese momento cada mes
aparece como *previsto* en el calendario de pagos y suma al total del día. Cuando llega la factura (o se captura el
gasto sin CFDI) se liga a esa fecha y el previsto deja su lugar a la factura real, sin contarse dos veces. Una
fumigación de un mes pasado sin comprobar se ve en rojo.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Qué es un compromiso | Una regla por sucursal: concepto, proveedor, monto estimado, forma de pago prevista y frecuencia |
| Conceptos | Renta, Fumigación, Recolección de basura, Limpieza de trampas de grasa, Otro (con descripción) |
| Frecuencia | Cada *N* meses en un día del mes (1–31; si el mes es más corto, el último día) o cada *N* semanas a partir de la fecha de inicio |
| Vigencia | Fecha de inicio obligatoria; fecha de fin opcional (contrato que termina) |
| Fechas futuras | **No se guardan**: se calculan de la regla al consultar. Solo se guarda una fecha cuando alguien actúa sobre ella (liga factura, comprueba servicio u omite) |
| Día en el calendario | Igual que una factura: el día de pago autorizado anterior o igual al vencimiento (hoy, viernes); si ese día ya pasó, el próximo |
| Cómo se paga | Ligando una factura de **ese proveedor y esa sucursal**: un CFDI capturado o un gasto sin CFDI (ambos viven en `facturas`). El pago se registra como cualquier factura, en Pagos |
| Doble conteo | Una fecha con factura ligada ya no se muestra como prevista; se ve la factura |
| Servicio | Casilla "requiere comprobar servicio" (por omisión: sí en fumigación, basura y trampas; no en renta). Estados: pendiente, realizado (fecha + nota de al menos 5 letras + foto o PDF opcional) o no realizado (motivo) |
| Omitir una fecha | Se permite con motivo (ej. mes de gracia en renta); deja de contar como previsto |
| Cambiar la regla | Monto, proveedor, forma de pago, fin, descripción y "requiere servicio" se pueden editar y afectan solo fechas sin factura. Para cambiar sucursal, concepto, frecuencia, día o inicio se pone fin al compromiso y se crea otro. El fin no puede quedar antes de una fecha ya trabajada |
| Quién edita | Admin de Compras (`edita_compras`): Julio y Sebastián. Corporativo (`ve_compras`) solo consulta |
| P&L | Los previstos **no** entran al P&L; solo la factura real, como hoy |

## 3. Pantallas

### Compras → Pagos → Compromisos fijos (`/compras/pagos/compromisos`)

- Tarjetas agrupadas por sucursal (nada de tablas anchas). Cada tarjeta: concepto, proveedor, monto estimado,
  "Cada mes, día 1", próxima fecha y su estado; insignia roja si hay fechas vencidas sin factura o servicios sin
  comprobar.
- Filtros de sucursal y concepto. Botón "Nuevo compromiso" (solo admin).
- Arriba, dos avisos que también salen en Pagos: "N pagos fijos vencidos sin factura" y "N servicios sin comprobar".

### Detalle de un compromiso (`/compras/pagos/compromisos/[id]`)

- Datos de la regla y botón para editar o darle fin.
- Lista de fechas: los últimos 3 meses y los próximos 12. Cada fecha es una tarjeta con su vencimiento, el día de
  pago, el estado del pago (previsto, con factura por pagar, pagada u omitida) y, si aplica, el del servicio.
- Acciones por fecha (admin):
  - **Ligar factura:** elige entre las facturas por pagar o pagadas del mismo proveedor y sucursal que no estén ligadas
    a otra fecha. Si no hay, el enlace "Capturar gasto sin CFDI" abre el formulario con proveedor y sucursal ya puestos.
  - **Quitar factura** (por si se ligó mal).
  - **Comprobar servicio:** realizado o no realizado, con fecha, nota y archivo opcional.
  - **Omitir** con motivo.

### Calendario de pagos (existente)

- Cada día suma facturas y previstos. Los previstos se ven con otro color y la etiqueta "Previsto · Renta Zapopan".
  Al tocarlos llevan al detalle del compromiso.
- La exportación de la corrida para Tesorería no cambia: solo incluye facturas.

## 4. Datos (migración)

- `compromisos`: id, `sucursal_id`, `concepto` (`renta`, `fumigacion`, `basura`, `trampas_grasa`, `otro`),
  `descripcion`, `proveedor_id`, `monto_estimado` (> 0), `forma_pago` (`forma_pago`), `unidad` (`mes` | `semana`),
  `cada` (1–12), `dia_mes` (1–31, solo con mes), `inicio`, `fin` (≥ inicio, opcional), `requiere_servicio`, `revision`,
  `creado_por`, `creado_en`. Si concepto es `otro`, la descripción es obligatoria.
- `compromiso_fechas` (solo las fechas en las que alguien actuó): id, `compromiso_id`, `vence` (única por compromiso),
  `factura_id` (única, opcional), `omitida_motivo`, `servicio` (`pendiente` | `realizado` | `no_realizado`),
  `servicio_fecha`, `servicio_nota`, `revision`.
- `compromiso_historial`: alta, cambios de la regla y cada acción sobre una fecha (anterior y nuevo en jsonb, usuario,
  fecha), igual que `activo_historial`.
- Evidencia del servicio: tabla propia `compromiso_evidencias` con el mismo patrón preparar → subir → confirmar de
  `compra_adjuntos` (que exige dueño orden/factura y no se toca), en el bucket `adjuntos-compras`.
- Si un gasto sin CFDI ligado se sustituye por su CFDI, un trigger pasa la liga al CFDI.
- RLS: lectura con `ve_compras()`; escritura solo a través de funciones `security definer` que exigen
  `edita_compras()`.

### Funciones

- `fechas_compromiso(p_compromiso, p_desde, p_hasta)`: **única fuente de la regla**. Devuelve las fechas de
  vencimiento en el rango, con fin de mes para días 29–31.
- `compromisos_en_rango(p_desde, p_hasta)`: cada fecha calculada con los datos guardados de esa fecha (factura y su
  estado, servicio y omisión). Es lo que leen el calendario y las pantallas.
- `guardar_compromiso(p_id, p_revision, p_datos)`: alta y edición con control de revisión. Rechaza cambios de
  frecuencia, día o inicio en un compromiso existente.
- `ligar_factura_compromiso(p_compromiso, p_vence, p_factura)`: valida que `p_vence` salga de la regla, que la factura
  sea de ingreso, de ese proveedor y esa sucursal, no esté cancelada y no esté ligada a otra fecha. Si recibe `null`,
  quita la liga.
- `comprobar_servicio_compromiso(p_compromiso, p_vence, p_estado, p_fecha, p_nota)`: no acepta una fecha futura; pide
  nota (realizado) o motivo (no realizado) de al menos 5 letras.
- `omitir_fecha_compromiso(p_compromiso, p_vence, p_motivo)`: no se puede con factura ligada.

## 5. Arquitectura en la app

- `lib/compras/compromisos.ts` (puro, con pruebas): nombres de concepto y frecuencia ("Cada 2 meses, día 15"), estado
  de una fecha (previsto, por pagar, pagada, omitida, vencida sin factura), avisos (vencidas sin factura, servicios sin
  comprobar) y conversión de fecha a previsto del calendario usando `diaDePagoSugerido`.
- `app/compras/pagos/compromisos/`: `page.tsx`, `[id]/page.tsx`, `nuevo/page.tsx`, `FormCompromiso.tsx`,
  `acciones.ts`.
- `app/compras/pagos/page.tsx` y `CalendarioPagos.tsx`: leen `compromisos_en_rango` del mes y muestran los previstos;
  aviso con enlace a Compromisos fijos.
- `FormGastoManual`: acepta proveedor y sucursal por parámetro de la URL, y al guardar desde un compromiso liga la
  factura a esa fecha.

## 6. Pruebas

- Node: texto de frecuencia; estado de cada fecha; previsto oculto si hay factura; día de pago sugerido del previsto;
  avisos.
- SQL (`supabase/pruebas/…_compromisos_recurrentes.sql`, termina en "PRUEBAS OK"):
  - Fechas mensuales con día 31 (febrero → 28/29), cada 2 meses, cada 2 semanas y con fecha de fin.
  - Ligar una factura de otro proveedor o sucursal: rechazado. Ligar una factura ya ligada: rechazado. Ligar en una
    fecha que no sale de la regla: rechazado.
  - Comprobar servicio en el futuro o sin nota: rechazado. Omitir una fecha con factura: rechazado.
  - Un usuario sin `edita_compras`: rechazado. Revisión vieja: rechazada.
  - Cambiar frecuencia de un compromiso existente: rechazado.
- Vista previa de Compromisos fijos, su detalle y el calendario con previstos, en computadora y celular.

## 7. Fuera de alcance

- Notificaciones por correo o WhatsApp.
- Incrementos automáticos de renta (INPC o aniversario de contrato): se edita el monto a mano.
- Compromisos de la oficina sin sucursal. Quedan para después si hacen falta.

# Gastos unificados en Compras (diseño)

**Fecha:** 2026-10-05 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Un **solo lugar** para dar de alta cualquier gasto o compra con proveedor: Compras → Facturas, **con XML o sin XML**
(prefactura, recibo, pago sin CFDI), y que **cada renglón** lleve su cuenta del P&L. Hoy hay dos lugares (Compras solo
con XML; Finanzas → Gastos del mes sin proveedor ni pagos) y una factura lleva una sola cuenta.

**Caso que lo motiva:** la renta de Zapopan-1 ($30,000) y el agua ($1,200) del mismo arrendador, persona física; hoy hay
solo una prefactura; el CFDI llegará después. Se paga por transferencia, con retención de 2/3 del IVA y 10 % de ISR.

**Éxito:** el admin captura la prefactura en Compras con dos renglones (Renta → Renta, Agua → Servicios), la paga en
Compras → Pagos, y el P&L la muestra en sus cuentas. Cuando llega el CFDI, lo sube y la app le pregunta qué gasto sin
CFDI sustituye; los pagos pasan al CFDI y nada se cuenta doble.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Dónde se captura | Compras → Facturas: "Subir XML" (como hoy) o "Agregar sin CFDI" (nuevo) |
| Gasto sin CFDI | Es una factura más (misma tabla): tiene proveedor, sucursal, renglones, saldo, pagos, vencimiento y entra al P&L |
| Cuenta del P&L | Por **renglón** (concepto). Sin cuenta propia, el renglón toma la de la factura, que toma la del proveedor |
| Sucursal | Por factura, como hoy (destino); el proveedor puede tener **sucursal por omisión** |
| Sustitución | Al subir el CFDI, si el proveedor tiene gastos sin CFDI abiertos, se elige cuál sustituye; los pagos pasan al CFDI y el gasto sin CFDI queda cancelado ("Sustituido por …"). Aviso si los totales difieren por más de $1 |
| Gastos del mes | Se quita de Finanzas (menú y pantalla); el P&L deja de leerlo. Lo ya capturado se vuelve a capturar en Compras |
| Retenciones | Se guardan por tipo: retención de IVA y retención de ISR (también al leer el XML), para la futura lista "Retenciones por enterar" |
| Permisos | Igual que Compras: admin captura y sustituye; corporativo consulta |

## 3. Gasto sin CFDI

- **Datos:** proveedor, sucursal (o Oficina), fecha, vencimiento (por omisión fecha + días de crédito del proveedor),
  referencia (p. ej. folio de la prefactura), adjunto opcional (PDF o imagen, mismo límite de 4 MB).
- **Renglones** (uno o más): descripción, importe sin IVA y cuenta del P&L.
- **Impuestos:** IVA 16 % (o 0 %) sobre el subtotal; retención de IVA (ninguna o 2/3 del IVA = 10.6667 %); retención de
  ISR (ninguna o 10 %). Un botón "Persona física, arrendamiento" elige 16 %, 2/3 y 10 %. Los montos se pueden ver antes
  de guardar. Total = subtotal + IVA − retenciones.
- Ejemplo: renglones 30,000 (Renta) + 1,200 (Servicios) → subtotal 31,200; IVA 4,992; ret. IVA 3,328; ret. ISR 3,120;
  total 29,744.
- En la lista de facturas lleva la marca **"Sin CFDI"** y se puede filtrar.

## 4. Cuenta por renglón y P&L

- `factura_conceptos` gana `cuenta_pl`. Cuenta efectiva del renglón = la suya, o la de la factura.
- En el detalle de la factura (con o sin XML), cada concepto tiene su selector de cuenta (admin).
- Monto de un renglón en el P&L = su importe × (subtotal − descuento) ÷ subtotal (así los descuentos del CFDI se
  reparten); notas de crédito restan; canceladas no cuentan. Una factura sin conceptos cuenta completa en su cuenta.
- Lo demás del P&L no cambia (reparto por días en semanas, memos de insumos e inversiones, oficina).

## 5. Sustitución por el CFDI

- En el detalle de una factura con XML: "¿Sustituye a un gasto sin CFDI?" con los gastos sin CFDI abiertos del mismo
  proveedor (rótulo: referencia, fecha, total, sucursal).
- Al sustituir (función con reglas en la base, solo admin):
  - mismo proveedor; el gasto sin CFDI no está cancelado ni ya sustituido;
  - los pagos aplicados al gasto pasan al CFDI (si exceden el saldo del CFDI, error claro);
  - el CFDI toma la sucursal del gasto si no tiene; los conceptos del CFDI toman la cuenta de la factura del gasto si no tienen;
  - el gasto sin CFDI queda cancelado con motivo "Sustituido por CFDI {serie+folio o uuid}" y `sustituido_por`.

## 6. Datos (resumen para el plan)

- `facturas`: `origen` (`cfdi` | `manual`), `referencia`, `sustituido_por`, `retencion_iva`, `retencion_isr`; `uuid`,
  `xml_ruta`, `rfc_emisor`, `nombre_emisor`, `regimen_emisor`, `rfc_receptor` dejan de ser obligatorios solo cuando
  `origen = 'manual'` (check). `facturas_saldo` se rehace.
- `factura_conceptos`: `cuenta_pl` (mismas cuentas del P&L).
- `proveedores`: `sucursal_id` por omisión; el XML subido la toma si la factura no trae destino.
- Funciones: `registrar_gasto_manual(...)`, `asignar_cuenta_concepto(...)`, `sustituir_factura_manual(...)`.
- Prueba SQL con "PRUEBAS OK".

## 7. Pruebas

- Node: cálculo del gasto sin CFDI (IVA, 2/3, 10 %, 0 %, redondeo); validación del formulario; reparto de una factura por
  conceptos en el P&L (descuento, nota de crédito, sin conceptos, renglón sin cuenta); lectura de retenciones por tipo del XML.
- SQL: alta manual, cuenta por concepto, sustitución (pagos movidos, cancelación, mismo proveedor, doble sustitución
  rechazada), permisos.
- Vista previa: formulario "Agregar sin CFDI" y detalle con cuentas por concepto, en computadora y celular.

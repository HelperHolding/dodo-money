# Rentabilidad Rappi

Ventas → Costos → Rentabilidad Rappi (`/ventas/costos/rappi`, admin y corporativo). Por mes, cuánto deja el canal y cada producto contra un margen mínimo (45 % por omisión, editable en la página y en la URL `?meta=`).

## Fuentes

- Órdenes y renglones: órdenes Rappi en vivo (n8n) finalizadas del mes, con su descuento de la tienda (`descuento_restaurante`) y el producto ligado de cada renglón.
- Comisión: la cobrada por orden en los reportes financieros de Banca → Rappi (columna "Uso y alquiler de plataforma Rappi", sin su IVA). Órdenes sin reporte: `rappi_pct` vigente en la fecha sobre lo cobrado con IVA.
- Compensaciones y cancelaciones cobradas: reportes financieros del mes, a nivel canal.
- Regalías: `regalias_pct` vigente; sin parámetro, 3.5 % indicado por la dirección, con aviso.
- Costo: costo vigente del producto en la fecha de la orden. POS: precio de Dodo IS (respaldo Excel del BOM) y comisión de terminal estimada.

## Cálculo

Por renglón, el descuento de la orden se reparte por importe; la comisión de la orden, por lo cobrado. Venta sin IVA = (lista − descuento) ÷ 1.16. Utilidad = venta sin IVA − comisión − regalías − costo. Margen = utilidad ÷ venta sin IVA. El canal resta además compensaciones y cancelaciones.

Precio mínimo de lista para la meta con el descuento promedio `d` del producto y su comisión efectiva `c` sobre lo cobrado: costo ÷ ((1 − d) × ((1 − regalías − meta) ÷ 1.16 − c)). Contra mostrador: utilidad por pieza al precio POS con terminal y regalías.

No se restan el IVA de la comisión ni las retenciones de IVA e ISR (se acreditan). Los descuentos DAR los paga Rappi y se compensan en el mismo reporte. Productos sin costo o sin ligar quedan fuera de utilidad y margen, con aviso. Sin migración.

import test from "node:test";
import assert from "node:assert/strict";
import { parsearDetalle, leerListado, monto } from "./parsear.mjs";

// Texto real del portal (18/10/2026) con nombres de cliente y repartidor reemplazados.
const detalle = (cuerpo) => `Dodo Pizza\nHistorial de órdenes\n${cuerpo}\nCLIENTE REPARTIDOR\nRepartidor asignado`;
const conExtras = detalle("Orden #2481664517\nOrden #2481664517\n\nCliente\n\nFinalizado\nDP\nDodo Pizza\n18 oct 2026\n22:22\n1 producto\nResumen de la orden\nListado de productos\n1x\nPepperoni\n$230\nAGREGA SNACKS\n1x Papas francesas\n$ 65,00\nELIGE EL TAMAÑO DE TU PIZZA.\n1x 30 cm\n—\nELLIGE LA PRESENTACIÓN\n1x 120 g\n—\nDescuentos\nDescuento por restaurante\n-$40\nSubtotal restaurante\n$190\nDescuento por Rappi\n-$26\nTotal sugerido a facturar\n$164\nMétodo de pago:\nTarjeta de Crédito/Débito - visa");
const sinDescuento = detalle("Orden #2481527862\nOrden #2481527862\n\nCliente\n\nFinalizado\nDP\nDodo Pizza\n18 oct 2026\n16:44\n1 producto\nResumen de la orden\nListado de productos\n1x\nSolo Dodo Coca-Cola\n$240\nELIGE TU PIZZA SOLO DODO\n1x Jamon y Champiñones\n—\nELIGE TU BEBIDA COMBO 1\n1x Coca Cola 600ml.\n—\nDescuentos\nDescuento por restaurante\n-\nSubtotal restaurante\n$240\nDescuento por Rappi\n-$108\nTotal sugerido a facturar\n$132\nMétodo de pago:\nApple Pay - visa");
const redondeo = detalle("Orden #2481513849\nOrden #2481513849\n\nCliente\n\nFinalizado\nDP\nDodo Pizza\n18 oct 2026\n16:17\n2 productos\nResumen de la orden\nListado de productos\n1x\nPepperoni\n$165\nELIGE EL TAMAÑO DE TU PIZZA.\n1x 30 cm\n—\n1x\nPizza Hawaiana\n$199\nELIGE EL TAMAÑO DE TU PIZZA.\n1x 30 cm\n—\nELIGE EL TIPO DE MASA\n1x Delgada\n—\nDescuentos\nDescuento por restaurante\n-$87\nSubtotal restaurante\n$277\nDescuento por Rappi\n-$58\nTotal sugerido a facturar\n$218\nMétodo de pago:\nTarjeta de Crédito/Débito - visa");

test("detalle Rappi: orden con extras, opciones y pago", () => {
  const r = parsearDetalle(conExtras, "MX1930486109");
  assert.deepEqual(r.orden, { rappi_id: "2481664517", tienda_id: "MX1930486109", fecha: "2026-10-18", hora: "22:22", estado: "Finalizado", pago: "Tarjeta de Crédito/Débito - visa", bruto: 230, descuento_restaurante: 40, subtotal_restaurante: 190, descuento_rappi: 26, facturar: 164 });
  assert.deepEqual(r.productos, [{ rappi_id: "2481664517", linea: 1, nombre: "Pepperoni", opciones: "Papas francesas, 30 cm, 120 g", cantidad: 1, importe: 230 }]);
  assert.equal(r.avisos.length, 0);
  assert.doesNotMatch(JSON.stringify(r), /CLIENTE|Cliente/);
});
test("detalle Rappi: combo sin descuento restaurante", () => {
  const r = parsearDetalle(sinDescuento, "MX1930486109");
  assert.equal(r.orden.descuento_restaurante, 0); assert.equal(r.orden.descuento_rappi, 108);
  assert.equal(r.productos[0].opciones, "Jamon y Champiñones, Coca Cola 600ml.");
});
test("detalle Rappi: dos productos y ajuste por redondeo del portal", () => {
  const r = parsearDetalle(redondeo, "MX1930486109");
  assert.equal(r.productos.length, 2); assert.equal(r.productos[1].linea, 2); assert.equal(r.productos[1].opciones, "30 cm, Delgada");
  assert.equal(r.orden.bruto, 364); assert.equal(r.orden.descuento_rappi, 59); assert.equal(r.orden.facturar, 218);
  assert.match(r.avisos[0], /58 → 59/);
});
test("detalle Rappi: cantidad mayor a 1 con precio unitario", () => {
  const t = conExtras.replace("1x\nPepperoni\n$230", "2x\nPepperoni\n$115");
  const r = parsearDetalle(t, "MX1");
  assert.equal(r.productos[0].cantidad, 2); assert.equal(r.productos[0].importe, 230);
});
test("detalle Rappi: cancelada sin sección de descuentos", () => {
  const r = parsearDetalle(detalle(`Orden #2481431595
Orden #2481431595

Cliente

Cancelado
DP
Dodo Pizza
18 oct 2026
13:30
1 producto
Resumen de la orden
Listado de productos
1x
Pizza Hawaiana
$199
ELIGE EL TAMAÑO DE TU PIZZA.
1x 30 cm
—
ELIGE EL TIPO DE MASA
1x Tradicional
—
Total sugerido a facturar
$199
Método de pago:
Efectivo`), "MX1930486109");
  assert.equal(r.orden.estado, "Cancelado"); assert.equal(r.orden.hora, "13:30");
  assert.deepEqual([r.orden.bruto, r.orden.descuento_restaurante, r.orden.subtotal_restaurante, r.orden.descuento_rappi, r.orden.facturar], [199, 0, 199, 0, 199]);
  assert.equal(r.productos[0].opciones, "30 cm, Tradicional"); assert.equal(r.avisos.length, 0);
});
test("detalle Rappi: rechaza estados en progreso y montos ilegibles", () => {
  assert.throws(() => parsearDetalle(conExtras.replace("Finalizado", "En camino"), "MX1"), /estado/);
  assert.throws(() => parsearDetalle(conExtras.replace("$190", "$300"), "MX1"), /no cuadran/);
  assert.equal(monto("$1,386"), 1386); assert.equal(monto("$ 65,00"), 65); assert.equal(monto("-"), 0);
});
test("listado Rappi: IDs y fechas de la tabla", () => {
  assert.deepEqual(leerListado("Orden ID\tFecha\n#2481664517\t18/10/2026\tDodo Pizza\t$230\n#2481435584\t17/10/2026\tDodo Pizza"), [{ id: "2481664517", fecha: "2026-10-18" }, { id: "2481435584", fecha: "2026-10-17" }]);
});

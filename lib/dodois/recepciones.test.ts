import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAS_RECEPCIONES, folioNormalizado, traducirRecepciones, ventanaRecepciones, type RecepcionApi } from "./recepciones.ts";

const UNIDAD = "11f187558e757f53b0570d952420b810";
const base: RecepcionApi = {
  unitId: UNIDAD, stockItemId: "11f1956aaa89ab11296f1a5942e37170", stockItemName: "Azúcar", quantity: 6, measurementUnit: "Kilogram",
  totalPriceWithoutVat: 158.7, totalPriceWithVat: 184.09, vatRate: 16, incomingStockOrderId: "01a0f928e25177bfa7bb06699e173c4e",
  supplierId: "11f1ae3f0c877591842b32ad820bb779", suppliedAtLocal: "2026-10-01T13:21:45", invoiceNumber: "aa1654842",
  invoiceDate: "2026-10-01", incomingStockOrderModifiedAt: "2026-10-01T20:30:03",
};

test("traducirRecepciones: ids en mayúsculas, unidad, fecha local, precio unitario sin IVA e importes", () => {
  const [r] = traducirRecepciones([base], UNIDAD);
  assert.deepEqual(r, {
    dodo_documento_id: "01A0F928E25177BFA7BB06699E173C4E", dodo_insumo_id: "11F1956AAA89AB11296F1A5942E37170", material: "Azúcar", unidad: "kg",
    fecha: "2026-10-01", recibido_en: "2026-10-01T13:21:45", cantidad: 6, precio: 26.45, importe_sin_iva: 158.7, importe_con_iva: 184.09, tasa_iva: 16,
    dodo_proveedor_id: "11F1AE3F0C877591842B32AD820BB779", factura_texto: "aa1654842", factura_fecha: "2026-10-01", modificado_dodo: "2026-10-01T20:30:03",
  });
});

test("mismo insumo dos veces en una entrega: se suma; otra unidad o cantidad cero: se omite", () => {
  const r = traducirRecepciones([
    base,
    { ...base, quantity: 4, totalPriceWithoutVat: 105.8, totalPriceWithVat: 122.73 },
    { ...base, unitId: "otra" },
    { ...base, incomingStockOrderId: "otro-doc", quantity: 0 },
    { ...base, incomingStockOrderId: "doc-pza", stockItemId: "caja", stockItemName: "Caja 35", measurementUnit: "Quantity", quantity: 100, totalPriceWithoutVat: 450, totalPriceWithVat: 450, vatRate: 0, invoiceNumber: "  ", supplierId: null },
  ], UNIDAD);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].cantidad, r[0].importe_sin_iva, r[0].importe_con_iva, r[0].precio], [10, 264.5, 306.82, 26.45]);
  assert.deepEqual([r[1].unidad, r[1].precio, r[1].tasa_iva, r[1].factura_texto, r[1].dodo_proveedor_id], ["pza", 4.5, 0, null, null]);
});

test("folio normalizado", () => {
  assert.equal(folioNormalizado("Aa1657629"), "AA1657629");
  assert.equal(folioNormalizado(" aa-165 7629 "), "AA1657629");
  assert.equal(folioNormalizado("0002"), "2");
  assert.equal(folioNormalizado("000"), "0");
  assert.equal(folioNormalizado("30 de septiembre 2026"), "30DESEPTIEMBRE2026");
  assert.equal(folioNormalizado("  "), null);
  assert.equal(folioNormalizado(null), null);
});

test("ventanas: 7 días con el cron, 31 en la noche y a mano; terminan hoy", () => {
  assert.deepEqual(DIAS_RECEPCIONES, { cron: 7, noche: 31, manual: 31 });
  assert.deepEqual(ventanaRecepciones(7, "2026-10-20"), { desde: "2026-10-14", hasta: "2026-10-20", from: "2026-10-14T00:00:00", to: "2026-10-21T00:00:00" });
  assert.deepEqual(ventanaRecepciones(31, "2026-10-20"), { desde: "2026-09-20", hasta: "2026-10-20", from: "2026-09-20T00:00:00", to: "2026-10-21T00:00:00" });
});

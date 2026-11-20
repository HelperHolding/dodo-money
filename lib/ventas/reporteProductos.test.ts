import { test } from "node:test";
import assert from "node:assert/strict";
import { hojasProductos, nombreArchivoProductos } from "./reporteProductos.ts";
import type { RenglonCosteo } from "./calculos.ts";

const r = (fecha: string, dodo_id: number, nombre: string, cantidad: number, importe: number, sinDesc: number, costo: number | null): RenglonCosteo => ({
  fecha, dodo_id, nombre, categoria: dodo_id === 1 ? "pizza" : null, cantidad, importe, importe_sin_descuento: sinDesc,
  importe_neto: Math.round((importe / 1.16) * 100) / 100, costo_unitario: costo,
});

test("por producto suma canales, ordena por venta y cierra con total", () => {
  const [prod, dia] = hojasProductos({
    titulo: "Zapopan-1 La Calma", periodo: { desde: "2026-11-01", hasta: "2026-11-02" }, generado: "Ensayo",
    canales: [
      { nombre: "POS / Dodo IS", renglones: [r("2026-11-01", 1, "Pepperoni", 2, 300, 350, 50), r("2026-11-01", 1, "Pepperoni", 1, 150, 150, 50), r("2026-11-02", 2, "Coca", 3, 90, 90, null)] },
      { nombre: "Rappi", renglones: [r("2026-11-02", 1, "Pepperoni", 1, 200, 200, 50)] },
    ],
  });
  assert.deepEqual([prod.nombre, dia.nombre], ["Por producto", "Por día"]);
  assert.deepEqual(prod.filas[4].slice(0, 5), ["Producto", "Categoría", "Piezas", "Piezas POS / Dodo IS", "Piezas Rappi"]);
  const pep = prod.filas[5];
  assert.equal(pep[0], "Pepperoni");
  assert.equal(pep[1], "Pizzas");
  assert.deepEqual(pep.slice(2, 5), [4, 3, 1]);
  assert.deepEqual(pep[6], { valor: 50, formato: "pesos" }); // descuento
  assert.deepEqual(pep[7], { valor: 650, formato: "pesos" });
  assert.deepEqual(pep[10], { valor: 162.5, formato: "pesos" }); // precio promedio
  assert.deepEqual(pep[11], { valor: 200, formato: "pesos" });
  assert.equal(prod.filas[6][1], "Sin categoría");
  assert.equal(prod.filas[6][11], null); // sin costo
  const total = prod.filas.at(-1)!;
  assert.equal(total[0], "Total");
  assert.deepEqual(total.slice(2, 5), [7, 6, 1]);
  assert.deepEqual(total[7], { valor: 740, formato: "pesos" });
  assert.deepEqual(total[9], { valor: 1, formato: "porcentaje" });
  // Por día: los dos renglones de Pepperoni POS del 1 de nov se juntan
  assert.equal(dia.filas.length, 5 + 3);
  assert.deepEqual(dia.filas[5].slice(0, 5), [{ fecha: "2026-11-01" }, "Pepperoni", "Pizzas", "POS / Dodo IS", 3]);
  assert.deepEqual(dia.filas[5][7], { valor: 450, formato: "pesos" });
});

test("periodo sin ventas deja hojas con total en cero", () => {
  const [prod, dia] = hojasProductos({ titulo: "X", periodo: { desde: "2026-11-01", hasta: "2026-11-01" }, generado: "", canales: [{ nombre: "Rappi", renglones: [] }] });
  assert.deepEqual(prod.filas.at(-1)!.slice(0, 4), ["Total", null, 0, 0]);
  assert.deepEqual(prod.filas.at(-1)![7], { valor: 0, formato: "pesos" });
  assert.deepEqual(prod.filas.at(-1)![8], null);
  assert.equal(dia.filas.length, 5);
});

test("nombre de archivo sin caracteres inválidos", () => {
  assert.equal(nombreArchivoProductos("A/B: C", { desde: "2026-11-01", hasta: "2026-11-30" }), "Ventas por producto A B C 2026-11-01 a 2026-11-30.xlsx");
});

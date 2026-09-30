import { test } from "node:test";
import assert from "node:assert/strict";
import { accionesDe, avanceOrden, avanceRenglon, compararCotizaciones, leerRenglon, recibidoDeMas, totalesOrden } from "./ordenes.ts";

test("totales: IVA por renglón redondeado; 0 y exento no llevan IVA", () => {
  assert.deepEqual(totalesOrden([
    { cantidad: 3, precio: 33.33, tasa_iva: "16" },
    { cantidad: 12.5, precio: 68, tasa_iva: "0" },
    { cantidad: 1, precio: 100, tasa_iva: "exento" },
  ]), { subtotal: 1049.99, iva: 16, total: 1065.99 });
  assert.deepEqual(totalesOrden([]), { subtotal: 0, iva: 0, total: 0 });
});

test("avance por renglón y por orden", () => {
  assert.equal(avanceRenglon(10, 0), "nada");
  assert.equal(avanceRenglon(10, 4), "parcial");
  assert.equal(avanceRenglon(10, 10), "completa");
  assert.equal(avanceRenglon(10, 12), "completa");
  assert.equal(recibidoDeMas(10, 12), true);
  assert.equal(recibidoDeMas(10, 10), false);
  assert.equal(avanceOrden([]), "nada");
  assert.equal(avanceOrden([{ cantidad: 1, recibido: 0 }, { cantidad: 2, recibido: 0 }]), "nada");
  assert.equal(avanceOrden([{ cantidad: 1, recibido: 1 }, { cantidad: 2, recibido: 0 }]), "parcial");
  assert.equal(avanceOrden([{ cantidad: 1, recibido: 1 }, { cantidad: 2, recibido: 3 }]), "completa");
});

test("acciones según el estado", () => {
  assert.deepEqual(accionesDe("borrador", false), ["editar", "enviar", "confirmar", "copiar", "cancelar"]);
  assert.deepEqual(accionesDe("enviada", false), ["editar", "confirmar", "copiar", "cancelar"]);
  assert.deepEqual(accionesDe("confirmada", false), ["cancelar", "cerrar"]);
  assert.deepEqual(accionesDe("confirmada", true), ["cerrar"]);
  assert.deepEqual(accionesDe("cerrada", false), []);
  assert.deepEqual(accionesDe("cancelada", false), []);
});

test("renglón: cantidad > 0, precio vacío = 0, comas de miles y signo de pesos", () => {
  const campos = (o: Record<string, string>) => (c: string) => o[c] ?? "";
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "1,500.25", precio: "$ 68.456" })),
    { datos: { articulo_id: "a1", cantidad: 1500.25, precio: 68.46 } });
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "2", precio: "" })), { datos: { articulo_id: "a1", cantidad: 2, precio: 0 } });
  assert.deepEqual(leerRenglon(campos({ cantidad: "2" })), { error: "Elige el artículo." });
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "0" })), { error: "La cantidad debe ser mayor a cero." });
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "dos" })), { error: "La cantidad debe ser mayor a cero." });
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "2", precio: "-1" })), { error: "El precio no es válido." });
});

test("comparar cotizaciones: más barata completa y mejor precio por artículo", () => {
  const r = compararCotizaciones([
    { id: "A", renglones: [{ articulo_id: "queso", cantidad: 10, precio: 100, tasa_iva: "0" }, { articulo_id: "caja", cantidad: 100, precio: 5, tasa_iva: "16" }] },
    { id: "B", renglones: [{ articulo_id: "queso", cantidad: 10, precio: 95, tasa_iva: "0" }, { articulo_id: "caja", cantidad: 100, precio: 6, tasa_iva: "16" }] },
    { id: "C", renglones: [{ articulo_id: "queso", cantidad: 10, precio: 90, tasa_iva: "0" }, { articulo_id: "caja", cantidad: 100, precio: 0, tasa_iva: "16" }] },
  ]);
  assert.equal(r.totales.get("A"), 1580);
  assert.equal(r.totales.get("B"), 1646);
  assert.equal(r.masBarata, "A");
  assert.equal(r.mejorPorArticulo.get("queso"), "C");
  assert.equal(r.mejorPorArticulo.get("caja"), "A");
  assert.equal(compararCotizaciones([]).masBarata, null);
});

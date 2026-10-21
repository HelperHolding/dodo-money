import { test } from "node:test";
import assert from "node:assert/strict";
import { accionesDe, avanceOrden, avanceRenglon, compararCotizaciones, filtrarOrdenes, leerRenglon, precioDistinto, impuestosPorTasa, recibidoDeMas, totalesOrden } from "./ordenes.ts";

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
    { datos: { articulo_id: "a1", cantidad: 1500.25, precio: 68.456 } });
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

test("comparar: una cotización cancelada no es la más barata ni tiene el mejor precio", () => {
  const r = compararCotizaciones([
    { id: "A", renglones: [{ articulo_id: "queso", cantidad: 10, precio: 100, tasa_iva: "0" }] },
    { id: "B", cancelada: true, renglones: [{ articulo_id: "queso", cantidad: 10, precio: 50, tasa_iva: "0" }] },
  ]);
  assert.equal(r.masBarata, "A");
  assert.equal(r.mejorPorArticulo.get("queso"), "A");
  assert.equal(r.totales.get("B"), 500);
});

test("precio de Dodo IS distinto al de la orden (más de medio centavo)", () => {
  assert.equal(precioDistinto(68, 68), false);
  assert.equal(precioDistinto(68, 68.004), false);
  assert.equal(precioDistinto(68, 68.5), true);
  assert.equal(precioDistinto(68, 0), false);
});

test("filtrar órdenes por estado, proveedor y sucursal (Oficina = null)", () => {
  const ordenes = [
    { id: "1", estado: "confirmada" as const, proveedor_id: "p1", sucursal_id: "s1" },
    { id: "2", estado: "borrador" as const, proveedor_id: "p2", sucursal_id: null },
    { id: "3", estado: "cancelada" as const, proveedor_id: "p1", sucursal_id: "s1" },
    { id: "4", estado: "cerrada" as const, proveedor_id: "p1", sucursal_id: "s2" },
  ];
  const ids = (f: Parameters<typeof filtrarOrdenes>[1]) => filtrarOrdenes(ordenes, f).map((o) => o.id);
  assert.deepEqual(ids({}), ["1", "2"]);
  assert.deepEqual(ids({ estado: "cancelada" }), ["3"]);
  assert.deepEqual(ids({ proveedor: "p1" }), ["1"]);
  assert.deepEqual(ids({ sucursal: "oficina" }), ["2"]);
  assert.deepEqual(ids({ estado: "cerrada", sucursal: "s2", proveedor: "p1" }), ["4"]);
});

test("impuestosPorTasa: una línea por tasa presente (16, 0, exento), y cuadra con los totales", () => {
  const rs = [
    { cantidad: 80, precio: 158.33, tasa_iva: "0" as const },
    { cantidad: 2, precio: 499.99, tasa_iva: "16" as const },
    { cantidad: 1, precio: 0.05, tasa_iva: "16" as const },
    { cantidad: 3, precio: 10, tasa_iva: "exento" as const },
  ];
  assert.deepEqual(impuestosPorTasa(rs), [
    { tasa: "16", base: 1000.03, iva: 160.01 },
    { tasa: "0", base: 12666.4, iva: 0 },
    { tasa: "exento", base: 30, iva: 0 },
  ]);
  const t = totalesOrden(rs);
  assert.equal(impuestosPorTasa(rs).reduce((s, l) => s + l.iva, 0), t.iva);
  assert.deepEqual(impuestosPorTasa([]), []);
});

test("precio unitario conserva cuatro decimales antes de calcular importe e IVA",()=>{
 const campos=(o:Record<string,string>)=>(c:string)=>o[c]??"";
 const r=leerRenglon(campos({articulo_id:'a1',cantidad:'24',precio:'10.7143'}));
 assert.ok('datos' in r);if(!('datos' in r))return;
 assert.equal(r.datos.precio,10.7143);
 assert.deepEqual(totalesOrden([{...r.datos,tasa_iva:'16'}]),{subtotal:257.14,iva:41.14,total:298.28});
 assert.deepEqual(leerRenglon(campos({articulo_id:'a1',cantidad:'1',precio:'Infinity'})),{error:'El precio no es válido.'});
});

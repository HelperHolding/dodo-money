import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { kpiVivo, presupuestoVivo } from "./presupuestoVivo.ts";

const fila = (categoria: string, o: Partial<Record<"presupuesto"|"comprometido"|"facturado"|"pagado", number|null>> = {}) =>
  ({ proyecto_id: "p", categoria, presupuesto: o.presupuesto === undefined ? null : o.presupuesto, comprometido: o.comprometido ?? 0, facturado: o.facturado ?? 0,
     pagado: o.pagado ?? 0, pagado_con_iva: 0, por_pagar_con_iva: 0, por_ejercer: null, desviacion: null });
const item = (o: Partial<{ tipo: string; estado: string; cantidad: number|null; precio: number|null; orden_id: string|null; factura_id: string|null; categoria: string|null }>) =>
  ({ tipo: "equipo", estado: "cotizado", cantidad: 1, precio: 116, orden_id: null, factura_id: null, categoria: "equipo_cocina", ...o }) as never;

test("columnas por categoría, total y faltante", () => {
  const r = presupuestoVivo([fila("obra_civil", { presupuesto: 1325236.75, comprometido: 1327071.52 }), fila("equipo_cocina", { presupuesto: 1226257.79, facturado: 553356.47, pagado: 553356.47 })],
    [item({ precio: 113620.5 * 1.16, cantidad: 1 })]);
  const obra = r.categorias.find((c) => c.clave === "obra_civil")!, eq = r.categorias.find((c) => c.clave === "equipo_cocina")!;
  assert.equal(obra.faltante, 0, "sobre presupuesto no da negativo");
  assert.equal(eq.cotizado, 113620.5);
  assert.equal(eq.faltante, Math.round((1226257.79 - 553356.47 - 113620.5) * 100) / 100);
  assert.equal(r.total.presupuesto, 2551494.54);
  // total compensa entre categorías: Σpres − Σcomprometido − Σfacturado − Σcotizado
  assert.equal(r.total.faltante, Math.round((2551494.54 - 1327071.52 - 553356.47 - 113620.5) * 100) / 100);
  assert.equal(r.conPresupuesto, true);
  assert.deepEqual(r.categorias.map((c) => c.clave), ["obra_civil", "equipo_cocina"]);
});

test("cotizado sin OC: solo cotizado/aprobado, con cantidad y precio, sin orden; sin IVA y por equivalencia", () => {
  const r = presupuestoVivo([], [
    item({ estado: "cotizado", cantidad: 2, precio: 116 }),
    item({ estado: "aprobado", cantidad: 1, precio: 232, categoria: "pisos" }),
    item({ estado: "pedido", cantidad: 1, precio: 1160 }),
    item({ estado: "cotizado", orden_id: "o1", precio: 1160 }),
    item({ estado: "cotizado", precio: null }),
    item({ estado: "cotizado", cantidad: 0 }),
    item({ tipo: "actividad", estado: "cotizado" }),
    item({ estado: "cotizado", factura_id: "f1", precio: 1160 }),
    // referencia sin categoría = lista smallware PRE26-SW (solo aquí; equivalenciaItem la manda a otros)
    item({ tipo: "referencia", estado: "aprobado", cantidad: 1, precio: 116, categoria: null }),
    item({ tipo: "equipo", estado: "aprobado", cantidad: 1, precio: 116, categoria: null }),
  ]);
  assert.deepEqual(r.categorias.map((c) => [c.clave, c.cotizado]), [["obra_civil", 200], ["equipo_cocina", 200], ["smallware", 100], ["otros", 100]]);
  assert.equal(r.conPresupuesto, false);
  assert.ok(r.categorias.every((c) => c.presupuesto === null && c.faltante === null));
  assert.equal(r.total.presupuesto, null); assert.equal(r.total.faltante, null);
});

test("omite categorías sin presupuesto ni movimiento; centavos exactos", () => {
  const r = presupuestoVivo([fila("tecnologia", { presupuesto: 128000 }), fila("senaletica")], [item({ precio: 0.1 * 1.16, cantidad: 3 })]);
  assert.deepEqual(r.categorias.map((c) => c.clave), ["equipo_cocina", "tecnologia"]);
  assert.equal(r.categorias[0].cotizado, 0.3);
  assert.equal(r.categorias[1].faltante, 128000);
});

test("kpiVivo: comprometido + facturado + cotizado sobre el presupuesto CAPEX; null sin presupuesto", () => {
  const r = presupuestoVivo([fila("obra_civil", { presupuesto: 1000, comprometido: 200.1, facturado: 300.2, pagado: 100 })], [item({ precio: 116, cantidad: 2 })]);
  assert.deepEqual(kpiVivo(r), { monto: 700.3, presupuesto: 1000 });
  assert.equal(kpiVivo(presupuestoVivo([fila("obra_civil", { comprometido: 5 })], [])), null);
});

test("total.faltante compensa entre categorías (presupuesto en equipo_cocina, compra en camara_fria)", () => {
  const r = presupuestoVivo([fila("equipo_cocina", { presupuesto: 1000 }), fila("camara_fria", { comprometido: 400 })], []);
  assert.equal(r.categorias.find((x) => x.clave === "equipo_cocina")!.faltante, 1000);
  assert.equal(r.total.faltante, 600);
  assert.equal(presupuestoVivo([fila("equipo_cocina", { presupuesto: 100 }), fila("camara_fria", { comprometido: 400 })], []).total.faltante, 0);
});

test("oculta categorías con presupuesto 0 y sin movimiento; las de 0 con movimiento se quedan", () => {
  const r = presupuestoVivo([fila("tecnologia", { presupuesto: 500 }), fila("pisos", { presupuesto: 0 }), fila("mobiliario", { presupuesto: 0, facturado: 10 }), fila("obra_civil", { presupuesto: 0 })], []);
  assert.deepEqual(r.categorias.map((x) => x.clave), ["mobiliario", "tecnologia"]);
  assert.equal(r.total.presupuesto, 500);
  assert.equal(r.conPresupuesto, true);
});

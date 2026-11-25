import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { presupuestoVivo } from "./presupuestoVivo.ts";

const fila = (categoria: string, o: Partial<Record<"presupuesto"|"comprometido"|"facturado"|"pagado", number|null>> = {}) =>
  ({ proyecto_id: "p", categoria, presupuesto: o.presupuesto === undefined ? null : o.presupuesto, comprometido: o.comprometido ?? 0, facturado: o.facturado ?? 0,
     pagado: o.pagado ?? 0, pagado_con_iva: 0, por_pagar_con_iva: 0, por_ejercer: null, desviacion: null });
const item = (o: Partial<{ tipo: string; estado: string; cantidad: number|null; precio: number|null; orden_id: string|null; categoria: string|null }>) =>
  ({ tipo: "equipo", estado: "cotizado", cantidad: 1, precio: 116, orden_id: null, categoria: "equipo_cocina", ...o }) as never;

test("columnas por categoría, total y faltante", () => {
  const r = presupuestoVivo([fila("obra_civil", { presupuesto: 1325236.75, comprometido: 1327071.52 }), fila("equipo_cocina", { presupuesto: 1226257.79, facturado: 553356.47, pagado: 553356.47 })],
    [item({ precio: 113620.5 * 1.16, cantidad: 1 })]);
  const obra = r.categorias.find((c) => c.clave === "obra_civil")!, eq = r.categorias.find((c) => c.clave === "equipo_cocina")!;
  assert.equal(obra.faltante, 0, "sobre presupuesto no da negativo");
  assert.equal(eq.cotizado, 113620.5);
  assert.equal(eq.faltante, Math.round((1226257.79 - 553356.47 - 113620.5) * 100) / 100);
  assert.equal(r.total.presupuesto, 2551494.54);
  assert.equal(r.total.faltante, eq.faltante);
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
    item({ tipo: "referencia", estado: "aprobado", cantidad: 1, precio: 116, categoria: null }),
  ]);
  assert.deepEqual(r.categorias.map((c) => [c.clave, c.cotizado]), [["obra_civil", 200], ["equipo_cocina", 200], ["otros", 100]]);
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

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asignacionesAjenas, CATEGORIAS_CAPEX, equivalenciaItem, leerRenglones, resumir, semaforo, sugerirAsignacion, type FilaCapex } from "./capex.ts";

const fila = (x: Partial<FilaCapex>): FilaCapex => ({ proyecto_id: "p", categoria: "otros", presupuesto: null, comprometido: 0, facturado: 0, pagado: 0, pagado_con_iva: 0, por_pagar_con_iva: 0, por_ejercer: null, desviacion: null, ...x });

test("las categorías en TS son las mismas de la migración", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261109180000_capex_aperturas.sql", import.meta.url), "utf8");
  const enSql = [...sql.matchAll(/\('([a-z_]+)','[^']+',(\d+)\)/g)].map((m) => m[1]);
  assert.deepEqual(CATEGORIAS_CAPEX.map((c) => c.clave), enSql);
});

test("semáforo: bordes de 90 % y 100 %, cero y sin presupuesto", () => {
  assert.equal(semaforo(null, 5), "gris");
  assert.equal(semaforo(100, 89.99), "verde");
  assert.equal(semaforo(100, 90), "ambar");
  assert.equal(semaforo(100, 100), "ambar");
  assert.equal(semaforo(100, 100.01), "rojo");
  assert.equal(semaforo(0, 0), "verde");
  assert.equal(semaforo(0, 1), "rojo");
});

test("resumir suma en centavos y calcula ejercido, por ejercer y porcentaje", () => {
  const r = resumir([fila({ presupuesto: 0.1, comprometido: 0.1, facturado: 0.2, pagado_con_iva: 0.1, por_pagar_con_iva: 0.2 }), fila({ presupuesto: 0.2, facturado: 0.05 })]);
  assert.deepEqual(r, { presupuesto: 0.3, comprometido: 0.1, facturado: 0.25, ejercido: 0.35, pagado_con_iva: 0.1, por_pagar_con_iva: 0.2, por_ejercer: -0.05, porcentaje: 0.35 / 0.3, semaforo: "rojo" });
  const sin = resumir([fila({ facturado: 10 })]);
  assert.equal(sin.presupuesto, null);
  assert.equal(sin.por_ejercer, null);
  assert.equal(sin.porcentaje, null);
  assert.equal(sin.semaforo, "gris");
  assert.equal(resumir([]).semaforo, "gris");
});

test("equivalencia de categorías de items de apertura", () => {
  assert.equal(equivalenciaItem("pisos"), "obra_civil");
  assert.equal(equivalenciaItem("iluminacion"), "instalaciones");
  assert.equal(equivalenciaItem("senaletica_fachada"), "senaletica");
  assert.equal(equivalenciaItem("camara_fria"), "camara_fria");
  assert.equal(equivalenciaItem(null), "otros");
  assert.equal(equivalenciaItem("desconocida"), "otros");
});

test("sugerir: prorratea la base al subtotal; sin base usa la categoría más común", () => {
  assert.deepEqual(sugerirAsignacion({ subtotal: 1000, proyectos: ["p"], categoriasItems: [], base: [{ proyecto_id: "p", categoria: "obra_civil", monto: 2 }, { proyecto_id: "p", categoria: "instalaciones", monto: 1 }] }),
    [{ proyecto_id: "p", categoria: "obra_civil", monto: 666.67 }, { proyecto_id: "p", categoria: "instalaciones", monto: 333.33 }]);
  assert.deepEqual(sugerirAsignacion({ subtotal: 500, proyectos: ["p"], categoriasItems: ["pisos", "mobiliario", "plafones"], base: [] }), [{ proyecto_id: "p", categoria: "obra_civil", monto: 500 }]);
  assert.deepEqual(sugerirAsignacion({ subtotal: 500, proyectos: ["p"], categoriasItems: [], base: [] }), [{ proyecto_id: "p", categoria: "otros", monto: 500 }]);
  assert.deepEqual(sugerirAsignacion({ subtotal: 500, proyectos: [], categoriasItems: [], base: [] }), []);
  assert.deepEqual(sugerirAsignacion({ subtotal: 0, proyectos: ["p"], categoriasItems: [], base: [] }), []);
  assert.deepEqual(sugerirAsignacion({ subtotal: 500, proyectos: ["p"], categoriasItems: [], base: [{ proyecto_id: "otro", categoria: "otros", monto: 1 }] }), [{ proyecto_id: "p", categoria: "otros", monto: 500 }]);
});

test("leer renglones del formulario: formatos de pesos, renglones vacíos y montos inválidos", () => {
  const fd = new FormData();
  fd.set("proyecto_0", "p"); fd.set("categoria_0", "obra_civil"); fd.set("monto_0", "$1,234.567"); fd.set("nota_0", " Anticipo ");
  fd.set("proyecto_1", "p"); fd.set("categoria_1", "otros"); fd.set("monto_1", "");
  fd.set("proyecto_2", "p"); fd.set("categoria_2", "mobiliario"); fd.set("monto_2", "500");
  assert.deepEqual(leerRenglones(fd, 3), [{ proyecto_id: "p", categoria: "obra_civil", monto: 1234.57, nota: "Anticipo" }, { proyecto_id: "p", categoria: "mobiliario", monto: 500, nota: null }]);
  fd.set("monto_1", "mil");
  assert.throws(() => leerRenglones(fd, 3), /renglón 2/);
});

test("asignaciones ajenas: las de una apertura que ya no es de la sucursal del documento", () => {
  const r = (proyecto_id: string) => ({ proyecto_id, categoria: "otros", monto: 1 });
  assert.deepEqual(asignacionesAjenas([r("p"), r("q")], ["p"]), [r("q")]);
  assert.deepEqual(asignacionesAjenas([r("p")], []), [r("p")]);
  assert.deepEqual(asignacionesAjenas([], ["p"]), []);
});

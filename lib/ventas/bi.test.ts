import test from "node:test";
import assert from "node:assert/strict";
import { leerFiltrosBI, rangoRelativo, rangoComparacion, parametrosSQL, puntoEquilibrio, prorratear, metaDelRango, mezclarCategorias, urlBI } from "./bi.ts";

test("rangos relativos (hoy = miércoles 18 nov 2026)", () => {
  const h = "2026-11-18";
  assert.deepEqual(rangoRelativo("hoy", h), { desde: "2026-11-18", hasta: "2026-11-18" });
  assert.deepEqual(rangoRelativo("ayer", h), { desde: "2026-11-17", hasta: "2026-11-17" });
  assert.deepEqual(rangoRelativo("esta_semana", h), { desde: "2026-11-16", hasta: "2026-11-18" });
  assert.deepEqual(rangoRelativo("semana_pasada", h), { desde: "2026-11-09", hasta: "2026-11-15" });
  assert.deepEqual(rangoRelativo("este_mes", h), { desde: "2026-11-01", hasta: "2026-11-18" });
  assert.deepEqual(rangoRelativo("mes_pasado", h), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(rangoRelativo("este_anio", h), { desde: "2026-01-01", hasta: "2026-11-18" });
  assert.deepEqual(rangoRelativo("anio_pasado", h), { desde: "2025-01-01", hasta: "2025-12-31" });
  // Lunes y 1 de enero: rango de un día
  assert.deepEqual(rangoRelativo("esta_semana", "2026-11-16"), { desde: "2026-11-16", hasta: "2026-11-16" });
  assert.deepEqual(rangoRelativo("este_anio", "2027-01-01"), { desde: "2027-01-01", hasta: "2027-01-01" });
});

test("comparación: periodo anterior del mismo largo y mismo periodo del año pasado (29 feb → 28 feb)", () => {
  assert.deepEqual(rangoComparacion("2026-11-16", "2026-11-18", "anterior"), { desde: "2026-11-13", hasta: "2026-11-15" });
  assert.deepEqual(rangoComparacion("2026-11-01", "2026-11-18", "anio"), { desde: "2025-11-01", hasta: "2025-11-18" });
  assert.deepEqual(rangoComparacion("2028-02-29", "2028-02-29", "anio"), { desde: "2027-02-28", hasta: "2027-02-28" });
});

test("leer filtros: valida valores, ignora basura y el rango manda sobre la fecha relativa", () => {
  const f = leerFiltrosBI({ rel: "mes_pasado", suc: ["a", "b"], canal: "rappi", dia: ["5", "9"], hora: "19-22", pago: ["tarjeta", "bitcoin"], cat: "pizza", prod: "  pepperoni " }, "2026-11-18");
  assert.equal(f.desde, "2026-10-01"); assert.equal(f.hasta, "2026-10-31");
  assert.deepEqual(f.suc, ["a", "b"]); assert.equal(f.canal, "rappi"); assert.deepEqual(f.dia, [5]);
  assert.deepEqual(f.hora, [19, 22]); assert.deepEqual(f.pago, ["tarjeta"]); assert.deepEqual(f.cat, ["pizza"]); assert.equal(f.prod, "pepperoni");
  const r = leerFiltrosBI({ rel: "hoy", desde: "2026-10-01", hasta: "2026-10-15" }, "2026-11-18");
  assert.equal(r.rel, null); assert.equal(r.desde, "2026-10-01"); assert.equal(r.hasta, "2026-10-15");
  const malo = leerFiltrosBI({ desde: "2026-10-15", hasta: "2026-10-01" }, "2026-11-18");
  assert.equal(malo.rel, "esta_semana"); // rango inválido → por defecto
  assert.equal(leerFiltrosBI({}, "2026-11-18").comp, "anterior");
});

test("parámetros para SQL: edad en meses y listas vacías como nulas", () => {
  const f = leerFiltrosBI({ edad: "6-12", hora: "7-11" }, "2026-11-18");
  const p = parametrosSQL(f, { desde: "2026-11-16", hasta: "2026-11-18" });
  assert.equal(p.edad_min, 6); assert.equal(p.edad_max, 12); assert.equal(p.hora_desde, 7); assert.equal(p.hora_hasta, 11);
  assert.equal(p.sucursales, null); assert.equal(p.categorias, null);
  assert.equal(parametrosSQL(leerFiltrosBI({ edad: "24+" }, "2026-11-18"), { desde: "x", hasta: "y" }).edad_max, null);
});

test("punto de equilibrio: fijos / (1 - variables/venta); sin dato o margen ≤ 0 → null", () => {
  const m = { venta_neta: 1000, alimento: 300, merma: 20, regalias: 60, agregadores: 20, marketing_agregadores: 0, repartidores: 0,
    nomina_cocina: 150, nomina_gerencia: 50, renta: 80, servicios: 20, mantenimiento: 10, consumibles_equipo: 5, marketing: 10, otros: 5, oficina: 20 };
  assert.equal(puntoEquilibrio(m), 350 / 0.6);
  assert.equal(puntoEquilibrio({ ...m, venta_neta: null }), null);
  assert.equal(puntoEquilibrio({ ...m, venta_neta: 0 }), null);
  assert.equal(puntoEquilibrio({ ...m, alimento: 1000 }), null);
});

test("prorrateo y meta del rango con faltantes", () => {
  assert.equal(prorratear(3000, "2026-11-01", "2026-11-10", "2026-11"), 1000);
  const metas = [{ sucursal_id: "a", mes: "2026-10-01", monto: 3100 }, { sucursal_id: "a", mes: "2026-11-01", monto: 3000 }, { sucursal_id: "b", mes: "2026-11-01", monto: 300 }];
  const r = metaDelRango(metas, ["a", "b"], "2026-10-30", "2026-11-02");
  assert.equal(r.monto, 200 + 200 + 20); // a: oct 2 días (200) + nov 2 días (200); b: nov 2 días (20)
  assert.deepEqual(r.faltan, [{ sucursal_id: "b", mes: "2026-10-01" }]);
});

test("mezclar categorías: Rappi se clasifica por nombre y se suma a POS", () => {
  const r = mezclarCategorias([{ categoria: "pizza", ventas: 100 }, { categoria: "bebida", ventas: 10 }], [{ nombre: "Combo Familiar", ventas: 50 }]);
  assert.deepEqual(r.find((x) => x.categoria === "combo"), { categoria: "combo", ventas: 50 });
  assert.equal(r.reduce((s, x) => s + x.ventas, 0), 160);
  assert.deepEqual(r.map((x) => x.categoria), [...r].sort((a, b) => b.ventas - a.ventas).map((x) => x.categoria));
});

test("url de BI conserva filtros y aplica cambios", () => {
  const f = leerFiltrosBI({ rel: "este_mes", suc: ["a"], canal: "pos" }, "2026-11-18");
  assert.equal(urlBI(f, { canal: "rappi" }), "/ventas/bi?rel=este_mes&comp=anterior&suc=a&canal=rappi");
});

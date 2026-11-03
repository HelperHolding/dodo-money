import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarAjustes, conDeltas, lineaAjuste, faltaTabla, RENGLONES_AJUSTABLES, rutaVolver, sumarDeltas, type AjusteVigente, type Deltas } from "./ajustes.ts";
import { calcularPL, entradaVacia, sumarEntradas, type EntradaPL } from "./pl.ts";

const ctx = (v: number) => ({ ventaNeta: v, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
const OCT = [{ mes: "2026-10", dias: 31, diasMes: 31, fraccion: 1, fin: "2026-10-31" }];
const aj = (x: Partial<AjusteVigente>): AjusteVigente =>
  ({ id: "a1", sucursalId: "s1", mes: "2026-10-01", renglon: "marketing", tipo: "tope_pct", valor: 0.05, nota: "Inauguración: solo el 5 %", ...x });
const filasDe = (e: EntradaPL) => calcularPL(e, [], ctx(e.ventaNeta));
const monto = (e: EntradaPL, clave: string) => filasDe(e).find((f) => f.clave === clave)!.monto;
const E: EntradaPL = { ...entradaVacia(), ventaNeta: 356560.09, gastos: { marketing: 34067.74, renta: 90000 } };

test("tope 5 % de marketing: el ejemplo de la inauguración", () => {
  const r = aplicarAjustes(filasDe(E), E, [aj({})], OCT);
  assert.deepEqual(r.deltas, { marketing: -16239.74 });
  assert.equal(r.lista.length, 1);
  const [a] = r.lista;
  assert.equal(a.nombre, "Marketing");
  assert.equal(a.real, 34067.74);
  assert.equal(a.ajustado, 17828);
  assert.equal(a.ajuste, -16239.74);
  assert.equal(a.sinEfecto, false);
  assert.equal(a.regla, "Tope 5 % de la venta neta = $17,828.00");
});

test("tope sin efecto: el real ya es menor al tope", () => {
  const e = { ...E, gastos: { marketing: 10000 } };
  const r = aplicarAjustes(filasDe(e), e, [aj({})], OCT);
  assert.deepEqual(r.deltas, {});
  assert.equal(r.lista[0].ajuste, 0);
  assert.equal(r.lista[0].ajustado, 10000);
  assert.equal(r.lista[0].sinEfecto, true);
});

test("monto negativo: limpia renta triplicada", () => {
  const r = aplicarAjustes(filasDe(E), E, [aj({ renglon: "renta", tipo: "monto", valor: -60000 })], OCT);
  assert.deepEqual(r.deltas, { renta: -60000 });
  assert.equal(r.lista[0].ajustado, 30000);
  assert.equal(r.lista[0].regla, "Monto -$60,000.00");
});

test("semana que cruza meses: montos proporcionales y vale el tope del mes con más días", () => {
  const meses = [
    { mes: "2026-10", dias: 3, diasMes: 31, fraccion: 3 / 31, fin: "2026-10-31" },
    { mes: "2026-11", dias: 4, diasMes: 30, fraccion: 4 / 30, fin: "2026-11-30" },
  ];
  const e = { ...entradaVacia(), ventaNeta: 100000, gastos: { renta: 50000, marketing: 20000 } };
  const r = aplicarAjustes(filasDe(e), e, [
    aj({ id: "r1", renglon: "renta", tipo: "monto", valor: -31000 }),
    aj({ id: "r2", renglon: "renta", tipo: "monto", valor: -30000, mes: "2026-11-01" }),
    aj({ id: "m1", valor: 0.02 }),
    aj({ id: "m2", valor: 0.1, mes: "2026-11-01" }),
    aj({ id: "fuera", renglon: "servicios", tipo: "monto", valor: -5000, mes: "2026-12-01" }),
  ], meses);
  assert.deepEqual(r.deltas, { renta: -7000, marketing: -10000 });
  assert.equal(r.lista.find((a) => a.id === "r1")!.regla, "Monto -$31,000.00 × 3/31");
  assert.equal(r.lista.find((a) => a.id === "m1")!.sinEfecto, true);
  assert.equal(r.lista.find((a) => a.id === "m2")!.ajustado, 10000);
  assert.equal(r.lista.some((a) => a.id === "fuera"), false);
});

test("sin venta neta, el tope no borra el gasto", () => {
  const e = { ...entradaVacia(), ventaNeta: 0, gastos: { marketing: 5000 } };
  const r = aplicarAjustes(filasDe(e), e, [aj({})], OCT);
  assert.deepEqual(r.deltas, {});
  assert.equal(r.lista[0].sinEfecto, true);
  assert.match(r.lista[0].regla, /sin venta neta/);
});

test("varios ajustes en una sucursal: totales iguales a recalcular con los montos ajustados", () => {
  const r = aplicarAjustes(filasDe(E), E, [aj({}), aj({ id: "a2", renglon: "renta", tipo: "monto", valor: -60000 })], OCT);
  const ajustada = filasDe(conDeltas(E, r.deltas));
  const manual = filasDe({ ...E, gastos: { marketing: 17828, renta: 30000 } });
  for (const clave of ["margen_bruto", "ebitda_tienda", "ebitda"]) {
    assert.equal(ajustada.find((f) => f.clave === clave)!.monto, manual.find((f) => f.clave === clave)!.monto, clave);
  }
  assert.equal(monto(conDeltas(E, r.deltas), "ebitda"), Math.round((monto(E, "ebitda")! + 16239.74 + 60000) * 100) / 100);
  assert.deepEqual(r.lista.map((a) => a.renglon), ["marketing", "renta"]);
});

test("cada renglón ajustable mueve solo su renglón; merma pendiente cuenta como cero", () => {
  const e = { ...entradaVacia(), ventaNeta: 1000 };
  const base = filasDe(e);
  for (const r of RENGLONES_AJUSTABLES) {
    const filas = filasDe(conDeltas(e, { [r]: 1 } as Deltas));
    for (const f of filas) {
      if (f.tipo === "total" || f.tipo === "detalle") continue;
      const antes = base.find((x) => x.clave === f.clave)!.monto ?? 0;
      assert.equal((f.monto ?? 0) - antes, f.clave === r ? 1 : 0, `${r} → ${f.clave}`);
    }
    assert.equal(filas.find((f) => f.clave === "ebitda")!.monto, base.find((f) => f.clave === "ebitda")!.monto! - 1, r);
  }
  assert.equal(conDeltas({ ...e, merma: null }, { merma: -5 }).merma, -5);
  assert.equal(conDeltas({ ...e, merma: null }, {}).merma, null);
});

test("consolidado: suma los deltas de cada sucursal, incluida oficina", () => {
  const a = { ...entradaVacia(), ventaNeta: 100000, gastos: { marketing: 9000 }, oficina: 5000 };
  const b = { ...entradaVacia(), ventaNeta: 200000, gastos: { marketing: 4000 }, oficina: 10000 };
  const ra = aplicarAjustes(filasDe(a), a, [aj({}), aj({ id: "o", renglon: "oficina", tipo: "monto", valor: -2000 })], OCT);
  const rb = aplicarAjustes(filasDe(b), b, [aj({ sucursalId: "s2" })], OCT);
  const total = sumarDeltas([ra.deltas, rb.deltas]);
  assert.deepEqual(total, { marketing: -4000, oficina: -2000 });
  const consolidado = sumarEntradas([a, b]);
  assert.equal(monto(conDeltas(consolidado, total), "ebitda"), Math.round((monto(consolidado, "ebitda")! + 6000) * 100) / 100);
  assert.equal(monto(conDeltas(consolidado, total), "oficina"), 13000);
});

test("lineaAjuste: una línea con sucursal, regla, real, ajustado y nota", () => {
  const [a] = aplicarAjustes(filasDe(E), E, [aj({})], OCT).lista;
  assert.equal(lineaAjuste({ ...a, sucursal: "Dodo Centro" }, true),
    "Dodo Centro · Marketing · Tope 5 % de la venta neta = $17,828.00 · real $34,067.74 → ajustado $17,828.00 (-$16,239.74) · Inauguración: solo el 5 %");
  assert.equal(lineaAjuste({ ...a, sucursal: "Dodo Centro" }, false).startsWith("Marketing · "), true);
});

test("rutaVolver: solo regresa a /finanzas", () => {
  assert.equal(rutaVolver("/finanzas?mes=2026-10&sucursal=x&vista=meta"), "/finanzas?mes=2026-10&sucursal=x&vista=meta");
  assert.equal(rutaVolver("https://otro.com/finanzas?x"), "/finanzas");
  assert.equal(rutaVolver("//otro.com/finanzas?x"), "/finanzas");
  assert.equal(rutaVolver("/finanzas/../otro?x"), "/finanzas");
  assert.equal(rutaVolver(null), "/finanzas");
});

test("faltaTabla reconoce la tabla ausente y nada más", () => {
  assert.equal(faltaTabla({ code: "42P01", message: "x" }), true);
  assert.equal(faltaTabla({ code: "PGRST205", message: "x" }), true);
  assert.equal(faltaTabla({ message: 'relation "public.pl_ajustes" does not exist' }), true);
  assert.equal(faltaTabla({ message: "Could not find the table 'public.pl_ajustes' in the schema cache" }), true);
  assert.equal(faltaTabla({ code: "42501", message: "permission denied for table pl_ajustes" }), false);
  assert.equal(faltaTabla({ message: 'relation "otra" does not exist' }), false);
  assert.equal(faltaTabla(null), false);
});

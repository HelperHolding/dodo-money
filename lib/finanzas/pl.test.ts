import { test } from "node:test";
import assert from "node:assert/strict";
import { avisosSinCapturar, calcularPL, entradaVacia, escalarMetas, finDeMes, metaMonto, resumenCanalPL, sumarEntradas, sumarMetas, type EntradaPL } from "./pl.ts";

test("finDeMes", () => {
  assert.equal(finDeMes("2026-10"), "2026-10-31");
  assert.equal(finDeMes("2028-02"), "2028-02-29");
});

test("sumarMetas: el consolidado suma las metas en pesos de cada sucursal", () => {
  const a = { metas: [{ renglon: "alimento", tipo: "pct" as const, valor: 0.3 }, { renglon: "renta", tipo: "monto" as const, valor: 30000 }], ctx: { ventaNeta: 100000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } } };
  const b = { metas: [{ renglon: "alimento", tipo: "pct" as const, valor: 0.3 }], ctx: { ventaNeta: 50000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } } };
  const m = sumarMetas([a, b]);
  assert.deepEqual(m.find((x) => x.renglon === "alimento"), { renglon: "alimento", tipo: "monto", valor: 45000, fijo: false });
  assert.deepEqual(m.find((x) => x.renglon === "renta"), { renglon: "renta", tipo: "monto", valor: 30000, fijo: true });
  assert.equal(m.some((x) => x.renglon === "marketing"), false);
});

const E: EntradaPL = {
  ...entradaVacia(),
  ventaNeta: 100000, descuentos: 2000, alimento: 31000, merma: null,
  nomina: { cocina: 20000, gerencia: 8000 },
  gastos: { renta: 9000, servicios: 4500, marketing: 3000, otros: 500 },
  sinCuenta: 200, agregadores: 0, comisionesCobro: 1300, faltantes: 150, regalias: 5000, oficina: 4000,
  memos: { insumos: 28000, inversiones: 15000 },
};
const CTX = { ventaNeta: 100000, ventaRappi: 20000, plantilla: { cocina: 19000, gerencia: 8000 } };

test("calcularPL: otros suma comisiones de cobro, faltantes y gastos sin cuenta; EBITDA de tienda y EBITDA", () => {
  const filas = calcularPL(E, [], CTX);
  const f = (c: string) => filas.find((x) => x.clave === c)!;
  assert.equal(f("otros").monto, 500 + 200 + 1300 + 150);
  assert.equal(f("merma").monto, null);
  assert.equal(f("ebitda_tienda").monto, 100000 - (31000 + 20000 + 8000 + 9000 + 4500 + 3000 + 2150 + 5000));
  assert.equal(f("ebitda").monto, f("ebitda_tienda").monto! - 4000);
  assert.equal(f("renta").pct, 0.09);
});

test("metaMonto: %, monto fijo, % de Rappi y plantilla", () => {
  assert.equal(metaMonto({ renglon: "alimento", tipo: "pct", valor: 0.3 }, CTX), 30000);
  assert.equal(metaMonto({ renglon: "renta", tipo: "monto", valor: 30000 }, CTX), 30000);
  assert.equal(metaMonto({ renglon: "agregadores", tipo: "pct_rappi", valor: 0.18 }, CTX), 3600);
  assert.equal(metaMonto({ renglon: "nomina_cocina", tipo: "plantilla", valor: 0 }, CTX), 19000);
});

test("calcularPL con metas: diferencia = real − meta; EBITDA meta = venta − metas", () => {
  const filas = calcularPL(E, [{ renglon: "alimento", tipo: "pct", valor: 0.3 }, { renglon: "renta", tipo: "monto", valor: 30000 }], CTX);
  const ali = filas.find((x) => x.clave === "alimento")!;
  assert.deepEqual([ali.meta, ali.metaPct, ali.diferencia], [30000, 0.3, 1000]);
  assert.equal(filas.find((x) => x.clave === "marketing")!.meta, null);
});

test("venta 0: los % quedan en null (mes sin ventas importadas)", () => {
  const filas = calcularPL({ ...entradaVacia(), gastos: { renta: 1000 } }, [], { ventaNeta: 0, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
  assert.equal(filas.find((x) => x.clave === "renta")!.pct, null);
});

test("sumarEntradas: consolidado", () => {
  const s = sumarEntradas([E, { ...E, gastos: { renta: 1000 }, memos: { insumos: 1, inversiones: 0 } }]);
  assert.equal(s.ventaNeta, 200000);
  assert.equal(s.gastos.renta, 10000);
  assert.equal(s.gastos.servicios, 4500);
  assert.equal(s.merma, null);
  assert.equal(s.memos.insumos, 28001);
});

test("escalarMetas: solo el monto fijo se reparte por días", () => {
  assert.deepEqual(escalarMetas([
    { renglon: "renta", tipo: "monto", valor: 31000 },
    { renglon: "alimento", tipo: "pct", valor: 0.3 },
    { renglon: "nomina_cocina", tipo: "plantilla", valor: 0 },
  ], 7 / 31), [
    { renglon: "renta", tipo: "monto", valor: 7000 },
    { renglon: "alimento", tipo: "pct", valor: 0.3 },
    { renglon: "nomina_cocina", tipo: "plantilla", valor: 0 },
  ]);
});

test("margen bruto: venta − alimento − merma, con su meta", () => {
  const ctx = { ventaNeta: 1000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } };
  const filas = calcularPL({ ...entradaVacia(), ventaNeta: 1000, alimento: 310, merma: 15 },
    [{ renglon: "alimento", tipo: "pct", valor: 0.3 }, { renglon: "merma", tipo: "pct", valor: 0.02 }], ctx);
  const mb = filas.find((f) => f.clave === "margen_bruto")!;
  assert.deepEqual([mb.tipo, mb.monto, mb.pct, mb.meta, mb.diferencia], ["total", 675, 0.675, 680, -5]);
  const sinMerma = calcularPL({ ...entradaVacia(), ventaNeta: 100, alimento: 30 }, [], { ...ctx, ventaNeta: 100 });
  assert.equal(sinMerma.find((f) => f.clave === "margen_bruto")!.monto, 70);
});

test("meta fija en pesos y 'sin capturar': costo fijo con meta y real en cero", () => {
  const ctx = { ventaNeta: 100000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } };
  const filas = calcularPL({ ...entradaVacia(), ventaNeta: 100000, alimento: 30000, gastos: { servicios: 4000 } }, [
    { renglon: "renta", tipo: "monto", valor: 30000 }, { renglon: "servicios", tipo: "monto", valor: 20000 },
    { renglon: "alimento", tipo: "pct", valor: 0.3 },
  ], ctx);
  const f = (c: string) => filas.find((x) => x.clave === c)!;
  assert.deepEqual([f("renta").metaFija, f("renta").sinCapturar, f("renta").diferencia], [true, true, -30000]);
  assert.deepEqual([f("servicios").metaFija, f("servicios").sinCapturar], [true, false]);
  assert.deepEqual([f("alimento").metaFija, f("alimento").sinCapturar], [false, false]);
  assert.deepEqual([f("marketing").metaFija, f("marketing").sinCapturar], [false, false]);
  assert.deepEqual(avisosSinCapturar(filas), ["Renta sin capturar en este periodo (meta $30,000.00)."]);
});

test("consolidado: una meta que era en % no se vuelve fija; una de monto sí", () => {
  const ctx = { ventaNeta: 150000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } };
  const metas = sumarMetas([
    { metas: [{ renglon: "alimento", tipo: "pct", valor: 0.3 }, { renglon: "renta", tipo: "monto", valor: 30000 }], ctx: { ...ctx, ventaNeta: 100000 } },
    { metas: [{ renglon: "alimento", tipo: "pct", valor: 0.3 }], ctx: { ...ctx, ventaNeta: 50000 } },
  ]);
  const filas = calcularPL({ ...entradaVacia(), ventaNeta: 150000, alimento: 1000 }, metas, ctx);
  assert.equal(filas.find((x) => x.clave === "alimento")!.metaFija, false);
  assert.deepEqual(avisosSinCapturar(filas), ["Renta sin capturar en este periodo (meta $30,000.00)."]);
});


test("P&L por fuente: bruto con IVA, neto sin IVA y costo sin doble resta", () => {
  const dodo = resumenCanalPL([{ fecha: "2026-10-01", total: 116, iva: 16 }],
    [{ fecha: "2026-10-01", importe: 116, importe_sin_descuento: 140 }], 30);
  const rappi = resumenCanalPL([{ fecha: "2026-10-01", total: 232, iva: 32 }],
    [{ fecha: "2026-10-01", importe: 232, importe_sin_descuento: 300 }], 60);
  const e = { ...entradaVacia(), canales: { dodo, rappi }, ventaNeta: 300, alimento: 90 };
  const f = new Map(calcularPL(e, [], { ventaNeta: 300, ventaRappi: 232, plantilla: { cocina: 0, gerencia: 0 } }).map(f => [f.clave, f]));
  assert.equal(f.get("venta_bruta")!.monto, 440);
  assert.equal(f.get("venta_bruta_dodo")!.monto, 140);
  assert.equal(f.get("venta_neta_rappi")!.monto, 200);
  assert.equal(f.get("alimento_rappi")!.monto, 60);
  assert.equal(f.get("alimento")!.monto, 90);
  assert.equal(f.get("ebitda")!.monto, 210);
  assert.equal(f.get("margen_bruto")!.monto, 210);
  const suma = sumarEntradas([e, e]);
  assert.deepEqual(suma.canales.rappi, { bruta: 600, neta: 400, alimento: 120 });
});

test("Venta bruta incompleta: no se inventa; el consolidado conserva sin dato", () => {
  const dodo = resumenCanalPL([{ fecha: "2026-10-01", total: 116, iva: 16 }], [], 0);
  assert.deepEqual(dodo, { bruta: null, neta: 100, alimento: 0 });
  const e = { ...entradaVacia(), canales: { dodo, rappi: { bruta: 300, neta: 200, alimento: 60 } } };
  const suma = sumarEntradas([entradaVacia(), e]);
  assert.equal(suma.canales.dodo.bruta, null);
  const filas = calcularPL(suma, [], { ventaNeta: 0, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
  assert.equal(filas.find(f => f.clave === "venta_bruta")!.monto, null);
  assert.equal(filas.find(f => f.clave === "venta_bruta_rappi")!.monto, 300);
  assert.equal(resumenCanalPL([], [], 0).bruta, 0);
  // Un faltante no se compensa con un sobrante en otro día.
  assert.equal(resumenCanalPL([{ fecha: "a", total: 100, iva: 0 }, { fecha: "b", total: 100, iva: 0 }],
    [{ fecha: "a", importe: 90, importe_sin_descuento: 100 }, { fecha: "b", importe: 110, importe_sin_descuento: 120 }], 0).bruta, null);
});


test("bruta: tolerancia de $1 y diferencia histórica justificada con productos",()=>{
 const dias=[{fecha:"2026-10-01",total:100,iva:16}];
 const productos=[{fecha:"2026-10-01",importe:80,importe_sin_descuento:120}];
 assert.equal(resumenCanalPL(dias,productos,20).bruta,null);
 assert.equal(resumenCanalPL([{...dias[0],conciliada:true}],productos,20).bruta,120);
 assert.equal(resumenCanalPL([{...dias[0],conciliada:true}],[],20).bruta,null);
 assert.equal(resumenCanalPL(dias,[{...productos[0],importe:99}],20).bruta,120);
 assert.equal(resumenCanalPL(dias,[{...productos[0],importe:98.99}],20).bruta,null);
});

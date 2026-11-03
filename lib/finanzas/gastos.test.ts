import { test } from "node:test";
import assert from "node:assert/strict";
import { cobrosReclasificados, enResultado, facturasAGastos, faltantesDe, partesFactura, sumarGastos } from "./gastos.ts";

test("facturasAGastos: subtotal − descuento; notas de crédito restan; canceladas fuera; memos aparte", () => {
  const r = facturasAGastos([
    { tipo: "ingreso", estado: "por_pagar", subtotal: 1000, descuento: 100, cuenta_pl: "servicios" },
    { tipo: "egreso", estado: "pagada", subtotal: 200, descuento: 0, cuenta_pl: "servicios" },
    { tipo: "ingreso", estado: "cancelada", subtotal: 999, descuento: 0, cuenta_pl: "servicios" },
    { tipo: "ingreso", estado: "pagada", subtotal: 300, descuento: 0, cuenta_pl: null },
    { tipo: "ingreso", estado: "pagada", subtotal: 5000, descuento: 0, cuenta_pl: "insumos" },
    { tipo: "ingreso", estado: "pagada", subtotal: 8000, descuento: 0, cuenta_pl: "inversiones" },
  ]);
  assert.deepEqual(r, { gastos: { servicios: 700 }, sinCuenta: 300, memos: { insumos: 5000, inversiones: 8000 } });
});

test("sumarGastos y faltantes", () => {
  assert.deepEqual(sumarGastos({ renta: 100 }, { renta: 50, otros: 1 }), { renta: 150, otros: 1 });
  assert.equal(faltantesDe([-50, 20, -10.5]), 40.5);
});

test("cobrosReclasificados: el cobro con tarjeta que se registró como efectivo compensa el faltante del arqueo de ese día", () => {
  // La Calma, 28-oct: Dodo IS importó $10,267 en efectivo; la conciliación deja $3,319 y el arqueo de cierre faltó $6,948.
  const r = cobrosReclasificados([{ fecha: "2026-10-28", diferencia: -6948 }], [{ fecha: "2026-10-28", importado: 10267, conciliado: 3319 }]);
  assert.deepEqual(r, { total: 6948, porDia: [{ fecha: "2026-10-28", monto: 6948 }] });
});

test("cobrosReclasificados: se topa al faltante del día y un día sin faltante no inventa un sobrante", () => {
  const r = cobrosReclasificados(
    [{ fecha: "2026-10-28", diferencia: -1000 }, { fecha: "2026-10-29", diferencia: 0 }, { fecha: "2026-10-30", diferencia: 50 }],
    [
      { fecha: "2026-10-28", importado: 5000, conciliado: 2000 },
      { fecha: "2026-10-29", importado: 4000, conciliado: 1000 },
      { fecha: "2026-10-30", importado: 4000, conciliado: 1000 },
    ],
  );
  assert.deepEqual(r, { total: 1000, porDia: [{ fecha: "2026-10-28", monto: 1000 }] });
});

test("cobrosReclasificados: el faltante de varios turnos del día se suma antes del tope", () => {
  const r = cobrosReclasificados(
    [{ fecha: "2026-11-01", diferencia: -3000 }, { fecha: "2026-11-01", diferencia: -6326.22 }],
    [{ fecha: "2026-11-01", importado: 15000, conciliado: 4000 }],
  );
  assert.deepEqual(r, { total: 9326.22, porDia: [{ fecha: "2026-11-01", monto: 9326.22 }] });
});

test("cobrosReclasificados: sin conciliación, o si la conciliación sube el efectivo, no compensa", () => {
  assert.deepEqual(cobrosReclasificados([{ fecha: "2026-10-28", diferencia: -6948 }], []), { total: 0, porDia: [] });
  assert.deepEqual(
    cobrosReclasificados([{ fecha: "2026-10-28", diferencia: -6948 }], [{ fecha: "2026-10-28", importado: 3000, conciliado: 3500 }]),
    { total: 0, porDia: [] },
  );
});

test("facturasAGastos con fracción: cada factura por su propia fracción", () => {
  const r = facturasAGastos([
    { tipo: "ingreso", estado: "pagada", subtotal: 3000, descuento: 0, cuenta_pl: "renta", fecha_emision: "2026-09-05" },
    { tipo: "ingreso", estado: "pagada", subtotal: 3100, descuento: 0, cuenta_pl: "renta", fecha_emision: "2026-10-02" },
    { tipo: "egreso", estado: "pagada", subtotal: 310, descuento: 0, cuenta_pl: null, fecha_emision: "2026-10-20" },
  ], (f) => (f.fecha_emision?.startsWith("2026-09") ? 0.1 : 4 / 31));
  assert.deepEqual(r, { gastos: { renta: 700 }, sinCuenta: -40, memos: { insumos: 0, inversiones: 0 } });
});

const c2 = (n: number) => Math.round(n * 100) / 100;

test("partesFactura: por concepto con su cuenta; sin cuenta, la de la factura; descuento repartido", () => {
  const renta = { tipo: "ingreso" as const, estado: "por_pagar", subtotal: 31200, descuento: 0, cuenta_pl: "renta",
    conceptos: [{ descripcion: "Renta", importe: 30000, cuenta_pl: "renta" }, { descripcion: "Agua", importe: 1200, cuenta_pl: "servicios" }] };
  assert.deepEqual(partesFactura(renta).map((p) => [p.cuenta, c2(p.monto)]), [["renta", 30000], ["servicios", 1200]]);
  assert.deepEqual(partesFactura(renta, 7 / 31).map((p) => c2(p.monto)), [6774.19, 270.97]);
  const conDescuento = { tipo: "ingreso" as const, estado: "pagada", subtotal: 1000, descuento: 100, cuenta_pl: "otros",
    conceptos: [{ importe: 600, cuenta_pl: "insumos" }, { importe: 400, cuenta_pl: null }] };
  assert.deepEqual(partesFactura(conDescuento).map((p) => [p.cuenta, c2(p.monto)]), [["insumos", 540], ["otros", 360]]);
  assert.deepEqual(partesFactura({ ...renta, tipo: "egreso", conceptos: [] }), [{ cuenta: "renta", monto: -31200, concepto: null }]);
  assert.deepEqual(partesFactura({ ...renta, estado: "cancelada" }), []);
});

test("facturasAGastos reparte por conceptos", () => {
  const r = facturasAGastos([{ tipo: "ingreso", estado: "por_pagar", subtotal: 31200, descuento: 0, cuenta_pl: "renta",
    conceptos: [{ importe: 30000, cuenta_pl: "renta" }, { importe: 1200, cuenta_pl: "servicios" }] }]);
  assert.deepEqual(r, { gastos: { renta: 30000, servicios: 1200 }, sinCuenta: 0, memos: { insumos: 0, inversiones: 0 } });
});

test("enResultado: suma lo que mueve el resultado; insumos e inversiones (memo) no", () => {
  assert.equal(enResultado([{ cuenta: "servicios", monto: 100 }, { cuenta: "insumos", monto: 900 }, { cuenta: null, monto: 5 }, { cuenta: "inversiones", monto: 50 }]), 105);
});

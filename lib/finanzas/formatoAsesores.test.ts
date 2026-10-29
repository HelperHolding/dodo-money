import { test } from "node:test";
import assert from "node:assert/strict";
import { formatoAsesores } from "./formatoAsesores.ts";
import { calcularPL, entradaVacia, sumarEntradas, type EntradaPL } from "./pl.ts";

const ctx = (v: number) => ({ ventaNeta: v, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
const E: EntradaPL = {
  ...entradaVacia(),
  canales: {
    dodo: { bruta: 104400, brutaSinIva: 90000, neta: 85000, alimento: 26000 },
    rappi: { bruta: 23200, brutaSinIva: 20000, neta: 15000, alimento: 5000 },
  },
  ventaNeta: 100000, descuentos: 10000, alimento: 31000, merma: 2000,
  nomina: { cocina: 20000, gerencia: 8000 },
  gastos: { renta: 9000, servicios: 4500, marketing: 3000, mantenimiento: 1000, marketing_agregadores: 600, otros: 500 },
  sinCuenta: 200, agregadores: 3000, comisionesCobro: 1300, faltantes: 150, regalias: 5000, oficina: 4000,
};
const formato = (e: EntradaPL) => formatoAsesores(e, calcularPL(e, [], ctx(e.ventaNeta)));
const de = (f: ReturnType<typeof formato>, clave: string) => {
  const r = f.renglones.find((x) => x.clave === clave);
  assert.ok(r, `falta el renglón ${clave}`);
  return r;
};

test("estructura de la plantilla en orden, con ventas brutas, descuentos y netas por canal", () => {
  const f = formato(E);
  assert.deepEqual(f.renglones.map((r) => r.clave), [
    "ventas_dinein", "ventas_rappi", "ventas_brutas", "descuentos_dinein", "descuentos_rappi", "total_descuentos", "ventas_netas", "comision_rappi",
    "alimento", "merma", "utilidad_bruta",
    "nomina", "regalias", "mantenimiento", "renta", "servicios", "marketing_rappi", "marketing", "comisiones_cobro", "otros", "total_sucursal", "ebitda_4wall",
    "corporativo", "ebitda",
    "dya", "ebit", "intereses", "uai", "isr", "utilidad_neta",
  ]);
  assert.equal(de(f, "ventas_brutas").monto, 110000);
  assert.equal(de(f, "descuentos_dinein").monto, 5000);
  assert.equal(de(f, "total_descuentos").monto, 10000);
  assert.equal(de(f, "ventas_netas").monto, 100000);
  assert.equal(de(f, "nomina").monto, 28000);
  assert.deepEqual(de(f, "nomina").origen, ["nomina_cocina", "nomina_gerencia"]);
  assert.equal(f.base, "bruta");
  assert.equal(de(f, "ventas_brutas").pct, 1);
  assert.equal(de(f, "ventas_netas").pct, 100000 / 110000);
});

test("comisión Rappi arriba de utilidad bruta; EBITDA 4-Wall y EBITDA iguales a calcularPL", () => {
  const filas = calcularPL(E, [], ctx(E.ventaNeta));
  const f = formatoAsesores(E, filas);
  assert.equal(de(f, "utilidad_bruta").monto, 100000 - 3000 - 31000 - 2000);
  assert.equal(de(f, "ebitda_4wall").monto, filas.find((x) => x.clave === "ebitda_tienda")!.monto);
  assert.equal(de(f, "ebitda").monto, filas.find((x) => x.clave === "ebitda")!.monto);
});

test("comisiones de cobro salen de Otros; Otros conserva sin cuenta y faltantes", () => {
  const f = formato(E);
  assert.equal(de(f, "comisiones_cobro").monto, 1300);
  assert.deepEqual(de(f, "comisiones_cobro").origen, ["comisiones_cobro"]);
  assert.equal(de(f, "otros").monto, 500 + 200 + 150);
});

test("renglones extra en cero se ocultan; los de la plantilla siempre se muestran", () => {
  const f = formato({ ...E, gastos: {}, sinCuenta: 0, faltantes: 0, comisionesCobro: 0 });
  assert.equal(f.renglones.some((r) => r.clave === "marketing"), false);
  assert.equal(f.renglones.some((r) => r.clave === "comisiones_cobro"), false);
  assert.equal(de(f, "renta").monto, 0);
  assert.equal(de(f, "marketing_rappi").monto, 0);
});

test("Rappi fuera de base y excedente se suman a ventas netas y cuadran con EBITDA", () => {
  const e = { ...E, rappiFueraBase: 600, rappiExcedente: 400, rappiAjustes: 250 };
  const filas = calcularPL(e, [], ctx(e.ventaNeta));
  const f = formatoAsesores(e, filas);
  assert.equal(de(f, "rappi_fuera_base").monto, 600);
  assert.equal(de(f, "rappi_excedente").monto, 400);
  assert.equal(de(f, "ventas_netas").monto, 101000);
  assert.equal(de(f, "rappi_ajustes").monto, 250);
  assert.equal(de(f, "ebitda").monto, filas.find((x) => x.clave === "ebitda")!.monto);
});

test("venta bruta desconocida: brutas y descuentos del canal en Pendiente, % sobre netas y aviso", () => {
  const f = formato({ ...E, canales: { ...E.canales, rappi: { bruta: 23200, brutaSinIva: null, neta: 15000, alimento: 5000 } } });
  assert.equal(de(f, "ventas_rappi").monto, null);
  assert.equal(de(f, "ventas_brutas").monto, null);
  assert.equal(de(f, "descuentos_rappi").monto, null);
  assert.equal(de(f, "descuentos_dinein").monto, 5000);
  assert.equal(f.base, "neta");
  assert.equal(de(f, "ventas_netas").pct, 1);
  assert.deepEqual(f.avisos, ["La venta bruta sin IVA no está completa (falta detalle por producto de algún día, o Rappi usa el reporte financiero); los porcentajes se calculan sobre ventas netas."]);
});

test("ventas brutas por canal sin detalle de origen: el detalle era la venta neta", () => {
  const f = formato(E);
  assert.deepEqual(de(f, "ventas_dinein").origen, []);
  assert.deepEqual(de(f, "ventas_rappi").origen, []);
});

test("merma pendiente: totales provisionales conservan el monto", () => {
  const f = formato({ ...E, merma: 140, mermaPendiente: true });
  for (const k of ["utilidad_bruta", "total_sucursal", "ebitda_4wall", "ebitda"]) {
    assert.equal(de(f, k).pendiente, true, k);
    assert.notEqual(de(f, k).monto, null, k);
  }
  assert.equal(de(f, "utilidad_bruta").monto, 100000 - 3000 - 31000 - 140);
  assert.equal(de(f, "ventas_netas").pendiente, false);
  assert.equal(de(f, "comision_rappi").pendiente, false);
  assert.equal(de(formato(E), "ebitda").pendiente, false);
});

test("Rappi pendiente: ventas netas, comisión y totales provisionales", () => {
  const f = formato({ ...E, rappiPendiente: true });
  for (const k of ["ventas_netas", "comision_rappi", "utilidad_bruta", "total_sucursal", "ebitda_4wall", "ebitda"]) {
    assert.equal(de(f, k).pendiente, true, k);
    assert.notEqual(de(f, k).monto, null, k);
  }
  assert.equal(de(f, "ventas_netas").monto, 100000);
});

test("merma: pendiente sin monto muestra Pendiente; parcial conserva el monto marcado", () => {
  const sin = formato({ ...E, merma: null, mermaPendiente: true });
  assert.equal(de(sin, "merma").monto, null);
  assert.equal(de(sin, "merma").pendiente, true);
  assert.equal(de(sin, "utilidad_bruta").monto, 100000 - 3000 - 31000);
  const parcial = formato({ ...E, merma: 140, mermaPendiente: true });
  assert.equal(de(parcial, "merma").monto, 140);
  assert.equal(de(parcial, "merma").pendiente, true);
});

test("bajo EBITDA todo en Pendiente", () => {
  const f = formato(E);
  for (const k of ["dya", "ebit", "intereses", "uai", "isr", "utilidad_neta"]) {
    assert.equal(de(f, k).monto, null);
    assert.equal(de(f, k).pendiente, true);
    assert.equal(de(f, k).pct, null);
  }
});

test("venta en cero: sin división entre cero", () => {
  const f = formato({ ...entradaVacia(), regalias: 100 });
  assert.equal(de(f, "ventas_brutas").monto, 0);
  assert.equal(de(f, "regalias").pct, null);
  assert.equal(de(f, "ebitda").monto, -100);
});

test("EBITDA negativo conserva el signo", () => {
  const f = formato({ ...E, oficina: 80000 });
  assert.ok(de(f, "ebitda").monto! < 0);
  assert.equal(de(f, "corporativo").monto, 80000);
});

test("consolidado: la suma de sucursales cuadra igual", () => {
  const e = sumarEntradas([E, { ...E, rappiFueraBase: 60, comisionesCobro: 7 }]);
  const filas = calcularPL(e, [], ctx(e.ventaNeta));
  const f = formatoAsesores(e, filas);
  assert.equal(de(f, "ebitda_4wall").monto, filas.find((x) => x.clave === "ebitda_tienda")!.monto);
  assert.equal(de(f, "comisiones_cobro").monto, 1307);
});

test("si no cuadra con calcularPL, lanza error", () => {
  const filas = calcularPL(E, [], ctx(E.ventaNeta)).map((x) => (x.clave === "ebitda_tienda" ? { ...x, monto: x.monto! + 1 } : x));
  assert.throws(() => formatoAsesores(E, filas), /no cuadra/);
});

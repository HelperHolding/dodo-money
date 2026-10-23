import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularGasto, IMPUESTOS_ARRENDAMIENTO, leerGastoManual } from "./gastoManual.ts";

const CUENTAS = ["renta", "servicios", "otros"];

test("calcularGasto: renta + agua de persona física (16 %, 2/3 de IVA, 10 % de ISR)", () => {
  assert.deepEqual(calcularGasto([{ importe: 30000 }, { importe: 1200 }], IMPUESTOS_ARRENDAMIENTO),
    { subtotal: 31200, iva: 4992, retencion_iva: 3328, retencion_isr: 3120, retenciones: 6448, total: 29744 });
  assert.deepEqual(calcularGasto([{ importe: 1000.25 }, { importe: 0.1 }, { importe: 0.2 }], { iva: 0, retIva: "ninguna", retIsr: "ninguna" }),
    { subtotal: 1000.55, iva: 0, retencion_iva: 0, retencion_isr: 0, retenciones: 0, total: 1000.55 });
  assert.equal(calcularGasto([{ importe: 100 }], { iva: 0.16, retIva: "dos_tercios", retIsr: "ninguna" }).retencion_iva, 10.67);
});

const form = (o: Record<string, string>, renglones: string[][]) => ({
  valor: (c: string) => o[c] ?? "",
  lista: (c: string) => renglones.map((r) => r[{ renglon_descripcion: 0, renglon_importe: 1, renglon_cuenta: 2 }[c] ?? 0] ?? ""),
});
const BASE = { proveedor_id: "11111111-1111-1111-1111-111111111111", sucursal_id: "22222222-2222-2222-2222-222222222222", fecha: "2026-10-01", folio: " Prefactura 10 ", iva: "16", ret_iva: "dos_tercios", ret_isr: "diez" };

test("ISR RESICO: PDF Photobooth, retención sobre subtotal y total de $5,510", () => {
  const f = form({ ...BASE, fecha: "2026-10-09", ret_iva: "ninguna", ret_isr: "resico" }, [["Anticipo Servicio Photobooth", "4801.74", "otros"]]);
  const r = leerGastoManual(f.valor, f.lista, CUENTAS, "2026-10-23");
  assert.ok("datos" in r);
  assert.equal(r.datos.subtotal, 4801.74);
  assert.equal(r.datos.iva, 768.28);
  assert.equal(r.datos.retencion_iva, 0);
  assert.equal(r.datos.retencion_isr, 60.02);
  assert.equal(r.datos.total, 5510);
  assert.deepEqual(calcularGasto([{ importe: 4801.74 }], { iva: 0.16, retIva: "ninguna", retIsr: "resico" }),
    { subtotal: 4801.74, iva: 768.28, retencion_iva: 0, retencion_isr: 60.02, retenciones: 60.02, total: 5510 });
});

test("ISR RESICO: suma renglones antes de redondear la retención y rechaza tasas desconocidas", () => {
  assert.equal(calcularGasto([{ importe: 100.4 }, { importe: 100.4 }], { iva: 0.16, retIva: "ninguna", retIsr: "resico" }).retencion_isr, 2.51);
  const f = form({ ...BASE, ret_isr: "1.25" }, [["Servicio", "100", "otros"]]);
  assert.deepEqual(leerGastoManual(f.valor, f.lista, CUENTAS, "2026-10-23"), { error: "Elige una retención de ISR válida." });
});

test("leerGastoManual: datos completos, renglones vacíos se ignoran, Oficina = sin sucursal", () => {
  const f = form(BASE, [["Renta", "30,000", "renta"], ["Agua", "1200", "servicios"], ["", "", ""]]);
  const r = leerGastoManual(f.valor, f.lista, CUENTAS, "2026-10-05");
  assert.ok("datos" in r);
  assert.deepEqual(r.datos, {
    proveedor_id: BASE.proveedor_id, sucursal_id: BASE.sucursal_id, fecha: "2026-10-01", vence_el: null, folio: "Prefactura 10",
    renglones: [{ descripcion: "Renta", importe: 30000, cuenta_pl: "renta" }, { descripcion: "Agua", importe: 1200, cuenta_pl: "servicios" }],
    subtotal: 31200, iva: 4992, retencion_iva: 3328, retencion_isr: 3120, total: 29744,
  });
  const o = form({ ...BASE, sucursal_id: "oficina" }, [["Luz", "500", ""]]);
  const r2 = leerGastoManual(o.valor, o.lista, CUENTAS, "2026-10-05");
  assert.ok("datos" in r2);
  assert.equal(r2.datos.sucursal_id, null);
  assert.equal(r2.datos.renglones[0].cuenta_pl, null);
});

test("leerGastoManual: errores claros", () => {
  const caso = (o: Record<string, string>, renglones: string[][]) => { const f = form({ ...BASE, ...o }, renglones); return leerGastoManual(f.valor, f.lista, CUENTAS, "2026-10-05"); };
  const ok = [["Renta", "100", "renta"]];
  assert.deepEqual(caso({ proveedor_id: "" }, ok), { error: "Elige el proveedor." });
  assert.deepEqual(caso({ folio: "  " }, ok), { error: "Escribe la referencia (folio de la prefactura o del recibo)." });
  assert.deepEqual(caso({ fecha: "2026-10-06" }, ok), { error: "La fecha no puede ser futura." });
  assert.deepEqual(caso({ vence_el: "2026-09-30" }, ok), { error: "El vencimiento no puede ser antes de la fecha." });
  assert.deepEqual(caso({}, []), { error: "Agrega al menos un renglón con descripción e importe." });
  assert.deepEqual(caso({}, [["Renta", "", "renta"]]), { error: "Renglón 1: escribe un importe mayor a cero." });
  assert.deepEqual(caso({}, [["", "100", "renta"]]), { error: "Renglón 1: escribe la descripción." });
  assert.deepEqual(caso({}, [["Renta", "100", "comida"]]), { error: "Renglón 1: elige una cuenta del P&L de la lista." });
  assert.deepEqual(caso({ iva: "0", ret_iva: "dos_tercios" }, ok), { error: "La retención de IVA necesita IVA del 16 %." });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerOrigen, NOMBRE_ORIGEN, porReponerAEmpleados, sumaPorOrigen } from "./gastos.ts";

test("leerOrigen acepta los tres orígenes y nada más", () => {
  assert.equal(leerOrigen("caja_chica"), "caja_chica");
  assert.equal(leerOrigen("boveda"), "boveda");
  assert.equal(leerOrigen("empleado"), "empleado");
  assert.equal(leerOrigen(""), null);
  assert.equal(leerOrigen("banco"), null);
  assert.equal(leerOrigen(null), null);
  assert.equal(NOMBRE_ORIGEN.empleado, "Lo pagó un empleado");
});

test("sumaPorOrigen separa caja chica, bóveda y empleados", () => {
  assert.deepEqual(sumaPorOrigen([
    { origen: "caja_chica", monto: 100 },
    { origen: "caja_chica", monto: "50.25" },
    { origen: "boveda", monto: 40 },
    { origen: "empleado", monto: 7 },
  ]), { caja_chica: 150.25, boveda: 40, empleado: 7 });
  assert.deepEqual(sumaPorOrigen([]), { caja_chica: 0, boveda: 0, empleado: 0 });
});

test("porReponerAEmpleados agrupa por persona lo que falta reponer, el mayor primero", () => {
  const r = porReponerAEmpleados([
    { id: "1", origen: "empleado", pagado_por: "ana", repuesto_en: null, monto: 100 },
    { id: "2", origen: "empleado", pagado_por: "luis", repuesto_en: null, monto: 300 },
    { id: "3", origen: "empleado", pagado_por: "ana", repuesto_en: null, monto: "20.5" },
    { id: "4", origen: "empleado", pagado_por: "ana", repuesto_en: "2026-10-01T10:00:00Z", monto: 999 },
    { id: "5", origen: "caja_chica", pagado_por: null, repuesto_en: null, monto: 999 },
  ]);
  assert.deepEqual(r.map((p) => ({ persona: p.persona, total: p.total, ids: p.gastos.map((g) => g.id) })), [
    { persona: "luis", total: 300, ids: ["2"] },
    { persona: "ana", total: 120.5, ids: ["1", "3"] },
  ]);
  assert.deepEqual(porReponerAEmpleados([]), []);
});

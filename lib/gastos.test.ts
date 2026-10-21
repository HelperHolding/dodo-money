import { test } from "node:test";
import assert from "node:assert/strict";

test('eliminados no cuentan en reposición de caja ni deuda con empleados',()=>{
 const eliminado={id:'x',origen:'empleado' as const,pagado_por:'persona',repuesto_en:null,monto:200,anulado_en:'2026-10-20'};
 assert.deepEqual(porReponerAEmpleados([eliminado]),[]);
 assert.deepEqual(sumaPorOrigen([{...eliminado,origen:'caja_chica'}]),{caja_chica:0,boveda:0,empleado:0});
});
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

test("informativos: no descuentan caja ni bóveda y no generan reposición a empleados",()=>{
 assert.deepEqual(sumaPorOrigen([{origen:"caja_chica",monto:120,informativo:true},{origen:"boveda",monto:60,informativo:true},{origen:"empleado",monto:80,informativo:true},{origen:"boveda",monto:400}]),{caja_chica:0,boveda:400,empleado:0});
 assert.deepEqual(porReponerAEmpleados([{id:"anterior",origen:"empleado",pagado_por:"ana",repuesto_en:null,monto:80,informativo:true}]),[]);
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

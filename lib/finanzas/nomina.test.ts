import { test } from "node:test";
import assert from "node:assert/strict";
import { costoPuesto, nominaMes, plantillaVigente } from "./nomina.ts";

const p = (puesto: string, renglon: "cocina" | "gerencia", personas: number, sueldo: number, pct_cargas: number, vigente_desde: string, sucursal_id: string | null = "s1", bono = 0) =>
  ({ sucursal_id, puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde });

const PUESTOS = [
  p("Gerente", "gerencia", 1, 22000, 0.2, "2026-10-01"),
  p("Jefe de turno", "cocina", 2, 12223.2, 0.129, "2026-10-01"),
  p("Pizzero / cajero", "cocina", 4, 10741.2, 0.1171, "2026-10-01"),
  p("Pizzero / cajero", "cocina", 5, 10741.2, 0.1171, "2026-11-15"),   // se contrata uno más a medio noviembre
  p("Contador", "gerencia", 1, 30000, 0.2, "2026-10-01", null),        // oficina central
];

test("costoPuesto: personas × (sueldo × (1 + cargas) + bono)", () => {
  assert.equal(costoPuesto(PUESTOS[0]), 26400);
  assert.equal(costoPuesto({ ...PUESTOS[1], bono: 500 }), 28599.99);
});

test("plantillaVigente: la versión de cada puesto vigente al cierre del mes; oficina aparte", () => {
  assert.deepEqual(plantillaVigente(PUESTOS, "s1", "2026-10-31").map((x) => [x.puesto, x.personas]), [["Gerente", 1], ["Jefe de turno", 2], ["Pizzero / cajero", 4]]);
  assert.deepEqual(plantillaVigente(PUESTOS, "s1", "2026-11-30").find((x) => x.puesto === "Pizzero / cajero")?.personas, 5);
  assert.deepEqual(plantillaVigente(PUESTOS, "s1", "2026-09-30"), []);
  assert.deepEqual(plantillaVigente(PUESTOS, null, "2026-10-31").map((x) => x.puesto), ["Contador"]);
});

test("nominaMes: plantilla + ajustes por renglón (como LC Inputs: $101,995.96)", () => {
  const n = nominaMes(PUESTOS, [{ sucursal_id: "s1", renglon: "cocina", monto: 1500, concepto: "Bono" }, { sucursal_id: "s2", renglon: "cocina", monto: 999, concepto: "otra" }], "s1", "2026-10-31");
  assert.deepEqual(n.plantilla, { cocina: 75595.96, gerencia: 26400 });
  assert.deepEqual({ cocina: n.cocina, gerencia: n.gerencia }, { cocina: 77095.96, gerencia: 26400 });
});

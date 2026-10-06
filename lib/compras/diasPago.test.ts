import { test } from "node:test";
import assert from "node:assert/strict";
import { diaDePagoSugerido, esDiaDePago, leerDiasPago, proximoDiaDePago, proximosDiasDePago, textoDia } from "./diasPago.ts";

const VIERNES = [5];

test("esDiaDePago y próximo día de pago (el mismo día cuenta)", () => {
  assert.equal(esDiaDePago("2026-10-09", VIERNES), true);
  assert.equal(esDiaDePago("2026-10-10", VIERNES), false);
  assert.equal(proximoDiaDePago("2026-10-09", VIERNES), "2026-10-09");
  assert.equal(proximoDiaDePago("2026-10-10", VIERNES), "2026-10-16");
  assert.equal(proximoDiaDePago("2026-12-26", VIERNES), "2027-01-01");
});

test("diaDePagoSugerido: el viernes en o antes del vencimiento; si ya pasó, el próximo", () => {
  assert.equal(diaDePagoSugerido("2026-10-14", "2026-10-06", VIERNES), "2026-10-09");   // miércoles → viernes anterior
  assert.equal(diaDePagoSugerido("2026-10-16", "2026-10-06", VIERNES), "2026-10-16");   // vence en viernes
  assert.equal(diaDePagoSugerido("2026-10-18", "2026-10-06", VIERNES), "2026-10-16");   // domingo
  assert.equal(diaDePagoSugerido("2026-10-14", "2026-10-12", VIERNES), "2026-10-16");   // el viernes 9 ya pasó
  assert.equal(diaDePagoSugerido("2026-10-01", "2026-10-06", VIERNES), "2026-10-09");   // vencida
  assert.equal(diaDePagoSugerido("2026-10-15", "2026-10-06", [2, 5]), "2026-10-13");    // martes y viernes
});

test("próximos días de pago, texto y lectura del formulario", () => {
  assert.deepEqual(proximosDiasDePago("2026-10-06", [2, 5], 4), ["2026-10-06", "2026-10-09", "2026-10-13", "2026-10-16"]);
  assert.equal(textoDia("2026-10-09"), "Viernes 9/10");
  assert.deepEqual(leerDiasPago(["5"]), { dias: [5] });
  assert.deepEqual(leerDiasPago(["5", "2", "5"]), { dias: [2, 5] });
  assert.deepEqual(leerDiasPago([]), { error: "Elige al menos un día de pago." });
  assert.deepEqual(leerDiasPago(["8"]), { error: "Elige al menos un día de pago." });
});

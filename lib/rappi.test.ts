import { test } from "node:test";
import assert from "node:assert/strict";
import { diferenciaRappi, leerCorteRappi, problemaArchivoCorte, rutaCorteRappi } from "./rappi.ts";

test("leerCorteRappi: monto opcional, con signo de pesos o comas; no negativo", () => {
  assert.deepEqual(leerCorteRappi(""), { monto: null });
  assert.deepEqual(leerCorteRappi(" $1,250.50 "), { monto: 1250.5 });
  assert.deepEqual(leerCorteRappi("0"), { monto: 0 });
  assert.deepEqual(leerCorteRappi("-5"), { error: "El corte de Rappi no puede ser negativo." });
  assert.deepEqual(leerCorteRappi("mil"), { error: "Escribe el total del corte de Rappi en pesos." });
});

test("diferenciaRappi: corte de Rappi menos lo que dice Dodo IS; null si falta el corte", () => {
  assert.equal(diferenciaRappi(1200, 1250.5), 50.5);
  assert.equal(diferenciaRappi(1200.1, 1200.1), 0);
  assert.equal(diferenciaRappi(1200, null), null);
});

test("archivo del corte: foto o PDF de hasta 4 MB, en la carpeta rappi de la sucursal", () => {
  assert.equal(problemaArchivoCorte(null), null);
  assert.equal(problemaArchivoCorte({ type: "application/pdf", size: 200_000 }), null);
  assert.equal(problemaArchivoCorte({ type: "image/jpeg", size: 200_000 }), null);
  assert.equal(problemaArchivoCorte({ type: "text/plain", size: 10 }), "El corte de Rappi debe ser foto o PDF.");
  assert.equal(problemaArchivoCorte({ type: "image/png", size: 5 * 1024 * 1024 }), "El archivo del corte pesa más de 4 MB.");
  assert.equal(rutaCorteRappi("suc-1", "2026-10-02", "abc", "application/pdf"), "suc-1/rappi/2026-10-02-abc.pdf");
  assert.equal(rutaCorteRappi("suc-1", "2026-10-02", "abc", "image/heic"), "suc-1/rappi/2026-10-02-abc.heic");
});

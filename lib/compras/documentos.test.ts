import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoDocumentos, extensionDocumento, leerDocumento, opinionVencida, rutaDocumento, vigentes } from "./documentos.ts";

const doc = (id: string, tipo: string, fecha: string, subido_en = "2026-10-01T10:00:00Z") => ({ id, tipo: tipo as never, fecha, subido_en });

test("vigentes: el de fecha más reciente; si empatan, el último que se subió", () => {
  const v = vigentes([
    doc("a", "opinion_cumplimiento", "2026-09-01"),
    doc("b", "opinion_cumplimiento", "2026-09-20"),
    doc("c", "opinion_cumplimiento", "2026-09-20", "2026-10-02T10:00:00Z"),
    doc("d", "constancia_fiscal", "2026-01-15"),
  ]);
  assert.equal(v.opinion_cumplimiento?.id, "c");
  assert.equal(v.constancia_fiscal?.id, "d");
  assert.equal(v.caratula_banco, null);
});

test("opinionVencida: más de 30 días", () => {
  assert.equal(opinionVencida("2026-09-02", "2026-10-02"), false); // 30 días exactos
  assert.equal(opinionVencida("2026-09-01", "2026-10-02"), true);  // 31
  assert.equal(opinionVencida("2026-10-02", "2026-10-02"), false);
});

test("estadoDocumentos: faltantes, opinión vencida y si hay algo pendiente", () => {
  assert.deepEqual(estadoDocumentos([], "2026-10-02"), {
    faltan: ["opinion_cumplimiento", "constancia_fiscal", "caratula_banco"], opinionVencida: false, pendiente: true,
  });
  assert.deepEqual(estadoDocumentos([
    doc("a", "opinion_cumplimiento", "2026-08-01"), doc("b", "constancia_fiscal", "2026-08-01"), doc("c", "caratula_banco", "2026-01-01"),
  ], "2026-10-02"), { faltan: [], opinionVencida: true, pendiente: true });
  assert.deepEqual(estadoDocumentos([
    doc("a", "opinion_cumplimiento", "2026-09-30"), doc("b", "constancia_fiscal", "2025-08-01"), doc("c", "caratula_banco", "2024-01-01"),
  ], "2026-10-02"), { faltan: [], opinionVencida: false, pendiente: false });
});

test("leerDocumento valida tipo, fecha y que no sea futura", () => {
  assert.deepEqual(leerDocumento("constancia_fiscal", "2026-09-15", "2026-10-02"), { datos: { tipo: "constancia_fiscal", fecha: "2026-09-15" } });
  assert.deepEqual(leerDocumento("otro", "2026-09-15", "2026-10-02"), { error: "Elige qué documento es." });
  assert.deepEqual(leerDocumento("caratula_banco", "", "2026-10-02"), { error: "Escribe la fecha que trae el documento." });
  assert.deepEqual(leerDocumento("caratula_banco", "2026-02-30", "2026-10-02"), { error: "Escribe la fecha que trae el documento." });
  assert.deepEqual(leerDocumento("caratula_banco", "2026-10-03", "2026-10-02"), { error: "La fecha del documento no puede ser futura." });
});

test("archivo: PDF o foto, y la ruta usa el id del proveedor (el almacenamiento no acepta Ñ)", () => {
  assert.equal(extensionDocumento("application/pdf"), "pdf");
  assert.equal(extensionDocumento("image/jpeg"), "jpg");
  assert.equal(extensionDocumento("image/png"), "png");
  assert.equal(extensionDocumento("image/webp"), "webp");
  assert.equal(extensionDocumento("text/plain"), null);
  assert.equal(rutaDocumento("prov-1", "opinion_cumplimiento", "2026-09-30", "abc", "pdf"), "prov-1/opinion_cumplimiento/2026-09-30-abc.pdf");
});

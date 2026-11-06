import { test } from "node:test";
import assert from "node:assert/strict";
import { estadisticas } from "./estadisticas.ts";
const env = (id: string, estado: "aceptado" | "problema" | "pendiente", es_prueba = false) => ({ id, email: id + "@m.com", es_prueba, estado, enviado_en: "2026-11-07T18:00:00Z", detalle: null });
const ev = (envio_id: string, tipo: "apertura" | "clic" | "baja", creado_en: string, enlace: string | null = null, sospechoso = false) => ({ envio_id, tipo, enlace, sospechoso, creado_en });

test("estadísticas: únicos, sin pruebas, clic sospechoso fuera y clic cuenta como apertura", () => {
  const s = estadisticas(
    [env("a", "aceptado"), env("b", "aceptado"), env("c", "aceptado"), env("d", "problema"), env("e", "pendiente"), env("p", "aceptado", true)],
    [ev("a", "apertura", "2026-11-07T18:05:00Z"), ev("a", "apertura", "2026-11-07T19:05:00Z"), ev("b", "clic", "2026-11-07T18:20:00Z", "https://dodopizza.mx/go-big?utm_source=correo"),
     ev("c", "clic", "2026-11-07T18:00:03Z", "https://dodopizza.mx/", true), ev("p", "apertura", "2026-11-07T18:01:00Z"), ev("c", "baja", "2026-11-07T20:00:00Z")]);
  assert.deepEqual([s.destinatarios, s.aceptados, s.problema, s.pendientes, s.abrieron, s.clics, s.bajas], [5, 3, 1, 1, 2, 1, 1]);
  assert.equal(s.pctApertura, 2 / 3); assert.equal(s.pctClic, 1 / 3);
  assert.deepEqual(s.porEnlace, [{ enlace: "https://dodopizza.mx/go-big", personas: 1 }]);
  assert.equal(s.porEnvio.b.abrio, "2026-11-07T18:20:00Z");
  // 18:05 y 18:20 UTC caen a las 12:00 de México; la segunda apertura de "a" (13:00) no es única y no suma.
  assert.deepEqual(s.porHora.map((h) => [h.hora, h.aperturas, h.clics]), [["2026-11-07 12:00", 2, 1]]);
  assert.equal(estadisticas([], []).pctApertura, 0);
});

test("estadísticas: los envíos de prueba no aparecen ni en porEnvio ni en enlaces", () => {
  const s = estadisticas([env("p", "aceptado", true)], [ev("p", "clic", "2026-11-07T18:00:00Z", "https://dodopizza.mx/x"), ev("p", "baja", "2026-11-07T18:01:00Z")]);
  assert.deepEqual([s.destinatarios, s.abrieron, s.clics, s.bajas, s.porEnlace.length, s.porHora.length, Object.keys(s.porEnvio).length], [0, 0, 0, 0, 0, 0, 0]);
});

test("estadísticas: aperturas de envíos no aceptados no cuentan, el porcentaje no pasa de 100%", () => {
  const s = estadisticas([env("a", "aceptado"), env("e", "pendiente"), env("d", "problema")],
    [ev("a", "apertura", "2026-11-07T18:00:00Z"), ev("e", "clic", "2026-11-07T18:01:00Z", "https://dodopizza.mx/"), ev("d", "apertura", "2026-11-07T18:02:00Z")]);
  assert.deepEqual([s.destinatarios, s.aceptados, s.abrieron, s.clics], [3, 1, 1, 0]);
  assert.equal(s.pctApertura, 1); assert.equal(s.pctClic, 0);
});

test("estadísticas: porEnlace y porHora solo usan envíos aceptados (personas <= clics)", () => {
  const s = estadisticas([env("a", "aceptado"), env("e", "pendiente"), env("d", "problema")],
    [ev("a", "clic", "2026-11-07T18:00:00Z", "https://dodopizza.mx/x"), ev("e", "clic", "2026-11-07T18:01:00Z", "https://dodopizza.mx/x"),
     ev("d", "apertura", "2026-11-07T22:02:00Z")]);
  assert.deepEqual(s.porEnlace, [{ enlace: "https://dodopizza.mx/x", personas: 1 }]);
  assert.deepEqual(s.porHora.map((h) => [h.hora, h.aperturas, h.clics]), [["2026-11-07 12:00", 1, 1]]);
});

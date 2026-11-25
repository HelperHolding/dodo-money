import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { aCoordenada, colorMarca, conteoColores, ETIQUETA_COLOR, necesitaAtencion } from "./plano.ts";

const HOY = "2026-06-10";
const it = (tipo: string, estado: string, inicio: string | null = null, fin: string | null = null) => ({ tipo, estado, inicio, fin }) as never;

test("equipo: color por etapa", () => {
  const c = (estado: string) => colorMarca(it("equipo", estado), HOY).color;
  assert.equal(c("por_cotizar"), "gris");
  assert.equal(c("cotizado"), "amarillo");
  assert.equal(c("aprobado"), "amarillo");
  assert.equal(c("pedido"), "azul");
  assert.equal(c("recibido_parcial"), "azul");
  assert.equal(c("recibido"), "morado");
  assert.equal(c("instalado"), "verde");
  assert.equal(c("verificado"), "verde");
  assert.equal(colorMarca(it("referencia", "recibido"), HOY).color, "morado");
});

test("actividad y técnico: amarillo, azul, verde; nunca morado", () => {
  for (const tipo of ["actividad", "tecnico"]) {
    assert.equal(colorMarca(it(tipo, "pendiente"), HOY).color, "gris");
    assert.equal(colorMarca(it(tipo, "en_curso"), HOY).color, "amarillo");
    assert.equal(colorMarca(it(tipo, "por_cerrar"), HOY).color, "azul");
    assert.equal(colorMarca(it(tipo, "completado"), HOY).color, "verde");
  }
});

test("alerta: bloqueado o vencido, no si ya está listo", () => {
  assert.equal(colorMarca(it("actividad", "bloqueado"), HOY).alerta, true);
  assert.equal(colorMarca(it("actividad", "en_curso", null, "2026-06-09"), HOY).alerta, true);
  assert.equal(colorMarca(it("actividad", "en_curso", "2026-06-01", null), HOY).alerta, true, "sin fin usa inicio");
  assert.equal(colorMarca(it("actividad", "en_curso", null, "2026-06-10"), HOY).alerta, false, "hoy no está vencido");
  assert.equal(colorMarca(it("actividad", "completado", null, "2026-06-01"), HOY).alerta, false);
  assert.equal(colorMarca(it("equipo", "instalado", null, "2026-06-01"), HOY).alerta, false);
  assert.equal(colorMarca(it("equipo", "cotizado"), HOY).alerta, false);
});

test("porValidar y noAplica", () => {
  const v = colorMarca(it("equipo", "por_validar"), HOY);
  assert.equal(v.porValidar, true);
  assert.equal(v.color, "gris");
  assert.equal(colorMarca(it("equipo", "cotizado"), HOY).porValidar, false);
  const n = colorMarca(it("actividad", "no_aplica", null, "2026-01-01"), HOY);
  assert.equal(n.noAplica, true);
  assert.equal(n.alerta, false);
});

test("necesitaAtencion", () => {
  assert.equal(necesitaAtencion(it("equipo", "por_cotizar"), HOY), true, "gris");
  assert.equal(necesitaAtencion(it("equipo", "cotizado", null, "2026-06-01"), HOY), true, "vencido");
  assert.equal(necesitaAtencion(it("equipo", "por_validar"), HOY), true);
  assert.equal(necesitaAtencion(it("actividad", "bloqueado"), HOY), true);
  assert.equal(necesitaAtencion(it("equipo", "pedido"), HOY), false);
  assert.equal(necesitaAtencion(it("equipo", "instalado"), HOY), false);
  assert.equal(necesitaAtencion(it("actividad", "no_aplica"), HOY), false);
});

test("conteoColores excluye no_aplica", () => {
  const r = conteoColores([it("equipo", "cotizado"), it("equipo", "cotizado"), it("equipo", "recibido"), it("actividad", "no_aplica"), it("actividad", "completado"), it("equipo", "por_cotizar")], HOY);
  assert.deepEqual(r, { gris: 1, amarillo: 2, azul: 0, morado: 1, verde: 1 });
});

test("etiquetas", () => {
  assert.deepEqual(ETIQUETA_COLOR, { gris: "Sin iniciar", amarillo: "Cotizado", azul: "Comprado / en curso", morado: "Entregado", verde: "Instalado / listo" });
});

test("aCoordenada: fracción, recorte y 4 decimales", () => {
  assert.deepEqual(aCoordenada(500, 250, 1000, 500), { x: 0.5, y: 0.5 });
  assert.deepEqual(aCoordenada(1500, 600, 3000, 2000), { x: 0.5, y: 0.3 }, "con zoom");
  assert.deepEqual(aCoordenada(-10, 700, 1000, 500), { x: 0, y: 1 }, "recorta bordes");
  assert.deepEqual(aCoordenada(1, 1, 3, 7), { x: 0.3333, y: 0.1429 });
});

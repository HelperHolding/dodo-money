import test from "node:test";
import assert from "node:assert/strict";
import { barrasPorHora, enlaceCorto, TONO_ESTADO, TONO_ENVIO } from "./presentacion.ts";

test("enlace corto: sin protocolo, sin www y sin diagonal final; si no es URL se deja igual", () => {
  assert.equal(enlaceCorto("https://dodopizza.mx/zapopan/zp1/product/go-big"), "dodopizza.mx/zapopan/zp1/product/go-big");
  assert.equal(enlaceCorto("https://www.dodopizza.mx/"), "dodopizza.mx");
  assert.equal(enlaceCorto("https://dodopizza.mx/menu?promo=1"), "dodopizza.mx/menu?promo=1");
  assert.equal(enlaceCorto("mailto:hola@dodopizza.mx"), "mailto:hola@dodopizza.mx");
  assert.equal(enlaceCorto("no es enlace"), "no es enlace");
});

test("tono por estado: cada estado de campaña y de envío tiene uno de los tonos de la app", () => {
  for (const tono of [...Object.values(TONO_ESTADO), ...Object.values(TONO_ENVIO)]) assert.ok(["ok", "aviso", "alerta", "info", "neutro"].includes(tono), tono);
  assert.equal(TONO_ESTADO.enviada, "ok");
  assert.equal(TONO_ESTADO.detenida, "alerta");
  assert.equal(TONO_ENVIO.problema, "alerta");
  assert.equal(TONO_ENVIO.aceptado, "ok");
});

test("barras por hora: en orden, rótulo HH:MM, valor = aperturas + clics y detalle legible", () => {
  const b = barrasPorHora([{ hora: "2026-11-09 14:00", aperturas: 3, clics: 1 }, { hora: "2026-11-09 13:00", aperturas: 1, clics: 1 }]);
  assert.deepEqual(b.map((x) => [x.clave, x.rotulo, x.valor]), [["2026-11-09 13:00", "13:00", 2], ["2026-11-09 14:00", "14:00", 4]]);
  assert.equal(b[0].detalle, "9 nov, 13:00 · 1 apertura · 1 clic");
  assert.equal(b[1].detalle, "9 nov, 14:00 · 3 aperturas · 1 clic");
  // Varios días: el rótulo lleva el día para no confundir horas iguales
  const v = barrasPorHora([{ hora: "2026-11-09 13:00", aperturas: 1, clics: 0 }, { hora: "2026-11-10 13:00", aperturas: 2, clics: 0 }]);
  assert.deepEqual(v.map((x) => x.rotulo), ["9 · 13h", "10 · 13h"]);
});

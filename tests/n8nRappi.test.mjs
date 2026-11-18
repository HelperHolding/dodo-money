import { test } from "node:test";
import assert from "node:assert/strict";
import { flujo, porTienda, resumen, TIENDAS } from "../scripts/n8n/flujo-rappi.mjs";

const nodo = (n) => flujo.nodes.find((x) => x.name === n);
const correrPorTienda = (json) => new Function("$input", porTienda)({ first: () => ({ json }) }).map((i) => i.json);
const correrResumen = (leido, actual, st = {}, pedido = {}) =>
  new Function("$", "$json", "$getWorkflowStaticData", resumen)(
    (n) => ({ item: { json: n === "Por tienda" ? pedido : leido } }),
    actual,
    () => st,
  ).json;

test("n8n Rappi: cada disparador pasa por 'Por tienda' antes de leer, y el extractor va de una en una", () => {
  const entrantes = (n) => Object.entries(flujo.connections).filter(([, c]) => c.main.some((s) => s.some((d) => d.node === n))).map(([o]) => o);
  assert.deepEqual(entrantes("Leer Rappi"), ["Por tienda"]);
  assert.deepEqual(entrantes("Por tienda").sort(), ["Ayer completo", "Hoy en vivo", "Probar (webhook)"]);
  assert.equal(nodo("Leer Rappi").parameters.options.batching.batch.batchSize, 1);
  assert.match(nodo("Leer Rappi").parameters.jsonBody, /tienda: \$json\.tienda/);
  assert.equal(nodo("Resumen").parameters.mode, "runOnceForEachItem");
  assert.deepEqual(Object.keys(TIENDAS), ["MX1930486109", "MX1930494033"]);
  const nombres = flujo.nodes.map((n) => n.name);
  for (const [origen, destinos] of Object.entries(flujo.connections))
    for (const salida of destinos.main) for (const d of salida) assert.ok(nombres.includes(d.node), `${origen} → ${d.node}`);
});

test("n8n Rappi: 'Por tienda' arma La Calma y Turbo, o solo la que pida el webhook", () => {
  assert.deepEqual(correrPorTienda({ fecha: "hoy", cache: true }), [
    { tienda: "MX1930486109", fecha: "hoy", revisar: false, cache: true, repasar: 0 },
    { tienda: "MX1930494033", fecha: "hoy", revisar: false, cache: true, repasar: 0 },
  ]);
  assert.deepEqual(correrPorTienda({ fecha: "", cache: false, repasar: 7 }).map((x) => [x.tienda, x.repasar]), [["MX1930486109", 7], ["MX1930494033", 7]]);
  assert.deepEqual(correrPorTienda({ body: { fecha: "2026-11-08", tienda: "MX1930494033", revisar: true } }), [
    { tienda: "MX1930494033", fecha: "2026-11-08", revisar: true, cache: false, repasar: 0 },
  ]);
});

test("n8n Rappi: el resumen y los avisos van por tienda", () => {
  const st = {};
  const turboFalla = { tienda: "MX1930494033", fecha: "2026-11-09", estado: "error", mensaje: "No cargó.", ordenes: 0 };
  const r1 = correrResumen(turboFalla, turboFalla, st);
  assert.equal(r1.avisar, true); assert.equal(r1.nombre, "Turbo"); assert.equal(r1.app, null);
  // La Calma sana no borra el aviso pendiente de Turbo.
  const calma = { tienda: "MX1930486109", fecha: "2026-11-09", estado: "ok", mensaje: "Leídas 3.", ordenes: 3, revisar: false };
  const r2 = correrResumen(calma, { statusCode: 200, body: { actualizadas: 1 } }, st);
  assert.equal(r2.avisar, false); assert.match(r2.mensaje, /Guardadas en la app \(1 actualizadas\)/); assert.equal(r2.nombre, "La Calma");
  assert.equal(correrResumen(turboFalla, turboFalla, st).avisar, false, "no repite el correo antes de 6 h");
  // Si la app rechaza el envío de una tienda, esa vuelta queda en error y avisa.
  const r3 = correrResumen(calma, { statusCode: 422, body: { error: "Orden inválida." } }, st);
  assert.equal(r3.estado, "error"); assert.equal(r3.avisar, true); assert.match(r3.mensaje, /422: Orden inválida/);
});

test("n8n Rappi: una orden omitida en vivo no avisa (se reintenta); dos vueltas seguidas o el cierre sí", () => {
  const st = {};
  const vivo = { cache: true };
  const omitida = { tienda: "MX1930486109", fecha: "2026-11-17", estado: "error", mensaje: "Leídas 7 órdenes; omitidas 1.", ordenes: 7, omitidas: ["locator.waitFor: Timeout 30000ms exceeded."] };
  const app = { statusCode: 200, body: { actualizadas: 7 } };
  const r1 = correrResumen(omitida, app, st, vivo);
  assert.equal(r1.avisar, false); assert.equal(r1.pendiente, true); assert.match(r1.mensaje, /se reintentan en la siguiente vuelta/i);
  // La siguiente vuelta la recupera: se limpia y no avisa.
  const sana = { ...omitida, estado: "ok", mensaje: "Leídas 8 órdenes; omitidas 0.", ordenes: 8, omitidas: [] };
  assert.equal(correrResumen(sana, app, st, vivo).avisar, false);
  assert.equal(st.omitidas.MX1930486109, undefined);
  // Dos vueltas seguidas con omitidas: avisa en la segunda.
  assert.equal(correrResumen(omitida, app, st, vivo).avisar, false);
  const r2 = correrResumen(omitida, app, st, vivo);
  assert.equal(r2.avisar, true); assert.equal(r2.pendiente, false); assert.match(r2.mensaje, /2 vueltas seguidas/);
  // El cierre (sin caché) avisa aunque sea una sola.
  assert.equal(correrResumen(omitida, app, {}, { cache: false }).avisar, true);
  // Un historial cortado o una falla del extractor en vivo siguen avisando a la primera.
  assert.equal(correrResumen({ ...omitida, cortado: true }, app, {}, vivo).avisar, true);
  assert.equal(correrResumen({ ...omitida, omitidas: [], mensaje: "Falla del extractor: x" }, { tienda: "x" }, {}, vivo).avisar, true);
});

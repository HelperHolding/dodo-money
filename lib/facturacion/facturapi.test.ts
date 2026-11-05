// lib/facturacion/facturapi.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteFacturapi } from "./facturapi.ts";

type Llamada = { url: string; init: RequestInit };
const falso = (respuestas: (Response | Error)[]) => {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas.shift()!;
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { f, llamadas };
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const DATOS = { rfc: "XYZ010101AB1", nombre: "CLIENTE PRUEBA", regimen_fiscal: "601", codigo_postal: "45160", uso_cfdi: "G03" as const, correo: "juan@gmail.com", forma_pago: "04" as const };
const FACT = { id: "fa_1", uuid: "abc", series: "F", folio_number: 7, subtotal: 330.17, total: 383, status: "valid" };
const CONCEPTOS = [{ quantity: 1, product: { description: "Pizza", product_key: "90101501", unit_key: "E48", price: 383, tax_included: true as const, taxes: [{ type: "IVA" as const, rate: 0.16 as const }] } }];
const LLAVES = { externo: "a", idempotencia: "b" };
const SIN_DATOS = { ok: false, tipo: "incierto", mensaje: "Facturapi respondió sin datos legibles." };

test("crear: manda cliente, conceptos, PUE, idempotencia y externo", async () => {
  const { f, llamadas } = falso([json(200, FACT)]);
  const r = await crearClienteFacturapi("sk_test_x", f).crear(DATOS, CONCEPTOS, { externo: "ped-1", idempotencia: "fila-1" });
  assert.deepEqual(r, { ok: true, valor: FACT });
  assert.equal(llamadas[0].url, "https://www.facturapi.io/v2/invoices");
  assert.equal((llamadas[0].init.headers as Record<string, string>).Authorization, "Bearer sk_test_x");
  const body = JSON.parse(llamadas[0].init.body as string);
  assert.deepEqual(body.items, CONCEPTOS);
  assert.deepEqual(body.customer, { legal_name: "CLIENTE PRUEBA", tax_id: "XYZ010101AB1", tax_system: "601", email: "juan@gmail.com", address: { zip: "45160" } });
  assert.equal(body.payment_form, "04"); assert.equal(body.payment_method, "PUE"); assert.equal(body.use, "G03");
  assert.equal(body.external_id, "ped-1"); assert.equal(body.idempotency_key, "fila-1");
});

test("crear: 400 es rechazo con el mensaje de Facturapi; 500, 202 y red son inciertos", async () => {
  const { f } = falso([json(400, { message: "El RFC del receptor no está en la lista de RFC inscritos", status: 400 }), json(500, { message: "x" }), json(202, { ...FACT, status: "pending" }), new Error("ECONNRESET")]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.crear(DATOS, [], { externo: "a", idempotencia: "b" }), { ok: false, tipo: "rechazo", mensaje: "El RFC del receptor no está en la lista de RFC inscritos" });
  for (let i = 0; i < 3; i++) assert.equal(((await c.crear(DATOS, [], { externo: "a", idempotencia: "b" })) as { tipo: string }).tipo, "incierto");
});

test("crear: 422 es rechazo con el mensaje de Facturapi; 429 es incierto", async () => {
  const { f } = falso([json(422, { message: "Uso de CFDI inválido para el régimen", status: 422 }), json(429, { message: "Demasiadas solicitudes" })]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.crear(DATOS, [], LLAVES), { ok: false, tipo: "rechazo", mensaje: "Uso de CFDI inválido para el régimen" });
  assert.deepEqual(await c.crear(DATOS, [], LLAVES), { ok: false, tipo: "incierto", mensaje: "Demasiadas solicitudes" });
});

test("crear: 200 con cuerpo no JSON, no objeto o sin id/uuid es incierto", async () => {
  const { f } = falso([
    new Response("<html>ok</html>", { status: 200 }),
    json(200, null),
    json(200, [FACT]),
    json(200, { uuid: "abc" }),
    json(201, { ...FACT, uuid: 5 }),
  ]);
  const c = crearClienteFacturapi("k", f);
  for (let i = 0; i < 5; i++) assert.deepEqual(await c.crear(DATOS, [], LLAVES), SIN_DATOS);
});

test("errores con cuerpo nulo no fallan: mensaje por defecto", async () => {
  const { f } = falso([json(500, null), json(400, null)]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.crear(DATOS, [], LLAVES), { ok: false, tipo: "incierto", mensaje: "Facturapi respondió 500." });
  assert.deepEqual(await c.crear(DATOS, [], LLAVES), { ok: false, tipo: "rechazo", mensaje: "Facturapi respondió 400." });
});

test("401 y 403 son incierto con mensaje de llave, sin exponer la llave", async () => {
  const { f } = falso([json(401, { message: "Unauthorized" }), json(403, { message: "Forbidden" })]);
  const c = crearClienteFacturapi("sk_test_secreta", f);
  const esperado = { ok: false, tipo: "incierto", mensaje: "La llave de Facturapi no es válida; revisa FACTURAPI_KEY." };
  for (let i = 0; i < 2; i++) {
    const r = await c.crear(DATOS, [], LLAVES);
    assert.deepEqual(r, esperado);
    assert.ok(!JSON.stringify(r).includes("sk_test_secreta"));
  }
});

test("buscarPorExterno: regresa la válida o null", async () => {
  const { f, llamadas } = falso([json(200, { data: [{ ...FACT, external_id: "ped 1", status: "canceled" }, { ...FACT, external_id: "ped 1" }] }), json(200, { data: [] })]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.buscarPorExterno("ped 1"), { ok: true, valor: { ...FACT, external_id: "ped 1" } });
  assert.equal(llamadas[0].url, "https://www.facturapi.io/v2/invoices?external_id=ped%201");
  assert.deepEqual(await c.buscarPorExterno("x"), { ok: true, valor: null });
});

test("buscarPorExterno: con una pending y ninguna valid es incierto", async () => {
  const { f } = falso([json(200, { data: [{ ...FACT, external_id: "x", status: "canceled" }, { ...FACT, external_id: "x", status: "pending" }] })]);
  assert.deepEqual(await crearClienteFacturapi("k", f).buscarPorExterno("x"), { ok: false, tipo: "incierto", mensaje: "La factura sigue timbrándose en Facturapi." });
});

test("buscarPorExterno: valid tiene prioridad sobre pending", async () => {
  const { f } = falso([json(200, { data: [{ ...FACT, external_id: "x", status: "pending" }, { ...FACT, external_id: "x" }] })]);
  assert.deepEqual(await crearClienteFacturapi("k", f).buscarPorExterno("x"), { ok: true, valor: { ...FACT, external_id: "x" } });
});

test("buscarPorExterno: ignora facturas de otro external_id aunque el servidor las devuelva", async () => {
  const { f } = falso([json(200, { data: [{ ...FACT, external_id: "otro" }, null, "x", { ...FACT, status: "pending", external_id: "otro" }] })]);
  assert.deepEqual(await crearClienteFacturapi("k", f).buscarPorExterno("x"), { ok: true, valor: null });
});

test("obtener: lee estado y cancelación; sin id o status es incierto", async () => {
  const { f, llamadas } = falso([json(200, { id: "fa_1", status: "valid", cancellation_status: "pending", otro: 1 }), json(200, { id: "fa_1" }), json(404, { message: "no" })]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.obtener("fa_1"), { ok: true, valor: { id: "fa_1", status: "valid", cancellation_status: "pending" } });
  assert.deepEqual(await c.obtener("fa_1"), SIN_DATOS);
  assert.equal((await c.obtener("fa_1")).ok, false);
  assert.equal(`${llamadas[0].init.method} ${llamadas[0].url}`, "GET https://www.facturapi.io/v2/invoices/fa_1");
});

test("buscarPorExterno: data que no es arreglo es incierto", async () => {
  const { f } = falso([json(200, { data: null }), json(200, {})]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.buscarPorExterno("x"), SIN_DATOS);
  assert.deepEqual(await c.buscarPorExterno("x"), SIN_DATOS);
});

test("urlDescarga: sin url en la respuesta es incierto", async () => {
  const { f } = falso([json(200, { expires_at: "…" })]);
  assert.deepEqual(await crearClienteFacturapi("k", f).urlDescarga("fa_1", "xml"), SIN_DATOS);
});

test("urlDescarga, enviarCorreo y cancelar usan las rutas correctas", async () => {
  const { f, llamadas } = falso([json(200, { url: "https://s3/x.pdf", expires_at: "…" }), json(200, { ok: true }), json(200, { status: "canceled", cancellation_status: "accepted" })]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.urlDescarga("fa_1", "pdf"), { ok: true, valor: "https://s3/x.pdf" });
  assert.deepEqual(await c.enviarCorreo("fa_1", "a@b.mx"), { ok: true, valor: null });
  assert.equal((await c.cancelar("fa_1", "02") as { ok: true; valor: { status: string } }).valor.status, "canceled");
  assert.deepEqual(llamadas.map((l) => `${l.init.method} ${l.url}`), [
    "GET https://www.facturapi.io/v2/invoices/fa_1/download-url/pdf",
    "POST https://www.facturapi.io/v2/invoices/fa_1/email",
    "DELETE https://www.facturapi.io/v2/invoices/fa_1?motive=02",
  ]);
});

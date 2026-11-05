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

test("crear: manda cliente, conceptos, PUE, idempotencia y externo", async () => {
  const { f, llamadas } = falso([json(200, FACT)]);
  const r = await crearClienteFacturapi("sk_test_x", f).crear(DATOS, [], { externo: "ped-1", idempotencia: "fila-1" });
  assert.deepEqual(r, { ok: true, valor: FACT });
  assert.equal(llamadas[0].url, "https://www.facturapi.io/v2/invoices");
  assert.equal((llamadas[0].init.headers as Record<string, string>).Authorization, "Bearer sk_test_x");
  const body = JSON.parse(llamadas[0].init.body as string);
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

test("buscarPorExterno: regresa la válida o null", async () => {
  const { f, llamadas } = falso([json(200, { data: [{ ...FACT, status: "canceled" }, FACT] }), json(200, { data: [] })]);
  const c = crearClienteFacturapi("k", f);
  assert.deepEqual(await c.buscarPorExterno("ped 1"), { ok: true, valor: FACT });
  assert.equal(llamadas[0].url, "https://www.facturapi.io/v2/invoices?external_id=ped%201");
  assert.deepEqual(await c.buscarPorExterno("x"), { ok: true, valor: null });
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

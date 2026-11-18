// lib/facturacion/timbrar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { timbrarTicket, type Base, type Pac } from "./timbrar.ts";

const DATOS = { rfc: "XYZ010101AB1", nombre: "C", regimen_fiscal: "601", codigo_postal: "45160", uso_cfdi: "G03" as const, correo: "a@b.mx", forma_pago: "04" as const };
const FACT = { id: "fa_1", uuid: "U1", series: "F", folio_number: 1, subtotal: 330.17, total: 383, status: "valid" };
function dobles(reservas: ({ id: string } | { error: string })[], crear: Awaited<ReturnType<Pac["crear"]>>[] = [], buscar: Awaited<ReturnType<Pac["buscarPorExterno"]>>[] = []) {
  const log: string[] = [];
  const base: Base = {
    reservar: async () => { const r = reservas.shift()!; log.push(`reservar:${"id" in r ? r.id : r.error}`); return r; },
    confirmar: async (id, f) => { log.push(`confirmar:${id}:${f.id}`); },
    liberar: async (id, e) => { log.push(`liberar:${id}:${e}`); },
    token: async (id) => `tok-${id}`,
  };
  const pac: Pac = {
    crear: async (_d, _c, ll) => { log.push(`crear:${ll.externo}:${ll.idempotencia}`); return crear.shift()!; },
    buscarPorExterno: async (e) => { log.push(`buscar:${e}`); return buscar.shift()!; },
  };
  // El epoch de EN_PROCESO va en segundos; ahora() va en milisegundos.
  return { log, dep: { base, pac, ahora: () => 1_000_000_000_000 } };
}

test("camino feliz: reservar, crear con id de fila, confirmar", async () => {
  const { log, dep } = dobles([{ id: "f1" }], [{ ok: true, valor: FACT }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "timbrada", id: "f1", token: "tok-f1", uuid: "U1" });
  assert.deepEqual(log, ["reservar:f1", "crear:f1:f1", "confirmar:f1:fa_1"]);
});

test("rechazo de Facturapi libera el ticket", async () => {
  const { log, dep } = dobles([{ id: "f1" }], [{ ok: false, tipo: "rechazo", mensaje: "CP no coincide" }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "rechazada", mensaje: "CP no coincide" });
  assert.deepEqual(log, ["reservar:f1", "crear:f1:f1", "liberar:f1:CP no coincide"]);
});

test("respuesta incierta deja la fila en proceso y no libera", async () => {
  const { log, dep } = dobles([{ id: "f1" }], [{ ok: false, tipo: "incierto", mensaje: "timeout" }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "procesando" });
  assert.deepEqual(log, ["reservar:f1", "crear:f1:f1"]);
});

test("doble clic: si ya hay otra en proceso reciente, no llama a crear", async () => {
  const { log, dep } = dobles([{ error: "EN_PROCESO:f1:999999990" }], [], [{ ok: true, valor: null }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "procesando" });
  assert.deepEqual(log, ["reservar:EN_PROCESO:f1:999999990", "buscar:f1"]);
});

test("reintento tras timeout: la factura sí se timbró → se confirma sin timbrar otra", async () => {
  const { log, dep } = dobles([{ error: "EN_PROCESO:f1:999000000" }], [], [{ ok: true, valor: FACT }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "timbrada", id: "f1", token: "tok-f1", uuid: "U1" });
  assert.deepEqual(log, ["reservar:EN_PROCESO:f1:999000000", "buscar:f1", "confirmar:f1:fa_1"]);
});

test("reintento tras timeout: no se timbró y pasaron más de 10 min → libera y reserva de nuevo", async () => {
  const { log, dep } = dobles([{ error: "EN_PROCESO:f1:999000000" }, { id: "f2" }], [{ ok: true, valor: { ...FACT, id: "fa_2" } }], [{ ok: true, valor: null }]);
  assert.equal((await timbrarTicket(dep, "P", DATOS, [])).estado, "timbrada");
  assert.deepEqual(log, ["reservar:EN_PROCESO:f1:999000000", "buscar:f1", "liberar:f1:Sin respuesta de Facturapi; reintento", "reservar:f2", "crear:f2:f2", "confirmar:f2:fa_2"]);
});

test("a 9 minutos de la reserva todavía no se libera; a 11 sí", async () => {
  const reciente = dobles([{ error: "EN_PROCESO:f1:999999460" }], [], [{ ok: true, valor: null }]);
  assert.deepEqual(await timbrarTicket(reciente.dep, "P", DATOS, []), { estado: "procesando" });
  assert.equal(reciente.log.some((l) => l.startsWith("liberar")), false);
  const vieja = dobles([{ error: "EN_PROCESO:f1:999999340" }, { id: "f2" }], [{ ok: true, valor: FACT }], [{ ok: true, valor: null }]);
  assert.equal((await timbrarTicket(vieja.dep, "P", DATOS, [])).estado, "timbrada");
  assert.ok(vieja.log.includes("liberar:f1:Sin respuesta de Facturapi; reintento"));
});

test("EN_PROCESO antigua pero Facturapi sigue timbrando (incierto) → procesando, sin liberar ni crear", async () => {
  const { log, dep } = dobles([{ error: "EN_PROCESO:f1:999000000" }], [], [{ ok: false, tipo: "incierto", mensaje: "La factura sigue timbrándose en Facturapi." }]);
  assert.deepEqual(await timbrarTicket(dep, "P", DATOS, []), { estado: "procesando" });
  assert.deepEqual(log, ["reservar:EN_PROCESO:f1:999000000", "buscar:f1"]);
  assert.equal(log.some((l) => l.startsWith("liberar")), false);
  assert.equal(log.some((l) => l.startsWith("crear")), false);
});

test("ya facturado y no facturable", async () => {
  assert.deepEqual(await timbrarTicket(dobles([{ error: "YA_FACTURADO" }]).dep, "P", DATOS, []), { estado: "ya_facturado" });
  assert.equal((await timbrarTicket(dobles([{ error: "NO_FACTURABLE:plazo" }]).dep, "P", DATOS, [])).estado, "no_facturable");
});

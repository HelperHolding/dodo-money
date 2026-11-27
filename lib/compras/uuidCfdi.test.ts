import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeError, buscarUuidRepetido, fechaDMA, mensajeUuidRepetido, normalizarUuidCfdi, type CoincidenciaUuid } from "./uuidCfdi.ts";
import { ligaSegura } from "../ligas.ts";

const U = "1DAFB285-3B68-4AC2-AAED-DBB6423832E6";
const F = "0a0a0a0a-1111-4111-8111-000000000001";
const factura: CoincidenciaUuid = { origen: "factura", registro_id: F, fecha: "2026-10-09", sucursal: "Zapopan-1 La Calma", usuario: "Julio", creado_en: "2026-10-10T02:30:00+00:00", liga: `/compras/facturas/${F}` };
const gasto: CoincidenciaUuid = { origen: "gasto", registro_id: F, fecha: "2026-11-01", sucursal: "Guadalajara-1 López Mateos", usuario: "Ana", creado_en: "2026-11-01T18:00:00+00:00", liga: `/caja-chica#gasto-${F}` };

test("normalizarUuidCfdi: mayúsculas, sin espacios y vacío como null (igual que la base)", () => {
  assert.equal(normalizarUuidCfdi(" 1dafb285-3b68-4ac2-aaed-dbb6423832e6 "), U);
  assert.equal(normalizarUuidCfdi("1DAFB285-3B68-4AC2- AAED-DBB6423832E6\n"), U);
  assert.equal(normalizarUuidCfdi("   "), null);
  assert.equal(normalizarUuidCfdi(null), null);
  assert.equal(normalizarUuidCfdi(undefined), null);
});

test("fechaDMA: el día de Ciudad de México en dd/mm/aaaa", () => {
  // 02:30 UTC del 10 de octubre todavía es 9 de octubre en Ciudad de México.
  assert.equal(fechaDMA("2026-10-10T02:30:00+00:00"), "09/10/2026");
  assert.equal(fechaDMA("2026-11-01T18:00:00+00:00"), "01/11/2026");
});

test("mensajeUuidRepetido: fecha de subida, usuario, sucursal y origen", () => {
  assert.equal(mensajeUuidRepetido(factura), "Este UUID ya se subió el 09/10/2026 por Julio en Zapopan-1 La Calma (factura).");
  assert.equal(mensajeUuidRepetido(gasto), "Este UUID ya se subió el 01/11/2026 por Ana en Guadalajara-1 López Mateos (gasto de caja chica).");
  assert.equal(mensajeUuidRepetido({ ...factura, usuario: null, sucursal: null }), "Este UUID ya se subió el 09/10/2026 por usuario sin registro en Oficina (factura).");
});

test("ligaSegura: solo rutas internas de factura o de caja chica", () => {
  assert.equal(ligaSegura(`/compras/facturas/${F}`), `/compras/facturas/${F}`);
  assert.equal(ligaSegura(`/caja-chica#gasto-${F}`), `/caja-chica#gasto-${F}`);
  assert.equal(ligaSegura("/caja-chica"), "/caja-chica");
  for (const mala of ["https://evil.example/compras/facturas/x", "//evil.example", "/compras/facturas/../x", "/compras/facturas/x", "javascript:alert(1)", "", null, undefined])
    assert.equal(ligaSegura(mala), null, String(mala));
});

test("avisoDeError: el mensaje del trigger y su liga (pista) cuando hubo carrera", () => {
  assert.deepEqual(avisoDeError({ message: "Este UUID ya se subió el 09/10/2026 por Julio en Oficina (factura).", hint: `/compras/facturas/${F}` }),
    { texto: "Este UUID ya se subió el 09/10/2026 por Julio en Oficina (factura).", liga: `/compras/facturas/${F}` });
  assert.deepEqual(avisoDeError({ message: "Otro error", hint: "Revisa el formato" }), { texto: "Otro error", liga: null });
  assert.deepEqual(avisoDeError({ message: "Otro error" }), { texto: "Otro error", liga: null });
});

test("buscarUuidRepetido: llama a buscar_uuid_cfdi normalizado y excluye el registro editado", async () => {
  const llamadas: unknown[] = [];
  const db = { rpc: async (f: string, a: Record<string, unknown>) => { llamadas.push([f, a]); return { data: [gasto], error: null }; } };
  assert.deepEqual(await buscarUuidRepetido(db, ` ${U.toLowerCase()} `, F), { texto: mensajeUuidRepetido(gasto), liga: `/caja-chica#gasto-${F}` });
  assert.deepEqual(llamadas, [["buscar_uuid_cfdi", { p_uuid: U, p_excluir: F }]]);
  const vacio = { rpc: async () => ({ data: [], error: null }) };
  assert.equal(await buscarUuidRepetido(vacio, U), null);
  // Sin UUID no se consulta; si la consulta falla, decide el trigger de la base.
  assert.equal(await buscarUuidRepetido({ rpc: async () => { throw new Error("no se llama"); } }, "  "), null);
  assert.equal(await buscarUuidRepetido({ rpc: async () => ({ data: null, error: { message: "x" } }) }, U), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerEmpresa } from "./empresa.ts";
import { REGIMENES } from "./proveedores.ts";

const campos = (o: Record<string, string>) => (c: string) => o[c] ?? "";
const base = { rfc: "dpm-210101-ab1", razon_social: " Dodo Pizza México ", regimen_fiscal: "601", codigo_postal: "44190", domicilio: " Av. Chapultepec 15 ", correo_compras: "Compras@DodoPizza.mx" };

test("empresa: normaliza y acepta lo opcional vacío", () => {
  assert.deepEqual(leerEmpresa(campos(base), REGIMENES), { datos: {
    rfc: "DPM210101AB1", razon_social: "Dodo Pizza México", regimen_fiscal: "601", codigo_postal: "44190", domicilio: "Av. Chapultepec 15", correo_compras: "compras@dodopizza.mx",
  } });
  const r = leerEmpresa(campos({ rfc: "DPM210101AB1", razon_social: "Dodo" }), REGIMENES);
  assert.deepEqual(r, { datos: { rfc: "DPM210101AB1", razon_social: "Dodo", regimen_fiscal: null, codigo_postal: null, domicilio: null, correo_compras: null } });
});

test("empresa: cada error con su mensaje", () => {
  const error = (o: Record<string, string>) => { const r = leerEmpresa(campos({ ...base, ...o }), REGIMENES); return "error" in r ? r.error : null; };
  assert.equal(error({ rfc: "XYZ" }), "El RFC XYZ no es válido.");
  assert.equal(error({ razon_social: "  " }), "Escribe la razón social.");
  assert.equal(error({ regimen_fiscal: "999" }), "Elige un régimen fiscal del catálogo del SAT.");
  assert.equal(error({ codigo_postal: "4419" }), "El código postal son 5 dígitos.");
  assert.equal(error({ correo_compras: "compras@" }), "El correo de compras no es válido.");
});

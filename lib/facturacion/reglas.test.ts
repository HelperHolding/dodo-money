import { test } from "node:test";
import assert from "node:assert/strict";
import { formaPago, mensajeBusqueda, pideTipoTarjeta, usosPermitidos, validarDatosFiscales } from "./reglas.ts";

const REG = { "601": "General de Ley Personas Morales", "605": "Sueldos y Salarios", "612": "Actividades Empresariales", "626": "RESICO" };
const BASE = { rfc: " xyz010101ab1 ", nombre: "  cliente   prueba ", regimen_fiscal: "601", codigo_postal: "45160", uso_cfdi: "G03", correo: " Juan@Gmail.com ", tarjeta: "credito" };

test("normaliza RFC, nombre y correo", () => {
  const r = validarDatosFiscales(BASE, "tarjeta", REG);
  assert.ok("datos" in r);
  assert.deepEqual(r.datos, { rfc: "XYZ010101AB1", nombre: "CLIENTE PRUEBA", regimen_fiscal: "601", codigo_postal: "45160", uso_cfdi: "G03", correo: "juan@gmail.com", forma_pago: "04" });
});

test("rechaza RFC genérico, RFC mal formado y CP inválido", () => {
  assert.match((validarDatosFiscales({ ...BASE, rfc: "XAXX010101000" }, "tarjeta", REG) as { error: string }).error, /público en general/);
  assert.match((validarDatosFiscales({ ...BASE, rfc: "ABC12" }, "tarjeta", REG) as { error: string }).error, /RFC/);
  assert.match((validarDatosFiscales({ ...BASE, codigo_postal: "4516" }, "tarjeta", REG) as { error: string }).error, /código postal/);
});

test("persona moral (12) no puede tener régimen de persona física y viceversa", () => {
  assert.match((validarDatosFiscales({ ...BASE, regimen_fiscal: "612" }, "tarjeta", REG) as { error: string }).error, /régimen/);
  assert.ok("datos" in validarDatosFiscales({ ...BASE, rfc: "XYZW010101AB1", regimen_fiscal: "612" }, "tarjeta", REG));
});

test("avisa si el nombre trae el régimen de capital", () => {
  assert.match((validarDatosFiscales({ ...BASE, nombre: "Cliente Prueba S.A. de C.V." }, "tarjeta", REG) as { error: string }).error, /sin "S\.A\. de C\.V\."/);
  assert.match((validarDatosFiscales({ ...BASE, nombre: "CLIENTE SA DE CV" }, "tarjeta", REG) as { error: string }).error, /sin "S\.A\. de C\.V\."/);
});

test("uso del CFDI según régimen: 605 solo S01", () => {
  assert.deepEqual(usosPermitidos("601"), ["G03", "S01"]);
  assert.deepEqual(usosPermitidos("605"), ["S01"]);
  assert.match((validarDatosFiscales({ ...BASE, rfc: "XYZW010101AB1", regimen_fiscal: "605" }, "tarjeta", REG) as { error: string }).error, /uso/);
});

test("forma de pago", () => {
  assert.equal(formaPago("efectivo", null), "01");
  assert.equal(formaPago("tarjeta", "credito"), "04");
  assert.equal(formaPago("en_linea", "debito"), "28");
  assert.equal(formaPago("tarjeta", null), null);
  assert.equal(formaPago("otro", "credito"), null);
  assert.equal(pideTipoTarjeta("en_linea"), true);
  assert.equal(pideTipoTarjeta("efectivo"), false);
  assert.match((validarDatosFiscales({ ...BASE, tarjeta: "" }, "tarjeta", REG) as { error: string }).error, /crédito o débito/);
});

test("mensajes de búsqueda mencionan el correo cuando no hay salida en el portal", () => {
  assert.match(mensajeBusqueda("fuera_de_plazo"), /facturacion@dodopizza\.mx/);
  assert.match(mensajeBusqueda("varios"), /facturacion@dodopizza\.mx/);
  assert.match(mensajeBusqueda("no_encontrado"), /fecha, la hora y el total/);
  assert.match(mensajeBusqueda("limite"), /minutos/);
});

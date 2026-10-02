import { test } from "node:test";
import assert from "node:assert/strict";
import { clabeValida, leerArticulo, leerDesactivacion, leerProveedor, nombreRegimen, normalizarRfc, REGIMENES, rfcValido } from "./proveedores.ts";

const campos = (o: Record<string, string>) => (c: string) => o[c] ?? "";
const base = { razon_social: "Lácteos del Bajío SA de CV", rfc: "LBA010203AB1", regimen_fiscal: "601" };

test("RFC: se normaliza y valida persona moral (12) y física (13)", () => {
  assert.equal(normalizarRfc(" lba-010203 ab1 "), "LBA010203AB1");
  assert.equal(rfcValido("LBA010203AB1"), true);
  assert.equal(rfcValido("GOMJ800101AB2"), true);
  assert.equal(rfcValido("ÑAÑ010203AB1"), true);
  assert.equal(rfcValido("LB010203AB1"), false);
  assert.equal(rfcValido("LBA0102AB1"), false);
  assert.equal(rfcValido(""), false);
});

test("CLABE: 18 dígitos con dígito verificador", () => {
  assert.equal(clabeValida("032180000118359719"), true);
  assert.equal(clabeValida("002010077777777771"), true);
  assert.equal(clabeValida("012180001234567899"), true);
  assert.equal(clabeValida("012180001234567897"), false);
  assert.equal(clabeValida("03218000011835971"), false);
  assert.equal(clabeValida("0321800001183597AB"), false);
});

test("régimen fiscal del catálogo del SAT", () => {
  assert.equal(nombreRegimen("626"), "Régimen Simplificado de Confianza");
  assert.equal(REGIMENES["601"], "General de Ley Personas Morales");
  assert.equal(nombreRegimen("999"), "999");
});

test("proveedor mínimo: defaults de crédito, forma de pago y categorías", () => {
  const r = leerProveedor(campos(base));
  assert.ok("datos" in r);
  assert.deepEqual(r.datos, {
    razon_social: "Lácteos del Bajío SA de CV", nombre_comercial: null, rfc: "LBA010203AB1", regimen_fiscal: "601",
    contacto_nombre: null, telefono: null, correo: null, banco: null, clabe: null, cuenta: null,
    dias_credito: 0, forma_pago_habitual: "transferencia", categorias: [], notas: null, numero_cliente: null, dias_entrega: null,
  });
});

test("días de entrega: opcional, entero de 0 a 365", () => {
  const r = leerProveedor(campos({ ...base, dias_entrega: " 3 " }));
  assert.ok("datos" in r);
  assert.equal(r.datos.dias_entrega, 3);
  for (const malo of ["-1", "366", "2.5", "tres"]) {
    assert.deepEqual(leerProveedor(campos({ ...base, dias_entrega: malo })), { error: "Los días de entrega van de 0 a 365." });
  }
});

test("número de cliente: opcional, sin espacios de sobra, hasta 60 caracteres", () => {
  const r = leerProveedor(campos({ ...base, numero_cliente: "  CLI-00452 " }));
  assert.ok("datos" in r);
  assert.equal(r.datos.numero_cliente, "CLI-00452");
  assert.deepEqual(leerProveedor(campos({ ...base, numero_cliente: "x".repeat(61) })), { error: "El número de cliente es de hasta 60 caracteres." });
});

test("proveedor completo: acepta etiquetas legibles y las normaliza", () => {
  const r = leerProveedor(campos({
    ...base, rfc: "lba-010203-ab1", regimen_fiscal: "601 - General de Ley Personas Morales",
    nombre_comercial: " Lácteos Bajío ", correo: "Ventas@Lacteos.mx", clabe: "032180000118359719",
    dias_credito: "15", forma_pago_habitual: "Transferencia", categorias: "Consumible, Activo fijo, consumible",
  }));
  assert.ok("datos" in r);
  assert.equal(r.datos.rfc, "LBA010203AB1");
  assert.equal(r.datos.regimen_fiscal, "601");
  assert.equal(r.datos.nombre_comercial, "Lácteos Bajío");
  assert.equal(r.datos.correo, "ventas@lacteos.mx");
  assert.equal(r.datos.dias_credito, 15);
  assert.deepEqual(r.datos.categorias, ["consumible", "activo_fijo"]);
});

test("proveedor: cada error con mensaje claro", () => {
  const error = (o: Record<string, string>) => {
    const r = leerProveedor(campos({ ...base, ...o }));
    return "error" in r ? r.error : null;
  };
  assert.equal(error({ razon_social: " " }), "Escribe la razón social.");
  assert.equal(error({ rfc: "ABC" }), "El RFC ABC no es válido (12 caracteres para empresa, 13 para persona física).");
  assert.equal(error({ regimen_fiscal: "999" }), "Elige un régimen fiscal del catálogo del SAT.");
  assert.equal(error({ clabe: "012180001234567897" }), "La CLABE no es válida: deben ser 18 dígitos y revisa el último.");
  assert.equal(error({ correo: "ventas" }), "El correo no es válido.");
  assert.equal(error({ dias_credito: "-1" }), "Los días de crédito van de 0 a 365.");
  assert.equal(error({ dias_credito: "15.5" }), "Los días de crédito van de 0 a 365.");
  assert.equal(error({ forma_pago_habitual: "bitcoin" }), "Forma de pago no reconocida: bitcoin.");
  assert.equal(error({ categorias: "comida" }), "Categoría no reconocida: comida.");
});

test("artículo: consumible con ID de Dodo IS; los demás sin él", () => {
  const r = leerArticulo(campos({ nombre: " Queso mozzarella ", unidad: "kg", tipo: "consumible", tasa_iva: "0", dodo_insumo_id: "11f19a2e8ebb9f693a4a16e21fdbfd00" }));
  assert.ok("datos" in r);
  assert.deepEqual(r.datos, { nombre: "Queso mozzarella", unidad: "kg", tipo: "consumible", tasa_iva: "0", dodo_insumo_id: "11F19A2E8EBB9F693A4A16E21FDBFD00" });

  const error = (o: Record<string, string>) => {
    const x = leerArticulo(campos({ nombre: "Horno", unidad: "pza", tipo: "activo_fijo", tasa_iva: "16", ...o }));
    return "error" in x ? x.error : null;
  };
  assert.equal(error({}), null);
  assert.equal(error({ nombre: "" }), "Escribe el nombre del artículo.");
  assert.equal(error({ unidad: "" }), "Escribe la unidad (kg, pza, caja, servicio…).");
  assert.equal(error({ tipo: "x" }), "Elige el tipo de artículo.");
  assert.equal(error({ tasa_iva: "8" }), "Elige la tasa de IVA.");
  assert.equal(error({ dodo_insumo_id: "11F19A2E8EBB9F693A4A16E21FDBFD00" }), "Solo los consumibles llevan ID de insumo de Dodo IS.");
  assert.equal(error({ tipo: "consumible", dodo_insumo_id: "123" }), "El ID de insumo de Dodo IS son 32 caracteres (0-9 y A-F).");
});

test("desactivar pide motivo; reactivar lo borra", () => {
  assert.deepEqual(leerDesactivacion("no", " Cerró el negocio "), { datos: { activo: false, motivo_desactivacion: "Cerró el negocio" } });
  assert.deepEqual(leerDesactivacion("no", "  "), { error: "Escribe por qué se desactiva." });
  assert.deepEqual(leerDesactivacion("si", "lo que sea"), { datos: { activo: true, motivo_desactivacion: null } });
});

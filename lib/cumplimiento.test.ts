import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparAvisos, ambitoDe, contarAlertas, filtrarFilas, leerEntregados, leerObligacion, llaveValida, textoFrecuencia, ventanaAlertas, ventanaCalendario, type FilaCumplimiento } from "./cumplimiento.ts";

const fila = (x: Partial<FilaCumplimiento>): FilaCumplimiento => ({
  origen: "obligacion", referencia_id: "o1", fecha_id: null, revision: 0, titulo: "Licencia", detalle: "", tipo: "licencia",
  sucursal_id: "s1", razon_social_rfc: null, ambito: "Zapopan-1", vence: "2027-03-08", fecha: "2027-03-08", frecuencia: "mensual",
  estado: "pendiente", falta_evidencia: false, falta_factura: false, factura_id: null, ruta: "/cumplimiento/o1#fecha-2027-03-08", ...x,
});

test("textoFrecuencia: cada frecuencia en palabras", () => {
  assert.equal(textoFrecuencia("semanal", "2027-01-05"), "Cada semana, los martes");
  assert.equal(textoFrecuencia("quincenal", "2027-01-20"), "Cada quincena: día 15 y último día del mes");
  assert.equal(textoFrecuencia("mensual", "2027-01-31"), "Cada mes, día 31 (o el último del mes)");
  assert.equal(textoFrecuencia("bimestral", "2027-01-10"), "Cada 2 meses, día 10");
  assert.equal(textoFrecuencia("anual", "2028-02-29"), "Cada año, el 29 de febrero (o el 28 si no es bisiesto)");
  assert.equal(textoFrecuencia("anual", "2027-05-07"), "Cada año, el 7 de mayo");
});

test("filtros: origen, ámbito y estado; 'vigentes' oculta omitidas; 'sin_evidencia' usa la bandera", () => {
  const filas = [fila({}), fila({ referencia_id: "o2", estado: "omitida" }), fila({ origen: "compromiso", referencia_id: "c1", estado: "cumplida", falta_evidencia: true }),
    fila({ referencia_id: "o3", sucursal_id: null, razon_social_rfc: "CMS230321FI8", estado: "vencida" })];
  assert.deepEqual(filtrarFilas(filas, { origen: "", estado: "vigentes", ambito: "" }).map((f) => f.referencia_id), ["o1", "c1", "o3"]);
  assert.deepEqual(filtrarFilas(filas, { origen: "compromiso", estado: "todos", ambito: "" }).map((f) => f.referencia_id), ["c1"]);
  assert.deepEqual(filtrarFilas(filas, { origen: "", estado: "sin_evidencia", ambito: "" }).map((f) => f.referencia_id), ["c1"]);
  assert.deepEqual(filtrarFilas(filas, { origen: "", estado: "todos", ambito: "r:CMS230321FI8" }).map((f) => f.referencia_id), ["o3"]);
  assert.equal(ambitoDe({ sucursal_id: "s1", razon_social_rfc: null }), "s:s1");
});

test("contarAlertas: vencidas, por vencer, sin factura y sin evidencia", () => {
  assert.deepEqual(contarAlertas([fila({ estado: "vencida" }), fila({ estado: "por_vencer" }), fila({ estado: "cumplida_sin_factura" }), fila({ estado: "cumplida", falta_evidencia: true }), fila({ estado: "omitida" })]),
    { vencidas: 1, porVencer: 1, sinFactura: 1, sinEvidencia: 1 });
});

test("ventanas: el calendario y las alertas caben en 800 días", () => {
  assert.deepEqual(ventanaCalendario("2027-03-31"), { desde: "2026-03-31", hasta: "2028-04-30" });
  assert.deepEqual(ventanaAlertas("2027-03-08"), { desde: "2025-03-08", hasta: "2027-05-08" });
});

test("leerObligacion: valida y arma los datos de guardar_obligacion", () => {
  const base: Record<string, string> = { tipo: "seguro", nombre: "Póliza de daños", ambito: "s:00000000-0000-0000-0000-0000000000e1", frecuencia: "anual", inicio: "2027-05-07", fin: "", con_pago: "si", proveedor_id: "p1", monto_estimado: "$18,000.50" };
  const campo = (x: Record<string, string>) => (c: string) => x[c] ?? "";
  assert.deepEqual(leerObligacion(campo(base)), { datos: { tipo: "seguro", nombre: "Póliza de daños", descripcion: "", autoridad: "", folio: "", notas: "", sucursal_id: "00000000-0000-0000-0000-0000000000e1", razon_social_rfc: "", frecuencia: "anual", inicio: "2027-05-07", fin: "", con_pago: "true", proveedor_id: "p1", monto_estimado: "18000.50" } });
  const rs = leerObligacion(campo({ ...base, ambito: "r:CMS230321FI8", con_pago: "no" }));
  assert.ok("datos" in rs && rs.datos.razon_social_rfc === "CMS230321FI8" && rs.datos.sucursal_id === "" && rs.datos.proveedor_id === "" && rs.datos.con_pago === "false");
  assert.deepEqual(leerObligacion(campo({ ...base, tipo: "x" })), { error: "Elige el tipo de obligación." });
  assert.deepEqual(leerObligacion(campo({ ...base, nombre: "ab" })), { error: "Escribe el nombre (al menos 3 letras)." });
  assert.deepEqual(leerObligacion(campo({ ...base, ambito: "" })), { error: "Elige la sucursal o la razón social." });
  assert.deepEqual(leerObligacion(campo({ ...base, frecuencia: "diaria" })), { error: "Elige la frecuencia." });
  assert.deepEqual(leerObligacion(campo({ ...base, proveedor_id: "" })), { error: "Elige el proveedor que factura el pago." });
  assert.deepEqual(leerObligacion(campo({ ...base, monto_estimado: "0" })), { error: "El monto estimado debe ser mayor a cero (o déjalo vacío)." });
  assert.deepEqual(leerObligacion(campo({ ...base, fin: "2027-01-01" })), { error: "El fin no puede ser antes del inicio." });
  assert.deepEqual(leerObligacion(campo({ ...base, tipo: "otro", descripcion: "" })), { error: "Describe la obligación (al menos 3 letras)." });
});

test("avisos: se agrupan por tipo conservando el orden", () => {
  const a = { clave: "k", origen: "obligacion" as const, referencia_id: "o1", titulo: "A", detalle: "", ambito: "Z", vence: "2027-03-01", dias: -7, ruta: "/x", url: "https://app/x" };
  const g = agruparAvisos([{ ...a, tipo_aviso: "vencida" as const }, { ...a, titulo: "B", tipo_aviso: "por_vencer" as const }, { ...a, titulo: "C", tipo_aviso: "vencida" as const }]);
  assert.deepEqual(g.vencida.map((x) => x.titulo), ["A", "C"]);assert.deepEqual(g.por_vencer.map((x) => x.titulo), ["B"]);assert.deepEqual(g.sin_factura, []);
});

test("endpoints: llave y cuerpo de entregados", () => {
  assert.equal(llaveValida("abc", "abc"), true);assert.equal(llaveValida("abc", undefined), false);assert.equal(llaveValida(null, "abc"), false);assert.equal(llaveValida("abd", "abc"), false);
  const k = "obligacion:00000000-0000-0000-0000-0000000000e1:2027-03-08:vencida:2027-03-08";
  assert.deepEqual(leerEntregados({ canal: "chat", claves: [k, k] }), { canal: "chat", claves: [k] });
  assert.deepEqual(leerEntregados({ canal: "whatsapp", claves: [k] }), { error: "Canal inválido." });
  assert.deepEqual(leerEntregados({ canal: "correo", claves: [] }), { error: "Envía de 1 a 500 claves." });
  assert.deepEqual(leerEntregados({ canal: "correo", claves: ["obligacion:x"] }), { error: "Clave de aviso inválida." });
  assert.deepEqual(leerEntregados("texto"), { error: "Cuerpo inválido." });
});

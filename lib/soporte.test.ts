import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOMBRES_SECCION, OTRA_SECCION, clave, enTablero, filtrar, leerNuevoTicket, numeroDeClave, pideComentario, rutaInterna, seccionDeRuta, siguientes, textoCambio,
  type Ticket,
} from "./soporte.ts";

const ticket = (x: Partial<Ticket>): Ticket => ({
  id: "t", numero: 1, tipo: "problema", estado: "nuevo", prioridad: "media", titulo: "No guarda la foto", descripcion: "Se queda cargando",
  seccion: "Gastos (caja chica)", ruta_origen: "/caja-chica", bloquea: false, captura: null, creado_por: "u", creador: "Ana", rol_creador: "operacion",
  sucursal_id: null, sucursal: null, responsable: null, responsable_nombre: null, revision: 1, creado_en: "2026-11-23T10:00:00Z",
  actualizado_en: "2026-11-23T10:00:00Z", cerrado_en: null, sin_leer: false, ...x,
});

test("clave y numeroDeClave", () => {
  assert.equal(clave(14), "HD-14");
  assert.equal(numeroDeClave("HD-14"), 14); assert.equal(numeroDeClave(" hd-7 "), 7); assert.equal(numeroDeClave("14"), 14);
  assert.equal(numeroDeClave("DODO-14"), null); assert.equal(numeroDeClave("x"), null);
});

test("siguientes y pideComentario espejan cambiar_ticket", () => {
  assert.deepEqual(siguientes("nuevo"), ["en_revision", "en_progreso", "resuelto", "descartado"]);
  assert.deepEqual(siguientes("resuelto"), ["en_progreso"]);
  assert.deepEqual(siguientes("descartado"), ["en_revision"]);
  assert.equal(pideComentario("resuelto"), true); assert.equal(pideComentario("descartado"), true); assert.equal(pideComentario("en_progreso"), false);
});

test("seccionDeRuta: prefijo más largo, raíz exacta, desconocidas a Otra", () => {
  assert.equal(seccionDeRuta("/"), "Inicio");
  assert.equal(seccionDeRuta("/caja-chica"), "Gastos (caja chica)");
  assert.equal(seccionDeRuta("/compras/facturas/123?x=1"), "Compras");
  assert.equal(seccionDeRuta("/cierre-raro"), OTRA_SECCION);
  assert.equal(seccionDeRuta("/soporte/nuevo"), OTRA_SECCION);
  assert.equal(seccionDeRuta(null), OTRA_SECCION);
  assert.ok(NOMBRES_SECCION.includes(OTRA_SECCION));
  assert.equal(new Set(NOMBRES_SECCION).size, NOMBRES_SECCION.length);
});

test("rutaInterna: solo rutas propias", () => {
  assert.equal(rutaInterna("/ventas?mes=2026-11"), "/ventas?mes=2026-11");
  for (const r of ["//evil.com", "https://x.mx", "/\\evil", "", "/a\nb", "/" + "a".repeat(300)]) assert.equal(rutaInterna(r), null, r);
});

test("leerNuevoTicket: valida y solo un problema puede bloquear", () => {
  const datos: Record<string, string> = { tipo: "problema", titulo: " No guarda la foto ", descripcion: "Se queda cargando al guardar", seccion: "Gastos (caja chica)", ruta_origen: "/caja-chica", bloquea: "1" };
  const leer = (d: Record<string, string>) => (c: string) => d[c] ?? "";
  assert.deepEqual(leerNuevoTicket(leer(datos)), { datos: { tipo: "problema", titulo: "No guarda la foto", descripcion: "Se queda cargando al guardar", seccion: "Gastos (caja chica)", ruta_origen: "/caja-chica", bloquea: true } });
  assert.equal((leerNuevoTicket(leer({ ...datos, tipo: "mejora" })) as { datos: { bloquea: boolean } }).datos.bloquea, false);
  assert.deepEqual(leerNuevoTicket(leer({ ...datos, tipo: "" })), { error: "Elige si es un problema o una mejora." });
  assert.deepEqual(leerNuevoTicket(leer({ ...datos, titulo: "abc" })), { error: "El título debe tener de 5 a 150 caracteres." });
  assert.deepEqual(leerNuevoTicket(leer({ ...datos, descripcion: "corta" })), { error: "Describe el ticket con 10 a 4000 caracteres." });
  assert.deepEqual(leerNuevoTicket(leer({ ...datos, seccion: "Inventada" })), { error: "Elige la sección del sistema." });
  assert.equal((leerNuevoTicket(leer({ ...datos, ruta_origen: "//evil.com" })) as { datos: { ruta_origen: string | null } }).datos.ruta_origen, null);
});

test("filtrar y enTablero", () => {
  const ts = [ticket({ numero: 1 }), ticket({ numero: 2, tipo: "mejora", titulo: "Exportar", descripcion: "a Excel", sucursal: "Zapopan-1" }), ticket({ numero: 3, estado: "descartado" })];
  assert.deepEqual(filtrar(ts, { tipo: "mejora" }).map((t) => t.numero), [2]);
  assert.deepEqual(filtrar(ts, { q: "excel" }).map((t) => t.numero), [2]);
  assert.deepEqual(filtrar(ts, { q: "HD-3" }).map((t) => t.numero), [3]);
  assert.deepEqual(filtrar(ts, { sucursal: "Oficina" }).map((t) => t.numero), [1, 3]);
  assert.deepEqual(filtrar(ts, { estado: "descartado" }).map((t) => t.numero), [3]);
  const ahora = Date.parse("2026-12-30T00:00:00Z");
  assert.equal(enTablero(ticket({ estado: "descartado" }), ahora), false);
  assert.equal(enTablero(ticket({ estado: "en_progreso" }), ahora), true);
  assert.equal(enTablero(ticket({ estado: "resuelto", cerrado_en: "2026-12-01T00:00:00Z" }), ahora), true);
  assert.equal(enTablero(ticket({ estado: "resuelto", cerrado_en: "2026-11-29T00:00:00Z" }), ahora), false);
});

test("textoCambio", () => {
  const e = (campo: string, antes: string | null, despues: string | null) => ({ tipo: "cambio" as const, autor: "Seba", es_soporte: null, texto: null, campo, antes, despues, fecha: "" });
  assert.equal(textoCambio(e("creado", null, "nuevo")), "levantó el ticket");
  assert.equal(textoCambio(e("estado", "nuevo", "resuelto")), "cambió el estado de «Nuevo» a «Resuelto»");
  assert.equal(textoCambio(e("prioridad", "alta", "media")), "cambió la prioridad de Alta a Media");
  assert.equal(textoCambio(e("responsable", "Sebastián", "Julio")), "asignó el ticket a Julio");
  assert.equal(textoCambio(e("responsable", "Julio", null)), "quitó el responsable");
});

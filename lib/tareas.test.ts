import { test } from "node:test";
import assert from "node:assert/strict";
import {
  administra, agrupar, clave, filtrar, grupoVence, leerFiltros, leerNuevaTarea, meTocaCerrar, moduloDe, numeroDeClave,
  avisoMovida, ordenPendientes, pideComentario, puedeAbrirDocumento, puedeCrearTareas, puedeLigar, resumenGeneracion, siguientes, textoCambio, vencida, veTablero,
  type Quien, type Tarea,
} from "./tareas.ts";

const tarea = (x: Partial<Tarea>): Tarea => ({
  id: "t1", numero: 1, titulo: "Subir remisión", descripcion: null, estado: "por_hacer", prioridad: "media", vence: null,
  asignado_a: "op", asignado: "Ana", asignado_activo: true, creado_por: "jefe", creador: "Julio", sucursal_id: "s1", sucursal: "Zapopan-1",
  origen: "manual", documento_tipo: null, documento_id: null, documento_texto: null, documento_ruta: null, documento_anulado: false,
  motivo_cierre: null, revision: 1, creada_en: "2026-11-02T10:00:00Z", actualizada_en: "2026-11-02T10:00:00Z", cerrada_en: null,
  repite: null, anterior_numero: null, siguiente_numero: null, ...x,
});
const q = (id: string, rol: Quien["rol"], sucursal_id: string | null = "s1"): Quien => ({ id, rol, sucursal_id });

test("clave: DODO-n y de regreso", () => {
  assert.equal(clave(142), "DODO-142");
  assert.equal(numeroDeClave("DODO-142"), 142);
  assert.equal(numeroDeClave("dodo-7"), 7);
  assert.equal(numeroDeClave("15"), 15);
  assert.equal(numeroDeClave("DODO-"), null);
  assert.equal(numeroDeClave("abc"), null);
});

test("transiciones: el asignado avanza hasta revisión; quien creó cierra o regresa", () => {
  const t = tarea({});
  assert.deepEqual(siguientes(t, q("op", "operacion")), ["en_curso", "en_revision"]);
  assert.deepEqual(siguientes(tarea({ estado: "en_curso" }), q("op", "operacion")), ["en_revision"]);
  assert.deepEqual(siguientes(tarea({ estado: "en_revision" }), q("op", "operacion")), []);
  assert.deepEqual(siguientes(tarea({ estado: "en_revision" }), q("jefe", "encargado")), ["hecho", "en_curso", "cancelada"]);
  assert.deepEqual(siguientes(t, q("otro", "admin", null)), ["en_curso", "en_revision", "cancelada"]);
  assert.deepEqual(siguientes(tarea({ estado: "en_revision" }), q("g", "gerente")), ["hecho", "en_curso", "cancelada"]);
  assert.deepEqual(siguientes(tarea({ estado: "en_revision" }), q("g", "gerente", "s2")), []);
  assert.deepEqual(siguientes(t, q("c", "corporativo", null)), []);
  assert.deepEqual(siguientes(tarea({ estado: "hecho" }), q("x", "admin", null)), []);
  assert.equal(administra(t, q("jefe", "encargado")), true);
  assert.equal(administra(t, q("op", "operacion")), false);
});

test("un gerente asignado a la tarea no la administra salvo que la haya creado", () => {
  const propia = tarea({ estado: "en_revision", asignado_a: "g" });
  assert.equal(administra(propia, q("g", "gerente")), false);
  assert.deepEqual(siguientes(propia, q("g", "gerente")), []);
  assert.equal(meTocaCerrar(propia, q("g", "gerente")), false);
  assert.equal(administra(propia, q("g2", "gerente")), true);
  assert.equal(administra(propia, q("otro", "admin", null)), true);
  const suya = tarea({ estado: "en_revision", asignado_a: "g", creado_por: "g" });
  assert.equal(administra(suya, q("g", "gerente")), true);
  assert.deepEqual(siguientes(suya, q("g", "gerente")), ["hecho", "en_curso", "cancelada"]);
  assert.equal(meTocaCerrar(suya, q("g", "gerente")), true);
  assert.deepEqual(siguientes(tarea({ estado: "por_hacer", asignado_a: "g" }), q("g", "gerente")), ["en_curso", "en_revision"]);
});

test("pideComentario: regresar y cancelar exigen texto", () => {
  assert.equal(pideComentario("en_revision", "en_curso"), true);
  assert.equal(pideComentario("por_hacer", "cancelada"), true);
  assert.equal(pideComentario("en_curso", "en_revision"), false);
});

test("permisos de puesto: crear, ligar, abrir documento y tablero", () => {
  assert.deepEqual((["operacion", "encargado", "gerente", "admin", "corporativo"] as const).map(puedeCrearTareas), [false, true, true, true, false]);
  assert.equal(puedeLigar("admin", "factura"), true);
  assert.equal(puedeLigar("gerente", "factura"), false);
  assert.equal(puedeLigar("gerente", "ventas_dia"), true);
  assert.equal(puedeLigar("encargado", "ventas_dia"), false);
  assert.equal(puedeAbrirDocumento("gerente", "factura"), false);
  assert.equal(puedeAbrirDocumento("gerente", "ventas_dia"), true);
  assert.equal(puedeAbrirDocumento("corporativo", "apertura_item"), true);
  assert.equal(puedeAbrirDocumento("encargado", "ventas_dia"), false);
  assert.equal(veTablero("operacion"), false);
  assert.equal(veTablero("encargado"), true);
});

test("vencimiento: grupos y orden de pendientes", () => {
  const hoy = "2026-11-02";
  assert.equal(grupoVence(null, hoy), "sin_fecha");
  assert.equal(grupoVence("2026-11-01", hoy), "vencidas");
  assert.equal(grupoVence("2026-11-02", hoy), "hoy");
  assert.equal(grupoVence("2026-11-09", hoy), "semana");
  assert.equal(grupoVence("2026-11-10", hoy), "despues");
  assert.equal(vencida(tarea({ vence: "2026-11-01" }), hoy), true);
  assert.equal(vencida(tarea({ vence: "2026-11-01", estado: "hecho" }), hoy), false);
  const ts = [tarea({ numero: 1, vence: "2026-11-05", prioridad: "baja" }), tarea({ numero: 2, vence: null, prioridad: "alta" }),
    tarea({ numero: 3, vence: "2026-10-30", prioridad: "baja" }), tarea({ numero: 4, vence: "2026-11-03", prioridad: "alta" })];
  assert.deepEqual(ordenPendientes(ts, hoy).map((t) => t.numero), [3, 4, 2, 1]);
  assert.deepEqual(agrupar(ts, hoy).map(([g, l]) => [g, l.map((t) => t.numero)]), [["vencidas", [3]], ["semana", [4, 1]], ["sin_fecha", [2]]]);
});

test("filtros del tablero: se leen de la URL y se aplican", () => {
  const hoy = "2026-11-02";
  const f = leerFiltros({ persona: "op", modulo: "facturas", prioridad: "alta", vencidas: "1", origen: "nada", sucursal: "" });
  assert.deepEqual(f, { persona: "op", sucursal: "", prioridad: "alta", modulo: "facturas", vencidas: true, origen: "" });
  const ts = [tarea({ numero: 1, documento_tipo: "factura", prioridad: "alta", vence: "2026-11-01" }),
    tarea({ numero: 2, documento_tipo: "factura", prioridad: "alta", vence: "2026-11-05" }),
    tarea({ numero: 3, documento_tipo: null, prioridad: "alta", vence: "2026-11-01" })];
  assert.deepEqual(filtrar(ts, f, hoy).map((t) => t.numero), [1]);
  assert.deepEqual(filtrar(ts, leerFiltros({ modulo: "sin" }), hoy).map((t) => t.numero), [3]);
  assert.equal(moduloDe("apertura_item"), "aperturas");
  assert.equal(moduloDe(null), "sin");
});

test("me toca cerrar: lo que creé y está en revisión; el gerente, lo de su sucursal", () => {
  assert.equal(meTocaCerrar(tarea({ estado: "en_revision" }), q("jefe", "admin", null)), true);
  assert.equal(meTocaCerrar(tarea({ estado: "en_revision" }), q("otro", "admin", null)), false);
  assert.equal(meTocaCerrar(tarea({ estado: "en_revision" }), q("g", "gerente")), true);
  assert.equal(meTocaCerrar(tarea({ estado: "en_curso" }), q("jefe", "admin", null)), false);
});

test("leerNuevaTarea: limpia, valida y rechaza con mensaje", () => {
  const campos = (x: Record<string, string>) => (c: string) => x[c] ?? "";
  const ok = leerNuevaTarea(campos({ titulo: "  Subir remisión  ", prioridad: "alta", vence: "2026-11-06", asignado_a: "11111111-1111-1111-1111-111111111111", documento_tipo: "factura", documento_id: "22222222-2222-2222-2222-222222222222" }));
  assert.deepEqual(ok, { datos: { titulo: "Subir remisión", descripcion: "", prioridad: "alta", vence: "2026-11-06", asignado_a: "11111111-1111-1111-1111-111111111111", sucursal_id: "", documento_tipo: "factura", documento_id: "22222222-2222-2222-2222-222222222222", repite: "" } });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: " a ", asignado_a: "11111111-1111-1111-1111-111111111111" })), { error: "El título debe tener de 3 a 200 caracteres." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "" })), { error: "Elige a quién se asigna la tarea." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "11111111-1111-1111-1111-111111111111", vence: "2026-13-40" })), { error: "La fecha de vencimiento no es válida." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "11111111-1111-1111-1111-111111111111", prioridad: "urgente" })), { error: "Prioridad inválida." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "11111111-1111-1111-1111-111111111111", documento_tipo: "factura" })), { error: "El documento ligado está incompleto." });
  assert.equal("datos" in leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "11111111-1111-1111-1111-111111111111" })), true);
  const recoger = leerNuevaTarea(campos({ titulo: "Recoger efectivo", asignado_a: "11111111-1111-1111-1111-111111111111", vence: "2026-11-09", repite: "semanal" }));
  assert.equal("datos" in recoger && recoger.datos.repite, "semanal");
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Recoger efectivo", asignado_a: "11111111-1111-1111-1111-111111111111", repite: "semanal" })), { error: "Para que se repita, ponle fecha de vencimiento." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Recoger efectivo", asignado_a: "11111111-1111-1111-1111-111111111111", vence: "2026-11-09", repite: "diario" })), { error: "Repetición inválida." });
});

test("textoCambio: historial en palabras", () => {
  const e = { tipo: "cambio" as const, autor: "Julio", texto: null, fecha: "2026-11-02T10:00:00Z" };
  assert.equal(textoCambio({ ...e, campo: "creada", antes: null, despues: "por_hacer" }), "creó la tarea");
  assert.equal(textoCambio({ ...e, campo: "estado", antes: "en_curso", despues: "en_revision" }), "la movió de En curso a En revisión");
  assert.equal(textoCambio({ ...e, campo: "asignado_a", antes: "Ana", despues: "Luis" }), "la reasignó de Ana a Luis");
  assert.equal(textoCambio({ ...e, campo: "prioridad", antes: "media", despues: "alta" }), "cambió la prioridad de Media a Alta");
  assert.equal(textoCambio({ ...e, campo: "vence", antes: null, despues: "2026-11-06" }), "cambió el vencimiento de sin fecha a vie 6 de nov");
  assert.equal(textoCambio({ ...e, campo: "vence", antes: "2026-11-06", despues: null }), "cambió el vencimiento de vie 6 de nov a sin fecha");
  assert.equal(textoCambio({ ...e, campo: "titulo", antes: "a", despues: "b" }), "cambió el título");
  assert.equal(textoCambio({ ...e, campo: "descripcion", antes: "a", despues: "b" }), "editó la descripción");
  assert.equal(textoCambio({ ...e, campo: "resuelta", antes: null, despues: "Resuelto automáticamente" }), "la cerró: el pendiente ya se resolvió en el documento");
  assert.equal(textoCambio({ ...e, campo: "repite", antes: null, despues: "semanal" }), "cambió la repetición de no se repite a cada semana");
  assert.equal(textoCambio({ ...e, campo: "repite", antes: "mensual", despues: null }), "cambió la repetición de cada mes a no se repite");
});

test("resumenGeneracion: totales de una corrida de reglas", () => {
  const f = (regla: string, creadas: number, cerradas: number) => ({ regla, creadas, cerradas });
  assert.equal(resumenGeneracion([f("a", 0, 0), f("b", 0, 0)]), "Sin cambios: no hay pendientes nuevos ni tareas por cerrar.");
  assert.equal(resumenGeneracion([f("a", 2, 0), f("b", 1, 1)]), "3 tareas creadas y 1 tarea cerrada.");
  assert.equal(resumenGeneracion([f("a", 1, 0)]), "1 tarea creada.");
  assert.equal(resumenGeneracion([f("a", 0, 4)]), "4 tareas cerradas.");
});

test("avisoMovida: dice cuál es la siguiente de una tarea que se repite", () => {
  assert.equal(avisoMovida(82, null), "DODO-82 actualizada.");
  assert.equal(avisoMovida(82, { numero: 131, vence: "2026-11-09" }), "DODO-82 actualizada. Siguiente: DODO-131, vence lun 9 de nov.");
});

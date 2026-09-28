import { test } from "node:test";
import assert from "node:assert/strict";
import { contarListas, estadoLista, filasListas, zonaCompleta } from "./zonas.ts";

const checklists = [
  { id: "em", clave: "encargado_manana", nombre: "Encargado · Mañana", orden: 10 },
  { id: "ts", clave: "tareas_semanales", nombre: "Tareas semanales", orden: 30 },
  { id: "bn", clave: "bano", nombre: "Baño", orden: 80 },
];
const puntos = [
  { checklist_id: "em", momento: "apertura" as const, dia_semana: null },
  { checklist_id: "em", momento: "cambio" as const, dia_semana: null },
  { checklist_id: "em", momento: "durante_manana" as const, dia_semana: null },
  { checklist_id: "ts", momento: "semanal" as const, dia_semana: 1 },
  { checklist_id: "bn", momento: "hora" as const, dia_semana: null },
];
const registros = [
  { checklist_id: "em", momento: "apertura" as const, revisado_por: "u1" },
  { checklist_id: "em", momento: "cambio" as const, revisado_por: null },
];

test("estadoLista", () => {
  assert.equal(estadoLista(false), "no-aplica");
  assert.equal(estadoLista(true), "pendiente");
  assert.equal(estadoLista(true, { revisado_por: null }), "hecho");
  assert.equal(estadoLista(true, { revisado_por: "u1" }), "revisado");
});

test("filasListas arma una fila por lista con momentos de turno y omite las que solo tienen ronda", () => {
  const filas = filasListas(checklists, puntos, registros, 1);
  assert.deepEqual(filas.map((f) => f.clave), ["encargado_manana", "tareas_semanales"]);
  const em = Object.fromEntries(filas[0].celdas.map((c) => [c.momento, c.estado]));
  assert.deepEqual(em, {
    apertura: "revisado", cambio: "hecho", durante_manana: "pendiente",
    durante_tarde: "no-aplica", cierre: "no-aplica", semanal: "no-aplica",
  });
  assert.equal(filas[1].celdas.find((c) => c.momento === "semanal")?.estado, "pendiente");
});

test("tareas semanales en viernes no aplican", () => {
  const filas = filasListas(checklists, puntos, [], 5);
  assert.equal(filas[1].celdas.find((c) => c.momento === "semanal")?.estado, "no-aplica");
});

test("contarListas cuenta solo las casillas que aplican", () => {
  assert.deepEqual(contarListas(filasListas(checklists, puntos, registros, 1)), { total: 4, hechas: 2 });
});

test("zonaCompleta exige nombre, todos los puntos y comentario en cada no cumple", () => {
  assert.equal(zonaCompleta("Ana", [{ cumple: true, comentario: null }, { cumple: false, comentario: "sucio" }]), true);
  assert.equal(zonaCompleta(" ", [{ cumple: true, comentario: null }]), false);
  assert.equal(zonaCompleta("Ana", [{ cumple: null, comentario: null }]), false);
  assert.equal(zonaCompleta("Ana", [{ cumple: false, comentario: null }]), false);
});

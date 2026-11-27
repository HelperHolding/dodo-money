import { test } from "node:test";
import assert from "node:assert/strict";
import { armarCorreo, armarResumen, escapar, type AvisoTomado } from "./correo.ts";

const aviso = (x: Partial<AvisoTomado> = {}): AvisoTomado => ({
  aviso_id: "a", para: "scervera@dodopizza.mx", evento: "nuevo", numero: 14, tipo: "problema", titulo: "No guarda la foto",
  descripcion: "Se queda cargando\nal guardar", seccion: "Gastos (caja chica)", prioridad: "alta", sucursal: "Zapopan-1",
  creador: "Ana López", rol_creador: "operacion", con_captura: true, comentario: null, autor_comentario: null, ...x,
});
const BASE = "https://dodo.example.mx";

test("correo de ticket nuevo: asunto, datos, enlace y captura", () => {
  const c = armarCorreo(aviso(), BASE);
  assert.equal(c.asunto, "[HD-14] Problema · Gastos (caja chica) · No guarda la foto");
  assert.match(c.html, /href="https:\/\/dodo\.example\.mx\/soporte\/14"/);
  assert.match(c.html, /Ana López · Operación · Zapopan-1/);
  assert.match(c.html, /Alta/);
  assert.match(c.html, /Se queda cargando<br>al guardar/);
  assert.match(c.html, /Trae captura de pantalla/);
  assert.match(c.texto, /https:\/\/dodo\.example\.mx\/soporte\/14/);
});

test("correo de comentario: asunto con autor y el comentario en el cuerpo", () => {
  const c = armarCorreo(aviso({ evento: "comentario", comentario: "Sigue pasando", autor_comentario: "Ana López", con_captura: false, sucursal: null }), BASE);
  assert.equal(c.asunto, "[HD-14] Comentario de Ana López");
  assert.match(c.html, /Sigue pasando/);
  assert.match(c.html, /Oficina/);
  assert.doesNotMatch(c.html, /captura/);
});

test("escapa HTML y deja el asunto en una línea de máximo 200", () => {
  const c = armarCorreo(aviso({ titulo: "<script>x</script>\r\nBcc: otro@x.mx", descripcion: `"a" & 'b'` }), BASE);
  assert.doesNotMatch(c.html, /<script>/);
  assert.match(c.html, /&lt;script&gt;/);
  assert.match(c.html, /&quot;a&quot; &amp; &#39;b&#39;/);
  assert.doesNotMatch(c.asunto, /[\r\n]/);
  assert.equal(armarCorreo(aviso({ titulo: "x".repeat(400) }), BASE).asunto.length, 200);
  assert.equal(escapar(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});

test("escalado: asunto según tipo y diagnóstico del agente en el cuerpo", () => {
  const base = { aviso_id: "a", para: "s@x.mx", numero: 9, titulo: "No cuadra <el> corte", descripcion: "Sale con diferencia", seccion: "Efectivo",
    prioridad: "alta", sucursal: "Zapopan-1", creador: "Ana", rol_creador: "operacion", con_captura: false, comentario: "Revisé el arqueo: <b>$200</b>", autor_comentario: "Agente DODO" } as const;
  const p = armarCorreo({ ...base, evento: "escalado", tipo: "problema" }, "https://app.mx");
  assert.equal(p.asunto, "[HD-9] Te necesita: No cuadra <el> corte");
  assert.match(p.html, /Diagnóstico del agente/); assert.match(p.html, /Revisé el arqueo: &lt;b&gt;\$200&lt;\/b&gt;/); assert.match(p.html, /Sale con diferencia/);
  assert.match(p.texto, /Diagnóstico del agente:\nRevisé el arqueo/);
  assert.equal(armarCorreo({ ...base, evento: "escalado", tipo: "mejora" }, "https://app.mx").asunto, "[HD-9] Mejora: No cuadra <el> corte");
});

test("resumen diario: un correo por destinatario; vacío sin tickets", () => {
  assert.deepEqual(armarResumen([], "https://app.mx", ["s@x.mx"], "24 nov 2026"), []);
  const filas = [{ numero: 3, titulo: "¿Dónde subo <la> factura?", tipo: "problema" as const, creador: "Ana", sucursal: null, respuesta: "En Compras → Documentos.", reabierto: true }];
  const r = armarResumen(filas, "https://app.mx", ["s@x.mx", "j@x.mx"], "24 nov 2026");
  assert.deepEqual(r.map((x) => x.para), ["s@x.mx", "j@x.mx"]);
  assert.equal(r[0].asunto, "Help Desk: el agente resolvió 1 ticket · 24 nov 2026");
  assert.match(r[0].html, /HD-3/); assert.match(r[0].html, /&lt;la&gt;/); assert.match(r[0].html, /Reabierto/); assert.match(r[0].html, /https:\/\/app\.mx\/soporte\/3/);
  assert.match(r[0].texto, /HD-3 · ¿Dónde subo <la> factura\? · Ana · Oficina \(reabierto\)\nEn Compras → Documentos\./);
});

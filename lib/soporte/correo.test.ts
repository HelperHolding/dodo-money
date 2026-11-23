import { test } from "node:test";
import assert from "node:assert/strict";
import { armarCorreo, escapar, type AvisoTomado } from "./correo.ts";

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

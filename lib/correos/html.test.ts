import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiarHtml } from "./html.ts";

test("html: quita scripts, on*= y javascript:, cuenta lo quitado y conserva comentarios condicionales de Outlook", () => {
  const r = limpiarHtml(`<!--[if mso]><v:roundrect href="https://dodopizza.mx"/><![endif]--><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><a href="https://dodopizza.mx" onclick='y()'>ok</a>`);
  assert.equal(r.quitados, 4);
  assert.doesNotMatch(r.html, /script|onerror|onclick|javascript:/i);
  assert.match(r.html, /<!--\[if mso\]><v:roundrect href="https:\/\/dodopizza\.mx"\/><!\[endif\]-->/);
  assert.equal(limpiarHtml("<p>ok</p>").quitados, 0);
});

test("html: formas ejecutables alternativas (comillas internas, separadores, sin comillas, entidades, sin cierre, anidado)", () => {
  const casos: [string, number][] = [
    [`<a href="javascript:alert('x')">x</a>`, 1],
    [`<img/onerror=alert(1) src=x>`, 1],
    [`<img src="x"onerror="alert(1)">`, 1],
    [`<a href=javascript:alert(1)>x</a>`, 1],
    [`<a href="java&#115;cript:alert(1)">x</a>`, 1],
    [`<a href="jav&#x61;script:alert(1)">x</a>`, 1],
    [`<a href="java\tscript:alert(1)">x</a>`, 1],
    [`<a href="javascript&colon;alert(1)">x</a>`, 1],
    [`<p>hola</p><script>alert(1)`, 1],
    [`<scr<script>x</script>ipt>alert(1)</script>`, 2],
    [`<form action="javascript:x()"><button formaction="vbscript:y">z</button></form>`, 2],
  ];
  for (const [entrada, n] of casos) {
    const r = limpiarHtml(entrada);
    assert.equal(r.quitados, n, entrada);
    assert.doesNotMatch(r.html, /<script|onerror|javascript|vbscript|&#|&colon|script:/i, entrada);
  }
});

test("html: no toca texto visible ni enlaces seguros", () => {
  const r = limpiarHtml(`<p>Hola onda=bien y onclick=x</p><a href="https://dodopizza.mx/?a=1&amp;b=2" title="x onfoo=bar">ok</a>`);
  assert.equal(r.quitados, 0);
  assert.equal(r.html, `<p>Hola onda=bien y onclick=x</p><a href="https://dodopizza.mx/?a=1&amp;b=2" title="x onfoo=bar">ok</a>`);
});

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

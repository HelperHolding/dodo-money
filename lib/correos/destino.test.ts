import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoClic, dominioPermitido } from "./destino.ts";

test("destino: solo dodopizza.mx, subdominios y extras; agrega UTM si falta", () => {
  assert.equal(destinoClic("https://dodopizza.mx/zp1/go-big", "go-big", []), "https://dodopizza.mx/zp1/go-big?utm_source=correo&utm_medium=email&utm_campaign=go-big");
  assert.equal(destinoClic("https://www.dodopizza.mx/a?b=1", "x", []), "https://www.dodopizza.mx/a?b=1&utm_source=correo&utm_medium=email&utm_campaign=x");
  assert.equal(destinoClic("https://dodopizza.mx/a?utm_source=ig", "x", []), "https://dodopizza.mx/a?utm_source=ig");
  for (const malo of ["https://dodopizza.mx.malo.com/", "http://dodopizza.mx/", "javascript:alert(1)", "https://evil.com/?dodopizza.mx", "", null])
    assert.equal(destinoClic(malo, "x", []), "https://dodopizza.mx/");
  assert.equal(dominioPermitido("wa.me", ["wa.me"]), true);
  assert.equal(destinoClic("https://wa.me/523312345678", "x", ["wa.me"]), "https://wa.me/523312345678?utm_source=correo&utm_medium=email&utm_campaign=x");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { COOKIE_HOST, COOKIES_SESION, encabezadosSeguridad, politicaContenido } from "./seguridad.ts";

const valor = (clave: string, opciones = { supabaseUrl: "https://abc.supabase.co" }) =>
  encabezadosSeguridad(opciones).find((h) => h.key === clave)?.value;

test("headers base: HSTS sin preload, CSP y protección contra iframes ajenos", () => {
  assert.equal(valor("Strict-Transport-Security"), "max-age=63072000");
  assert.doesNotMatch(valor("Strict-Transport-Security")!, /preload/);
  assert.equal(valor("X-Frame-Options"), "SAMEORIGIN");
  assert.match(valor("Content-Security-Policy")!, /frame-ancestors 'self'/);
  assert.equal(valor("X-Content-Type-Options"), "nosniff");
});

test("CSP: Storage de Supabase solo para imágenes y vistas previas; sin eval en producción", () => {
  const csp = politicaContenido({ supabaseUrl: " https://abc.supabase.co/ " });
  assert.match(csp, /img-src 'self' data: blob: https:\/\/abc\.supabase\.co;/);
  assert.match(csp, /frame-src 'self' https:\/\/abc\.supabase\.co;/);
  assert.match(csp, /connect-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-eval|ws:/);
  assert.match(politicaContenido({ supabaseUrl: "https://abc.supabase.co", desarrollo: true }), /'unsafe-eval'.*connect-src 'self' ws:/);
});

test("CSP: sin URL de Supabase válida no agrega orígenes", () => {
  for (const supabaseUrl of [undefined, "", "no es url"]) {
    const csp = politicaContenido({ supabaseUrl });
    assert.match(csp, /img-src 'self' data: blob:;/);
    assert.match(csp, /frame-src 'self';/);
  }
});

test("cookies host-only: __Host-, Secure, HttpOnly, SameSite=Lax y sin Domain", () => {
  for (const c of [COOKIES_SESION, COOKIE_HOST]) {
    assert.equal(c.secure, true);
    assert.equal(c.httpOnly, true);
    assert.equal(c.sameSite, "lax");
    assert.equal(c.path, "/");
    assert.equal("domain" in c, false);
  }
  assert.match(COOKIES_SESION.name, /^__Host-/);
});

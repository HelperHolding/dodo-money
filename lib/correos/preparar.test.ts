import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararCorreo } from "./preparar.ts";
const B = "https://app.test";

test("preparar: reescribe enlaces de dodopizza (comillas dobles, simples y &amp;) y deja los demás", () => {
  const html = `<html><body><a href="https://dodopizza.mx/zp1/go-big?a=1&amp;b=2">A</a><a href='https://www.dodopizza.mx/x'>B</a><a href="https://instagram.com/dodo">C</a><a href="mailto:hola@dodopizza.mx">D</a></body></html>`;
  const r = prepararCorreo(html, "tok123", B, "Go Big", []);
  assert.match(r.html, /href="https:\/\/app\.test\/api\/correos\/c\/tok123\?u=https%3A%2F%2Fdodopizza\.mx%2Fzp1%2Fgo-big%3Fa%3D1%26b%3D2"/);
  assert.match(r.html, /href="https:\/\/app\.test\/api\/correos\/c\/tok123\?u=https%3A%2F%2Fwww\.dodopizza\.mx%2Fx"/);
  assert.match(r.html, /href="https:\/\/instagram\.com\/dodo"/);
  assert.match(r.html, /href="mailto:hola@dodopizza\.mx"/);
});

test("preparar: Canva con comillas simples y &amp; manda como destino la URL original decodificada", () => {
  const r = prepararCorreo(`<a href='https://dodopizza.mx/zp1/promo?a=1&amp;b=2&amp;c=x%20y'>Pide</a>`, "t", B, "S", []);
  const u = new URL(/href="([^"]+)"/.exec(r.html)![1]);
  assert.equal(u.searchParams.get("u"), "https://dodopizza.mx/zp1/promo?a=1&b=2&c=x%20y");
  assert.match(r.texto, /\nhttps:\/\/dodopizza\.mx\/zp1\/promo\?a=1&b=2&c=x%20y\n/);
  assert.doesNotMatch(r.html, /&amp;b=2/);
});

test("preparar: píxel y pie de baja antes de </body>; sin </body> van al final", () => {
  const r = prepararCorreo("<html><BODY><p>x</p></BODY></html>", "t", B, "S", []);
  assert.match(r.html, /<img src="https:\/\/app\.test\/api\/correos\/a\/t" width="1" height="1" alt=""[^>]*>.*<\/BODY>/s);
  assert.match(r.html, /href="https:\/\/app\.test\/baja\/t"[^>]*>date de baja aquí<\/a>/);
  assert.match(prepararCorreo("<p>sin body</p>", "t", B, "S", []).html, /baja\/t.*$/s);
  assert.match(r.texto, /^S\n/);
  assert.match(r.texto, /Darte de baja: https:\/\/app\.test\/baja\/t/);
});

test("preparar: data-href no se reescribe y &#38; / &#x26; se decodifican", () => {
  const r = prepararCorreo(`<a data-href="https://dodopizza.mx/no" href="https://dodopizza.mx/si?x=1&#38;y=2&#x26;z=3">A</a>`, "t", B, "S", []);
  assert.match(r.html, /data-href="https:\/\/dodopizza\.mx\/no"/);
  const u = new URL(/ href="([^"]+)"/.exec(r.html)![1]);
  assert.equal(u.searchParams.get("u"), "https://dodopizza.mx/si?x=1&y=2&z=3");
});

test("preparar: CORREOS_DOMINIOS_EXTRA también pasa por el seguimiento; mailto, tel, # y http no", () => {
  const html = `<a href="https://instagram.com/dodo">I</a><a href="https://www.instagram.com/p/1">P</a><a href="http://dodopizza.mx/x">H</a><a href="mailto:hola@dodopizza.mx">M</a><a href="tel:+523312345678">T</a><a href="#arriba">A</a><a href="https://wa.me.evil.com/x">E</a>`;
  const con = prepararCorreo(html, "t", B, "S", ["instagram.com", "wa.me"]);
  assert.match(con.html, /href="https:\/\/app\.test\/api\/correos\/c\/t\?u=https%3A%2F%2Finstagram\.com%2Fdodo"/);
  assert.match(con.html, /href="https:\/\/app\.test\/api\/correos\/c\/t\?u=https%3A%2F%2Fwww\.instagram\.com%2Fp%2F1"/);
  for (const intacto of ['href="http://dodopizza.mx/x"', 'href="mailto:hola@dodopizza.mx"', 'href="tel:+523312345678"', 'href="#arriba"', 'href="https://wa.me.evil.com/x"']) assert.ok(con.html.includes(intacto), intacto);
  assert.match(con.texto, /\nhttps:\/\/instagram\.com\/dodo\n/);
  const sin = prepararCorreo(html, "t", B, "S", []);
  assert.match(sin.html, /href="https:\/\/instagram\.com\/dodo"/);
  assert.doesNotMatch(sin.html, /api\/correos\/c\/t\?u=https%3A%2F%2F(www\.)?instagram/);
});

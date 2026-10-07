import { test } from "node:test";
import assert from "node:assert/strict";
import { leerPortal } from "./portal.ts";
const leer = (o: Record<string,string>) => leerPortal(c => o[c] ?? "");
test("portal: valida enlaces y conserva espacios de contraseña", () => {
  const r = leer({url:"https://portal.example.com/login",usuario:" usuario ",password:" pass "});
  assert.ok("datos" in r);
  assert.equal(r.datos.password," pass ");
  assert.equal(r.datos.usuario,"usuario");
  for (const url of ["javascript:alert(1)","http://example.com","https://user:pass@example.com","no es un enlace"]) assert.ok("error" in leer({url,usuario:"u"}));
});
test("portal: contraseña vacía conserva; quitar y cambiar son excluyentes", () => {
  assert.ok("datos" in leer({url:"https://example.com",usuario:"u"}));
  assert.ok("error" in leer({url:"https://example.com",usuario:"u",password:"pass",quitar_password:"on"}));
  assert.ok("error" in leer({url:"https://example.com",usuario:""}));
  assert.ok("error" in leer({url:"https://example.com",usuario:"u",password:"a".repeat(1001)}));
});

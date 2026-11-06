import { test } from "node:test";
import assert from "node:assert/strict";
import { esRebote, llaveValida } from "./llave.ts";
test("llave: exacta, sin espacios sobrantes y nunca vacía", () => {
  assert.equal(llaveValida(" abc ", "abc\n"), true);
  assert.equal(llaveValida("abc", "abd"), false);
  assert.equal(llaveValida(null, "abc"), false);
  assert.equal(llaveValida("", ""), false);
  assert.equal(llaveValida("x", undefined), false);
});
test("rebote: solo respuestas SMTP 5xx de destinatario", () => {
  assert.equal(esRebote("550 5.1.1 user unknown"), true);
  assert.equal(esRebote("Can't send mail - all recipients were rejected: 553 mailbox"), true);
  assert.equal(esRebote("421 try again later"), false);
  assert.equal(esRebote("Connection timeout"), false);
  assert.equal(esRebote(null), false);
});
test("rebote: no confunde puertos, duraciones, credenciales ni buzón lleno", () => {
  for (const t of ["550 5.1.1 User unknown", "554 5.7.1 rejected", "Error: 553 mailbox name invalid", "5.1.1 The email account does not exist"]) assert.equal(esRebote(t), true, t);
  for (const t of ["connect ECONNREFUSED smtp.x:587", "535 Authentication failed", "timeout after 500 ms", "552 mailbox full", "421 try later"]) assert.equal(esRebote(t), false, t);
});

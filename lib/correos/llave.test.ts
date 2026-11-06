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

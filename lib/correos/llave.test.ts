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
  for (const t of ["550 5.1.1 User unknown", "Error: 553 mailbox name invalid", "5.1.1 The email account does not exist", "550 5.1.10 RESOLVER.ADR.RecipientNotFound", "550 5.1.1. User unknown"]) assert.equal(esRebote(t), true, t);
  for (const t of ["connect ECONNREFUSED smtp.x:587", "535 Authentication failed", "timeout after 500 ms", "552 mailbox full", "421 try later"]) assert.equal(esRebote(t), false, t);
});
test("rebote: fallas del remitente (cuota, spam, autenticación) no marcan al contacto", () => {
  for (const t of [
    "Can't send mail - all recipients were rejected: 550 5.4.5 Daily user sending quota exceeded.",
    "Message failed: 554 5.7.1 Message rejected as spam",
    "550 5.7.1 Unauthenticated email from dodopizza.mx is not accepted",
    "554 5.2.0 STOREDRV.Submission.Exception:SubmissionQuotaExceededException",
    "554 5.7.1 rejected",
    "554 mailbox unavailable",
    "421 4.7.0 Try again later",
  ]) assert.equal(esRebote(t), false, t);
});
test("rebote: un 5.1.x dentro de una IP o versión no cuenta", () => {
  assert.equal(esRebote("connect ETIMEDOUT 10.5.1.2:587"), false);
  assert.equal(esRebote("Greeting never received from 192.168.5.1.3"), false);
  assert.equal(esRebote("Error: 550 rejected by 10.5.1.2"), true); // sin código extendido real: decide el 550
});

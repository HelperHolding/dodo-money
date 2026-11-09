import { test } from "node:test";
import assert from "node:assert/strict";
import { rutaSinSesion } from "./rutasPublicas.ts";

test("rutas sin sesión: login, invitación, reportes automáticos, la sincronización de Dodo IS y las tareas automáticas (cron con clave)", () => {
  for (const r of ["/login", "/login/olvide", "/auth/confirm", "/invitacion", "/api/reporte-diario", "/api/reporte-semanal", "/api/reporte-mensual", "/api/dodois/sincronizar", "/api/rappi/importar", "/api/cumplimiento/avisos", "/api/cumplimiento/avisos/entregados", "/api/tareas/generar"]) {
    assert.equal(rutaSinSesion(r), true, r);
  }
  for (const r of ["/", "/ventas", "/ventas/dodois", "/api/dodois/conectar", "/api/dodois/callback", "/api/dodois/sincronizar-otra", "/invitacion/x", "/api/asistente", "/api/rappi/importar/x", "/api/rappi", "/api/cumplimiento", "/cumplimiento", "/api/tareas", "/api/tareas/generar/x"]) {
    assert.equal(rutaSinSesion(r), false, r);
  }
});

test("correos: seguimiento, n8n y baja sin sesión; la sección no", () => {
  for (const r of ["/api/correos/siguiente", "/api/correos/resultado", "/api/correos/a/tok", "/api/correos/c/tok", "/baja/tok"]) assert.equal(rutaSinSesion(r), true, r);
  for (const r of ["/correos", "/correos/contactos", "/bajas"]) assert.equal(rutaSinSesion(r), false, r);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { rutaSinSesion } from "./rutasPublicas.ts";

test("rutas sin sesión: login, invitación, reportes automáticos y la sincronización de Dodo IS (cron con clave)", () => {
  for (const r of ["/login", "/login/olvide", "/auth/confirm", "/invitacion", "/api/reporte-diario", "/api/reporte-semanal", "/api/reporte-mensual", "/api/dodois/sincronizar", "/api/rappi/importar", "/api/cumplimiento/avisos", "/api/cumplimiento/avisos/entregados"]) {
    assert.equal(rutaSinSesion(r), true, r);
  }
  for (const r of ["/", "/ventas", "/ventas/dodois", "/api/dodois/conectar", "/api/dodois/callback", "/api/dodois/sincronizar-otra", "/invitacion/x", "/api/asistente", "/api/rappi/importar/x", "/api/rappi", "/api/cumplimiento", "/cumplimiento"]) {
    assert.equal(rutaSinSesion(r), false, r);
  }
});

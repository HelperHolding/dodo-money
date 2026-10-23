import { test } from "node:test";
import assert from "node:assert/strict";
import { urlExplorar } from "./explorar.ts";

const UNIDADES = ["u1", "u2"];
const q = (s: string) => new URLSearchParams(s);

test("revisiones históricas: ruta sin país, semana inclusiva y unidades ligadas", () => {
  assert.deepEqual(urlExplorar(q("ruta=/inventory/revisions&desde=2026-10-12&hasta=2026-10-18&skip=0&take=1000&units=ajena&stockItems=ajeno"), ["calma"]),
    { url: "https://api.dodois.com/dodopizza/inventory/revisions?units=calma&from=2026-10-12T00%3A00%3A00&to=2026-10-19T00%3A00%3A00&skip=0&take=1000" });
});

test("revisiones: exige periodo válido y no amplía la lista a otras rutas de inventario", () => {
  for (const ruta of ["/inventory/stocks", "/inventory/revisions/extra", "/inventory/revisions/../users", "/inventory/revisions?units=ajena"]) {
    assert.ok("error" in urlExplorar(q(`ruta=${encodeURIComponent(ruta)}&desde=2026-10-12`), UNIDADES));
  }
  for (const fechas of ["", "hasta=2026-10-18", "desde=2026-02-30", "desde=2026-13-01", "desde=2026-10-18&hasta=2026-10-12", "desde=2026-10-01&hasta=2026-11-01"]) {
    assert.ok("error" in urlExplorar(q(`ruta=/inventory/revisions&${fechas}`), UNIDADES), fechas);
  }
  assert.ok("error" in urlExplorar(q("ruta=/inventory/revisions&desde=2026-10-12&hasta=2026-10-18"), []));
});

test("arma la consulta: rutas de contabilidad y producción bajo /dodopizza/mx, con unidades y fechas", () => {
  assert.deepEqual(urlExplorar(q("ruta=/accounting/incoming-stock-items&desde=2026-10-01&hasta=2026-10-20"), UNIDADES),
    { url: "https://api.dodois.com/dodopizza/mx/accounting/incoming-stock-items?units=u1%2Cu2&from=2026-10-01T00%3A00%3A00&to=2026-10-21T00%3A00%3A00" });
  assert.deepEqual(urlExplorar(q("ruta=/production/productivity&desde=2026-10-20&hasta=2026-10-20&skip=0&take=10"), ["u1"]),
    { url: "https://api.dodois.com/dodopizza/mx/production/productivity?units=u1&from=2026-10-20T00%3A00%3A00&to=2026-10-21T00%3A00%3A00&skip=0&take=10" });
  assert.deepEqual(urlExplorar(q("ruta=/auth/roles/units"), UNIDADES), { url: "https://api.dodois.com/auth/roles/units" });
});

test("rechaza rutas fuera de la lista, rutas raras y fechas inválidas", () => {
  for (const ruta of ["/admin/users", "/accounting/../auth/x", "https://otro.com/x", "", "/accounting/sales?x=1"]) {
    assert.ok("error" in urlExplorar(q(`ruta=${encodeURIComponent(ruta)}`), UNIDADES), ruta);
  }
  assert.deepEqual(urlExplorar(q("ruta=/accounting/sales&desde=20-10-2026"), UNIDADES), { error: "Fechas en formato AAAA-MM-DD." });
  assert.deepEqual(urlExplorar(q("ruta=/accounting/sales&desde=2026-10-01&hasta=2026-12-31"), UNIDADES), { error: "Máximo 31 días por consulta." });
  assert.deepEqual(urlExplorar(q("ruta=/accounting/sales"), []), { error: "No hay sucursales ligadas a Dodo IS." });
});

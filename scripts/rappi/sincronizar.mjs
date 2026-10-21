// Lee del Portal Aliados de Rappi las órdenes de un día y las manda a /api/rappi/importar.
//   node --env-file=scripts/rappi/.env scripts/rappi/sincronizar.mjs --login     abre el navegador para iniciar sesión
//   node --env-file=scripts/rappi/.env scripts/rappi/sincronizar.mjs             órdenes de ayer (hora de México)
//   ... --fecha 2026-10-18 | --ids 2481664517,2481664483 | --revisar | --headed | --json salida.json
// Con RAPPI_AVISO_URL (p. ej. un webhook de n8n) manda al terminar {fecha, estado, mensaje, ...}; estado: ok | sin_ordenes | sesion_expirada | error.
// La sesión se guarda en un perfil propio del navegador; nunca se escriben credenciales aquí.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { chromium } from "playwright-core";
import { parsearDetalle, leerListado } from "./parsear.mjs";

const PORTAL = "https://restaurantes.rappi.com";
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : (process.argv[i + 1] ?? ""); };
const bandera = (n) => process.argv.includes(`--${n}`);
const { RAPPI_TIENDA, RAPPI_APP_URL, RAPPI_API_KEY, RAPPI_SUCURSAL, RAPPI_AVISO_URL, RAPPI_NAVEGADOR = "msedge" } = process.env;
const perfil = process.env.RAPPI_PERFIL ?? join(process.env.LOCALAPPDATA ?? homedir(), "dodo-rappi-perfil");

function ayerMX() {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function salir(msg) { console.error(msg); process.exit(1); }
// Con el navegador abierto se termina por excepción para que `finally` cierre el perfil y guarde la sesión.
class Fin extends Error { constructor(msg, codigo) { super(msg); this.codigo = codigo; } }
const fin = (msg, codigo = 1) => { throw new Fin(msg, codigo); };
const EXPIRO = "La sesión de Rappi expiró. Corre con --login e inicia sesión.";

if (!RAPPI_TIENDA || !/^MX\d+$/.test(RAPPI_TIENDA)) salir("Configura RAPPI_TIENDA (p. ej. MX1930486109) en scripts/rappi/.env");
const fecha = arg("fecha") ?? ayerMX();
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) salir("--fecha debe ser AAAA-MM-DD");
const login = bandera("login");
if (!login && !bandera("json") && (!RAPPI_APP_URL || !RAPPI_API_KEY)) salir("Configura RAPPI_APP_URL y RAPPI_API_KEY en scripts/rappi/.env (o usa --json para solo guardar el archivo).");
const historial = `${PORTAL}/orders/history?storeIds=${RAPPI_TIENDA}&tab=orders`;
const resultado = { fecha, tienda: RAPPI_TIENDA, estado: "ok", mensaje: "", ordenes: 0, renglones: 0, omitidas: [], avisos: [], app: null };

const contexto = await chromium.launchPersistentContext(perfil, {
  channel: RAPPI_NAVEGADOR, headless: !(login || bandera("headed")), viewport: { width: 1366, height: 900 }, locale: "es-MX",
});
const pagina = contexto.pages()[0] ?? await contexto.newPage();
const enLogin = () => new URL(pagina.url()).pathname.startsWith("/login");
// El portal redirige a /login desde el cliente después de cargar: espera el contenido o esa redirección.
async function abrir(url, texto) {
  await pagina.goto(url, { waitUntil: "domcontentloaded" });
  const contenido = pagina.getByText(texto).first();
  await Promise.race([contenido.waitFor({ timeout: 60_000 }), pagina.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 60_000 })]).catch(() => {});
  if (enLogin()) fin(EXPIRO, 2);
  await contenido.waitFor({ timeout: 30_000 });
}

async function idsDelDia() {
  await abrir(historial, /Mostrando/);
  const vistos = new Map();
  for (let hoja = 1; hoja <= 50; hoja++) {
    await pagina.getByText(/Mostrando/).first().waitFor({ timeout: 30_000 });
    const filas = leerListado(await pagina.locator("#global-page-container").innerText());
    for (const f of filas) vistos.set(f.id, f.fecha);
    if (!filas.length || filas.every((f) => f.fecha < fecha)) break;
    // Botón "siguiente": el último botón del paginador que acompaña a "Mostrando ...".
    const siguiente = pagina.locator(":has(> :text('Mostrando'))").first().locator("button").last();
    if (!(await siguiente.count()) || await siguiente.isDisabled()) break;
    await siguiente.click();
    await pagina.waitForFunction((id) => !document.querySelector("#global-page-container")?.innerText.includes(`#${id}`), filas[0].id, { timeout: 30_000 }).catch(() => {});
  }
  return [...vistos].filter(([, f]) => f === fecha).map(([id]) => id);
}

try {
  if (login) {
    await pagina.goto(`${PORTAL}/login`);
    console.log("Inicia sesión en la ventana del navegador. Se cierra sola al confirmar el historial (máx. 10 min).");
    await pagina.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10 * 60_000 });
    await abrir(historial, /Mostrando/);
    fin("Sesión guardada: el historial cargó.", 0);
  }

  // 1. IDs del día: de --ids, o recorriendo el historial (más reciente primero) hasta pasar la fecha.
  const ids = arg("ids")?.split(",").map((s) => s.trim()).filter(Boolean) ?? await idsDelDia();
  console.log(`${fecha}: ${ids.length} órdenes en el historial.`);
  if (!ids.length) fin("Nada que importar.", 0);

  // 2. Detalle de cada orden.
  const ordenes = [], productos = [], omitidas = [];
  for (const id of ids) {
    try {
      await abrir(`${PORTAL}/orders/history/${RAPPI_TIENDA.slice(2)}/${id}?storeIds=${RAPPI_TIENDA}`, "Total sugerido a facturar");
      const r = parsearDetalle(await pagina.locator("body").innerText(), RAPPI_TIENDA);
      if (r.orden.fecha !== fecha) throw Error(`Orden ${id}: es del ${r.orden.fecha}.`);
      ordenes.push(r.orden); productos.push(...r.productos); r.avisos.forEach((a) => console.warn("Aviso:", a)); resultado.avisos.push(...r.avisos);
    } catch (e) { if (e instanceof Fin) throw e; omitidas.push(id); console.error("Omitida:", e instanceof Error ? e.message : e); }
  }
  Object.assign(resultado, { ordenes: ordenes.length, renglones: productos.length, omitidas });
  resultado.mensaje = `Leídas ${ordenes.length} órdenes, ${productos.length} renglones; omitidas ${omitidas.length}.`;
  console.log(resultado.mensaje);
  if (!ordenes.length) fin("Nada que enviar.");

  // 3. Envío a la app.
  const cuerpo = { ...(RAPPI_SUCURSAL ? { sucursal: RAPPI_SUCURSAL } : {}), ordenes, productos };
  if (arg("json")) { writeFileSync(arg("json"), JSON.stringify(cuerpo, null, 2)); console.log(`Guardado ${arg("json")}.`); }
  if (RAPPI_APP_URL && RAPPI_API_KEY) {
    const url = `${RAPPI_APP_URL.replace(/\/$/, "")}/api/rappi/importar${bandera("revisar") ? "?revisar=1" : ""}`;
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-api-key": RAPPI_API_KEY }, body: JSON.stringify(cuerpo) });
    resultado.app = { status: res.status, ...(await res.json().catch(() => ({}))) };
    console.log(res.status, JSON.stringify(resultado.app));
    if (!res.ok) { process.exitCode = 1; resultado.estado = "error"; resultado.mensaje = `La app respondió ${res.status}: ${resultado.app.error ?? ""}`; }
  }
  if (omitidas.length) { process.exitCode = 1; if (resultado.estado === "ok") resultado.estado = "error"; }
} catch (e) {
  const codigo = e instanceof Fin ? e.codigo : 1;
  if (!(e instanceof Fin)) console.error(e);
  else (codigo ? console.error : console.log)(e.message);
  process.exitCode = codigo;
  resultado.mensaje = e instanceof Error ? e.message : String(e);
  resultado.estado = codigo === 2 ? "sesion_expirada" : codigo ? "error" : resultado.ordenes ? "ok" : "sin_ordenes";
} finally {
  await contexto.close();
}
if (RAPPI_AVISO_URL && !login) {
  await fetch(RAPPI_AVISO_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resultado), signal: AbortSignal.timeout(15_000) })
    .then((r) => console.log(`Aviso enviado (${r.status}).`), (e) => console.error("No se pudo enviar el aviso:", e.message));
}

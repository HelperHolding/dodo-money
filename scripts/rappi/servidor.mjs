// Servicio del extractor Rappi para el servidor de n8n (contenedor Docker).
// n8n lo llama con POST /sincronizar {fecha?, revisar?, cache?, repasar?} y recibe el mismo resultado que armaba el nodo "Leer Rappi":
// {fecha, tienda, estado, mensaje, ordenes, renglones, omitidas, revisar, cuerpo}. El envío a la app lo hace n8n.
//
// La sesión vive en ESTADO (storageState de Playwright: cookies + localStorage). Se sube una vez desde la PC
// (npm run rappi:login -- --exportar sesion.json) y el servicio la reescribe tras cada corrida, igual que un navegador.
//
// fecha: AAAA-MM-DD, "hoy" o vacío (= ayer, hora de México). Con cache: true (vueltas en vivo cada 15 min) las órdenes ya
// terminadas en una vuelta anterior del mismo día no se vuelven a abrir; el cierre del día siguiente va sin caché.
// repasar: N (cierre de las 6:30) revisa además los N días anteriores a fecha y reenvía solo las órdenes cuyo estado cambió
// (p. ej. Finalizado → Cancelado); las que no estaban registradas quedan como referencia sin reimportarse.
// La respuesta incluye cambios: [{rappi_id, fecha, de, a}].
//
// Variables: EXTRACTOR_KEY (header x-api-key), RAPPI_TIENDA, ESTADO (default /datos/sesion.json), PUERTO (3100).
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { ordenDesdeApi, fechaListado, planearVuelta, planearRepaso } from "./api.mjs";

const PORTAL = "https://restaurantes.rappi.com";
const { EXTRACTOR_KEY, RAPPI_TIENDA = "MX1930486109", ESTADO = "/datos/sesion.json", PUERTO = "3100", CHROMIUM } = process.env;
if (!EXTRACTOR_KEY) { console.error("Falta EXTRACTOR_KEY"); process.exit(1); }
const NUM = RAPPI_TIENDA.slice(2);

const hoyMX = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const restarDias = (fecha, n) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const ayerMX = () => restarDias(hoyMX(), 1);
const DIAS_CACHE = 10; // cubre el repaso de 7 días con margen

// Caché por día de órdenes terminadas (sin datos personales: es el mismo cuerpo que se manda a la app).
const DATOS = dirname(ESTADO);
const archivoCache = (fecha) => join(DATOS, `cache-${fecha}.json`);
const leerCache = (fecha) => { try { return JSON.parse(readFileSync(archivoCache(fecha), "utf8")); } catch { return {}; } };
function guardarCache(fecha, cache) {
  const tmp = archivoCache(fecha) + ".tmp";
  writeFileSync(tmp, JSON.stringify(cache)); renameSync(tmp, archivoCache(fecha));
  for (const f of readdirSync(DATOS)) { const m = /^cache-(\d{4}-\d{2}-\d{2})\.json$/.exec(f); if (m && m[1] < restarDias(hoyMX(), DIAS_CACHE)) unlinkSync(join(DATOS, f)); }
}

// Una corrida a la vez: dos navegadores sobre la misma sesión se pisarían el storageState.
let enCurso = null;

async function sincronizar({ fecha, revisar, usarCache, repasar = 0 }) {
  const base = { fecha, tienda: RAPPI_TIENDA, revisar, ordenes: 0, renglones: 0, omitidas: [], cuerpo: null };
  if (!existsSync(ESTADO)) return { ...base, estado: "sesion_expirada", mensaje: `No hay sesión guardada en ${ESTADO}: sube una con rappi:login --exportar.` };
  const navegador = await chromium.launch({ headless: true, ...(CHROMIUM ? { executablePath: CHROMIUM } : {}) });
  try {
    const contexto = await navegador.newContext({ storageState: ESTADO, viewport: { width: 1366, height: 900 }, locale: "es-MX", timezoneId: "America/Mexico_City" });
    const pagina = await contexto.newPage();
    // Se escuchan las respuestas que el propio portal pide: listado del historial y detalle de cada orden.
    const listado = new Map();
    pagina.on("response", async (r) => {
      if (!r.url().includes("/orders/partner/status/v2/stores/orders/history") || !r.ok()) return;
      try { for (const it of (await r.json())?.items ?? []) listado.set(String(it.id), it); } catch {}
    });
    const enLogin = () => new URL(pagina.url()).pathname.startsWith("/login");
    // El portal pasa por /login mientras valida la sesión; solo se da por vencida si se queda ahí.
    const abrir = async (url, texto) => {
      await pagina.goto(url, { waitUntil: "domcontentloaded" });
      const contenido = pagina.getByText(texto).first();
      await Promise.race([contenido.waitFor({ timeout: 60_000 }), pagina.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 60_000 })]).catch(() => {});
      if (enLogin()) await pagina.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }).catch(() => {});
      if (enLogin()) return false;
      await contenido.waitFor({ timeout: 30_000 });
      return true;
    };
    const vencida = { ...base, estado: "sesion_expirada", mensaje: "Rappi cerró la sesión: corre rappi:login --exportar en la PC y sube el archivo al servidor." };

    if (!(await abrir(`${PORTAL}/orders/history?storeIds=${RAPPI_TIENDA}&tab=orders`, /Mostrando/))) return vencida;
    // Avanza páginas del historial (más reciente primero) hasta pasar la fecha más antigua a revisar.
    const diasRepaso = Array.from({ length: repasar }, (_, i) => restarDias(fecha, i + 1));
    const masAntigua = diasRepaso.at(-1) ?? fecha;
    for (let hoja = 1; hoja <= 60; hoja++) {
      const fechas = [...listado.values()].map(fechaListado);
      if (fechas.length && fechas.some((f) => f < masAntigua)) break;
      const siguiente = pagina.locator(":has(> :text('Mostrando'))").first().locator("button").last();
      if (!(await siguiente.count()) || await siguiente.isDisabled()) break;
      const antes = listado.size;
      await siguiente.click();
      await pagina.waitForResponse((r) => r.url().includes("/stores/orders/history"), { timeout: 30_000 }).catch(() => {});
      await pagina.waitForTimeout(500);
      if (listado.size === antes) break;
    }
    const items = [...listado.values()];
    const ordenes = [], productos = [], omitidas = [], cambios = [];
    // Abre el detalle de una orden, la agrega al envío, anota si cambió de estado y actualiza la caché del día.
    const abrirOrden = async (id, dia, cache) => {
      try {
        const json = pagina.waitForResponse((r) => r.url().includes(`/orders/partner/status/v2/store/${NUM}/orders/${id}`) && r.ok(), { timeout: 60_000 }).then((r) => r.json());
        if (!(await abrir(`${PORTAL}/orders/history/${NUM}/${id}?storeIds=${RAPPI_TIENDA}`, "Total sugerido a facturar"))) return false;
        const r = ordenDesdeApi(await json, RAPPI_TIENDA);
        if (!r) return true; // sigue en curso
        if (r.orden.fecha !== dia) throw Error(`Orden ${id}: es del ${r.orden.fecha}.`);
        const previo = cache[id]?.orden?.estado;
        if (previo && previo !== r.orden.estado) cambios.push({ rappi_id: id, fecha: dia, de: previo, a: r.orden.estado });
        ordenes.push(r.orden); productos.push(...r.productos);
        cache[id] = r;
      } catch (e) { omitidas.push(String(e?.message ?? e).slice(0, 200)); }
      return true;
    };

    // Día principal. En curso: se saltan. Terminadas en caché (vueltas en vivo): se reutilizan. El resto se abre.
    // Sin caché (cierre) se abre todo, pero la caché se lee igual para detectar cambios de estado.
    const cache = leerCache(fecha);
    const plan = planearVuelta(items, fecha, usarCache ? cache : {});
    for (const r of plan.reusar) { ordenes.push(r.orden); productos.push(...r.productos); }
    for (const id of plan.abrir) if (!(await abrirOrden(id, fecha, cache))) return vencida;

    // Repaso de días anteriores: solo órdenes cuyo estado cambió.
    const caches = new Map([[fecha, cache]]);
    for (const dia of diasRepaso) {
      const c = leerCache(dia); caches.set(dia, c);
      const p = planearRepaso(items, dia, c);
      Object.assign(c, p.base);
      for (const id of p.abrir) if (!(await abrirOrden(id, dia, c))) return vencida;
    }

    // Guarda la sesión renovada (escritura atómica para no dejar un archivo a medias) y las cachés.
    writeFileSync(`${ESTADO}.tmp`, JSON.stringify(await contexto.storageState())); renameSync(`${ESTADO}.tmp`, ESTADO);
    if (!revisar) for (const [dia, c] of caches) guardarCache(dia, c);
    const estado = omitidas.length ? "error" : ordenes.length ? "ok" : "sin_ordenes";
    const textoCambios = cambios.length ? ` Cambios de estado: ${cambios.map((c) => `#${c.rappi_id} (${c.fecha}) ${c.de} → ${c.a}`).join(", ")}.` : "";
    return { ...base, estado, enCurso: plan.enCurso, cambios, mensaje: `Leídas ${ordenes.length} órdenes (${plan.abrir.length} abiertas, ${plan.reusar.length} de caché), ${productos.length} renglones; en curso ${plan.enCurso}; omitidas ${omitidas.length}.${diasRepaso.length ? ` Repaso de ${diasRepaso.length} días.` : ""}${textoCambios}`, ordenes: ordenes.length, renglones: productos.length, omitidas, cuerpo: ordenes.length ? { ordenes, productos } : null };
  } finally {
    await navegador.close();
  }
}

const responder = (res, status, cuerpo) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(cuerpo)); };
createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/salud") return responder(res, 200, { ok: true, sesion: existsSync(ESTADO) });
  if (req.method !== "POST" || req.url !== "/sincronizar") return responder(res, 404, { error: "No encontrado" });
  if ((req.headers["x-api-key"] ?? "").trim() !== EXTRACTOR_KEY.trim()) return responder(res, 401, { error: "No autorizado" });
  let texto = ""; for await (const c of req) { texto += c; if (texto.length > 10_000) return responder(res, 413, { error: "Cuerpo muy grande" }); }
  let datos = {}; try { datos = texto ? JSON.parse(texto) : {}; } catch { return responder(res, 400, { error: "JSON inválido" }); }
  const fecha = datos.fecha === "hoy" ? hoyMX() : /^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha ?? "")) ? datos.fecha : ayerMX();
  // Si una vuelta anterior sigue corriendo, esta se salta sin error: la siguiente la cubre.
  if (enCurso) return responder(res, 200, { fecha, tienda: RAPPI_TIENDA, estado: "ocupado", mensaje: "Ya había una corrida en curso; esta vuelta se saltó.", ordenes: 0, renglones: 0, omitidas: [], cuerpo: null });
  const repasar = Number.isInteger(datos.repasar) ? Math.min(Math.max(datos.repasar, 0), 7) : 0;
  enCurso = sincronizar({ fecha, revisar: datos.revisar === true, usarCache: datos.cache === true, repasar });
  try { responder(res, 200, await enCurso); }
  catch (e) { responder(res, 200, { fecha, tienda: RAPPI_TIENDA, estado: "error", mensaje: `Falla del extractor: ${String(e?.message ?? e).slice(0, 300)}`, ordenes: 0, renglones: 0, omitidas: [], cuerpo: null }); }
  finally { enCurso = null; }
}).listen(Number(PUERTO), () => console.log(`Extractor Rappi escuchando en :${PUERTO}`));

// Genera el flujo "Rappi_Ventas_Diarias" de n8n y lo sube (crea o actualiza).
//   node --env-file=scripts/n8n/.env scripts/n8n/flujo-rappi.mjs            # sube a N8N_URL
//   node scripts/n8n/flujo-rappi.mjs --archivo flujo.json                   # solo escribe el JSON
// En vivo: cada 15 min de 10:00 a 23:45 importa las órdenes de hoy (con caché en el extractor: solo abre las nuevas).
// Cierre: a las 6:30 vuelve a leer todo ayer sin caché, antes del Reporte_Diario de las 7:00 (que así ya incluye Rappi
// y no compite por memoria con gotenberg) y repasa los 7 días anteriores para reflejar cancelaciones tardías. Los avisos por correo se limitan: uno al aparecer el problema y otro cada 6 h si sigue.
// El flujo pide las órdenes al contenedor rappi-extractor (scripts/rappi/servidor.mjs), que mantiene la sesión
// del portal en un navegador, y las manda a la app. Se crea inactivo: en n8n hay que elegir las credenciales
// Header Auth (x-api-key) de "Leer Rappi" (RAPPI_EXTRACTOR_KEY), "Enviar a Dodo" y "Probar" (RAPPI_API_KEY) y activarlo.
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const NOMBRE = "Rappi_Ventas_Diarias";
const APP = "https://dodo-money-j31t.vercel.app";
const EXTRACTOR = "http://rappi-extractor:3100/sincronizar";
const SMTP = { id: "77HAkO1eZAVBGkN4", name: "SMTP Notifications" }; // la misma de los reportes
const AVISAR_A = "cvalencia@mx.thecoffee.jp";

const resumen = `const leido = $('Leer Rappi').first().json;
const envio = $('Enviar a Dodo').isExecuted ? $('Enviar a Dodo').first().json : null;
let estado = leido.estado ?? 'error', mensaje = leido.mensaje ?? ('El extractor respondió: ' + JSON.stringify(leido).slice(0, 300));
if (envio) {
  const ok = envio.statusCode >= 200 && envio.statusCode < 300;
  if (!ok) { estado = 'error'; mensaje += ' La app respondió ' + envio.statusCode + ': ' + (envio.body?.error ?? JSON.stringify(envio.body)).slice(0, 300); }
  else mensaje += leido.revisar ? ' Validadas por la app sin guardar.' : ' Guardadas en la app (' + (envio.body?.actualizadas ?? 0) + ' actualizadas).';
}
// Un correo cuando aparece el problema (o cambia) y otro cada 6 h si sigue; nada en vueltas sanas u "ocupado".
const st = $getWorkflowStaticData('global');
let avisar = false;
if (estado === 'error' || estado === 'sesion_expirada') {
  const previo = st.ultimoAviso;
  if (!previo || previo.estado !== estado || Date.now() - previo.t > 6 * 3600 * 1000) { avisar = true; st.ultimoAviso = { estado, t: Date.now() }; }
} else if (estado === 'ok' || estado === 'sin_ordenes') st.ultimoAviso = null;
return [{ json: { avisar, fecha: leido.fecha, tienda: leido.tienda, estado, mensaje, cambios: leido.cambios ?? [], ordenes: leido.ordenes ?? 0, renglones: leido.renglones ?? 0, omitidas: leido.omitidas ?? [], app: envio ? { status: envio.statusCode, ...envio.body } : null } }];`;

const id = () => randomUUID();
const nodo = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: id(), name, type, typeVersion, position, parameters, ...extra });
const headerAuth = { authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth" };
const nodes = [
  nodo("Cada 15 min (hoy)", "n8n-nodes-base.scheduleTrigger", 1.2, [0, -100], { rule: { interval: [{ field: "cronExpression", expression: "*/15 10-23 * * *" }] } }),
  nodo("Hoy en vivo", "n8n-nodes-base.set", 3.4, [200, -100], { assignments: { assignments: [
    { id: id(), name: "fecha", value: "hoy", type: "string" }, { id: id(), name: "cache", value: true, type: "boolean" },
  ] }, options: {} }),
  nodo("Cierre 6:30am (ayer)", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 50], { rule: { interval: [{ triggerAtHour: 6, triggerAtMinute: 30 }] } }),
  nodo("Ayer completo", "n8n-nodes-base.set", 3.4, [200, 50], { assignments: { assignments: [
    { id: id(), name: "fecha", value: "", type: "string" }, { id: id(), name: "cache", value: false, type: "boolean" },
    // Repasa los 7 días anteriores: reenvía solo órdenes que cambiaron de estado (p. ej. canceladas después de importarse).
    { id: id(), name: "repasar", value: 7, type: "number" },
  ] }, options: {} }),
  nodo("Probar (webhook)", "n8n-nodes-base.webhook", 2, [0, 200], { httpMethod: "POST", path: "rappi-ventas", authentication: "headerAuth", responseMode: "lastNode", options: {} }, { webhookId: id() }),
  // En vivo manda fecha "hoy" con caché; el cierre manda fecha vacía (= ayer) sin caché; el webhook manda su {fecha?, revisar?}.
  nodo("Leer Rappi", "n8n-nodes-base.httpRequest", 4.2, [240, 100], {
    method: "POST", url: EXTRACTOR, ...headerAuth,
    sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify({ fecha: $json.body?.fecha ?? $json.fecha, revisar: $json.body?.revisar === true, cache: $json.cache === true, repasar: $json.repasar ?? $json.body?.repasar ?? 0 }) }}",
    options: { timeout: 600000 },
  }, { notes: "Credencial: Header Auth x-api-key = RAPPI_EXTRACTOR_KEY del servidor." }),
  nodo("¿Hay órdenes?", "n8n-nodes-base.if", 2.2, [460, 100], {
    conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, combinator: "and",
      conditions: [{ id: id(), leftValue: "={{ $json.ordenes }}", rightValue: 0, operator: { type: "number", operation: "gt" } }] },
    looseTypeValidation: true, options: {},
  }),
  nodo("Enviar a Dodo", "n8n-nodes-base.httpRequest", 4.2, [680, 0], {
    method: "POST", url: `=${APP}/api/rappi/importar{{ $json.revisar ? '?revisar=1' : '' }}`, ...headerAuth,
    sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify($json.cuerpo) }}",
    options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 60000 },
  }, { notes: "Credencial: Header Auth x-api-key = RAPPI_API_KEY de Vercel." }),
  nodo("Resumen", "n8n-nodes-base.code", 2, [900, 100], { jsCode: resumen }),
  nodo("¿Avisar?", "n8n-nodes-base.if", 2.2, [1120, 100], {
    conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 }, combinator: "and",
      conditions: [{ id: id(), leftValue: "={{ $json.avisar }}", rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } }] },
    options: {},
  }),
  nodo("Avisar por correo", "n8n-nodes-base.emailSend", 2.1, [1340, 0], {
    fromEmail: "Dodo MX <scervera@dodopizz.mx>", toEmail: AVISAR_A,
    subject: "=Rappi {{ $json.fecha }}: {{ $json.estado === 'sesion_expirada' ? 'renovar sesión' : 'revisar importación' }}",
    emailFormat: "text",
    text: "={{ $json.mensaje }}\n\nOmitidas: {{ ($json.omitidas || []).join('\\n') || 'ninguna' }}\n\nSi la sesión expiró: npm run rappi:login -- --exportar rappi-sesion.json y copiarla al volumen del extractor.\nPara reponer el día: POST al webhook \"Probar\" con {\"fecha\":\"{{ $json.fecha }}\"}.",
    options: {},
  }, { credentials: { smtp: SMTP } }),
  // Sin error: deja el resumen como respuesta del webhook "Probar".
  nodo("Listo", "n8n-nodes-base.noOp", 1, [1340, 200], {}),
];
const conecta = (de, ...a) => ({ [de]: { main: a.map((rama) => (Array.isArray(rama) ? rama : [rama]).map((node) => ({ node, type: "main", index: 0 }))) } });
const connections = {
  ...conecta("Cada 15 min (hoy)", "Hoy en vivo"),
  ...conecta("Hoy en vivo", "Leer Rappi"),
  ...conecta("Cierre 6:30am (ayer)", "Ayer completo"),
  ...conecta("Ayer completo", "Leer Rappi"),
  ...conecta("Probar (webhook)", "Leer Rappi"),
  ...conecta("Leer Rappi", "¿Hay órdenes?"),
  ...conecta("¿Hay órdenes?", "Enviar a Dodo", "Resumen"),
  ...conecta("Enviar a Dodo", "Resumen"),
  ...conecta("Resumen", "¿Avisar?"),
  ...conecta("¿Avisar?", "Avisar por correo", "Listo"),
};
const flujo = { name: NOMBRE, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Mexico_City" } };

const archivo = process.argv.includes("--archivo") ? process.argv[process.argv.indexOf("--archivo") + 1] : null;
if (archivo) { writeFileSync(archivo, JSON.stringify(flujo, null, 2)); console.log(`Escrito ${archivo}`); process.exit(0); }

const url = (process.env.N8N_URL ?? "").replace(/\/+$/, ""), key = process.env.N8N_API_KEY;
if (!url || !key) { console.error("Configura N8N_URL y N8N_API_KEY en scripts/n8n/.env"); process.exit(1); }
const n8n = async (metodo, ruta, cuerpo) => {
  const r = await fetch(url + "/api/v1" + ruta, { method: metodo, headers: { "X-N8N-API-KEY": key, "content-type": "application/json" }, body: cuerpo && JSON.stringify(cuerpo) });
  const t = await r.text(); if (!r.ok) throw Error(`${metodo} ${ruta}: ${r.status} ${t.slice(0, 400)}`); return t ? JSON.parse(t) : null;
};
const existente = (await n8n("GET", "/workflows?limit=250")).data.find((w) => w.name === NOMBRE);
if (existente) {
  // Conserva las credenciales elegidas en la UI (por nombre de nodo y tipo) y la URL del webhook.
  const actual = await n8n("GET", `/workflows/${existente.id}`);
  for (const n of flujo.nodes) {
    const previo = actual.nodes.find((x) => x.name === n.name && x.type === n.type);
    if (previo?.credentials && !n.credentials) n.credentials = previo.credentials;
    if (previo?.webhookId) n.webhookId = previo.webhookId;
  }
  await n8n("PUT", `/workflows/${existente.id}`, flujo);
  console.log(`Actualizado ${NOMBRE} (${existente.id}).`);
} else {
  const w = await n8n("POST", "/workflows", flujo);
  console.log(`Creado ${NOMBRE} (${w.id}), inactivo.`);
}

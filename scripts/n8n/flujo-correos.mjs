// Genera el flujo "Correos dodo-money" de n8n y lo sube (crea inactivo o actualiza).
//   node scripts/n8n/flujo-correos.mjs --archivo docs/n8n/correos-dodo-money.json   # solo escribe el JSON
//   node --env-file=scripts/n8n/.env scripts/n8n/flujo-correos.mjs                    # además lo sube a N8N_URL
// Cada minuto pide a la app hasta 8 correos ya armados, los manda uno por uno por SMTP (hola@dodopizza.mx) con 5 s
// entre cada uno y reporta el resultado. En n8n hay que elegir la credencial Header Auth (x-api-key = CORREOS_API_KEY)
// en "Pedir lote" y "Reportar", y la credencial SMTP "SMTP account" en "Enviar correo"; luego activarlo.
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const NOMBRE = "Correos dodo-money";
const APP = "https://dodo-money-j31t.vercel.app";
const SMTP = { id: "PIYhrRSVazBc0OGo", name: "SMTP account" }; // la de las campañas de apertura y Go Big
const http = (name, ruta, cuerpo, pos) => ({ id: randomUUID(), name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos,
  parameters: { method: "POST", url: APP + ruta, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendBody: true, specifyBody: "json", jsonBody: cuerpo, options: { timeout: 30000 } } });
const clasificar = `const src = $('Uno por uno').item;
if (!src?.json?.envio_id) throw new Error('Falta envio_id del lote');
const ok = !$json.error && Array.isArray($json.accepted) && $json.accepted.map(String).map(x=>x.toLowerCase()).includes(String(src.json.para).toLowerCase());
const detalle = ok ? null : String($json.error?.message ?? $json.error ?? $json.response ?? 'Resultado incierto').slice(0, 1500);
return { json: { envio_id: src.json.envio_id, aceptado: ok, message_id: $json.messageId ?? null, detalle } };`;
const flujo = {
  name: NOMBRE,
  nodes: [
    { id: randomUUID(), name: "Cada minuto", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 1 }] } } },
    http("Pedir lote", "/api/correos/siguiente", '={"lote":8}', [220, 0]),
    { id: randomUUID(), name: "Uno por uno", type: "n8n-nodes-base.splitInBatches", typeVersion: 3, position: [440, 0], parameters: { batchSize: 1, options: {} } },
    { id: randomUUID(), name: "Enviar correo", type: "n8n-nodes-base.emailSend", typeVersion: 2.1, position: [660, 0], onError: "continueErrorOutput", credentials: { smtp: SMTP },
      parameters: { fromEmail: "Dodo Pizza México <hola@dodopizza.mx>", toEmail: "={{ $json.para }}", subject: "={{ $json.asunto }}", emailFormat: "both", text: "={{ $json.texto }}", html: "={{ $json.html }}",
        options: { appendAttribution: false, replyTo: "hola@dodopizza.mx" } } },
    { id: randomUUID(), name: "Clasificar", type: "n8n-nodes-base.code", typeVersion: 2, position: [880, 0], parameters: { mode: "runOnceForEachItem", jsCode: clasificar } },
    { ...http("Reportar", "/api/correos/resultado", "={{ JSON.stringify($json) }}", [1100, 0]), retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: "continueRegularOutput" },
    { id: randomUUID(), name: "Pausa", type: "n8n-nodes-base.wait", typeVersion: 1.1, position: [1320, 0], parameters: { resume: "timeInterval", amount: 5, unit: "seconds" } },
  ],
  connections: {
    "Cada minuto": { main: [[{ node: "Pedir lote", type: "main", index: 0 }]] },
    "Pedir lote": { main: [[{ node: "Uno por uno", type: "main", index: 0 }]] },
    "Uno por uno": { main: [[], [{ node: "Enviar correo", type: "main", index: 0 }]] },
    "Enviar correo": { main: [[{ node: "Clasificar", type: "main", index: 0 }], [{ node: "Clasificar", type: "main", index: 0 }]] },
    "Clasificar": { main: [[{ node: "Reportar", type: "main", index: 0 }]] },
    "Reportar": { main: [[{ node: "Pausa", type: "main", index: 0 }]] },
    "Pausa": { main: [[{ node: "Uno por uno", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1", timezone: "America/Mexico_City", saveDataSuccessExecution: "none", saveDataErrorExecution: "all" },
};

const i = process.argv.indexOf("--archivo");
if (i > 0) { writeFileSync(process.argv[i + 1], JSON.stringify(flujo, null, 2) + "\n"); console.log(`Escrito ${process.argv[i + 1]}`); process.exit(0); }
const url = (process.env.N8N_URL ?? "").replace(/\/+$/, ""), key = process.env.N8N_API_KEY;
if (!url || !key) { console.error("Configura N8N_URL y N8N_API_KEY en scripts/n8n/.env"); process.exit(1); }
const n8n = async (metodo, ruta, cuerpo) => {
  const r = await fetch(url + "/api/v1" + ruta, { method: metodo, headers: { "X-N8N-API-KEY": key, "content-type": "application/json" }, body: cuerpo && JSON.stringify(cuerpo) });
  const t = await r.text(); if (!r.ok) throw Error(`${metodo} ${ruta}: ${r.status} ${t.slice(0, 400)}`); return t ? JSON.parse(t) : null;
};
const existente = (await n8n("GET", "/workflows?limit=250")).data.find((w) => w.name === NOMBRE);
if (existente) {
  const actual = await n8n("GET", `/workflows/${existente.id}`);
  for (const n of flujo.nodes) { const previo = actual.nodes.find((x) => x.name === n.name && x.type === n.type); if (previo?.credentials) n.credentials = previo.credentials; }
  await n8n("PUT", `/workflows/${existente.id}`, flujo); console.log(`Actualizado ${NOMBRE} (${existente.id}).`);
} else { const w = await n8n("POST", "/workflows", flujo); console.log(`Creado ${NOMBRE} (${w.id}), inactivo.`); }

/** Cliente mínimo de la API v2 de Facturapi (https://docs.facturapi.io/api). La llave define organización y ambiente (sk_test_ = pruebas). */
import type { ConceptoFacturapi } from "./conceptos";
import type { DatosFiscales } from "./reglas";

const BASE = "https://www.facturapi.io/v2";
export type FacturaTimbrada = { id: string; uuid: string; series: string; folio_number: number; subtotal: number; total: number; status: string };
export type Respuesta<T> = { ok: true; valor: T } | { ok: false; tipo: "rechazo" | "incierto"; mensaje: string };

export function crearClienteFacturapi(llave: string, f: typeof fetch = fetch) {
  async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
    let r: Response;
    try {
      r = await f(`${BASE}${ruta}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json", "Accept-Language": "es" },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      return { ok: false, tipo: "incierto", mensaje: `Sin respuesta de Facturapi: ${(e as Error).message}` };
    }
    const datos = await r.json().catch(() => ({})) as { message?: string };
    if (r.status === 200 || r.status === 201) return { ok: true, valor: datos as T };
    const mensaje = datos.message ?? `Facturapi respondió ${r.status}.`;
    return { ok: false, tipo: r.status === 400 || r.status === 422 ? "rechazo" : "incierto", mensaje };
  }
  return {
    crear: (d: DatosFiscales, conceptos: ConceptoFacturapi[], llaves: { externo: string; idempotencia: string }) =>
      llamar<FacturaTimbrada>("POST", "/invoices", {
        customer: { legal_name: d.nombre, tax_id: d.rfc, tax_system: d.regimen_fiscal, email: d.correo, address: { zip: d.codigo_postal } },
        items: conceptos, payment_form: d.forma_pago, payment_method: "PUE", use: d.uso_cfdi,
        external_id: llaves.externo, idempotency_key: llaves.idempotencia,
      }),
    async buscarPorExterno(externo: string): Promise<Respuesta<FacturaTimbrada | null>> {
      const r = await llamar<{ data: FacturaTimbrada[] }>("GET", `/invoices?external_id=${encodeURIComponent(externo)}`);
      return r.ok ? { ok: true, valor: r.valor.data.find((x) => x.status === "valid") ?? null } : r;
    },
    async urlDescarga(id: string, formato: "pdf" | "xml"): Promise<Respuesta<string>> {
      const r = await llamar<{ url: string }>("GET", `/invoices/${encodeURIComponent(id)}/download-url/${formato}`);
      return r.ok ? { ok: true, valor: r.valor.url } : r;
    },
    async enviarCorreo(id: string, correo: string): Promise<Respuesta<null>> {
      const r = await llamar<unknown>("POST", `/invoices/${encodeURIComponent(id)}/email`, { email: correo });
      return r.ok ? { ok: true, valor: null } : r;
    },
    cancelar: (id: string, motivo: "02" | "03") =>
      llamar<{ status: string; cancellation_status: string }>("DELETE", `/invoices/${encodeURIComponent(id)}?motive=${motivo}`),
  };
}
export type ClienteFacturapi = ReturnType<typeof crearClienteFacturapi>;

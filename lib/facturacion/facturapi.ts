/** Cliente mínimo de la API v2 de Facturapi (https://docs.facturapi.io/api). La llave define organización y ambiente (sk_test_ = pruebas). */
import type { ConceptoFacturapi } from "./conceptos";
import type { DatosFiscales } from "./reglas";

const BASE = "https://www.facturapi.io/v2";
export type FacturaTimbrada = { id: string; uuid: string; series: string; folio_number: number; subtotal: number; total: number; status: string };
export type Respuesta<T> = { ok: true; valor: T } | { ok: false; tipo: "rechazo" | "incierto"; mensaje: string };

type Objeto = Record<string, unknown>;
const SIN_DATOS = "Facturapi respondió sin datos legibles.";
const sinDatos = { ok: false, tipo: "incierto", mensaje: SIN_DATOS } as const;

export function crearClienteFacturapi(llave: string, f: typeof fetch = fetch) {
  async function llamar(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<Objeto>> {
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
    let datos: unknown;
    try {
      datos = await r.json();
    } catch {
      datos = undefined;
    }
    const esObjeto = typeof datos === "object" && datos !== null && !Array.isArray(datos);
    if (r.status === 200 || r.status === 201) return esObjeto ? { ok: true, valor: datos as Objeto } : sinDatos;
    if (r.status === 401 || r.status === 403) return { ok: false, tipo: "incierto", mensaje: "La llave de Facturapi no es válida; revisa FACTURAPI_KEY." };
    const mensaje = esObjeto && typeof (datos as Objeto).message === "string" ? (datos as Objeto).message as string : `Facturapi respondió ${r.status}.`;
    return { ok: false, tipo: r.status === 400 || r.status === 422 ? "rechazo" : "incierto", mensaje };
  }
  return {
    async crear(d: DatosFiscales, conceptos: ConceptoFacturapi[], llaves: { externo: string; idempotencia: string }): Promise<Respuesta<FacturaTimbrada>> {
      const r = await llamar("POST", "/invoices", {
        customer: { legal_name: d.nombre, tax_id: d.rfc, tax_system: d.regimen_fiscal, email: d.correo, address: { zip: d.codigo_postal } },
        items: conceptos, payment_form: d.forma_pago, payment_method: "PUE", use: d.uso_cfdi,
        external_id: llaves.externo, idempotency_key: llaves.idempotencia,
      });
      if (!r.ok) return r;
      if (typeof r.valor.id !== "string" || typeof r.valor.uuid !== "string") return sinDatos;
      return { ok: true, valor: r.valor as unknown as FacturaTimbrada };
    },
    async buscarPorExterno(externo: string): Promise<Respuesta<FacturaTimbrada | null>> {
      const r = await llamar("GET", `/invoices?external_id=${encodeURIComponent(externo)}`);
      if (!r.ok) return r;
      if (!Array.isArray(r.valor.data)) return sinDatos;
      const facturas = r.valor.data as FacturaTimbrada[];
      const valida = facturas.find((x) => x.status === "valid");
      if (valida) return { ok: true, valor: valida };
      if (facturas.some((x) => x.status === "pending")) return { ok: false, tipo: "incierto", mensaje: "La factura sigue timbrándose en Facturapi." };
      return { ok: true, valor: null };
    },
    async urlDescarga(id: string, formato: "pdf" | "xml"): Promise<Respuesta<string>> {
      const r = await llamar("GET", `/invoices/${encodeURIComponent(id)}/download-url/${formato}`);
      if (!r.ok) return r;
      if (typeof r.valor.url !== "string") return sinDatos;
      return { ok: true, valor: r.valor.url };
    },
    async enviarCorreo(id: string, correo: string): Promise<Respuesta<null>> {
      const r = await llamar("POST", `/invoices/${encodeURIComponent(id)}/email`, { email: correo });
      return r.ok ? { ok: true, valor: null } : r;
    },
    async cancelar(id: string, motivo: "02" | "03"): Promise<Respuesta<{ status: string; cancellation_status: string }>> {
      const r = await llamar("DELETE", `/invoices/${encodeURIComponent(id)}?motive=${motivo}`);
      return r.ok ? { ok: true, valor: r.valor as { status: string; cancellation_status: string } } : r;
    },
  };
}
export type ClienteFacturapi = ReturnType<typeof crearClienteFacturapi>;

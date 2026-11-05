// lib/facturacion/timbrar.ts
/** Reservar → timbrar → confirmar o liberar. Las dependencias se inyectan para probar doble clic y timeouts sin red ni base. */
import type { ConceptoFacturapi } from "./conceptos";
import type { FacturaTimbrada, Respuesta } from "./facturapi";
import type { DatosFiscales } from "./reglas";

export type Base = {
  reservar(pedido: string, datos: DatosFiscales): Promise<{ id: string } | { error: string }>;
  confirmar(id: string, f: FacturaTimbrada): Promise<void>;
  liberar(id: string, error: string): Promise<void>;
  token(id: string): Promise<string>;
};
export type Pac = {
  crear(d: DatosFiscales, c: ConceptoFacturapi[], llaves: { externo: string; idempotencia: string }): Promise<Respuesta<FacturaTimbrada>>;
  buscarPorExterno(externo: string): Promise<Respuesta<FacturaTimbrada | null>>;
};
export type ResultadoTimbrado =
  | { estado: "timbrada"; id: string; token: string; uuid: string }
  | { estado: "rechazada"; mensaje: string }
  | { estado: "procesando" }
  | { estado: "ya_facturado" }
  | { estado: "no_facturable"; mensaje: string };

const ESPERA_MS = 120_000;

export async function timbrarTicket(
  dep: { base: Base; pac: Pac; ahora: () => number },
  pedido: string,
  datos: DatosFiscales,
  conceptos: ConceptoFacturapi[],
): Promise<ResultadoTimbrado> {
  return intentar(dep, pedido, datos, conceptos, false);
}

// `reintentada` evita un segundo ciclo de liberar/reservar: tras liberar una reserva vencida solo se reserva una vez más.
async function intentar(
  dep: { base: Base; pac: Pac; ahora: () => number },
  pedido: string,
  datos: DatosFiscales,
  conceptos: ConceptoFacturapi[],
  reintentada: boolean,
): Promise<ResultadoTimbrado> {
  const { base, pac } = dep;
  const listo = async (id: string, f: FacturaTimbrada): Promise<ResultadoTimbrado> => {
    await base.confirmar(id, f);
    return { estado: "timbrada", id, token: await base.token(id), uuid: f.uuid };
  };
  const r = await base.reservar(pedido, datos);
  if ("error" in r) {
    if (r.error === "YA_FACTURADO") return { estado: "ya_facturado" };
    if (r.error.startsWith("NO_FACTURABLE:")) return { estado: "no_facturable", mensaje: r.error.slice("NO_FACTURABLE:".length) };
    const m = /^EN_PROCESO:([^:]+):(\d+)$/.exec(r.error);
    if (!m) throw new Error(r.error);
    const [, id, epoch] = m;
    const previa = await pac.buscarPorExterno(id);
    if (previa.ok && previa.valor) return listo(id, previa.valor);
    // Incierto (Facturapi aún reintenta un pending) o reserva reciente: no se libera.
    if (!previa.ok || reintentada || dep.ahora() - Number(epoch) * 1000 < ESPERA_MS) return { estado: "procesando" };
    await base.liberar(id, "Sin respuesta de Facturapi; reintento");
    return intentar(dep, pedido, datos, conceptos, true);
  }
  const c = await pac.crear(datos, conceptos, { externo: r.id, idempotencia: r.id });
  if (c.ok) return listo(r.id, c.valor);
  if (c.tipo === "rechazo") {
    await base.liberar(r.id, c.mensaje);
    return { estado: "rechazada", mensaje: c.mensaje };
  }
  return { estado: "procesando" };
}

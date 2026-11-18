"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas } from "@/lib/roles";
import { baseFacturacion, facturapi } from "@/lib/facturacion/servidor";

const volver = (q: string): never => redirect(`/finanzas/facturacion?${q}`);
const err = (m: string) => `error=${encodeURIComponent(m)}`;
const ok = (m: string) => `ok=${encodeURIComponent(m)}`;

const PENDIENTE = "La cancelación quedó pendiente de que el cliente la acepte en el SAT. Vuelve a intentarlo más tarde; no se duplicará.";
const ESPERA_REVISION_MS = 10 * 60 * 1000;

/** Solo mensaje y código: el `details` de PostgREST puede traer RFC, nombre o correo. */
const registrar = (e: unknown) => {
  const x = (e ?? {}) as { message?: unknown; code?: unknown };
  console.error("facturacion:", { message: typeof x.message === "string" ? x.message : String(e), code: x.code });
};

/** Cancela en Facturapi y luego registra aquí. Es reintentable: si Facturapi ya la tiene cancelada, no la vuelve a llamar. */
export async function cancelarFactura(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) return volver(err("Solo administración puede cancelar."));
  const id = String(fd.get("id")), motivo = fd.get("motivo") === "03" ? "03" : "02";
  const { data: f } = await supabase.from("facturas_clientes").select("facturapi_id, estado").eq("id", id).single();
  if (!f || f.estado !== "timbrada" || !f.facturapi_id) return volver(err("La factura no está timbrada."));
  const fid = f.facturapi_id as string, fp = facturapi();
  const actual = await fp.obtener(fid);
  if (!actual.ok) return volver(err(`No se pudo consultar Facturapi: ${actual.mensaje}`));
  if (actual.valor.status !== "canceled") {
    const r = await fp.cancelar(fid, motivo);
    let cancelada = r.ok && r.valor.status === "canceled";
    if (!cancelada) {
      // Si la respuesta se perdió o quedó en trámite, se vuelve a leer el estado real en el SAT antes de decidir.
      const ahora = await fp.obtener(fid);
      if (ahora.ok && ahora.valor.status === "canceled") cancelada = true;
      else if (r.ok || (ahora.ok && ahora.valor.cancellation_status === "pending")) return volver(err(PENDIENTE));
      else return volver(err(`Facturapi no canceló: ${r.ok ? "sin respuesta" : r.mensaje}`));
    }
  }
  const { error } = await supabase.rpc("facturacion_registrar_cancelacion", { p_id: id, p_motivo: motivo });
  if (error) {
    registrar(error);
    return volver(err("Cancelada en el SAT, pero no se registró aquí. Vuelve a intentarlo; ya no se llama otra vez a Facturapi."));
  }
  revalidatePath("/finanzas/facturacion");
  return volver(ok("Factura cancelada. El cliente puede volver a facturar su ticket."));
}

/** Concilia una fila "Por confirmar" sin esperar a que el cliente vuelva a intentar. */
export async function revisarFactura(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) return volver(err("Solo administración puede revisar facturas."));
  const id = String(fd.get("id"));
  const { data: f } = await supabase.from("facturas_clientes").select("estado, creada").eq("id", id).single();
  if (!f || f.estado !== "en_proceso") return volver(err("La factura ya no está por confirmar."));
  let mensaje: string, bien = true;
  try {
    const r = await facturapi().buscarPorExterno(id), base = baseFacturacion();
    if (r.ok && r.valor) {
      await base.confirmar(id, r.valor);
      mensaje = "Confirmada: la factura sí se timbró.";
    } else if (r.ok && Date.now() - new Date(f.creada as string).getTime() > ESPERA_REVISION_MS) {
      await base.liberar(id, "Revisada por la oficina: Facturapi no la tiene");
      mensaje = "No se timbró; el ticket quedó libre.";
    } else {
      mensaje = "Sigue en proceso en Facturapi; revisa más tarde.";
      bien = false;
    }
  } catch (e) {
    registrar(e);
    return volver(err("No se pudo revisar. Intenta de nuevo."));
  }
  revalidatePath("/finanzas/facturacion");
  return volver(bien ? ok(mensaje) : err(mensaje));
}

export async function reenviarFactura(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) return volver(err("Solo administración puede reenviar."));
  const { data: f } = await supabase.from("facturas_clientes").select("facturapi_id, correo").eq("id", String(fd.get("id"))).eq("estado", "timbrada").single();
  if (!f || !f.facturapi_id) return volver(err("La factura no está timbrada."));
  const r = await facturapi().enviarCorreo(f.facturapi_id as string, f.correo as string);
  return volver(r.ok ? ok(`Reenviada a ${f.correo}.`) : err("No se pudo reenviar."));
}

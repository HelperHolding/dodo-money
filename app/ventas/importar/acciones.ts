"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { necesitaConfirmacion } from "@/lib/ventas/extraer";
import { prepararImportacion, type Revision } from "./preparar";

export type ResultadoImportacion =
  | { tipo: "revision"; revision: Revision }
  | { tipo: "error"; mensaje: string; revision?: Revision }
  | { tipo: "guardado"; mensaje: string };

async function clienteAdmin() {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) throw new Error("Solo un administrador importa ventas.");
  return supabase;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudieron leer los archivos.");

/** Lee y valida sin guardar. */
export async function revisarImportacion(fd: FormData): Promise<ResultadoImportacion> {
  try {
    return { tipo: "revision", revision: await prepararImportacion(await clienteAdmin(), fd) };
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
}

/** Vuelve a leer los archivos enviados (no confía en la revisión anterior) y guarda. */
export async function guardarImportacion(fd: FormData): Promise<ResultadoImportacion> {
  let supabase: Awaited<ReturnType<typeof clienteAdmin>>;
  let revision: Revision;
  try {
    supabase = await clienteAdmin();
    revision = await prepararImportacion(supabase, fd);
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
  if (necesitaConfirmacion({ cuadra: revision.cuadra, yaImportado: revision.yaImportado !== null }) && fd.get("confirmar") !== "si") {
    return { tipo: "error", mensaje: "Marca la casilla de confirmación para guardar.", revision };
  }

  const { error } = await supabase.rpc("importar_ventas_dia", {
    p_sucursal: revision.sucursal.id,
    p_fecha: revision.fecha,
    p_resumen: revision.resumen,
    p_desglose: revision.desglose,
    p_productos: revision.productos,
    p_archivos: revision.archivos,
    p_reemplazar: revision.yaImportado !== null,
  });
  if (error) return { tipo: "error", mensaje: error.message, revision };

  revalidatePath("/ventas", "layout");
  const accion = revision.yaImportado ? "Reimportado" : "Guardado";
  return { tipo: "guardado", mensaje: `${accion}: ${revision.sucursal.nombre}, ${fechaTexto(revision.fecha)}, ${pesos(revision.resumen.total)}.` };
}

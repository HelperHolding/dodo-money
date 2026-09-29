"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
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

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo leer el archivo.");

/** Lee y valida sin guardar. */
export async function revisarImportacion(fd: FormData): Promise<ResultadoImportacion> {
  try {
    return { tipo: "revision", revision: (await prepararImportacion(await clienteAdmin(), fd)).revision };
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
}

/** Vuelve a leer el archivo enviado (no confía en la revisión anterior) y lo guarda completo. */
export async function guardarImportacion(fd: FormData): Promise<ResultadoImportacion> {
  let supabase: Awaited<ReturnType<typeof clienteAdmin>>;
  let preparado: Awaited<ReturnType<typeof prepararImportacion>>;
  try {
    supabase = await clienteAdmin();
    preparado = await prepararImportacion(supabase, fd);
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
  const { revision, carga } = preparado;
  if (revision.diasYaImportados > 0 && fd.get("confirmar") !== "si") {
    return { tipo: "error", mensaje: "Marca la casilla para reemplazar los días ya importados.", revision };
  }

  const { error } = await supabase.rpc("importar_datos_brutos", {
    p_archivo: revision.archivo,
    p_dias: carga.dias,
    p_pedidos: carga.pedidos,
    p_productos: carga.productos,
    p_reemplazar: revision.diasYaImportados > 0,
  });
  if (error) return { tipo: "error", mensaje: error.message, revision };

  revalidatePath("/ventas", "layout");
  const { desde, hasta } = revision.periodo;
  const periodo = desde === hasta ? fechaTexto(desde) : `${fechaTexto(desde)} al ${fechaTexto(hasta)}`;
  return {
    tipo: "guardado",
    mensaje: `Guardado: ${revision.dias.length} ${revision.dias.length === 1 ? "día" : "días"} (${periodo}), ${revision.totales.pedidos} pedidos, ${pesos(revision.totales.total)}.`,
  };
}

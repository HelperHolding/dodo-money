"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerCargaProveedores } from "@/lib/compras/proveedores";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { leerPrimeraHoja, NO_ES_XLSX } from "@/lib/ventas/xlsx";

export type ResultadoCarga = { ok?: string; errores?: string[] };

const MAX_BYTES = 5 * 1024 * 1024;

/** Valida todo el archivo; si un renglón falla no se guarda ninguno (un solo insert). */
export async function cargarProveedores(_previo: ResultadoCarga | null, fd: FormData): Promise<ResultadoCarga> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { errores: [SOLO_CONSULTA] };
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { errores: ["Elige el archivo de Excel."] };
  if (archivo.size > MAX_BYTES) return { errores: ["El archivo pesa más de 5 MB."] };

  let hoja;
  try {
    hoja = leerPrimeraHoja(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    return { errores: [NO_ES_XLSX] };
  }

  // Sin paginar: la cartera queda muy por debajo de 1000 proveedores; si algún día pasa de 1000, usar leerTodo.
  const { data: existentes, error: errorLectura } = await supabase.from("proveedores").select("rfc").returns<{ rfc: string }[]>();
  if (errorLectura) return { errores: [errorLectura.message] };
  const { proveedores, errores } = leerCargaProveedores(hoja, new Set((existentes ?? []).map((p) => p.rfc)));
  if (errores.length) return { errores };

  const { error } = await supabase.from("proveedores").insert(proveedores);
  if (error) return { errores: [error.code === "23505" ? "Alguien dio de alta uno de estos RFC mientras cargabas; vuelve a intentarlo." : error.message] };
  revalidatePath("/compras", "layout");
  return { ok: `${proveedores.length} proveedores dados de alta.` };
}

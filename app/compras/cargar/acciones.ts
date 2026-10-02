"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { indiceProveedores, leerCargaArticulos, leerCargaProveedores } from "@/lib/compras/proveedores";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerPrimeraHoja, NO_ES_XLSX, type Hoja } from "@/lib/ventas/xlsx";

export type ResultadoCarga = { ok?: string; errores?: string[] };

const MAX_BYTES = 5 * 1024 * 1024;

/** Cliente de admin y primera hoja del archivo, o los errores para mostrar. */
async function prepararCarga(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { errores: [SOLO_CONSULTA] };
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { errores: ["Elige el archivo de Excel."] };
  if (archivo.size > MAX_BYTES) return { errores: ["El archivo pesa más de 5 MB."] };
  let hoja: Hoja;
  try {
    hoja = leerPrimeraHoja(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    return { errores: [NO_ES_XLSX] };
  }
  return { supabase, hoja };
}

/** Valida todo el archivo; si un renglón falla no se guarda ninguno (un solo insert). */
export async function cargarProveedores(_previo: ResultadoCarga | null, fd: FormData): Promise<ResultadoCarga> {
  const listo = await prepararCarga(fd);
  if ("errores" in listo) return { errores: listo.errores };
  const { supabase, hoja } = listo;

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

/** Igual que proveedores: todo o nada. Nombres (sin distinguir mayúsculas) e IDs de Dodo IS no se repiten. */
export async function cargarArticulos(_previo: ResultadoCarga | null, fd: FormData): Promise<ResultadoCarga> {
  const listo = await prepararCarga(fd);
  if ("errores" in listo) return { errores: listo.errores };
  const { supabase, hoja } = listo;

  type Existente = { nombre: string; dodo_insumo_id: string | null };
  type Prov = { id: string; razon_social: string; nombre_comercial: string | null; rfc: string };
  let existentes: Existente[];
  let proveedores: Prov[];
  try {
    [existentes, proveedores] = await Promise.all([
      leerTodo<Existente>((d, h) => supabase.from("articulos").select("nombre, dodo_insumo_id").order("id").range(d, h).returns<Existente[]>()),
      leerTodo<Prov>((d, h) => supabase.from("proveedores").select("id, razon_social, nombre_comercial, rfc").order("id").range(d, h).returns<Prov[]>()),
    ]);
  } catch {
    return { errores: ["No se pudo leer el catálogo de artículos o de proveedores; intenta de nuevo."] };
  }
  const { articulos, errores, ligas } = leerCargaArticulos(hoja, {
    nombres: new Set(existentes.map((a) => a.nombre.toLowerCase())),
    ids: new Set(existentes.flatMap((a) => (a.dodo_insumo_id ? [a.dodo_insumo_id] : []))),
    proveedores: indiceProveedores(proveedores),
  });
  if (errores.length) return { errores };

  const { data: nuevos, error } = await supabase.from("articulos").insert(articulos).select("id, nombre").returns<{ id: string; nombre: string }[]>();
  if (error) return { errores: [error.code === "23505" ? "Alguien dio de alta uno de estos artículos mientras cargabas; vuelve a intentarlo." : error.message] };
  revalidatePath("/compras", "layout");

  // Proveedores de cada artículo nuevo; el primero de la celda es el principal.
  const idDe = new Map((nuevos ?? []).map((a) => [a.nombre.toLowerCase(), a.id]));
  const filas = ligas.flatMap((l) => {
    const articulo = idDe.get(l.nombre.toLowerCase());
    return articulo ? l.proveedores.map((proveedor, i) => ({ articulo_id: articulo, proveedor_id: proveedor, principal: i === 0 })) : [];
  });
  if (filas.length) {
    const { error: errorLigas } = await supabase.from("articulo_proveedores").insert(filas);
    if (errorLigas) return { errores: [`Los ${articulos.length} artículos sí se dieron de alta, pero no se pudieron ligar sus proveedores: ${errorLigas.message}. Lígalos desde Artículos.`] };
  }
  return { ok: `${articulos.length} artículos dados de alta${filas.length ? ` con ${filas.length} ligas a proveedores` : ""}.` };
}

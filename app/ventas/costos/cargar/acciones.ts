"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeImportarVentas } from "@/lib/roles";
import { claveExcel, emparejarCostos, leerHojaCostos, type Asignacion, type ProductoCatalogo, type Tam } from "@/lib/ventas/cargaCostos";
import { costoVigente } from "@/lib/ventas/calculos";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerHojas } from "@/lib/ventas/xlsx";

export type FilaRevision = Asignacion & { costoActual: number | null };
export type RevisionCostos = {
  fecha: string;
  asignaciones: FilaRevision[];
  /** Renglones del Excel sin producto: se pueden emparejar a mano. */
  sinProducto: { clave: string; nombre: string; tam: Tam; costo: number }[];
  /** Productos de Dodo IS que se quedan sin costo nuevo (opciones para emparejar a mano). */
  sinCosto: { dodo_id: number; nombre: string }[];
  combos: number;
};
export type ResultadoCargaCostos =
  | { tipo: "revision"; revision: RevisionCostos }
  | { tipo: "error"; mensaje: string }
  | { tipo: "guardado"; mensaje: string };

const MAX_BYTES = 5 * 1024 * 1024;
const FUENTE = "Excel del menú (pestaña Costo)";

/** Lee el Excel y empareja con el catálogo, las equivalencias guardadas y las que se eligieron a mano en la revisión. */
async function preparar(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) throw new Error("Solo un administrador carga costos.");
  const fecha = String(fd.get("fecha") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Elige desde qué fecha valen los costos.");
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Elige el Excel del menú.");
  if (archivo.size > MAX_BYTES) throw new Error("El archivo pesa más de 5 MB.");

  const hojas = leerHojas(new Uint8Array(await archivo.arrayBuffer()));
  const hoja = hojas.find((h) => /costo/i.test(h.nombre)) ?? hojas[0];
  const leida = leerHojaCostos(hoja);
  if ("error" in leida) throw new Error(leida.error);

  const [catalogo, equivalencias, costos] = await Promise.all([
    leerTodo<ProductoCatalogo>((d, h) => supabase.from("productos_venta").select("dodo_id, nombre, categoria, tamano")
      .order("dodo_id").range(d, h).returns<ProductoCatalogo[]>()),
    leerTodo<{ clave_excel: string; tamano: Tam; dodo_id: number }>((d, h) => supabase.from("costos_equivalencias")
      .select("clave_excel, tamano, dodo_id").order("clave_excel").order("tamano").range(d, h).returns<{ clave_excel: string; tamano: Tam; dodo_id: number }[]>()),
    leerTodo<{ dodo_id: number; costo: number; vigente_desde: string }>((d, h) => supabase.from("costos_producto")
      .select("dodo_id, costo, vigente_desde").order("dodo_id").order("vigente_desde").range(d, h).returns<{ dodo_id: number; costo: number; vigente_desde: string }[]>()),
  ]);

  // Lo elegido a mano en la revisión: campos "manual|clave|tamaño" con el dodo_id ("" = no cargar).
  const manuales = new Map<string, number>();
  for (const [campo, valor] of fd.entries()) {
    if (!campo.startsWith("manual|") || !valor) continue;
    const [, clave, tam] = campo.split("|");
    if (clave && /^[PMG]$/.test(tam) && Number.isInteger(Number(valor))) manuales.set(`${clave}|${tam}`, Number(valor));
  }
  const guardadas = new Map(equivalencias.map((e) => [`${e.clave_excel}|${e.tamano}`, e.dodo_id]));
  for (const [k, v] of manuales) guardadas.set(k, v);

  const e = emparejarCostos(leida.filas, catalogo, guardadas);
  const costosDe = new Map<number, { costo: number; vigente_desde: string }[]>();
  for (const c of costos) costosDe.set(c.dodo_id, [...(costosDe.get(c.dodo_id) ?? []), c]);
  // Costo actual: el vigente el día anterior a la nueva fecha (lo que se reemplaza).
  const antes = new Date(`${fecha}T00:00:00Z`);
  antes.setUTCDate(antes.getUTCDate() - 1);
  const diaAnterior = antes.toISOString().slice(0, 10);

  const revision: RevisionCostos = {
    fecha,
    asignaciones: e.asignaciones.map((a) => {
      const actual = costoVigente(costosDe.get(a.dodo_id) ?? [], diaAnterior);
      return { ...a, costoActual: actual ? Number(actual.costo) : null };
    }).sort((a, b) => a.producto.localeCompare(b.producto, "es")),
    sinProducto: e.sinProducto.map((f) => ({ clave: claveExcel(f.nombre), nombre: f.nombre, tam: f.tam, costo: Math.round((f.receta + f.periferico) * 100) / 100 })),
    sinCosto: e.sinCosto.map((p) => ({ dodo_id: p.dodo_id, nombre: p.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    combos: leida.filas.filter((f) => f.seccion === "combo").length,
  };
  return { supabase, revision, manuales };
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo leer el archivo.");

/** Lee y empareja sin guardar. */
export async function revisarCargaCostos(fd: FormData): Promise<ResultadoCargaCostos> {
  try {
    return { tipo: "revision", revision: (await preparar(fd)).revision };
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
}

/** Vuelve a leer el archivo (no confía en la revisión anterior) y guarda los costos y las equivalencias elegidas a mano. */
export async function guardarCargaCostos(fd: FormData): Promise<ResultadoCargaCostos> {
  try {
    const { supabase, revision, manuales } = await preparar(fd);
    const costos = revision.asignaciones.map((a) => ({ dodo_id: a.dodo_id, costo: a.costo, nota: a.nota, categoria: a.categoria, tamano: a.tamano ?? "" }));
    const equivalencias = [...manuales].map(([k, dodo_id]) => { const [clave_excel, tamano] = k.split("|"); return { clave_excel, tamano, dodo_id }; });
    const { data, error } = await supabase.rpc("cargar_costos", { p_fecha: revision.fecha, p_fuente: FUENTE, p_costos: costos, p_equivalencias: equivalencias });
    if (error) return { tipo: "error", mensaje: error.message };
    revalidatePath("/ventas", "layout");
    const cambian = revision.asignaciones.filter((a) => a.costoActual === null || a.costoActual !== a.costo).length;
    return { tipo: "guardado", mensaje: `${Number(data)} costos cargados desde el ${revision.fecha} (${cambian} cambian o son nuevos).` };
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
}

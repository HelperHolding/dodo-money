"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeImportarVentas } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerHojas } from "@/lib/ventas/xlsx";
import { costoVigente } from "@/lib/ventas/calculos";
import { leerBOM, emparejarBOM, type ModeloBOM } from "@/lib/costeo/bom";
import modeloIncluido from "@/lib/costeo/uc-mexico.json";
import { HUELLA_UC_MEXICO } from "@/lib/costeo/fuente";

export type RevisionBOM = { modelo: ModeloBOM; recetas: (ReturnType<typeof emparejarBOM>[number] & { actual: number | null; nuevo: number | null })[]; catalogo: {dodo_id:number;nombre:string}[]; fecha: string; archivo: string; huellaRevision: string };
export type ResultadoBOM = { tipo:"revision"; revision:RevisionBOM } | { tipo:"error"|"guardado"; mensaje:string };
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

async function preparar(fd:FormData) {
  const {supabase,perfil} = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) throw new Error("Solo un administrador carga costos y materiales.");
  const fecha = String(fd.get("fecha") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || new Date(`${fecha}T00:00:00Z`).toISOString().slice(0,10) !== fecha) throw new Error("Elige una fecha válida.");
  const file = fd.get("archivo");
  let modelo:ModeloBOM, archivo:string, huella:string;
  if (file instanceof File && file.size) {
    if (file.size > 4*1024*1024 || !file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Elige un .xlsx de hasta 4 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    modelo = leerBOM(leerHojas(bytes)); archivo=file.name; huella=sha(bytes);
  } else {
    modelo = modeloIncluido as ModeloBOM; archivo="UC Mexico (4).xlsx"; huella=HUELLA_UC_MEXICO;
  }
  const [catalogo,equivalencias,costos] = await Promise.all([
    leerTodo<{dodo_id:number;nombre:string}>((d,h)=>supabase.from("productos_venta").select("dodo_id,nombre").order("dodo_id").range(d,h)),
    leerTodo<{clave:string;dodo_id:number}>((d,h)=>supabase.from("bom_equivalencias").select("clave,dodo_id").order("clave").range(d,h)),
    leerTodo<{dodo_id:number;costo:number;vigente_desde:string}>((d,h)=>supabase.from("costos_producto").select("dodo_id,costo,vigente_desde").order("dodo_id").order("vigente_desde").range(d,h)),
  ]);
  const manuales = new Map(equivalencias.map(e=>[e.clave,e.dodo_id]));
  for (const [k,v] of fd.entries()) if (k.startsWith("producto|")) {
    const id = Number(v); if (!Number.isInteger(id) || id < 0) throw new Error("Producto inválido.");
    manuales.set(k.slice(9), id);
  }
  const usados = new Set<number>();
  const recetas = emparejarBOM(modelo.recetas,catalogo,manuales).map(r=>{
    if (r.costo !== null && r.dodo_id !== null) {
      if (usados.has(r.dodo_id)) throw new Error(`Hay dos recetas asignadas a ${r.producto}. Elige «Sin vincular» en una de ellas.`);
      usados.add(r.dodo_id);
    }
    const actual = r.dodo_id ? costoVigente(costos.filter(c=>c.dodo_id===r.dodo_id),fecha) : null;
    return {...r, actual:actual ? Number(actual.costo) : null, nuevo:r.costo === null || r.precioVenta === null ? null : Math.round((r.costo + r.precioVenta*.01)*100)/100};
  });
  const huellaRevision = sha(JSON.stringify({fecha,huella,recetas:recetas.map(r=>[r.clave,r.dodo_id,r.nuevo])}));
  return {supabase,modelo,huella,revision:{modelo,recetas,catalogo,fecha,archivo,huellaRevision} satisfies RevisionBOM};
}
export async function revisarBOM(fd:FormData):Promise<ResultadoBOM> {
  try { return {tipo:"revision",revision:(await preparar(fd)).revision}; }
  catch(e) { return {tipo:"error",mensaje:e instanceof Error ? e.message : "No se pudo revisar el archivo."}; }
}
export async function guardarBOM(fd:FormData):Promise<ResultadoBOM> {
  try {
    const {supabase,modelo,huella,revision} = await preparar(fd);
    if (String(fd.get("revision")) !== revision.huellaRevision) throw new Error("Cambió el archivo, la fecha o un vínculo. Presiona Revisar antes de guardar.");
    const asignaciones=revision.recetas.filter(r=>r.dodo_id!==null && r.nuevo!==null).map(r=>({clave:r.clave,dodo_id:r.dodo_id}));
    const {data,error}=await supabase.rpc("importar_bom",{p_fecha:revision.fecha,p_archivo:revision.archivo,p_huella:huella,p_modelo:modelo,p_asignaciones:asignaciones,p_periferico:true});
    if(error) throw new Error(error.message);
    revalidatePath("/ventas","layout"); revalidatePath("/finanzas","layout");
    return {tipo:"guardado",mensaje:`${modelo.insumos.length} insumos y ${modelo.recetas.length} listas de materiales guardados. ${data} costos actualizados desde ${revision.fecha}.`};
  } catch(e) { return {tipo:"error",mensaje:e instanceof Error ? e.message : "No se pudo guardar."}; }
}

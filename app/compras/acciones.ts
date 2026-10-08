"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { leerArticulo, leerDesactivacion, leerProveedor, leerSeleccionProveedores, REGIMENES, type DatosArticulo, type DatosProveedor } from "@/lib/compras/proveedores";
import { leerConstancia, regimenPropuesto } from "@/lib/compras/constancia";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { DOCUMENTOS_ALTA, NOMBRE_DOCUMENTO, validarDocumentosAlta, extensionDocumento, leerDocumento, MAX_BYTES_DOCUMENTO, rutaDocumento, type TipoDocumento } from "@/lib/compras/documentos";
import { hoyCalendarioMX } from "@/lib/formato";

const volver = (ruta: string, clave: "ok" | "error", texto: string): never =>
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}${clave}=${encodeURIComponent(texto)}`);

async function clienteAdmin(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) volver(ruta, "error", SOLO_CONSULTA);
  return supabase;
}

/** Alta (sin id) o edición (con id) de un proveedor. */
export async function guardarProveedor(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = id ? `/compras/proveedores/${id}` : "/compras/proveedores/nuevo";
  const supabase = await clienteAdmin(ruta);
  const r = leerProveedor((c) => (c === "categorias" ? fd.getAll("categorias").join(",") : String(fd.get(c) ?? "")));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: DatosProveedor };

  const adjuntos: {tipo: TipoDocumento; fecha: string; archivo: File}[] = [];
  if (!id) {
    const problema = validarDocumentosAlta(fd, hoyCalendarioMX());
    if (problema) volver(ruta, "error", problema);
    for (const tipo of DOCUMENTOS_ALTA) adjuntos.push({tipo,fecha:String(fd.get(`${tipo}_fecha`)),archivo:archivoDe(fd,tipo)!});
    const constancia = archivoDe(fd, "constancia");
    if (constancia) {
      const c = await constanciaDe(constancia);
      if ("error" in c) volver(ruta,"error",c.error);
      else if (c.datos.rfc !== datos.rfc) volver(ruta,"error",`La constancia es del RFC ${c.datos.rfc}, no del proveedor ${datos.rfc}.`);
      else {
        const fecha = leerDocumento("constancia_fiscal",c.datos.fecha_emision,hoyCalendarioMX());
        if ("error" in fecha) volver(ruta,"error",`Constancia fiscal: ${fecha.error}`);
        adjuntos.push({tipo:"constancia_fiscal",fecha:c.datos.fecha_emision,archivo:constancia});
      }
    }
  }

  const { data, error } = id
    ? await supabase.from("proveedores").update(datos).eq("id", id).select("id").single()
    : await supabase.from("proveedores").insert(datos).select("id").single();
  if (error) volver(ruta, "error", error.code === "23505" ? `Ya hay un proveedor con el RFC ${datos.rfc}.` : error.message);

  const pendientes: string[] = [];
  for (const adjunto of adjuntos) {
    try {
      const problema = await guardarArchivoDocumento(supabase,data!.id,adjunto.tipo,adjunto.fecha,adjunto.archivo);
      if (problema) pendientes.push(NOMBRE_DOCUMENTO[adjunto.tipo]);
    } catch { pendientes.push(NOMBRE_DOCUMENTO[adjunto.tipo]); }
  }

  revalidatePath("/compras", "layout");
  if (pendientes.length) volver(`/compras/proveedores/${data!.id}`,"error",`El proveedor se dio de alta, pero no se guardó: ${pendientes.join(", ")}. Súbelos en Documentos de esta ficha; no vuelvas a dar de alta al proveedor.`);
  volver(`/compras/proveedores/${data!.id}`, "ok", id ? "Proveedor actualizado." : "Proveedor dado de alta. Sus documentos quedaron guardados en el expediente.");
}

type Cliente = Awaited<ReturnType<typeof clienteAdmin>>;

const archivoDe = (fd: FormData, campo: string) => {
  const a = fd.get(campo);
  return a instanceof File && a.size > 0 ? a : null;
};

const constanciaDe = async (archivo: File) => leerConstancia(new Uint8Array(await archivo.arrayBuffer()), REGIMENES);

/** Revisa el archivo y lo guarda como versión nueva del documento; devuelve el problema o null. */
async function guardarArchivoDocumento(supabase: Cliente, proveedorId: string, tipo: TipoDocumento, fecha: string, archivo: File): Promise<string | null> {
  const extension = extensionDocumento(archivo.type);
  if (!extension) return "El documento debe ser PDF o foto (JPG, PNG o WebP).";
  if (archivo.size > MAX_BYTES_DOCUMENTO) return "El archivo pesa más de 4 MB. Si es foto, tómala con menos resolución o súbela como PDF.";
  const destino = rutaDocumento(proveedorId, tipo, fecha, crypto.randomUUID(), extension);
  const { error: errorArchivo } = await supabase.storage.from("documentos-proveedores").upload(destino, archivo, { contentType: archivo.type, upsert: false });
  if (errorArchivo) return `No se pudo subir el archivo: ${errorArchivo.message}`;
  const { error } = await supabase.from("documentos_proveedor").insert({ proveedor_id: proveedorId, tipo, fecha, ruta: destino });
  return error ? error.message : null;
}

export type LecturaConstancia = {
  datos?: {
    tipo: "moral" | "fisica"; rfc: string; razon_social: string; nombre_comercial: string | null; codigo_postal: string | null; fecha_emision: string;
    /** Régimen propuesto (el primero vigente del catálogo) y todos los vigentes que trae, para elegir. */
    regimen: string | null; regimenes: { codigo: string; nombre: string }[];
  };
  error?: string;
};

/** Lee una constancia para prellenar el alta de un proveedor. No guarda nada. */
export async function leerConstanciaSubida(fd: FormData): Promise<LecturaConstancia> {
  const { perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { error: SOLO_CONSULTA };
  const archivo = archivoDe(fd, "constancia");
  if (!archivo) return { error: "Elige la constancia (PDF)." };
  if (archivo.size > MAX_BYTES_DOCUMENTO) return { error: "La constancia pesa más de 4 MB." };
  const c = await constanciaDe(archivo);
  if ("error" in c) return { error: c.error };
  const { tipo, rfc, razon_social, nombre_comercial, codigo_postal, fecha_emision } = c.datos;
  const regimenes = c.datos.regimenes.flatMap((r) => (!r.fin && r.codigo ? [{ codigo: r.codigo, nombre: r.nombre }] : []));
  return { datos: { tipo, rfc, razon_social, nombre_comercial, codigo_postal, fecha_emision, regimen: regimenPropuesto(c.datos), regimenes } };
}

/**
 * Sube una versión nueva de un documento del proveedor; las anteriores quedan en el historial.
 * Una constancia en PDF se lee: tiene que ser del RFC del proveedor, su fecha sale sola y avisa si el régimen cambió.
 */
export async function subirDocumentoProveedor(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = `/compras/proveedores/${id}`;
  const supabase = await clienteAdmin(ruta);
  const tipo = String(fd.get("tipo") ?? "");
  let fecha = String(fd.get("fecha") ?? "").trim();
  const archivo = archivoDe(fd, "archivo");
  if (!archivo) volver(ruta, "error", "Elige el archivo del documento.");

  let aviso = "";
  if (tipo === "constancia_fiscal" && archivo!.type === "application/pdf") {
    const c = await constanciaDe(archivo!);
    if ("datos" in c) {
      const { data: p } = await supabase.from("proveedores").select("rfc, regimen_fiscal").eq("id", id).maybeSingle<{ rfc: string; regimen_fiscal: string }>();
      if (p && c.datos.rfc !== p.rfc) volver(ruta, "error", `Esta constancia es del RFC ${c.datos.rfc}, no de este proveedor (${p.rfc}).`);
      if (!fecha) fecha = c.datos.fecha_emision;
      const vigentes = c.datos.regimenes.flatMap((r) => (!r.fin && r.codigo ? [r.codigo] : []));
      if (p && vigentes.length && !vigentes.includes(p.regimen_fiscal)) {
        aviso = ` Ojo: la constancia trae el régimen ${vigentes.join(", ")} y el proveedor tiene ${p.regimen_fiscal}; si cambió, actualízalo en Editar datos.`;
      }
    } else if (!fecha) {
      volver(ruta, "error", `${c.error} Si es la correcta, escribe la fecha que trae.`);
    }
  }

  const r = leerDocumento(tipo, fecha, hoyCalendarioMX());
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: { tipo: TipoDocumento; fecha: string } };
  const problema = await guardarArchivoDocumento(supabase, id, datos.tipo, datos.fecha, archivo!);
  if (problema) volver(ruta, "error", problema);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", "Documento guardado." + aviso);
}

export async function cambiarActivoProveedor(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = `/compras/proveedores/${id}`;
  const supabase = await clienteAdmin(ruta);
  const r = leerDesactivacion(String(fd.get("activo") ?? ""), String(fd.get("motivo") ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: { activo: boolean; motivo_desactivacion: string | null } };
  const { error } = await supabase.from("proveedores").update(datos).eq("id", id);
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", datos.activo ? "Proveedor reactivado." : "Proveedor desactivado. Su historial se conserva.");
}

/** Alta (sin id) o edición (con id) de un artículo; regresa a su tarjeta. */
export async function guardarArticulo(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = "/compras/articulos";
  const supabase = await clienteAdmin(ruta);
  const r = leerArticulo((c) => String(fd.get(c) ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: DatosArticulo };
  const { data, error } = id
    ? await supabase.from("articulos").update(datos).eq("id", id).select("id").single()
    : await supabase.from("articulos").insert(datos).select("id").single();
  if (error) {
    volver(ruta, "error", error.code === "23505"
      ? (error.message.includes("dodo_insumo_id") ? "Ese ID de insumo de Dodo IS ya está en otro artículo." : `Ya hay un artículo llamado ${datos.nombre}.`)
      : error.message);
  }
  revalidatePath("/compras", "layout");
  redirect(`${ruta}?ok=${encodeURIComponent(id ? "Artículo actualizado." : "Artículo dado de alta.")}#a-${data!.id}`);
}

/** Proveedores que surten un artículo (casillas) y cuál es el principal. Reemplaza los que tenía. */
export async function guardarProveedoresArticulo(fd: FormData) {
  const ruta = "/compras/articulos";
  const supabase = await clienteAdmin(ruta);
  const id = String(fd.get("id") ?? "");
  const r = leerSeleccionProveedores(fd.getAll("proveedores").map(String), String(fd.get("principal") ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: { proveedores: string[]; principal: string | null } };
  const { error } = await supabase.rpc("guardar_proveedores_articulo", { p_articulo: id, p_proveedores: datos.proveedores, p_principal: datos.principal });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  redirect(`${ruta}?ok=${encodeURIComponent(datos.proveedores.length ? "Proveedores del artículo guardados." : "El artículo quedó sin proveedores.")}#a-${id}`);
}

export async function cambiarActivoArticulo(fd: FormData) {
  const ruta = "/compras/articulos";
  const supabase = await clienteAdmin(ruta);
  const id = String(fd.get("id") ?? "");
  const r = leerDesactivacion(String(fd.get("activo") ?? ""), String(fd.get("motivo") ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: { activo: boolean; motivo_desactivacion: string | null } };
  const { error } = await supabase.from("articulos").update(datos).eq("id", id);
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  redirect(`${ruta}?ok=${encodeURIComponent(datos.activo ? "Artículo reactivado." : "Artículo desactivado.")}#a-${id}`);
}

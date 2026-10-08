"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { leerComplementoPago } from "@/lib/compras/cfdi";
import { archivoYaSubido } from "@/lib/compras/facturas";
import { revisarPago } from "@/lib/compras/pagos";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { textoDia } from "@/lib/compras/diasPago";
import { clienteAdmin, volver } from "../servidor";

const BUCKET = "facturas";
const MAX_BYTES = 5 * 1024 * 1024;

export type ResultadoComplementos = { resultados: { archivo: string; ok: boolean; texto: string }[] };

export async function subirComplementos(_previo: ResultadoComplementos | null, fd: FormData): Promise<ResultadoComplementos> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { resultados: [{ archivo: "", ok: false, texto: SOLO_CONSULTA }] };
  const xmls = fd.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0 && a.name.toLowerCase().endsWith(".xml"));
  if (!xmls.length) return { resultados: [{ archivo: "", ok: false, texto: "Elige al menos un XML de complemento de pago." }] };
  const { data: empresa } = await supabase.from("empresa").select("rfc").maybeSingle<{ rfc: string }>();
  if (!empresa) return { resultados: [{ archivo: "", ok: false, texto: "Configura primero los datos de la empresa." }] };

  const resultados: ResultadoComplementos["resultados"] = [];
  for (const xml of xmls) {
    if (xml.size > MAX_BYTES) { resultados.push({ archivo: xml.name, ok: false, texto: "Pesa más de 5 MB." }); continue; }
    const leido = leerComplementoPago(await xml.text());
    if ("error" in leido) { resultados.push({ archivo: xml.name, ok: false, texto: leido.error }); continue; }
    const c = leido.complemento;
    if (c.rfc_receptor !== empresa.rfc) { resultados.push({ archivo: xml.name, ok: false, texto: `Es para el RFC ${c.rfc_receptor}, no para la empresa (${empresa.rfc}).` }); continue; }
    const { data: previo } = await supabase.from("complementos_pago").select("id").eq("uuid", c.uuid).maybeSingle();
    if (previo) { resultados.push({ archivo: xml.name, ok: false, texto: "Este complemento ya se registró." }); continue; }
    const ruta = `complementos/${c.uuid}.xml`;
    const { error: errorXml } = await supabase.storage.from(BUCKET).upload(ruta, xml, { contentType: "application/xml", upsert: false });
    if (errorXml && !archivoYaSubido(errorXml.message)) { resultados.push({ archivo: xml.name, ok: false, texto: `No se pudo subir el XML: ${errorXml.message}` }); continue; }
    const { error } = await supabase.rpc("registrar_complemento", { p_complemento: c, p_xml: ruta });
    if (error) { resultados.push({ archivo: xml.name, ok: false, texto: error.message }); continue; }
    resultados.push({ archivo: xml.name, ok: true, texto: `Complemento de ${c.nombre_emisor || c.rfc_emisor} por ${c.monto.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}: cubre ${c.documentos.length} ${c.documentos.length === 1 ? "factura" : "facturas"}.` });
  }
  revalidatePath("/compras", "layout");
  return { resultados };
}

const COMPROBANTE: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};

/** Las aplicaciones llegan como campos `aplicar_<factura_id>`; se revisan aquí y otra vez en la base. */
export async function registrarPago(fd: FormData) {
  const proveedor = String(fd.get("proveedor_id") ?? "");
  const ruta = `/compras/pagos/nuevo?proveedor=${proveedor}`;
  const supabase = await clienteAdmin(ruta);
  const monto = Number(String(fd.get("monto") ?? "").replace(/[$\s,]/g, ""));
  const aplicaciones = [...fd.entries()]
    .filter(([k]) => k.startsWith("aplicar_"))
    .map(([k, v]) => ({ factura_id: k.slice(8), monto: Math.round(Number(String(v).replace(/[$\s,]/g, "")) * 100) / 100 }))
    .filter((a) => a.monto > 0);
  const { data: saldos } = await supabase.from("facturas_saldo").select("id, saldo").in("id", aplicaciones.map((a) => a.factura_id).concat("00000000-0000-0000-0000-000000000000"))
    .returns<{ id: string; saldo: number }[]>();
  const problema = revisarPago(monto, aplicaciones, new Map((saldos ?? []).map((s) => [s.id, Number(s.saldo)])));
  if (problema) volver(ruta, "error", problema);

  const archivo = fd.get("comprobante");
  const comprobante = archivo instanceof File && archivo.size > 0 ? archivo : null;
  if (fd.get("origen") === "boveda_acumulado") {
    const nota = String(fd.get("nota_boveda") ?? "").trim();
    if (nota.length < 5 || nota.length > 1000) volver(ruta, "error", "Especifica el motivo del uso del efectivo (5 a 1000 caracteres).");
    if (!comprobante) volver(ruta, "error", "Adjunta el ticket o comprobante del pago.");
  }
  let rutaComprobante: string | null = null;
  if (comprobante) {
    const ext = COMPROBANTE[comprobante.type];
    if (!ext) volver(ruta, "error", "El comprobante debe ser PDF o foto (JPG, PNG o HEIC).");
    if (comprobante.size > 5 * 1024 * 1024) volver(ruta, "error", "El comprobante pesa más de 5 MB.");
    rutaComprobante = `pagos/${crypto.randomUUID()}.${ext}`;
    const { error: errorArchivo } = await supabase.storage.from(BUCKET).upload(rutaComprobante, comprobante, { contentType: comprobante.type, upsert: false });
    if (errorArchivo) volver(ruta, "error", `No se pudo subir el comprobante: ${errorArchivo.message}`);
  }

  const { data: id, error } = await supabase.rpc(fd.get("origen")==="boveda_acumulado"?"registrar_pago_boveda_acumulado":"registrar_pago_con_origen", {p_datos:{
    sucursal:String(fd.get("sucursal_boveda")??""),nota:String(fd.get("nota_boveda")??"").trim(),
    solicitud:String(fd.get("solicitud")??""),proveedor,fecha:String(fd.get("fecha")??""),monto,origen:String(fd.get("origen")??""),
    cuenta:String(fd.get("cuenta_origen")??""),reserva:String(fd.get("reserva")??"")||null,
    referencia:String(fd.get("referencia")??""),comprobante:rutaComprobante,aplicaciones,
    motivo:String(fd.get("motivo_fuera_de_dia")??"").trim()||null,
  }});
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  revalidatePath("/", "layout");
  redirect(`/compras/pagos/${id as string}?ok=${encodeURIComponent("Pago registrado.")}`);
}

export async function anularPago(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = `/compras/pagos/${id}`;
  const supabase = await clienteAdmin(ruta);
  const { error } = await supabase.rpc("anular_pago", { p_id: id, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  revalidatePath("/", "layout");
  volver(ruta, "ok", "Pago anulado. Las facturas recuperaron su saldo.");
}

/** Programa en bloque las facturas marcadas para cualquier fecha desde hoy. */
export async function programarPagos(fd: FormData) {
  const ruta = `/compras/pagos/programar${String(fd.get("volver") ?? "")}`;
  const supabase = await clienteAdmin(ruta);
  const facturas = fd.getAll("factura").map(String);
  const dia = String(fd.get("dia") ?? "");
  if (!facturas.length) volver(ruta, "error", "Marca al menos una factura.");
  const { data: n, error } = await supabase.rpc("programar_pagos", { p_facturas: facturas, p_fecha: dia });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", `${n} ${n === 1 ? "factura programada" : "facturas programadas"} para el ${textoDia(dia)}.`);
}

"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerComplementoPago } from "@/lib/compras/cfdi";
import { archivoYaSubido } from "@/lib/compras/facturas";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";

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

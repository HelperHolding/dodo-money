"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerCfdi } from "@/lib/compras/cfdi";
import { archivoYaSubido, avisoGastosSinCfdi, baseArchivo, rutaArchivoFactura } from "@/lib/compras/facturas";
import { fechaTexto, fechaMX, hoyCalendarioMX, pesos } from "@/lib/formato";
import { leerGastoManual, type GastoManual } from "@/lib/compras/gastoManual";
import { CUENTAS_GASTO, CUENTAS_MEMO } from "@/lib/finanzas/cuentas";
import { REGIMENES } from "@/lib/compras/proveedores";
import { leerEmpresa } from "@/lib/compras/empresa";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { clienteAdmin, volver } from "../servidor";

const BUCKET = "facturas";
const MAX_BYTES = 5 * 1024 * 1024;
const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

export async function guardarEmpresa(fd: FormData) {
  const ruta = "/compras/facturas/empresa";
  const supabase = await clienteAdmin(ruta);
  const r = leerEmpresa((c) => texto(fd, c), REGIMENES);
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as Exclude<typeof r, { error: string }>;
  const { error } = await supabase.from("empresa").upsert({ id: true, ...datos });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver("/compras/facturas", "ok", "Datos de la empresa guardados.");
}

export type ResultadoSubida = { resultados: { archivo: string; ok: boolean; texto: string; id?: string }[] };

/**
 * Cada XML se valida antes de subir nada (para no dejar archivos huérfanos): que sea CFDI, que no esté registrado
 * y que sea para la empresa. Después se suben XML y PDF (mismo nombre) y se registra en la base, que vuelve a validar.
 */
export async function subirFacturas(_previo: ResultadoSubida | null, fd: FormData): Promise<ResultadoSubida> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { resultados: [{ archivo: "", ok: false, texto: SOLO_CONSULTA }] };
  const archivos = fd.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0);
  const xmls = archivos.filter((a) => a.name.toLowerCase().endsWith(".xml"));
  const pdfs = new Map(archivos.filter((a) => a.name.toLowerCase().endsWith(".pdf")).map((a) => [baseArchivo(a.name), a]));
  if (!xmls.length) return { resultados: [{ archivo: "", ok: false, texto: "Elige al menos un XML de factura." }] };
  const altaProveedor = fd.get("alta_proveedor") === "si";

  const { data: empresa } = await supabase.from("empresa").select("rfc, razon_social").maybeSingle<{ rfc: string; razon_social: string }>();
  if (!empresa) return { resultados: [{ archivo: "", ok: false, texto: "Configura primero los datos de la empresa." }] };

  const resultados: ResultadoSubida["resultados"] = [];
  const vistos = new Set<string>();
  for (const xml of xmls) {
    if (xml.size > MAX_BYTES) { resultados.push({ archivo: xml.name, ok: false, texto: "Pesa más de 5 MB." }); continue; }
    const leido = leerCfdi(await xml.text());
    if ("error" in leido) { resultados.push({ archivo: xml.name, ok: false, texto: leido.error }); continue; }
    const cfdi = leido.cfdi;
    if (vistos.has(cfdi.uuid)) { resultados.push({ archivo: xml.name, ok: false, texto: "Viene dos veces en esta subida." }); continue; }
    vistos.add(cfdi.uuid);
    if (cfdi.rfc_receptor !== empresa.rfc) {
      resultados.push({ archivo: xml.name, ok: false, texto: `Es para el RFC ${cfdi.rfc_receptor}, no para ${empresa.razon_social} (${empresa.rfc}).` });
      continue;
    }
    const { data: previa } = await supabase.from("facturas").select("id, creado_en").eq("uuid", cfdi.uuid).maybeSingle<{ id: string; creado_en: string }>();
    if (previa) { resultados.push({ archivo: xml.name, ok: false, texto: `Ya se registró el ${fechaTexto(fechaMX(previa.creado_en))}.`, id: previa.id }); continue; }
    if (!altaProveedor) {
      const { data: prov } = await supabase.from("proveedores").select("id").eq("rfc", cfdi.rfc_emisor).maybeSingle<{ id: string }>();
      if (!prov) { resultados.push({ archivo: xml.name, ok: false, texto: `El proveedor con RFC ${cfdi.rfc_emisor} no está en la cartera.` }); continue; }
    }

    // Ruta única por folio fiscal: si quedó de un intento que no se registró, se reutiliza.
    const rutaXml = rutaArchivoFactura(cfdi.uuid, "xml");
    const { error: errorXml } = await supabase.storage.from(BUCKET).upload(rutaXml, xml, { contentType: "application/xml", upsert: false });
    if (errorXml && !archivoYaSubido(errorXml.message)) { resultados.push({ archivo: xml.name, ok: false, texto: `No se pudo subir el XML: ${errorXml.message}` }); continue; }
    const pdf = pdfs.get(baseArchivo(xml.name));
    let pdfRuta: string | null = null;
    let avisoPdf = "";
    if (pdf && pdf.size > MAX_BYTES) avisoPdf = " El PDF pesa más de 5 MB y no se guardó.";
    else if (pdf) {
      const rutaPdf = rutaArchivoFactura(cfdi.uuid, "pdf");
      const { error: errorPdf } = await supabase.storage.from(BUCKET).upload(rutaPdf, pdf, { contentType: "application/pdf", upsert: false });
      if (!errorPdf || archivoYaSubido(errorPdf.message)) pdfRuta = rutaPdf;
      else avisoPdf = ` El PDF no se pudo guardar: ${errorPdf.message}`;
    }
    const { data: id, error } = await supabase.rpc("registrar_factura", { p_cfdi: cfdi, p_alta_proveedor: altaProveedor, p_xml: rutaXml, p_pdf: pdfRuta });
    if (error) { resultados.push({ archivo: xml.name, ok: false, texto: error.message }); continue; }
    const nombre = cfdi.tipo === "egreso" ? "Nota de crédito" : "Factura";
    // Si el proveedor tiene gastos sin CFDI abiertos, se recuerda sustituirlos (si no, el gasto se cuenta doble).
    let avisoSinCfdi = "";
    if (cfdi.tipo === "ingreso") {
      const { data: nueva } = await supabase.from("facturas").select("proveedor_id").eq("id", id as string).maybeSingle<{ proveedor_id: string }>();
      const { count } = nueva
        ? await supabase.from("facturas").select("id", { count: "exact", head: true }).eq("proveedor_id", nueva.proveedor_id).eq("origen", "manual").neq("estado", "cancelada")
        : { count: 0 };
      avisoSinCfdi = avisoGastosSinCfdi(count ?? 0);
    }
    const avisoVarias = cfdi.uuids_relacionados.length > 1
      ? ` Corrige ${cfdi.uuids_relacionados.length} facturas: se restó completa de la primera; revisa los saldos.` : "";
    resultados.push({ archivo: xml.name, ok: true, texto: `${nombre} ${cfdi.serie ?? ""}${cfdi.folio ?? ""} de ${cfdi.nombre_emisor} registrada${pdfRuta ? " con PDF" : ""}.${avisoVarias}${avisoPdf}${avisoSinCfdi}`, id: id as string });
  }
  revalidatePath("/compras", "layout");
  return { resultados };
}

const rutaFactura = (id: string) => `/compras/facturas/${id}`;

async function llamarFactura(fd: FormData, funcion: string, argumentos: Record<string, unknown>, mensaje: string) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(rutaFactura(id));
  const { error } = await supabase.rpc(funcion, argumentos);
  if (error) volver(rutaFactura(id), "error", error.message);
  revalidatePath("/compras", "layout");
  volver(rutaFactura(id), "ok", mensaje);
}

export async function ligarOrdenes(fd: FormData) {
  const ordenes = fd.getAll("ordenes").map(String).filter(Boolean);
  await llamarFactura(fd, "ligar_factura_ordenes", { p_factura: texto(fd, "id"), p_ordenes: ordenes },
    ordenes.length ? "Factura ligada a sus órdenes." : "La factura quedó sin orden.");
}
export async function asignarDestino(fd: FormData) {
  const s = texto(fd, "sucursal_id");
  await llamarFactura(fd, "asignar_destino_factura", { p_factura: texto(fd, "id"), p_sucursal: s === "oficina" || !s ? null : s }, "Destino guardado.");
}
export async function asignarCuentaFactura(fd: FormData) {
  await llamarFactura(fd, "asignar_cuenta_factura", { p_factura: texto(fd, "id"), p_cuenta: texto(fd, "cuenta_pl") }, "Cuenta del P&L guardada.");
}
export async function marcarRevisada(fd: FormData) {
  await llamarFactura(fd, "marcar_factura_revisada", { p_id: texto(fd, "id"), p_nota: texto(fd, "nota") }, "Factura marcada como revisada.");
}
export async function cambiarVencimientoFactura(fd: FormData) {
  await llamarFactura(fd, "cambiar_vencimiento", { p_id: texto(fd, "id"), p_fecha: texto(fd, "vence_el") || null }, "Vencimiento actualizado.");
}
export async function cancelarFacturaAccion(fd: FormData) {
  await llamarFactura(fd, "cancelar_factura", { p_id: texto(fd, "id"), p_motivo: texto(fd, "motivo") }, "Factura cancelada.");
}

export async function programarPagoFactura(fd: FormData) {
  await llamarFactura(fd, "programar_pago", { p_factura: texto(fd, "id"), p_fecha: texto(fd, "pago_programado_el") || null },
    texto(fd, "pago_programado_el") ? "Pago programado." : "Se quitó la fecha programada.");
}

const MAX_ADJUNTO = 4 * 1024 * 1024;
const EXTENSION: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

/** Gasto sin CFDI (prefactura, recibo): se guarda como factura "Sin CFDI" con sus renglones y su adjunto. */
export async function registrarGastoManual(fd: FormData) {
  const ruta = "/compras/facturas/nueva";
  const supabase = await clienteAdmin(ruta);
  const r = leerGastoManual((c) => String(fd.get(c) ?? ""), (c) => fd.getAll(c).map(String), [...CUENTAS_GASTO, ...CUENTAS_MEMO], hoyCalendarioMX());
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: GastoManual };
  let adjunto: string | null = null;
  const archivo = fd.get("adjunto");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_ADJUNTO) volver(ruta, "error", "El adjunto pesa más de 4 MB.");
    const ext = EXTENSION[archivo.type];
    if (!ext) volver(ruta, "error", "El adjunto debe ser PDF o foto.");
    adjunto = `manual/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(adjunto, archivo, { contentType: archivo.type, upsert: false });
    if (error) volver(ruta, "error", `No se pudo subir el adjunto: ${error.message}`);
  }
  const { data: id, error } = await supabase.rpc("registrar_gasto_manual", { p: { ...datos, adjunto } });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(`/compras/facturas/${id}`, "ok", "Gasto sin CFDI registrado. Cuando llegue el CFDI, súbelo y elige qué gasto sustituye.");
}

export async function guardarCuentasConceptos(fd: FormData) {
  const ids = fd.getAll("concepto_id").map(String), cuentas = fd.getAll("concepto_cuenta").map(String);
  await llamarFactura(fd, "asignar_cuentas_conceptos",
    { p_factura: texto(fd, "id"), p_cuentas: ids.map((id, i) => ({ id: Number(id), cuenta: cuentas[i] ?? "" })) }, "Cuentas guardadas.");
}

/** El CFDI sustituye al gasto sin CFDI elegido: sus pagos pasan al CFDI; avisa si los totales difieren por más de $1. */
export async function sustituirGastoManual(fd: FormData) {
  const id = texto(fd, "id"), manual = texto(fd, "manual_id");
  const supabase = await clienteAdmin(rutaFactura(id));
  if (!manual) volver(rutaFactura(id), "error", "Elige el gasto sin CFDI que sustituye.");
  const { data: totales } = await supabase.from("facturas").select("id, total").in("id", [id, manual]).returns<{ id: string; total: number }[]>();
  const { data: resultado, error } = await supabase.rpc("sustituir_factura_manual", { p_cfdi: id, p_manual: manual });
  if (error) volver(rutaFactura(id), "error", error.message);
  const t = new Map((totales ?? []).map((x) => [x.id, Number(x.total)]));
  const diferencia = Math.abs((t.get(id) ?? 0) - (t.get(manual) ?? 0));
  revalidatePath("/compras", "layout");
  volver(rutaFactura(id), "ok", `Sustituyó al gasto sin CFDI; sus pagos pasaron a esta factura.`
    + `${diferencia > 1 ? ` Ojo: los totales difieren por ${pesos(diferencia)}.` : ""}`
    + `${resultado?.sucursal_cambio ? " Se dejó la sucursal que elegiste en el gasto sin CFDI." : ""}`
    + `${resultado?.faltan_cuentas ? " Revisa la cuenta de cada concepto (el gasto tenía varias o renglones sin cuenta)." : ""}`);
}

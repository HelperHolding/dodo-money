"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { leerConstancia, regimenPropuesto } from "@/lib/compras/constancia";
import { REGIMENES } from "@/lib/compras/proveedores";
import { armarConceptos } from "@/lib/facturacion/conceptos";
import { CORREO_FACTURACION, mensajeBusqueda, validarDatosFiscales, type PagoPedido, type ResultadoBusqueda } from "@/lib/facturacion/reglas";
import { timbrarTicket } from "@/lib/facturacion/timbrar";
import { baseFacturacion, facturapi, sucursalFacturacion } from "@/lib/facturacion/servidor";

export type Ticket = { pedido: string; fecha: string; hora: string; total: number; pago: PagoPedido; productos: { nombre: string; precio: number }[] };
export type EstadoBusqueda = { error?: string; ticket?: Ticket; facturado?: { factura: string; correo: string } };
export type EstadoFactura = { error?: string; listo?: { id: string; token: string; uuid: string }; procesando?: boolean; facturado?: { factura: string; correo: string } };

const FALLA = `No pudimos completar la solicitud. Intenta de nuevo en unos minutos o escríbenos a ${CORREO_FACTURACION}.`;
const MAX_CONSTANCIA = 1024 * 1024;

const ipHash = async () => {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconocida";
  return createHash("sha256").update(`facturar|${ip}`).digest("hex");
};

export async function buscarTicket(_: EstadoBusqueda, fd: FormData): Promise<EstadoBusqueda> {
  try {
    const fecha = String(fd.get("fecha") ?? ""), hora = String(fd.get("hora") ?? ""), total = Number(String(fd.get("total") ?? "").replace(/[$,\s]/g, ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora) || !(total > 0)) return { error: "Escribe la fecha, la hora y el total del ticket." };
    const sucursal = await sucursalFacturacion();
    const { data, error } = await crearClienteAdmin().rpc("facturacion_buscar_ticket", { p_ip: await ipHash(), p_sucursal: sucursal.id, p_fecha: fecha, p_hora: hora, p_total: total });
    if (error) {
      console.error("facturar:", error);
      return { error: `No pudimos buscar el ticket. Intenta de nuevo o escríbenos a ${CORREO_FACTURACION}.` };
    }
    const r = (data as { resultado: ResultadoBusqueda; pedido_id: string; fecha: string; hora: string; total: number; pago: PagoPedido; productos: Ticket["productos"]; factura_id: string; correo: string }[] | null)?.[0];
    if (!r) return { error: FALLA };
    if (r.resultado === "facturado") return { facturado: { factura: r.factura_id, correo: r.correo } };
    if (r.resultado !== "ok") return { error: mensajeBusqueda(r.resultado) };
    return { ticket: { pedido: r.pedido_id, fecha: r.fecha, hora: r.hora.slice(0, 5), total: Number(r.total), pago: r.pago, productos: r.productos.map((p) => ({ nombre: p.nombre, precio: Number(p.precio) })) } };
  } catch (e) {
    console.error("facturar:", e);
    return { error: FALLA };
  }
}

export async function leerConstanciaCliente(fd: FormData): Promise<{ datos?: { rfc: string; nombre: string; codigo_postal: string | null; regimen: string | null }; error?: string }> {
  try {
    const a = fd.get("constancia");
    if (!(a instanceof File) || a.size === 0) return { error: "Elige el PDF de tu constancia." };
    if (a.size > MAX_CONSTANCIA) return { error: "La constancia pesa más de 1 MB." };
    const c = leerConstancia(new Uint8Array(await a.arrayBuffer()), REGIMENES);
    if ("error" in c) return { error: c.error };
    return { datos: { rfc: c.datos.rfc, nombre: c.datos.razon_social, codigo_postal: c.datos.codigo_postal, regimen: regimenPropuesto(c.datos) } };
  } catch (e) {
    console.error("facturar:", e);
    return { error: FALLA };
  }
}

/** Estado "ya facturado" con el correo enmascarado que regresa la búsqueda; sin él, solo el mensaje. */
async function yaFacturado(fd: FormData): Promise<EstadoFactura> {
  const b = await buscarTicket({}, fd);
  return b.facturado ? { facturado: b.facturado } : { error: "Este ticket ya se facturó." };
}

export async function facturar(_: EstadoFactura, fd: FormData): Promise<EstadoFactura> {
  try {
    // Se vuelve a buscar con los datos del ticket: el pedido nunca viene del navegador sin comprobar fecha, hora y total.
    const busqueda = await buscarTicket({}, fd);
    if (busqueda.facturado) return { facturado: busqueda.facturado };
    if (!busqueda.ticket) return { error: busqueda.error };
    const t = busqueda.ticket;
    const v = validarDatosFiscales(Object.fromEntries([...fd.entries()].map(([k, x]) => [k, String(x)])), t.pago, REGIMENES);
    if ("error" in v) return { error: v.error };
    const c = armarConceptos(t.productos, t.total);
    if ("error" in c) return { error: `${c.error} Escríbenos a ${CORREO_FACTURACION}.` };
    const r = await timbrarTicket({ base: baseFacturacion(), pac: facturapi(), ahora: Date.now }, t.pedido, v.datos, c.conceptos);
    switch (r.estado) {
      case "timbrada": {
        // Al recuperar una reserva atorada puede regresar una factura timbrada con datos de otra persona: no se entrega.
        const { data, error } = await crearClienteAdmin().from("facturas_clientes").select("rfc").eq("id", r.id).single();
        if (error) throw new Error(error.message);
        if (data.rfc !== v.datos.rfc) return await yaFacturado(fd);
        return { listo: { id: r.id, token: r.token, uuid: r.uuid } };
      }
      case "rechazada": return { error: `El SAT rechazó los datos: ${r.mensaje} Revisa que coincidan con tu constancia.` };
      case "procesando": return { procesando: true };
      case "ya_facturado": return await yaFacturado(fd);
      case "no_facturable": return { error: mensajeBusqueda(r.mensaje === "plazo" ? "fuera_de_plazo" : "no_facturable") };
    }
  } catch (e) {
    console.error("facturar:", e);
    return { error: FALLA };
  }
}

/** Reenvía al correo con que se facturó (nunca a uno nuevo): solo con fecha, hora y total del ticket. */
export async function reenviar(fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const b = await buscarTicket({}, fd);
    if (!b.facturado) return { error: "No encontramos una factura para este ticket." };
    const { data, error } = await crearClienteAdmin().from("facturas_clientes").select("facturapi_id, correo").eq("id", b.facturado.factura).eq("estado", "timbrada").single();
    if (error || !data) return { error: "No encontramos la factura." };
    const r = await facturapi().enviarCorreo(data.facturapi_id as string, data.correo as string);
    return r.ok ? { ok: true } : { error: "No pudimos reenviarla. Intenta más tarde." };
  } catch (e) {
    console.error("facturar:", e);
    return { error: FALLA };
  }
}

import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerFinanzas } from "@/lib/roles";
import { hojaFacturasClientes, type FilaFacturaCliente } from "@/lib/facturacion/excel";
import { escribirXlsx } from "@/lib/xlsx-escribir";
import { limitesMes } from "../mes";

export const dynamic = "force-dynamic";

/** Descarga el Excel del mes con las facturas de tickets, para el contador. */
export async function GET(request: Request) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) return new Response("Sin acceso.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const { mes, desde, hasta } = limitesMes(new URL(request.url).searchParams.get("mes") ?? undefined);
  const { data, error } = await supabase.from("facturas_clientes")
    .select("creada, pedido_id, rfc, nombre, subtotal, iva, total, uuid, estado, serie, folio")
    .gte("creada", desde).lt("creada", hasta).order("creada", { ascending: true });
  if (error) return new Response(error.message, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const archivo = escribirXlsx([hojaFacturasClientes((data ?? []) as FilaFacturaCliente[], mes)]);
  const nombre = `Facturas tickets ${mes}.xlsx`;
  return new Response(Buffer.from(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerFinanzas } from "@/lib/roles";
import { hoyCalendarioMX, fechaMX, hora } from "@/lib/formato";
import { cargarRetenciones } from "@/app/finanzas/retenciones/datos";
import { hojaRetenciones } from "@/lib/finanzas/retenciones";
import { escribirXlsx } from "@/lib/xlsx-escribir";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) return new Response("Sin permiso", { status: 403 });
  const mes = new URL(request.url).searchParams.get("mes") || "";
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return new Response("Mes inválido", { status: 400 });
  const meses = await cargarRetenciones(supabase, hoyCalendarioMX());
  const datos = meses.find((m) => m.mes === mes);
  if (!datos) return new Response("Mes sin datos", { status: 404 });
  const ahora = new Date().toISOString();
  const archivo = escribirXlsx(hojaRetenciones(datos, `${perfil.nombre} · ${fechaMX(ahora)} ${hora(ahora)}`));
  return new Response(Buffer.from(archivo), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="Retenciones ${mes}.xlsx"`, "Cache-Control": "no-store",
  } });
}

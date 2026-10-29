import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, hora, hoyMX } from "@/lib/formato";
import { puedeVerFinanzas } from "@/lib/roles";
import { SECCIONES_FLUJO } from "@/lib/finanzas/flujo";
import { hojaFlujo, hojaFlujoComparativo } from "@/lib/finanzas/excelFlujo";
import { escribirXlsx } from "@/lib/xlsx-escribir";
import { cargarFlujo } from "@/app/finanzas/flujo/datos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  const q = new URL(request.url).searchParams;
  const hoy = hoyMX();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get("mes") ?? "") && q.get("mes")! <= hoy.slice(0, 7) ? q.get("mes")! : hoy.slice(0, 7);
  const rfc = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(q.get("rfc") ?? "") ? q.get("rfc")! : null;
  const d = await cargarFlujo(supabase, rfc, mes, hoy);
  const ahora = new Date().toISOString();
  const generado = `${perfil.nombre} · ${fechaMX(ahora)} ${hora(ahora)}`;
  const titulo = rfc ?? "Todas las razones sociales";
  const archivo = escribirXlsx([
    ...hojaFlujo({ titulo, periodo: d.mes.etiqueta, generado, flujo: d.mes.flujo, secciones: SECCIONES_FLUJO, mostrar: d.mostrarMes }),
    ...hojaFlujoComparativo({ titulo, periodo: mes.slice(0, 4), generado, columnas: d.columnas, total: d.total, secciones: SECCIONES_FLUJO, mostrar: d.mostrarComparativo }),
  ]);
  const nombre = `Flujo de efectivo ${titulo} ${mes}.xlsx`;
  return new Response(Buffer.from(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

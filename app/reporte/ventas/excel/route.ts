import { datosReporteVentas } from "@/app/ventas/reporte-datos";
import { fechaMX, hora } from "@/lib/formato";
import { hojasVentas, nombreArchivo } from "@/lib/ventas/reporte";
import { escribirXlsx } from "@/lib/xlsx-escribir";

export const dynamic = "force-dynamic";

/** Descarga el reporte de ventas como .xlsx (hojas Resumen y Por día), con el periodo y la sucursal del tablero. */
export async function GET(request: Request) {
  const q = Object.fromEntries(new URL(request.url).searchParams) as { desde?: string; hasta?: string; sucursal?: string };
  const r = await datosReporteVentas(q);
  if (!r) return new Response("Aún no hay ventas importadas.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const ahora = new Date().toISOString();
  const archivo = escribirXlsx(hojasVentas({ ...r, generado: `${r.generadoPor} · ${fechaMX(ahora)} ${hora(ahora)}` }));
  const nombre = nombreArchivo(r.titulo, r.periodo);
  return new Response(Buffer.from(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Nombre con acentos: filename* en UTF-8, y uno sin acentos para navegadores viejos.
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

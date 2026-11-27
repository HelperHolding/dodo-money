import { datosReporteRappi, nombreArchivoRappi } from "@/app/ventas/rappi/reporte-datos";
import { fechaMX, hora } from "@/lib/formato";
import { hojasReporteRappi } from "@/lib/ventas/reporteRappi";
import { escribirXlsx } from "@/lib/xlsx-escribir";

export const dynamic = "force-dynamic";

/** Descarga las ventas Rappi como .xlsx (Resumen, Por día, Órdenes, Productos y Más vendidos), con el periodo y la sucursal de la página. */
export async function GET(request: Request) {
  const q = Object.fromEntries(new URL(request.url).searchParams) as { desde?: string; hasta?: string; sucursal?: string };
  const r = await datosReporteRappi(q);
  const ahora = new Date().toISOString();
  const archivo = escribirXlsx(hojasReporteRappi({
    titulo: r.titulo, desde: r.periodo.desde, hasta: r.periodo.hasta, generado: `${r.generadoPor} · ${fechaMX(ahora)} ${hora(ahora)}`, ordenes: r.ordenes,
  }));
  const nombre = nombreArchivoRappi(r.titulo, r.periodo);
  return new Response(Buffer.from(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Nombre con acentos: filename* en UTF-8, y uno sin acentos para navegadores viejos.
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

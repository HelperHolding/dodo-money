import { reportePL } from "@/app/finanzas/reporte-datos";
import { fechaMX, hora } from "@/lib/formato";
import { hojaPL } from "@/lib/finanzas/excel";
import { escribirXlsx } from "@/lib/xlsx-escribir";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = Object.fromEntries(new URL(request.url).searchParams) as { periodo?: string; mes?: string; semana?: string; sucursal?: string };
  const r = await reportePL(q);
  const ahora = new Date().toISOString();
  const archivo = escribirXlsx(hojaPL({
    titulo: r.titulo, periodo: r.periodo.titulo, generado: `${r.generadoPor} · ${fechaMX(ahora)} ${hora(ahora)}`,
    filas: r.filas, anterior: r.anterior, acumulado: r.acumulado, columnas: r.columnas,
  }));
  const nombre = `P&L ${r.titulo.replace(/[\\/:*?"<>|]/g, " ")} ${r.periodo.clave}.xlsx`;
  return new Response(Buffer.from(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

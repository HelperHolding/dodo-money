import { reportePL, type FiltrosPL } from "@/app/finanzas/reporte-datos";
import { fechaMX, hora } from "@/lib/formato";
import { hojaComparativo, hojaPL } from "@/lib/finanzas/excel";
import { PRESENTACION } from "@/lib/finanzas/secciones";
import { escribirXlsx } from "@/lib/xlsx-escribir";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = Object.fromEntries(new URL(request.url).searchParams) as FiltrosPL;
  const r = await reportePL(q, { meta: true, comparativo: true });
  const ahora = new Date().toISOString();
  const generado = `${r.generadoPor} · ${fechaMX(ahora)} ${hora(ahora)}`;
  const p = r.periodo;
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const archivo = escribirXlsx([
    ...hojaPL({
      titulo: r.titulo, periodo: `${p.titulo}${enCurso ? ` · hasta el ${p.hasta}` : ""}`, generado, filas: r.meta!.filas, entrada: r.meta!.entrada,
      anterior: r.meta!.anterior, acumulado: r.meta!.acumulado, columnas: r.meta!.columnas,
    }, PRESENTACION),
    ...hojaComparativo({ titulo: r.titulo, periodo: r.comp!.periodoTitulo, generado, columnas: r.comp!.columnas, total: r.comp!.total }, PRESENTACION),
  ]);
  const nombre = `P&L ${r.titulo.replace(/[\\/:*?"<>|]/g, " ")} ${p.clave}.xlsx`;
  return new Response(Buffer.from(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

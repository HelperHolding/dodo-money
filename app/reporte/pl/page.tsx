import { reportePL, type FiltrosPL } from "@/app/finanzas/reporte-datos";
import { TablaComparativo } from "@/app/finanzas/TablaComparativo";
import { TablaPL } from "@/app/finanzas/TablaPL";
import { fechaTexto } from "@/lib/formato";
import { EncabezadoReporte } from "../Encabezado";

export const dynamic = "force-dynamic";

/** P&L para imprimir o guardar como PDF: la misma vista, periodo y sucursal que la pantalla. */
export default async function ReportePLPdf({ searchParams }: { searchParams: Promise<FiltrosPL> }) {
  const q = await searchParams;
  const comparativo = q.vista === "comparativo";
  const r = await reportePL(q, { meta: !comparativo, comparativo });
  const p = r.periodo;
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const vacio = <p className="vacio">Todavía no hay días cerrados en este periodo.</p>;
  return (
    <main className={comparativo ? "pagina" : "pagina reporte-pl"}>
      <style>{comparativo ? "@page { size: landscape; }" : "@page { size: letter portrait; margin: 10mm; }"}</style>
      <EncabezadoReporte titulo={comparativo ? "P&L comparativo" : "P&L"} sucursal={r.titulo}
        detalle={r.comp ? `${r.comp.periodoTitulo} · venta neta sin IVA, después de descuentos; criterio devengado` : `${p.titulo}${enCurso ? ` · hasta el ${fechaTexto(p.hasta)}` : ""}`}
        generadoPor={r.generadoPor} />
      {r.comp ? (
        <>
          <p className="saldo-nota">Merma: productos terminados e insumos adicionales al BOM, sin IVA. Ambos descuentan del resultado; los importes parciales muestran un resultado provisional.</p>
          {r.comp.columnas.length ? <TablaComparativo columnas={r.comp.columnas} total={r.comp.total} /> : vacio}
        </>
      ) : r.meta && (p.vacio ? vacio : <TablaPL r={r.meta} columnas={r.meta.columnas} impresa />)}
    </main>
  );
}

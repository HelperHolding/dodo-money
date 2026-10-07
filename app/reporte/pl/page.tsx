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
    <main className="pagina">
      {comparativo && <style>{"@page { size: landscape; }"}</style>}
      <EncabezadoReporte titulo={comparativo ? "P&L comparativo" : "P&L"} sucursal={r.titulo}
        detalle={`${r.comp ? r.comp.periodoTitulo : `${p.titulo}${enCurso ? ` · hasta el ${fechaTexto(p.hasta)}` : ""}`} · venta bruta con IVA; resultado sin IVA, criterio devengado`}
        generadoPor={r.generadoPor} />
      <p className="saldo-nota">Merma: bajas de productos terminados. Insumos pendientes de separar del BOM; los importes parciales muestran un resultado provisional.</p>
      {r.comp ? (
        r.comp.columnas.length ? <TablaComparativo columnas={r.comp.columnas} total={r.comp.total} /> : vacio
      ) : r.meta && (p.vacio ? vacio : (
        <>
          {r.meta.avisos.length > 0 && <ul className="aviso aviso-error lista-simple">{r.meta.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          <TablaPL r={r.meta} columnas={r.meta.columnas} conDetalle={false} />
        </>
      ))}
    </main>
  );
}

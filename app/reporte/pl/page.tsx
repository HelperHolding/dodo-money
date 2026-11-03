import { reportePL, type FiltrosPL } from "@/app/finanzas/reporte-datos";
import { ListaAjustes } from "@/app/finanzas/ListaAjustes";
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
  const aj = r.meta?.ajustado ?? null;
  /** Sin ajustes en el periodo, siempre el real. */
  const modo = aj && (q.columnas === "ajustado" || q.columnas === "ambas") ? q.columnas : "real";
  const rotulo = modo === "ajustado" ? " · cifras ajustadas" : modo === "ambas" ? " · real y ajustado" : "";
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const vacio = <p className="vacio">Todavía no hay días cerrados en este periodo.</p>;
  return (
    <main className={comparativo ? "pagina" : "pagina reporte-pl"}>
      <style>{comparativo ? "@page { size: landscape; }" : "@page { size: letter portrait; margin: 10mm; }"}</style>
      <EncabezadoReporte titulo={comparativo ? "P&L comparativo" : "P&L"} sucursal={r.titulo}
        detalle={r.comp ? `${r.comp.periodoTitulo} · venta neta sin IVA, después de descuentos; criterio devengado` : `${p.titulo}${enCurso ? ` · hasta el ${fechaTexto(p.hasta)}` : ""}${rotulo}`}
        generadoPor={r.generadoPor} />
      {r.comp ? (
        <>
          <p className="saldo-nota">Merma: productos terminados e insumos adicionales al BOM, sin IVA. Ambos descuentan del resultado; los importes parciales muestran un resultado provisional.</p>
          {r.comp.columnas.length ? <TablaComparativo columnas={r.comp.columnas} total={r.comp.total} /> : vacio}
        </>
      ) : r.meta && (p.vacio ? vacio : (
        <>
          {modo === "ajustado"
            ? <TablaPL r={{ ...r.meta, filas: aj!.filas, entrada: aj!.entrada, anterior: r.meta.anteriorAjustado, acumulado: r.meta.acumuladoAjustado }}
                columnas={r.meta.columnas} impresa rotuloMonto="Ajustado" />
            : <TablaPL r={r.meta} columnas={r.meta.columnas} impresa ajustado={modo === "ambas" ? aj!.filas : null} sinHistoria={modo === "ambas"} />}
          {modo !== "real" && <ListaAjustes lista={aj!.lista} conSucursal={!r.meta.suc} impresa />}
        </>
      ))}
    </main>
  );
}

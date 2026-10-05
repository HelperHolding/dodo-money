import { reportePL } from "@/app/finanzas/reporte-datos";
import { fechaTexto, pesos, porcentaje } from "@/lib/formato";
import { EncabezadoReporte } from "../Encabezado";

export const dynamic = "force-dynamic";

/** P&L para imprimir o guardar como PDF: el mismo periodo y sucursal que la pantalla. */
export default async function ReportePLPdf({ searchParams }: { searchParams: Promise<{ periodo?: string; mes?: string; semana?: string; sucursal?: string }> }) {
  const r = await reportePL(await searchParams);
  const p = r.periodo;
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  return (
    <main className="pagina">
      <EncabezadoReporte titulo="P&L" sucursal={r.titulo} detalle={`${p.titulo}${enCurso ? ` · hasta el ${fechaTexto(p.hasta)}` : ""} · sin IVA, criterio devengado`} generadoPor={r.generadoPor} />
      {r.avisos.length > 0 && <ul className="aviso aviso-error lista-simple">{r.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
      {p.vacio ? <p className="vacio">Todavía no hay días cerrados en este periodo.</p> : (
      <section className="seccion">
        <div className="tabla-contenedor">
          <table className="tabla tabla-tarjetas">
            <thead><tr><th>Renglón</th><th>Real</th><th>%</th><th>Meta %</th><th>Diferencia</th><th>{r.columnas.anterior}</th><th>{r.columnas.acumulado}</th></tr></thead>
            <tbody>
              {r.filas.map((f) => (
                <tr key={f.clave} className={f.tipo === "total" ? "fila-total" : undefined}>
                  <td data-label="Renglón"><strong>{f.nombre}</strong></td>
                  <td data-label="Real" className="monto">{f.monto === null ? "Sin dato" : pesos(f.monto)}</td>
                  <td data-label="%" className="monto">{porcentaje(f.pct)}</td>
                  <td data-label="Meta %" className="monto">{porcentaje(f.metaPct)}</td>
                  <td data-label="Diferencia" className="monto">{f.diferencia === null ? "—" : pesos(f.diferencia)}</td>
                  <td data-label={r.columnas.anterior} className="monto">{r.anterior ? porcentaje(r.anterior.get(f.clave) ?? null) : "—"}</td>
                  <td data-label={r.columnas.acumulado} className="monto">{porcentaje(r.acumulado.get(f.clave) ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="tarjeta-datos">
          <dt>Descuentos (informativo)</dt><dd>{pesos(r.entrada.descuentos)}</dd>
          <dt>Compras de insumos (memo)</dt><dd>{pesos(r.entrada.memos.insumos)}</dd>
          <dt>Inversiones (memo)</dt><dd>{pesos(r.entrada.memos.inversiones)}</dd>
        </dl>
      </section>
      )}
    </main>
  );
}

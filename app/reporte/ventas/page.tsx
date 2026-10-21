import {GraficasReporteVentas} from "@/components/GraficasReporteVentas";
import { datosReporteVentas } from "@/app/ventas/reporte-datos";
import { fechaTexto, pesos, porcentaje } from "@/lib/formato";
import { totalesDias, type RenglonResumen } from "@/lib/ventas/reporte";
import { EncabezadoReporte } from "../Encabezado";
import { VentasPorCanal } from "@/components/VentasPorCanal";

export const dynamic = "force-dynamic";

const valor = (n: number | null, formato: RenglonResumen["formato"]) =>
  n === null ? "—" : formato === "pesos" ? pesos(n) : formato === "porcentaje" ? porcentaje(n) : n.toLocaleString("es-MX");

/** El costo cambia en puntos; lo demás, en porcentaje contra el periodo anterior. */
const cambio = (r: RenglonResumen) => {
  if (r.cambio === null) return "—";
  const signo = r.cambio > 0 ? "▲" : r.cambio < 0 ? "▼" : "";
  return r.formato === "porcentaje"
    ? `${signo} ${(Math.abs(r.cambio) * 100).toFixed(1)} pts`.trim()
    : `${signo} ${porcentaje(Math.abs(r.cambio))}`.trim();
};

/** Reporte de ventas para imprimir o guardar como PDF: el mismo periodo y sucursal que el tablero. */
export default async function ReporteVentasPdf({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }> }) {
  const r = await datosReporteVentas(await searchParams);
  if (!r) return <main className="pagina"><p className="vacio">Aún no hay ventas importadas.</p></main>;
  const t = totalesDias(r.dias);

  return (
    <main className="pagina">
      <EncabezadoReporte titulo="Reporte de ventas" sucursal={r.titulo}
        detalle={`${fechaTexto(r.periodo.desde)} a ${fechaTexto(r.periodo.hasta)} · ${r.dias.length} ${r.dias.length === 1 ? "día" : "días"} con datos`}
        generadoPor={r.generadoPor} />

      <VentasPorCanal canales={r.canales} detalle />
      <GraficasReporteVentas {...r.graficas} totalPeriodo={t.total}/>
      <section className="seccion">
        <h2>Resumen</h2>
        <div className="tabla-contenedor">
          <table className="tabla tabla-tarjetas">
            <thead><tr><th>Concepto</th><th>Periodo</th><th>Periodo anterior</th><th>Cambio</th></tr></thead>
            <tbody>
              {r.resumen.map((x) => (
                <tr key={x.concepto}>
                  <td data-label="Concepto"><strong>{x.concepto}</strong></td>
                  <td data-label="Periodo" className="monto">{valor(x.actual, x.formato)}</td>
                  <td data-label="Periodo anterior" className="monto">{valor(x.anterior, x.formato)}</td>
                  <td data-label="Cambio" className="monto">{cambio(x)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="seccion">
        <h2>Venta por día</h2>
        <div className="tabla-contenedor">
          <table className="tabla tabla-tarjetas">
            <thead><tr><th>Fecha</th><th>Pedidos</th><th>Venta total</th><th>Efectivo</th><th>Tarjeta</th><th>En línea</th><th>IVA</th><th>Ticket</th></tr></thead>
            <tbody>
              {r.dias.map((d) => (
                <tr key={d.fecha}>
                  <td data-label="Fecha">{fechaTexto(d.fecha)}</td>
                  <td data-label="Pedidos" className="monto">{d.pedidos}</td>
                  <td data-label="Venta total" className="monto">{pesos(d.total)}</td>
                  <td data-label="Efectivo" className="monto">{pesos(d.efectivo)}</td>
                  <td data-label="Tarjeta" className="monto">{pesos(d.tarjeta)}</td>
                  <td data-label="En línea" className="monto">{pesos(d.en_linea)}</td>
                  <td data-label="IVA" className="monto">{pesos(d.iva)}</td>
                  <td data-label="Ticket" className="monto">{d.ticket === null ? "—" : pesos(d.ticket)}</td>
                </tr>
              ))}
              <tr>
                <td data-label="Fecha"><strong>Total</strong></td>
                <td data-label="Pedidos" className="monto"><strong>{t.pedidos}</strong></td>
                <td data-label="Venta total" className="monto"><strong>{pesos(t.total)}</strong></td>
                <td data-label="Efectivo" className="monto"><strong>{pesos(t.efectivo)}</strong></td>
                <td data-label="Tarjeta" className="monto"><strong>{pesos(t.tarjeta)}</strong></td>
                <td data-label="En línea" className="monto"><strong>{pesos(t.en_linea)}</strong></td>
                <td data-label="IVA" className="monto"><strong>{pesos(t.iva)}</strong></td>
                <td data-label="Ticket" className="monto"><strong>{t.ticket === null ? "—" : pesos(t.ticket)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

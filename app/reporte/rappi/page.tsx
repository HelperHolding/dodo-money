import { BarrasReporte, COLOR_RAPPI, HorizontalesReporte, Leyenda } from "@/components/GraficasReporteRappi";
import estilos from "@/components/graficasReporteRappi.module.css";
import { datosReporteRappi } from "@/app/ventas/rappi/reporte-datos";
import { fechaTexto, pesos, porcentaje } from "@/lib/formato";
import { resumenReporteRappi } from "@/lib/ventas/reporteRappi";
import { EncabezadoReporte } from "../Encabezado";

export const dynamic = "force-dynamic";

const redondo = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
const COLOR_TIENDA = { Rappi: COLOR_RAPPI.naranja, "Rappi Turbo": COLOR_RAPPI.azul, "Dodo IS": COLOR_RAPPI.violeta } as const;

/** Reporte de Ventas → Rappi para imprimir o guardar como PDF: el mismo periodo y sucursal de la página. */
export default async function ReporteRappiPdf({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }> }) {
  const r = await datosReporteRappi(await searchParams);
  const s = resumenReporteRappi(r.ordenes), v = s.venta;
  const detalle = `${fechaTexto(r.periodo.desde)} a ${fechaTexto(r.periodo.hasta)} · ${s.dias.filter((d) => d.ordenes).length} días con órdenes`;
  const encabezado = <EncabezadoReporte titulo="Ventas Rappi" sucursal={r.titulo} detalle={detalle} generadoPor={r.generadoPor} />;
  if (!s.recibidas) return <main className="pagina">{encabezado}<p className="vacio">No llegaron órdenes del portal de Rappi en este periodo.</p></main>;

  const turbo = s.tiendas.find((t) => t.tienda === "Rappi Turbo");
  const conVenta = s.dias.filter((d) => d.ordenes), mejorDia = conVenta.length ? conVenta.reduce((a, b) => (b.subtotal > a.subtotal ? b : a)) : null;
  const mejorSemana = s.semana.reduce((a, b) => (b.subtotal > a.subtotal ? b : a)), pico = s.horas.length ? s.horas.reduce((a, b) => (b.subtotal > a.subtotal ? b : a)) : null;
  const unidades = s.productos.reduce((t, p) => t + p.unidades, 0);
  const todosEstados: [string, number, string][] = [["Cuentan en la venta", v.ordenes, COLOR_RAPPI.aqua], ["Incluidas en Dodo IS", s.noSuman, COLOR_RAPPI.azul],
    ["Canceladas", s.canceladas, COLOR_RAPPI.rosa], ["Con reclamo", s.conReclamo, COLOR_RAPPI.violeta]];
  const estados = todosEstados.filter(([, n]) => n > 0);
  const leyendaTiendas = s.tiendas.filter((t) => t.ordenes > 0).map((t): [string, string] => [t.tienda, COLOR_TIENDA[t.tienda]]);

  return (
    <main className="pagina">
      {encabezado}

      <div className="indicadores-marco"><section className="indicadores" aria-label="Resumen de Rappi">
        <div className="indicador"><span className="indicador-etiqueta">Venta Rappi</span><strong className="indicador-valor">{redondo(v.subtotal)}</strong><span className="indicador-detalle">Subtotal restaurante · {redondo(v.subtotal / 1.16)} sin IVA</span></div>
        <div className="indicador"><span className="indicador-etiqueta">Órdenes</span><strong className="indicador-valor">{v.ordenes}</strong><span className="indicador-detalle">de {s.recibidas} recibidas</span></div>
        <div className="indicador"><span className="indicador-etiqueta">Ticket promedio</span><strong className="indicador-valor">{pesos(v.ordenes ? v.subtotal / v.ordenes : 0)}</strong><span className="indicador-detalle">Subtotal entre órdenes</span></div>
        <div className="indicador"><span className="indicador-etiqueta">A facturar</span><strong className="indicador-valor">{redondo(v.facturar)}</strong><span className="indicador-detalle">Lo que pagó el cliente</span></div>
      </section></div>

      <section className="seccion">
        <h2>Lo más importante</h2>
        <ul className={estilos.hallazgos}>
          {mejorDia && <li>Mejor día: {fechaTexto(mejorDia.fecha)}, con {pesos(mejorDia.subtotal)} en {mejorDia.ordenes} órdenes. {mejorSemana.subtotal > 0 && <>El {mejorSemana.dia.toLowerCase()} es el día de la semana más fuerte ({redondo(mejorSemana.subtotal)}).</>}{pico && <> Hora pico: de {pico.hora}:00 a {pico.hora + 1}:00.</>}</li>}
          {v.bruto > 0 && <li>Descuentos: el restaurante cedió {porcentaje(v.descuento / v.bruto)} de la venta bruta y Rappi otro {porcentaje(v.descuentoRappi / v.bruto)}.</li>}
          <li>Se cancelaron {s.canceladas} órdenes ({porcentaje(s.canceladas / s.recibidas)} de las recibidas), {pesos(s.subtotalCanceladas)} que no se vendieron, y {s.conReclamo} tuvieron reclamo ({pesos(s.subtotalReclamo)}).</li>
          {turbo && <li>Rappi Turbo: {turbo.ordenes} órdenes por {pesos(turbo.subtotal)} ({porcentaje(v.subtotal ? turbo.subtotal / v.subtotal : 0)} de la venta).</li>}
          {s.noSuman > 0 && <li>{s.noSuman} órdenes finalizadas del portal ya estaban incluidas en Dodo IS y no se suman otra vez.</li>}
        </ul>
      </section>

      <section className="seccion">
        <h2>Subtotal restaurante por día</h2>
        <BarrasReporte titulo="Subtotal restaurante por día, con IVA" barras={s.dias.map((d) => ({ clave: d.fecha, etiqueta: String(Number(d.fecha.slice(8))), valor: d.subtotal, parte: d.turbo,
          detalle: `${fechaTexto(d.fecha)}: ${pesos(d.subtotal)} · ${d.ordenes} órdenes${d.turbo ? ` · Turbo ${pesos(d.turbo)}` : ""}` }))} />
        {turbo && <Leyenda partes={[["Rappi", COLOR_RAPPI.naranja], ["Rappi Turbo", COLOR_RAPPI.azul]]} />}
      </section>

      <div className={estilos.dos}>
        <section className="seccion">
          <h2>De la venta bruta a lo facturado</h2>
          <HorizontalesReporte titulo="De la venta bruta a lo facturado" ancho={340} izq={132} valor={70} filas={[
            { nombre: "Venta bruta", valor: v.bruto, texto: redondo(v.bruto), color: COLOR_RAPPI.aqua },
            { nombre: "Descuento restaurante", valor: v.descuento, texto: `−${redondo(v.descuento)}`, color: COLOR_RAPPI.rosa },
            { nombre: "Subtotal restaurante", valor: v.subtotal, texto: redondo(v.subtotal), color: COLOR_RAPPI.naranja },
            { nombre: "Descuento Rappi", valor: v.descuentoRappi, texto: `−${redondo(v.descuentoRappi)}`, color: COLOR_RAPPI.rosa },
            { nombre: "A facturar", valor: v.facturar, texto: redondo(v.facturar), color: COLOR_RAPPI.aqua }]} />
        </section>
        <section className="seccion">
          <h2>Estado de las órdenes</h2>
          <div className={estilos.estados}>{estados.map(([nombre, n, color]) => <div key={nombre} style={{ width: `${(n / s.recibidas) * 100}%`, background: color }} />)}</div>
          <table className="tabla"><tbody>
            {estados.map(([nombre, n, color]) => <tr key={nombre}><td><Leyenda partes={[[nombre, color]]} /></td><td className="monto">{n}</td><td className="monto">{porcentaje(n / s.recibidas)}</td></tr>)}
            <tr><td><strong>Recibidas</strong></td><td className="monto"><strong>{s.recibidas}</strong></td><td className="monto">100.0 %</td></tr>
          </tbody></table>
        </section>
      </div>

      <div className={estilos.dos}>
        <section className="seccion">
          <h2>Por día de la semana</h2>
          <BarrasReporte titulo="Subtotal por día de la semana" ancho={340} alto={170} color={COLOR_RAPPI.violeta}
            barras={s.semana.map((d) => ({ clave: d.dia, etiqueta: d.dia.slice(0, 3), valor: d.subtotal, parte: d.turbo, detalle: `${d.dia}: ${pesos(d.subtotal)} · ${d.ordenes} órdenes` }))} />
        </section>
        <section className="seccion">
          <h2>Por hora del día</h2>
          <BarrasReporte titulo="Subtotal por hora" ancho={340} alto={170} color={COLOR_RAPPI.aqua}
            barras={s.horas.map((h) => ({ clave: String(h.hora), etiqueta: String(h.hora), valor: h.subtotal, detalle: `${h.hora}:00: ${pesos(h.subtotal)} · ${h.ordenes} órdenes` }))} />
        </section>
      </div>

      <section className="seccion">
        <h2>Productos más vendidos</h2>
        <HorizontalesReporte titulo="Productos más vendidos por unidades" filas={s.productos.slice(0, 10).map((p, i) => ({
          nombre: p.nombre, valor: p.unidades, texto: `${p.unidades} uds. · ${porcentaje(unidades ? p.unidades / unidades : 0)}`, color: i < 3 ? COLOR_RAPPI.naranja : COLOR_RAPPI.azul }))} />
        <p className="saldo-nota">{unidades} unidades en las órdenes que cuentan. Los combos cuentan como un producto.</p>
      </section>

      <div className={estilos.dos}>
        <section className="seccion">
          <h2>Resumen</h2>
          <table className="tabla"><tbody>
            <tr><td>Venta bruta</td><td className="monto">{pesos(v.bruto)}</td></tr>
            <tr><td>Descuento restaurante</td><td className="monto">−{pesos(v.descuento)}</td></tr>
            <tr><td><strong>Subtotal restaurante</strong></td><td className="monto"><strong>{pesos(v.subtotal)}</strong></td></tr>
            <tr><td>Descuento Rappi</td><td className="monto">−{pesos(v.descuentoRappi)}</td></tr>
            <tr><td>A facturar</td><td className="monto">{pesos(v.facturar)}</td></tr>
            <tr><td>Subtotal sin IVA</td><td className="monto">{pesos(Math.round((v.subtotal / 1.16) * 100) / 100)}</td></tr>
            {s.tiendas.map((t) => <tr key={t.tienda}><td><Leyenda partes={[[`${t.tienda} · ${t.ordenes} órdenes`, COLOR_TIENDA[t.tienda]]]} /></td><td className="monto">{pesos(t.subtotal)}</td></tr>)}
          </tbody></table>
          {leyendaTiendas.length > 2 && <p className="saldo-nota">«Dodo IS» son pedidos de agregador capturados en Dodo IS: su importe es lo que pagó el cliente y Dodo IS no distingue Turbo.</p>}
        </section>
        <section className="seccion">
          <h2>Cómo pagaron</h2>
          <table className="tabla"><tbody>
            {s.pagos.slice(0, 8).map((p) => <tr key={p.pago}><td>{p.pago}</td><td className="monto">{p.ordenes}</td><td className="monto">{porcentaje(v.ordenes ? p.ordenes / v.ordenes : 0)}</td></tr>)}
          </tbody></table>
        </section>
      </div>

      <section className="seccion">
        <p className="saldo-nota">Importes con IVA. Fuente: órdenes en vivo del portal de Rappi guardadas en Dodo MX. Subtotal restaurante = venta bruta menos el descuento del restaurante: es la venta Rappi de Ventas y del P&L; el descuento de Rappi no resta a esa venta. No incluye la liquidación del reporte financiero (comisión, retenciones y depósitos), que está en Banca → Rappi y en el P&L. El detalle de cada orden está en el Excel.</p>
      </section>
    </main>
  );
}

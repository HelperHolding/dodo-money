import { redirect } from "next/navigation";
import { BarrasHorizontales, type FilaBarra } from "@/components/BarrasHorizontales";
import { BarrasLinea } from "@/components/BarrasLinea";
import { BarrasVerticales } from "@/components/BarrasVerticales";
import { Dona, type ParteDona } from "@/components/Dona";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { FiltrosBI } from "@/components/FiltrosBI";
import { LineasAnios, type SerieAnio } from "@/components/LineasAnios";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaConAnio, fechaTexto, hoyCalendarioMX, pesos, porcentaje } from "@/lib/formato";
import { veVentasDeTodas } from "@/lib/roles";
import { leerFiltrosBI, mezclarCategorias } from "@/lib/ventas/bi";
import { clavePago, MES_CORTO, nombre, NOMBRE_CANAL, NOMBRE_CATEGORIA_BI, NOMBRE_DIA, NOMBRE_ORIGEN, NOMBRE_PAGO } from "@/lib/ventas/biNombres";
import { cambioRelativo } from "@/lib/ventas/tablero";
import { Kpis, Medidores, Ranking, type Kpi } from "./Bloques";
import { datosBI } from "./datos";

const n = (x: unknown) => Number(x ?? 0);
const dividir = (a: number, b: number) => (b > 0 ? a / b : null);
const tickets = (t: number) => `${t.toLocaleString("es-MX")} ${t === 1 ? "ticket" : "tickets"}`;

/** Partes de una dona con su porcentaje del total en el detalle. */
function partes(filas: { clave: string; etiqueta: string; valor: number }[]): ParteDona[] {
  const total = filas.reduce((s, f) => s + Math.max(0, f.valor), 0);
  return filas.map((f) => ({ ...f, detalle: `${pesos(f.valor)} · ${porcentaje(total > 0 ? f.valor / total : null)}` }));
}

function Bloque({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: React.ReactNode }) {
  return <section className="seccion bi-bloque"><h2>{titulo}</h2>{children}{nota && <p className="bi-nota">{nota}</p>}</section>;
}

export default async function VentasBI({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!veVentasDeTodas(perfil.rol)) redirect("/ventas");
  const hoy = hoyCalendarioMX(), f = leerFiltrosBI(await searchParams, hoy);
  const [{ data: sucursales }, { data: razones }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre"), supabase.from("razones_sociales").select("rfc, razon_social").eq("activa", true).order("razon_social")]);
  const listaSuc = (sucursales ?? []) as { id: string; nombre: string }[];
  const nombreSuc = new Map(listaSuc.map((s) => [s.id, s.nombre]));
  const { actual, anterior, historico, comp, pe, meta, parcial } = await datosBI(supabase, f, hoy);

  // 1. KPIs: ticket = ventas ÷ tickets; UPT = productos ÷ tickets.
  const k = (r: typeof actual) => {
    const ventas = n(r?.kpis?.ventas), t = n(r?.kpis?.tickets), productos = n(r?.kpis?.productos);
    return { ventas, tickets: t, productos, ticket: dividir(ventas, t), upt: dividir(productos, t) };
  };
  const a = k(actual), b = k(anterior);
  const cambio = (x: number | null, y: number | null) => (x === null ? null : cambioRelativo(x, y));
  const kpis: Kpi[] = [
    { clave: "ventas", etiqueta: "Ventas netas", valor: pesos(a.ventas), cambio: cambio(a.ventas, b.ventas), detalle: "Sin IVA" },
    { clave: "ticket", etiqueta: "Ticket promedio", valor: a.ticket === null ? "—" : pesos(a.ticket), cambio: cambio(a.ticket, b.ticket) },
    { clave: "tickets", etiqueta: "# de tickets", valor: a.tickets.toLocaleString("es-MX"), cambio: cambio(a.tickets, b.tickets) },
    { clave: "upt", etiqueta: "Promedio UPT", valor: a.upt === null ? "—" : a.upt.toFixed(2), cambio: cambio(a.upt, b.upt), detalle: "Productos por ticket" },
    { clave: "productos", etiqueta: "Total de productos", valor: a.productos.toLocaleString("es-MX"), cambio: cambio(a.productos, b.productos) },
  ];

  // 2. Medidores: sin P.E. de ninguna sucursal, sin meta capturada o con filtros que parten la venta, el medidor dice
  // «Sin dato» en lugar de 0. La venta de cada medidor es la de las sucursales que forman su objetivo.
  const faltanMeta = new Map<string, string[]>();
  for (const x of meta.faltan) faltanMeta.set(x.mes.slice(0, 7), [...(faltanMeta.get(x.mes.slice(0, 7)) ?? []), nombreSuc.get(x.sucursal_id) ?? x.sucursal_id]);

  // 3. Donas.
  const categorias = partes(mezclarCategorias(actual.categorias ?? [], actual.rappi_nombres ?? [])
    .map((c) => ({ clave: c.categoria, etiqueta: nombre(NOMBRE_CATEGORIA_BI, c.categoria), valor: c.ventas })));
  const canales = partes((actual.canales ?? []).map((c) => ({ clave: c.canal, etiqueta: nombre(NOMBRE_CANAL, c.canal), valor: n(c.ventas) })));
  const origenes = partes((actual.origenes ?? []).map((o) => ({ clave: o.origen, etiqueta: nombre(NOMBRE_ORIGEN, o.origen), valor: n(o.ventas) })));
  const pagos = partes((actual.pagos ?? []).map((p) => ({ clave: clavePago(p.pago), etiqueta: nombre(NOMBRE_PAGO, p.pago), valor: n(p.ventas) })));

  // 4–7. Semanas, pago por sucursal, día y hora.
  const semanas = (actual.semanas ?? []).map((s) => ({ clave: s.semana, rotulo: fechaTexto(s.semana), barra: n(s.ventas), linea: n(s.tickets), detalle: `semana del ${fechaTexto(s.semana)}` }));
  const porSucursal = new Map<string, FilaBarra>();
  for (const x of actual.pagos_sucursal ?? []) {
    const fila = porSucursal.get(x.sucursal_id) ?? { clave: x.sucursal_id, etiqueta: nombreSuc.get(x.sucursal_id) ?? "Sucursal", valor: 0, detalle: "", partes: [] };
    fila.valor += n(x.ventas); fila.partes!.push({ clave: clavePago(x.pago), valor: n(x.ventas) });
    porSucursal.set(x.sucursal_id, fila);
  }
  const pagosSucursal = [...porSucursal.values()].map((x) => ({ ...x, detalle: pesos(x.valor) })).sort((x, y) => y.valor - x.valor);
  const pagosEnSucursal = [...new Set((actual.pagos_sucursal ?? []).map((x) => x.pago))];
  const dias: FilaBarra[] = (actual.dias ?? []).map((d) => ({ clave: String(d.dia), etiqueta: NOMBRE_DIA[d.dia] ?? String(d.dia), valor: n(d.ventas), detalle: `${pesos(n(d.ventas))} · ${tickets(n(d.tickets))}` }));
  const horasDatos = new Map((actual.horas ?? []).map((h) => [Number(h.hora), h]));
  const horasClaves = [...horasDatos.keys()];
  const horas = horasClaves.length ? Array.from({ length: Math.max(...horasClaves) - Math.min(...horasClaves) + 1 }, (_, i) => {
    const h = Math.min(...horasClaves) + i, x = horasDatos.get(h);
    return { clave: String(h), rotulo: String(h), valor: n(x?.ventas), detalle: `${h}:00–${h}:59 · ${pesos(n(x?.ventas))} · ${tickets(n(x?.tickets))}` };
  }) : [];

  // 9–10. Históricos (otra base: ventas_dia + Rappi).
  const porAnio = (filas: { anio: number; clave: number; ventas: number }[]): SerieAnio[] => {
    const m = new Map<number, Record<number, number>>();
    for (const x of filas) m.set(x.anio, { ...(m.get(x.anio) ?? {}), [x.clave]: x.ventas });
    return [...m].map(([anio, valores]) => ({ anio, valores }));
  };
  const histSemanas = porAnio((historico?.semanas ?? []).map((x) => ({ anio: x.anio, clave: x.semana, ventas: n(x.ventas) })));
  const histMeses = porAnio((historico?.meses ?? []).map((x) => ({ anio: x.anio, clave: x.mes, ventas: n(x.ventas) })));
  const notaHistorico = "Históricos: solo respetan sucursal, razón social, antigüedad y canal (vienen de la venta diaria y de Rappi, no de los pedidos).";

  const textoComp = f.comp === "anio" ? "mismas fechas del año pasado" : "periodo anterior";
  return (
    <>
      <EncabezadoPagina titulo="Ventas BI"
        descripcion={`${fechaConAnio(f.desde)} – ${fechaConAnio(f.hasta)} · contra ${textoComp} (${fechaConAnio(comp.desde)} – ${fechaConAnio(comp.hasta)})`}
        info="Tablero de análisis de ventas de Dodo IS y Rappi, sin IVA. Los filtros se guardan en la dirección para compartir la vista." />
      <FiltrosBI filtros={f} hoy={hoy} sucursales={listaSuc} razones={(razones ?? []) as { rfc: string; razon_social: string }[]}>
        {f.cat.length > 0 && <p className="aviso aviso-info">Las órdenes del portal de Rappi no traen categoría: quedan fuera mientras haya filtro de categoría (Rappi capturado en Dodo IS sí entra).</p>}
        {(f.cat.length > 0 || f.prod) && <p className="aviso aviso-info">Se cuentan solo las líneas de esos productos (no el pedido entero) en los pedidos que los contienen.</p>}

        <Kpis lista={kpis} />

        {parcial && <p className="aviso aviso-info">Con filtros de canal, día, hora, pago, producto… la venta es solo una parte; el P.E. y la meta son mensuales completos.</p>}
        <Medidores
          pe={{ titulo: "Venta vs P.E.", venta: pe.venta, objetivo: pe.objetivo, nombreObjetivo: "P.E.", medidor: "P.E. vs Venta %", diferencia: "Diferencia contra P.E.",
            aviso: parcial ? null : pe.error ? `No se pudo calcular el P&L de ${pe.mesCerrado}; el punto de equilibrio no está disponible.` : pe.sinPE.length ? `Sin P&L cerrado con costos fijos de ${pe.mesCerrado} (no entran al P.E. ni a su venta): ${pe.sinPE.map((id) => nombreSuc.get(id) ?? id).join(", ")}.` : null }}
          meta={{ titulo: "Venta vs Meta", venta: meta.venta, objetivo: meta.objetivo, nombreObjetivo: "Meta", medidor: "Cumplimiento de meta %", diferencia: "Diferencia contra meta",
            aviso: !parcial && meta.error ? "No se pudieron leer las metas de venta; la meta no está disponible." : null,
            faltan: parcial ? [] : [...faltanMeta].map(([mes, sucs]) => ({ mes, sucursales: sucs })) }} />

        <div className="bi-fila bi-fila-3">
          <Bloque titulo="Ventas por categoría"><Dona titulo="Ventas por categoría" partes={categorias} /></Bloque>
          <Bloque titulo="Ventas por canal"><Dona titulo="Ventas por canal" partes={canales} /></Bloque>
          <Bloque titulo="Ventas por origen"><Dona titulo="Ventas por origen" partes={origenes} /></Bloque>
        </div>

        <Bloque titulo="Ventas vs transacciones por semana" nota="Barras: venta sin IVA (eje izquierdo). Línea: tickets (eje derecho). Semanas de lunes a domingo.">
          <BarrasLinea titulo="Ventas vs transacciones por semana" puntos={semanas} />
        </Bloque>

        <div className="bi-fila">
          <Bloque titulo="Método de pago"><Dona titulo="Método de pago" partes={pagos} /></Bloque>
          <Bloque titulo="Método de pago por sucursal">
            <BarrasHorizontales titulo="Método de pago por sucursal" filas={pagosSucursal} />
            {pagosEnSucursal.length > 0 && <ul className="bi-leyenda">
              {pagosEnSucursal.map((p) => <li key={p}><span className={`dona-punto cat-${clavePago(p)}`} aria-hidden="true" />{nombre(NOMBRE_PAGO, p)}</li>)}
            </ul>}
          </Bloque>
        </div>

        <div className="bi-fila">
          <Bloque titulo="Venta por día de la semana"><BarrasHorizontales titulo="Venta por día de la semana" filas={dias} /></Bloque>
          <Bloque titulo="Venta por hora">
            {horas.length ? <BarrasVerticales titulo="Venta por hora" dias={horas} /> : <p className="vacio">Sin datos en el periodo.</p>}
          </Bloque>
        </div>

        <Bloque titulo="Ranking de productos" nota="Los 20 productos con más venta (sin IVA) del periodo; el cambio es contra la comparación.">
          <Ranking productos={actual.productos ?? []} anteriores={anterior.productos ?? []} total={a.ventas} />
        </Bloque>

        <Bloque titulo="Ventas por semana (comparando años)" nota={notaHistorico}>
          <LineasAnios titulo="Ventas por semana" series={histSemanas} eje={{ desde: 1, hasta: 53, rotulo: (x) => `S${x}` }} />
        </Bloque>
        <Bloque titulo="Ventas por mes y año" nota={notaHistorico}>
          <LineasAnios titulo="Ventas por mes y año" series={histMeses} eje={{ desde: 1, hasta: 12, rotulo: (x) => MES_CORTO[x] ?? String(x) }} />
        </Bloque>
      </FiltrosBI>
    </>
  );
}

import { BarraApilada } from "@/components/BarraApilada";
import { BarrasVerticales } from "@/components/BarrasVerticales";
import { ConInfo } from "@/components/ConInfo";
import { CurvaAcumulada, type PasoCurva } from "@/components/CurvaAcumulada";
import { Grafica } from "@/components/Grafica";
import { Cambio } from "@/components/Indicadores";
import { MapaCalor } from "@/components/MapaCalor";
import { TarjetaDetalle } from "@/components/TarjetaDetalle";
import { fechaTexto, pesos, pesosRedondos, porcentaje } from "@/lib/formato";
import { periodoAnterior, type Periodo } from "@/lib/ventas/calculos";
import { DIAS_SEMANA, ventaPorHora } from "@/lib/ventas/pedidos";
import { resumenPanelRappi, ventasRappi, type CatalogoRappi, type RappiGuardada } from "@/lib/ventas/rappi";
import { cambioRelativo, type Indicador } from "@/lib/ventas/tablero";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const hh = (n: number) => String(n).padStart(2, "0");
const ordenesTexto = (n: number) => `${n.toLocaleString("es-MX")} ${n === 1 ? "orden" : "órdenes"}`;
const fechasDe = (desde: string, hasta: string) => {
  const lista: string[] = [];
  for (let t = Date.parse(`${desde}T12:00:00Z`); t <= Date.parse(`${hasta}T12:00:00Z`); t += 86400000) lista.push(new Date(t).toISOString().slice(0, 10));
  return lista;
};
const sumaEntre = (m: Record<string, number>, desde: string, hasta: string) =>
  Object.entries(m).reduce((n, [f, v]) => (f >= desde && f <= hasta ? n + v : n), 0);
/** El cambio se lee como en el tablero de Ventas: verde si sube, rojo si baja. */
const comparado = (clave: Indicador["clave"], valor: number | null, antes: number | null): Indicador => {
  const cambio = valor === null ? null : cambioRelativo(valor, antes);
  return { clave, etiqueta: "", valor, cambio, unidad: "fraccion", favorable: cambio === null || cambio === 0 ? null : cambio > 0 };
};

/**
 * Tablero de Rappi en vivo: arriba las cuatro cifras del periodo (subtotal, órdenes, ticket y venta bruta) contra el
 * periodo anterior del mismo largo, y debajo la rejilla de gráficas del tablero de Ventas. `diario` es el subtotal y las
 * órdenes por día del calendario; con él se compara solo si el periodo anterior ya tenía órdenes en vivo.
 */
export function PanelRappi({ ordenes, catalogo, periodo, hoy, diario }: {
  ordenes: RappiGuardada[]; catalogo: readonly CatalogoRappi[]; periodo: Periodo; hoy: string;
  diario: { venta: Record<string, number>; ordenes: Record<string, number> };
}) {
  const r = resumenPanelRappi(ordenes);
  const sumadas = ordenes.filter((o) => o.estado === "Finalizado" && o.sumar);

  // Contra el periodo anterior: solo si las órdenes en vivo ya llegaban desde su primer día
  const anterior = periodoAnterior(periodo);
  const primerDia = Object.keys(diario.venta).sort()[0];
  const hayAnterior = primerDia !== undefined && primerDia <= anterior.desde;
  const antes = hayAnterior ? { total: sumaEntre(diario.venta, anterior.desde, anterior.hasta), ordenes: sumaEntre(diario.ordenes, anterior.desde, anterior.hasta) } : null;
  const kpi = {
    total: comparado("venta", r.total, antes?.total ?? null),
    ordenes: comparado("pedidos", r.cantidad, antes?.ordenes ?? null),
    ticket: comparado("ticket", r.ticket, antes?.ordenes ? antes.total / antes.ordenes : null),
  };
  const cambio = (i: Indicador) => (
    <span className="indicador-cambio" data-favorable={i.favorable === null ? undefined : i.favorable ? "si" : "no"} title="Contra el periodo anterior del mismo largo">
      <Cambio i={i} />
    </span>
  );

  // Por día (todo el periodo hasta hoy, también los días sin ventas) o, en un solo día, por hora
  const unDia = periodo.desde === periodo.hasta;
  const porDia = new Map(r.dias.map((d) => [d.fecha, d]));
  const horas = new Map<number, { total: number; ordenes: number }>();
  for (const o of sumadas) {
    const h = Number(o.hora.slice(0, 2)), x = horas.get(h) ?? { total: 0, ordenes: 0 };
    x.total = Math.round((x.total + Number(o.subtotal_restaurante)) * 100) / 100; x.ordenes++; horas.set(h, x);
  }
  const conHora = [...horas.keys()];
  const rangoHoras = conHora.length ? Array.from({ length: Math.max(...conHora) - Math.min(...conHora) + 1 }, (_, k) => Math.min(...conHora) + k) : [];
  const fechasPrevias = fechasDe(anterior.desde, anterior.hasta);
  const pasos: PasoCurva[] = !unDia
    ? fechasDe(periodo.desde, periodo.hasta).map((f, i) => ({
        clave: f, rotulo: String(Number(f.slice(8))), detalle: `Al ${fechaTexto(f)}`,
        actual: f > hoy ? null : porDia.get(f)?.total ?? 0, anterior: hayAnterior && fechasPrevias[i] ? diario.venta[fechasPrevias[i]] ?? 0 : null,
      }))
    : rangoHoras.map((h) => ({ clave: String(h), rotulo: `${hh(h)} h`, detalle: `Al cierre de ${hh(h)}:59`, actual: horas.get(h)?.total ?? 0, anterior: null }));
  const barras = !unDia
    ? fechasDe(periodo.desde, periodo.hasta < hoy ? periodo.hasta : hoy).map((f) => {
        const d = porDia.get(f);
        return { clave: f, rotulo: String(Number(f.slice(8))), valor: d?.total ?? 0,
          detalle: d ? `${fechaTexto(f)} · ${pesos(d.total)} · ${ordenesTexto(d.ordenes)} · ticket ${pesos(d.total / d.ordenes)}` : `${fechaTexto(f)} · sin ventas sumadas` };
      })
    : rangoHoras.map((h) => {
        const x = horas.get(h);
        return { clave: String(h), rotulo: `${hh(h)} h`, valor: x?.total ?? 0,
          detalle: x ? `${hh(h)}:00–${hh(h)}:59 · ${pesos(x.total)} · ${ordenesTexto(x.ordenes)}` : `${hh(h)}:00–${hh(h)}:59 · sin órdenes` };
      });

  const semana = DIAS.map((nombre, i) => {
    const delDia = r.dias.filter((d) => (new Date(`${d.fecha}T12:00:00Z`).getUTCDay() + 6) % 7 === i);
    const total = delDia.reduce((n, d) => n + d.total, 0), cuantas = delDia.reduce((n, d) => n + d.ordenes, 0);
    return { clave: String(i), etiqueta: nombre, valor: total, texto: cuantas ? `${pesos(total)} · ${ordenesTexto(cuantas)}` : "—" };
  });
  const hora = ventaPorHora(ventasRappi(ordenes, catalogo).pedidos);
  const facturar = Math.round((r.total - r.descuentoRappi) * 100) / 100;
  const estado = Object.fromEntries(r.estados.map((e) => [e.estado, e.cantidad]));
  const subtotalDe = (e: RappiGuardada["estado"]) =>
    Math.round(ordenes.filter((o) => o.estado === e).reduce((n, o) => n + Number(o.subtotal_restaurante), 0) * 100) / 100;

  return (
    <>
      <section className="tablero-pantalla rappi-pantalla" aria-label="Resumen del periodo">
        <div className="indicadores-marco">
          <div className="indicadores">
            <div className="indicador">
              <span className="indicador-etiqueta">Subtotal restaurante</span>
              <strong className="indicador-valor">{pesosRedondos(r.total)}</strong>
              {cambio(kpi.total)}
              <span className="indicador-detalle">Después del descuento restaurante · con IVA.</span>
            </div>
            <div className="indicador">
              <span className="indicador-etiqueta">Órdenes sumadas</span>
              <strong className="indicador-valor">{r.cantidad.toLocaleString("es-MX")}</strong>
              {cambio(kpi.ordenes)}
              <span className="indicador-detalle">{r.enDodo} finalizadas incluidas en Dodo IS, excluidas de estos importes.</span>
            </div>
            <div className="indicador">
              <span className="indicador-etiqueta">Ticket promedio</span>
              <strong className="indicador-valor">{r.ticket === null ? "—" : pesos(r.ticket)}</strong>
              {cambio(kpi.ticket)}
              <span className="indicador-detalle">Subtotal entre órdenes, después del descuento restaurante.</span>
            </div>
            <div className="indicador">
              <span className="indicador-etiqueta">Venta bruta sin descuentos</span>
              <strong className="indicador-valor">{pesosRedondos(r.bruto)}</strong>
              <span className="indicador-cambio">{porcentaje(r.bruto ? r.descuentoRestaurante / r.bruto : null)} de descuento restaurante</span>
              <span className="indicador-detalle">Importe de productos antes de cualquier descuento · con IVA</span>
            </div>
          </div>
        </div>
      </section>

      <div className="tablero-graficas"><div className="tablero-rejilla">
        {pasos.length > 1 && r.cantidad > 0 && (
          <section className="seccion tablero-ancha" aria-labelledby="r-acumulada">
            <div className="seccion-cabecera">
              <h2 id="r-acumulada">Subtotal acumulado</h2>
              <ConInfo titulo="Subtotal acumulado" etiqueta="Cómo leer esto">{unDia
                ? "Suma hora por hora del subtotal restaurante de las órdenes sumadas del día."
                : hayAnterior
                  ? "Suma día por día del subtotal restaurante contra los mismos días justo antes del periodo. Los días que aún no llegan no se dibujan."
                  : "Suma día por día del subtotal restaurante. Sin comparación: antes del periodo todavía no llegaban órdenes en vivo."}</ConInfo>
            </div>
            <CurvaAcumulada key={`${periodo.desde}|${periodo.hasta}`} titulo={unDia ? "Subtotal acumulado por hora" : "Subtotal acumulado por día"}
              pasos={pasos} actual={unDia ? "Este día" : "Este periodo"} anterior={unDia || !hayAnterior ? undefined : "Periodo anterior"} />
          </section>
        )}

        <TarjetaDetalle id="r-estado" titulo="Estado de las órdenes en vivo" resumen={ordenesTexto(ordenes.length)}>
          {ordenes.length ? (
            <BarraApilada titulo="Órdenes por estado" partes={[
              { clave: "fin", etiqueta: "Finalizado", valor: estado.Finalizado, detalle: ordenesTexto(estado.Finalizado), serie: "bien" },
              { clave: "can", etiqueta: "Cancelado", valor: estado.Cancelado, detalle: ordenesTexto(estado.Cancelado), serie: "mal" },
              { clave: "rec", etiqueta: "Con reclamo", valor: estado["Con reclamo"], detalle: ordenesTexto(estado["Con reclamo"]), serie: "aviso" },
            ]} />
          ) : <p className="vacio">No llegaron órdenes del portal en este periodo.</p>}
          {ordenes.length > 0 && (
            <dl className="mini-cifras rappi-perdidas">
              {(["Cancelado", "Con reclamo"] as const).map((e) => (
                <div key={e}>
                  <dt>{e === "Cancelado" ? "Canceladas" : "Con reclamo"}</dt>
                  <dd>{pesos(subtotalDe(e))}</dd>
                  <dd className="mini-nota">Subtotal de {ordenesTexto(estado[e])}; no suma a ventas</dd>
                </div>
              ))}
            </dl>
          )}
          <ConInfo titulo="Estado de las órdenes en vivo" etiqueta="Cómo leer esto">Incluye las que ya están en Dodo IS. Canceladas y con reclamo no suman a los indicadores de ventas.</ConInfo>
        </TarjetaDetalle>

        <section className="seccion tablero-ancha" aria-labelledby="r-diaria">
          <div className="seccion-cabecera">
            <h2 id="r-diaria">{unDia ? "Subtotal por hora" : "Subtotal por día"}</h2>
            <ConInfo titulo={unDia ? "Subtotal por hora" : "Subtotal por día"} etiqueta="Cómo leer esto">Solo órdenes finalizadas con fuente Rappi. Los días sin barras no recibieron ventas sumadas del portal.</ConInfo>
          </div>
          {r.dias.length ? (
            <BarrasVerticales key={`${periodo.desde}|${periodo.hasta}`} titulo={unDia ? "Subtotal por hora" : "Subtotal por día"} dias={barras} />
          ) : <p className="vacio">Sin ventas sumadas en este periodo.</p>}
        </section>

        <section className="seccion" aria-labelledby="r-semana">
          <div className="seccion-cabecera">
            <h2 id="r-semana">Por día de la semana</h2>
            <ConInfo titulo="Por día de la semana" etiqueta="Cómo leer esto">Subtotal restaurante del periodo sumado por día de la semana; los días que se repiten más veces en el periodo pesan más.</ConInfo>
          </div>
          {r.dias.length ? <Grafica titulo="Subtotal por día de la semana" barras={semana} /> : <p className="vacio">Sin ventas sumadas en este periodo.</p>}
        </section>

        <TarjetaDetalle ancho="doble" id="r-hora" titulo="Venta por hora" resumen={hora.pico ? `Pico ${DIAS_SEMANA[hora.pico.dia - 1]} ${hora.pico.hora} h` : "—"}>
          {hora.horaMin !== null && hora.horaMax !== null
            ? <MapaCalor celdas={hora.celdas} horaMin={hora.horaMin} horaMax={hora.horaMax} />
            : <p className="vacio">Sin ventas sumadas en este periodo.</p>}
          <ConInfo titulo="Venta por hora" etiqueta="Cómo leer esto">Subtotal restaurante de las órdenes sumadas, por día de la semana y hora en que llegó la orden.</ConInfo>
        </TarjetaDetalle>

        <TarjetaDetalle id="r-descuentos" titulo="Descuentos" resumen={pesosRedondos(r.descuentoRestaurante)}>
          <BarraApilada titulo="De la venta bruta al subtotal" partes={[
            { clave: "subtotal", etiqueta: "Subtotal restaurante", valor: r.total, detalle: pesos(r.total), serie: 1 },
            { clave: "descuento", etiqueta: "Descuento restaurante", valor: r.descuentoRestaurante, detalle: pesos(r.descuentoRestaurante), serie: "base" },
          ]} />
          <dl className="mini-cifras rappi-perdidas">
            <div>
              <dt>Descuento Rappi</dt>
              <dd>{pesos(r.descuentoRappi)}</dd>
              <dd className="mini-nota">Se conserva por separado; no resta al subtotal restaurante</dd>
            </div>
            <div>
              <dt>A facturar</dt>
              <dd>{pesos(facturar)}</dd>
              <dd className="mini-nota">Subtotal restaurante menos el descuento Rappi</dd>
            </div>
          </dl>
          <ConInfo titulo="Importes de Rappi" etiqueta="Cómo leer esto">Los importes corresponden a órdenes finalizadas marcadas para sumar desde Rappi, dentro del periodo y sucursal seleccionados. La venta bruta incluye IVA y no representa el depósito recibido.</ConInfo>
        </TarjetaDetalle>
      </div></div>
    </>
  );
}

/** Top 5 por unidades de las órdenes sumadas, con opciones y variantes separadas; va junto al ranking de unidades. */
export function MasVendidosRappi({ productos }: { productos: ReturnType<typeof resumenPanelRappi>["productos"] }) {
  return (
    <section className="seccion" aria-labelledby="r-opciones">
      <div className="seccion-cabecera">
        <h2 id="r-opciones">Productos más vendidos</h2>
        <ConInfo titulo="Productos más vendidos" etiqueta="Cómo leer esto">Top 5 por unidades en las órdenes sumadas; opciones y variantes separadas.</ConInfo>
      </div>
      {productos.length ? (
        <ol className="ranking rappi-ranking" aria-label="Productos más vendidos">
          {productos.map((p, i) => (
            <li key={p.nombre}>
              <span className="ranking-lugar" data-podio={i < 3 ? "si" : undefined}>{i + 1}</span>
              <div className="ranking-cuerpo">
                <p className="ranking-linea"><strong>{p.nombre}</strong><span className="ranking-importe">{p.cantidad} uds.</span></p>
                <span className="ranking-barra" aria-hidden="true"><span style={{ width: `${(p.cantidad / productos[0].cantidad) * 100}%` }} /></span>
                <p className="ranking-linea ranking-detalle"><span>{pesos(p.importe)}</span></p>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="vacio">Sin productos en órdenes sumadas.</p>}
    </section>
  );
}

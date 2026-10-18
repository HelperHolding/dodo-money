import Link from "next/link";
import { AvisoSinCosto } from "@/components/AvisoSinCosto";
import { BarrasVerticales } from "@/components/BarrasVerticales";
import { CalendarioVentas } from "@/components/CalendarioVentas";
import { Dona } from "@/components/Dona";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";
import { Grafica } from "@/components/Grafica";
import { Indicadores } from "@/components/Indicadores";
import { RankingProductos } from "@/components/RankingProductos";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { diaYNumero, fechaTexto, hoyMX, pesos, pesosRedondos, porcentaje } from "@/lib/formato";
import { puedeImportarVentas, veAvisoSinCosto, veVentasDeTodas } from "@/lib/roles";
import {
  costeo, descuentos, diasConCierre, MAX_DIAS, resumenSinCosto, NOMBRE_CATEGORIA, NOMBRE_TIPO, periodoAnterior, periodoElegido,
  periodoPorDefecto, porProducto, resumenVentas, separarDesglose, topProductos, ventaPorDia, type Categoria,
} from "@/lib/ventas/calculos";
import { indicadores } from "@/lib/ventas/tablero";
import { moverMes } from "@/lib/ventas/calendario";
import { datosPedidos, datosVentas, sucursalElegida, ultimoDiaConDatos, ventaDiariaDesde } from "./datos";
import { SeccionesPedidos } from "./SeccionesPedidos";
import { VentasPorCanal } from "@/components/VentasPorCanal";
import { reporteCanales } from "./reporte-datos";

const categoria = (c: Categoria | null) => (c ? NOMBRE_CATEGORIA[c] : "Sin categoría");

export default async function PaginaVentas({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }> }) {
  const q = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const todas = veVentasDeTodas(perfil.rol);
  // El aviso de productos sin costo lo ven admin y corporativo; asignar costos, solo el admin.
  const veAviso = veAvisoSinCosto(perfil.rol);
  const esAdmin = puedeImportarVentas(perfil.rol);

  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const nombreDe = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  const sucursal = sucursalElegida(todas, q.sucursal, perfil.sucursal_id, (id) => nombreDe.has(id));

  const ultimo = await ultimoDiaConDatos(supabase, sucursal);
  if (!ultimo) {
    return (
      <>
        <EncabezadoPagina titulo="Ventas" />
        <EstadoVacio titulo={`Aún no hay ventas importadas${sucursal ? ` de ${nombreDe.get(sucursal)}` : ""}`}
          descripcion="Cuando se importe el reporte de Dodo IS, aquí verás la venta, los pedidos y el costo del periodo."
          accion={puedeImportarVentas(perfil.rol) && <Link className="boton" href="/ventas/importar">Importar ventas</Link>} />
      </>
    );
  }

  const periodo = periodoElegido(q.desde, q.hasta, periodoPorDefecto(ultimo));
  const hoy = hoyMX();
  // El calendario trae 13 meses de venta diaria de una vez: cambiar de mes no vuelve a consultar.
  const inicioCalendario = moverMes({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) }, -12);
  const [d, ventaDiaria, detalle] = await Promise.all([
    datosVentas(supabase, sucursal, periodo, periodoAnterior(periodo)),
    ventaDiariaDesde(supabase, sucursal, `${inicioCalendario.anio}-${String(inicioCalendario.mes).padStart(2, "0")}-01`),
    datosPedidos(supabase, sucursal, periodo),
  ]);
  const resumen = resumenVentas(d.dias);
  const productos = porProducto(d.renglones);
  const costos = costeo(d.renglones);
  const desc = descuentos(productos);
  const previo = resumenVentas(d.anterior.dias);
  const costoPrevio = costeo(d.anterior.renglones);
  const kpis = indicadores(
    { total: resumen.total, pedidos: resumen.pedidos, ticket: resumen.ticket, costoPct: costos.total.costoPct },
    previo.dias ? { total: previo.total, pedidos: previo.pedidos, ticket: previo.ticket, costoPct: costoPrevio.total.costoPct } : null,
  );
  const top = topProductos(productos, porProducto(d.anterior.renglones));
  const porDia = ventaPorDia(d.dias);
  const tipos = separarDesglose(d.dias.flatMap((x) => x.ventas_dia_desglose));
  const cierre = diasConCierre(d.dias, d.cierres);
  const conDiferencia = cierre.comparados.filter((c) => c.alerta);
  const m2 = sucursal ? d.dias.filter((x) => x.venta_m2 !== null) : [];
  const mayorCosto = productos.filter((p) => p.costoPct !== null).sort((a, b) => (b.costoPct ?? 0) - (a.costoPct ?? 0)).slice(0, 5);
  const titulo = sucursal ? nombreDe.get(sucursal) : "Todas las sucursales";
  const filtroReporte = new URLSearchParams({ desde: periodo.desde, hasta: periodo.hasta, ...(sucursal ? { sucursal } : {}) }).toString();
  // Días importados con el formato anterior: tienen venta pero no pedidos.
  const conDetalle = new Set(detalle.pedidos.map((p) => `${p.sucursal_id}|${p.fecha}`));
  const diasSinDetalle = d.dias.filter((x) => !conDetalle.has(`${x.sucursal_id}|${x.fecha}`)).length;

  return (
    <>
      <EncabezadoPagina titulo="Ventas"
        descripcion={`${titulo} · ${resumen.dias} ${resumen.dias === 1 ? "día" : "días"} con datos`}
        acciones={<>
          <Link className="boton boton-secundario" href={`/reporte/ventas?${filtroReporte}`} target="_blank"><Icono nombre="documento" /> Reporte PDF</Link>
          <a className="boton boton-secundario" href={`/reporte/ventas/excel?${filtroReporte}`} download><Icono nombre="descargar" /> Descargar Excel</a>
        </>} />

      <CalendarioVentas key={`${periodo.desde}|${periodo.hasta}|${sucursal ?? ""}`} venta={ventaDiaria} periodo={periodo} hoy={hoy}
        maxDias={MAX_DIAS} sucursal={sucursal} sucursales={todas ? sucursales ?? [] : null} />

      <Indicadores lista={kpis} detalle={{
        venta: `Neta ${pesosRedondos(resumen.neta)} · IVA ${pesosRedondos(resumen.iva)}`,
        pedidos: `${resumen.dias} ${resumen.dias === 1 ? "día" : "días"}`,
        ticket: "Con IVA",
        costo: `${pesosRedondos(costos.total.costo)} sobre venta con costo`,
      }} />

      {conDiferencia.length > 0 && (
        <a className="atencion-tarjeta" data-tono="peligro" href="#cierre">
          <span className="atencion-icono"><Icono nombre="alerta" tamano={20} /></span>
          <span><strong>{conDiferencia.length} {conDiferencia.length === 1 ? "día no coincide" : "días no coinciden"} con el cierre del gerente</strong><small>Revisa el cierre contra Dodo IS</small></span>
          <Icono nombre="derecha" />
        </a>
      )}

      <div className="tablero-fila tablero-fila-ancha">
        <section className="seccion" aria-labelledby="t-diaria">
          <h2 id="t-diaria">Venta diaria</h2>
          <BarrasVerticales key={`${periodo.desde}|${periodo.hasta}|${sucursal ?? ""}`} titulo="Venta por día" dias={porDia.map((x) => ({
            clave: x.fecha, rotulo: diaYNumero(x.fecha), valor: x.total,
            detalle: `${fechaTexto(x.fecha)} · ${pesos(x.total)} · ${x.pedidos} pedidos`,
          }))} />
          {m2.length > 0 && (
            <p className="saldo-nota">Venta por m² de comedor: {pesos(m2.reduce((s, x) => s + Number(x.venta_m2), 0) / m2.length)} por día en promedio.</p>
          )}
        </section>
        <section className="seccion" aria-labelledby="t-mezcla">
          <h2 id="t-mezcla">Mezcla por categoría</h2>
          <Dona titulo="Mezcla por categoría" partes={costos.categorias.map((g) => ({
            clave: g.categoria ?? "sin", etiqueta: categoria(g.categoria), valor: g.importe,
            detalle: `${porcentaje(resumen.total ? g.importe / resumen.total : null)} · ${g.piezas} pzs`,
          }))} />
        </section>
      </div>

      <VentasPorCanal canales={reporteCanales(d.canales,d.anterior.canales)} />

      <div className="tablero-fila">
        <Plegable id="productos" titulo="Los 10 que más vendieron" resumen={`${productos.length} productos`}>
          <RankingProductos titulo="Productos que más vendieron" filas={top.map((p) => ({
            clave: String(p.dodo_id), nombre: p.nombre, importe: p.importe, piezas: p.piezas, cambio: p.cambio,
          }))} />
          <p className="saldo-nota">El cambio es contra los mismos días justo antes del periodo.</p>
        </Plegable>

        <Plegable id="costos" titulo="Costos" resumen={porcentaje(costos.total.costoPct)}
          insignia={veAviso && <AvisoSinCosto key="sin-costo" productos={costos.sinCosto} piezas={resumenSinCosto(costos.sinCosto).piezas} puedeAsignar={esAdmin} />}>
          <div className="costos-categorias">
            {costos.categorias.map((g) => (
              <div key={g.categoria ?? "sin"} className="costo-categoria">
                <span className={`dona-punto cat-${g.categoria ?? "sin"}`} aria-hidden="true" />
                <strong>{categoria(g.categoria)}</strong>
                <span>{porcentaje(g.costoPct)}</span>
                <span className="saldo-nota">{g.costoPromedio === null ? "sin costo" : `${pesos(g.costoPromedio)} por pieza`}</span>
              </div>
            ))}
          </div>
          {mayorCosto.length > 0 && (
            <>
              <h3>Mayor costo %</h3>
              <Grafica titulo="Productos con mayor costo %" barras={mayorCosto.map((p) => ({
                clave: String(p.dodo_id), etiqueta: p.nombre, valor: p.costoPct ?? 0, texto: porcentaje(p.costoPct),
              }))} />
            </>
          )}
        </Plegable>
      </div>

      <div className="tablero-fila">
        <Plegable id="descuentos" titulo="Descuentos" resumen={pesos(desc.total)}>
          <p>{pesos(desc.total)} de descuento sobre {pesos(desc.sinDescuento)} de precio de lista ({porcentaje(desc.pct)}).</p>
          {desc.top.length > 0 && (
            <Grafica titulo="Productos con más descuento" barras={desc.top.map((p) => ({
              clave: String(p.dodo_id), etiqueta: p.nombre, valor: p.descuento,
              texto: `${pesos(p.descuento)} (${porcentaje(p.sinDescuento ? p.descuento / p.sinDescuento : null)})`,
            }))} />
          )}
        </Plegable>

        <Plegable id="servicio" titulo="Servicio y forma de pago" resumen={`${tipos.servicio.length} tipos`}>
          <h3>Por tipo de servicio</h3>
          <Grafica titulo="Venta por tipo de servicio" barras={tipos.servicio.map((t) => ({
            clave: t.tipo, etiqueta: NOMBRE_TIPO[t.tipo], valor: t.total, texto: `${pesos(t.total)} · ${t.pedidos} ped.`,
          }))} />
          {tipos.origen.length > 0 && (
            <>
              <h3>Por origen del pedido</h3>
              <Grafica titulo="Venta por origen del pedido" barras={tipos.origen.map((t) => ({
                clave: t.tipo, etiqueta: NOMBRE_TIPO[t.tipo], valor: t.total, texto: `${pesos(t.total)} · ${t.pedidos} ped.`,
              }))} />
            </>
          )}
          <h3>Por forma de pago</h3>
          <Grafica titulo="Venta por forma de pago" barras={[
            { clave: "efectivo", etiqueta: "Efectivo", valor: resumen.efectivo, texto: pesos(resumen.efectivo) },
            { clave: "tarjeta", etiqueta: "Tarjeta", valor: resumen.tarjeta, texto: pesos(resumen.tarjeta) },
            { clave: "en_linea", etiqueta: "En línea", valor: resumen.en_linea, texto: pesos(resumen.en_linea) },
          ]} />
        </Plegable>
      </div>

      <Plegable id="cierre" titulo="Cierre contra Dodo IS" resumen={conDiferencia.length ? `${conDiferencia.length} con diferencia` : "Coinciden"}
        alerta={conDiferencia.length > 0}>
        {!cierre.comparados.length && <p className="vacio">Ningún día importado del periodo tiene cierre del gerente.</p>}
        {cierre.comparados.length > 0 && !conDiferencia.length && (
          <p className="aviso aviso-ok">Los {cierre.comparados.length} días con cierre coinciden con Dodo IS (diferencias de $1 o menos).</p>
        )}
        {conDiferencia.length > 0 && (
          <div className="tarjetas">
            {conDiferencia.map((c) => (
              <article key={`${c.sucursal_id}|${c.fecha}`} className="tarjeta" data-alerta="si">
                <h3>{nombreDe.get(c.sucursal_id)} · {fechaTexto(c.fecha)}</h3>
                <dl className="tarjeta-datos">
                  {c.filas.filter((f) => f.alerta).map((f) => (
                    <div key={f.concepto} style={{ display: "contents" }}>
                      <dt>{f.concepto}</dt>
                      <dd>
                        <span>Dodo IS {f.esPedido ? f.dodo : pesos(f.dodo)}</span>
                        <span>Cierre {f.esPedido ? f.cierre : pesos(f.cierre)}</span>
                        <span className="celda-alerta">Diferencia {f.esPedido ? f.diferencia : pesos(f.diferencia)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
        {cierre.sinCierre > 0 && <p className="saldo-nota">{cierre.sinCierre} {cierre.sinCierre === 1 ? "día importado no tiene" : "días importados no tienen"} cierre del gerente.</p>}
        <p className="saldo-nota">
          Dodo IS cuenta el día de 0:00 a 23:59 y el cierre de la app hasta las 4:00: las ventas después de medianoche
          pueden explicar una diferencia.
        </p>
      </Plegable>

      <SeccionesPedidos pedidos={detalle.pedidos} lineas={detalle.lineas} diasSinDetalle={diasSinDetalle} />
    </>
  );
}

import Link from "next/link";
import { Grafica } from "@/components/Grafica";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos, porcentaje } from "@/lib/formato";
import { puedeImportarVentas, veVentasDeTodas } from "@/lib/roles";
import {
  costeo, descuentos, diasConCierre, NOMBRE_CATEGORIA, NOMBRE_TIPO, periodoAnterior, periodoElegido,
  periodoPorDefecto, porProducto, resumenVentas, separarDesglose, topProductos, ventaPorDia, type Categoria,
} from "@/lib/ventas/calculos";
import { datosVentas, ultimoDiaConDatos } from "./datos";

const categoria = (c: Categoria | null) => (c ? NOMBRE_CATEGORIA[c] : "Sin categoría");
const cambio = (f: number | null) => (f === null ? "nuevo" : `${f >= 0 ? "▲" : "▼"} ${porcentaje(Math.abs(f))}`);

export default async function PaginaVentas({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }> }) {
  const q = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const todas = veVentasDeTodas(perfil.rol);

  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const nombreDe = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  // Gerente: siempre la suya (la base de datos tampoco le deja ver otra). Admin y corporativo: todas o una.
  const sucursal = todas ? (q.sucursal && nombreDe.has(q.sucursal) ? q.sucursal : null) : perfil.sucursal_id;

  const ultimo = await ultimoDiaConDatos(supabase, sucursal);
  if (!ultimo) {
    return (
      <>
        <div className="encabezado"><h1>Ventas</h1><p>Aún no hay ventas importadas{sucursal ? ` de ${nombreDe.get(sucursal)}` : ""}.</p></div>
        {puedeImportarVentas(perfil.rol) && <div className="acciones"><Link className="boton" href="/ventas/importar">Importar ventas</Link></div>}
      </>
    );
  }

  const periodo = periodoElegido(q.desde, q.hasta, periodoPorDefecto(ultimo));
  const d = await datosVentas(supabase, sucursal, periodo, periodoAnterior(periodo));
  const resumen = resumenVentas(d.dias);
  const productos = porProducto(d.renglones);
  const costos = costeo(d.renglones);
  const desc = descuentos(productos);
  const top = topProductos(productos, d.anterior);
  const porDia = ventaPorDia(d.dias);
  const tipos = separarDesglose(d.dias.flatMap((x) => x.ventas_dia_desglose));
  const cierre = diasConCierre(d.dias, d.cierres);
  const conDiferencia = cierre.comparados.filter((c) => c.alerta);
  const m2 = sucursal ? d.dias.filter((x) => x.venta_m2 !== null) : [];
  const mayorCosto = productos.filter((p) => p.costoPct !== null).sort((a, b) => (b.costoPct ?? 0) - (a.costoPct ?? 0)).slice(0, 5);
  const titulo = sucursal ? nombreDe.get(sucursal) : "Todas las sucursales";

  return (
    <>
      <div className="encabezado">
        <h1>Ventas</h1>
        <p>{titulo} · {fechaTexto(periodo.desde)} a {fechaTexto(periodo.hasta)} · {resumen.dias} {resumen.dias === 1 ? "día" : "días"} con datos</p>
      </div>

      <form className="acciones" method="get">
        {todas && (
          <>
            <label htmlFor="sucursal" className="etiqueta">Sucursal</label>
            <select id="sucursal" name="sucursal" defaultValue={sucursal ?? ""}>
              <option value="">Todas</option>
              {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </>
        )}
        <label htmlFor="desde" className="etiqueta">Desde</label>
        <input id="desde" name="desde" type="date" defaultValue={periodo.desde} />
        <label htmlFor="hasta" className="etiqueta">Hasta</label>
        <input id="hasta" name="hasta" type="date" defaultValue={periodo.hasta} />
        <button className="boton boton-secundario" type="submit">Ver</button>
      </form>

      <Plegable id="resumen" titulo="Resumen" resumen={pesos(resumen.total)}>
        <dl className="tarjeta-datos">
          <dt>Venta</dt>
          <dd><span>Total {pesos(resumen.total)}</span><span>Neta {pesos(resumen.neta)}</span><span>IVA {pesos(resumen.iva)}</span></dd>
          <dt>Pedidos</dt>
          <dd><span>{resumen.pedidos}</span><span>Ticket promedio {resumen.ticket === null ? "—" : pesos(resumen.ticket)}</span></dd>
          <dt>Descuentos</dt>
          <dd><span>{pesos(desc.total)}</span><span>{porcentaje(desc.pct)} del precio de lista</span></dd>
          <dt>Costo teórico</dt>
          <dd><span>{pesos(costos.total.costo)}</span><span>{porcentaje(costos.total.costoPct)} de la venta neta con costo</span></dd>
        </dl>
      </Plegable>

      <Plegable id="diaria" titulo="Venta diaria" resumen={`${porDia.length} ${porDia.length === 1 ? "día" : "días"}`}>
        <Grafica titulo="Venta por día" barras={porDia.map((x) => ({
          clave: x.fecha, etiqueta: fechaTexto(x.fecha), valor: x.total, texto: `${pesos(x.total)} · ${x.pedidos} ped.`,
        }))} />
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
        {m2.length > 0 && (
          <p>Venta por m² de comedor: {pesos(m2.reduce((s, x) => s + Number(x.venta_m2), 0) / m2.length)} por día en promedio.</p>
        )}
      </Plegable>

      <Plegable id="productos" titulo="Productos" resumen={`${productos.length} productos`}>
        <h3>Los 10 que más vendieron</h3>
        <Grafica titulo="Productos que más vendieron" barras={top.map((p) => ({
          clave: String(p.dodo_id), etiqueta: p.nombre, valor: p.importe,
          texto: `${pesos(p.importe)} · ${p.piezas} pzs · ${cambio(p.cambio)}`,
        }))} />
        <p className="saldo-nota">El cambio es contra los mismos días justo antes del periodo.</p>
        <h3>Mezcla por categoría</h3>
        <Grafica titulo="Mezcla por categoría" barras={costos.categorias.map((g) => ({
          clave: g.categoria ?? "sin", etiqueta: categoria(g.categoria), valor: g.importe,
          texto: `${porcentaje(resumen.total ? g.importe / resumen.total : null)} · ${g.piezas} pzs`,
        }))} />
      </Plegable>

      <Plegable id="descuentos" titulo="Descuentos" resumen={pesos(desc.total)}>
        <p>{pesos(desc.total)} de descuento sobre {pesos(desc.sinDescuento)} de precio de lista ({porcentaje(desc.pct)}).</p>
        {desc.top.length > 0 && (
          <Grafica titulo="Productos con más descuento" barras={desc.top.map((p) => ({
            clave: String(p.dodo_id), etiqueta: p.nombre, valor: p.descuento,
            texto: `${pesos(p.descuento)} (${porcentaje(p.sinDescuento ? p.descuento / p.sinDescuento : null)})`,
          }))} />
        )}
      </Plegable>

      <Plegable id="costos" titulo="Costos" resumen={porcentaje(costos.total.costoPct)} alerta={costos.sinCosto.length > 0}>
        <div className="tarjetas">
          {costos.categorias.map((g) => (
            <article key={g.categoria ?? "sin"} className="tarjeta">
              <h3>{categoria(g.categoria)}</h3>
              <dl className="tarjeta-datos">
                <dt>Costo %</dt><dd>{porcentaje(g.costoPct)}</dd>
                <dt>Costo promedio</dt><dd>{g.costoPromedio === null ? "—" : `${pesos(g.costoPromedio)} por pieza`}</dd>
                <dt>Costo teórico</dt><dd>{pesos(g.costo)}</dd>
                <dt>Piezas</dt><dd>{g.piezasConCosto} de {g.piezas} con costo</dd>
              </dl>
            </article>
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
        {costos.sinCosto.length > 0 && (
          <p className="aviso aviso-info">
            Sin costo (no cuentan en el costo %): {costos.sinCosto.map((s) => `${s.nombre} (${s.piezas} pzs)`).join(", ")}.
            {puedeImportarVentas(perfil.rol) && <> <Link href="/ventas/costos?ver=sin-costo">Asignar costos</Link></>}
          </p>
        )}
      </Plegable>

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
    </>
  );
}

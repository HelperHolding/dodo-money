import { BarraApilada } from "@/components/BarraApilada";
import { BarrasVerticales } from "@/components/BarrasVerticales";
import { ConInfo } from "@/components/ConInfo";
import { Grafica } from "@/components/Grafica";
import { MapaCalor } from "@/components/MapaCalor";
import { TarjetaDetalle } from "@/components/TarjetaDetalle";
import { fechaTexto, pesos, porcentaje } from "@/lib/formato";
import {
  canales, combos, DIAS_SEMANA, MINUTOS_LENTO, personalYCancelados, tiempos, ventaPorHora,
  type Canal, type LineaPedido, type Pedido,
} from "@/lib/ventas/pedidos";

const NOMBRE_CANAL: Record<Canal, string> = {
  mostrador: "Mostrador", kiosco: "Kiosco", app: "App", sitio: "Sitio", otro: "Otro", entrega: "Entrega a domicilio",
};
const minutos = (m: number | null) => (m === null ? "—" : `${Math.round(m)} min`);

/**
 * Reportes que salen de cada pedido (Datos brutos o, después, la API): venta por hora, canales, personal y
 * cancelados, tiempos de cocina y combos. `diasSinDetalle` son los días del periodo importados con el formato anterior.
 * Cada sección es un pequeño tablero siempre abierto: cifras en tarjetas chicas, gráfica y la lista en tabla compacta.
 * Van en el orden en que se acomodan en la rejilla del tablero (las chicas junto a las dobles, luego las de todo el ancho).
 */
export function SeccionesPedidos({ pedidos, lineas, diasSinDetalle }: { pedidos: readonly Pedido[]; lineas: readonly LineaPedido[]; diasSinDetalle: number }) {
  const aviso = diasSinDetalle > 0 && (
    <p className="aviso aviso-info">
      {diasSinDetalle} {diasSinDetalle === 1 ? "día del periodo no tiene" : "días del periodo no tienen"} detalle por pedido;
      reimpórtalos con Datos brutos para verlos aquí.
    </p>
  );
  if (!pedidos.length) return aviso || null;

  const hora = ventaPorHora(pedidos);
  const canal = canales(pedidos);
  const pc = personalYCancelados(pedidos, lineas);
  const t = tiempos(pedidos);
  const cb = combos(pedidos, lineas);

  return (
    <>
      {aviso}
      <TarjetaDetalle id="personal" titulo="Personal y cancelados" resumen={`${pc.cancelados.pedidos} cancelados`} alerta={pc.alerta}>
        <dl className="mini-cifras">
          <div>
            <dt>Personal</dt>
            <dd>{pc.personal.pedidos} pedidos</dd>
            <dd className="mini-nota">{pesos(pc.personal.monto)} a precio de lista · {porcentaje(pc.personal.pctVenta)} de la venta</dd>
          </div>
          <div data-alerta={pc.alerta ? "si" : undefined}>
            <dt>Cancelados</dt>
            <dd>{pc.cancelados.pedidos} pedidos ({porcentaje(pc.cancelados.pct)})</dd>
            <dd className="mini-nota">{pesos(pc.cancelados.monto)}</dd>
          </div>
        </dl>
        {pc.cancelados.lista.length > 0 && (
          <div className="detalle-bloque">
            <h3>Pedidos cancelados</h3>
            <div className="tabla-contenedor">
              <table className="tabla tabla-compacta">
                <thead><tr><th scope="col">Fecha y hora</th><th scope="col" className="monto">Total</th><th scope="col">Productos</th></tr></thead>
                <tbody>
                  {pc.cancelados.lista.map((c) => (
                    <tr key={c.dodo_id}><td>{fechaTexto(c.fecha)} {c.hora}</td><td className="monto">{pesos(c.total)}</td><td>{c.productos.join(", ")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </TarjetaDetalle>

      <TarjetaDetalle id="tiempos" titulo="Tiempos de cocina" resumen={minutos(t.medianaCocina)}>
        <dl className="mini-cifras">
          <div><dt>Cocina</dt><dd>{minutos(t.medianaCocina)}</dd><dd className="mini-nota">de mediana</dd></div>
          <div><dt>Entrega</dt><dd>{minutos(t.medianaEntrega)}</dd><dd className="mini-nota">de mediana</dd></div>
          <div><dt>Lentos</dt><dd>{t.lentos} pedidos</dd><dd className="mini-nota">de más de {MINUTOS_LENTO} min en cocina ({porcentaje(t.pctLentos)})</dd></div>
        </dl>
        <ConInfo titulo="Tiempos de cocina" etiqueta="Cómo leer esto">
          Cocina: de que se empieza a que queda listo. Entrega: de que se pide a que se entrega.
          {t.sinTiempo > 0 && ` ${t.sinTiempo} pedidos sin hora de listo no cuentan.`}
        </ConInfo>
        <div className="detalle-rejilla">
          {t.porHora.length > 0 && (
            <div className="detalle-bloque">
              <h3>Minutos de cocina por hora</h3>
              <BarrasVerticales titulo="Minutos de cocina por hora" dias={t.porHora.map((h) => ({
                clave: String(h.hora), rotulo: `${h.hora} h`, valor: h.mediana, detalle: `${h.hora} h · ${minutos(h.mediana)} · ${h.pedidos} ped.`,
                alerta: h.mediana > MINUTOS_LENTO,
              }))} />
            </div>
          )}
          {t.masLentos.length > 0 && (
            <div className="detalle-bloque">
              <h3>Los más lentos</h3>
              <div className="tabla-contenedor">
                <table className="tabla tabla-compacta">
                  <thead><tr><th scope="col">Fecha y hora</th><th scope="col" className="monto">En cocina</th><th scope="col" className="monto">Total</th></tr></thead>
                  <tbody>
                    {t.masLentos.map((p) => (
                      <tr key={p.dodo_id}><td>{fechaTexto(p.fecha)} {p.hora}</td><td className="monto">{p.minutos} min</td><td className="monto">{pesos(p.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </TarjetaDetalle>

      <TarjetaDetalle ancho="doble" id="combos" titulo="Combos" resumen={cb.length ? `${cb.reduce((s, c) => s + c.vendidos, 0)} vendidos` : "Ninguno"}>
        {cb.length ? (
          <Grafica titulo="Combos más vendidos" barras={cb.map((c) => ({
            clave: c.combo, etiqueta: c.combo, valor: c.vendidos, texto: `${c.vendidos} · ${pesos(c.total)}`,
          }))} />
        ) : <p className="vacio">No se vendieron combos en el periodo.</p>}
        <ConInfo titulo="Cómo se cuentan los combos" etiqueta="Cómo leer esto">Si un pedido lleva dos veces el mismo combo, cuenta como uno.</ConInfo>
      </TarjetaDetalle>

      <TarjetaDetalle ancho="completo" id="canales" titulo="Canales" resumen={`${canal.canales.length} canales`}>
        <div className="detalle-rejilla">
          <div className="detalle-bloque">
            <h3>Venta por canal</h3>
            <Grafica titulo="Venta por canal" barras={canal.canales.map((c) => ({
              clave: c.canal, etiqueta: NOMBRE_CANAL[c.canal], valor: c.total,
              texto: `${pesos(c.total)} · ${c.pedidos} ped. · ticket ${c.ticket === null ? "—" : pesos(c.ticket)}`,
            }))} />
          </div>
          <div className="detalle-bloque">
            {canal.paraLlevar !== null && (
              <BarraApilada titulo="En tienda" partes={[
                { clave: "llevar", etiqueta: "Para llevar", valor: canal.paraLlevar, serie: 1 },
                { clave: "comer", etiqueta: "Para comer ahí", valor: 1 - canal.paraLlevar, serie: 2 },
              ]} />
            )}
            <h3>Forma de pago por canal</h3>
            <div className="tabla-contenedor">
              <table className="tabla tabla-compacta">
                <thead><tr><th scope="col">Canal</th><th scope="col" className="monto">Efectivo</th><th scope="col" className="monto">Tarjeta</th></tr></thead>
                <tbody>
                  {canal.canales.map((c) => (
                    <tr key={c.canal}><td>{NOMBRE_CANAL[c.canal]}</td><td className="monto">{pesos(c.efectivo)}</td><td className="monto">{pesos(c.tarjeta)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </TarjetaDetalle>

      <TarjetaDetalle ancho="completo" id="por-hora" titulo="Venta por hora" resumen={hora.pico ? `Pico ${DIAS_SEMANA[hora.pico.dia - 1]} ${hora.pico.hora} h` : "—"}>
        {hora.horaMin !== null && hora.horaMax !== null && <MapaCalor celdas={hora.celdas} horaMin={hora.horaMin} horaMax={hora.horaMax} />}
      </TarjetaDetalle>
    </>
  );
}

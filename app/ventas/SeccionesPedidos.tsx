import { Grafica } from "@/components/Grafica";
import { MapaCalor } from "@/components/MapaCalor";
import { Plegable } from "@/components/Plegable";
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
      <Plegable id="por-hora" titulo="Venta por hora" resumen={hora.pico ? `Pico ${DIAS_SEMANA[hora.pico.dia - 1]} ${hora.pico.hora} h` : "—"}>
        {hora.horaMin !== null && hora.horaMax !== null && <MapaCalor celdas={hora.celdas} horaMin={hora.horaMin} horaMax={hora.horaMax} />}
      </Plegable>

      <div className="tablero-fila">
        <Plegable id="canales" titulo="Canales" resumen={`${canal.canales.length} canales`}>
          <Grafica titulo="Venta por canal" barras={canal.canales.map((c) => ({
            clave: c.canal, etiqueta: NOMBRE_CANAL[c.canal], valor: c.total,
            texto: `${pesos(c.total)} · ${c.pedidos} ped. · ticket ${c.ticket === null ? "—" : pesos(c.ticket)}`,
          }))} />
          {canal.paraLlevar !== null && (
            <p>En tienda: {porcentaje(canal.paraLlevar)} para llevar y {porcentaje(1 - canal.paraLlevar)} para comer ahí.</p>
          )}
          <ul className="fallas">
            {canal.canales.map((c) => (
              <li key={c.canal}>{NOMBRE_CANAL[c.canal]}: efectivo {pesos(c.efectivo)} · tarjeta {pesos(c.tarjeta)}</li>
            ))}
          </ul>
        </Plegable>

        <Plegable id="personal" titulo="Personal y cancelados" resumen={`${pc.cancelados.pedidos} cancelados`} alerta={pc.alerta}>
          <dl className="tarjeta-datos">
            <dt>Personal</dt>
            <dd>
              <span>{pc.personal.pedidos} pedidos</span>
              <span>{pesos(pc.personal.monto)} a precio de lista</span>
              <span>{porcentaje(pc.personal.pctVenta)} de la venta</span>
            </dd>
            <dt>Cancelados</dt>
            <dd>
              <span className={pc.alerta ? "celda-alerta" : undefined}>{pc.cancelados.pedidos} pedidos ({porcentaje(pc.cancelados.pct)})</span>
              <span>{pesos(pc.cancelados.monto)}</span>
            </dd>
          </dl>
          {pc.cancelados.lista.length > 0 && (
            <ul className="fallas">
              {pc.cancelados.lista.map((c) => (
                <li key={c.dodo_id}>{fechaTexto(c.fecha)} {c.hora} · {pesos(c.total)} · {c.productos.join(", ")}</li>
              ))}
            </ul>
          )}
        </Plegable>
      </div>

      <div className="tablero-fila">
        <Plegable id="tiempos" titulo="Tiempos de cocina" resumen={minutos(t.medianaCocina)}>
          <dl className="tarjeta-datos">
            <dt>Cocina</dt><dd>{minutos(t.medianaCocina)} de mediana (de que se empieza a que queda listo)</dd>
            <dt>Entrega</dt><dd>{minutos(t.medianaEntrega)} de mediana (de que se pide a que se entrega)</dd>
            <dt>Lentos</dt><dd>{t.lentos} pedidos de más de {MINUTOS_LENTO} min en cocina ({porcentaje(t.pctLentos)})</dd>
          </dl>
          {t.porHora.length > 0 && (
            <Grafica titulo="Minutos de cocina por hora" barras={t.porHora.map((h) => ({
              clave: String(h.hora), etiqueta: `${h.hora} h`, valor: h.mediana, texto: `${minutos(h.mediana)} · ${h.pedidos} ped.`,
              alerta: h.mediana > MINUTOS_LENTO,
            }))} />
          )}
          {t.masLentos.length > 0 && (
            <>
              <h3>Los más lentos</h3>
              <ul className="fallas">
                {t.masLentos.map((p) => <li key={p.dodo_id}>{fechaTexto(p.fecha)} {p.hora} · {p.minutos} min · {pesos(p.total)}</li>)}
              </ul>
            </>
          )}
          {t.sinTiempo > 0 && <p className="saldo-nota">{t.sinTiempo} pedidos sin hora de listo no cuentan.</p>}
        </Plegable>

        <Plegable id="combos" titulo="Combos" resumen={cb.length ? `${cb.reduce((s, c) => s + c.vendidos, 0)} vendidos` : "Ninguno"}>
          {cb.length ? (
            <Grafica titulo="Combos más vendidos" barras={cb.map((c) => ({
              clave: c.combo, etiqueta: c.combo, valor: c.vendidos, texto: `${c.vendidos} · ${pesos(c.total)}`,
            }))} />
          ) : <p className="vacio">No se vendieron combos en el periodo.</p>}
          <p className="saldo-nota">Si un pedido lleva dos veces el mismo combo, cuenta como uno.</p>
        </Plegable>
      </div>
    </>
  );
}

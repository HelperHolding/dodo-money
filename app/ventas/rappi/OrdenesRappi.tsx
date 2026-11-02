import { BotonEnviar } from "@/components/BotonEnviar";
import { ConInfo } from "@/components/ConInfo";
import { fechaTexto, pesos } from "@/lib/formato";
import type { RappiGuardada } from "@/lib/ventas/rappi";
import { fuenteOrden } from "./acciones";

const TONO_ESTADO: Record<RappiGuardada["estado"], string> = { Finalizado: "exito", Cancelado: "peligro", "Con reclamo": "aviso" };

/**
 * Órdenes en vivo como en el portal de Rappi: una fila por orden con quién y cuándo (fecha, hora, número, estado, fuente y
 * pago), el detalle (cada producto con su importe y sus opciones en etiquetas) y los importes de la orden. La más reciente
 * primero; en celular cada orden queda como tarjeta.
 */
export function OrdenesRappi({ ordenes, nombres, edita, sumadas, total }: {
  ordenes: readonly RappiGuardada[]; nombres: Map<string, string>; edita: boolean; sumadas: number; total: number;
}) {
  return (
    <section className="seccion rappi-pedidos" aria-labelledby="r-pedidos">
      <div className="seccion-cabecera detalle-cabecera">
        <span className="plegable-titulo"><h2 id="r-pedidos">Órdenes en vivo ({ordenes.length})</h2></span>
        <span className="plegable-resumen">{sumadas} sumadas · {pesos(total)}</span>
      </div>
      <ConInfo titulo="Órdenes en vivo" etiqueta="Cómo leer esto">El costo se calcula únicamente para productos vinculados al catálogo, con costo vigente. Los combos requieren su equivalencia completa.</ConInfo>
      {!ordenes.length ? <p className="vacio">No llegaron órdenes del portal en este periodo.</p> : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lector">Órdenes en vivo del periodo, de la más reciente a la más antigua</caption>
            <thead><tr><th scope="col">Orden</th><th scope="col">Detalle</th><th scope="col">Importes</th></tr></thead>
            <tbody>
              {[...ordenes].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.hora.localeCompare(a.hora)).map((o) => (
                <tr key={o.rappi_id}>
                  <td>
                    <div className="pedido-orden">
                      <strong>{fechaTexto(o.fecha)} · {o.hora.slice(0, 5)}</strong>
                      <small>#{o.rappi_id} · {nombres.get(o.sucursal_id)}</small>
                      <span className="pedido-insignias">
                        <span className="insignia insignia-punto" data-tono={TONO_ESTADO[o.estado]}>{o.estado}</span>
                        <span className="insignia" data-tono={o.sumar ? "marca" : undefined}>{o.sumar ? "Fuente Rappi" : "Incluida en Dodo IS"}</span>
                      </span>
                      <small>{o.pago}</small>
                      {edita && (
                        <form action={fuenteOrden}>
                          <input type="hidden" name="id" value={o.rappi_id} /><input type="hidden" name="sumar" value={o.sumar ? "no" : "si"} />
                          <BotonEnviar className="boton boton-secundario" confirmar="¿Cambiar la fuente de esta orden?">{o.sumar ? "Ya incluida en Dodo IS" : "Sumar desde Rappi"}</BotonEnviar>
                        </form>
                      )}
                    </div>
                  </td>
                  <td>
                    <ul className="pedido-lineas">
                      {o.rappi_lineas.map((p) => (
                        <li key={p.linea}>
                          <span><span className="pedido-cantidad">{p.cantidad}×</span> {p.nombre}</span>
                          <span className="monto">{pesos(Number(p.importe))}</span>
                          {p.opciones && (
                            <span className="pedido-opciones">
                              {p.opciones.split(" · ").map((x, i) => <span key={i} data-serie={(i % 4) + 1}>{x}</span>)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <dl className="pedido-totales">
                      <div><dt>Productos</dt><dd>{pesos(Number(o.bruto))}</dd></div>
                      <div><dt>Descuento restaurante</dt><dd>−{pesos(Number(o.descuento_restaurante))}</dd></div>
                      <div className="pedido-total"><dt>Subtotal restaurante</dt><dd>{pesos(Number(o.subtotal_restaurante))}</dd></div>
                      <div><dt>Descuento Rappi</dt><dd>−{pesos(Number(o.descuento_rappi))}</dd></div>
                      <div><dt>A facturar</dt><dd>{pesos(Number(o.facturar))}</dd></div>
                    </dl>
                    <small className="pedido-archivo" title={o.archivo}>{o.archivo}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

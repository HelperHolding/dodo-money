import {leerTodo} from "@/lib/ventas/paginar";
import {Plegable} from "@/components/Plegable";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto } from "@/lib/contexto";
import { fechaMX, fechaTexto, hoyCalendarioMX } from "@/lib/formato";
import { avanceRenglon } from "@/lib/compras/ordenes";
import { puedeRecibirCompras } from "@/lib/roles";
import { recibirRenglon } from "./actions";

type PorRecibir = {
  orden_id: string; folio: string; proveedor: string; confirmada_en: string; renglon_id: string;
  descripcion: string; unidad: string; tipo: string; cantidad: number; recibido: number; entrega_esperada: string | null;
};

export default async function RecepcionesSucursal({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, soloLectura,sucursal } = await obtenerContexto();
  if (!puedeRecibirCompras(perfil.rol)) redirect("/");
  const { data, error: errorRpc } = await supabase.rpc("ordenes_por_recibir");
  if (errorRpc) throw new Error(errorRpc.message);
  type Historica={id:string;orden_id:string;descripcion:string;cantidad:number;recibido:number;articulos:{unidad:string}|null;ordenes_compra:{folio:string;proveedores:{nombre_comercial:string|null;razon_social:string}|null}|null};
  const historial=await leerTodo<Historica>((d,h)=>supabase.from("renglones_recibido").select("id,orden_id,descripcion,cantidad,recibido,articulos(unidad),ordenes_compra!inner(folio,proveedores(nombre_comercial,razon_social))").eq("ordenes_compra.sucursal_id",sucursal.id).in("ordenes_compra.estado",["confirmada","cerrada"]).order("orden_id").order("id").range(d,h).returns<Historica[]>());
  const recibidas=historial.filter(r=>avanceRenglon(Number(r.cantidad),Number(r.recibido))==="completa").map(r=>({renglon_id:r.id,folio:r.ordenes_compra?.folio??"Orden",proveedor:r.ordenes_compra?.proveedores?.nombre_comercial??r.ordenes_compra?.proveedores?.razon_social??"",descripcion:r.descripcion,recibido:r.recibido,cantidad:r.cantidad,unidad:r.articulos?.unidad??""}));
  const pendientes = ((data ?? []) as PorRecibir[]).filter((r) => avanceRenglon(Number(r.cantidad), Number(r.recibido)) !== "completa");
  const ordenes = [...new Map(pendientes.map((r) => [r.orden_id, r])).values()];
  const hoy = hoyCalendarioMX();

  return (
    <>
      <div className="encabezado">
        <h1>Recepciones</h1>
        <p>Equipo, servicios y otros pedidos por oficina. Los insumos (consumibles) se siguen recibiendo en Dodo IS.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <Plegable id="ya-recibidas" titulo="Ya recibidas" resumen={`${recibidas.length} renglones completos`}><div className="tabla-contenedor"><table className="tabla"><thead><tr><th>Orden / proveedor</th><th>Artículo</th><th>Recibido</th><th>Estado</th></tr></thead><tbody>{recibidas.map(r=><tr key={r.renglon_id}><td>{r.folio} · {r.proveedor}</td><td>{r.descripcion}</td><td>{r.recibido} / {r.cantidad} {r.unidad}</td><td><span className="compra-estado" data-tono="verde">Ya recibido</span></td></tr>)}</tbody></table></div>{!recibidas.length&&<p className="vacio">Sin renglones recibidos completos.</p>}</Plegable>
      {!ordenes.length && <p className="vacio">No hay nada por recibir.</p>}
      {ordenes.map((o) => (
        <section key={o.orden_id} className="seccion" aria-labelledby={`o-${o.orden_id}`}>
          <h2 id={`o-${o.orden_id}`}>{o.folio} · {o.proveedor}</h2>
          <p className={o.entrega_esperada && o.entrega_esperada < hoy ? "aviso aviso-error" : "saldo-nota"}>
            Confirmada el {fechaTexto(fechaMX(o.confirmada_en))}
            {o.entrega_esperada ? ` · se espera el ${fechaTexto(o.entrega_esperada)}${o.entrega_esperada < hoy ? " (atrasada)" : o.entrega_esperada === hoy ? " (hoy)" : ""}` : ""}
          </p>
          <div className="tarjetas">
            {pendientes.filter((r) => r.orden_id === o.orden_id).map((r) => {
              const falta = Math.round((Number(r.cantidad) - Number(r.recibido)) * 1000) / 1000;
              return (
                <article key={r.renglon_id} className="tarjeta">
                  <div className="tarjeta-encabezado">
                    <div>
                      <h3>{r.descripcion}</h3>
                      <p className="tarjeta-estado">{r.tipo === "servicio" ? "Servicio" : `Faltan ${falta} ${r.unidad} de ${r.cantidad}`}</p>
                    </div>
                  </div>
                  {!soloLectura && (
                    <form action={recibirRenglon} className="formulario">
                      <input type="hidden" name="renglon_id" value={r.renglon_id} />
                      <div className="rejilla">
                        <div className="campo">
                          <label htmlFor={`c-${r.renglon_id}`}>{r.tipo === "servicio" ? "¿Se realizó? (1 = sí)" : `Cantidad recibida (${r.unidad})`}</label>
                          <input id={`c-${r.renglon_id}`} name="cantidad" inputMode="decimal" defaultValue={falta} required />
                        </div>
                        <div className="campo">
                          <label htmlFor={`f-${r.renglon_id}`}>Fecha</label>
                          <input id={`f-${r.renglon_id}`} name="fecha" type="date" defaultValue={hoy} max={hoy} required />
                        </div>
                      </div>
                      <div className="campo">
                        <label htmlFor={`foto-${r.renglon_id}`}>Foto de la remisión o del equipo (opcional)</label>
                        <input id={`foto-${r.renglon_id}`} name="foto" type="file" accept="image/*" capture="environment" />
                      </div>
                      <BotonEnviar pendiente="Registrando…">Registrar recepción</BotonEnviar>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

import Link from "next/link";
import {pesos,fechaTexto} from "@/lib/formato";
import {Materiales} from "./materiales/Materiales";
import type {VersionCosteo,RecetaCosteo} from "./catalogo";
export function FichaReceta({v,r}:{v:VersionCosteo;r:RecetaCosteo}){
 const extra=r.receta.precioVenta!==null&&v.periferico?Math.round(r.receta.precioVenta*.01*100)/100:0;
 const total=r.costo===null||v.periferico&&r.receta.precioVenta===null?null:Math.round((Number(r.costo)+extra)*100)/100;
 return <section className="seccion"><h2>Lista de materiales · {r.nombre}</h2><p>{v.archivo} · vigente desde {fechaTexto(v.vigente_desde)} · {r.receta.referencia}</p>
 <div className="rejilla"><p>BOM: <strong>{r.costo===null?"Pendiente":pesos(Number(r.costo))}</strong></p><p>Periféricos: <strong>{v.periferico&&r.receta.precioVenta===null?"Pendiente":pesos(extra)}</strong>{v.periferico?" · 1 % del precio POS":" · sin extra"}</p><p>Costo calculado: <strong>{total===null?"Pendiente":pesos(total)}</strong></p><p>Precio POS del Excel: <strong>{r.receta.precioVenta===null?"Sin dato":pesos(r.receta.precioVenta)}</strong></p></div>
 <p className="saldo-nota">Precio de referencia del archivo; no confirma el precio actual del POS. Las cantidades del BOM incluyen sus ajustes de proceso.</p>
 {r.receta.avisos.map(a=><p key={a} className="alerta-texto">{a}</p>)}<Materiales items={r.receta.materiales} insumos={v.modelo.insumos} version={v.id}/>
 <Link href={`/ventas/costos/materiales?version=${v.id}`}>Ver catálogo de esta versión</Link></section>;
}

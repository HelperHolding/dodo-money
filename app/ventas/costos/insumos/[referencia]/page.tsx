import Link from "next/link";
import {notFound} from "next/navigation";
import {catalogoCosteo,fichaReceta,fichaInsumo} from "../../catalogo";
import {insumoDeMaterial} from "@/lib/costeo/trazabilidad";
import {pesos,fechaTexto} from "@/lib/formato";
import {buscarPorRuta} from "@/lib/costeo/rutas";
export default async function Insumo({params,searchParams}:{params:Promise<{referencia:string}>;searchParams:Promise<{version?:string}>}){
 const [p,q]=await Promise.all([params,searchParams]);const {v,recetas,versiones}=await catalogoCosteo(q.version);
 const i=v?buscarPorRuta(v.modelo.insumos,p.referencia,i=>i.referencia):undefined;if(!v||!i)notFound();
 const usos=recetas.filter(r=>r.receta.materiales.some(m=>insumoDeMaterial(m,v.modelo.insumos)?.referencia===i.referencia));
 // El historial usa el nombre exacto y único, nunca el número de fila que puede cambiar entre archivos.
 const historia=versiones.flatMap(x=>{const candidatos=x.modelo.insumos.filter(a=>a.nombre===i.nombre);return candidatos.length===1?[{v:x,i:candidatos[0]}]:[];});
 return <><div className="encabezado"><h1>{i.nombre.replace(/🚨/g,"")}</h1><p>Insumo · precio de origen, unidad y recetas que lo utilizan.</p></div><Link href={`/ventas/costos/materiales?ver=insumos&version=${v.id}`}>Volver a insumos</Link>
 <section className="seccion"><h2>Precio y fuente</h2><p><strong>{i.precio===null?"Pendiente":pesos(i.precio)}</strong> / {i.unidad??"unidad pendiente de confirmar"}</p><p>{v.archivo} · desde {fechaTexto(v.vigente_desde)} · {i.referencia}</p><p>Ajuste de proceso del BOM: {i.merma===null?"Sin dato":`${(i.merma*100).toFixed(2)} %`}</p>{i.avisos.map(a=><p key={a} className="alerta-texto">{a}</p>)}</section>
 <section className="seccion"><h2>Utilizado en ({usos.length})</h2>{usos.length?<ul className="lista-simple">{usos.map(r=><li key={r.clave}><Link href={fichaReceta(v.id,r.clave)}>{r.nombre}</Link>{r.receta.materiales.filter(m=>insumoDeMaterial(m,v.modelo.insumos)?.referencia===i.referencia).map((m,n)=><span key={n}> · {m.cantidad??"Pendiente"} {m.unidad??""} · {m.importe===null?"Costo pendiente":pesos(m.importe)}</span>)}</li>)}</ul>:<p>No hay recetas con una coincidencia exacta y única en esta versión.</p>}</section>
 <section className="seccion"><h2>Historial por archivo</h2><ul>{historia.map(x=><li key={x.v.id}><Link href={fichaInsumo(x.v.id,x.i.referencia)}>{fechaTexto(x.v.vigente_desde)} · {x.v.archivo}</Link> · {x.i.precio===null?"Pendiente":pesos(x.i.precio)} / {x.i.unidad??"unidad pendiente"}</li>)}</ul></section></>;
}

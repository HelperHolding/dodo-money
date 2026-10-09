import {FichaPestanas} from "@/components/FichaPestanas";
import Link from "next/link";
import {notFound} from "next/navigation";
import {catalogoCosteo,fichaReceta} from "../../catalogo";
import {FichaReceta} from "../../FichaReceta";
import {leerTodo} from "@/lib/ventas/paginar";
import {costoVigente} from "@/lib/ventas/calculos";
import {preciosDelProducto} from "../../precios";
import {pesos,fechaTexto} from "@/lib/formato";
import {MargenesProducto} from '../../MargenesProducto';
type Costo={id:string;costo:number;vigente_desde:string;fuente:string|null;nota:string|null};
export default async function Producto({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{version?:string}>}){
 const [p,q]=await Promise.all([params,searchParams]);if(!/^\d+$/.test(p.id)||!Number.isSafeInteger(Number(p.id)))notFound();
 const id=Number(p.id),{supabase,perfil,v,recetas,versiones,hoy}=await catalogoCosteo(q.version);
 const [{data:producto,error},costos,rappi,correcciones]=await Promise.all([
  supabase.from("productos_venta").select("dodo_id,nombre,categoria,tamano").eq("dodo_id",id).maybeSingle(),
  leerTodo<Costo>((a,b)=>supabase.from("costos_producto").select("id,costo,vigente_desde,fuente,nota").eq("dodo_id",id).order("vigente_desde",{ascending:false}).order("id").range(a,b)),
  preciosDelProducto(supabase,id,hoy),
  leerTodo<{costo_id:string;costo_anterior:number;corregido_en:string}>((a,b)=>supabase.from("correcciones_costo").select("costo_id,costo_anterior,corregido_en,costos_producto!inner(dodo_id)").eq("costos_producto.dodo_id",id).order("corregido_en").order("id").range(a,b)),
 ]);
 if(error)throw Error(error.message);if(!producto)notFound();const actual=costoVigente(costos,hoy),r=recetas.find(r=>r.dodo_id===id),precios=rappi;
 return <><div className="encabezado ficha-encabezado"><h1>{producto.nombre}</h1><p>Producto #{id} · {producto.categoria??"Sin categoría"} · {producto.tamano??"Sin tamaño"}</p></div><div className="acciones orden-acciones-encabezado"><Link className="boton boton-secundario" href="/ventas/costos">Volver a costeo</Link><Link className="boton" href={`/ventas/costos/calculadora?producto=${id}`}>Simular promoción</Link></div>
 <section className="seccion"><h2>Costo vigente</h2><p><strong>{actual?pesos(actual.costo):"Sin costo"}</strong>{actual?` · desde ${fechaTexto(actual.vigente_desde)}`:""}</p>{actual&&<details className="costeo-origen"><summary>Ver origen del costo</summary><p>{actual.fuente??"Fuente no indicada"} · vigente desde {fechaTexto(actual.vigente_desde)}</p></details>}{actual?.nota&&<p className="alerta-texto">{actual.nota}</p>}{perfil.rol==="admin"&&<Link href={`/ventas/costos?vista=tarjetas#p-${id}`}>Editar categoría o registrar costo</Link>}</section>
 <FichaPestanas pestanas={[
 {id:"bom",titulo:"Lista de materiales",contenido:<> <form className="acciones"><label htmlFor="version">Versión del BOM</label><select id="version" name="version" defaultValue={v?.id??""}><option value="">Vigente</option>{versiones.map(x=><option key={x.id} value={x.id}>{x.vigente_desde} · {x.archivo}</option>)}</select><button className="boton boton-secundario">Consultar</button></form>
 {v&&r?<FichaReceta v={v} r={r}/>:<section className="seccion"><h2>Lista de materiales</h2><p>Sin receta vinculada en la versión seleccionada. Precio POS del Excel: sin dato. No asignamos recetas por similitud.</p><Link href="/ventas/costos/materiales">Revisar catálogo de BOM</Link></section>}
</>},
 {id:"margenes",titulo:"Precios y márgenes",contenido:<> <MargenesProducto costo={actual?Number(actual.costo):null} pos={r?.receta.precioVenta??null} rappi={precios[0]?.precio??null} fechaCosto={actual?.vigente_desde} referenciaPOS={v&&r?`Referencia del Excel ${v.archivo}, vigente desde ${v.vigente_desde}.`:'Sin receta vinculada para el precio POS.'} referenciaRappi={precios[0]?`Último precio observado: ${precios[0].fecha} · orden #${precios[0].orden} · ${precios[0].tienda}${precios[0].opciones?` · ${precios[0].opciones}`:''}. Se compara con el costo vigente de hoy.`:'Sin órdenes Rappi vinculadas.'}/>
 <section className="seccion"><h2>Precio Rappi observado</h2><p>Importe de productos por pieza, antes de descuentos. Puede incluir opciones o combos y variar por tienda; no confirma el precio actual del menú.</p>{precios.length?<div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><thead><tr><th>Fecha / orden</th><th>Producto y opciones</th><th>Tienda</th><th className="monto">Precio por pieza</th><th>Fuente</th></tr></thead><tbody>{precios.map((x,n)=><tr key={`${x.orden}-${n}`}><td data-label="Fecha / orden"><Link href={`https://restaurantes.rappi.com/orders/history/${x.tienda.replace(/^MX/,"")}/${x.orden}?storeIds=${x.tienda}`}>{x.fecha} {x.hora.slice(0,5)} · #{x.orden}</Link></td><td data-label="Producto y opciones">{x.nombre} · {x.opciones||"Sin opciones"}</td><td data-label="Tienda">{x.tienda}</td><td data-label="Precio por pieza" className="monto">{pesos(x.precio)}</td><td data-label="Fuente">{x.archivo}</td></tr>)}</tbody></table></div>:<p>Sin ventas Rappi vinculadas a este producto. Revisa su equivalencia en <Link href="/ventas/rappi">Ventas Rappi</Link>.</p>}</section>
</>},
 {id:"historial",titulo:`Historial de costos (${costos.length})`,contenido:<> <section className="seccion"><h2>Historial de costos</h2><ul>{costos.map(c=><li key={c.id}>{pesos(c.costo)} · desde {fechaTexto(c.vigente_desde)}{c.vigente_desde>hoy?" · programado":""} · {c.fuente??"Fuente no indicada"}{c.nota?` · ${c.nota}`:""}{correcciones.filter(k=>k.costo_id===c.id).map((k,n)=><small key={n}> · corregido {k.corregido_en}: antes {pesos(k.costo_anterior)}</small>)}</li>)}</ul></section>
</>},
 ]}/>
 {v&&r&&<Link href={fichaReceta(v.id,r.clave)}>Abrir receta por separado</Link>}</>;
}

import Link from "next/link";
import {obtenerPerfil} from "@/lib/contexto";
import {puedeImportarVentas} from "@/lib/roles";
import {hoyMX,pesos,fechaTexto} from "@/lib/formato";
import {leerTodo} from "@/lib/ventas/paginar";
import type {ModeloBOM,Receta} from "@/lib/costeo/bom";
import {Materiales} from "./Materiales";
import {FormularioBOM} from "./Formulario";

type Version = {id:string;vigente_desde:string;archivo:string;modelo:ModeloBOM;periferico:boolean;creado_en:string};
type Guardada = {clave:string;nombre:string;receta:Receta;costo:number|null;dodo_id:number|null};
export default async function PaginaMateriales({searchParams}:{searchParams:Promise<{version?:string;q?:string;ver?:string}>}) {
  const {supabase,perfil}=await obtenerPerfil(),filtros=await searchParams,hoy=hoyMX();
  const {data,error}=await supabase.from("bom_versiones").select("id,vigente_desde,archivo,modelo,periferico,creado_en").order("vigente_desde",{ascending:false}).order("actualizado_en",{ascending:false}).limit(100).returns<Version[]>();
  const versiones=data??[],v=versiones.find(v=>v.id===filtros.version)??versiones.find(v=>v.vigente_desde<=hoy)??versiones[0];
  const recetas=v ? await leerTodo<Guardada>((d,h)=>supabase.from("bom_recetas").select("clave,nombre,receta,costo,dodo_id").eq("version_id",v.id).order("nombre").order("clave").range(d,h)) : [];
  const q=(filtros.q??"").toLocaleLowerCase("es-MX"),tab=filtros.ver==="insumos" ? "insumos" : filtros.ver==="preparaciones" ? "preparaciones" : "recetas";
  const href=(ver:string)=>`/ventas/costos/materiales?ver=${ver}${v?`&version=${v.id}`:""}`;
  return <>
    <div className="encabezado"><h1>Costeo y listas de materiales</h1><p>Insumos, cantidades y costo por producto. Cada versión conserva el archivo de origen y la fecha desde la que aplica.</p></div>
    <nav className="acciones" aria-label="Costeo">{puedeImportarVentas(perfil.rol)&&<Link className="boton boton-secundario" href="/ventas/costos">Costos de venta e historial</Link>}{[['recetas','Listas de materiales'],['insumos','Insumos'],['preparaciones','Preparaciones']].map(([k,n])=><Link key={k} className="boton boton-secundario" href={href(k)} aria-current={tab===k ? "page" : undefined}>{n}</Link>)}</nav>
    {error&&<p role="alert" className="aviso aviso-error">No se pudo cargar el catálogo: {error.message}. Si aún no lo has hecho, aplica la migración 0033_costeo_bom.sql.</p>}
    {v&&<>
      <form className="acciones" method="get"><input type="hidden" name="ver" value={tab}/><label htmlFor="bom-version">Versión</label><select id="bom-version" name="version" defaultValue={v.id}>{versiones.map(x=><option key={x.id} value={x.id}>{fechaTexto(x.vigente_desde)} · {x.archivo}{x.periferico ? " + 1 %" : ""}</option>)}</select><label className="solo-lector" htmlFor="bom-buscar">Buscar insumo o receta</label><input id="bom-buscar" name="q" defaultValue={filtros.q??""} placeholder="Buscar insumo o receta"/><button className="boton boton-secundario">Ver</button></form>
      <p className="saldo-nota">{v.archivo} · aplica desde {fechaTexto(v.vigente_desde)}{v.vigente_desde>hoy ? " (programado)" : ""}. {v.periferico ? "El costeo de ventas suma 1 % del precio para periféricos." : "Costeo de ventas sin extra."} Las cantidades del BOM ya incluyen los ajustes de merma del Excel.</p>
      {tab==="recetas"&&<div className="tarjetas bom-recetas">{recetas.filter(r=>r.nombre.toLowerCase().includes(q)).map(r=><article key={r.clave} className="tarjeta">
        <div className="tarjeta-encabezado"><div><h2>{r.nombre}</h2><p className="tarjeta-estado">{r.costo===null ? "Pendiente de corregir" : `BOM ${pesos(Number(r.costo))}`}</p></div><div><strong>{r.costo!==null&&r.receta.precioVenta!==null ? pesos(Math.round((Number(r.costo)+(v.periferico ? r.receta.precioVenta*.01 : 0))*100)/100) : "—"}</strong><small className="pl-pct">{v.periferico ? "Con periféricos" : "Por producto"}</small></div></div>
        <p className="saldo-nota">{r.dodo_id ? puedeImportarVentas(perfil.rol) ? <Link href={`/ventas/costos#p-${r.dodo_id}`}>Costo de venta · producto #{r.dodo_id}</Link> : `Producto de venta #${r.dodo_id}` : "Sin vincular a un producto de venta"} · {r.receta.referencia}</p>
        <details><summary>Ver materiales ({r.receta.materiales.length})</summary>{r.receta.avisos.map(a=><p key={a} className="alerta-texto">{a}</p>)}<Materiales items={r.receta.materiales}/></details>
      </article>)}</div>}
      {tab==="insumos"&&<div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><thead><tr><th>Insumo</th><th className="monto">Precio</th><th>Unidad del precio</th><th>Fuente / revisión</th></tr></thead><tbody>{v.modelo.insumos.filter(i=>i.nombre.toLowerCase().includes(q)).map(i=><tr key={i.referencia}><td data-label="Insumo">{i.nombre.replace(/🚨/g,"")}</td><td className="monto" data-label="Precio">{i.precio===null ? "Pendiente" : pesos(i.precio)}</td><td data-label="Unidad del precio">{i.unidad??"Pendiente de confirmar"}</td><td data-label="Fuente / revisión"><small>{i.referencia}{i.avisos.length ? ` · ${i.avisos.join(" · ")}` : ""}</small></td></tr>)}</tbody></table></div>}
      {tab==="preparaciones"&&v.modelo.preparaciones.filter(p=>p.nombre.toLowerCase().includes(q)).map(p=><section className="seccion" key={p.nombre}><h2>{p.nombre}</h2><p>Rendimiento: {p.rendimiento.toLocaleString("es-MX")} g · costo por lote: {pesos(p.costo)} · por kg: {pesos(p.costo/p.rendimiento*1000)}</p><Materiales items={p.materiales}/></section>)}
    </>}
    {!v&&!error&&<p className="vacio">Todavía no hay insumos ni listas de materiales guardados.</p>}
    {puedeImportarVentas(perfil.rol)&&<details className="seccion" open={!v}><summary>Importar o actualizar insumos y BOM</summary><FormularioBOM fecha="2026-10-01"/></details>}
  </>;
}

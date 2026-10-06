import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeEditarFinanzas } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { resumirMermas } from "@/lib/finanzas/mermasDodo";
import type { MermaDodo, DiaMerma } from "@/lib/finanzas/mermasDodo";
import { Aviso } from "@/components/Aviso";
import { Formulario } from "./Formulario";
type Dia = DiaMerma & {archivo:string;desde:string;hasta:string;registrado_en:string};
export default async function Mermas({searchParams}:{searchParams:Promise<{mes?:string;sucursal?:string;ok?:string;error?:string}>}) {
  const {supabase,perfil}=await obtenerPerfil(), q=await searchParams;
  const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes??"")?q.mes!:hoyCalendarioMX().slice(0,7);
  const desde=`${mes}-01`, hasta=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
  const {data:sucursales,error}=await supabase.from("sucursales").select("id,nombre").order("nombre");
  if(error) throw new Error(error.message);
  const sucursal=(sucursales??[]).some(s=>s.id===q.sucursal)?q.sucursal:undefined;
  const dias=await leerTodo<Dia>((a,b)=>{let c=supabase.from("mermas_dodo_dias").select("*").gte("fecha",desde).lte("fecha",hasta);if(sucursal)c=c.eq("sucursal_id",sucursal);return c.order("sucursal_id").order("fecha").range(a,b);});
  const filas=await leerTodo<MermaDodo>((a,b)=>{let c=supabase.from("mermas_dodo").select("*").gte("fecha",desde).lte("fecha",hasta);if(sucursal)c=c.eq("sucursal_id",sucursal);return c.order("sucursal_id").order("fecha").order("tipo").order("clave").range(a,b);});
  const nombres=new Map((sucursales??[]).map(s=>[s.id,s.nombre]));
  return <><div className="encabezado"><h1>Mermas Dodo IS</h1><p>Mermas importadas para revisar cantidades y costos. Todavía no se incluyen en el P&L.</p></div><Aviso ok={q.ok} error={q.error}/>
    <form className="seccion formulario"><div className="rejilla"><div className="campo"><label htmlFor="mes">Mes</label><input id="mes" name="mes" type="month" defaultValue={mes} required/></div><div className="campo"><label htmlFor="sucursal">Sucursal</label><select id="sucursal" name="sucursal" defaultValue={sucursal??""}><option value="">Todas</option>{sucursales?.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div></div><button>Consultar</button></form>
    {puedeEditarFinanzas(perfil.rol)&&<Formulario/>}
    {!dias.length&&<p className="seccion">No hay días importados para este mes y sucursal.</p>}
    {resumirMermas(filas,dias).map(d=>{const origen=dias.find(x=>x.sucursal_id===d.sucursal_id&&x.fecha===d.fecha)!;return <section className="seccion" key={`${d.sucursal_id}-${d.fecha}`}><h2>{d.fecha} · {nombres.get(d.sucursal_id)}</h2><p>Insumos: {pesos(d.costoInsumos)} · Productos terminados: {pesos(d.costoProductos)}</p>
      {d.sinCosto>0&&<p className="aviso aviso-error">{d.sinCosto} renglones con costo sin determinar. Revisa los costos en Dodo IS.</p>}
      {!d.insumos&&!d.productos&&<p>Día importado sin mermas.</p>}
      <p><small>{origen.archivo} · Importado {new Date(origen.registrado_en).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}{origen.desde!==origen.hasta?" · Costo de insumos del periodo repartido por cantidad":""}</small></p>
      {(["insumo","producto"] as const).map(tipo=><details key={tipo}><summary>{tipo==="insumo"?"Insumos":"Productos terminados"}</summary><ul className="lista-filas">{filas.filter(r=>r.sucursal_id===d.sucursal_id&&r.fecha===d.fecha&&r.tipo===tipo).map(r=><li className="fila" key={r.clave}><div className="fila-nombre"><strong>{r.nombre}</strong><small>{r.categoria}</small></div><div className="fila-datos"><span>{r.cantidad} {r.unidad}</span><span>{pesos(r.costo)}{r.sin_costo?" · Sin costo determinado":""}</span></div></li>)}</ul></details>)}
    </section>})}</>;
}

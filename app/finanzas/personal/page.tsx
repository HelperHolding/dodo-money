import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas } from "@/lib/roles";
import { hoyMX,pesos } from "@/lib/formato";
import { leerPersonal } from "./datos";
import { FormularioPersonal } from "./Formulario";
export default async function Personal({searchParams}:{searchParams:Promise<{q?:string;ok?:string;error?:string}>}) {
 const q=await searchParams,{supabase,perfil}=await obtenerPerfil();
 const [personas,{data:sucursales,error}]=await Promise.all([leerPersonal(supabase),supabase.from("sucursales").select("id,nombre").order("nombre").returns<{id:string;nombre:string}[]>()]);
 if(error)throw new Error(error.message);
 const lugares=[...(sucursales??[]),{id:null,nombre:"Oficina central"}],hoy=hoyMX();
 return <><div className="encabezado"><h1>Personal</h1><p>Perfiles y condiciones mensuales con vigencia. Genera y revisa la nómina desde estos datos.</p><Link className="boton boton-secundario" href="/finanzas/nomina">Ir a Nómina</Link></div><Aviso ok={q.ok} error={q.error}/>
 <form className="acciones" method="get"><label htmlFor="buscar-personal">Buscar persona, código o puesto</label><input id="buscar-personal" name="q" defaultValue={q.q??""}/><button className="boton boton-secundario">Buscar</button></form>
 <section className="seccion"><ul className="lista-filas">{personas.map(p=>({p,v:p.personal_versiones.filter(v=>!v.sustituida_en&&v.desde<=hoy).sort((a,b)=>b.desde.localeCompare(a.desde))[0]})).filter(({p,v})=>`${p.codigo} ${v?.datos.nombre??""} ${v?.datos.puesto??""}`.toLowerCase().includes((q.q??"").toLowerCase())).map(({p,v})=><li className="fila" key={p.id}><div className="fila-nombre"><Link href={`/finanzas/personal/${p.id}`}><strong>{v?.datos.nombre??p.codigo}</strong></Link><small>{v?.datos.puesto??"Perfil con vigencia futura"} · {lugares.find(l=>l.id===p.sucursal_id)?.nombre} · código {p.codigo}</small></div><div className="fila-datos"><span>{v?.datos.baja&&v.datos.baja<hoy?"Baja":v?.datos.ingreso&&v.datos.ingreso>hoy?"Ingreso futuro":"Sin baja registrada"}</span><span>{!v||v.hasta&&v.hasta<hoy||v.datos.sueldo===null?"Importes pendientes":`Sueldo ${pesos(v.datos.sueldo)}`}</span></div></li>)}</ul>{!personas.length&&<p>Agrega perfiles o ejecuta la carga inicial de los seis empleados.</p>}</section>
 {puedeEditarFinanzas(perfil.rol)&&<details className="seccion"><summary>Agregar persona</summary><FormularioPersonal lugares={lugares}/></details>}</>;
}

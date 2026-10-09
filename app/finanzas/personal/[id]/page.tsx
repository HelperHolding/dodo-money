import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas } from "@/lib/roles";
import { pesos } from "@/lib/formato";
import { conceptosNomina } from "@/lib/finanzas/nomina";
import type { Persona } from "@/lib/finanzas/personal";
import { FormularioPersonal } from "../Formulario";
export default async function PerfilPersonal({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
 const {id}=await params,q=await searchParams,{supabase,perfil}=await obtenerPerfil();
 const [{data:p,error},{data:lugares,error:errorLugares}]=await Promise.all([supabase.from("personal").select("id,codigo,sucursal_id,personal_versiones(id,desde,hasta,datos,sustituida_en)").eq("id",id).maybeSingle<Persona>(),supabase.from("sucursales").select("id,nombre").order("nombre").returns<{id:string;nombre:string}[]>()]);
 if(error||errorLugares)throw new Error(error?.message??errorLugares?.message);if(!p)notFound();
 const versiones=[...p.personal_versiones].sort((a,b)=>b.desde.localeCompare(a.desde)),actual=versiones.find(v=>!v.sustituida_en);
 return <><div className="encabezado"><h1>{actual?.datos.nombre??p.codigo}</h1><p>{actual?.datos.puesto} · código {p.codigo}</p></div><Aviso ok={q.ok} error={q.error}/>
 {puedeEditarFinanzas(perfil.rol)&&<details className="seccion"><summary>Editar condiciones con vigencia</summary><FormularioPersonal persona={p} lugares={[...(lugares??[]),{id:null,nombre:"Oficina central"}]}/></details>}
 <section className="seccion"><h2>Condiciones e historial</h2>{versiones.map(v=><details key={v.id} open={v.id===actual?.id} className="seccion"><summary>{v.desde}{v.hasta?` a ${v.hasta}`:" en adelante"}{v.sustituida_en?" · versión corregida":""} · {v.datos.puesto}</summary><p>{v.datos.nombre} · código {v.datos.codigo??p.codigo} · {v.datos.renglon} · ingreso {v.datos.ingreso??"pendiente"} · baja {v.datos.baja??"sin registrar"}</p><dl>{Object.entries(conceptosNomina).map(([k,nombre])=><div key={k} className="fila-datos"><dt>{nombre}</dt><dd>{v.datos[k as keyof typeof conceptosNomina]===null?"Pendiente":pesos(v.datos[k as keyof typeof conceptosNomina]??0)}</dd></div>)}</dl><p>{v.datos.nota}</p></details>)}</section></>;
}

import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import Link from 'next/link';
import {obtenerPerfil} from '@/lib/contexto';
import {hoyCalendarioMX} from '@/lib/formato';
import {leerTodo} from '@/lib/ventas/paginar';
import {avancePorProyecto,cuentaRegresiva,ordenarProyectos,type ProyectoApertura} from '@/lib/aperturas';

const diaMes=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'});
const corta=(f:string)=>diaMes.format(new Date(`${f}T00:00:00Z`)).replace('.','');
const rango=(desde:string,hasta:string)=>desde===hasta?corta(desde):`${corta(desde)} – ${corta(hasta)}`;

/**
 * Portada de Aperturas: una tarjeta por sucursal (toda la tarjeta abre el proyecto), con cuenta regresiva a la
 * ventana objetivo y avance de actividades terminadas. Primero la apertura más próxima.
 */
export default async function Aperturas() {
 const {supabase}=await obtenerPerfil();
 const [{data,error},items]=await Promise.all([
  supabase.from('apertura_proyectos').select('*,sucursales(nombre)').returns<ProyectoApertura[]>(),
  leerTodo<{proyecto_id:string;estado:string}>((d,h)=>supabase.from('apertura_items').select('proyecto_id,estado').order('id').range(d,h).returns<{proyecto_id:string;estado:string}[]>()).catch(()=>null),
 ]);
 const hoy=hoyCalendarioMX(),avance=avancePorProyecto(items??[]);
 return <><EncabezadoPagina titulo="Aperturas" info="Del proyecto a la tienda lista: actividades, equipo, compras y validaciones." acciones={<Link className="boton boton-secundario" href="/aperturas/inversion">Inversión de apertura</Link>}/>
 {error?<p className="aviso aviso-error">No se pudieron consultar los proyectos. Revisa la migración 0037 de Aperturas.</p>
 :!data?.length?<EstadoVacio titulo="Sin proyectos de apertura" descripcion="Cuando se cargue el proyecto de una sucursal nueva aparecerá aquí."/>
 :<div className="ap-portada">{ordenarProyectos(data,hoy).map(p=>{
   const a=avance[p.id]??{terminados:0,total:0},estado=cuentaRegresiva(p.objetivo_desde,p.objetivo_hasta,hoy,a);
   return <Link key={p.id} href={`/aperturas/${p.id}`} className="ap-tarjeta">
    <span className="estado" data-tono={estado.tono}>{estado.texto}</span>
    <strong className="ap-tarjeta-nombre">{p.sucursales?.nombre??'Sucursal'}</strong>
    <span className="ap-tarjeta-dato">{p.responsable} · {rango(p.objetivo_desde,p.objetivo_hasta)}</span>
    {items&&<span className="ap-tarjeta-avance">
     <progress max={Math.max(1,a.total)} value={a.terminados} aria-label={`Avance de ${p.sucursales?.nombre??'la sucursal'}`}/>
     <small>{a.total?`${a.terminados} de ${a.total} actividades`:'Sin actividades cargadas'}</small>
    </span>}
   </Link>;
  })}</div>}</>;
}

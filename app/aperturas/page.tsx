import Link from 'next/link';
import {obtenerPerfil} from '@/lib/contexto';
import {fechaTexto} from '@/lib/formato';
import type {ProyectoApertura} from '@/lib/aperturas';
export default async function Aperturas() {
 const {supabase}=await obtenerPerfil();const {data,error}=await supabase.from('apertura_proyectos').select('*,sucursales(nombre)').returns<ProyectoApertura[]>();
 return <><div className="encabezado"><h1>Aperturas</h1><p>Del proyecto a la tienda lista: actividades, equipo, compras y validaciones.</p><Link className="boton" href="/aperturas/inversion">Inversión de apertura</Link></div>
 {error?<p className="aviso aviso-error">No se pudieron consultar los proyectos. Revisa la migración 0037 de Aperturas.</p>:!data?.length?<p className="seccion">No hay proyectos cargados. Ejecuta la carga inicial de dodo-2 en Supabase.</p>:data.map(p=><section className="seccion" key={p.id}><h2><Link href={`/aperturas/${p.id}`}>{p.sucursales?.nombre??'Sucursal'}</Link></h2><p>Responsable: {p.responsable}</p><p>Apertura objetivo: {fechaTexto(p.objetivo_desde)} a {fechaTexto(p.objetivo_hasta)}</p><Link className="boton" href={`/aperturas/${p.id}`}>Abrir proyecto</Link></section>)}</>;
}

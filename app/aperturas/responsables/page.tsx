import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {leerTodo} from '@/lib/ventas/paginar';
import {Aviso} from '@/components/Aviso';
import {BotonEnviar} from '@/components/BotonEnviar';
import {Kpi} from '@/app/finanzas/PLAkton';
import {guardarResponsable} from './acciones';

type Responsable={id:string;nombre:string;perfil_id:string|null;externo:boolean;activo:boolean};
type Usuario={id:string;nombre:string|null;activo:boolean;rol:string};

/**
 * Catálogo de responsables de aperturas (HD-27), solo admin: una fila por persona, ligada a su usuario o «Externo».
 * Permite agregar externos, ligar o desligar un usuario, renombrar y activar o desactivar. Un inactivo deja de salir en
 * los selectores, pero conserva sus registros asignados.
 */
export default async function Responsables({searchParams}:{searchParams:Promise<{ok?:string;error?:string}>}) {
 const avisos=await searchParams;const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 const [{data:catalogo,error},{data:usuarios},asignados]=await Promise.all([
  supabase.from('apertura_responsables').select('id,nombre,perfil_id,externo,activo').order('nombre').returns<Responsable[]>(),
  supabase.from('perfiles').select('id,nombre,activo,rol').order('nombre').returns<Usuario[]>(),
  // Registros por responsable; si falla, la columna muestra «—».
  leerTodo<{responsable_id:string|null}>((d,h)=>supabase.from('apertura_items').select('responsable_id').not('responsable_id','is',null).order('id').range(d,h).returns<{responsable_id:string|null}[]>()).catch(()=>null)]);
 const encabezado=<EncabezadoPagina titulo="Responsables de aperturas" info="Una persona por renglón: con usuario de Dodo MX para que vea sus registros, o externa si no entra al sistema." acciones={<Link className="boton boton-secundario" href="/aperturas">Volver a Aperturas</Link>}/>;
 if(error)return <>{encabezado}<p className="aviso aviso-error">No se pudo consultar el catálogo. Revisa que la migración 20261127160000 de responsables esté aplicada.</p></>;
 const lista=catalogo??[],nombreUsuario=new Map((usuarios??[]).map(u=>[u.id,u.nombre??'Usuario sin nombre']));
 const ligados=new Set(lista.map(r=>r.perfil_id).filter((x):x is string=>!!x));
 // Para ligar: usuarios activos sin responsable, sin marketing (no entra a Aperturas: lib/contexto lo manda a Correos).
 // Cada renglón agrega su propio usuario actual.
 const libres=(usuarios??[]).filter(u=>u.activo&&u.rol!=='marketing'&&!ligados.has(u.id));
 const conteo=new Map<string,number>();for(const a of asignados??[])if(a.responsable_id)conteo.set(a.responsable_id,(conteo.get(a.responsable_id)??0)+1);
 const activos=lista.filter(r=>r.activo).length,externos=lista.filter(r=>r.externo).length;
 return <>{encabezado}<Aviso {...avisos}/>
  <div className="akton">
   <section className="akton-kpis" aria-label="Resumen del catálogo">
    <Kpi etiqueta="Responsables activos" valor={activos} pie={`De ${lista.length} en el catálogo`}/>
    <Kpi etiqueta="Con usuario" valor={lista.length-externos} pie="Ven y actualizan sus registros"/>
    <Kpi etiqueta="Externos" valor={externos} pie="Sin acceso al sistema"/>
   </section>
   <section className="akton-tabla-marco ap-seccion-akton" aria-labelledby="ap-resp-nuevo"><h2 id="ap-resp-nuevo" className="akton-titulo">Agregar responsable</h2>
    <form action={guardarResponsable} className="formulario"><div className="rejilla">
     <div className="campo"><label htmlFor="nuevo-nombre">Nombre</label><input id="nuevo-nombre" name="nombre" required maxLength={80} placeholder="Ej. Proveedor de cocina"/></div>
     <div className="campo"><label htmlFor="nuevo-perfil">Usuario</label><select id="nuevo-perfil" name="perfil_id" defaultValue=""><option value="">Externo (sin usuario)</option>{libres.map(u=><option key={u.id} value={u.id}>{u.nombre??'Usuario sin nombre'}</option>)}</select></div>
    </div><BotonEnviar>Agregar</BotonEnviar></form>
   </section>
  </div>
  {!lista.length?<EstadoVacio titulo="Sin responsables" descripcion="Agrega a la primera persona para asignarle registros de apertura."/>:
  <div className="tarjetas ap-responsables">{lista.map(r=>{const n=asignados===null?null:conteo.get(r.id)??0;return <form key={r.id} action={guardarResponsable} className="tarjeta" data-alerta={r.activo?undefined:''}>
   <input type="hidden" name="id" value={r.id}/>
   <div className="tarjeta-encabezado"><h2>{r.nombre}</h2><span className="tarjeta-estado">{r.activo?'Activo':'Inactivo'}</span></div>
   <dl className="tarjeta-datos"><dt>Usuario</dt><dd>{r.perfil_id?nombreUsuario.get(r.perfil_id)??'Usuario ligado':'Externo'}</dd><dt>Registros asignados</dt><dd>{n===null?'—':n}</dd></dl>
   <div className="campo"><label htmlFor={`nombre-${r.id}`}>Nombre</label><input id={`nombre-${r.id}`} name="nombre" required maxLength={80} defaultValue={r.nombre}/></div>
   <div className="campo"><label htmlFor={`perfil-${r.id}`}>Ligar a usuario</label><select id={`perfil-${r.id}`} name="perfil_id" defaultValue={r.perfil_id??''}><option value="">Externo (sin usuario)</option>{r.perfil_id&&<option value={r.perfil_id}>{nombreUsuario.get(r.perfil_id)??'Usuario ligado'}</option>}{libres.map(u=><option key={u.id} value={u.id}>{u.nombre??'Usuario sin nombre'}</option>)}</select></div>
   <label className="ap-casilla"><input type="checkbox" name="activo" defaultChecked={r.activo}/> Activo (aparece en los selectores)</label>
   <BotonEnviar className="boton boton-secundario">Guardar cambios</BotonEnviar>
  </form>;})}</div>}
 </>;
}

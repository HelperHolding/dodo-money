import Link from 'next/link';
import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {codigoActivo,CATEGORIAS,ESTADOS_ACTIVO,avisoMantenimiento,valoresVigentes,type Activo,type Valuacion,type Mantenimiento} from '@/lib/activos';
import {leerTodo} from '@/lib/ventas/paginar';
import {opcionesActivo,type OpcionesActivo} from '@/lib/activosDatos';
import {pesos} from '@/lib/formato';
import {fechaActivo} from '@/lib/activos';
import {Aviso} from '@/components/Aviso';
import type {CambioApertura} from '@/app/aperturas/Historial';
import {HistorialActivo} from '../Historial';
import {Formulario} from '../Formulario';
import {Campo,CamposActivo,CamposMantenimiento} from '../Campos';
import {guardar,valuar,mantener} from '../acciones';
export default async function Ficha({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
 const [{id},avisos]=await Promise.all([params,searchParams]);const {supabase,perfil}=await obtenerPerfil();const {data:a,error}=await supabase.from('activos').select('*,sucursales(nombre)').eq('id',id).maybeSingle<Activo>();if(error)return <p className="aviso aviso-error">No se pudo consultar el activo.</p>;if(!a)notFound();
 let vs:Valuacion[],ms:Mantenimiento[],opciones:OpcionesActivo,hs:CambioApertura[];
 try{[vs,ms,opciones,hs]=await Promise.all([
 leerTodo((d,h)=>supabase.from('activo_valuaciones').select('*').eq('activo_id',id).order('fecha',{ascending:false}).order('orden',{ascending:false}).range(d,h).returns<Valuacion[]>()),
 leerTodo((d,h)=>supabase.from('activo_mantenimientos').select('*').eq('activo_id',id).order('programado').order('id').range(d,h).returns<Mantenimiento[]>()),
 opcionesActivo(supabase),
 leerTodo((d,h)=>supabase.from('activo_historial').select('fecha,anterior,nuevo,perfiles(nombre)').eq('activo_id',id).order('fecha',{ascending:false}).order('id').range(d,h).returns<CambioApertura[]>())]);}catch{return <p className="aviso aviso-error">No se pudo consultar el seguimiento completo. Vuelve a intentar.</p>;}
 const edita=puedeEditarCompras(perfil.rol),hoy=new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'}),v=valoresVigentes(vs).get(id);
 const {data:origen}=a.apertura_item_id?await supabase.from('apertura_items').select('proyecto_id,nombre').eq('id',a.apertura_item_id).maybeSingle():{data:null};
 return <><div className="encabezado"><h1>{a.nombre}</h1><p>{codigoActivo(a.codigo)} · {a.sucursales?.nombre} · {ESTADOS_ACTIVO[a.estado]}</p></div><Aviso {...avisos}/><nav className="acciones"><a href="#identificacion">Identificación</a><a href="#valuacion">Valuación</a><a href="#mantenimiento">Mantenimiento</a></nav>
 <section id="identificacion" className="seccion"><h2>Identificación</h2><dl className="tarjeta-datos">{[['Categoría',CATEGORIAS[a.categoria]],['Ubicación',a.ubicacion],['Responsable',a.responsable],['Marca / modelo',`${a.marca??'Sin marca'} / ${a.modelo??'Sin modelo'}`],['Serie',a.serie],['Condición',a.condicion],['Adquisición',a.adquirido?fechaActivo(a.adquirido):null],['Costo de compra',a.costo===null?'Sin dato':pesos(a.costo)],['Garantía hasta',a.garantia_hasta?fechaActivo(a.garantia_hasta):null],['Evidencia y fotos',a.evidencia]].map(([k,x])=><div key={k} style={{display:'contents'}}><dt>{k}</dt><dd style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{x??'Sin dato'}</dd></div>)}{a.proveedor_id&&<><dt>Proveedor</dt><dd><Link href={`/compras/proveedores/${a.proveedor_id}`}>{opciones.proveedores.find(p=>p.id===a.proveedor_id)?.razon_social??"Ver proveedor"}</Link></dd></>}{a.factura_id&&<><dt>Factura</dt><dd><Link href={`/compras/facturas/${a.factura_id}`}>Ver factura y pagos</Link></dd></>}{origen&&<><dt>Apertura</dt><dd><Link href={`/aperturas/${origen.proyecto_id}/items/${a.apertura_item_id}`}>{origen.nombre}</Link></dd></>}</dl>
 {edita&&<details><summary>Editar ficha o trasladar de sucursal</summary><Formulario accion={guardar}><CamposActivo a={a} {...opciones}/></Formulario></details>}</section>
 <section id="valuacion" className="seccion"><h2>Valuación</h2><p>Valor estimado vigente: <strong>{v?pesos(v.valor):'Sin valuación'}</strong>{v&&` · ${fechaActivo(v.fecha)}`}. Las estimaciones conservan su historial y no modifican el costo de compra.</p>
 {vs.map(v=><article className="seccion" key={v.id}><strong>{pesos(v.valor)} · {fechaActivo(v.fecha)}</strong><p>{v.criterio}</p>{v.evidencia&&<p style={{whiteSpace:'pre-wrap'}}>{v.evidencia}</p>}</article>)}
 {edita&&<details><summary>Registrar nueva valuación</summary><Formulario accion={valuar}><input type="hidden" name="activo_id" value={id}/><div className="rejilla"><Campo nombre="fecha" titulo="Fecha de valuación" tipo="date" valor={hoy} max={hoy} required/><Campo nombre="valor" titulo="Valor estimado MXN" tipo="number" min="0" max="999999999999" required/></div><label className="campo">Criterio<textarea name="criterio" minLength={5} maxLength={2000} required placeholder="Cotización de reposición, comparación de mercado o estimación por condición"/></label><label className="campo">Evidencia<textarea name="evidencia" maxLength={4000} placeholder="Enlaces a cotizaciones, fotos o notas de evaluación"/></label></Formulario></details>}</section>
 <section id="mantenimiento" className="seccion"><h2>Mantenimiento</h2><p>Costo de servicios completados: {pesos(ms.filter(m=>m.estado==='completado').reduce((s,m)=>s+Number(m.costo??0),0))}.</p>{!ms.length&&<p>Sin servicios registrados.</p>}
 {ms.map(m=><article key={m.id} className="seccion"><h3>{m.tarea}</h3><p>{m.tipo==='preventivo'?'Preventivo':'Correctivo'} · {fechaActivo(m.programado)} · <strong>{avisoMantenimiento(m,hoy)}</strong></p><p>{m.tecnico??'Sin técnico asignado'}{m.realizado&&` · Realizado ${fechaActivo(m.realizado)}`}{m.costo!==null&&` · ${pesos(m.costo)}`}</p>{m.evidencia&&<p style={{whiteSpace:'pre-wrap'}}>{m.evidencia}</p>}{edita&&m.estado==='pendiente'&&<details><summary>Actualizar o cerrar servicio</summary><Formulario accion={mantener}><CamposMantenimiento activo={id} m={m}/></Formulario></details>}</article>)}
 {edita&&<details><summary>Programar mantenimiento</summary><Formulario accion={mantener}><CamposMantenimiento activo={id}/></Formulario></details>}</section><HistorialActivo cambios={hs} sucursales={opciones.sucursales}/></>;
}

import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import Link from 'next/link';
import {obtenerPerfil} from '@/lib/contexto';
import {hoyCalendarioMX,pesos} from '@/lib/formato';
import {leerTodo} from '@/lib/ventas/paginar';
import {COLUMNAS_PROYECTO_RESPONSABLE,conNombreSucursal,ordenarProyectos,type NombreApertura,type ProyectoApertura} from '@/lib/aperturas';
import {esAperturas,puedeEditarCompras,puedeVerAperturasCompleto} from '@/lib/roles';
import {resumenPortada,textoDiasApertura,textoPts,type Concepto} from '@/lib/aperturasAkton';
import {Kpi} from '@/app/finanzas/PLAkton';

const diaMes=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'});
const corta=(f:string)=>diaMes.format(new Date(`${f}T00:00:00Z`)).replace('.','');
const rango=(desde:string,hasta:string)=>desde===hasta?corta(desde):`${corta(desde)} – ${corta(hasta)}`;
const plural=(n:number,uno:string,varios:string)=>`${n} ${n===1?uno:varios}`;
type ConceptoPortada=Concepto&{proyecto_id:string};

/**
 * Portada de Aperturas en estilo Akton (docs/diseno/estilo-akton.md): franja de indicadores y una tarjeta por sucursal
 * con días para abrir y avance contra lo esperado a hoy. El avance es el global ponderado por bloque (avanceApertura),
 * el mismo del checklist; por eso la consulta trae la categoría. Primero la apertura más próxima.
 */
export default async function Aperturas() {
 const {supabase,perfil}=await obtenerPerfil();
 // Un responsable (no admin ni corporativo) ve solo las aperturas donde tiene registros (RLS), sin presupuesto ni inversión, y su propio avance (HD-27).
 const completo=puedeVerAperturasCompleto(perfil.rol);
 const [{data:filas,error},items,inversion,nombres]=await Promise.all([
  supabase.from('apertura_proyectos').select(completo?'*,sucursales(nombre)':COLUMNAS_PROYECTO_RESPONSABLE).returns<ProyectoApertura[]>(),
  leerTodo<ConceptoPortada>((d,h)=>supabase.from('apertura_items').select('id,proyecto_id,nombre,tipo,etapa,estado,categoria,inicio,fin,responsable,notas').order('id').range(d,h).returns<ConceptoPortada[]>()).catch(()=>null),
  // Si la tabla de inversión no existe o falla, la franja muestra «—».
  !completo?Promise.resolve(null):Promise.resolve(supabase.from('inversion_apertura_fuentes').select('total').returns<{total:number}[]>()).then(r=>r.error?null:{total:(r.data??[]).reduce((s,f)=>s+Number(f.total),0),fuentes:(r.data??[]).length}).catch(()=>null),
  // Nombre de la sucursal para el responsable (el RLS de sucursales no se lo deja embeber). Si falla, «Sucursal».
  completo?Promise.resolve(null):Promise.resolve(supabase.rpc('nombres_aperturas_visibles')).then(r=>r.error?null:(r.data as NombreApertura[]|null)??[]).catch(()=>null),
 ]);
 const data=completo?filas:filas?.map(p=>conNombreSucursal(p,nombres));
 const hoy=hoyCalendarioMX();
 const encabezado=completo?<EncabezadoPagina titulo="Aperturas" info="Del proyecto a la tienda lista: actividades, equipo, compras y validaciones." acciones={<>{puedeEditarCompras(perfil.rol)&&<Link className="boton boton-secundario" href="/aperturas/responsables">Responsables</Link>}<Link className="boton boton-secundario" href="/aperturas/inversion">Inversión de apertura</Link></>}/>
  :<EncabezadoPagina titulo="Aperturas" info="Las aperturas donde tienes actividades. El avance cuenta solo los registros a tu nombre."/>;
 if(error)return <>{encabezado}<p className="aviso aviso-error">No se pudieron consultar los proyectos. Revisa la migración 0037 de Aperturas.</p></>;
 if(!data?.length){
  // El puesto aperturas sin fila en el catálogo nunca verá registros: se le dice a quién pedirlo (si la consulta falla, el aviso general).
  const sinCatalogo=esAperturas(perfil.rol)&&await Promise.resolve(supabase.rpc('mi_responsable_id')).then(r=>!r.error&&r.data===null).catch(()=>false);
  return <>{encabezado}{completo?<EstadoVacio titulo="Sin proyectos de apertura" descripcion="Cuando se cargue el proyecto de una sucursal nueva aparecerá aquí."/>
   :sinCatalogo?<EstadoVacio titulo="Sin actividades a tu nombre" descripcion="Aún no tienes actividades asignadas. Pide a administración que te ligue en el catálogo de responsables."/>
   :<EstadoVacio titulo="Sin actividades a tu nombre" descripcion="Cuando te asignen una actividad de apertura aparecerá aquí."/>}</>;
 }
 // Sin el avance no se sabe si una apertura pasada ya abrió: no se inventan vencidas, atrasadas ni «en curso».
 const sinAvance=items===null;
 const r=resumenPortada(data,items??[],hoy,{avanceAbre:completo}),nombre=(id:string)=>data.find(p=>p.id===id)?.sucursales?.nombre??'Sucursal';
 return <>{encabezado}
  <div className="akton">
   <section className="akton-kpis" aria-label="Indicadores de aperturas">
    <Kpi etiqueta="Aperturas en curso" valor={sinAvance?'—':r.enCurso} pie={`De ${plural(data.length,'proyecto','proyectos')}`}/>
    <Kpi etiqueta="Próxima apertura" tono={r.proxima?'destacado':undefined} valor={r.proxima?(r.proxima.dias===0?'Hoy':plural(r.proxima.dias,'día','días')):'Ninguna programada'} pie={r.proxima?nombre(r.proxima.id):'Sin aperturas por venir'}/>
    <Kpi etiqueta="Atrasadas contra lo esperado" tono={!sinAvance&&r.atrasados?'no':undefined} valor={sinAvance?'—':r.atrasados} pie="Más de 5 pts abajo de lo esperado a hoy"/>
    {completo&&<Kpi etiqueta="Inversión registrada" valor={inversion===null||inversion.fuentes===0?'—':pesos(inversion.total)} pie={inversion&&inversion.fuentes>0?<>Total de {inversion.fuentes===1?'1 fuente':`${inversion.fuentes} fuentes`} · <Link href="/aperturas/inversion">ver detalle</Link></>:<Link href="/aperturas/inversion">Ver Inversión de apertura</Link>}/>}
   </section>
   {sinAvance&&<p className="aviso aviso-error">No se pudo consultar el avance de las aperturas.</p>}
   <div className="ap-portada">{ordenarProyectos(data,hoy).map(p=>{
    const t=r.tarjetas[p.id],a=t.avance,dias=textoDiasApertura(t.dias),pasada=t.dias.tipo==='vencida'||t.dias.tipo==='abierta';
    // El avance es el de lo que ve quien entra (para un responsable, solo lo suyo por RLS).
    const etiqueta=completo?'Avance':'Tu avance';
    return <Link key={p.id} href={`/aperturas/${p.id}`} className="ap-tarjeta ap-tarjeta-akton">
     <span className="akton-kpi-etiqueta">{p.sucursales?.nombre??'Sucursal'}</span>
     {sinAvance&&pasada?<strong className="ap-tarjeta-dias">Sin dato de avance</strong>
      :<strong className="ap-tarjeta-dias" data-tono={dias.tono}>{dias.valor}{t.dias.tipo==='faltan'&&<small> {t.dias.dias===1?'día':'días'}</small>}</strong>}
     <small className="ap-tarjeta-dato">{p.responsable} · {rango(p.objetivo_desde,p.objetivo_hasta)}</small>
     {!sinAvance&&<div className="ap-avance" data-favorable={a.favorable??undefined}>
      <div className="ap-avance-cabeza"><b className="ap-avance-pct">{a.real===null?'—':`${a.real} %`}</b><span>{completo?'de avance':'tu avance'}</span></div>
      <div className="ap-avance-pista" role="progressbar" aria-label={`${etiqueta} de la apertura`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.real??undefined}><i style={{width:`${a.real??0}%`}}/></div>
     </div>}
     {!sinAvance&&<span className="ap-tarjeta-linea">{a.esperado===null||a.realConFecha===null?'esperado sin fechas':`con fecha ${a.realConFecha} % vs ${a.esperado} % esperado`}
      {a.variacion!==null&&<b className="akton-var" data-favorable={a.favorable??undefined}> {textoPts(a.variacion)}</b>}</span>}
     {(t.vencidas>0||t.bloqueadas>0)&&<p className="akton-nota">{[t.vencidas?plural(t.vencidas,'vencida','vencidas'):'',t.bloqueadas?plural(t.bloqueadas,'bloqueada','bloqueadas'):''].filter(Boolean).join(' · ')}</p>}
    </Link>;
   })}</div>
  </div></>;
}

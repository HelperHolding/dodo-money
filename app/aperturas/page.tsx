import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import Link from 'next/link';
import {obtenerPerfil} from '@/lib/contexto';
import {hoyCalendarioMX,pesos} from '@/lib/formato';
import {leerTodo} from '@/lib/ventas/paginar';
import {ordenarProyectos,type ProyectoApertura} from '@/lib/aperturas';
import {resumenPortada,textoDiasApertura,textoPts,type Concepto} from '@/lib/aperturasAkton';
import {Kpi} from '@/app/finanzas/PLAkton';

const diaMes=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'});
const corta=(f:string)=>diaMes.format(new Date(`${f}T00:00:00Z`)).replace('.','');
const rango=(desde:string,hasta:string)=>desde===hasta?corta(desde):`${corta(desde)} – ${corta(hasta)}`;
const plural=(n:number,uno:string,varios:string)=>`${n} ${n===1?uno:varios}`;
type ConceptoPortada=Concepto&{proyecto_id:string};

/**
 * Portada de Aperturas en estilo Akton (docs/diseno/estilo-akton.md): franja de indicadores y una tarjeta por sucursal
 * con días para abrir y avance contra lo esperado a hoy. Primero la apertura más próxima.
 */
export default async function Aperturas() {
 const {supabase}=await obtenerPerfil();
 const [{data,error},items,inversion]=await Promise.all([
  supabase.from('apertura_proyectos').select('*,sucursales(nombre)').returns<ProyectoApertura[]>(),
  leerTodo<ConceptoPortada>((d,h)=>supabase.from('apertura_items').select('id,proyecto_id,nombre,tipo,etapa,estado,inicio,fin,responsable,notas').order('id').range(d,h).returns<ConceptoPortada[]>()).catch(()=>null),
  // Si la tabla de inversión no existe o falla, la franja muestra «—».
  Promise.resolve(supabase.from('inversion_apertura_fuentes').select('total').returns<{total:number}[]>()).then(r=>r.error?null:(r.data??[]).reduce((s,f)=>s+Number(f.total),0)).catch(()=>null),
 ]);
 const hoy=hoyCalendarioMX();
 const encabezado=<EncabezadoPagina titulo="Aperturas" info="Del proyecto a la tienda lista: actividades, equipo, compras y validaciones." acciones={<Link className="boton boton-secundario" href="/aperturas/inversion">Inversión de apertura</Link>}/>;
 if(error)return <>{encabezado}<p className="aviso aviso-error">No se pudieron consultar los proyectos. Revisa la migración 0037 de Aperturas.</p></>;
 if(!data?.length)return <>{encabezado}<EstadoVacio titulo="Sin proyectos de apertura" descripcion="Cuando se cargue el proyecto de una sucursal nueva aparecerá aquí."/></>;
 const r=resumenPortada(data,items??[],hoy),nombre=(id:string)=>data.find(p=>p.id===id)?.sucursales?.nombre??'Sucursal';
 return <>{encabezado}
  <div className="akton">
   <section className="akton-kpis" aria-label="Indicadores de aperturas">
    <Kpi etiqueta="Aperturas en curso" valor={r.enCurso} pie={`De ${plural(data.length,'proyecto','proyectos')}`}/>
    <Kpi etiqueta="Próxima apertura" tono={r.proxima?'destacado':undefined} valor={r.proxima?(r.proxima.dias===0?'Hoy':plural(r.proxima.dias,'día','días')):'Ninguna programada'} pie={r.proxima?nombre(r.proxima.id):'Sin aperturas por venir'}/>
    <Kpi etiqueta="Atrasadas contra lo esperado" tono={r.atrasados?'no':undefined} valor={r.atrasados} pie="Más de 5 pts abajo de lo esperado a hoy"/>
    <Kpi etiqueta="Inversión registrada" valor={inversion===null?'—':pesos(inversion)} pie={<Link href="/aperturas/inversion">Ver Inversión de apertura</Link>}/>
   </section>
   {items===null&&<p className="aviso aviso-error">No se pudo consultar el avance de las aperturas.</p>}
   <div className="ap-portada">{ordenarProyectos(data,hoy).map(p=>{
    const t=r.tarjetas[p.id],a=t.avance,dias=textoDiasApertura(t.dias);
    return <Link key={p.id} href={`/aperturas/${p.id}`} className="ap-tarjeta ap-tarjeta-akton">
     <span className="akton-kpi-etiqueta">{p.sucursales?.nombre??'Sucursal'}</span>
     <strong className="ap-tarjeta-dias" data-tono={dias.tono}>{dias.valor}{t.dias.tipo==='faltan'&&<small> {t.dias.dias===1?'día':'días'}</small>}</strong>
     <small className="ap-tarjeta-dato">{p.responsable} · {rango(p.objetivo_desde,p.objetivo_hasta)}</small>
     <span className="ap-tarjeta-linea">Avance {a.real===null?'—':`${a.real} %`} · esperado {a.esperado===null?'sin fechas':`${a.esperado} %`}
      {a.variacion!==null&&<b className="akton-var" data-favorable={a.favorable??undefined}> {textoPts(a.variacion)}</b>}</span>
     {(t.vencidas>0||t.bloqueadas>0)&&<p className="akton-nota">{[t.vencidas?plural(t.vencidas,'vencida','vencidas'):'',t.bloqueadas?plural(t.bloqueadas,'bloqueada','bloqueadas'):''].filter(Boolean).join(' · ')}</p>}
    </Link>;
   })}</div>
  </div></>;
}

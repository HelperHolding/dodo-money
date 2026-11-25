import Link from 'next/link';
import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {fechaTexto,hoyCalendarioMX} from '@/lib/formato';
import type {ItemApertura} from '@/lib/aperturas';
import {urlsFotos} from '../../fotos/urls';
import {Imprimir} from './Imprimir';

const MAX=150;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():typeof v==='number'?String(v):'—';

// Solicitud de cotización para proveedores: las partidas marcadas en Equipo y compras, con foto y datos de Dodo, y columnas vacías para precio y entrega.
export default async function Cotizacion({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{items?:string|string[]}>}) {
 const [{id},q]=await Promise.all([params,searchParams]);
 const {supabase}=await obtenerPerfil();
 const crudos=Array.isArray(q.items)?q.items:q.items?[q.items]:[];
 const validos=[...new Set(crudos.filter(x=>UUID.test(x)))];
 const ids=validos.slice(0,MAX);
 const {data:p,error:ep}=await supabase.from('apertura_proyectos').select('id,sucursales(nombre)').eq('id',id).maybeSingle<{id:string;sucursales:{nombre:string}|null}>();
 if(ep)return <p className="aviso aviso-error">No se pudo cargar el proyecto.</p>;
 if(!p)notFound();
 const volver=`/aperturas/${id}?vista=compras`;
 const {data:partidas,error:ei}=ids.length?await supabase.from('apertura_items').select('id,clave,nombre,cantidad,original').in('id',ids).eq('proyecto_id',id).order('clave').returns<Pick<ItemApertura,'id'|'clave'|'nombre'|'cantidad'|'original'>[]>():{data:[],error:null};
 if(ei)return <p className="aviso aviso-error">No se pudieron cargar las partidas.</p>;
 if(!partidas?.length)return <section className="akton-tabla-marco"><p className="akton-subtitulo">Elige al menos una partida en Equipo y compras.</p><Link href={volver}>Volver a Equipo y compras</Link></section>;
 // Fotos: si falla la consulta o las firmas, la solicitud sale sin fotos.
 const fotos:Record<string,string>=await (async()=>{
  try{
   const {data,error}=await supabase.from('apertura_item_dodo').select('item_id,foto_proyecto,foto_real').eq('proyecto_id',id).in('item_id',partidas.map(i=>i.id)).returns<{item_id:string;foto_proyecto:string|null;foto_real:string|null}[]>();
   if(error||!data)return {};
   const rutas:Record<string,string>={};for(const r of data){const ruta=r.foto_real??r.foto_proyecto;if(ruta)rutas[r.item_id]=ruta;}
   const firmadas=await urlsFotos(Object.values(rutas));
   const salida:Record<string,string>={};for(const [item,ruta] of Object.entries(rutas))if(firmadas[ruta])salida[item]=firmadas[ruta];
   return salida;
  }catch{return {};}
 })();
 const hoy=hoyCalendarioMX();
 return <div className="ap-cotizacion">
  <div className="ap-cot-botones acciones"><Imprimir/><Link className="boton boton-secundario" href={volver}>Volver</Link></div>
  <div className="ap-cotizacion-imprimible">
   <header className="ap-cot-encabezado">
    <h1>Solicitud de cotización · {p.sucursales?.nombre??'Sucursal'}</h1>
    <p>{fechaTexto(hoy)} · Dodo Pizza México</p>
   </header>
   {validos.length>MAX&&<p className="ap-cot-aviso">{`Se incluyen las primeras ${MAX} partidas seleccionadas.`}</p>}
   <div className="tabla-contenedor"><table className="akton-tabla ap-cot-tabla">
    <thead><tr><th>#</th><th>Foto</th><th>Clave</th><th>Concepto</th><th>Código</th><th>Descripción o modelo</th><th>Medidas</th><th>kW</th><th>Cantidad</th><th>Precio unitario</th><th>Tiempo de entrega</th></tr></thead>
    <tbody>{partidas.map((i,n)=>{const o=i.original??{};const cant=i.cantidad??(typeof o.cantidad==='number'?o.cantidad:null);const unidad=typeof o.unidad==='string'&&o.unidad?` ${o.unidad}`:'';return <tr key={i.id}>
     <td>{n+1}</td>
     <td>{fotos[i.id]?<img className="ap-cot-foto" src={fotos[i.id]} alt={i.nombre}/>:<span className="ap-cot-foto" aria-hidden="true"/>}</td>
     <td>{i.clave}</td>
     <td>{i.nombre}</td>
     <td>{texto(o.codigo)}</td>
     <td>{texto(o.descripcion)}</td>
     <td>{texto(o.medidas)}</td>
     <td>{texto(o.potencia)}</td>
     <td>{cant===null?'—':`${cant}${unidad}`}</td>
     <td className="ap-cot-vacia"></td>
     <td className="ap-cot-vacia"></td>
    </tr>;})}</tbody>
   </table></div>
   <p className="ap-cot-pie">Precios sin IVA. Indicar vigencia de la cotización y condiciones de pago.</p>
  </div>
 </div>;
}

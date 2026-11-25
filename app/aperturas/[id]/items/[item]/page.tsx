import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {CATEGORIAS,ESTADOS,ETAPAS,estadosPara,type ItemApertura,type ProyectoApertura} from '@/lib/aperturas';
import {pesos,fechaTexto,hoyCalendarioMX} from '@/lib/formato';
import {Kpi} from '@/app/finanzas/PLAkton';
import {diasVencido,fechaConcepto,tonoConcepto} from '@/lib/aperturasAkton';
import {Aviso} from '@/components/Aviso';
import {TareasDelDocumento} from '@/components/TareasDelDocumento';
import {BotonEnviar} from '@/components/BotonEnviar';
import {guardarItem} from '../../../acciones';
import {Historial,type CambioApertura} from '../../../Historial';
import {sugerenciasResponsable} from '@/lib/aperturasCalendario';
export default async function Item({params,searchParams}:{params:Promise<{id:string;item:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
 const [{id,item},avisos]=await Promise.all([params,searchParams]);const {supabase,perfil}=await obtenerPerfil();
 const [{data:p,error:ep},{data:i,error}]=await Promise.all([supabase.from('apertura_proyectos').select('*,sucursales(nombre)').eq('id',id).maybeSingle<ProyectoApertura>(),supabase.from('apertura_items').select('*').eq('id',item).eq('proyecto_id',id).maybeSingle<ItemApertura>()]);
 if(error||ep)return <p className="aviso aviso-error">No se pudo consultar el registro.</p>;if(!p||!i)notFound();const edita=puedeEditarCompras(perfil.rol),compra=i.tipo==='equipo'||i.tipo==='referencia';
 const [{data:ordenes,error:eo},{data:facturas,error:ef},{data:historial,error:eh}]=await Promise.all([
 supabase.from('ordenes_compra').select('id,folio,estado').eq('sucursal_id',p.sucursal_id).order('creado_en',{ascending:false}).limit(1000).returns<{id:string;folio:string;estado:string}[]>(),
 supabase.from('facturas').select('id,folio,total,estado').eq('sucursal_id',p.sucursal_id).order('creado_en',{ascending:false}).limit(1000).returns<{id:string;folio:string|null;total:number;estado:string}[]>(),
 supabase.from('apertura_historial').select('fecha,anterior,nuevo,perfiles(nombre)').eq('item_id',item).order('fecha',{ascending:false}).limit(50).returns<CambioApertura[]>()]);
 // Sugerencias del responsable: si alguna consulta falla, el campo sigue siendo texto libre.
 const [{data:usuarios},{data:usados}]=edita?await Promise.all([supabase.from('perfiles').select('nombre').eq('activo',true).returns<{nombre:string|null}[]>(),supabase.from('apertura_items').select('responsable').eq('proyecto_id',id).not('responsable','is',null).returns<{responsable:string|null}[]>()]):[{data:null},{data:null}];
 const sugeridos=sugerenciasResponsable((usuarios??[]).map(u=>u.nombre),(usados??[]).map(u=>u.responsable));
 const hoy=hoyCalendarioMX(),tono=tonoConcepto(i,hoy),vencida=diasVencido(i,hoy),fecha=fechaConcepto(i);
 if(eo||ef||eh)return <p className="aviso aviso-error">No se pudo consultar el seguimiento completo. Vuelve a intentar antes de editar.</p>;
 return <><EncabezadoPagina titulo={<>{i.nombre}</>} descripcion={<>{p.sucursales?.nombre} · {i.clave} · {ETAPAS[i.etapa]}</>} /><Link href={`/aperturas/${id}?vista=${compra?'compras':i.tipo==='tecnico'?'tecnico':'actividades'}`}>Volver a la lista</Link><Aviso {...avisos}/><TareasDelDocumento supabase={supabase} tipo="apertura_item" id={item} rol={perfil.rol} hoy={hoy} />
 <div className="akton"><section className="akton-kpis" aria-label="Resumen de la tarea">
  <Kpi etiqueta="Estado" tono={tono==='listo'?'si':tono==='alerta'?'no':undefined} valor={ESTADOS[i.estado]} pie={`Responsable: ${i.responsable??'Sin asignar'}`}/>
  <Kpi etiqueta="Fecha" tono={vencida!==null?'no':undefined} valor={fecha?fechaTexto(fecha):'Sin fecha'} pie={vencida!==null?`Vencida hace ${vencida} ${vencida===1?'día':'días'}`:i.inicio&&i.fin&&i.inicio!==i.fin?`${fechaTexto(i.inicio)} – ${fechaTexto(i.fin)}`:fecha?(i.fin?'Fin previsto':'Inicio previsto'):'Sin programar'}/>
  {compra?<Kpi etiqueta="Cantidad / recibido" valor={`${i.cantidad??'—'} / ${i.recibido}`} pie={typeof i.original.unidad==='string'?i.original.unidad:i.cantidad===null?'Cantidad por confirmar':'Unidades'}/>
   :<Kpi etiqueta="Categoría" valor={i.categoria?CATEGORIAS[i.categoria]?.nombre??i.categoria:'Sin categoría'} pie={i.categoria?`Hoja ${CATEGORIAS[i.categoria]?.hoja??'—'}`:ETAPAS[i.etapa]}/>}
  {compra&&<Kpi etiqueta="Importe con IVA" valor={i.cantidad!==null&&i.precio!==null?pesos(Number(i.cantidad)*Number(i.precio)):'—'} pie={i.precio===null?'Sin precio':`Precio unitario con IVA: ${pesos(i.precio)}`}/>}
 </section>
 <section className="akton-tabla-marco" aria-labelledby="ap-seguimiento"><h2 id="ap-seguimiento" className="akton-titulo">Seguimiento</h2>
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla ap-tabla-datos"><tbody>
   <tr><th scope="row">Categoría</th><td data-label="Categoría">{i.categoria?`${CATEGORIAS[i.categoria]?.hoja} · ${CATEGORIAS[i.categoria]?.nombre}`:'Sin categoría'}</td></tr>
   {compra&&<tr><th scope="row">Precio unitario estimado</th><td data-label="Precio unitario estimado">{i.precio===null?'Sin cotizar':pesos(i.precio)}</td></tr>}
   {i.orden_id&&<tr><th scope="row">Orden vinculada</th><td data-label="Orden vinculada"><Link href={`/compras/ordenes/${i.orden_id}`}>{ordenes?.find(o=>o.id===i.orden_id)?.folio??'Ver orden'}</Link></td></tr>}
   {i.factura_id&&<tr><th scope="row">Factura y pagos</th><td data-label="Factura y pagos"><Link href={`/compras/facturas/${i.factura_id}`}>{facturas?.find(f=>f.id===i.factura_id)?.folio??'Ver factura'}</Link></td></tr>}
   <tr><th scope="row">Evidencia</th><td data-label="Evidencia" className="texto-libre">{i.evidencia??'—'}</td></tr>
   <tr><th scope="row">Notas</th><td data-label="Notas" className="texto-saltos">{i.notas??'—'}</td></tr>
  </tbody></table></div>
 </section>
 <section className="akton-tabla-marco" aria-labelledby="ap-origen"><h2 id="ap-origen" className="akton-titulo">Origen y especificaciones</h2><p className="akton-subtitulo">{i.fuente}</p>
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla ap-tabla-datos"><tbody>{Object.entries(i.original).filter(([k,v])=>v!==null&&v!==''&&!['id','fuente','nombre','grupo','hoja'].includes(k)).map(([k,v])=>{const etiqueta=({descripcion:'Especificación original',cantidad:'Cantidad de referencia',medidas:'Medidas explícitas',potencia:'Potencia kW',codigo:'Código',unidad:'Unidad',apertura:'Apertura de puerta',altura:'Altura de salida',area:'Área',muros:'Muros',plafon:'Plafón',detalle:'Detalle',historico:'Antecedente de apertura anterior',explicacion:'Explicación original'} as Record<string,string>)[k]??k;return <tr key={k}><th scope="row">{etiqueta}</th><td data-label={etiqueta} className="texto-libre">{typeof v==='object'?JSON.stringify(v):String(v)}</td></tr>;})}</tbody></table></div>
  <p className="akton-subtitulo">{i.tipo==='referencia'?'Las cantidades y avances de la apertura anterior son referencia; confirma su aplicación para dodo-2.':i.tipo==='equipo'?'Especificaciones del plano; el seguimiento registra las compras y entregas de dodo-2.':'Fechas y criterios propuestos; confirma su cumplimiento con el responsable.'}</p></section></div>
 {edita&&<section className="akton-tabla-marco ap-seccion-akton"><h2 className="akton-titulo">Actualizar seguimiento</h2><form action={guardarItem} className="formulario"><input type="hidden" name="proyecto_id" value={id}/><input type="hidden" name="item_id" value={item}/><input type="hidden" name="revision" value={i.revision}/><div className="rejilla"><div className="campo"><label htmlFor="estado">Estado</label><select id="estado" name="estado" defaultValue={i.estado}>{estadosPara(i.tipo).map(s=><option key={s} value={s}>{ESTADOS[s]}</option>)}</select></div><div className="campo"><label htmlFor="responsable">Responsable de este registro</label><input id="responsable" name="responsable" maxLength={200} defaultValue={i.responsable??''} list="responsables-sugeridos" autoComplete="off" placeholder="Elige de la lista o escribe un nombre"/><datalist id="responsables-sugeridos">{sugeridos.map(n=><option key={n} value={n}/>)}</datalist><small>Usa el mismo nombre de la lista para que el calendario lo agrupe y filtre bien.</small></div><div className="campo"><label htmlFor="inicio">Inicio previsto</label><input id="inicio" name="inicio" type="date" defaultValue={i.inicio??''}/></div><div className="campo"><label htmlFor="fin">Fin previsto / entrega</label><input id="fin" name="fin" type="date" defaultValue={i.fin??''}/></div>
 <div className="campo"><label htmlFor="categoria">Categoría</label><select id="categoria" name="categoria" defaultValue={i.categoria??''}><option value="">Sin categoría</option>{Object.entries(CATEGORIAS).map(([k,c])=><option key={k} value={k}>{c.hoja} · {c.nombre}</option>)}</select></div>
 {compra?<>{[['cantidad','Cantidad necesaria',i.cantidad],['recibido','Cantidad recibida',i.recibido],['precio','Precio unitario estimado con IVA MXN',i.precio]].map(([c,t,v])=><div className="campo" key={String(c)}><label htmlFor={String(c)}>{t}</label><input id={String(c)} name={String(c)} type="number" min={c==='cantidad'?'0.0001':'0'} max={c==='precio'?'999999999':'99999999'} step="0.0001" defaultValue={v===null?'':String(v)}/></div>)}<div className="campo"><label htmlFor="orden_id">Orden de compra</label><select id="orden_id" name="orden_id" defaultValue={i.orden_id??''}><option value="">Sin vincular</option>{ordenes?.map(o=><option key={o.id} value={o.id}>{o.folio} · {o.estado}</option>)}</select></div><div className="campo"><label htmlFor="factura_id">Factura</label><select id="factura_id" name="factura_id" defaultValue={i.factura_id??''}><option value="">Sin vincular</option>{facturas?.map(f=><option key={f.id} value={f.id}>{f.folio??'Sin folio'} · {pesos(f.total)} · {f.estado}</option>)}</select></div></>:<><input type="hidden" name="cantidad" value=""/><input type="hidden" name="recibido" value="0"/><input type="hidden" name="precio" value=""/><input type="hidden" name="orden_id" value=""/><input type="hidden" name="factura_id" value=""/></>}
 </div><div className="campo"><label htmlFor="evidencia">Evidencia o motivo de no aplicar</label><textarea id="evidencia" name="evidencia" rows={3} maxLength={4000} defaultValue={i.evidencia??''} placeholder="Resultado de prueba, recepción, aprobación o enlace al documento"/><small>Obligatoria para completar, verificar o descartar. Una recepción completa requiere confirmar cantidad y unidades recibidas.</small></div><div className="campo"><label htmlFor="notas">Notas / bloqueo</label><textarea id="notas" name="notas" rows={3} maxLength={4000} defaultValue={i.notas??''}/></div><BotonEnviar>Guardar seguimiento</BotonEnviar></form></section>}
 {edita&&compra&&["recibido_parcial","recibido","instalado","verificado"].includes(i.estado)&&<p><Link className="boton" href={`/activos/nuevo?origen=${item}`}>Registrar una unidad como activo</Link></p>}
 <Historial cambios={historial??[]}/></>;
}

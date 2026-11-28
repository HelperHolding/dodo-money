import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras,puedeVerAperturasCompleto} from '@/lib/roles';
import {CATEGORIAS,COLUMNAS_FICHA_RESPONSABLE,COLUMNAS_PROYECTO_RESPONSABLE,ETAPAS,estadosPara,nombreEstado,type ItemApertura,type ProyectoApertura} from '@/lib/aperturas';
import {pesos,fechaTexto,hoyCalendarioMX} from '@/lib/formato';
import {Kpi} from '@/app/finanzas/PLAkton';
import {diasVencido,fechaConcepto,tonoConcepto} from '@/lib/aperturasAkton';
import {Aviso} from '@/components/Aviso';
import {TareasDelDocumento} from '@/components/TareasDelDocumento';
import {BotonEnviar} from '@/components/BotonEnviar';
import {agregarBitacora,guardarItem,guardarSeguimiento} from '../../../acciones';
import {Historial,type CambioApertura} from '../../../Historial';
import {sugerenciasResponsable} from '@/lib/aperturasCalendario';
import {FotoReal} from '@/app/aperturas/fotos/FotoReal';
import {urlsFotos} from '@/app/aperturas/fotos/urls';
import {codigoDeItem,estatusDodo} from '@/lib/aperturas/matrizDodo';
import {SelectorResponsable} from './SelectorResponsable';
import {VentanaDividir} from './VentanaDividir';

type Responsable={id:string;nombre:string;activo:boolean;perfil_id:string|null};
type EntradaBitacora={id:string;fecha:string;avance:number|null;estatus:string|null;comentario:string;perfiles:{nombre:string|null}|null};
// Claves con dinero o documentos de compra: no se muestran en el historial de quien no ve compras (HD-27).
const DINERO=['precio','orden_id','factura_id','original'];
const sinDinero=(h:CambioApertura):CambioApertura=>{const limpia=(o:Record<string,unknown>)=>Object.fromEntries(Object.entries(o??{}).filter(([k])=>!DINERO.includes(k)));return {...h,anterior:limpia(h.anterior),nuevo:limpia(h.nuevo)};};

/**
 * Ficha de un registro de apertura. Admin edita todo (nombre, descripción, responsable del catálogo, compras) y puede dividirlo;
 * corporativo solo consulta; el responsable del registro (HD-27) ve una lista segura de columnas, sin precio, orden, factura,
 * origen con precios ni activos, y solo cambia estado, fechas, notas y evidencia. Bitácora para admin y el responsable.
 * Sin la migración de responsables (catálogo ausente), la ficha de admin sigue con el responsable como texto libre.
 */
export default async function Item({params,searchParams}:{params:Promise<{id:string;item:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
 const [{id,item},avisos]=await Promise.all([params,searchParams]);const {supabase,perfil}=await obtenerPerfil();
 const completo=puedeVerAperturasCompleto(perfil.rol),edita=puedeEditarCompras(perfil.rol);
 const [{data:p,error:ep},{data:i0,error},catalogo]=await Promise.all([
  supabase.from('apertura_proyectos').select(completo?'*,sucursales(nombre)':COLUMNAS_PROYECTO_RESPONSABLE).eq('id',id).maybeSingle<ProyectoApertura>(),
  supabase.from('apertura_items').select(completo?'*':COLUMNAS_FICHA_RESPONSABLE).eq('id',item).eq('proyecto_id',id).maybeSingle<ItemApertura>(),
  // Si el catálogo no existe (migración pendiente) o falla, null: sin selector, bitácora ni división.
  Promise.resolve(supabase.from('apertura_responsables').select('id,nombre,activo,perfil_id').order('nombre').returns<Responsable[]>()).then(r=>r.error?null:r.data??[]).catch(()=>null)]);
 if(error||ep)return <p className="aviso aviso-error">No se pudo consultar el registro.</p>;if(!p||!i0)notFound();
 // Sin precio, orden, factura ni fila original aunque el tipo los pida: se rellenan en el servidor.
 const i:ItemApertura=completo?i0:{...i0,precio:null,orden_id:null,factura_id:null,original:{}};
 const compra=i.tipo==='equipo'||i.tipo==='referencia',hayMigracion=catalogo!==null;
 const miResponsable=catalogo?.find(r=>r.perfil_id===perfil.id)?.id??null;
 // El responsable del registro (no admin) edita lo suyo; la función de la base vuelve a validarlo.
 const esResponsable=!edita&&hayMigracion&&!!miResponsable&&i.responsable_id===miResponsable;
 const vacio=Promise.resolve({data:[],error:null});
 const [{data:ordenes,error:eo},{data:facturas,error:ef},{data:historial,error:eh},bitacora,{data:hijas},{data:origen}]=await Promise.all([
  completo?supabase.from('ordenes_compra').select('id,folio,estado').eq('sucursal_id',p.sucursal_id).order('creado_en',{ascending:false}).limit(1000).returns<{id:string;folio:string;estado:string}[]>():vacio,
  completo?supabase.from('facturas').select('id,folio,total,estado').eq('sucursal_id',p.sucursal_id).order('creado_en',{ascending:false}).limit(1000).returns<{id:string;folio:string|null;total:number;estado:string}[]>():vacio,
  supabase.from('apertura_historial').select('fecha,anterior,nuevo,perfiles(nombre)').eq('item_id',item).order('fecha',{ascending:false}).limit(50).returns<CambioApertura[]>(),
  !hayMigracion?Promise.resolve(null):Promise.resolve(supabase.from('apertura_bitacora').select('id,fecha,avance,estatus,comentario,perfiles(nombre)').eq('item_id',item).order('fecha',{ascending:false}).order('creado_en',{ascending:false}).limit(200).returns<EntradaBitacora[]>()).then(r=>r.error?null:r.data??[]).catch(()=>null),
  hayMigracion?supabase.from('apertura_items').select('id,clave,nombre').eq('origen_id',item).order('clave').returns<{id:string;clave:string;nombre:string}[]>():Promise.resolve({data:null}),
  i.origen_id?supabase.from('apertura_items').select('id,clave').eq('id',i.origen_id).maybeSingle<{id:string;clave:string}>():Promise.resolve({data:null})]);
 // Sugerencias del responsable en texto libre, solo sin catálogo: si alguna consulta falla, el campo sigue siendo texto libre.
 const [{data:usuarios},{data:usados}]=edita&&!hayMigracion?await Promise.all([supabase.from('perfiles').select('nombre').eq('activo',true).returns<{nombre:string|null}[]>(),supabase.from('apertura_items').select('responsable').eq('proyecto_id',id).not('responsable','is',null).returns<{responsable:string|null}[]>()]):[{data:null},{data:null}];
 const sugeridos=sugerenciasResponsable((usuarios??[]).map(u=>u.nombre),(usados??[]).map(u=>u.responsable));
 const hoy=hoyCalendarioMX(),tono=tonoConcepto(i,hoy),vencida=diasVencido(i,hoy),fecha=fechaConcepto(i);
 const responsableNombre=(i.responsable_id&&catalogo?.find(r=>r.id===i.responsable_id)?.nombre)||i.responsable||'Sin asignar';
 // Opciones del selector: activos, más el actual aunque esté inactivo para no perderlo al guardar.
 const opciones=(catalogo??[]).filter(r=>r.activo||r.id===i.responsable_id).map(({id,nombre})=>({id,nombre}));
 // Fotos de Dodo (HD-16): solo equipo y referencia. Si la consulta falla, la sección no aparece.
 const dodo=!compra?null:await (async()=>{try{const {data,error}=await supabase.from('apertura_item_dodo').select('item_id,codigo,matriz_url,sustituto,foto_proyecto,foto_real').eq('item_id',item).maybeSingle<{item_id:string;codigo:string|null;matriz_url:string|null;sustituto:string|null;foto_proyecto:string|null;foto_real:string|null}>();if(error)return null;const rutas=[data?.foto_proyecto,data?.foto_real].filter((x):x is string=>!!x);return {fila:data,urls:await urlsFotos(rutas)};}catch{return null;}})();
 if(eo||ef||eh)return <p className="aviso aviso-error">No se pudo consultar el seguimiento completo. Vuelve a intentar antes de editar.</p>;
 const cambios=(historial??[]).map(h=>completo?h:sinDinero(h));
 const dividida=hijas??[];
 return <><EncabezadoPagina titulo={<>{i.nombre}</>} descripcion={<>{p.sucursales?.nombre} · {i.clave} · {ETAPAS[i.etapa]}</>} /><Link href={`/aperturas/${id}?vista=${!completo?'actividades':compra?'compras':i.tipo==='tecnico'?'tecnico':'actividades'}`}>Volver a la lista</Link><Aviso {...avisos}/><TareasDelDocumento supabase={supabase} tipo="apertura_item" id={item} rol={perfil.rol} hoy={hoy} />
 <div className="akton"><section className="akton-kpis" aria-label="Resumen de la tarea">
  <Kpi etiqueta="Estado" tono={tono==='listo'?'si':tono==='alerta'?'no':undefined} valor={nombreEstado(i)} pie={`Responsable: ${responsableNombre}`}/>
  <Kpi etiqueta="Fecha" tono={vencida!==null?'no':undefined} valor={fecha?fechaTexto(fecha):'Sin fecha'} pie={vencida!==null?`Vencida hace ${vencida} ${vencida===1?'día':'días'}`:i.inicio&&i.fin&&i.inicio!==i.fin?`${fechaTexto(i.inicio)} – ${fechaTexto(i.fin)}`:fecha?(i.fin?'Fin previsto':'Inicio previsto'):'Sin programar'}/>
  {compra?<Kpi etiqueta="Cantidad / recibido" valor={`${i.cantidad??'—'} / ${i.recibido}`} pie={typeof i.original.unidad==='string'?i.original.unidad:i.cantidad===null?'Cantidad por confirmar':'Unidades'}/>
   :<Kpi etiqueta="Categoría" valor={i.categoria?CATEGORIAS[i.categoria]?.nombre??i.categoria:'Sin categoría'} pie={i.categoria?`Hoja ${CATEGORIAS[i.categoria]?.hoja??'—'}`:ETAPAS[i.etapa]}/>}
  {completo&&compra&&<Kpi etiqueta="Importe con IVA" valor={i.cantidad!==null&&i.precio!==null?pesos(Number(i.cantidad)*Number(i.precio)):'—'} pie={i.precio===null?'Sin precio':`Precio unitario con IVA: ${pesos(i.precio)}`}/>}
 </section>
 {(i.origen_id||dividida.length>0)&&<section className="akton-tabla-marco ap-division" aria-label="División del registro">
  {i.origen_id&&<p>Viene de {origen?<Link href={`/aperturas/${id}/items/${origen.id}`}>{origen.clave}</Link>:'un registro dividido'}</p>}
  {dividida.length>0&&<p>Dividida en {dividida.map((h,n)=><span key={h.id}>{n>0&&', '}<Link href={`/aperturas/${id}/items/${h.id}`} title={h.nombre}>{h.clave}</Link></span>)}</p>}
 </section>}
 {i.descripcion&&<section className="akton-tabla-marco" aria-labelledby="ap-descripcion"><h2 id="ap-descripcion" className="akton-titulo">Descripción</h2><p className="texto-saltos">{i.descripcion}</p></section>}
 {dodo&&<section className="akton-tabla-marco ap-foto-seccion" aria-labelledby="ap-foto"><h2 id="ap-foto" className="akton-titulo">Foto</h2>
  <div className="ap-foto-par">{([['Foto del proyecto',dodo.fila?.foto_proyecto],['Foto real',dodo.fila?.foto_real]] as const).map(([t,ruta])=><figure key={t}><figcaption>{t}</figcaption>{ruta&&dodo.urls[ruta]?<img src={dodo.urls[ruta]} alt={`${t}: ${i.nombre}`} loading="lazy"/>:<div className="ap-foto-vacia">Sin foto</div>}</figure>)}</div>
  {completo&&dodo.fila?.foto_proyecto&&dodo.fila.codigo&&dodo.fila.codigo!==codigoDeItem(i.original)&&<p className="akton-subtitulo">Foto de referencia de {dodo.fila.codigo} (otra medida)</p>}
  {dodo.fila?.sustituto&&<p className="akton-subtitulo">En la matriz de Dodo: {estatusDodo(dodo.fila.sustituto)}</p>}
  {dodo.fila?.matriz_url&&<p><a href={dodo.fila.matriz_url} target="_blank" rel="noreferrer">Abrir matriz de Dodo</a></p>}
  {edita&&<FotoReal proyecto={id} item={item} ruta={dodo.fila?.foto_real??null} url={dodo.fila?.foto_real?dodo.urls[dodo.fila.foto_real]??null:null} edita={edita}/>}
 </section>}
 <section className="akton-tabla-marco" aria-labelledby="ap-seguimiento"><h2 id="ap-seguimiento" className="akton-titulo">Seguimiento</h2>
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla ap-tabla-datos"><tbody>
   <tr><th scope="row">Categoría</th><td data-label="Categoría">{i.categoria?`${CATEGORIAS[i.categoria]?.hoja} · ${CATEGORIAS[i.categoria]?.nombre}`:'Sin categoría'}</td></tr>
   {completo&&compra&&<tr><th scope="row">Precio unitario estimado</th><td data-label="Precio unitario estimado">{i.precio===null?'Sin cotizar':pesos(i.precio)}</td></tr>}
   {completo&&i.orden_id&&<tr><th scope="row">Orden vinculada</th><td data-label="Orden vinculada"><Link href={`/compras/ordenes/${i.orden_id}`}>{ordenes?.find(o=>o.id===i.orden_id)?.folio??'Ver orden'}</Link></td></tr>}
   {completo&&i.factura_id&&<tr><th scope="row">Factura y pagos</th><td data-label="Factura y pagos"><Link href={`/compras/facturas/${i.factura_id}`}>{facturas?.find(f=>f.id===i.factura_id)?.folio??'Ver factura'}</Link></td></tr>}
   <tr><th scope="row">Evidencia</th><td data-label="Evidencia" className="texto-libre">{i.evidencia??'—'}</td></tr>
   <tr><th scope="row">Notas</th><td data-label="Notas" className="texto-saltos">{i.notas??'—'}</td></tr>
  </tbody></table></div>
 </section>
 {completo&&<section className="akton-tabla-marco" aria-labelledby="ap-origen"><h2 id="ap-origen" className="akton-titulo">Origen y especificaciones</h2><p className="akton-subtitulo">{i.fuente}</p>
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla ap-tabla-datos"><tbody>{Object.entries(i.original).filter(([k,v])=>v!==null&&v!==''&&!['id','fuente','nombre','grupo','hoja'].includes(k)).map(([k,v])=>{const etiqueta=({descripcion:'Especificación original',cantidad:'Cantidad de referencia',medidas:'Medidas explícitas',potencia:'Potencia kW',codigo:'Código',unidad:'Unidad',apertura:'Apertura de puerta',altura:'Altura de salida',area:'Área',muros:'Muros',plafon:'Plafón',detalle:'Detalle',historico:'Antecedente de apertura anterior',explicacion:'Explicación original',dividida_de:'Dividida de'} as Record<string,string>)[k]??k;return <tr key={k}><th scope="row">{etiqueta}</th><td data-label={etiqueta} className="texto-libre">{typeof v==='object'?JSON.stringify(v):String(v)}</td></tr>;})}</tbody></table></div>
  <p className="akton-subtitulo">{i.tipo==='referencia'?'Las cantidades y avances de la apertura anterior son referencia; confirma su aplicación para dodo-2.':i.tipo==='equipo'?'Especificaciones del plano; el seguimiento registra las compras y entregas de dodo-2.':'Fechas y criterios propuestos; confirma su cumplimiento con el responsable.'}</p></section>}</div>
 {edita&&<section className="akton-tabla-marco ap-seccion-akton"><h2 className="akton-titulo">Actualizar registro</h2>
  {!hayMigracion&&<p className="akton-nota">Nombre, descripción, responsable del catálogo, bitácora y división aparecen al aplicar la migración de responsables.</p>}
  <form action={guardarItem} className="formulario"><input type="hidden" name="proyecto_id" value={id}/><input type="hidden" name="item_id" value={item}/><input type="hidden" name="revision" value={i.revision}/>
  {hayMigracion&&<><div className="campo"><label htmlFor="nombre">Nombre</label><input id="nombre" name="nombre" required maxLength={300} defaultValue={i.nombre}/></div><div className="campo"><label htmlFor="descripcion">Descripción</label><textarea id="descripcion" name="descripcion" rows={3} maxLength={4000} defaultValue={i.descripcion??''} placeholder="Qué incluye, alcance o criterio para darlo por terminado"/></div></>}
  <div className="rejilla"><div className="campo"><label htmlFor="estado">Estado</label><select id="estado" name="estado" defaultValue={i.estado}>{estadosPara(i.tipo).map(s=><option key={s} value={s}>{nombreEstado({...i,estado:s})}</option>)}</select></div>
  {hayMigracion?<SelectorResponsable opciones={opciones} valor={i.responsable_id??null} legado={i.responsable}/>
   :<div className="campo"><label htmlFor="responsable">Responsable de este registro</label><input id="responsable" name="responsable" maxLength={200} defaultValue={i.responsable??''} list="responsables-sugeridos" autoComplete="off" placeholder="Elige de la lista o escribe un nombre"/><datalist id="responsables-sugeridos">{sugeridos.map(n=><option key={n} value={n}/>)}</datalist><small>Usa el mismo nombre de la lista para que el calendario lo agrupe y filtre bien.</small></div>}
  <div className="campo"><label htmlFor="inicio">Inicio previsto</label><input id="inicio" name="inicio" type="date" defaultValue={i.inicio??''}/></div><div className="campo"><label htmlFor="fin">Fin previsto / entrega</label><input id="fin" name="fin" type="date" defaultValue={i.fin??''}/></div>
 <div className="campo"><label htmlFor="categoria">Categoría</label><select id="categoria" name="categoria" defaultValue={i.categoria??''}><option value="">Sin categoría</option>{Object.entries(CATEGORIAS).map(([k,c])=><option key={k} value={k}>{c.hoja} · {c.nombre}</option>)}</select></div>
 {compra?<>{[['cantidad','Cantidad necesaria',i.cantidad],['recibido','Cantidad recibida',i.recibido],['precio','Precio unitario estimado con IVA MXN',i.precio]].map(([c,t,v])=><div className="campo" key={String(c)}><label htmlFor={String(c)}>{t}</label><input id={String(c)} name={String(c)} type="number" min={c==='cantidad'?'0.0001':'0'} max={c==='precio'?'999999999':'99999999'} step="0.0001" defaultValue={v===null?'':String(v)}/></div>)}<div className="campo"><label htmlFor="orden_id">Orden de compra</label><select id="orden_id" name="orden_id" defaultValue={i.orden_id??''}><option value="">Sin vincular</option>{ordenes?.map(o=><option key={o.id} value={o.id}>{o.folio} · {o.estado}</option>)}</select></div><div className="campo"><label htmlFor="factura_id">Factura</label><select id="factura_id" name="factura_id" defaultValue={i.factura_id??''}><option value="">Sin vincular</option>{facturas?.map(f=><option key={f.id} value={f.id}>{f.folio??'Sin folio'} · {pesos(f.total)} · {f.estado}</option>)}</select></div></>:<><input type="hidden" name="cantidad" value=""/><input type="hidden" name="recibido" value="0"/><input type="hidden" name="precio" value=""/><input type="hidden" name="orden_id" value=""/><input type="hidden" name="factura_id" value=""/></>}
 </div><div className="campo"><label htmlFor="evidencia">Evidencia o motivo de no aplicar</label><textarea id="evidencia" name="evidencia" rows={3} maxLength={4000} defaultValue={i.evidencia??''} placeholder="Resultado de prueba, recepción, aprobación o enlace al documento"/><small>Obligatoria para completar, verificar o descartar. Una recepción completa requiere confirmar cantidad y unidades recibidas.</small></div><div className="campo"><label htmlFor="notas">Notas / bloqueo</label><textarea id="notas" name="notas" rows={3} maxLength={4000} defaultValue={i.notas??''}/></div><BotonEnviar>Guardar registro</BotonEnviar></form>
  {hayMigracion&&i.estado!=='no_aplica'&&<div className="acciones ap-dividir"><VentanaDividir proyecto={id} item={item} vista={compra?'compras':i.tipo==='tecnico'?'tecnico':'actividades'} nombre={i.nombre} responsable={i.responsable_id??null} inicio={i.inicio} fin={i.fin} opciones={opciones}/><small>Divide este registro en 2 a 10 partes, cada una con su responsable y fechas.</small></div>}
 </section>}
 {esResponsable&&<section className="akton-tabla-marco ap-seccion-akton"><h2 className="akton-titulo">Actualizar seguimiento</h2><p className="akton-subtitulo">Como responsable puedes cambiar el estado, las fechas, la evidencia, las notas y, en compras, la cantidad recibida.</p>
  <form action={guardarSeguimiento} className="formulario"><input type="hidden" name="proyecto_id" value={id}/><input type="hidden" name="item_id" value={item}/><input type="hidden" name="revision" value={i.revision}/>
  <div className="rejilla"><div className="campo"><label htmlFor="estado">Estado</label><select id="estado" name="estado" defaultValue={i.estado}>{estadosPara(i.tipo).map(s=><option key={s} value={s}>{nombreEstado({...i,estado:s})}</option>)}</select></div>
  <div className="campo"><label htmlFor="inicio">Inicio previsto</label><input id="inicio" name="inicio" type="date" defaultValue={i.inicio??''}/></div><div className="campo"><label htmlFor="fin">Fin previsto / entrega</label><input id="fin" name="fin" type="date" defaultValue={i.fin??''}/></div>
  {compra&&<><div className="campo"><span className="etiqueta">Cantidad necesaria</span><p className="ap-dato-fijo">{i.cantidad===null?'Por confirmar (administración)':String(i.cantidad)}</p></div><div className="campo"><label htmlFor="recibido">Cantidad recibida</label><input id="recibido" name="recibido" type="number" min="0" max="99999999" step="0.0001" defaultValue={String(i.recibido??0)}/><small>Para «Recibido», «Instalado» o «Verificado» debe igualar la cantidad necesaria.</small></div></>}</div>
  <div className="campo"><label htmlFor="evidencia">Evidencia o motivo de no aplicar</label><textarea id="evidencia" name="evidencia" rows={3} maxLength={4000} defaultValue={i.evidencia??''} placeholder="Resultado, fotos, aprobación o enlace al documento"/><small>Obligatoria para completar o descartar.</small></div><div className="campo"><label htmlFor="notas">Notas / bloqueo</label><textarea id="notas" name="notas" rows={3} maxLength={4000} defaultValue={i.notas??''}/></div><BotonEnviar>Guardar seguimiento</BotonEnviar></form></section>}
 {edita&&compra&&["recibido_parcial","recibido","instalado","verificado"].includes(i.estado)&&<p><Link className="boton" href={`/activos/nuevo?origen=${item}`}>Registrar una unidad como activo</Link></p>}
 {hayMigracion&&<div className="akton"><section className="akton-tabla-marco" aria-labelledby="ap-bitacora" id="bitacora"><h2 id="ap-bitacora" className="akton-titulo">Bitácora</h2>
  {bitacora===null?<p className="aviso aviso-error">No se pudo consultar la bitácora.</p>:!bitacora.length?<p className="akton-subtitulo">Sin entradas todavía.</p>:
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla"><thead><tr><th>Fecha</th><th>Avance</th><th>Estatus</th><th>Comentario</th><th>Quién</th></tr></thead>
   <tbody>{bitacora.map(b=><tr key={b.id}><td data-label="Fecha" className="ap-crono-fecha">{fechaTexto(b.fecha)}</td><td data-label="Avance">{b.avance===null?'—':`${b.avance} %`}</td><td data-label="Estatus">{b.estatus??'—'}</td><td data-label="Comentario" className="texto-saltos">{b.comentario}</td><td data-label="Quién">{b.perfiles?.nombre??'—'}</td></tr>)}</tbody></table></div>}
  {(edita||esResponsable)&&<form action={agregarBitacora} className="formulario"><input type="hidden" name="proyecto_id" value={id}/><input type="hidden" name="item_id" value={item}/>
   <div className="rejilla"><div className="campo"><label htmlFor="bit-fecha">Fecha</label><input id="bit-fecha" name="fecha" type="date" max={hoy} defaultValue={hoy}/></div><div className="campo"><label htmlFor="bit-avance">Avance % (opcional)</label><input id="bit-avance" name="avance" type="number" min="0" max="100" step="1"/></div><div className="campo"><label htmlFor="bit-estatus">Estatus (opcional)</label><input id="bit-estatus" name="estatus" maxLength={80} placeholder="Ej. Esperando material"/></div></div>
   <div className="campo"><label htmlFor="bit-comentario">Comentario</label><textarea id="bit-comentario" name="comentario" rows={3} required maxLength={2000}/></div><BotonEnviar>Agregar a la bitácora</BotonEnviar></form>}
 </section></div>}
 <Historial cambios={cambios}/></>;
}

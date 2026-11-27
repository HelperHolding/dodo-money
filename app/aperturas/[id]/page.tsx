import { ConInfo } from "@/components/ConInfo";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { TareasDelDocumento } from "@/components/TareasDelDocumento";
import {IndicadoresProyectoAkton,LecturaProyecto,PestanasProyecto} from '../AktonProyecto';
import {filasCronograma,indicadoresProyecto,lecturaApertura} from '@/lib/aperturasAkton';
import {CortePresupuesto} from '../CortePresupuesto';
import {PresupuestoVivo,cargarPresupuestoVivo} from '../PresupuestoVivo';
import {kpiVivo} from '@/lib/aperturas/presupuestoVivo';
import {Checklist} from '../Checklist';
import {DeApertura} from '@/app/activos/DeApertura';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {pesos,fechaTexto,hoyCalendarioMX} from '@/lib/formato';
import {CATEGORIAS,ETAPAS,ESTADOS,esObra,grupoApertura,indicadoresApertura,conteoEtapasEquipo,type ItemApertura,type ProyectoApertura} from '@/lib/aperturas';
import {puedeEditarCompras,puedeEditarFinanzas,puedeVerFinanzas} from '@/lib/roles';
import {ResumenCapexApertura} from '@/app/finanzas/capex/ResumenCapexApertura';
import {Aviso} from '@/components/Aviso';
import {BotonEnviar} from '@/components/BotonEnviar';
import {agregarItem,guardarProyecto} from '../acciones';
import {leerTodo} from '@/lib/ventas/paginar';
import {Historial,type CambioApertura} from '../Historial';
import {Calendario} from '../Calendario';
import {Gantt} from '../Gantt';
import {Cronograma} from '../Cronograma';
import {ListaConceptos} from '../ListaConceptos';
import {AvanceCategorias} from '../AvanceCategorias';
import {pendientesGantt} from '../pendientesGantt';
import {PlanoApertura,type HojaPlano,type MarcaPlano} from '../plano/PlanoApertura';
import {esDia,esMes,modoCalendario,semanaDe} from '@/lib/aperturasCalendario';
import {ImportarDodo} from '../fotos/ImportarDodo';
import {codigoDeItem} from '@/lib/aperturas/matrizDodo';
import {urlsFotos} from '../fotos/urls';
export default async function Proyecto({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{vista?:string;q?:string;estado?:string;grupo?:string;etapa?:string;tipo?:string;cat?:string;ambito?:string;mes?:string;color?:string;modo?:string;semana?:string;resp?:string;tipos?:string;hoja?:string;ok?:string;error?:string}>}) {
 const [{id},f]=await Promise.all([params,searchParams]);const {supabase,perfil}=await obtenerPerfil();
 const [{data:p,error:ep},{data,error},{data:historial}]=await Promise.all([supabase.from('apertura_proyectos').select('*,sucursales(nombre)').eq('id',id).maybeSingle<ProyectoApertura>(),leerTodo<ItemApertura>((desde,hasta)=>supabase.from('apertura_items').select('*').eq('proyecto_id',id).order('clave').range(desde,hasta).returns<ItemApertura[]>()).then(data=>({data,error:null})).catch(()=>({data:null,error:true})),supabase.from('apertura_proyecto_historial').select('fecha,anterior,nuevo,perfiles(nombre)').eq('proyecto_id',id).order('fecha',{ascending:false}).limit(50).returns<CambioApertura[]>()]);
 if(ep||error)return <p className="aviso aviso-error">No se pudo cargar el proyecto. Revisa la migración y vuelve a intentar.</p>;if(!p)notFound();
 const items=data??[],hoy=hoyCalendarioMX(),indicadores=indicadoresApertura(items,hoy),vista=['calendario','roadmap','actividades','compras','tecnico','activos','plano','alertas'].includes(f.vista??'')?f.vista!:'checklist';
 const mes=esMes(f.mes)?f.mes:hoy.slice(0,7),modo=modoCalendario(f.modo);
 // Semana: la pedida, o la de hoy si el mes es el actual, o la primera del mes.
 const semana=semanaDe(esDia(f.semana)?f.semana:hoy.startsWith(mes)?hoy:`${mes}-01`)[0].dia;
 // CAPEX solo con acceso a Finanzas (RLS ve_finanzas): una sola carga para el bloque y el KPI.
 const capex=puedeVerFinanzas(perfil.rol)?await cargarPresupuestoVivo(supabase,p,items):null;
 const etapasEquipo=conteoEtapasEquipo(items),filas=filasCronograma(items,hoy),kpis=indicadoresProyecto(p,items,hoy,capex&&!capex.error?kpiVivo(capex.vivo):null);
 // Plano (HD-14): hojas por clave, la activa (?hoja=, o la primera), sus marcas y la imagen con URL firmada de 1 h.
 const plano=vista!=='plano'?null:await (async()=>{
  const {data:hojas,error:eh}=await supabase.from('apertura_planos').select('id,hoja,nombre,version_fecha,imagen,ancho,alto,revision').eq('proyecto_id',id).order('hoja').returns<(HojaPlano&{imagen:string})[]>();
  if(eh)return null;
  const activa=(hojas??[]).find(h=>h.hoja===f.hoja)??hojas?.[0]??null;
  if(!activa)return {hojas:[],activa:null,marcas:[],url:null};
  const [{data:marcas,error:em},{data:firma}]=await Promise.all([supabase.from('apertura_plano_marcas').select('item_id,x,y').eq('plano_id',activa.id).returns<MarcaPlano[]>(),supabase.storage.from('aperturas-planos').createSignedUrl(activa.imagen,3600)]);
  if(em)return null;
  const sinRuta=({imagen:_,...h}:HojaPlano&{imagen:string})=>h;
  return {hojas:(hojas??[]).map(sinRuta),activa:sinRuta(activa),marcas:marcas??[],url:firma?.signedUrl??null};
 })();
 const tipos=vista==='compras'?['equipo','referencia']:vista==='tecnico'?['tecnico']:['actividad'];
 const visibles=items.filter(i=>(vista==='alertas'?indicadores.alertas.some(a=>a.id===i.id):vista==='compras'&&f.cat&&f.cat!=='sin'?true:tipos.includes(i.tipo))&&(!f.tipo||i.tipo===f.tipo)&&(!f.etapa||i.etapa===f.etapa)&&(!f.grupo||(i.estado!=='no_aplica'&&!(f.tipo==='equipo'&&i.estado==='por_validar')&&grupoApertura(i)===f.grupo))&&(!f.cat||(f.cat==='sin'?i.categoria===null:i.categoria===f.cat))&&(f.ambito!=='equipo'||!esObra(i))&&(!f.estado||i.estado===f.estado)&&(!f.q||`${i.nombre} ${i.clave} ${i.responsable??''}`.toLocaleLowerCase().includes(f.q.toLocaleLowerCase())));
 // Fotos de Dodo (HD-16): ruta mostrada (real ?? proyecto) solo de lo visible en compras o de lo marcado en la hoja activa. Si la consulta falla, la página sigue sin fotos.
 const fotos:Record<string,string>|undefined=vista!=='compras'&&vista!=='plano'?undefined:await (async()=>{
  const ids=new Set(vista==='compras'?visibles.map(i=>i.id):(plano?.marcas??[]).map(m=>m.item_id));
  if(!ids.size)return {};
  try{
   const filas=await leerTodo<{item_id:string;foto_proyecto:string|null;foto_real:string|null}>((desde,hasta)=>supabase.from('apertura_item_dodo').select('item_id,foto_proyecto,foto_real').eq('proyecto_id',id).order('item_id').range(desde,hasta).returns<{item_id:string;foto_proyecto:string|null;foto_real:string|null}[]>());
   const rutas:Record<string,string>={};for(const r of filas){const ruta=r.foto_real??r.foto_proyecto;if(ruta&&ids.has(r.item_id))rutas[r.item_id]=ruta;}
   const firmadas=await urlsFotos(Object.values(rutas));
   const salida:Record<string,string>={};for(const [item,ruta] of Object.entries(rutas))if(firmadas[ruta])salida[item]=firmadas[ruta];
   return salida;
  }catch{return undefined;}
 })();
 return <><EncabezadoPagina titulo={<>{p.sucursales?.nombre} · Apertura</>} descripcion={<>{p.responsable} · objetivo {fechaTexto(p.objetivo_desde)} a {fechaTexto(p.objetivo_hasta)}</>} /><Aviso ok={f.ok} error={f.error}/><TareasDelDocumento supabase={supabase} tipo="apertura_proyecto" id={id} rol={perfil.rol} hoy={hoy} />
 {puedeVerFinanzas(perfil.rol)&&capex?<PresupuestoVivo {...capex} proyectoId={id} items={items} puedeEditar={puedeEditarFinanzas(perfil.rol)}/>:<CortePresupuesto items={items}/>}
 {puedeVerFinanzas(perfil.rol)&&<ResumenCapexApertura db={supabase} proyectoId={id}/>}
 {puedeEditarCompras(perfil.rol)&&<details className="seccion"><summary>Responsable, fechas y presupuesto</summary><form action={guardarProyecto} className="formulario"><input type="hidden" name="proyecto_id" value={id}/><input type="hidden" name="revision" value={p.revision}/><div className="rejilla"><div className="campo"><label htmlFor="responsable_proyecto">Responsable de apertura</label><input id="responsable_proyecto" name="responsable" defaultValue={p.responsable} required maxLength={200}/></div><div className="campo"><label htmlFor="desde">Objetivo desde</label><input id="desde" name="desde" type="date" defaultValue={p.objetivo_desde} required/></div><div className="campo"><label htmlFor="hasta">Objetivo hasta</label><input id="hasta" name="hasta" type="date" defaultValue={p.objetivo_hasta} required/></div><div className="campo"><label htmlFor="presupuesto">Presupuesto estimado total MXN (con IVA)</label><input id="presupuesto" name="presupuesto" type="number" min="0" max="999999999999" step="0.01" defaultValue={p.presupuesto??''}/></div></div><BotonEnviar>Guardar proyecto</BotonEnviar></form></details>}
 <p>Presupuesto: {p.presupuesto===null?'Sin definir':pesos(p.presupuesto)} · fechas objetivo sujetas a confirmación de obra y entregas.</p>
 <div className="akton"><IndicadoresProyectoAkton k={kpis} objetivo={p.objetivo_hasta}/><LecturaProyecto lecturas={lecturaApertura(kpis,filas)}/><PestanasProyecto id={id} vista={vista}/></div>
 {puedeEditarCompras(perfil.rol)&&<details className="seccion"><summary>Agregar actividad, equipo o validación</summary><form action={agregarItem} className="formulario"><input type="hidden" name="proyecto_id" value={id}/><div className="campo"><label htmlFor="nuevo_nombre">Concepto</label><input id="nuevo_nombre" name="nombre" required maxLength={500}/></div><div className="rejilla"><div className="campo"><label htmlFor="nuevo_tipo">Tipo</label><select id="nuevo_tipo" name="tipo"><option value="actividad">Actividad</option><option value="equipo">Equipo / compra</option><option value="tecnico">Validación técnica</option></select></div><div className="campo"><label htmlFor="nueva_etapa">Etapa</label><select id="nueva_etapa" name="etapa">{Object.entries(ETAPAS).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></div><div className="campo"><label htmlFor="nueva_categoria">Categoría (opcional)</label><select id="nueva_categoria" name="categoria"><option value="">Sin categoría</option>{Object.entries(CATEGORIAS).map(([k,c])=><option key={k} value={k}>{c.hoja} · {c.nombre}</option>)}</select></div></div><BotonEnviar>Agregar al proyecto</BotonEnviar></form></details>}
 {vista==='plano'?(plano?<PlanoApertura proyecto={id} base={`/aperturas/${id}`} hoy={hoy} edita={puedeEditarCompras(perfil.rol)} fotos={fotos} {...plano} items={items.map(({id,clave,nombre,tipo,etapa,categoria,estado,responsable,inicio,fin,cantidad,recibido,precio,evidencia,notas,orden_id,factura_id,revision,original})=>({id,clave,nombre,tipo,etapa,categoria,estado,responsable,inicio,fin,cantidad,recibido,precio,evidencia,notas,orden_id,factura_id,revision,unidad:typeof original?.unidad==='string'?original.unidad:null}))}/>:<p className="aviso aviso-error">No se pudo cargar el plano. Revisa la migración y vuelve a intentar.</p>):vista==='checklist'?<Checklist items={items} proyecto={id} base={`/aperturas/${id}`} edita={puedeEditarCompras(perfil.rol)}/>:vista==='calendario'?<Calendario proyecto={id} items={items.map(({id,clave,nombre,tipo,etapa,categoria,estado,responsable,inicio,fin,revision})=>({id,clave,nombre,tipo,etapa,categoria,estado,responsable,inicio,fin,revision}))} modo={modo} mes={mes} semana={semana} persona={typeof f.resp==='string'?f.resp.slice(0,200):''} todos={f.tipos==='todos'} hoy={hoy} edita={puedeEditarCompras(perfil.rol)}/>:vista==='activos'?<DeApertura proyecto={id} sucursal={p.sucursal_id} items={items}/>:vista==='roadmap'?<><div className="akton"><Cronograma filas={filas} total={kpis.avance} base={`/aperturas/${id}`}/><Gantt proyecto={p} items={items} hoy={hoy} {...await pendientesGantt(supabase,items,p.sucursal_id,perfil.rol==='admin')} volverA={`/aperturas/${id}?vista=roadmap`}/></div><section className="seccion"><h2>Secuencia de compras</h2><ConInfo titulo="Secuencia de compras" etiqueta="Cómo leer esto">Cotizar → aprobar → pedir → recibir → instalar → verificar. Cada renglón conserva su fuente y admite una orden y una factura de la sucursal.</ConInfo><Link href={`/compras/ordenes?sucursal=${p.sucursal_id}`}>Ver órdenes de la sucursal</Link>{' · '}<Link href={`/compras/facturas?sucursal=${p.sucursal_id}`}>Ver facturas</Link><ConInfo titulo="Estimado del proyecto" etiqueta="Cómo leer esto">El estimado usa cantidades y precios capturados; no representa pagos ni inversión ejecutada. Los documentos vinculados permiten consultar pagos en Compras.</ConInfo></section></>:<>
 <div className="akton"><form className="seccion formulario"><input type="hidden" name="vista" value={vista}/><input type="hidden" name="grupo" value={f.grupo??''}/><input type="hidden" name="tipo" value={f.tipo??''}/><input type="hidden" name="etapa" value={f.etapa??''}/><input type="hidden" name="ambito" value={f.ambito??''}/>{vista!=='compras'&&<input type="hidden" name="cat" value={f.cat??''}/>}<div className="rejilla"><div className="campo"><label htmlFor="q">Buscar concepto, clave o responsable</label><input id="q" name="q" defaultValue={f.q??''}/></div><div className="campo"><label htmlFor="estado">Estado</label><select id="estado" name="estado" defaultValue={f.estado??''}><option value="">Todos</option>{Object.entries(ESTADOS).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></div>{vista==='compras'&&<div className="campo"><label htmlFor="cat">Categoría</label><select id="cat" name="cat" defaultValue={f.cat??''}><option value="">Todas</option>{Object.entries(CATEGORIAS).map(([k,c])=><option key={k} value={k}>{c.hoja} · {c.nombre}</option>)}<option value="sin">Sin categoría</option></select></div>}</div><div className="acciones"><button className="boton" type="submit">Filtrar</button><Link className="boton boton-secundario" href={`/aperturas/${id}?vista=${vista}`}>Limpiar filtros</Link></div></form>
 {vista==='compras'&&<AvanceCategorias items={items} base={`/aperturas/${id}`} activa={f.cat}/>}
 {vista==='compras'&&puedeEditarCompras(perfil.rol)&&<ImportarDodo proyecto={id} partidas={items.filter(i=>i.tipo==='equipo'||i.tipo==='referencia').map(i=>({id:i.id,clave:i.clave,nombre:i.nombre,codigo:codigoDeItem(i.original??{})}))}/>}
 <ListaConceptos items={visibles} base={`/aperturas/${id}`} hoy={hoy} fotos={fotos} cotizar={vista==='compras'?`/aperturas/${id}/cotizacion`:undefined} titulo={vista==='alertas'?'Bloqueados y vencidos':vista==='compras'?'Equipo y lista de compra':vista==='tecnico'?'Validaciones técnicas':'Actividades'} descripcion={vista==='compras'?`${etapasEquipo.sinCotizar} sin cotizar · ${etapasEquipo.cotizados} cotizados · ${etapasEquipo.pedidos} pedidos · ${etapasEquipo.entregados} entregados · ${etapasEquipo.instalados} instalados. El plano define el equipo. La lista de apertura anterior es referencia: conciliar duplicados y cantidades antes de comprar.`:undefined}/></div></>}
 <Historial cambios={historial??[]}/></>;
}

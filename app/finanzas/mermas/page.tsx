import {EncabezadoPagina} from "@/components/EncabezadoPagina";
import Link from "next/link";
import {obtenerPerfil} from "@/lib/contexto";
import {hoyCalendarioMX,pesos} from "@/lib/formato";
import {puedeEditarFinanzas} from "@/lib/roles";
import {datosMermas} from "./datos";
import {valorarMermas,mermaParaPL} from "@/lib/finanzas/mermasPL";
import {resumirMermas} from "@/lib/finanzas/mermasDodo";
import {Aviso} from "@/components/Aviso";
import {BotonEnviar} from "@/components/BotonEnviar";
import {Formulario} from "./Formulario";
import {guardarCostoMerma,anularCostoMerma} from "./acciones";
import {referenciaBOM,type VersionBOM} from "@/lib/finanzas/referenciaMerma";
import {leerTodo} from "@/lib/ventas/paginar";
export default async function Mermas({searchParams}:{searchParams:Promise<{mes?:string;sucursal?:string;ok?:string;error?:string}>}) {
 const {supabase,perfil}=await obtenerPerfil(),q=await searchParams;
 const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes??"")?q.mes!:hoyCalendarioMX().slice(0,7),desde=`${mes}-01`;
 const finMes=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
 const hasta=finMes<hoyCalendarioMX()?finMes:hoyCalendarioMX();
 const [{data:sucursales,error},datos,versiones]=await Promise.all([
  supabase.from("sucursales").select("id,nombre").order("nombre"),datosMermas(supabase,desde,hasta),
  leerTodo<VersionBOM>((a,b)=>supabase.from("bom_versiones").select("id,vigente_desde,modelo,archivo,actualizado_en").lte("vigente_desde",hasta).order("id").range(a,b)),
 ]);
 if(error)throw Error(error.message);
 const sucursal=(sucursales??[]).some(s=>s.id===q.sucursal)?q.sucursal:undefined,edita=puedeEditarFinanzas(perfil.rol);
 const dias=datos.dias.filter(d=>!sucursal||d.sucursal_id===sucursal),filas=datos.filas.filter(r=>!sucursal||r.sucursal_id===sucursal);
 const valoradas=valorarMermas(filas,datos.costos),nombres=new Map((sucursales??[]).map(s=>[s.id,s.nombre]));
 // Un formulario por producto/sucursal; la vigencia mantiene el costo de los días anteriores.
 const productos=[...new Map(valoradas.filter(r=>r.tipo==="producto").map(r=>[`${r.sucursal_id}|${r.clave}`,r])).values()];
 return <><EncabezadoPagina titulo="Mermas Dodo IS" descripcion="Productos terminados e insumos adicionales al BOM descuentan del P&L, separados y sin IVA. Los costos desconocidos quedan pendientes." acciones={<Link className="boton boton-secundario" href={`/finanzas?mes=${mes}${sucursal?`&sucursal=${sucursal}`:""}`}>Ver P&L</Link>}/><Aviso ok={q.ok} error={q.error}/>
  {!datos.disponible&&<p className="aviso aviso-error">Falta aplicar 0035_mermas_pl.sql para completar cobertura y registrar costos sin IVA.</p>}
  <form className="barra-filtros" aria-label="Periodo"><label htmlFor="mes" className="solo-lector">Mes</label><input id="mes" name="mes" type="month" defaultValue={mes} required/><label htmlFor="sucursal" className="solo-lector">Sucursal</label><select id="sucursal" name="sucursal" defaultValue={sucursal??""}><option value="">Todas las sucursales</option>{sucursales?.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select><button className="boton boton-secundario boton-compacto">Consultar</button></form>
  <section className="seccion"><h2>Importes incorporados al P&L</h2>
   {(sucursales??[]).filter(s=>!sucursal||s.id===sucursal).map(s=>{
    const r=mermaParaPL(valoradas.filter(r=>r.sucursal_id===s.id),dias.filter(d=>d.sucursal_id===s.id),desde,hasta);
    return <div key={s.id}><h3>{s.nombre}</h3><p>Productos terminados: <strong>{r.monto===null?"Sin dato":pesos(r.monto)}</strong>{r.parcial?" · parcial/pendiente":" · cobertura completa"}</p>
     <p>Insumos: <strong>{r.insumosMonto===null?"Sin dato":pesos(r.insumosMonto)}</strong>{r.insumosParcial?" · parcial/pendiente":" · cobertura completa"}</p>
     <p className="saldo-nota">{r.sinImportar} días sin importar · {r.sinCobertura} días sin cobertura de productos confirmada · {r.sinCosto} renglones de productos sin costo · {r.sinCostoInsumos} renglones de insumos sin costo.</p>
    </div>;
   })}
   <p className="saldo-nota">Los costos desconocidos no cuentan como cero. Si falta cobertura o costo, el margen y EBITDA muestran que el resultado es provisional. El P&L usa su propio periodo, que puede terminar antes de hoy.</p>
  </section>
  {edita&&<Formulario/>}
  {productos.length>0&&<section className="seccion"><h2>Costos de productos y referencias del BOM</h2><p>El costo importado de Dodo IS es sin IVA. El BOM es una referencia de receta con sus ajustes y empaque; confirma unidad, IVA y componentes antes de usarlo como costo de una baja. No agregamos el 1 % de periféricos a las mermas.</p>
   {productos.map(r=>{
    const ref=referenciaBOM(r,versiones),historial=datos.costos.filter(c=>c.sucursal_id===r.sucursal_id&&c.clave===r.clave);
    return <details key={`${r.sucursal_id}|${r.clave}`} className="merma-producto"><summary>{r.nombre} · {nombres.get(r.sucursal_id)}{valoradas.some(x=>x.sucursal_id===r.sucursal_id&&x.clave===r.clave&&x.costo_pl===null)?" · costo pendiente":""}</summary>
     {ref?<p><Link href={`/ventas/costos/materiales?version=${ref.version}&q=${encodeURIComponent(ref.nombre)}`}>Ver BOM: {ref.nombre}</Link> · {pesos(ref.precio)} por {ref.unidad} · {ref.archivo}</p>:<p className="saldo-nota">Sin una receta única coincidente y vigente para la fecha de esta baja. No asignamos costos por similitud.</p>}
     {edita&&datos.disponible&&<form action={guardarCostoMerma} className="formulario">
      <input type="hidden" name="sucursal_id" value={r.sucursal_id}/><input type="hidden" name="clave" value={r.clave}/><input type="hidden" name="mes" value={mes}/>
      <div className="rejilla"><div className="campo"><label htmlFor={`costo-${r.sucursal_id}-${encodeURIComponent(r.clave)}`}>Costo por pieza, sin IVA</label><input id={`costo-${r.sucursal_id}-${encodeURIComponent(r.clave)}`} name="costo_unitario" type="number" step="0.000001" min="0.000001" max="999999.999999" required/></div><div className="campo"><label htmlFor={`desde-${r.sucursal_id}-${encodeURIComponent(r.clave)}`}>Vigente desde</label><input id={`desde-${r.sucursal_id}-${encodeURIComponent(r.clave)}`} name="vigente_desde" type="date" min="2020-01-01" defaultValue={desde} max={hoyCalendarioMX()} required/></div></div>
      <div className="campo"><label htmlFor={`fuente-${r.sucursal_id}-${encodeURIComponent(r.clave)}`}>Fuente y motivo del costo sin IVA</label><textarea id={`fuente-${r.sucursal_id}-${encodeURIComponent(r.clave)}`} name="fuente" minLength={10} maxLength={1000} required/></div>
      <p className="saldo-nota">Este costo sustituye el costo importado de este producto en esta sucursal desde la fecha indicada. Conservamos ambos y el historial. Para corregir una fecha, registra otra versión; anular restaura el costo previo aplicable.</p><BotonEnviar>Guardar costo confirmado</BotonEnviar>
     </form>}
     {historial.length>0&&<ul className="lista-simple">{historial.map(c=><li key={c.id}>{c.vigente_desde} · {pesos(c.costo_unitario)} por pieza · {c.fuente}{c.anulado_en?" · anulado":""}
      {edita&&!c.anulado_en&&<form action={anularCostoMerma} className="acciones"><input type="hidden" name="id" value={c.id}/><input type="hidden" name="sucursal_id" value={r.sucursal_id}/><input type="hidden" name="mes" value={mes}/><label htmlFor={`anular-${c.id}`}>Motivo para anular</label><input id={`anular-${c.id}`} name="motivo" minLength={10} maxLength={1000} required/><BotonEnviar className="boton boton-secundario">Anular costo</BotonEnviar></form>}
     </li>)}</ul>}
    </details>;
   })}
  </section>}
  {!dias.length&&<p className="seccion">No hay días importados para este mes y sucursal.</p>}
  {resumirMermas(filas,dias).map(d=>{
   const origen=dias.find(x=>x.sucursal_id===d.sucursal_id&&x.fecha===d.fecha)!,dia=valoradas.filter(r=>r.sucursal_id===d.sucursal_id&&r.fecha===d.fecha);
   const resultado=mermaParaPL(dia,[origen],d.fecha,d.fecha);
   return <section className="seccion" key={`${d.sucursal_id}-${d.fecha}`}><h2>{d.fecha} · {nombres.get(d.sucursal_id)}</h2><p>Productos al P&L: <strong>{resultado.monto===null?"Sin dato":pesos(resultado.monto)}</strong>{resultado.parcial?" · parcial/pendiente":""} · Insumos al P&L: <strong>{resultado.insumosMonto===null?"Sin dato":pesos(resultado.insumosMonto)}</strong>{resultado.insumosParcial?" · parcial/pendiente":""}</p>
    {!origen.productos_completos&&<p className="aviso aviso-error">Reimporta el reporte completo para confirmar que este día incluye la hoja de productos terminados, aun cuando no tenga bajas.</p>}
    {resultado.sinCosto>0&&<p className="aviso aviso-error">{resultado.sinCosto} renglones de productos sin costo confirmado quedan pendientes.</p>}
    {resultado.sinCostoInsumos>0&&<p className="aviso aviso-error">{resultado.sinCostoInsumos} renglones de insumos sin costo quedan pendientes.</p>}
    <p><small>{origen.archivo} · Importado {new Date(origen.registrado_en).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}{origen.desde!==origen.hasta?" · Costo de insumos del periodo repartido por cantidad":""}</small></p>
    {(["producto","insumo"] as const).map(tipo=><details key={tipo}><summary>{tipo==="producto"?"Productos terminados · al P&L":"Insumos · al P&L"}</summary><ul className="lista-filas">{dia.filter(r=>r.tipo===tipo).map(r=>{const ref=referenciaBOM(r,versiones);return <li className="fila" key={r.clave}><div className="fila-nombre"><strong>{r.nombre}</strong><small>{r.categoria}</small>
      {tipo==="insumo"&&ref&&<small><Link href={`/ventas/costos/materiales?version=${ref.version}&ver=insumos&q=${encodeURIComponent(ref.nombre)}`}>Insumo BOM</Link> · {pesos(ref.precio)} / {ref.unidad}{ref.merma!==null?` · ajuste del BOM ${(ref.merma*100).toFixed(2)} %`:""}. Confirma la unidad; no convertimos litros a kg.</small>}
      </div><div className="fila-datos"><span>{r.cantidad} {r.unidad}</span><span>{tipo==="producto"?(r.costo_pl===null?"Costo pendiente":pesos(r.costo_pl)):(r.sin_costo?"Costo pendiente":pesos(r.costo))}</span>{r.costo_manual&&<small>Importado {pesos(r.costo)} · costo confirmado</small>}{tipo==="producto"&&<small>{r.fuente_costo}</small>}</div></li>;})}</ul></details>)}
   </section>;
  })}
 </>;
}

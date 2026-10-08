import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX, pesos, fechaTexto } from "@/lib/formato";
import { puedeImportarVentas, veVentasDeTodas } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerConciliaciones } from "./datos";
import { guardarConciliacion, anularConciliacion } from "./acciones";

type Dia = { sucursal_id:string; fecha:string; importacion_id:string; total:number; efectivo:number; tarjeta:number; en_linea:number; iva:number };
type Producto = { sucursal_id:string; fecha:string; importe:number; importe_sin_descuento:number };
export default async function Conciliacion({searchParams}:{searchParams:Promise<{mes?:string;sucursal?:string;ok?:string;error?:string}>}) {
 const {supabase,perfil}=await obtenerPerfil(),q=await searchParams;
 const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes??"")?q.mes!:hoyCalendarioMX().slice(0,7);
 const desde=`${mes}-01`,hasta=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
 const todas=veVentasDeTodas(perfil.rol),edita=puedeImportarVentas(perfil.rol);
 const [{data:sucursales,error},datos,productos,conciliaciones,{data:personas}]=await Promise.all([
  supabase.from("sucursales").select("id,nombre").order("nombre"),
  leerTodo<Dia>((a,b)=>supabase.from("ventas_dia").select("sucursal_id,fecha,importacion_id,total,efectivo,tarjeta,en_linea,iva").gte("fecha",desde).lte("fecha",hasta).order("sucursal_id").order("fecha").range(a,b)),
  leerTodo<Producto>((a,b)=>supabase.from("ventas_producto").select("sucursal_id,fecha,importe,importe_sin_descuento").gte("fecha",desde).lte("fecha",hasta).order("sucursal_id").order("fecha").order("dodo_id").range(a,b)),
  leerConciliaciones(supabase,desde,hasta,true),
  supabase.from("perfiles").select("id,nombre"),
 ]);
 if(error)throw Error(error.message);
 const sucursal=todas?(sucursales??[]).find(s=>s.id===q.sucursal)?.id:perfil.sucursal_id;
 const dias=datos.filter(d=>!sucursal||d.sucursal_id===sucursal),nombres=new Map((sucursales??[]).map(s=>[s.id,s.nombre]));
 const autores=new Map((personas??[]).map(p=>[p.id,p.nombre]));
 const suma=new Map<string,{importe:number;bruta:number;n:number}>();
 for(const p of productos){const k=`${p.sucursal_id}|${p.fecha}`,s=suma.get(k)??{importe:0,bruta:0,n:0};s.importe+=Number(p.importe);s.bruta+=Number(p.importe_sin_descuento);s.n++;suma.set(k,s);}
 return <><div className="encabezado"><h1>Conciliación de ventas Dodo IS</h1><p>Corrige formas de pago de días históricos o justifica diferencias entre el reporte diario y los productos. Conservamos la importación original.</p></div>
  <Aviso ok={q.ok} error={q.error}/>
  {!conciliaciones.disponible&&<p className="aviso aviso-error">Falta aplicar la migración 0034_conciliacion_ventas.sql en Supabase.</p>}
  <form className="acciones"><label htmlFor="mes">Mes</label><input id="mes" name="mes" type="month" defaultValue={mes} required/>
   {todas&&<><label htmlFor="sucursal">Sucursal</label><select id="sucursal" name="sucursal" defaultValue={sucursal??""}><option value="">Todas</option>{sucursales?.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></>}<button className="boton boton-secundario">Consultar</button>
   <Link href="/ventas">Ver ventas</Link>
  </form>
  <p className="saldo-nota">Los ajustes de cobro se reflejan en Ventas, en el comparativo con cierres y en las comisiones estimadas del P&L. La venta total, el IVA, los pedidos y los costos de receta se conservan. El detalle de pedidos mantiene la forma de pago original.</p>
  {!dias.length&&<p className="seccion">No hay ventas Dodo IS importadas para este periodo.</p>}
  {dias.map(d=>{
   const s=suma.get(`${d.sucursal_id}|${d.fecha}`),diferencia=Math.round((Number(d.total)-(s?.importe??0))*100)/100;
   const historial=conciliaciones.filas.filter(c=>c.sucursal_id===d.sucursal_id&&c.fecha===d.fecha);
   const activa=historial.find(c=>!c.anulado_en&&c.importacion_id===d.importacion_id);
   return <section className="seccion" key={d.importacion_id}><h2>{fechaTexto(d.fecha)} · {nombres.get(d.sucursal_id)}</h2>
    <div className="rejilla"><p>Venta diaria <strong>{pesos(d.total)}</strong></p><p>Productos con descuentos <strong>{s?pesos(s.importe):"Sin detalle"}</strong></p><p>Diferencia <strong>{pesos(diferencia)}</strong></p></div>
    <p>Venta bruta de productos: <strong>{s?pesos(s.bruta):"Sin dato"}</strong> · {activa?"Conciliación vigente":Math.abs(diferencia)<=1?"Cuadra dentro de la tolerancia de $1":"Requiere revisión"}</p>
    {activa&&<p className="saldo-nota">Efectivo {pesos(activa.efectivo)} · Tarjeta {pesos(activa.tarjeta)} · En línea {pesos(activa.en_linea)} · {activa.conciliar_productos?"Diferencia de productos justificada":"Sin aprobación de diferencia de productos"}</p>}
    {edita&&conciliaciones.disponible&&!activa&&<details><summary>Conciliar este día</summary>
     <form action={guardarConciliacion} className="formulario">
      <input type="hidden" name="importacion_id" value={d.importacion_id}/><input type="hidden" name="mes" value={mes}/>
      <p>Importado: efectivo {pesos(d.efectivo)}, tarjeta {pesos(d.tarjeta)}, en línea {pesos(d.en_linea)}. La suma corregida debe conservar {pesos(Number(d.efectivo)+Number(d.tarjeta)+Number(d.en_linea))}.</p>
      <div className="rejilla">{(["efectivo","tarjeta","en_linea"] as const).map(k=><div className="campo" key={k}><label htmlFor={`${d.importacion_id}-${k}`}>{k==="efectivo"?"Efectivo correcto":k==="tarjeta"?"Tarjeta correcta":"En línea correcto"}</label><input id={`${d.importacion_id}-${k}`} name={k} type="number" min="0" step="0.01" defaultValue={Number(d[k]).toFixed(2)} required/></div>)}</div>
      <label className="casilla conciliacion-casilla"><input type="checkbox" name="conciliar_productos" value="si" disabled={!s&&Number(d.total)!==0}/>Revisé y justifiqué la diferencia entre el detalle de productos y la venta diaria.</label>
      <p className="saldo-nota">Esta confirmación justifica la diferencia; no cambia los importes de productos ni fuerza el cuadre. Si falta detalle, reimporta el archivo.</p>
      <div className="campo"><label htmlFor={`${d.importacion_id}-motivo`}>Motivo y evidencia de la corrección</label><textarea id={`${d.importacion_id}-motivo`} name="motivo" minLength={10} maxLength={1000} required placeholder="Ejemplo: cobro de $500 registrado en efectivo; comprobante de terminal…"/></div>
      <BotonEnviar>Guardar conciliación</BotonEnviar>
     </form>
    </details>}
    {historial.length>0&&<details><summary>Historial ({historial.length})</summary><ul className="lista-simple">{historial.map(c=><li key={c.id}><strong>{c.anulado_en?"Anulada":c.importacion_id===d.importacion_id?"Vigente":"Importación reemplazada; requiere nueva revisión"}</strong> · {autores.get(c.registrado_por)??"Usuario registrado"} · {new Date(c.registrado_en).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}
     <p>{c.motivo}</p><p>Efectivo {pesos(c.original.efectivo)} → {pesos(c.efectivo)} · Tarjeta {pesos(c.original.tarjeta)} → {pesos(c.tarjeta)} · En línea {pesos(c.original.en_linea)} → {pesos(c.en_linea)}</p>
     <p className="saldo-nota">Diferencia original {pesos(Number(c.original.total)-Number(c.original.suma_productos))} · {c.conciliar_productos?"Productos conciliados":"Solo formas de pago"}</p>
     {c.anulado_en&&<p>Motivo de anulación: {c.motivo_anulacion}</p>}
     {edita&&!c.anulado_en&&<form action={anularConciliacion} className="acciones"><input type="hidden" name="id" value={c.id}/><input type="hidden" name="mes" value={mes}/><label htmlFor={`${c.id}-anular`}>Motivo para anular</label><input id={`${c.id}-anular`} name="motivo" minLength={10} maxLength={1000} required/><BotonEnviar className="boton boton-secundario">Anular conciliación</BotonEnviar></form>}
    </li>)}</ul></details>}
   </section>;
  })}
 </>;
}

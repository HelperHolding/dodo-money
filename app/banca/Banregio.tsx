import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaTexto, pesos } from "@/lib/formato";
import styles from "./banca.module.css";

export type CuentaBanca = {id:string;numero:string;rfc:string;razon_social:string;moneda:string;ultima_fecha:string|null;saldo_final:number|null;importacion_id:string|null};
export type FiltrosBanca = {vista?:string;cuenta?:string;desde?:string;hasta?:string;q?:string;pagina?:string;importacion?:string};
export async function leerCuentasBanca(db:SupabaseClient){
  const {data,error}=await db.from("banca_saldos").select("id,numero,rfc,razon_social,moneda,ultima_fecha,saldo_final,importacion_id").order("razon_social").returns<CuentaBanca[]>();
  if(error) throw Error("No se pudieron consultar las cuentas bancarias. Revisa la disponibilidad de Banca.");
  return data??[];
}
export async function Banregio({db,cuentas,edita,q}:{db:SupabaseClient;cuentas:CuentaBanca[];edita:boolean;q:FiltrosBanca}){
  let cuenta=cuentas.find(c=>c.id===q.cuenta)??cuentas[0];
  if(q.importacion&&/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(q.importacion)){
    const {data,error}=await db.from("banca_importaciones").select("cuenta_id").eq("id",q.importacion).maybeSingle<{cuenta_id:string}>();
    if(error) throw Error("No se pudo consultar el reporte solicitado.");
    if(data) cuenta=cuentas.find(c=>c.id===data.cuenta_id)??cuenta;
  }
  const fechaValida=(f:string|undefined)=>f&&/^\d{4}-\d{2}-\d{2}$/.test(f)&&Number.isFinite(Date.parse(f))&&new Date(`${f}T00:00:00Z`).toISOString().slice(0,10)===f?f:undefined;
  const desde=fechaValida(q.desde),hasta=fechaValida(q.hasta),buscar=(q.q??"").trim().slice(0,100);
  const pagina=Math.max(1,Math.min(10000,Number.parseInt(q.pagina??"1",10)||1));
  type Movimiento={id:string;fecha:string;descripcion:string;referencia:string;cargo:number;abono:number;saldo:number;sucursales:{nombre:string}|null;importacion_id:string};
  type Importacion={id:string;archivo:string;periodo_desde:string;periodo_hasta:string;primera_fecha:string;ultima_fecha:string;saldo_final:number;nuevos:number;repetidos:number;creado_en:string};
  let movimientos:Movimiento[]=[],historial:Importacion[]=[],total=0;
  if(cuenta){
    let consulta=db.from("banca_movimientos").select("id,fecha,descripcion,referencia,cargo,abono,saldo,importacion_id,sucursales(nombre)",{count:"exact"}).eq("cuenta_id",cuenta.id);
    if(desde) consulta=consulta.gte("fecha",desde);
    if(hasta) consulta=consulta.lte("fecha",hasta);
    if(buscar) consulta=consulta.ilike("descripcion",`%${buscar.replace(/[\\%_]/g,"\\$&")}%`);
    const [mov,imp]=await Promise.all([
      consulta.order("fecha",{ascending:false}).order("fila_origen",{ascending:false}).order("id").range((pagina-1)*50,pagina*50-1).returns<Movimiento[]>(),
      db.from("banca_importaciones").select("id,archivo,periodo_desde,periodo_hasta,primera_fecha,ultima_fecha,saldo_final,nuevos,repetidos,creado_en").eq("cuenta_id",cuenta.id).order("creado_en",{ascending:false}).limit(20).returns<Importacion[]>(),
    ]);
    if(mov.error||imp.error) throw Error("No se pudieron consultar los movimientos o el historial bancario.");
    movimientos=mov.data??[];historial=imp.data??[];total=mov.count??0;
  }
  const url=(p:number)=>`/banca?${new URLSearchParams({vista:"banregio",cuenta:cuenta?.id??"",...(desde?{desde}:{}),...(hasta?{hasta}:{}),...(buscar?{q:buscar}:{}),pagina:String(p)})}`;
  return <section className={styles.panel}>
    <div className={styles.encabezado}><div><h2>Banregio</h2><p>{cuenta?`${cuenta.razon_social} · ${cuenta.rfc} · cuenta ${cuenta.numero.slice(-4)} · MXN`:"Incorpora el primer reporte para registrar la cuenta y consultar sus movimientos."}</p></div>{edita&&<Link className="boton" href="/banca/importar">Importar Excel</Link>}</div>
    {cuenta&&<p><strong>Último saldo reportado: {cuenta.saldo_final===null?"Sin datos":pesos(Number(cuenta.saldo_final))}</strong>{cuenta.ultima_fecha&&` · movimientos hasta ${fechaTexto(cuenta.ultima_fecha)}`}<br/><small>No es una consulta de saldo actual al banco.</small></p>}
    <form method="get" className={styles.filtros}>
      <input type="hidden" name="vista" value="banregio"/>
      <label>Cuenta<select name="cuenta" defaultValue={cuenta?.id??""}><option value="">Elige cuenta</option>{cuentas.map(c=><option value={c.id} key={c.id}>{c.razon_social} · {c.numero.slice(-4)}</option>)}</select></label>
      <label>Desde<input type="date" name="desde" defaultValue={desde}/></label><label>Hasta<input type="date" name="hasta" defaultValue={hasta}/></label>
      <label>Buscar en descripción<input type="search" name="q" defaultValue={buscar} placeholder="Proveedor, plataforma o concepto" maxLength={100}/></label><button className="boton boton-secundario">Filtrar</button>
    </form>
    {desde&&hasta&&desde>hasta?<p role="alert" className="aviso aviso-error">La fecha inicial debe ser anterior a la final.</p>:null}
    <div className={styles.tabla}><table><caption>{total} movimientos · {cuenta?.razon_social??"Banregio"}</caption><thead><tr>{["Fecha","Sucursal","Descripción / referencia","Cargo","Abono","Saldo después del movimiento","Estado","Fuente"].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead><tbody>{movimientos.map(m=><tr key={m.id}><td>{fechaTexto(m.fecha)}</td><td>{m.sucursales?.nombre??"Sin asignar"}</td><td className={styles.descripcion}>{m.descripcion}<br/><small>{m.referencia}</small></td><td>{Number(m.cargo)?pesos(Number(m.cargo)):"—"}</td><td>{Number(m.abono)?pesos(Number(m.abono)):"—"}</td><td>{pesos(Number(m.saldo))}</td><td><span className={styles.estado}>Sin conciliar</span></td><td><a href={`/banca/importaciones/${m.importacion_id}/archivo`}>Excel original</a></td></tr>)}{!movimientos.length&&<tr><td colSpan={8}><div className={styles.vacio}><h3>{cuentas.length?"No hay movimientos con estos filtros":"Todavía no hay reportes de Banregio"}</h3><p>{cuentas.length?"Cambia las fechas o el texto de búsqueda.":"El Excel se valida antes de guardar. Los PDF se utilizan para cotejar el reporte."}</p></div></td></tr>}</tbody></table></div>
    {total>50&&<nav className="acciones" aria-label="Páginas de movimientos">{pagina>1&&<Link href={url(pagina-1)}>← Anterior</Link>}<span>Página {pagina} de {Math.ceil(total/50)}</span>{pagina*50<total&&<Link href={url(pagina+1)}>Siguiente →</Link>}</nav>}
    <p className={styles.nota}>El saldo de cada fila conserva el orden del archivo original. Importar no genera ventas, gastos, pagos ni traslados. Las asociaciones se registran en la pestaña Conciliación.</p>
    <details className={styles.detalle}><summary>Historial de importaciones · últimas 20</summary><div className={styles.tabla}><table><thead><tr>{["Archivo","Periodo solicitado","Movimientos incluidos","Nuevos / repetidos","Saldo final","Original"].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{historial.map(i=><tr key={i.id}><td>{i.archivo}</td><td>{fechaTexto(i.periodo_desde)} a {fechaTexto(i.periodo_hasta)}</td><td>{fechaTexto(i.primera_fecha)} a {fechaTexto(i.ultima_fecha)}</td><td>{i.nuevos} / {i.repetidos}</td><td>{pesos(Number(i.saldo_final))}</td><td><a href={`/banca/importaciones/${i.id}/archivo`}>Descargar Excel</a></td></tr>)}</tbody></table></div></details>
  </section>;
}

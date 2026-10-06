"use client";
import Link from "next/link";
import {useState,useTransition} from "react";
import {pesos} from "@/lib/formato";
import {guardarBOM,revisarBOM,type ResultadoBOM} from "./acciones";
import {Materiales} from "./Materiales";

export function FormularioBOM({fecha}:{fecha:string}) {
  const [resultado,setResultado]=useState<ResultadoBOM|null>(null),[pendiente,iniciar]=useTransition();
  const revision=resultado?.tipo==="revision" ? resultado.revision : null;
  const [cambio,setCambio]=useState(false);
  function enviar(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    const guardar=((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null)?.value==="guardar";
    iniciar(async()=>{try {setResultado(await (guardar ? guardarBOM(fd) : revisarBOM(fd)));setCambio(false);} catch {setResultado({tipo:"error",mensaje:"No se pudo completar la solicitud. Intenta de nuevo."});}});
  }
  return <form onSubmit={enviar} className="formulario seccion">
    <div className="rejilla"><div className="campo"><label htmlFor="bom-archivo">Actualizar desde otro UC Mexico (opcional)</label><input type="file" id="bom-archivo" name="archivo" accept=".xlsx" onChange={()=>setResultado(null)}/><small>Si lo dejas vacío, se usa UC Mexico (4).xlsx, el archivo que compartiste.</small></div>
    <div className="campo"><label htmlFor="bom-fecha">Los costos aplican desde</label><input type="date" id="bom-fecha" name="fecha" defaultValue={fecha} required onChange={()=>setResultado(null)}/><small>Se conserva el historial anterior. Incluye 1 % adicional para periféricos.</small></div></div>
    {resultado && resultado.tipo!=="revision" && <p role={resultado.tipo==="error" ? "alert" : "status"} className={`aviso aviso-${resultado.tipo==="error" ? "error" : "ok"}`}>{resultado.mensaje}{resultado.tipo==="guardado" && <> <Link href="/ventas/costos/materiales">Ver listas guardadas</Link></>}</p>}
    {revision && <>
      <input type="hidden" name="revision" value={revision.huellaRevision}/>
      <p className="aviso aviso-info">{revision.modelo.insumos.length} insumos · {revision.recetas.length} recetas · {revision.recetas.filter(r=>r.nuevo!==null&&r.dodo_id!==null).length} costos vinculados · {revision.recetas.filter(r=>r.costo===null).length} recetas pendientes. {revision.archivo}</p>
      <p className="saldo-nota">Revisa los vínculos. Las recetas pendientes y sin producto no sustituyen costos anteriores. Las Thin usan su propia receta.</p>
      <div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><thead><tr><th>Receta / producto</th><th className="monto">Actual</th><th className="monto">BOM</th><th className="monto">BOM + 1 %</th></tr></thead><tbody>
        {revision.recetas.map(r=><tr key={r.clave}><td data-label="Receta / producto"><strong>{r.nombre}</strong><small className="pl-pct">{r.referencia}</small>
          {r.costo!==null ? <><label className="solo-lector" htmlFor={`producto-${r.clave}`}>Producto de Dodo IS para {r.nombre}</label><select id={`producto-${r.clave}`} name={`producto|${r.clave}`} defaultValue={r.dodo_id??0} onChange={()=>setCambio(true)}><option value="0">Sin vincular</option>{revision.catalogo.map(p=><option key={p.dodo_id} value={p.dodo_id}>{p.nombre} · #{p.dodo_id}</option>)}</select></> : <p className="alerta-texto">Pendiente de corregir en el Excel</p>}
          <details><summary>Materiales ({r.materiales.length})</summary>{r.avisos.map(a=><p key={a} className="alerta-texto">{a}</p>)}<Materiales items={r.materiales}/></details>
        </td><td data-label="Actual" className="monto">{r.actual===null ? "—" : pesos(r.actual)}</td><td data-label="BOM" className="monto">{r.costo===null ? "Pendiente" : pesos(r.costo)}</td><td data-label="BOM + 1 %" className="monto">{r.nuevo===null ? "Pendiente" : pesos(r.nuevo)}</td></tr>)}
      </tbody></table></div>
    </>}
    {cambio&&<p className="aviso aviso-info">Revisa de nuevo para recalcular los vínculos elegidos.</p>}
    <div className="acciones"><button type="submit" value="revisar" className="boton boton-secundario" disabled={pendiente}>{pendiente ? "Procesando…" : revision ? "Revisar de nuevo" : "Revisar insumos y BOM"}</button>{revision&&<button type="submit" value="guardar" className="boton" disabled={pendiente||cambio}>Guardar insumos, BOM y costos</button>}</div>
  </form>;
}

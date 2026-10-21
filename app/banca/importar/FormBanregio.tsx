"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { fechaTexto,pesos } from "@/lib/formato";
import { guardarBanregio,revisarBanregio,type ResultadoBanregio } from "./acciones";
import styles from "../banca.module.css";

export function FormBanregio(){
  const [resultado,setResultado]=useState<ResultadoBanregio|null>(null);
  const [pendiente,iniciar]=useTransition();
  const [sucursal,setSucursal]=useState("");
  const [confirmar,setConfirmar]=useState(false);
  const solicitud=useRef("");
  const r=resultado?.tipo==="revision"?resultado.revision:null;
  function invalidar(){setResultado(null);setConfirmar(false);solicitud.current="";}
  return <form className={styles.panel} onSubmit={e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);const boton=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
    fd.set("sucursal",sucursal);
    if(r){fd.set("sha_revisado",r.sha);fd.set("sucursal_revisada",r.sucursal);}
    if(!solicitud.current) solicitud.current=crypto.randomUUID();
    fd.set("solicitud",solicitud.current);
    iniciar(async()=>{try{const next=await (boton?.value==="guardar"?guardarBanregio(fd):revisarBanregio(fd));setResultado(next);setConfirmar(false);}catch{setResultado({tipo:"error",mensaje:"No se pudo completar la solicitud. Revisa el archivo y vuelve a intentar."});}});
  }}>
    <label>Reporte de movimientos (.xlsx, hasta 2 MB)<input name="archivo" type="file" accept=".xlsx" required disabled={pendiente} onChange={()=>{invalidar();setSucursal("");}}/></label>
    <p className={styles.nota}>Usa el Excel original. Los PDF sirven de respaldo para cotejar; esta importación lee únicamente el Excel. Los movimientos se guardan para revisión y no registran pagos ni afectan el P&L, caja o bóveda.</p>
    {resultado?.tipo==="error"&&<p className="aviso aviso-error" role="alert">{resultado.mensaje}</p>}
    {resultado?.tipo==="guardado"&&<p className="aviso aviso-ok" role="status">Reporte guardado. <Link href={`/banca?vista=banregio&importacion=${resultado.id}`}>Ver movimientos e historial</Link></p>}
    {r&&<section aria-label="Vista previa de Banregio">
      <h2>Revisa antes de guardar</h2><p><strong>{r.empresa}</strong> · RFC {r.reporte.rfc}<br/>Banregio · cuenta terminación {r.reporte.cuenta.slice(-4)} · CLABE terminación {r.reporte.clabe.slice(-4)} · MXN</p>
      <p>Periodo solicitado: {fechaTexto(r.reporte.desde)} a {fechaTexto(r.reporte.hasta)}.<br/>Movimientos incluidos: {fechaTexto(r.reporte.primeraFecha)} a {fechaTexto(r.reporte.ultimaFecha)}.</p>
      <div className={styles.indicadores}>{[["Saldo inicial",r.reporte.saldoInicial],["Abonos",r.reporte.abonos],["Cargos",r.reporte.cargos],["Saldo final reportado",r.reporte.saldoFinal]].map(([t,v])=><div className={styles.indicador} key={String(t)}><h3>{t}</h3><strong>{pesos(Number(v))}</strong></div>)}</div>
      <p>{r.reporte.movimientos.length} movimientos · <strong>{r.nuevos} nuevos</strong> · {r.repetidos} ya registrados. Los existentes se conservan sin sobrescribir.</p>
      {r.reporte.avisos.map(a=><p className="aviso aviso-info" key={a}>{a}</p>)}
      <label>Asignación de los movimientos nuevos<select value={sucursal} disabled={pendiente} onChange={e=>{setSucursal(e.target.value);invalidar();}}><option value="">Sin asignar · cuenta compartida / por revisar</option>{r.opciones.map(s=><option value={s.id} key={s.id}>{s.nombre}</option>)}</select></label>
      <p className={styles.nota}>Cambiar la asignación requiere revisar de nuevo. Los movimientos ya registrados conservan su sucursal. Los días que cambien o lleguen incompletos se bloquean para revisión.</p>
      <div className={styles.tabla}><table><caption>Vista previa · todos los movimientos del archivo</caption><thead><tr>{["Fila","Fecha","Descripción / referencia","Cargo","Abono","Saldo"].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{r.reporte.movimientos.map(m=><tr key={m.fila}><td>{m.fila}</td><td>{fechaTexto(m.fecha)}</td><td>{m.descripcion}<br/><small>{m.referencia}</small></td><td>{m.cargo?pesos(m.cargo):"—"}</td><td>{m.abono?pesos(m.abono):"—"}</td><td>{pesos(m.saldo)}</td></tr>)}</tbody></table></div>
      <label className="casilla"><input type="checkbox" name="confirmar" value="si" checked={confirmar} disabled={pendiente} onChange={e=>setConfirmar(e.target.checked)}/>Confirmo cuenta, razón social, moneda MXN y asignación. Guardar solo incorpora el reporte bancario.</label>
    </section>}
    <div className="acciones"><button className="boton boton-secundario" type="submit" value="revisar" disabled={pendiente}>{pendiente?"Procesando…":"Revisar archivo"}</button>{r&&<button className="boton" type="submit" value="guardar" disabled={pendiente||!confirmar}>Guardar reporte</button>}</div>
  </form>;
}

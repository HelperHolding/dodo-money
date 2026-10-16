"use client";
import {useActionState,useState} from "react";
import {BotonEnviar} from "@/components/BotonEnviar";
import {registrarRecepcionOrden} from "./acciones";
export function FormularioRecepcionOrden({id,lote,hoy,renglones}:{id:string;lote:string;hoy:string;renglones:{id:string;descripcion:string;pendiente:number;unidad:string}[]}) {
 const [estado,accion]=useActionState(registrarRecepcionOrden,null);
 const [fecha,setFecha]=useState(hoy),[motivo,setMotivo]=useState("");
 const [cantidades,setCantidades]=useState<Record<string,string>>({});
 const longitud=motivo.trim().length;
 return <form action={accion} className="formulario orden-accion-formulario">
  <input type="hidden" name="id" value={id}/><input type="hidden" name="lote" value={lote}/>
  {estado?.error&&<p role="alert" className="aviso">{estado.error}</p>}
  <label className="campo">Fecha real de recepción<input type="date" name="fecha_recepcion" required min="2020-01-01" max={hoy} value={fecha} onChange={e=>setFecha(e.target.value)}/></label>
  <label className="campo">Nota de recepción (mínimo 5 caracteres)<textarea name="motivo" required minLength={5} maxLength={1000} value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Por ejemplo: Entrega completa de tortillas" aria-describedby="nota-recepcion-ayuda"/></label>
  <small id="nota-recepcion-ayuda">Describe lo que llegó. {longitud}/1000 caracteres; mínimo 5 sin contar espacios al inicio o final.</small>
  <p className="saldo-nota">No necesitas haber pagado la factura. Puedes registrar días anteriores. Esto confirma la recepción en DODO MX; no registra entradas en Dodo IS. Deja vacíos los artículos que no llegaron.</p>
  {renglones.filter(r=>r.pendiente>0).map(r=><label className="campo" key={r.id}>{r.descripcion} · pendiente {r.pendiente} {r.unidad}<input type="hidden" name="renglon" value={r.id}/><input name={`cantidad_${r.id}`} type="number" min="0" max={r.pendiente} step="0.001" inputMode="decimal" value={cantidades[r.id]??""} onChange={e=>setCantidades(actual=>({...actual,[r.id]:e.target.value}))} placeholder="Cantidad recibida"/></label>)}
  <BotonEnviar pendiente="Registrando…">Guardar recepción</BotonEnviar>
 </form>;
}

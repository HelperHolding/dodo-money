"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { NOMBRE_ROL } from "@/lib/roles";
import { invitarUsuario } from "./invitaciones";
import styles from "./usuarios.module.css";
export type Invitacion={id:string;correo:string;nombre:string;rol:string;sucursal_id:string|null;usuario_id:string|null;estado:string;enviada_en:string|null;creado_en:string;creado_por:string;envios:number};
function Enviar({reenvio=false}:{reenvio?:boolean}) {const {pending}=useFormStatus();return <button className="boton" disabled={pending}>{pending?"Enviando…":reenvio?"Reenviar invitación":"Enviar invitación"}</button>;}
export type EventoInvitacion={id:string;invitacion_id:string;autor_id:string;evento:string;creado_en:string;usuarios_invitaciones:{nombre:string;correo:string}|null};
export function Invitaciones({sucursales,invitaciones,eventos,autores}:{sucursales:{id:string;nombre:string}[];invitaciones:Invitacion[];eventos:EventoInvitacion[];autores:{id:string;nombre:string}[]}) {
  const [rol,setRol]=useState("operacion");
  return <><details className={styles.invitar}><summary>Invitar usuario</summary><form action={invitarUsuario} className={styles.editor}>
    <label>Nombre<input name="nombre" required minLength={2} maxLength={160}/></label><label>Correo<input name="correo" type="email" autoComplete="off" required maxLength={254}/></label>
    <label>Rol<select name="rol" value={rol} onChange={e=>setRol(e.target.value)}>{Object.entries(NOMBRE_ROL).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
    <label>Sucursal<select name="sucursal_id" required={rol!=="corporativo"} disabled={rol==="corporativo"}>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    <p className={styles.wide}>{["admin","corporativo"].includes(rol)?"Este rol tiene acceso general a todas las sucursales.":"El usuario tendrá acceso únicamente a la sucursal asignada."} Recibirá un correo para crear su contraseña.</p><Enviar/>
  </form></details>
  {eventos.length>0&&<details className={styles.grupo}><summary>Historial de invitaciones <span>Últimos {eventos.length} eventos</span></summary><ol>{eventos.map(e=><li className={styles.usuario} key={e.id}><strong>{e.usuarios_invitaciones?.nombre} · {e.evento}</strong><small>{autores.find(a=>a.id===e.autor_id)?.nombre??"Administración"} · {new Date(e.creado_en).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}</small><small>{e.usuarios_invitaciones?.correo}</small></li>)}</ol></details>}
  {invitaciones.length>0&&<details className={styles.grupo}><summary>Invitaciones pendientes <span>{invitaciones.length}</span></summary>{invitaciones.map(i=><article key={i.id} className={styles.usuario}><div className={styles.fila}><div><strong>{i.nombre}</strong><small>{i.correo} · {NOMBRE_ROL[i.rol as keyof typeof NOMBRE_ROL]} · {sucursales.find(s=>s.id===i.sucursal_id)?.nombre??"Acceso general"}</small><small>{i.estado==="error"?"Envío no confirmado":i.estado==="pendiente"?"Preparando envío":"Contraseña pendiente"} · {i.envios} envíos · {new Date(i.enviada_en??i.creado_en).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}</small></div><form action={invitarUsuario}><input name="invitacion_id" type="hidden" value={i.id}/><Enviar reenvio/></form></div></article>)}</details>}</>;
}

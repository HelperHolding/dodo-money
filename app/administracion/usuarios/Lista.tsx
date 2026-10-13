"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { NOMBRE_ROL } from "@/lib/roles";
import type { Perfil, Rol } from "@/lib/tipos";
import { guardarUsuario } from "./acciones";
import { verSucursal } from "@/app/corporativo/actions";
import styles from "./usuarios.module.css";
export type Usuario=Perfil;
export type CambioUsuario={id:string;usuario_id:string;autor_id:string;motivo:string;antes:Usuario;despues:Usuario;creado_en:string};
const general=(u:Usuario)=>u.rol==="admin"||u.rol==="corporativo";
function Guardar() {
  const {pending}=useFormStatus();
  return <button className="boton" type="submit" disabled={pending}>{pending?"Guardando…":"Guardar cambios"}</button>;
}
function Editor({u,sucursales,yo}:{u:Usuario;sucursales:{id:string;nombre:string}[];yo:string}) {
  const [rol,setRol]=useState<Rol>(u.rol);
  return <form action={guardarUsuario} className={styles.editor}>
    <input type="hidden" name="id" value={u.id}/><input type="hidden" name="original" value={JSON.stringify(u)}/>
    <label>Nombre<input name="nombre" defaultValue={u.nombre} required maxLength={160}/></label>
    <label>Rol<select name="rol" value={rol} onChange={e=>setRol(e.target.value as Rol)} disabled={u.id===yo}>{Object.entries(NOMBRE_ROL).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
    {u.id===yo&&<input type="hidden" name="rol" value={u.rol}/>}
    <label>Sucursal {rol==="admin"?"activa":"asignada"}<select name="sucursal_id" defaultValue={u.sucursal_id??sucursales[0]?.id??""} disabled={rol==="corporativo"} required={rol!=="corporativo"}>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    <label className={styles.check}><input type="checkbox" name="activo" defaultChecked={u.activo} disabled={u.id===yo}/>Cuenta activa</label>
    {u.id===yo&&<input type="hidden" name="activo" value="on"/>}
    <label className={styles.wide}>Motivo del cambio<textarea name="motivo" required minLength={5} maxLength={1000} placeholder="Explica la asignación, cambio de puesto o baja…"/></label>
    <p className={styles.wide}>{rol==="admin"?"Administración tiene acceso a todas las sucursales y puede gestionar datos.":rol==="corporativo"?"Corporativo consulta todas las sucursales y recibe efectivo.":"Este usuario queda limitado a la sucursal asignada y a las funciones de su rol."}</p>
    <Guardar/>
  </form>;
}
export function ListaUsuarios({usuarios,sucursales,cambios,yo,editable}:{usuarios:Usuario[];sucursales:{id:string;nombre:string}[];cambios:CambioUsuario[];yo:string;editable:boolean}) {
  const [busqueda,setBusqueda]=useState(""),[rol,setRol]=useState(""),[estado,setEstado]=useState("");
  const normal=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const visibles=usuarios.filter(u=>(!rol||u.rol===rol)&&(!estado||(estado==="activo"?u.activo:!u.activo))&&normal(`${u.nombre} ${NOMBRE_ROL[u.rol]} ${sucursales.find(s=>s.id===u.sucursal_id)?.nombre??""}`).includes(normal(busqueda)));
  const filas=(lista:Usuario[])=>lista.map(u=><article key={u.id} className={styles.usuario}>
    <div className={styles.fila}><div><strong>{u.nombre}</strong><small>{NOMBRE_ROL[u.rol]}{u.id===yo?" · Tu cuenta":""}</small></div><div className={styles.tags}><span className={u.activo?styles.activo:styles.inactivo}>{u.activo?"Activo":"Inactivo"}</span>{u.debe_cambiar_contrasena&&<span className={styles.pendiente}>Cambio de contraseña pendiente</span>}</div></div>
    {editable&&<details><summary>Administrar usuario</summary><Editor u={u} sucursales={sucursales} yo={yo}/></details>}
    {cambios.some(c=>c.usuario_id===u.id)&&<details><summary>Historial y motivos</summary><ol>{cambios.filter(c=>c.usuario_id===u.id).map(c=><li key={c.id}><strong>{c.motivo}</strong><small>{usuarios.find(a=>a.id===c.autor_id)?.nombre??"Administración"} · {new Date(c.creado_en).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}</small><small>{NOMBRE_ROL[c.antes.rol]} → {NOMBRE_ROL[c.despues.rol]} · {sucursales.find(s=>s.id===c.despues.sucursal_id)?.nombre??"Todas las sucursales"} · {c.despues.activo?"Activo":"Inactivo"}</small></li>)}</ol></details>}
  </article>);
  return <div className={styles.panel}>
    <div className={styles.metricas}><div><strong>{usuarios.filter(u=>u.activo).length}</strong>Usuarios activos</div><div><strong>{usuarios.filter(general).length}</strong>Alcance general</div><div><strong>{sucursales.length}</strong>Sucursales</div></div>
    <div className={styles.filtros}><label>Buscar usuario o sucursal<input type="search" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Escribe para filtrar…"/></label><label>Rol<select value={rol} onChange={e=>setRol(e.target.value)}><option value="">Todos</option>{Object.entries(NOMBRE_ROL).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><label>Estado<select value={estado} onChange={e=>setEstado(e.target.value)}><option value="">Todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select></label><button className="boton boton-secundario" onClick={()=>{setBusqueda("");setRol("");setEstado("");}}>Limpiar filtros</button></div>
    <p aria-live="polite">{visibles.length} de {usuarios.length} usuarios</p>
    <section className={styles.grupo}><h2>Acceso general <span>{visibles.filter(general).length}</span></h2><p>Administración y corporativo participan en todas las sucursales.</p>{filas(visibles.filter(general))}{!visibles.some(general)&&<p>No hay usuarios con estos filtros.</p>}</section>
    <h2>Equipo por sucursal</h2>
    {sucursales.map(s=>{const equipo=visibles.filter(u=>!general(u)&&u.sucursal_id===s.id);return <details className={styles.grupo} key={s.id}><summary>{s.nombre}<span>{equipo.length} usuarios</span></summary><div className={styles.contenido}><form action={verSucursal}><input type="hidden" name="sucursal_id" value={s.id}/><button className="boton boton-secundario">Abrir sucursal</button></form>{filas(equipo)}{!equipo.length&&<p>Sin usuarios con los filtros actuales.</p>}</div></details>;})}
    {visibles.some(u=>!general(u)&&!sucursales.some(s=>s.id===u.sucursal_id))&&<section className={styles.grupo}><h2>Sin sucursal disponible</h2>{filas(visibles.filter(u=>!general(u)&&!sucursales.some(s=>s.id===u.sucursal_id)))}</section>}
    <small>El historial muestra los últimos 100 cambios de usuarios. Las altas de nuevas cuentas continúan en Supabase Auth.</small>
  </div>;
}

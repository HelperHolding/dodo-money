"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Cajon } from "@/components/Cajon";
import { Icono } from "@/components/Icono";
import { NOMBRE_ROL } from "@/lib/roles";
import type { Perfil, Rol } from "@/lib/tipos";
import { guardarUsuario } from "./acciones";
import { verSucursal } from "@/app/corporativo/actions";
import styles from "./usuarios.module.css";
export type Usuario=Perfil;
export type CambioUsuario={id:string;usuario_id:string;autor_id:string;motivo:string;antes:Usuario;despues:Usuario;creado_en:string};
const general=(u:Usuario)=>u.rol==="admin"||u.rol==="corporativo";
const iniciales=(nombre:string)=>nombre.trim().split(/\s+/).map(p=>p[0]).slice(0,2).join("").toUpperCase();
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
    <p className={styles.nota}>{rol==="admin"?"Administración tiene acceso a todas las sucursales y puede gestionar datos.":rol==="corporativo"?"Corporativo consulta todas las sucursales y recibe efectivo.":"Este usuario queda limitado a la sucursal asignada y a las funciones de su rol."}</p>
    <Guardar/>
  </form>;
}
export function ListaUsuarios({usuarios,sucursales,cambios,yo,editable}:{usuarios:Usuario[];sucursales:{id:string;nombre:string}[];cambios:CambioUsuario[];yo:string;editable:boolean}) {
  const [busqueda,setBusqueda]=useState(""),[rol,setRol]=useState(""),[estado,setEstado]=useState("");
  const [abierto,setAbierto]=useState<string|null>(null);
  const normal=(s:string)=>s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const visibles=usuarios.filter(u=>(!rol||u.rol===rol)&&(!estado||(estado==="activo"?u.activo:!u.activo))&&normal(`${u.nombre} ${NOMBRE_ROL[u.rol]} ${sucursales.find(s=>s.id===u.sucursal_id)?.nombre??""}`).includes(normal(busqueda)));
  const actual=usuarios.find(u=>u.id===abierto);
  const historial=actual?cambios.filter(c=>c.usuario_id===actual.id):[];
  const filas=(lista:Usuario[])=>lista.map(u=><li key={u.id}>
    <button type="button" className={styles.persona} data-general={general(u)?"si":undefined} data-inactivo={u.activo?undefined:"si"} onClick={()=>setAbierto(u.id)} aria-haspopup="dialog">
      <span className={styles.avatar} aria-hidden="true">{iniciales(u.nombre)}</span>
      <span className={styles.quien}><strong>{u.nombre}</strong><small>{NOMBRE_ROL[u.rol]}{u.id===yo?" · Tu cuenta":""}</small>
        {(!u.activo||u.debe_cambiar_contrasena)&&<span className={styles.tags}>
          {!u.activo&&<span className={styles.inactivo}>Inactivo</span>}
          {u.debe_cambiar_contrasena&&<span className={styles.pendiente}>Contraseña pendiente</span>}
        </span>}
      </span>
      <Icono nombre="derecha" />
    </button>
  </li>);
  const sinSucursal=visibles.filter(u=>!general(u)&&!sucursales.some(s=>s.id===u.sucursal_id));
  return <div className={styles.panel}>
    <div className={styles.metricas}>
      <div><strong>{usuarios.filter(u=>u.activo).length}</strong>activos</div>
      <div><strong>{usuarios.filter(general).length}</strong>con acceso general</div>
      <div><strong>{sucursales.length}</strong>sucursales</div>
      <div><strong>{usuarios.filter(u=>u.debe_cambiar_contrasena).length}</strong>con contraseña pendiente</div>
    </div>
    <div className={styles.filtros}>
      <label className={styles.buscar}><Icono nombre="buscar" tamano={18}/><span className="solo-lector">Buscar usuario o sucursal</span><input type="search" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre, rol o sucursal"/></label>
      <label><span className="solo-lector">Rol</span><select value={rol} onChange={e=>setRol(e.target.value)}><option value="">Todos los roles</option>{Object.entries(NOMBRE_ROL).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
      <label><span className="solo-lector">Estado</span><select value={estado} onChange={e=>setEstado(e.target.value)}><option value="">Activos e inactivos</option><option value="activo">Solo activos</option><option value="inactivo">Solo inactivos</option></select></label>
      {(busqueda||rol||estado)&&<button className="boton boton-fantasma boton-compacto" onClick={()=>{setBusqueda("");setRol("");setEstado("");}}>Limpiar filtros</button>}
      <p aria-live="polite" className={styles.cuenta}>{visibles.length} de {usuarios.length} usuarios</p>
    </div>
    <section className={styles.grupo} aria-labelledby="u-general">
      <header className={styles.grupoCabecera}><div><h2 id="u-general">Acceso general</h2><p>Administración y corporativo participan en todas las sucursales.</p></div><span>{visibles.filter(general).length}</span></header>
      <ul className={styles.personas}>{filas(visibles.filter(general))}</ul>
      {!visibles.some(general)&&<p className={styles.vacio}>No hay usuarios con estos filtros.</p>}
    </section>
    <h2 className={styles.titulo}>Equipo por sucursal</h2>
    <div className={styles.equipos}>
      {sucursales.map(s=>{const equipo=visibles.filter(u=>!general(u)&&u.sucursal_id===s.id);return <section className={styles.grupo} key={s.id} aria-labelledby={`u-${s.id}`}>
        <header className={styles.grupoCabecera}><div><h2 id={`u-${s.id}`}>{s.nombre}</h2><p>{equipo.length} {equipo.length===1?"usuario":"usuarios"}</p></div>
          <form action={verSucursal}><input type="hidden" name="sucursal_id" value={s.id}/><button className="boton boton-fantasma boton-compacto">Abrir sucursal</button></form></header>
        <ul className={styles.personas}>{filas(equipo)}</ul>
        {!equipo.length&&<p className={styles.vacio}>Sin usuarios con los filtros actuales.</p>}
      </section>;})}
    </div>
    {sinSucursal.length>0&&<section className={styles.grupo}><header className={styles.grupoCabecera}><div><h2>Sin sucursal disponible</h2></div><span>{sinSucursal.length}</span></header><ul className={styles.personas}>{filas(sinSucursal)}</ul></section>}
    <small className={styles.pie}>El historial muestra los últimos 100 cambios de usuarios. Las nuevas cuentas se crean mediante invitación por correo.</small>

    <Cajon abierto={!!actual} alCerrar={()=>setAbierto(null)} titulo={actual?.nombre??""}
      antetitulo={actual&&<>{NOMBRE_ROL[actual.rol]} · {general(actual)?"Acceso general":sucursales.find(s=>s.id===actual.sucursal_id)?.nombre??"Sin sucursal"}</>}>
      {actual&&<div className={styles.detalle}>
        <div className={styles.tags}>
          <span className={actual.activo?styles.activo:styles.inactivo}>{actual.activo?"Activo":"Inactivo"}</span>
          {actual.debe_cambiar_contrasena&&<span className={styles.pendiente}>Cambio de contraseña pendiente</span>}
          {actual.id===yo&&<span className={styles.propia}>Tu cuenta</span>}
        </div>
        {editable?<Editor key={actual.id} u={actual} sucursales={sucursales} yo={yo}/>:<p className={styles.nota}>La edición de cuentas se habilita al aplicar la migración pendiente.</p>}
        {historial.length>0&&<section aria-labelledby="u-historial"><h3 id="u-historial">Historial y motivos</h3><ol className={styles.historial}>{historial.map(c=><li key={c.id}><strong>{c.motivo}</strong><small>{usuarios.find(a=>a.id===c.autor_id)?.nombre??"Administración"} · {new Date(c.creado_en).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}</small><small>{NOMBRE_ROL[c.antes.rol]} → {NOMBRE_ROL[c.despues.rol]} · {sucursales.find(s=>s.id===c.despues.sucursal_id)?.nombre??"Todas las sucursales"} · {c.despues.activo?"Activo":"Inactivo"}</small></li>)}</ol></section>}
      </div>}
    </Cajon>
  </div>;
}

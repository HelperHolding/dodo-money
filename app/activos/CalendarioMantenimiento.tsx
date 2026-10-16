"use client";
import {useState} from 'react';
import Link from 'next/link';
import {Icono} from '@/components/Icono';
import {mesDe,moverMes,semanasDelMes} from '@/lib/ventas/calendario';
import {avisoMantenimiento,fechaActivo,codigoActivo,type Mantenimiento} from '@/lib/activos';
export type ServicioCalendario=Mantenimiento&{activoNombre:string;codigo:number;sucursal:string};
const fechaServicio=(m:ServicioCalendario)=>m.estado==='completado'&&m.realizado?m.realizado:m.programado;
export function CalendarioMantenimiento({servicios,hoy}:{servicios:ServicioCalendario[];hoy:string}){
 const [mes,setMes]=useState(mesDe(hoy));
 const [dia,setDia]=useState<string|null>(null);
 const [estado,setEstado]=useState('vigentes');
 const periodo=`${mes.anio}-${String(mes.mes).padStart(2,'0')}`;
 const titulo=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(mes.anio,mes.mes-1,1)));
 const filtrados=servicios.filter(m=>estado==='todos'||(estado==='vigentes'?m.estado!=='anulado':estado==='vencidos'?m.estado==='pendiente'&&m.programado<hoy:m.estado===estado));
 const delMes=filtrados.filter(m=>fechaServicio(m).startsWith(periodo)).sort((a,b)=>fechaServicio(a).localeCompare(fechaServicio(b))||a.activoNombre.localeCompare(b.activoNombre)||a.id.localeCompare(b.id));
 const lista=dia?delMes.filter(m=>fechaServicio(m)===dia):delMes;
 const cambiarMes=(pasos:number)=>{setMes(moverMes(mes,pasos));setDia(null);};
 const vencidos=servicios.filter(m=>m.estado==='pendiente'&&m.programado<hoy).length;
 return <section className="seccion activos-calendario" aria-label="Calendario de mantenimiento">
 <div className="calendario-cabecera"><button className="boton-icono" type="button" aria-label="Mes anterior" onClick={()=>cambiarMes(-1)}><Icono nombre="izquierda"/></button><h2>{titulo}</h2><button className="boton-icono" type="button" aria-label="Mes siguiente" onClick={()=>cambiarMes(1)}><Icono nombre="derecha"/></button></div>
 <div className="acciones"><button className="boton boton-secundario" type="button" onClick={()=>{setMes(mesDe(hoy));setDia(hoy);}}>Hoy</button><button className="boton boton-secundario" type="button" onClick={()=>setDia(null)} aria-pressed={!dia}>Ver todo el mes</button><label className="campo">Servicios<select value={estado} onChange={e=>setEstado(e.target.value)}><option value="vigentes">Pendientes y completados</option><option value="pendiente">Solo pendientes</option><option value="vencidos">Solo vencidos</option><option value="completado">Solo completados</option><option value="todos">Todos, incluidos anulados</option></select></label></div>
 <p className="saldo-nota">{delMes.length} servicios en el mes · {vencidos} pendientes vencidos en todos los meses de los activos filtrados. Los completados aparecen en su fecha real; los demás, en la fecha programada.</p>
 <div className="activos-mes">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=><span className="activos-semana" key={d}>{d}</span>)}{semanasDelMes(mes.anio,mes.mes).flat().map((fecha,i)=>{
 if(!fecha)return <span key={`vacio-${i}`} aria-hidden="true"/>;
 const eventos=delMes.filter(m=>fechaServicio(m)===fecha),atrasados=eventos.filter(m=>m.estado==='pendiente'&&m.programado<hoy).length;
 return <button className="activos-dia" key={fecha} type="button" aria-pressed={dia===fecha} aria-current={fecha===hoy?'date':undefined} aria-label={`${fechaActivo(fecha)}: ${eventos.length} servicios${atrasados?`, ${atrasados} vencidos`:''}`} data-vencido={atrasados>0||undefined} onClick={()=>setDia(dia===fecha?null:fecha)}><strong>{Number(fecha.slice(8))}</strong>{eventos.length>0&&<><span>{eventos.length} <span className="activos-dia-palabra">servicios</span></span><small className="activos-dia-nombres">{eventos.slice(0,2).map(m=>m.activoNombre).join(' · ')}{eventos.length>2?' · …':''}</small></>}</button>;
 })}</div>
 <h3 aria-live="polite">{dia?`Servicios del ${fechaActivo(dia)}`:'Servicios del mes'} · {lista.length}</h3>
 {!lista.length?<p>No hay servicios {dia?'para este día':'para este mes'} con los filtros seleccionados.</p>:<div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><thead><tr><th>Activo / sucursal</th><th>Trabajo</th><th>Fecha</th><th>Estado</th><th>Técnico</th></tr></thead><tbody>{lista.map(m=><tr key={m.id}><td data-label="Activo / sucursal"><Link href={`/activos/${m.activo_id}#servicio-${m.id}`}>{m.activoNombre}</Link><small className="compra-origen">{codigoActivo(m.codigo)} · {m.sucursal}</small></td><td data-label="Trabajo">{m.tarea}<small className="compra-origen">{m.tipo==='preventivo'?'Preventivo':'Correctivo'}</small></td><td data-label="Fecha">{fechaActivo(fechaServicio(m))}<small className="compra-origen">{m.estado==='completado'&&m.realizado?'Realizado':'Programado'}{m.realizado&&m.realizado!==m.programado?` · programado ${fechaActivo(m.programado)}`:''}</small></td><td data-label="Estado"><span className="insignia" data-tono={m.estado==='completado'?'verde':m.estado==='anulado'?'gris':m.programado<hoy?'rojo':'azul'}>{avisoMantenimiento(m,hoy)}</span></td><td data-label="Técnico">{m.tecnico??'Sin asignar'}</td></tr>)}</tbody></table></div>}
 </section>;
}

'use client';
import {useActionState} from 'react';import {cargar,type ResultadoOperacion} from './acciones';
export default function Carga({sucursales,hoy}:{sucursales:{id:string;nombre:string}[];hoy:string}){
 const [r,accion,pendiente]=useActionState<ResultadoOperacion,FormData>(cargar,{});
 return <details className="seccion"><summary>Importar CSV de Analytics</summary><p>Operational metrics → Unit Summary → Export to .CSV. Exporta una sola sucursal, Time Grain Day y moneda Local.</p><form action={accion} style={{display:'grid',gap:14,marginTop:16}}>
 <label>Sucursal<select name="sucursal" required><option value="">Selecciona</option>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
 <label>Datos disponibles hasta<input name="actualizado" type="date" required max={hoy}/></label>
 <label>Archivo CSV<input name="archivo" type="file" required accept=".csv,text/csv"/></label>
 <label><input name="confirmar_sucursal" type="checkbox" value="si" required/> Confirmo que el archivo corresponde a esta sucursal y usa moneda Local.</label>
 <label><input name="reemplazar" type="checkbox" value="si"/> Reemplazar días existentes, conservando versiones anteriores en historial.</label>
 <div className="acciones"><button name="accion" value="revisar" className="boton boton-secundario" disabled={pendiente}>Revisar archivo</button><button name="accion" value="importar" className="boton" disabled={pendiente}>{pendiente?'Procesando…':'Importar'}</button></div>
 {r.error&&<p className="aviso aviso-error" role="alert">{r.error}</p>}{r.mensaje&&<p className="aviso aviso-info" role="status">{r.mensaje}</p>}
 </form></details>;
}

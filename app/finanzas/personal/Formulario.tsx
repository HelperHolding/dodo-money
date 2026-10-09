import { BotonEnviar } from "@/components/BotonEnviar";
import { camposPersonal,type Persona } from "@/lib/finanzas/personal";
import { conceptosNomina } from "@/lib/finanzas/nomina";
import { hoyMX } from "@/lib/formato";
import { guardarPersona } from "./acciones";
export function FormularioPersonal({persona,lugares}:{persona?:Persona;lugares:{id:string|null;nombre:string}[]}) {
 const v=persona?.personal_versiones.filter(v=>!v.sustituida_en).sort((a,b)=>b.desde.localeCompare(a.desde))[0],d=v?.datos,pref=`persona-${persona?.id??"nueva"}`;
 return <form action={guardarPersona} className="formulario">
  <input type="hidden" name="id" value={persona?.id??""}/><input type="hidden" name="previa" value={v?.id??""}/>
  <p>Los importes son mensuales. Un campo vacío significa pendiente; captura 0 cuando realmente no aplica. Cada cambio conserva la versión anterior. Puedes corregir la misma fecha de vigencia.</p>
  <div className="rejilla">
   <div className="campo"><label htmlFor={`${pref}-sucursal`}>Sucursal</label>{persona?<><input type="hidden" name="sucursal_id" value={persona.sucursal_id??"oficina"}/><input id={`${pref}-sucursal`} readOnly value={lugares.find(l=>l.id===persona.sucursal_id)?.nombre??"Oficina central"}/></>:<select id={`${pref}-sucursal`} name="sucursal_id">{lugares.map(l=><option key={l.id??"oficina"} value={l.id??"oficina"}>{l.nombre}</option>)}</select>}</div>
   <div className="campo"><label htmlFor={`${pref}-codigo`}>Código de empleado / CONTPAQi</label><input id={`${pref}-codigo`} name="codigo" required maxLength={50} defaultValue={persona?.codigo??""}/></div>
   <div className="campo"><label htmlFor={`${pref}-nombre`}>Nombre</label><input id={`${pref}-nombre`} name="nombre" required maxLength={200} defaultValue={d?.nombre??""}/></div>
   <div className="campo"><label htmlFor={`${pref}-puesto`}>Puesto</label><input id={`${pref}-puesto`} name="puesto" required maxLength={200} defaultValue={d?.puesto??""}/></div>
   <div className="campo"><label htmlFor={`${pref}-renglon`}>Renglón del P&L</label><select id={`${pref}-renglon`} name="renglon" defaultValue={d?.renglon??"cocina"}><option value="cocina">Cocina y operación</option><option value="gerencia">Gerencia</option></select></div>
   <div className="campo"><label htmlFor={`${pref}-ingreso`}>Fecha de ingreso (si se conoce)</label><input id={`${pref}-ingreso`} type="date" name="ingreso" defaultValue={d?.ingreso??""}/></div>
   <div className="campo"><label htmlFor={`${pref}-baja`}>Fecha de baja</label><input id={`${pref}-baja`} type="date" name="baja" defaultValue={d?.baja??""}/></div>
   <div className="campo"><label htmlFor={`${pref}-desde`}>Datos vigentes desde</label><input id={`${pref}-desde`} type="date" name="desde" required defaultValue={v?.desde??hoyMX()}/></div>
   <div className="campo"><label htmlFor={`${pref}-hasta`}>Importes vigentes hasta (opcional)</label><input id={`${pref}-hasta`} type="date" name="hasta" defaultValue={v?.hasta??""}/></div>
   {camposPersonal.map(k=><div className="campo" key={k}><label htmlFor={`${pref}-${k}`}>{conceptosNomina[k]}</label><input id={`${pref}-${k}`} name={k} type="number" step="0.01" min={k==="ajuste"?undefined:0} max={99999999} defaultValue={d?.[k]??""}/></div>)}
  </div>
  <div className="campo"><label htmlFor={`${pref}-nota`}>Fuente, excepción o motivo del cambio</label><textarea id={`${pref}-nota`} name="nota" required minLength={5} maxLength={1000} defaultValue={d?.nota??""}/></div>
  <BotonEnviar>Guardar perfil</BotonEnviar>
 </form>;
}

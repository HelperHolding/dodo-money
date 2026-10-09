import { BotonEnviar } from "@/components/BotonEnviar";
import { conceptosNomina, totalEmpleado, type NominaReal } from "@/lib/finanzas/nomina";
import { pesos } from "@/lib/formato";
import { guardarReal, anularReal } from "./acciones";
import type { BorradorNomina } from "@/lib/finanzas/personal";

export function NominaRealPanel({ real, mes, sucursal, edita, borrador }: { real?: NominaReal; mes: string; sucursal: string | null; edita: boolean; borrador?: BorradorNomina }) {
  const prefijo = `real-${sucursal ?? "oficina"}`;
  return <>
    {real && <div className="seccion">
      <h3>Nómina real de {mes}</h3><p>{real.fuente}. Sustituye la plantilla estimada de este mes; los ajustes manuales se suman aparte.</p>
      {real.empleados.map((e) => <details key={e.nombre} className="seccion"><summary>{e.nombre} · {e.puesto} · {pesos(totalEmpleado(e))}</summary>
        <p>{e.renglon === "gerencia" ? "Gerencia" : "Cocina y operación"}{e.nota ? ` · ${e.nota}` : ""}</p>
        <dl>{Object.entries(conceptosNomina).map(([k, nombre]) => <div className="fila-datos" key={k}><dt>{nombre}</dt><dd>{pesos(e[k as keyof typeof conceptosNomina] ?? 0)}</dd></div>)}</dl>
      </details>)}
    </div>}
    {edita && <details className="seccion" open={!!borrador}><summary>{borrador ? "Revisar y confirmar borrador" : real ? "Corregir nómina real (conserva historial)" : "Capturar nómina real del mes"}</summary>
      {borrador && <><p>Este borrador todavía no cambia el P&L. Confirma solamente cuando los importes estén revisados.</p>{borrador.avisos.length>0&&<ul>{borrador.avisos.map((a,i)=><li key={i}>{a}</li>)}</ul>}</>}
      <p>Captura todos los empleados de este lugar y mes. Se reemplaza la plantilla completa del mes. El sueldo debe ser bruto, salvo una excepción expresamente documentada. Las retenciones del empleado no se suman al costo.</p>
      <form action={guardarReal} className="formulario">
        <input type="hidden" name="sucursal_id" value={sucursal ?? "oficina"} /><input type="hidden" name="mes" value={mes} /><input type="hidden" name="previa" value={real?.id ?? ""} />
        <input type="hidden" name="borrador" value={borrador?.id??""}/>
        <div className="campo"><label htmlFor={`${prefijo}-fuente`}>Fuente y motivo de la captura o corrección</label><textarea id={`${prefijo}-fuente`} name="fuente" required minLength={5} maxLength={1000} defaultValue={borrador?.fuente ?? real?.fuente ?? ""} /></div>
        {[...(borrador?.empleados ?? real?.empleados ?? []), ...Array.from({length: borrador ? 0 : real ? 1 : 6}, () => undefined)].map((e, i) => <fieldset key={i} className="zona"><legend>Empleado {i + 1}{!e ? " (opcional)" : ""}</legend>
          <input type="hidden" name="personal_id" value={e && "personal_id" in e ? String(e.personal_id??"") : ""}/><input type="hidden" name="version_id" value={e && "version_id" in e ? String(e.version_id??"") : ""}/>
          <div className="rejilla">
            <div className="campo"><label htmlFor={`${prefijo}-${i}-nombre`}>Nombre</label><input id={`${prefijo}-${i}-nombre`} name="nombre" maxLength={200} defaultValue={e?.nombre ?? ""} /></div>
            <div className="campo"><label htmlFor={`${prefijo}-${i}-puesto`}>Puesto</label><input id={`${prefijo}-${i}-puesto`} name="puesto" maxLength={200} defaultValue={e?.puesto ?? ""} /></div>
            <div className="campo"><label htmlFor={`${prefijo}-${i}-renglon`}>Renglón</label><select id={`${prefijo}-${i}-renglon`} name="renglon" defaultValue={e?.renglon ?? "cocina"}><option value="cocina">Cocina y operación</option><option value="gerencia">Gerencia</option></select></div>
            {Object.entries(conceptosNomina).map(([k, nombre]) => <div className="campo" key={k}><label htmlFor={`${prefijo}-${i}-${k}`}>{nombre}</label><input id={`${prefijo}-${i}-${k}`} name={k} type="number" required={!!borrador} min={k === "ajuste" ? undefined : 0} max={99999999} step="0.01" defaultValue={e?.[k as keyof typeof conceptosNomina] ?? (borrador ? "" : 0)} /></div>)}
            <div className="campo"><label htmlFor={`${prefijo}-${i}-nota`}>Nota del empleado</label><input id={`${prefijo}-${i}-nota`} name="nota" maxLength={1000} defaultValue={e?.nota ?? ""} /></div>
          </div>
        </fieldset>)}
        <BotonEnviar confirmar={borrador?"¿Confirmar este desglose para el P&L del mes?":undefined}>{borrador?"Confirmar nómina del mes":"Guardar nómina real"}</BotonEnviar>
      </form>
    </details>}
    {real && edita && <details className="seccion"><summary>Anular nómina real y volver a la plantilla estimada</summary><form action={anularReal} className="formulario"><input type="hidden" name="id" value={real.id} /><div className="campo"><label htmlFor={`${prefijo}-anular`}>Motivo</label><input id={`${prefijo}-anular`} name="motivo" required minLength={5} maxLength={1000} /></div><BotonEnviar confirmar="¿Anular la nómina real? El P&L volverá a usar la plantilla estimada de ese mes.">Anular</BotonEnviar></form></details>}
  </>;
}

import { BotonEnviar } from "@/components/BotonEnviar";
import { conceptosNomina, totalEmpleado, type NominaReal } from "@/lib/finanzas/nomina";
import { pesos } from "@/lib/formato";
import { guardarReal, anularReal } from "./acciones";

export function NominaRealPanel({ real, mes, sucursal, edita }: { real?: NominaReal; mes: string; sucursal: string | null; edita: boolean }) {
  const prefijo = `real-${sucursal ?? "oficina"}`;
  return <>
    {real && <div className="seccion">
      <h3>Nómina real de {mes}</h3><p>{real.fuente}. Sustituye la plantilla estimada de este mes; los ajustes manuales se suman aparte.</p>
      {real.empleados.map((e) => <details key={e.nombre} className="seccion"><summary>{e.nombre} · {e.puesto} · {pesos(totalEmpleado(e))}</summary>
        <p>{e.renglon === "gerencia" ? "Gerencia" : "Cocina y operación"}{e.nota ? ` · ${e.nota}` : ""}</p>
        <dl>{Object.entries(conceptosNomina).map(([k, nombre]) => <div className="fila-datos" key={k}><dt>{nombre}</dt><dd>{pesos(e[k as keyof typeof conceptosNomina])}</dd></div>)}</dl>
      </details>)}
    </div>}
    {edita && <details className="seccion"><summary>{real ? "Corregir nómina real (conserva historial)" : "Capturar nómina real del mes"}</summary>
      <p>Captura todos los empleados de este lugar y mes. Se reemplaza la plantilla completa del mes. El sueldo debe ser bruto, salvo una excepción expresamente documentada. Las retenciones del empleado no se suman al costo.</p>
      <form action={guardarReal} className="formulario">
        <input type="hidden" name="sucursal_id" value={sucursal ?? "oficina"} /><input type="hidden" name="mes" value={mes} /><input type="hidden" name="previa" value={real?.id ?? ""} />
        <div className="campo"><label htmlFor={`${prefijo}-fuente`}>Fuente y motivo de la captura o corrección</label><textarea id={`${prefijo}-fuente`} name="fuente" required minLength={5} maxLength={1000} defaultValue={real?.fuente ?? ""} /></div>
        {[...(real?.empleados ?? []), ...Array.from({length: real ? 1 : 6}, () => undefined)].map((e, i) => <fieldset key={i} className="seccion"><legend>Empleado {i + 1}{!e ? " (opcional)" : ""}</legend>
          <div className="rejilla">
            <div className="campo"><label htmlFor={`${prefijo}-${i}-nombre`}>Nombre</label><input id={`${prefijo}-${i}-nombre`} name="nombre" maxLength={200} defaultValue={e?.nombre ?? ""} /></div>
            <div className="campo"><label htmlFor={`${prefijo}-${i}-puesto`}>Puesto</label><input id={`${prefijo}-${i}-puesto`} name="puesto" maxLength={200} defaultValue={e?.puesto ?? ""} /></div>
            <div className="campo"><label htmlFor={`${prefijo}-${i}-renglon`}>Renglón</label><select id={`${prefijo}-${i}-renglon`} name="renglon" defaultValue={e?.renglon ?? "cocina"}><option value="cocina">Cocina y operación</option><option value="gerencia">Gerencia</option></select></div>
            {Object.entries(conceptosNomina).map(([k, nombre]) => <div className="campo" key={k}><label htmlFor={`${prefijo}-${i}-${k}`}>{nombre}</label><input id={`${prefijo}-${i}-${k}`} name={k} type="number" min={k === "ajuste" ? undefined : 0} max={99999999} step="0.01" defaultValue={e?.[k as keyof typeof conceptosNomina] ?? 0} /></div>)}
            <div className="campo"><label htmlFor={`${prefijo}-${i}-nota`}>Nota del empleado</label><input id={`${prefijo}-${i}-nota`} name="nota" maxLength={1000} defaultValue={e?.nota ?? ""} /></div>
          </div>
        </fieldset>)}
        <BotonEnviar>Guardar nómina real</BotonEnviar>
      </form>
    </details>}
    {real && edita && <details className="seccion"><summary>Anular nómina real y volver a la plantilla estimada</summary><form action={anularReal} className="formulario"><input type="hidden" name="id" value={real.id} /><div className="campo"><label htmlFor={`${prefijo}-anular`}>Motivo</label><input id={`${prefijo}-anular`} name="motivo" required minLength={5} maxLength={1000} /></div><BotonEnviar confirmar="¿Anular la nómina real? El P&L volverá a usar la plantilla estimada de ese mes.">Anular</BotonEnviar></form></details>}
  </>;
}

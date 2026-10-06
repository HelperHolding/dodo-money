"use client";
import { useActionState, useState } from "react";
import { importarMermas } from "./acciones";
import { pesos } from "@/lib/formato";
export function Formulario() {
  const [archivo,setArchivo] = useState<File | null>(null);
  return <section className="seccion"><h2>Importar Excel</h2><p>En Dodo IS: Bajas → exportar por días, todas las razones y sin IVA. Puedes subir varios días juntos.</p>
    <div className="campo"><label htmlFor="excel-mermas">Excel de Bajas (hasta 4 MB)</label><input id="excel-mermas" type="file" accept=".xlsx" onChange={e=>setArchivo(e.target.files?.[0]??null)} /></div>
    {archivo && <RevisionArchivo key={`${archivo.name}-${archivo.size}-${archivo.lastModified}`} archivo={archivo}/>}</section>;
}
function RevisionArchivo({archivo}:{archivo:File}) {
  const [revision,accion,pendiente] = useActionState(async (estado: Parameters<typeof importarMermas>[0],fd:FormData)=>{fd.set("archivo",archivo);return importarMermas(estado,fd);},{});
  return <form action={accion} className="formulario">
    {revision.error && <p className="aviso aviso-error" role="alert">{revision.error}</p>}
    <button name="etapa" value="revisar" disabled={pendiente}>Revisar archivo</button>
    {revision.huella && <><h3>Vista previa: {revision.archivo}</h3><p>{revision.dias?.length} días. Se reemplazarán {revision.reemplazados} días ya importados; se conservará el resto del historial.</p>
      <p>Los costos de insumos se reparten por cantidad usando el costo de todo el reporte. Los costos $0 requieren revisión. Estas mermas todavía no entran al P&L.</p>
      <ul className="lista-filas">{revision.dias?.map(d=><li className="fila" key={`${d.sucursal_id}-${d.fecha}`}><div className="fila-nombre"><strong>{d.fecha} · {revision.nombres?.[d.sucursal_id]}</strong></div><div className="fila-datos"><span>{d.insumos} insumos · {pesos(d.costoInsumos)}</span><span>{d.productos} productos · {pesos(d.costoProductos)}</span><span>{d.sinCosto} renglones sin costo</span></div></li>)}</ul>
      <input type="hidden" name="huella" value={revision.huella}/><button name="etapa" value="guardar" disabled={pendiente}>Confirmar importación</button></>}
    {pendiente && <p role="status">Procesando Excel…</p>}
  </form>;
}

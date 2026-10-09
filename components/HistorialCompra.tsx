import { BotonEnviar } from "@/components/BotonEnviar";
import { fechaMX, fechaTexto, hora } from "@/lib/formato";
import Link from "next/link";
import { randomUUID } from "node:crypto";
export type EventoCompra = {id:string;en:string;titulo:string;nota?:string|null;autor?:string|null;href?:string};
export function HistorialCompra({eventos,edita,id,accion}:{eventos:EventoCompra[];edita:boolean;id:string;accion:(fd:FormData)=>Promise<void>}) {
 const ordenados=[...eventos].sort((a,b)=>b.en.localeCompare(a.en)||a.id.localeCompare(b.id));
 return <aside className="detalle-lado compra-historial" aria-labelledby="historial-notas"><section className="seccion"><h2 id="historial-notas">Historial y notas</h2>
 {edita && <form action={accion} className="formulario"><input type="hidden" name="id" value={id}/><input type="hidden" name="solicitud" value={randomUUID()}/><label className="campo">Nota interna<textarea name="nota" rows={3} required minLength={5} maxLength={2000} placeholder="Acuerdos, pendientes o contexto del documento…"/></label><BotonEnviar className="boton boton-secundario" pendiente="Guardando…">Agregar nota</BotonEnviar><small>Se conserva con tu nombre y fecha. No modifica el estado.</small></form>}
 {!ordenados.length ? <p className="vacio">Sin eventos registrados.</p> : <ol className="linea-tiempo">{ordenados.map(e=><li key={e.id}><span className="linea-tiempo-fecha">{fechaTexto(fechaMX(e.en))} · {hora(e.en)}</span><span className="linea-tiempo-evento">{e.href?<Link href={e.href}>{e.titulo}</Link>:e.titulo}</span>{e.nota&&<p className="compra-nota-texto">{e.nota}</p>}<span className="linea-tiempo-quien">{e.autor??"Usuario no disponible"}</span></li>)}</ol>}
 </section></aside>;
}

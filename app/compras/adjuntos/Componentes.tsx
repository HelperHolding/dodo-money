import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {BotonEnviar} from '@/components/BotonEnviar';
import {obtenerPerfil} from '@/lib/contexto';
import {fechaTexto,fechaMX,hora} from '@/lib/formato';
import {adjuntarDocumento,retirarDocumento} from './acciones';
export function AdjuntarDocumento({tipo,id}:{tipo:'orden'|'factura';id:string}) {
 return <details className="orden-accion-desplegable"><summary className="boton boton-secundario">Adjuntar documento</summary><form action={adjuntarDocumento} className="formulario orden-accion-formulario">
  <input type="hidden" name="tipo" value={tipo}/><input type="hidden" name="documento_id" value={id}/><input type="hidden" name="solicitud" value={randomUUID()}/>
  <label className="campo">Archivo<input type="file" name="archivo" required accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx"/></label>
  <label className="campo">Descripción opcional<input name="descripcion" maxLength={500} placeholder="Cotización del proveedor, ticket, soporte de entrega…"/></label>
  <p className="saldo-nota">PDF, imágenes, Excel o Word. Máximo 4 MB por archivo. Se guarda como soporte; no cambia estado, importes ni pagos.</p><BotonEnviar pendiente="Adjuntando…">Guardar adjunto</BotonEnviar>
 </form></details>;
}
type Adjunto={id:string;nombre:string;descripcion:string;bytes:number;creado_en:string;perfiles:{nombre:string}|null};
export async function AdjuntosCompra({tipo,id}:{tipo:'orden'|'factura';id:string}) {
 const {supabase,perfil}=await obtenerPerfil();
 const {data,error}=await supabase.from('compra_adjuntos').select('id,nombre,descripcion,bytes,creado_en,perfiles!usuario_id(nombre)').eq(tipo==='orden'?'orden_id':'factura_id',id).not('confirmado_en','is',null).is('retirado_en',null).order('creado_en',{ascending:false}).returns<Adjunto[]>();
 if(error)return <section className="seccion"><h2>Adjuntos</h2><p className="aviso">No se pudieron consultar los adjuntos. Revisa la migración 0059.</p></section>;
 return <section className="seccion"><h2>Documentos adjuntos · {data?.length??0}</h2>{!data?.length?<p>Sin documentos adjuntos. Usa «Adjuntar documento» en el encabezado.</p>:<ul className="lista-filas">{data.map(a=><li className="fila" key={a.id}><div className="fila-nombre"><Link href={`/compras/adjuntos/${a.id}`} prefetch={false}><strong>{a.nombre}</strong></Link>{a.descripcion&&<small>{a.descripcion}</small>}<small>{a.perfiles?.nombre??'Administración'} · {fechaTexto(fechaMX(a.creado_en))} · {hora(a.creado_en)} · {(a.bytes/1024).toFixed(0)} KB</small></div><Link className="boton boton-secundario" href={`/compras/adjuntos/${a.id}`} prefetch={false}>Descargar</Link>{perfil.rol==='admin'&&<details className="orden-accion-desplegable"><summary className="boton boton-secundario">Retirar adjunto</summary><form action={retirarDocumento} className="formulario orden-accion-formulario"><input type="hidden" name="tipo" value={tipo}/><input type="hidden" name="documento_id" value={id}/><input type="hidden" name="adjunto_id" value={a.id}/><p>Se quitará de los documentos disponibles. Se conserva el registro y el motivo en el historial.</p><label className="campo">Motivo<textarea name="motivo" required minLength={5} maxLength={500}/></label><label><input type="checkbox" name="confirmar" value="si" required/> Confirmo retirar «{a.nombre}».</label><BotonEnviar pendiente="Retirando…">Confirmar retiro</BotonEnviar></form></details>}</li>)}</ul>}</section>;
}

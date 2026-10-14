import Link from 'next/link';
import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {Aviso} from '@/components/Aviso';
import {BotonEnviar} from '@/components/BotonEnviar';
import {pesos,fechaTexto} from '@/lib/formato';
import {estadoSalida,NOMBRE_ESTADO_SALIDA,type Recepcion} from '@/lib/salidas';
import type {EstadoMovimiento} from '@/lib/tipos';
import {Expediente,type ExpedienteRecoleccion} from '../Expediente';
import {resolverRecoleccion,recibirRecoleccion} from '../acciones';
type Entrega={id:string;desde:string;hasta:string;expediente:ExpedienteRecoleccion;creado_en:string;contado_corporativo:number|null;recibido_en:string|null;nota_recepcion:string|null;sucursales:{nombre:string}|null;movimientos:{monto:number;folio:string;nota:string;estado:EstadoMovimiento;recepcion:Recepcion|null;registrado_por:string;confirmado_por:string|null;confirmado_en:string|null}|null};
export default async function Ficha({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
 const {id}=await params,q=await searchParams,{supabase,perfil}=await obtenerPerfil();
 const {data:r,error}=await supabase.from('recolecciones_corporativo').select('id,desde,hasta,expediente,creado_en,contado_corporativo,recibido_en,nota_recepcion,sucursales(nombre),movimientos!recolecciones_corporativo_id_fkey(monto,folio,nota,estado,recepcion,registrado_por,confirmado_por,confirmado_en)').eq('id',id).maybeSingle<Entrega>();
 if(error)throw new Error(error.message);if(!r||!r.movimientos)notFound();const m=r.movimientos;
 return <><div className="encabezado"><h1>Recolección {m.folio} · {r.sucursales?.nombre}</h1><p>{fechaTexto(r.desde)} a {fechaTexto(r.hasta)} · {NOMBRE_ESTADO_SALIDA[estadoSalida(m)]} · {pesos(Number(m.monto))}</p><Link href="/recolecciones">Volver a recolecciones</Link></div><Aviso ok={q.ok} error={q.error}/>
 {perfil.rol==='admin'&&m.estado==='pendiente'&&m.registrado_por!==perfil.id&&<section className="seccion"><h2>Recoger en sucursal</h2><div className="acciones">{[true,false].map(aceptar=><form key={String(aceptar)} action={resolverRecoleccion}><input type="hidden" name="id" value={id}/><input type="hidden" name="aceptar" value={aceptar?'si':'no'}/><BotonEnviar className={aceptar?'boton':'boton boton-alerta'} confirmar={aceptar?'¿Recogiste el importe completo y queda a tu cargo?':'¿Rechazar la entrega y liberar estos cierres?'}>{aceptar?'Recogí el efectivo':'Rechazar entrega'}</BotonEnviar></form>)}</div></section>}
 {perfil.rol==='corporativo'&&m.estado==='confirmado'&&m.recepcion===null&&<form className="seccion formulario" action={recibirRecoleccion}><h2>Contar y recibir en corporativo</h2><input type="hidden" name="id" value={id}/><label className="campo">Importe recibido<input name="contado" type="number" step="0.01" min="0" required/></label><label className="campo">Nota / explicación de diferencia<textarea name="nota" maxLength={1000}/></label><p>Si el conteo no coincide con {pesos(Number(m.monto))}, se exige un motivo y se marca «No cuadró».</p><BotonEnviar confirmar="¿Registrar el conteo real recibido en corporativo?">Confirmar recepción</BotonEnviar></form>}
 <section className="seccion"><h2>Custodia y respaldo</h2><p>{m.nota}</p><p>Preparada {r.creado_en} · {m.confirmado_en?`Recogida/revisada ${m.confirmado_en}`:'Pendiente de recoger por otra persona'}</p>{r.recibido_en&&<p>Corporativo contó {pesos(Number(r.contado_corporativo))} · diferencia {pesos(Number(r.contado_corporativo)-Number(m.monto))} · {r.nota_recepcion}</p>}<small>El expediente conserva los datos al preparar la entrega. Las anulaciones o compras posteriores no reescriben este respaldo.</small></section><Expediente exp={r.expediente} compras={perfil.rol!=='gerente'}/>
 </>;
}

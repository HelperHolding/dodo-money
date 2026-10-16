import Link from 'next/link';
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import {randomUUID} from 'node:crypto';
import {obtenerPerfil} from '@/lib/contexto';
import {hoyMX,pesos,fechaTexto} from '@/lib/formato';
import {Aviso} from '@/components/Aviso';
import {BotonEnviar} from '@/components/BotonEnviar';
import {leerTodo} from '@/lib/ventas/paginar';
import {estadoSalida,NOMBRE_ESTADO_SALIDA,type Recepcion} from '@/lib/salidas';
import type {EstadoMovimiento} from '@/lib/tipos';
import {Expediente,type ExpedienteRecoleccion} from './Expediente';
import {registrarRecoleccion} from './acciones';
type Registro={id:string;desde:string;hasta:string;sucursales:{nombre:string}|null;movimientos:{monto:number;folio:string;estado:EstadoMovimiento;recepcion:Recepcion|null}|null};
export default async function Pagina({searchParams}:{searchParams:Promise<{sucursal?:string;desde?:string;hasta?:string;error?:string;ok?:string}>}){
 const {supabase,perfil}=await obtenerPerfil(),q=await searchParams;
 let consulta=supabase.from('sucursales').select('id,nombre').order('nombre');if(perfil.rol==='gerente')consulta=consulta.eq('id',perfil.sucursal_id);
 const {data:lugares,error}=await consulta;if(error)throw new Error(error.message);
 const sucursal=(lugares??[]).find(s=>s.id===q.sucursal)?.id??(perfil.rol==='gerente'?perfil.sucursal_id:'');
 const hoy=hoyMX(),dia=new Date(`${hoy}T12:00:00Z`);dia.setUTCDate(dia.getUTCDate()-6);
 const desde=q.desde??dia.toISOString().slice(0,10),hasta=q.hasta??hoy;
 let exp:ExpedienteRecoleccion|null=null,problema:string|null=null;
 if(sucursal&&q.desde&&q.hasta){const r=await supabase.rpc('vista_recoleccion',{p_sucursal:sucursal,p_desde:desde,p_hasta:hasta});if(r.error)problema=r.error.message;else exp=r.data as ExpedienteRecoleccion;}
 const registros=await leerTodo<Registro>((d,h)=>supabase.from('recolecciones_corporativo').select('id,desde,hasta,sucursales(nombre),movimientos!recolecciones_corporativo_id_fkey(monto,folio,estado,recepcion)').order('creado_en',{ascending:false}).order('id').range(d,h).returns<Registro[]>());
 return <><EncabezadoPagina titulo="Recolecciones a corporativo" descripcion="Entrega de efectivo por sucursal y rango de cierres, con respaldo de compras y conteo al recibir." acciones={<Link className="boton boton-secundario" href="/efectivo">Salidas y entregas anteriores</Link>}/><Aviso ok={q.ok} error={q.error??problema??undefined}/>
 <form className="seccion formulario"><div className="rejilla"><label className="campo">Sucursal<select name="sucursal" required defaultValue={sucursal??''}><option value="">Elige…</option>{lugares?.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label><label className="campo">Cierres desde<input name="desde" type="date" defaultValue={desde} max={hoy} required/></label><label className="campo">Hasta<input name="hasta" type="date" defaultValue={hasta} max={hoy} required/></label></div><button className="boton" type="submit">Revisar cierres y efectivo</button></form>
 {exp&&<><Expediente exp={exp} compras={perfil.rol!=='gerente'}/>{['admin','gerente'].includes(perfil.rol)&&Number(exp.maximo)>0&&<form action={registrarRecoleccion} className="seccion formulario"><h2>Preparar entrega · {pesos(Number(exp.maximo))}</h2><input type="hidden" name="solicitud" value={randomUUID()}/><input type="hidden" name="sucursal" value={sucursal??''}/><input type="hidden" name="desde" value={desde}/><input type="hidden" name="hasta" value={hasta}/><label className="campo">Efectivo contado para entregar<input name="monto" type="number" step="0.01" required min="0.01" defaultValue={exp.maximo}/></label><label className="campo">Folio / recibo<input name="folio" minLength={3} maxLength={100} required/></label><label className="campo">Nota de la entrega<textarea name="nota" required minLength={5} maxLength={1000}/></label>{exp.historicos_por_revisar.length>0&&<label><input type="checkbox" name="historicos_revisados" value="si" required/> Revisé los pagos históricos y el efectivo físico sin descontar movimientos dos veces.</label>}<BotonEnviar confirmar="¿Preparar esta entrega y asociar todos los cierres del rango?">Preparar recolección</BotonEnviar></form>}</>}
 <section className="seccion"><h2>Entregas registradas · {registros.length}</h2>{!registros.length?<p>Sin recolecciones registradas.</p>:<div className="tabla-contenedor"><table className="tabla"><thead><tr><th>Folio</th><th>Sucursal</th><th>Cierres</th><th>Estado</th><th>Efectivo</th></tr></thead><tbody>{registros.map(r=><tr key={r.id}><td><Link href={`/recolecciones/${r.id}`}>{r.movimientos?.folio??'Ver expediente'}</Link></td><td>{r.sucursales?.nombre}</td><td>{fechaTexto(r.desde)} a {fechaTexto(r.hasta)}</td><td>{r.movimientos?NOMBRE_ESTADO_SALIDA[estadoSalida(r.movimientos)]:'Sin movimiento'}</td><td>{pesos(Number(r.movimientos?.monto??0))}</td></tr>)}</tbody></table></div>}</section>
 </>;
}

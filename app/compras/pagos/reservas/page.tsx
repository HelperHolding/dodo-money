import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { pesos,hoyCalendarioMX,fechaTexto } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { nombreFactura } from "@/lib/compras/facturas";
import { leerTodo } from "@/lib/ventas/paginar";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { reservar,liberar } from "./acciones";
type Reserva={id:string;sucursal_id:string;factura_id:string;monto:number;pendiente:number;fecha_pago:string;motivo:string;anulado_en:string|null;motivo_anulacion:string|null};
type Factura={id:string;proveedor_id:string;folio:string|null;serie:string|null;uuid:string|null;saldo:number;sucursal_id:string|null};
export default async function Reservas({searchParams}:{searchParams:Promise<{ok?:string;error?:string}>}){
 const q=await searchParams;const {supabase:db,perfil}=await obtenerPerfil();
 const [sucursales,facturas,reservas]=await Promise.all([
 leerTodo<{id:string;nombre:string}>((a,b)=>db.from("sucursales").select("id,nombre").order("id").range(a,b)),
 leerTodo<Factura>((a,b)=>db.from("facturas_saldo").select("id,proveedor_id,folio,serie,uuid,saldo,sucursal_id").eq("tipo","ingreso").in("estado",["por_pagar","parcial"]).order("id").range(a,b)),
 leerTodo<Reserva>((a,b)=>db.from("reservas_boveda_saldo").select("*").order("id").range(a,b))]);
 const disponibilidades=await Promise.all(sucursales.map(async s=>{const {data,error}=await db.rpc("disponibilidad_boveda",{p_sucursal:s.id});if(error)throw new Error(error.message);return {s,data:data as {saldo:number;fondo:number;reservado:number;salidas:number;disponible:number}};}));
 const edita=puedeEditarCompras(perfil.rol);
 return <><EncabezadoPagina titulo="Reservas para pagos de bóveda" descripcion="Separa efectivo adicional al fondo antes de la salida a corporativo. Cada reserva corresponde a una factura y puede pagarse parcialmente." />
 <Aviso {...q}/><div className="tarjetas">{disponibilidades.map(({s,data:d})=><article className="tarjeta" key={s.id}><h2>{s.nombre}</h2><dl className="tarjeta-datos"><dt>Saldo físico esperado</dt><dd>{pesos(d.saldo)}</dd><dt>Fondo protegido</dt><dd>{pesos(d.fondo)}</dd><dt>Reservado para pagos</dt><dd>{pesos(d.reservado)}</dd><dt>Salidas por recoger</dt><dd>{pesos(d.salidas)}</dd><dt>Libre para reservar o enviar</dt><dd>{pesos(d.disponible)}</dd></dl></article>)}</div>
 {edita&&<form action={reservar} className="seccion formulario"><h2>Reservar efectivo</h2>
 <label htmlFor="sucursal">Bóveda de la sucursal</label><select id="sucursal" name="sucursal" required>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
 <label htmlFor="factura">Factura por pagar</label><select id="factura" name="factura" required><option value="">Elige…</option>{facturas.filter(f=>Number(f.saldo)>0).map(f=><option key={f.id} value={f.id}>{nombreFactura(f)} · {sucursales.find(s=>s.id===f.sucursal_id)?.nombre??"Oficina"} · saldo {pesos(f.saldo)}</option>)}</select>
 <label htmlFor="monto">Monto a separar además del fondo</label><input id="monto" name="monto" type="number" min="0.01" step="0.01" required/>
 <label htmlFor="fecha">Fecha prevista de pago</label><input id="fecha" name="fecha" type="date" defaultValue={hoyCalendarioMX()} min={hoyCalendarioMX()} required/>
 <label htmlFor="motivo">Motivo de autorización</label><input id="motivo" name="motivo" minLength={5} maxLength={1000} required/>
 <BotonEnviar>Autorizar reserva</BotonEnviar></form>}
 <section className="seccion"><h2>Reservas e historial</h2>{!reservas.length?<p className="vacio">No hay reservas.</p>:<div className="tarjetas">{[...reservas].sort((a,b)=>b.fecha_pago.localeCompare(a.fecha_pago)).map(r=>{const f=facturas.find(f=>f.id===r.factura_id);return <article className="tarjeta" key={r.id}><h3><Link href={`/compras/facturas/${r.factura_id}`}>{f?nombreFactura(f):"Ver factura"}</Link></h3><p>{sucursales.find(s=>s.id===r.sucursal_id)?.nombre} · {fechaTexto(r.fecha_pago)}</p><p>Autorizado {pesos(r.monto)} · {r.anulado_en?"Cancelada":Number(r.pendiente)>0?`Pendiente ${pesos(r.pendiente)}`:"Consumida"}</p><p>{r.motivo}</p>{r.anulado_en&&<p>Cancelación: {r.motivo_anulacion}</p>}
 {edita&&!r.anulado_en&&Number(r.pendiente)>0&&<>{f&&<Link className="boton" href={`/compras/pagos/nuevo?proveedor=${f.proveedor_id}&factura=${r.factura_id}&reserva=${r.id}`}>Pagar desde bóveda</Link>}<details><summary>Liberar reserva</summary><form action={liberar}><input type="hidden" name="id" value={r.id}/><label htmlFor={`motivo-${r.id}`}>Motivo</label><input id={`motivo-${r.id}`} name="motivo" minLength={5} maxLength={1000} required/><BotonEnviar confirmar="¿Liberar el efectivo todavía pendiente de esta reserva?">Liberar</BotonEnviar></form></details></>}</article>;})}</div>}</section></>;
}

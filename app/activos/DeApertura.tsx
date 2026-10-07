import Link from 'next/link';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {leerTodo} from '@/lib/ventas/paginar';
import type {ItemApertura} from '@/lib/aperturas';
import {codigoActivo,ESTADOS_ACTIVO,type Activo} from '@/lib/activos';
export async function DeApertura({proyecto,sucursal,items}:{proyecto:string;sucursal:string;items:ItemApertura[]}) {
 const {supabase,perfil}=await obtenerPerfil();let activos:Activo[];
 try{activos=await leerTodo((d,h)=>supabase.from('activos').select('*,apertura_items!inner(proyecto_id)').eq('apertura_items.proyecto_id',proyecto).order('codigo').range(d,h).returns<Activo[]>());}catch{return <p className="aviso aviso-error">No se pudieron consultar los activos. Revisa la migración 0038.</p>;}
 const recibidos=items.filter(i=>['equipo','referencia'].includes(i.tipo)&&['recibido_parcial','recibido','instalado','verificado'].includes(i.estado));
 return <section className="seccion"><h2>Activos de esta apertura</h2><p>Registra una ficha por unidad recibida. Utensilios y consumibles conservan su seguimiento por cantidades en Equipo y compras.</p><Link className="boton" href={`/activos?sucursal=${sucursal}`}>Inventario, valuación y mantenimiento de la sucursal</Link>
 {!activos.length&&<p>Todavía no hay activos vinculados a esta apertura.</p>}{activos.map(a=><p key={a.id}><Link href={`/activos/${a.id}`}>{codigoActivo(a.codigo)} · {a.nombre}</Link> · {ESTADOS_ACTIVO[a.estado]}</p>)}
 {puedeEditarCompras(perfil.rol)&&<><h3>Equipo recibido disponible para dar de alta</h3>{!recibidos.length&&<p>Primero registra la recepción del equipo en Equipo y compras.</p>}{recibidos.map(i=>{const registrados=activos.filter(a=>a.apertura_item_id===i.id).length,disponibles=Math.floor(Number(i.recibido))-registrados;return <p key={i.id}><Link href={`/aperturas/${proyecto}/items/${i.id}`}>{i.nombre}</Link> · {i.recibido} unidades recibidas · {registrados} activos registrados {disponibles>0&&<Link className="boton boton-secundario" href={`/activos/nuevo?origen=${i.id}`}>Registrar una unidad</Link>}</p>;})}</>}
 </section>;
}

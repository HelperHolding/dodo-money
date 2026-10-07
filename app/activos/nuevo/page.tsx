import {opcionesActivo,type OpcionesActivo} from '@/lib/activosDatos';
import {redirect} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import type {Activo} from '@/lib/activos';
import type {ItemApertura} from '@/lib/aperturas';
import {Formulario} from '../Formulario';
import {CamposActivo} from '../Campos';
import {guardar} from '../acciones';
export default async function Nuevo({searchParams}:{searchParams:Promise<{sucursal?:string;origen?:string}>}) {
 const f=await searchParams;const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/activos');
 let opciones:OpcionesActivo;try{opciones=await opcionesActivo(supabase);}catch{return <p className="aviso aviso-error">No se pudieron consultar sucursales, proveedores y facturas.</p>;}
 const a:Partial<Activo>={sucursal_id:f.sucursal};
 if(f.origen){const {data:i,error:ei}=await supabase.from('apertura_items').select('*').eq('id',f.origen).maybeSingle<ItemApertura>();if(ei||!i)return <p className="aviso aviso-error">No se pudo consultar el equipo de Aperturas.</p>;
 const {data:p,error:ep}=await supabase.from('apertura_proyectos').select('sucursal_id').eq('id',i.proyecto_id).single();if(ep)return <p className="aviso aviso-error">No se pudo consultar la apertura.</p>;
 Object.assign(a,{apertura_item_id:i.id,sucursal_id:p.sucursal_id,nombre:i.nombre,estado:'recibido',factura_id:i.factura_id,evidencia:i.evidencia});}
 return <><h1>Agregar activo</h1><p>Registra una unidad física. Puedes dar de alta el equipo existente aunque todavía no conozcas su costo.</p><Formulario accion={guardar} texto="Crear activo"><CamposActivo a={a} {...opciones}/></Formulario></>;
}

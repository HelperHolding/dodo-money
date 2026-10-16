import Link from 'next/link';
import {obtenerPerfil} from '@/lib/contexto';
import {leerRazonesSociales} from '@/lib/compras/razonesSociales';
import {puedeEditarCompras} from '@/lib/roles';
import {Aviso} from '@/components/Aviso';
import {BotonEnviar} from '@/components/BotonEnviar';
import {altaRazonSocial} from './acciones';
export default async function Razones({searchParams}:{searchParams:Promise<{ok?:string;error?:string}>}){
 const {supabase,perfil}=await obtenerPerfil(),params=await searchParams;
 const [razones,{data:sucursales}]=await Promise.all([leerRazonesSociales(supabase),supabase.from('sucursales').select('id,nombre').order('nombre').returns<{id:string;nombre:string}[]>()]);
 return <><div className="encabezado"><h1>Razones sociales del grupo</h1><p>Los mismos usuarios de Compras gestionan las empresas del grupo. Los documentos conservan su RFC receptor.</p><Link href="/compras/facturas/empresa">Configuración de la empresa principal</Link></div><Aviso {...params}/>
 <section className="seccion"><table className="tabla"><thead><tr><th>Razón social</th><th>RFC</th><th>Sucursales</th><th>Estado</th></tr></thead><tbody>{razones.map(e=><tr key={e.rfc}><td>{e.razon_social}{e.principal?' · Principal':''}</td><td>{e.rfc}</td><td>{e.principal?'Todas / Oficina':e.razon_social_sucursales.map(s=>s.sucursales?.nombre??s.sucursal_id).join(', ')}</td><td>{e.activa?'Activa':'Inactiva · revisar histórico'}</td></tr>)}</tbody></table><p className="saldo-nota">Caja, ventas y P&amp;L operativo siguen consolidados por sucursal. Esta configuración identifica la razón social de los documentos de compra.</p></section>
 {puedeEditarCompras(perfil.rol)&&<details className="seccion"><summary>Agregar razón social</summary><form action={altaRazonSocial} className="formulario"><label className="campo">RFC<input name="rfc" required maxLength={13}/></label><label className="campo">Razón social<input name="razon_social" required maxLength={250}/></label><fieldset><legend>Sucursales autorizadas</legend>{sucursales?.map(s=><label key={s.id}><input type="checkbox" name="sucursal" value={s.id}/> {s.nombre}</label>)}</fieldset><label className="campo">Motivo de alta<textarea name="motivo" required minLength={5} maxLength={500}/></label><BotonEnviar>Registrar razón social</BotonEnviar></form></details>}</>;
}

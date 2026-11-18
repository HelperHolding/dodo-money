import { ConInfo } from "@/components/ConInfo";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from 'next/link';
import {obtenerPerfil} from '@/lib/contexto';
import {leerRazonesSociales} from '@/lib/compras/razonesSociales';
import {puedeEditarCompras} from '@/lib/roles';
import {Aviso} from '@/components/Aviso';
import {BotonEnviar} from '@/components/BotonEnviar';
import {altaRazonSocial,editarSucursalesRazon} from './acciones';
export default async function Razones({searchParams}:{searchParams:Promise<{ok?:string;error?:string}>}){
 const {supabase,perfil}=await obtenerPerfil(),params=await searchParams;
 const [razones,{data:sucursales}]=await Promise.all([leerRazonesSociales(supabase),supabase.from('sucursales').select('id,nombre').order('nombre').returns<{id:string;nombre:string}[]>()]);
 const edita=puedeEditarCompras(perfil.rol);
 return <><EncabezadoPagina titulo="Razones sociales del grupo" info="Los mismos usuarios de Compras gestionan las empresas del grupo. Los documentos conservan su RFC receptor." acciones={<Link className="boton boton-secundario" href="/compras/facturas/empresa">Configuración de la empresa principal</Link>}/><Aviso {...params}/>
 <section className="seccion"><div className="tarjetas">{razones.map(e=>{const actuales=new Set(e.razon_social_sucursales.map(s=>s.sucursal_id));return <article key={e.rfc} className="tarjeta">
  <div className="tarjeta-encabezado"><h2>{e.razon_social}</h2><span className="tarjeta-estado">{e.principal?'Principal':e.activa?'Activa':'Inactiva'}</span></div>
  <dl className="tarjeta-datos"><dt>RFC</dt><dd>{e.rfc}</dd><dt>Sucursales</dt><dd>{e.principal?'Todas / Oficina':e.razon_social_sucursales.map(s=>s.sucursales?.nombre??s.sucursal_id).join(', ')||'Ninguna'}</dd>{!e.activa&&<><dt>Estado</dt><dd>Inactiva · revisar histórico</dd></>}</dl>
  {edita&&!e.principal&&e.activa&&<details><summary>Editar sucursales</summary><form action={editarSucursalesRazon} className="formulario"><input type="hidden" name="rfc" value={e.rfc}/><fieldset><legend>Sucursales autorizadas</legend>{sucursales?.map(s=><label key={s.id}><input type="checkbox" name="sucursal" value={s.id} defaultChecked={actuales.has(s.id)}/> {s.nombre}</label>)}</fieldset><small>Quitar una sucursal solo afecta capturas nuevas; los documentos ya registrados no cambian.</small><label className="campo">Motivo del cambio<textarea name="motivo" required minLength={5} maxLength={500}/></label><BotonEnviar>Guardar sucursales</BotonEnviar></form></details>}
 </article>;})}</div><ConInfo titulo="Razones sociales" etiqueta="Cómo leer esto">Caja, ventas y P&amp;L operativo siguen consolidados por sucursal. Esta configuración identifica la razón social de los documentos de compra. En gastos sin CFDI y órdenes de compra solo aparecen las razones autorizadas para la sucursal elegida.</ConInfo></section>
 {edita&&<details className="seccion"><summary>Agregar razón social</summary><form action={altaRazonSocial} className="formulario"><label className="campo">RFC<input name="rfc" required maxLength={13}/></label><label className="campo">Razón social<input name="razon_social" required maxLength={250}/></label><fieldset><legend>Sucursales autorizadas</legend>{sucursales?.map(s=><label key={s.id}><input type="checkbox" name="sucursal" value={s.id}/> {s.nombre}</label>)}</fieldset><label className="campo">Motivo de alta<textarea name="motivo" required minLength={5} maxLength={500}/></label><BotonEnviar>Registrar razón social</BotonEnviar></form></details>}</>;
}

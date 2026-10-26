import Link from 'next/link';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { obtenerPerfil } from '@/lib/contexto';
import { catalogosPara } from '@/lib/catalogos';

export default async function Catalogos({searchParams}:{searchParams:Promise<{q?:string}>}){
  const {perfil}=await obtenerPerfil();
  const {q=''}=await searchParams;
  const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const terminos=normal(q).trim().split(/\s+/).filter(Boolean);
  const lista=catalogosPara(perfil.rol).filter(c=>terminos.every(t=>normal(`${c.nombre} ${c.descripcion} ${c.gestion}`).includes(t)));
  const admin=perfil.rol==='admin';
  return <div className="panel-admin">
    <EncabezadoPagina titulo="Catálogos" descripcion="Encuentra los datos maestros de Dodo MX y abre la pantalla para consultarlos o modificarlos."/>
    <form method="get" className="barra-filtros" role="search" aria-label="Buscar catálogo">
      <label>Buscar catálogo<input type="search" name="q" defaultValue={q} placeholder="Proveedores, artículos, cuentas…"/></label>
      <button className="boton boton-secundario">Buscar</button>
      {q&&<Link href="/catalogos">Limpiar búsqueda</Link>}
    </form>
    <p>{admin?'Cada catálogo indica las modificaciones disponibles.':'Tu acceso es de consulta.'} El catálogo contable maestro se consulta; las cuentas de facturas y gastos se cambian en «Asignación de cuentas».</p>
    <div className="tabla-contenedor"><table className="tabla">
      <thead><tr><th scope="col">Catálogo</th><th scope="col">Qué contiene</th><th scope="col">Acceso disponible</th><th scope="col">Acción</th></tr></thead>
      <tbody>{lista.map(c=><tr key={c.href}><th scope="row">{c.nombre}</th><td>{c.descripcion}</td><td>{admin?c.gestion:'Solo consulta'}</td><td><Link className="boton boton-secundario boton-compacto" href={c.href} aria-label={`Abrir ${c.nombre}`}>Abrir catálogo</Link></td></tr>)}</tbody>
    </table></div>
    {!lista.length&&<p>No hay catálogos con esa búsqueda.</p>}
  </div>;
}

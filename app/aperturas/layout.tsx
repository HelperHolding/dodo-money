import {redirect} from 'next/navigation';
import {Marco} from '@/components/Marco';
import {esResponsableApertura,obtenerPerfil} from '@/lib/contexto';
import {esAperturas,puedeVerAperturasCompleto} from '@/lib/roles';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}) {
 const {perfil}=await obtenerPerfil();
 // Oficina y puesto aperturas entran directo; los demás solo si son responsables de alguna actividad (la base filtra el resto).
 if(!puedeVerAperturasCompleto(perfil.rol)&&!esAperturas(perfil.rol)&&!await esResponsableApertura())redirect('/');
 return <Marco perfil={perfil} titulo="Aperturas" detalle="Proyectos de nuevas sucursales">{children}</Marco>;
}

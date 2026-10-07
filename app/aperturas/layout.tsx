import {redirect} from 'next/navigation';
import {Marco} from '@/components/Marco';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeVerCompras} from '@/lib/roles';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}) {
 const {perfil}=await obtenerPerfil();if(!puedeVerCompras(perfil.rol))redirect('/');
 return <Marco perfil={perfil} titulo="Aperturas" detalle="Proyectos de nuevas sucursales">{children}</Marco>;
}

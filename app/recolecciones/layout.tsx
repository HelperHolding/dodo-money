import {redirect} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {Marco} from '@/components/Marco';
export default async function Layout({children}:{children:React.ReactNode}) {
 const {perfil}=await obtenerPerfil();if(!['admin','corporativo','gerente'].includes(perfil.rol))redirect('/');
 return <Marco perfil={perfil} titulo="Efectivo" detalle="Recolecciones a corporativo">{children}</Marco>;
}

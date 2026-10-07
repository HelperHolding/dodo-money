import {redirect} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {Marco} from '@/components/Marco';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){const {perfil}=await obtenerPerfil();if(!['admin','corporativo','gerente'].includes(perfil.rol))redirect('/conocimiento');return <Marco perfil={perfil} titulo="Asistente" detalle="Consulta de datos con IA">{children}</Marco>;}

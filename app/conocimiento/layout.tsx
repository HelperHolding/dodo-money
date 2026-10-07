import {Marco} from '@/components/Marco';
import {obtenerPerfil} from '@/lib/contexto';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}) {
 const {perfil}=await obtenerPerfil();return <Marco perfil={perfil} titulo="Conocimiento" detalle="Manuales de DODO MX y preguntas frecuentes">{children}</Marco>;
}

import {redirect} from 'next/navigation';
import {Marco} from '@/components/Marco';
import {obtenerPerfil} from '@/lib/contexto';
import {esAperturas,puedeVerAperturasCompleto} from '@/lib/roles';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}) {
 const {supabase,perfil}=await obtenerPerfil();
 // Oficina y puesto aperturas entran directo; los demás solo si son responsables de alguna actividad (la base filtra el resto).
 if(!puedeVerAperturasCompleto(perfil.rol)&&!esAperturas(perfil.rol)){
  const {data,error}=await supabase.rpc('mi_responsable_id');
  if(error||data==null)redirect('/');
 }
 return <Marco perfil={perfil} titulo="Aperturas" detalle="Proyectos de nuevas sucursales">{children}</Marco>;
}

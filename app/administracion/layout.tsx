import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
export const dynamic = "force-dynamic";
export default async function Layout({children}:{children:React.ReactNode}) {
  const {perfil}=await obtenerPerfil();
  if(perfil.rol!=="admin") redirect("/");
  return <Marco perfil={perfil} titulo="Administración" detalle="Usuarios y sucursales">{children}</Marco>;
}

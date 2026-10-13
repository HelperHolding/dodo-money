import { obtenerPerfil } from "@/lib/contexto";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { ListaUsuarios, type Usuario, type CambioUsuario } from "./Lista";
export default async function Usuarios({searchParams}:{searchParams:Promise<{ok?:string;error?:string}>}) {
  const {supabase,perfil}=await obtenerPerfil(),q=await searchParams;
  if(perfil.rol!=="admin") redirect("/");
  const [usuarios,sucursales,cambios]=await Promise.all([
    supabase.from("perfiles").select("id,nombre,rol,sucursal_id,activo,debe_cambiar_contrasena").order("nombre").returns<Usuario[]>(),
    supabase.from("sucursales").select("id,nombre").order("nombre").returns<{id:string;nombre:string}[]>(),
    supabase.from("usuarios_historial").select("id,usuario_id,autor_id,motivo,antes,despues,creado_en").order("creado_en",{ascending:false}).limit(100).returns<CambioUsuario[]>()
  ]);
  if(usuarios.error||sucursales.error) throw new Error(usuarios.error?.message??sucursales.error?.message);
  return <><div className="encabezado"><h1>Usuarios y sucursales</h1><p>Equipo con acceso general y usuarios de operación organizados por sucursal.</p></div>
    <Aviso ok={q.ok} error={q.error}/>
    {cambios.error&&<Aviso error="La administración de cuentas requiere aplicar la migración 0057. Puedes consultar los usuarios mientras tanto."/>}
    <ListaUsuarios usuarios={usuarios.data??[]} sucursales={sucursales.data??[]} cambios={cambios.data??[]} yo={perfil.id} editable={!cambios.error}/>
  </>;
}

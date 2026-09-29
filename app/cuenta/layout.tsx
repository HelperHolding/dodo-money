import Link from "next/link";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerPerfil } from "@/lib/contexto";
import { esCorporativo } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Mi cuenta: la única pantalla disponible mientras la contraseña temporal no se cambie. */
export default async function LayoutCuenta({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil({ permitirCambioPendiente: true });
  return (
    <>
      <header className="barra">
        <span className="barra-identidad">
          <img className="barra-logo" src="/logo-dodo.png" alt="Dodo Pizza" width={32} height={32} />
          <span className="barra-marca">Mi cuenta</span>
        </span>
        {!perfil.debe_cambiar_contrasena && (
          <span className="barra-turno"><Link href={esCorporativo(perfil.rol) ? "/corporativo" : "/"} className="barra-enlace">Volver</Link></span>
        )}
        <div className="barra-usuario">
          <span>{perfil.nombre}</span>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <main className="pagina">{children}</main>
    </>
  );
}

import { Marco } from "@/components/Marco";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerPerfil } from "@/lib/contexto";
import { NOMBRE_ROL } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Mi cuenta: la única pantalla disponible mientras la contraseña temporal no se cambie. */
export default async function LayoutCuenta({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil({ permitirCambioPendiente: true });
  // Con contraseña normal, la cuenta vive dentro del menú de siempre.
  if (!perfil.debe_cambiar_contrasena) {
    return <Marco perfil={perfil} titulo="Mi cuenta" detalle={NOMBRE_ROL[perfil.rol]}>{children}</Marco>;
  }
  // Con contraseña temporal no puede ir a otra pantalla: solo marca, nombre y salir.
  return (
    <>
      <header className="barra">
        <span className="barra-identidad">
          <img className="barra-logo" src="/logo-dodo.png" alt="Dodo Pizza" width={32} height={32} />
          <span className="barra-marca">Mi cuenta</span>
        </span>
        <div className="barra-usuario">
          <span>{perfil.nombre}</span>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <main className="pagina">{children}</main>
    </>
  );
}

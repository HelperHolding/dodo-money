import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerPerfil } from "@/lib/contexto";
import { enlacesVentas, puedeVerVentas } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Ventas vive fuera de (app): admin y corporativo ven todas las sucursales, no una elegida. */
export default async function LayoutVentas({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerVentas(perfil.rol)) redirect("/");
  return (
    <>
      <header className="barra">
        <span className="barra-marca">Ventas</span>
        <span className="barra-turno">Importadas de Dodo IS</span>
        <div className="barra-usuario">
          <span>{perfil.nombre}</span>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <Nav enlaces={enlacesVentas(perfil.rol)} />
      <main className="pagina">{children}</main>
    </>
  );
}

import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerPerfil } from "@/lib/contexto";
import { esCorporativo } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function LayoutCorporativo({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!esCorporativo(perfil.rol)) redirect("/");
  return (
    <>
      <header className="barra">
        <span className="barra-marca">Corporativo</span>
        <span className="barra-turno">Todas las sucursales · solo lectura</span>
        <div className="barra-usuario">
          <span>{perfil.nombre}</span>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <main className="pagina">{children}</main>
    </>
  );
}

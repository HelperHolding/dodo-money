import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerPerfil } from "@/lib/contexto";
import { enlacesCompras, puedeEditarCompras, puedeVerCompras } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Compras vive fuera de (app): es de oficina central, no de una sucursal. */
export default async function LayoutCompras({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  return (
    <>
      <header className="barra">
        <span className="barra-identidad">
          <img className="barra-logo" src="/logo-dodo.png" alt="Dodo Pizza" width={32} height={32} />
          <span className="barra-marca">Compras</span>
        </span>
        <span className="barra-turno">{puedeEditarCompras(perfil.rol) ? "Oficina central" : "Oficina central · solo lectura"}</span>
        <div className="barra-usuario">
          <span>{perfil.nombre}</span>
          <Link href="/cuenta">Mi contraseña</Link>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <Nav enlaces={enlacesCompras(perfil.rol)} />
      <main className="pagina">{children}</main>
    </>
  );
}

import { Nav } from "@/components/Nav";
import { obtenerContexto } from "@/lib/contexto";
import { hora } from "@/lib/formato";
import { cerrarSesion } from "@/app/login/actions";

export const dynamic = "force-dynamic";

const ROL: Record<string, string> = { cajero: "Cajero", encargado: "Encargado", gerente: "Gerente", admin: "Administrador" };

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { perfil, sucursal, turno } = await obtenerContexto();
  return (
    <>
      <header className="barra">
        <span className="barra-marca">{sucursal.nombre}</span>
        <span className="barra-turno">
          {turno ? `Turno ${turno.tipo} abierto desde las ${hora(turno.abierto_en)}` : "Sin turno abierto"}
        </span>
        <div className="barra-usuario">
          <span>{perfil.nombre}, {ROL[perfil.rol]}</span>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <Nav />
      <main className="pagina">{children}</main>
    </>
  );
}

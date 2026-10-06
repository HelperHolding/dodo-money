import Link from "next/link";
import { MenuLateral } from "@/components/MenuLateral";
import { MigasDePan } from "@/components/MigasDePan";
import { cerrarSesion } from "@/app/login/actions";
import { menuLateral, NOMBRE_ROL } from "@/lib/roles";
import type { Rol } from "@/lib/tipos";

/** Estructura de toda la app: menú lateral a la izquierda y la página a la derecha. */
export function Marco({ perfil, titulo, detalle, aviso, children }: {
  perfil: { nombre: string; rol: Rol };
  /** Sucursal o sección: "Dodo Coyoacán", "Compras". */
  titulo: string;
  /** Línea de contexto: turno abierto, "Oficina central", etc. */
  detalle: string;
  /** Franja arriba del contenido (p. ej. corporativo viendo una sucursal). */
  aviso?: React.ReactNode;
  children: React.ReactNode;
}) {
  const menu = menuLateral(perfil.rol);
  return (
    <div className="marco">
      <MenuLateral
        menu={menu}
        titulo={titulo}
        cabecera={
          <div className="lateral-identidad">
            <img className="lateral-logo" src="/logo-dodo.png" alt="Dodo Pizza" width={36} height={36} />
            <div>
              <p className="lateral-marca">{titulo}</p>
              <p className="lateral-detalle">{detalle}</p>
            </div>
          </div>
        }
        pie={
          <>
            <p className="lateral-usuario">{perfil.nombre}<span>{NOMBRE_ROL[perfil.rol]}</span></p>
            <div className="lateral-acciones">
              <Link href="/cuenta">Mi contraseña</Link>
              <form action={cerrarSesion}><button type="submit">Salir</button></form>
            </div>
          </>
        }
      />
      <div className="marco-contenido">
        {aviso}
        <main className="pagina"><MigasDePan menu={menu} />{children}</main>
      </div>
    </div>
  );
}
